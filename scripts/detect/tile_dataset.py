from __future__ import annotations

import argparse
import csv
import math
import shutil
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np


IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff"}


@dataclass(frozen=True)
class Box:
    class_id: int
    x1: float
    y1: float
    x2: float
    y2: float

    @property
    def area(self) -> float:
        return max(0.0, self.x2 - self.x1) * max(0.0, self.y2 - self.y1)


@dataclass
class Tile:
    image: np.ndarray
    labels: list[str]
    source: Path
    split: str
    x: int
    y: int
    red_ratio: float


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Create an overlapping tiled YOLO Detect dataset")
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--tile-size", type=int, default=640)
    parser.add_argument("--overlap", type=float, default=0.2)
    parser.add_argument("--min-visibility", type=float, default=0.25)
    parser.add_argument(
        "--train-negative-ratio",
        type=float,
        default=2.0,
        help="Maximum retained negative train tiles per positive train tile; hardest red tiles win",
    )
    parser.add_argument("--jpeg-quality", type=int, default=95)
    parser.add_argument("--overwrite", action="store_true")
    return parser.parse_args()


def validate_args(args: argparse.Namespace) -> None:
    if not args.source.is_dir():
        raise FileNotFoundError(f"Dataset does not exist: {args.source}")
    if args.tile_size < 64:
        raise ValueError("tile-size must be at least 64")
    if not 0 <= args.overlap < 1:
        raise ValueError("overlap must be in [0, 1)")
    if not 0 < args.min_visibility <= 1:
        raise ValueError("min-visibility must be in (0, 1]")
    if args.train_negative_ratio < 0:
        raise ValueError("train-negative-ratio cannot be negative")
    if not 1 <= args.jpeg_quality <= 100:
        raise ValueError("jpeg-quality must be in [1, 100]")


def axis_starts(length: int, tile_size: int, step: int) -> list[int]:
    if length <= tile_size:
        return [0]
    starts = list(range(0, length - tile_size + 1, step))
    final = length - tile_size
    if starts[-1] != final:
        starts.append(final)
    return starts


def load_boxes(label_path: Path, width: int, height: int) -> list[Box]:
    if not label_path.exists():
        return []
    boxes: list[Box] = []
    for line_number, line in enumerate(label_path.read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip():
            continue
        parts = line.split()
        if len(parts) != 5:
            raise ValueError(f"{label_path}:{line_number}: expected 5 Detect fields, got {len(parts)}")
        class_value, cx, cy, box_width, box_height = map(float, parts)
        class_id = int(class_value)
        if class_value != class_id or class_id != 0:
            raise ValueError(f"{label_path}:{line_number}: expected only class 0, got {class_value}")
        if any(value < 0 or value > 1 for value in (cx, cy, box_width, box_height)):
            raise ValueError(f"{label_path}:{line_number}: coordinates must be in [0, 1]")
        boxes.append(
            Box(
                class_id,
                max(0.0, (cx - box_width / 2) * width),
                max(0.0, (cy - box_height / 2) * height),
                min(float(width), (cx + box_width / 2) * width),
                min(float(height), (cy + box_height / 2) * height),
            )
        )
    return boxes


def red_ratio(image: np.ndarray) -> float:
    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
    low = cv2.inRange(hsv, np.array([0, 70, 60]), np.array([12, 255, 255]))
    high = cv2.inRange(hsv, np.array([168, 70, 60]), np.array([179, 255, 255]))
    return float(np.count_nonzero(low | high) / max(1, image.shape[0] * image.shape[1]))


def build_tile_labels(
    boxes: list[Box], x: int, y: int, width: int, height: int, min_visibility: float
) -> tuple[list[str], bool]:
    labels: list[str] = []
    ambiguous = False
    tile_x2, tile_y2 = x + width, y + height
    for box in boxes:
        ix1, iy1 = max(box.x1, x), max(box.y1, y)
        ix2, iy2 = min(box.x2, tile_x2), min(box.y2, tile_y2)
        intersection = max(0.0, ix2 - ix1) * max(0.0, iy2 - iy1)
        if intersection <= 0:
            continue
        visibility = intersection / max(box.area, 1e-9)
        if visibility < min_visibility:
            ambiguous = True
            continue
        local_x1, local_y1 = ix1 - x, iy1 - y
        local_x2, local_y2 = ix2 - x, iy2 - y
        cx = (local_x1 + local_x2) / (2 * width)
        cy = (local_y1 + local_y2) / (2 * height)
        bw = (local_x2 - local_x1) / width
        bh = (local_y2 - local_y1) / height
        labels.append(f"{box.class_id} {cx:.6f} {cy:.6f} {bw:.6f} {bh:.6f}")
    return labels, ambiguous


def collect_tiles(args: argparse.Namespace, split: str) -> list[Tile]:
    image_dir = args.source / "images" / split
    label_dir = args.source / "labels" / split
    images = sorted(path for path in image_dir.iterdir() if path.suffix.lower() in IMAGE_SUFFIXES)
    step = max(1, round(args.tile_size * (1 - args.overlap)))
    tiles: list[Tile] = []
    for image_path in images:
        image = cv2.imread(str(image_path))
        if image is None:
            raise ValueError(f"Unable to read image: {image_path}")
        image_height, image_width = image.shape[:2]
        boxes = load_boxes(label_dir / f"{image_path.stem}.txt", image_width, image_height)
        for y in axis_starts(image_height, args.tile_size, step):
            for x in axis_starts(image_width, args.tile_size, step):
                tile = image[y : min(y + args.tile_size, image_height), x : min(x + args.tile_size, image_width)]
                height, width = tile.shape[:2]
                labels, ambiguous = build_tile_labels(boxes, x, y, width, height, args.min_visibility)
                # A partially visible unlabelled mark would teach the detector that a real mark is background.
                if ambiguous:
                    continue
                tiles.append(Tile(tile.copy(), labels, image_path, split, x, y, red_ratio(tile)))
    return tiles


def select_train_tiles(tiles: list[Tile], negative_ratio: float) -> list[Tile]:
    positives = [tile for tile in tiles if tile.labels]
    negatives = sorted((tile for tile in tiles if not tile.labels), key=lambda tile: tile.red_ratio, reverse=True)
    negative_limit = math.ceil(len(positives) * negative_ratio)
    return positives + negatives[:negative_limit]


def write_image(path: Path, image: np.ndarray, quality: int) -> None:
    ok, encoded = cv2.imencode(".jpg", image, [cv2.IMWRITE_JPEG_QUALITY, quality])
    if not ok:
        raise RuntimeError(f"Failed to encode tile: {path}")
    encoded.tofile(path)


def write_dataset(args: argparse.Namespace) -> None:
    if args.output.exists():
        if not args.overwrite:
            raise FileExistsError(f"Output already exists; pass --overwrite to replace it: {args.output}")
        shutil.rmtree(args.output)
    manifest_rows: list[dict[str, object]] = []
    summary: dict[str, dict[str, int]] = {}
    for split in ("train", "val", "test"):
        tiles = collect_tiles(args, split)
        if split == "train":
            tiles = select_train_tiles(tiles, args.train_negative_ratio)
        tiles.sort(key=lambda tile: (tile.source.name, tile.y, tile.x))
        image_out, label_out = args.output / "images" / split, args.output / "labels" / split
        image_out.mkdir(parents=True, exist_ok=True)
        label_out.mkdir(parents=True, exist_ok=True)
        positive_count = instance_count = 0
        for index, tile in enumerate(tiles):
            name = f"{index:05d}_{tile.source.stem}_x{tile.x}_y{tile.y}"
            write_image(image_out / f"{name}.jpg", tile.image, args.jpeg_quality)
            (label_out / f"{name}.txt").write_text("\n".join(tile.labels) + ("\n" if tile.labels else ""), encoding="ascii")
            positive_count += bool(tile.labels)
            instance_count += len(tile.labels)
            manifest_rows.append(
                {
                    "split": split,
                    "tile": f"{name}.jpg",
                    "source": str(tile.source),
                    "x": tile.x,
                    "y": tile.y,
                    "instances": len(tile.labels),
                    "red_ratio": f"{tile.red_ratio:.8f}",
                }
            )
        summary[split] = {
            "tiles": len(tiles),
            "positive_tiles": positive_count,
            "negative_tiles": len(tiles) - positive_count,
            "instances": instance_count,
        }
    root = args.output.resolve()
    (args.output / "data.yaml").write_text(
        f"path: {root}\ntrain: images/train\nval: images/val\ntest: images/test\nnames:\n  0: error_mark\n",
        encoding="utf-8",
    )
    with (args.output / "manifest.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=manifest_rows[0].keys())
        writer.writeheader()
        writer.writerows(manifest_rows)
    print(summary)


def main() -> None:
    args = parse_args()
    validate_args(args)
    write_dataset(args)


if __name__ == "__main__":
    main()

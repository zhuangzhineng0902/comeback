from __future__ import annotations

import argparse
import csv
import shutil
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np
from sahi import AutoDetectionModel
from sahi.predict import get_sliced_prediction


IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff"}


@dataclass(frozen=True)
class Box:
    x1: float
    y1: float
    x2: float
    y2: float
    score: float = 1.0

    @property
    def area(self) -> float:
        return max(0.0, self.x2 - self.x1) * max(0.0, self.y2 - self.y1)

    @property
    def center(self) -> tuple[float, float]:
        return ((self.x1 + self.x2) / 2, (self.y1 + self.y2) / 2)


def arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Mine hard FP/FN crops without contaminating val/test")
    parser.add_argument("--source", type=Path, required=True, help="Original full-image YOLO Detect dataset")
    parser.add_argument("--base-tiled", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--model", type=Path, required=True)
    parser.add_argument("--tile-size", type=int, default=640)
    parser.add_argument("--overlap", type=float, default=0.2)
    parser.add_argument("--candidate-confidence", type=float, default=0.03)
    parser.add_argument("--final-confidence", type=float, default=0.30)
    parser.add_argument("--match-iou", type=float, default=0.50)
    parser.add_argument("--device", default="mps")
    parser.add_argument("--overwrite", action="store_true")
    return parser.parse_args()


def read_truth(path: Path, width: int, height: int) -> list[Box]:
    if not path.exists():
        return []
    boxes: list[Box] = []
    for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip():
            continue
        parts = line.split()
        if len(parts) != 5:
            raise ValueError(f"{path}:{line_number}: expected 5 fields")
        class_id, cx, cy, box_width, box_height = map(float, parts)
        if class_id != 0:
            raise ValueError(f"{path}:{line_number}: expected class 0")
        boxes.append(
            Box(
                (cx - box_width / 2) * width,
                (cy - box_height / 2) * height,
                (cx + box_width / 2) * width,
                (cy + box_height / 2) * height,
            )
        )
    return boxes


def iou(left: Box, right: Box) -> float:
    x1, y1 = max(left.x1, right.x1), max(left.y1, right.y1)
    x2, y2 = min(left.x2, right.x2), min(left.y2, right.y2)
    intersection = max(0.0, x2 - x1) * max(0.0, y2 - y1)
    union = left.area + right.area - intersection
    return intersection / union if union > 0 else 0.0


def match(predictions: list[Box], truths: list[Box], threshold: float) -> tuple[list[int], list[int]]:
    candidates = sorted(
        ((iou(prediction, truth), pi, ti) for pi, prediction in enumerate(predictions)
         for ti, truth in enumerate(truths) if iou(prediction, truth) >= threshold),
        reverse=True,
    )
    matched_predictions: set[int] = set()
    matched_truths: set[int] = set()
    for _, prediction_index, truth_index in candidates:
        if prediction_index not in matched_predictions and truth_index not in matched_truths:
            matched_predictions.add(prediction_index)
            matched_truths.add(truth_index)
    false_positives = [index for index in range(len(predictions)) if index not in matched_predictions]
    false_negatives = [index for index in range(len(truths)) if index not in matched_truths]
    return false_positives, false_negatives


def crop_origin(center: tuple[float, float], width: int, height: int, size: int, dx: int = 0, dy: int = 0) -> tuple[int, int]:
    x = round(center[0] - size / 2 + dx)
    y = round(center[1] - size / 2 + dy)
    return max(0, min(x, max(0, width - size))), max(0, min(y, max(0, height - size)))


def crop_labels(truths: list[Box], x: int, y: int, width: int, height: int) -> tuple[list[str], bool]:
    labels: list[str] = []
    ambiguous = False
    for truth in truths:
        ix1, iy1 = max(truth.x1, x), max(truth.y1, y)
        ix2, iy2 = min(truth.x2, x + width), min(truth.y2, y + height)
        intersection = max(0.0, ix2 - ix1) * max(0.0, iy2 - iy1)
        if intersection <= 0:
            continue
        if intersection / max(truth.area, 1e-9) < 0.25:
            ambiguous = True
            continue
        cx = ((ix1 + ix2) / 2 - x) / width
        cy = ((iy1 + iy2) / 2 - y) / height
        box_width = (ix2 - ix1) / width
        box_height = (iy2 - iy1) / height
        labels.append(f"0 {cx:.6f} {cy:.6f} {box_width:.6f} {box_height:.6f}")
    return labels, ambiguous


def save_crop(
    image: np.ndarray,
    truths: list[Box],
    center: tuple[float, float],
    offset: tuple[int, int],
    output_images: Path,
    output_labels: Path,
    name: str,
    size: int,
) -> bool:
    image_height, image_width = image.shape[:2]
    x, y = crop_origin(center, image_width, image_height, size, *offset)
    crop = image[y : min(y + size, image_height), x : min(x + size, image_width)]
    height, width = crop.shape[:2]
    labels, ambiguous = crop_labels(truths, x, y, width, height)
    if ambiguous:
        return False
    ok, encoded = cv2.imencode(".jpg", crop, [cv2.IMWRITE_JPEG_QUALITY, 95])
    if not ok:
        raise RuntimeError(f"Unable to encode {name}")
    encoded.tofile(output_images / f"{name}.jpg")
    (output_labels / f"{name}.txt").write_text("\n".join(labels) + ("\n" if labels else ""), encoding="ascii")
    return True


def main() -> None:
    args = arguments()
    if args.output.exists():
        if not args.overwrite:
            raise FileExistsError(f"Output exists: {args.output}")
        shutil.rmtree(args.output)
    shutil.copytree(
        args.base_tiled,
        args.output,
        ignore=shutil.ignore_patterns("*.npy", "*.cache", ".DS_Store"),
    )
    (args.output / "data.yaml").write_text(
        f"path: {args.output.resolve()}\ntrain: images/train\nval: images/val\ntest: images/test\nnames:\n  0: error_mark\n",
        encoding="utf-8",
    )
    output_images = args.output / "images/train"
    output_labels = args.output / "labels/train"
    model = AutoDetectionModel.from_pretrained(
        model_type="ultralytics",
        model_path=str(args.model),
        confidence_threshold=args.candidate_confidence,
        device=args.device,
        image_size=args.tile_size,
    )
    rows: list[dict[str, object]] = []
    fp_count = fn_count = saved_fp = saved_fn = 0
    images = sorted(path for path in (args.source / "images/train").iterdir() if path.suffix.lower() in IMAGE_SUFFIXES)
    for image_index, image_path in enumerate(images, 1):
        image = cv2.imread(str(image_path))
        if image is None:
            raise ValueError(f"Unable to read {image_path}")
        height, width = image.shape[:2]
        truths = read_truth(args.source / "labels/train" / f"{image_path.stem}.txt", width, height)
        result = get_sliced_prediction(
            str(image_path), model,
            slice_height=args.tile_size, slice_width=args.tile_size,
            overlap_height_ratio=args.overlap, overlap_width_ratio=args.overlap,
            postprocess_type="NMS", postprocess_match_metric="IOU",
            postprocess_match_threshold=args.match_iou, verbose=0,
        )
        predictions = [
            Box(*map(float, item.bbox.to_xyxy()), float(item.score.value))
            for item in result.object_prediction_list if float(item.score.value) >= args.final_confidence
        ]
        false_positives, false_negatives = match(predictions, truths, args.match_iou)
        fp_count += len(false_positives)
        fn_count += len(false_negatives)
        for local_index, prediction_index in enumerate(false_positives):
            name = f"hard_fp_{image_index:04d}_{local_index:03d}_{image_path.stem}"
            saved = save_crop(image, truths, predictions[prediction_index].center, (0, 0), output_images, output_labels, name, args.tile_size)
            saved_fp += saved
            rows.append({"kind": "fp", "source": str(image_path), "score": predictions[prediction_index].score, "saved": saved, "name": name})
        offsets = ((0, 0), (-80, 0), (80, 0), (0, -80), (0, 80))
        for local_index, truth_index in enumerate(false_negatives):
            for offset_index, offset in enumerate(offsets):
                name = f"hard_fn_{image_index:04d}_{local_index:03d}_{offset_index}_{image_path.stem}"
                saved = save_crop(image, truths, truths[truth_index].center, offset, output_images, output_labels, name, args.tile_size)
                saved_fn += saved
                rows.append({"kind": "fn", "source": str(image_path), "score": "", "saved": saved, "name": name})
        print(f"[{image_index:03d}/{len(images)}] FP={len(false_positives)} FN={len(false_negatives)}", flush=True)
    with (args.output / "hard_examples.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=("kind", "source", "score", "saved", "name"))
        writer.writeheader()
        writer.writerows(rows)
    print({"mined_fp": fp_count, "mined_fn": fn_count, "saved_fp_crops": saved_fp, "saved_fn_crops": saved_fn})


if __name__ == "__main__":
    main()

from __future__ import annotations

import argparse
import json
import random
from pathlib import Path

import cv2
import numpy as np


def augment_dataset(background_dir: Path, symbol_dir: Path, output_dir: Path, count: int, seed: int = 42) -> None:
    rng = random.Random(seed)
    backgrounds = [p for p in background_dir.rglob("*") if p.suffix.lower() in {".jpg", ".jpeg", ".png"}]
    symbols = [p for p in symbol_dir.rglob("*.png")]
    if not backgrounds or not symbols:
        raise ValueError("background_dir needs images and symbol_dir needs transparent PNG files")
    image_dir, label_dir = output_dir / "images", output_dir / "labels"
    image_dir.mkdir(parents=True, exist_ok=True); label_dir.mkdir(parents=True, exist_ok=True)
    manifest = []
    for index in range(count):
        background_path, symbol_path = rng.choice(backgrounds), rng.choice(symbols)
        image, symbol = cv2.imread(str(background_path)), cv2.imread(str(symbol_path), cv2.IMREAD_UNCHANGED)
        if image is None or symbol is None or symbol.shape[2] != 4:
            continue
        scale, angle = rng.uniform(0.7, 1.3), rng.uniform(-45, 45)
        symbol = cv2.resize(symbol, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
        h, w = symbol.shape[:2]; matrix = cv2.getRotationMatrix2D((w / 2, h / 2), angle, 1)
        cosine, sine = abs(matrix[0, 0]), abs(matrix[0, 1])
        out_w, out_h = int(h * sine + w * cosine), int(h * cosine + w * sine)
        matrix[0, 2] += out_w / 2 - w / 2; matrix[1, 2] += out_h / 2 - h / 2
        symbol = cv2.warpAffine(symbol, matrix, (out_w, out_h), borderValue=(0, 0, 0, 0))
        if out_w >= image.shape[1] or out_h >= image.shape[0]:
            continue
        x, y = rng.randint(0, image.shape[1] - out_w), rng.randint(0, image.shape[0] - out_h)
        alpha = (symbol[:, :, 3:4].astype(np.float32) / 255) * rng.uniform(0.65, 1.0)
        roi = image[y:y + out_h, x:x + out_w].astype(np.float32)
        image[y:y + out_h, x:x + out_w] = (symbol[:, :, :3] * alpha + roi * (1 - alpha)).astype(np.uint8)
        stem = f"aug_{index:06d}"; cv2.imwrite(str(image_dir / f"{stem}.jpg"), image)
        cx, cy = (x + out_w / 2) / image.shape[1], (y + out_h / 2) / image.shape[0]
        # Ultralytics OBB label: class followed by four normalized polygon points.
        corners = cv2.boxPoints(((x + out_w / 2, y + out_h / 2), (out_w, out_h), angle))
        coords = " ".join(f"{px / image.shape[1]:.6f} {py / image.shape[0]:.6f}" for px, py in corners)
        (label_dir / f"{stem}.txt").write_text(f"0 {coords}\n", encoding="utf-8")
        manifest.append({"image": stem, "background": str(background_path), "symbol": str(symbol_path),
                         "center": [cx, cy], "angle": angle})
    (output_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Copy-Paste augmentation for red grading marks")
    parser.add_argument("--background-dir", type=Path, required=True); parser.add_argument("--symbol-dir", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True); parser.add_argument("--count", type=int, default=1000)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args(); augment_dataset(args.background_dir, args.symbol_dir, args.output_dir, args.count, args.seed)

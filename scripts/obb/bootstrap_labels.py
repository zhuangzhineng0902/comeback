from __future__ import annotations

import argparse
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "ocr_service"))
from marks import detect_red_marks  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description="Create review-only OBB pseudo-labels from high-confidence red crosses")
    parser.add_argument("--dataset", type=Path, required=True); parser.add_argument("--min-confidence", type=float, default=0.6)
    parser.add_argument("--overwrite", action="store_true")
    args = parser.parse_args(); total = 0
    for split in ("train", "val", "test"):
        for image_path in (args.dataset / "images" / split).glob("*"):
            label_path = args.dataset / "labels" / split / f"{image_path.stem}.txt"
            if label_path.stat().st_size > 0 and not args.overwrite:
                continue
            with Image.open(image_path) as image:
                width, height = image.size
                marks = [mark for mark in detect_red_marks(image) if mark["markType"] == "cross" and mark["confidence"] >= args.min_confidence]
            lines = []
            for mark in marks:
                x1, y1, x2, y2 = mark["bbox"]
                lines.append("0 " + " ".join(f"{value:.6f}" for value in (
                    x1 / width, y1 / height, x2 / width, y1 / height,
                    x2 / width, y2 / height, x1 / width, y2 / height,
                )))
            label_path.write_text("\n".join(lines) + ("\n" if lines else ""), encoding="utf-8")
            total += len(lines)
    print(f"Generated {total} pseudo OBB labels. Every image still requires human review.")


if __name__ == "__main__":
    main()

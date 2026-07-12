from __future__ import annotations

import argparse
import json
import logging
import os
from pathlib import Path

import cv2

from .geometry import LayoutSegmenter
from .models import OCRBlock
from .detector import MarkDetector
from .vlm import VLMRefiner


def run(args: argparse.Namespace) -> dict:
    image = cv2.imread(str(args.image))
    if image is None:
        raise ValueError(f"Unable to read image: {args.image}")
    raw_ocr = json.loads(args.ocr_json.read_text(encoding="utf-8"))
    raw_blocks = raw_ocr.get("textBlocks", raw_ocr) if isinstance(raw_ocr, dict) else raw_ocr
    if not isinstance(raw_blocks, list):
        raise ValueError("OCR JSON must be an array or contain textBlocks")
    blocks = []
    for index, item in enumerate(raw_blocks):
        try:
            blocks.append(OCRBlock.from_dict(item))
        except (TypeError, ValueError) as exc:
            logging.warning("Ignoring invalid OCR block %d: %s", index, exc)
    detector = MarkDetector(args.model, device=args.device)
    marks = detector.detect(
        args.image, args.confidence, args.candidate_confidence,
        args.slice_size, args.overlap, args.nms_iou,
    )
    crops = LayoutSegmenter(args.padding).crop(args.image, blocks, marks, args.output_dir / "crops")
    result = {"marks": [mark.to_dict() for mark in marks], "crops": [
        {"question_id": crop.question_id, "sub_question_id": crop.sub_question_id,
         "image_path": str(crop.image_path), "bbox": crop.bbox} for crop in crops
    ]}
    if args.refine:
        refiner = VLMRefiner(os.environ.get("MINIMAX_API_KEY", ""),
                             os.environ.get("MINIMAX_BASE_URL", "https://api.minimaxi.com/v1"),
                             os.environ.get("MINIMAX_MODEL", "MiniMax-M3"))
        result["refinements"] = refiner.refine_many(crops)
    args.output_dir.mkdir(parents=True, exist_ok=True)
    (args.output_dir / "result.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description="OBB + OCR geometry + VLM wrong-question pipeline")
    parser.add_argument("--image", type=Path, required=True); parser.add_argument("--ocr-json", type=Path, required=True)
    parser.add_argument("--model", type=Path, required=True); parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--device", default="cpu"); parser.add_argument("--confidence", type=float, default=0.40)
    parser.add_argument("--candidate-confidence", type=float, default=0.03)
    parser.add_argument("--slice-size", type=int, default=640); parser.add_argument("--overlap", type=float, default=0.2)
    parser.add_argument("--nms-iou", type=float, default=0.3); parser.add_argument("--padding", type=int, default=20)
    parser.add_argument("--refine", action="store_true"); parser.add_argument("--log-level", default="INFO")
    args = parser.parse_args(); logging.basicConfig(level=args.log_level.upper())
    try:
        run(args)
    except Exception:
        logging.exception("Wrong-question extraction failed")
        raise SystemExit(1)


if __name__ == "__main__":
    main()

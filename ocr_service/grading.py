import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any

from PIL import Image


def _default_model_path() -> Path:
    return Path(__file__).resolve().parent / "models" / "error_mark_yolo26n_hard_v2.pt"


def get_grading_model_path() -> Path:
    configured = os.getenv("OCR_GRADING_MODEL_PATH", "").strip()
    return Path(configured).expanduser() if configured else _default_model_path()


def grading_detector_available() -> bool:
    return os.getenv("OCR_GRADING_ENABLED", "true").lower() == "true" and get_grading_model_path().is_file()


def detect_grading_marks(image: Image.Image) -> list[dict[str, Any]]:
    if not grading_detector_available():
        raise RuntimeError("grading-mark model is disabled or unavailable")

    candidate_confidence = float(os.getenv("OCR_GRADING_CANDIDATE_CONFIDENCE", "0.03"))
    final_confidence = float(os.getenv("OCR_GRADING_FINAL_CONFIDENCE", "0.40"))
    auto_confidence = float(os.getenv("OCR_GRADING_AUTO_CONFIDENCE", "0.80"))
    slice_size = int(os.getenv("OCR_GRADING_SLICE_SIZE", "640"))
    overlap = float(os.getenv("OCR_GRADING_OVERLAP", "0.20"))
    nms_iou = float(os.getenv("OCR_GRADING_NMS_IOU", "0.50"))
    timeout = float(os.getenv("OCR_GRADING_TIMEOUT_SECONDS", "90"))
    device = os.getenv("OCR_GRADING_DEVICE", "mps")
    worker = Path(__file__).resolve().parent / "grading_worker.py"

    with tempfile.NamedTemporaryFile(suffix=".jpg") as image_file:
        image.convert("RGB").save(image_file.name, format="JPEG", quality=95)
        completed = subprocess.run(
            [
                sys.executable,
                str(worker),
                str(get_grading_model_path()),
                image_file.name,
                device,
                str(candidate_confidence),
                str(final_confidence),
                str(auto_confidence),
                str(slice_size),
                str(overlap),
                str(nms_iou),
            ],
            check=True,
            capture_output=True,
            text=True,
            timeout=timeout,
        )

    lines = [line for line in completed.stdout.splitlines() if line.strip()]
    marks = json.loads(lines[-1]) if lines else []
    if not isinstance(marks, list):
        raise ValueError("grading worker returned a non-list payload")
    return marks


def scale_grading_marks(
    marks: list[dict[str, Any]], source_size: tuple[int, int], target_size: tuple[int, int]
) -> list[dict[str, Any]]:
    source_width, source_height = source_size
    target_width, target_height = target_size
    if source_width <= 0 or source_height <= 0:
        raise ValueError("source image dimensions must be positive")
    scale_x = target_width / source_width
    scale_y = target_height / source_height
    scaled = []
    for mark in marks:
        bbox = mark.get("bbox")
        if not isinstance(bbox, list) or len(bbox) != 4:
            continue
        next_mark = dict(mark)
        next_mark["bbox"] = [
            float(bbox[0]) * scale_x,
            float(bbox[1]) * scale_y,
            float(bbox[2]) * scale_x,
            float(bbox[3]) * scale_y,
        ]
        scaled.append(next_mark)
    return scaled

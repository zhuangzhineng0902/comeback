import os
import json
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any

from PIL import Image


def _default_model_path() -> Path:
    return Path(__file__).resolve().parent / "models" / "answer_sheet_layout.pt"


def get_model_path() -> Path:
    configured = os.getenv("OCR_LAYOUT_MODEL_PATH", "").strip()
    return Path(configured).expanduser() if configured else _default_model_path()


def layout_detector_available() -> bool:
    return os.getenv("OCR_LAYOUT_ENABLED", "true").lower() == "true" and get_model_path().is_file()


def _intersection_over_smaller(a: list[float], b: list[float]) -> float:
    width = max(0.0, min(a[2], b[2]) - max(a[0], b[0]))
    height = max(0.0, min(a[3], b[3]) - max(a[1], b[1]))
    intersection = width * height
    smaller = min(max(1.0, (a[2] - a[0]) * (a[3] - a[1])), max(1.0, (b[2] - b[0]) * (b[3] - b[1])))
    return intersection / smaller


def deduplicate_layout_regions(regions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    kept: list[dict[str, Any]] = []
    for region in sorted(regions, key=lambda item: float(item.get("confidence", 0)), reverse=True):
        box = region.get("bbox")
        if not isinstance(box, list) or len(box) != 4:
            continue
        duplicate = any(
            region.get("regionType") == other.get("regionType")
            and _intersection_over_smaller(box, other["bbox"]) >= 0.92
            and abs((box[2] - box[0]) * (box[3] - box[1]) - (other["bbox"][2] - other["bbox"][0]) * (other["bbox"][3] - other["bbox"][1]))
            <= max(1.0, (other["bbox"][2] - other["bbox"][0]) * (other["bbox"][3] - other["bbox"][1])) * 0.25
            for other in kept
        )
        if not duplicate:
            kept.append(region)
    return sorted(kept, key=lambda item: (item["bbox"][1], item["bbox"][0]))


def detect_answer_sheet_layout(image: Image.Image) -> list[dict[str, Any]]:
    if not layout_detector_available():
        return []

    confidence = float(os.getenv("OCR_LAYOUT_CONFIDENCE", "0.25"))
    image_size = int(os.getenv("OCR_LAYOUT_IMAGE_SIZE", "640"))
    timeout = float(os.getenv("OCR_LAYOUT_TIMEOUT_SECONDS", "45"))
    worker = Path(__file__).resolve().parent / "layout_worker.py"
    with tempfile.NamedTemporaryFile(suffix=".jpg") as image_file:
        image.save(image_file.name, format="JPEG", quality=95)
        completed = subprocess.run(
            [sys.executable, str(worker), str(get_model_path()), image_file.name, str(confidence), str(image_size)],
            check=True,
            capture_output=True,
            text=True,
            timeout=timeout,
        )

    lines = [line for line in completed.stdout.splitlines() if line.strip()]
    regions = json.loads(lines[-1]) if lines else []
    return deduplicate_layout_regions(regions)

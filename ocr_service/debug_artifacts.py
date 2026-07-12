from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any
from uuid import uuid4

from PIL import Image, ImageDraw, ImageFont


def debug_artifacts_enabled(request_value: str | None = None) -> bool:
    if request_value is not None:
        return request_value.strip().lower() in {"1", "true", "yes", "on"}
    return os.getenv("OCR_DEBUG_ARTIFACTS", "false").lower() == "true"


def get_debug_output_dir() -> Path:
    configured = os.getenv("OCR_DEBUG_OUTPUT_DIR", "").strip()
    if configured:
        return Path(configured).expanduser().resolve()
    return (Path(__file__).resolve().parent.parent / "tmp" / "ocr-debug").resolve()


def _safe_stem(filename: str | None) -> str:
    stem = Path(filename or "image").stem
    cleaned = re.sub(r"[^a-zA-Z0-9_-]+", "_", stem).strip("_")
    return cleaned[:48] or "image"


def _font() -> ImageFont.ImageFont:
    return ImageFont.load_default()


def _draw_box(
    draw: ImageDraw.ImageDraw,
    bbox: Any,
    color: tuple[int, int, int],
    label: str,
    line_width: int,
) -> None:
    if not isinstance(bbox, (list, tuple)) or len(bbox) != 4:
        return
    x1, y1, x2, y2 = (float(value) for value in bbox)
    draw.rectangle((x1, y1, x2, y2), outline=color, width=line_width)
    text_box = draw.textbbox((x1, y1), label, font=_font(), stroke_width=1)
    text_height = max(14, text_box[3] - text_box[1] + 6)
    text_width = max(24, text_box[2] - text_box[0] + 8)
    top = max(0.0, y1 - text_height)
    draw.rectangle((x1, top, x1 + text_width, top + text_height), fill=color)
    draw.text((x1 + 4, top + 2), label, fill="white", font=_font(), stroke_width=1, stroke_fill=color)


def _layout_overlay(image: Image.Image, regions: list[dict[str, Any]]) -> Image.Image:
    output = image.convert("RGB").copy()
    draw = ImageDraw.Draw(output)
    colors = {
        "student_id": (30, 110, 210),
        "objective_question": (20, 150, 120),
        "fillin_question": (90, 90, 220),
        "subjective_question": (30, 155, 70),
    }
    for region in regions:
        region_type = str(region.get("regionType", "unknown"))
        confidence = float(region.get("confidence", 0))
        _draw_box(draw, region.get("bbox"), colors.get(region_type, (80, 80, 80)), f"{region_type} {confidence:.2f}", 4)
    return output


def _grading_overlay(image: Image.Image, marks: list[dict[str, Any]]) -> Image.Image:
    output = image.convert("RGB").copy()
    draw = ImageDraw.Draw(output)
    for mark in marks:
        review = mark.get("requiresManualReview") is True or mark.get("markType") == "question"
        color = (235, 135, 25) if review else (220, 35, 45)
        confidence = float(mark.get("confidence", 0))
        label = f"{'review' if review else 'error_mark'} {confidence:.2f}"
        _draw_box(draw, mark.get("bbox"), color, label, 5)
    return output


def _combined_overlay(
    image: Image.Image, regions: list[dict[str, Any]], marks: list[dict[str, Any]]
) -> Image.Image:
    return _grading_overlay(_layout_overlay(image, regions), marks)


def write_debug_artifacts(
    *,
    filename: str | None,
    analysis_image: Image.Image,
    detection_image: Image.Image,
    layout_regions: list[dict[str, Any]],
    original_marks: list[dict[str, Any]],
    scaled_marks: list[dict[str, Any]],
) -> list[dict[str, str]]:
    output_dir = get_debug_output_dir()
    output_dir.mkdir(parents=True, exist_ok=True)
    run_id = f"{_safe_stem(filename)}-{uuid4().hex[:10]}"
    artifacts = [
        ("layout", f"{run_id}-layout.jpg", _layout_overlay(analysis_image, layout_regions)),
        ("grading-original", f"{run_id}-grading-original.jpg", _grading_overlay(detection_image, original_marks)),
        ("combined-ocr", f"{run_id}-combined-ocr.jpg", _combined_overlay(analysis_image, layout_regions, scaled_marks)),
    ]
    result = []
    for kind, artifact_name, artifact_image in artifacts:
        artifact_path = output_dir / artifact_name
        artifact_image.save(artifact_path, format="JPEG", quality=92)
        result.append({"kind": kind, "path": str(artifact_path), "url": f"/debug-artifacts/{artifact_name}"})

    metadata_name = f"{run_id}-metadata.json"
    metadata_path = output_dir / metadata_name
    metadata_path.write_text(
        json.dumps(
            {
                "filename": filename,
                "analysisImageSize": analysis_image.size,
                "detectionImageSize": detection_image.size,
                "layoutRegions": layout_regions,
                "gradingMarksOriginal": original_marks,
                "gradingMarksOcrCoordinates": scaled_marks,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    result.append({"kind": "metadata", "path": str(metadata_path), "url": f"/debug-artifacts/{metadata_name}"})
    return result

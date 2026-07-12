from __future__ import annotations

from pathlib import Path
from threading import Lock

from .models import DetectionMark, Point


def box_iou(left: DetectionMark, right: DetectionMark) -> float:
    left_box, right_box = left.bbox, right.bbox
    x1, y1 = max(left_box[0], right_box[0]), max(left_box[1], right_box[1])
    x2, y2 = min(left_box[2], right_box[2]), min(left_box[3], right_box[3])
    intersection = max(0.0, x2 - x1) * max(0.0, y2 - y1)
    union = left.width * left.height + right.width * right.height - intersection
    return intersection / union if union > 0 else 0.0


def box_nms(marks: list[DetectionMark], threshold: float) -> list[DetectionMark]:
    kept: list[DetectionMark] = []
    for mark in sorted(marks, key=lambda item: item.confidence, reverse=True):
        if all(mark.class_id != existing.class_id or box_iou(mark, existing) < threshold for existing in kept):
            kept.append(mark)
    return kept


class MarkDetector:
    """Single-class Ultralytics Detect inference with overlapping SAHI slices."""

    def __init__(self, model_path: str | Path, device: str = "cpu", error_classes: set[str] | None = None):
        self.model_path = Path(model_path)
        if not self.model_path.is_file():
            raise FileNotFoundError(f"Detect model not found: {self.model_path}")
        try:
            from sahi import AutoDetectionModel
        except ImportError as exc:
            raise RuntimeError("Install sahi and ultralytics before using MarkDetector") from exc
        self.model = AutoDetectionModel.from_pretrained(
            model_type="ultralytics",
            model_path=str(self.model_path),
            confidence_threshold=0.03,
            device=device,
            image_size=640,
        )
        self.error_classes = error_classes or {"error_mark"}
        self._lock = Lock()

    def detect(
        self,
        image_path: str | Path,
        confidence: float = 0.40,
        candidate_confidence: float = 0.03,
        slice_size: int = 640,
        overlap: float = 0.2,
        nms_iou: float = 0.5,
    ) -> list[DetectionMark]:
        image_path = Path(image_path)
        if not image_path.is_file():
            raise FileNotFoundError(f"Image not found: {image_path}")
        if not 0 <= candidate_confidence <= confidence <= 1:
            raise ValueError("confidence thresholds must satisfy 0 <= candidate <= final <= 1")
        if not 0 <= overlap < 1:
            raise ValueError("overlap must be in [0, 1)")
        from sahi.predict import get_sliced_prediction

        self.model.confidence_threshold = candidate_confidence
        self.model.image_size = slice_size
        with self._lock:
            result = get_sliced_prediction(
                str(image_path),
                self.model,
                slice_height=slice_size,
                slice_width=slice_size,
                overlap_height_ratio=overlap,
                overlap_width_ratio=overlap,
                postprocess_type="NMS",
                postprocess_match_metric="IOU",
                postprocess_match_threshold=nms_iou,
                verbose=0,
            )

        marks = []
        for prediction in result.object_prediction_list:
            score = float(prediction.score.value)
            class_name = str(prediction.category.name)
            if score < confidence or class_name not in self.error_classes:
                continue
            x1, y1, x2, y2 = map(float, prediction.bbox.to_xyxy())
            polygon = (Point(x1, y1), Point(x2, y1), Point(x2, y2), Point(x1, y2))
            marks.append(
                DetectionMark(
                    int(prediction.category.id), class_name, score,
                    Point((x1 + x2) / 2, (y1 + y2) / 2),
                    x2 - x1, y2 - y1, polygon,
                )
            )
        return box_nms(marks, nms_iou)

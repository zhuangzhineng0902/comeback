from __future__ import annotations

from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class Point:
    x: float
    y: float


@dataclass(frozen=True)
class OCRBlock:
    text: str
    points: tuple[Point, Point, Point, Point]
    confidence: float = 1.0

    @property
    def bbox(self) -> tuple[float, float, float, float]:
        xs, ys = [p.x for p in self.points], [p.y for p in self.points]
        return min(xs), min(ys), max(xs), max(ys)

    @classmethod
    def from_dict(cls, value: dict[str, Any]) -> "OCRBlock":
        raw = value.get("points") or value.get("box") or value.get("bbox")
        if not isinstance(raw, (list, tuple)):
            raise ValueError("OCR block is missing points/box/bbox")
        if len(raw) == 4 and all(isinstance(item, (int, float)) for item in raw):
            x1, y1, x2, y2 = map(float, raw)
            points = (Point(x1, y1), Point(x2, y1), Point(x2, y2), Point(x1, y2))
        elif len(raw) == 4:
            points = tuple(Point(float(item[0]), float(item[1])) for item in raw)
        else:
            raise ValueError("OCR coordinates must contain four points or xyxy")
        text = str(value.get("text", "")).strip()
        if not text:
            raise ValueError("OCR block text is empty")
        return cls(text=text, points=points, confidence=float(value.get("confidence", 1.0)))


@dataclass(frozen=True)
class DetectionMark:
    class_id: int
    class_name: str
    confidence: float
    center: Point
    width: float
    height: float
    polygon: tuple[Point, Point, Point, Point]

    @property
    def bbox(self) -> tuple[float, float, float, float]:
        xs, ys = [p.x for p in self.polygon], [p.y for p in self.polygon]
        return min(xs), min(ys), max(xs), max(ys)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class CropResult:
    question_id: str
    sub_question_id: str | None
    image_path: Path
    bbox: tuple[int, int, int, int]
    marks: tuple[DetectionMark, ...]

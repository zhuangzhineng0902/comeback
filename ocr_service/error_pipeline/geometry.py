from __future__ import annotations

import os
import re
import uuid
from collections import defaultdict
from pathlib import Path

import cv2

from .models import CropResult, DetectionMark, OCRBlock

QUESTION_RE = re.compile(r"^\s*(?:第\s*)?(\d{1,3})\s*[.、）)]")
SUB_RE = re.compile(r"^\s*[（(](\d{1,2})[）)]")


class LayoutSegmenter:
    """Column-aware mark assignment and safe OpenCV crop export."""

    def __init__(self, padding: int = 20, column_gap_ratio: float = 0.18):
        self.padding = max(0, padding)
        self.column_gap_ratio = column_gap_ratio

    def _anchors(self, blocks: list[OCRBlock], width: int) -> list[dict]:
        anchors = []
        for block in blocks:
            match = QUESTION_RE.match(block.text)
            if not match or match.group(1) == "0":
                continue
            x1, y1, x2, y2 = block.bbox
            anchors.append({"id": match.group(1), "block": block, "x": x1, "top": y1, "bottom": y2})
        anchors.sort(key=lambda item: item["x"])
        column = 0
        previous_x = None
        for anchor in anchors:
            if previous_x is not None and anchor["x"] - previous_x > width * self.column_gap_ratio:
                column += 1
            anchor["column"] = column
            previous_x = anchor["x"]
        return sorted(anchors, key=lambda item: (item["column"], item["top"]))

    def assign(self, blocks: list[OCRBlock], marks: list[DetectionMark], image_shape: tuple[int, ...]) -> list[dict]:
        height, width = image_shape[:2]
        anchors = self._anchors(blocks, width)
        if not anchors:
            raise ValueError("No valid numeric question anchors found in OCR results")
        columns: dict[int, list[dict]] = defaultdict(list)
        for anchor in anchors:
            columns[anchor["column"]].append(anchor)
        column_centers = {key: sum(a["x"] for a in values) / len(values) for key, values in columns.items()}
        ordered_columns = sorted(column_centers, key=column_centers.get)
        column_bounds = {}
        for index, key in enumerate(ordered_columns):
            left = 0 if index == 0 else int((column_centers[ordered_columns[index - 1]] + column_centers[key]) / 2)
            right = width if index + 1 == len(ordered_columns) else int((column_centers[key] + column_centers[ordered_columns[index + 1]]) / 2)
            column_bounds[key] = (left, right)
        assignments = []
        for mark in marks:
            column_id = min(column_centers, key=lambda key: abs(mark.center.x - column_centers[key]))
            candidates = columns[column_id]
            preceding = [anchor for anchor in candidates if anchor["top"] <= mark.center.y]
            anchor = preceding[-1] if preceding else candidates[0]
            index = candidates.index(anchor)
            next_top = candidates[index + 1]["top"] if index + 1 < len(candidates) else height
            sub_candidates = []
            for block in blocks:
                sub_match = SUB_RE.match(block.text)
                if sub_match and anchor["top"] <= block.bbox[1] < next_top:
                    sub_candidates.append((abs(block.bbox[1] - mark.center.y), sub_match.group(1)))
            assignments.append({"question_id": anchor["id"], "sub_question_id": min(sub_candidates)[1] if sub_candidates else None,
                                "mark": mark, "column": column_id, "column_bounds": column_bounds[column_id],
                                "top": anchor["top"], "bottom": next_top})
        return assignments

    def crop(self, image_path: str | Path, blocks: list[OCRBlock], marks: list[DetectionMark], output_dir: str | Path) -> list[CropResult]:
        image = cv2.imread(str(image_path))
        if image is None:
            raise ValueError(f"Unable to read image: {image_path}")
        output_dir = Path(output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)
        grouped: dict[tuple[str, str | None], list[dict]] = defaultdict(list)
        for item in self.assign(blocks, marks, image.shape):
            grouped[(item["question_id"], item["sub_question_id"])].append(item)
        results = []
        for (question_id, sub_id), items in grouped.items():
            x1 = max(0, min(item["column_bounds"][0] for item in items) - self.padding)
            x2 = min(image.shape[1], max(item["column_bounds"][1] for item in items) + self.padding)
            y1 = max(0, int(min(item["top"] for item in items) - self.padding))
            y2 = min(image.shape[0], int(max(item["bottom"] for item in items) + self.padding))
            crop = image[y1:y2, x1:x2]
            if crop.size == 0:
                continue
            final_path = output_dir / f"q{question_id}{f'_{sub_id}' if sub_id else ''}.jpg"
            temporary = output_dir / f".{final_path.name}.{uuid.uuid4().hex}.tmp.jpg"
            if not cv2.imwrite(str(temporary), crop, [cv2.IMWRITE_JPEG_QUALITY, 95]):
                raise OSError(f"Failed to write crop: {temporary}")
            os.replace(temporary, final_path)
            results.append(CropResult(question_id, sub_id, final_path, (x1, y1, x2, y2), tuple(i["mark"] for i in items)))
        return results

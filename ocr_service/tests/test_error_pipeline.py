import tempfile
import unittest
from pathlib import Path

import cv2
import numpy as np

from error_pipeline.geometry import LayoutSegmenter
from error_pipeline.detector import box_nms
from error_pipeline.models import DetectionMark, OCRBlock, Point


def block(text, x, y):
    return OCRBlock(text, (Point(x, y), Point(x + 100, y), Point(x + 100, y + 20), Point(x, y + 20)))


def mark(x, y, confidence=0.9):
    polygon = (Point(x - 10, y - 10), Point(x + 10, y - 10), Point(x + 10, y + 10), Point(x - 10, y + 10))
    return DetectionMark(0, "error_mark", confidence, Point(x, y), 20, 20, polygon)


class ErrorPipelineTest(unittest.TestCase):
    def test_assigns_marks_by_column_and_question_interval(self):
        blocks = [block("1. left", 50, 50), block("2. left", 50, 300), block("14. right", 600, 60), block("15. right", 600, 350)]
        assignments = LayoutSegmenter().assign(blocks, [mark(800, 180), mark(200, 380)], (600, 1000, 3))
        self.assertEqual([(item["question_id"], item["column"]) for item in assignments], [("14", 1), ("2", 0)])

    def test_box_nms_keeps_highest_confidence_overlap(self):
        kept = box_nms([mark(100, 100, 0.7), mark(102, 102, 0.95), mark(300, 300, 0.8)], 0.3)
        self.assertEqual(len(kept), 2)
        self.assertEqual(max(item.confidence for item in kept), 0.95)

    def test_crops_full_detected_column_atomically(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "paper.jpg"
            cv2.imwrite(str(source), np.full((600, 1000, 3), 255, dtype=np.uint8))
            crops = LayoutSegmenter().crop(source, [block("14. right", 600, 60), block("15. right", 600, 350)], [mark(800, 180)], Path(directory) / "out")
            self.assertEqual(len(crops), 1)
            self.assertTrue(crops[0].image_path.is_file())
            self.assertGreater(crops[0].bbox[2] - crops[0].bbox[0], 900)


if __name__ == "__main__":
    unittest.main()

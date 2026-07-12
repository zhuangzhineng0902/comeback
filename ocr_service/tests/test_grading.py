import unittest

from grading import scale_grading_marks
from normalization import _is_candidate_grading_mark


class GradingDetectorTest(unittest.TestCase):
    def test_scales_model_boxes_into_ocr_coordinates(self):
        marks = [{"markType": "cross", "bbox": [100, 200, 300, 400], "confidence": 0.8}]
        scaled = scale_grading_marks(marks, (1000, 2000), (500, 1000))
        self.assertEqual(scaled[0]["bbox"], [50.0, 100.0, 150.0, 200.0])

    def test_accepts_yolo_mark_at_production_threshold(self):
        self.assertTrue(
            _is_candidate_grading_mark(
                {"source": "yolo-error-mark", "markType": "cross", "confidence": 0.4}
            )
        )

    def test_rejects_low_confidence_yolo_mark(self):
        self.assertFalse(
            _is_candidate_grading_mark(
                {"source": "yolo-error-mark", "markType": "cross", "confidence": 0.39}
            )
        )

    def test_accepts_uncertain_model_mark_for_manual_review(self):
        self.assertTrue(
            _is_candidate_grading_mark(
                {"source": "yolo-error-mark-review", "markType": "question", "confidence": 0.4}
            )
        )


if __name__ == "__main__":
    unittest.main()

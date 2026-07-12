import io
import unittest
from unittest.mock import patch

from PIL import Image

import app as app_module


def image_bytes(size):
    output = io.BytesIO()
    Image.new("RGB", size, "white").save(output, format="JPEG")
    return output.getvalue()


class OcrGradingFlowTest(unittest.TestCase):
    def test_uses_original_image_for_yolo_and_scales_boxes_without_layout_regions(self):
        captured = {}

        class FakeOcrEngine:
            def ocr(self, _image, cls=True):
                return []

        def fake_detect(image):
            captured["detection_size"] = image.size
            return [{"markType": "cross", "bbox": [100, 100, 300, 300], "confidence": 0.9}]

        def fake_normalize(_raw, grading_marks=None):
            captured["grading_marks"] = grading_marks
            return {"gradingMarks": grading_marks, "textBlocks": [], "questionCandidates": [], "mistakeCandidates": []}

        with (
            patch.object(app_module, "get_ocr_engine", return_value=FakeOcrEngine()),
            patch.object(app_module, "detect_answer_sheet_layout", return_value=[]),
            patch.object(app_module, "detect_grading_marks", side_effect=fake_detect),
            patch.object(app_module, "normalize_paddle_result", side_effect=fake_normalize),
        ):
            response = app_module.app.test_client().post(
                "/ocr",
                data={
                    "image": (io.BytesIO(image_bytes((100, 50))), "analysis.jpg"),
                    "originalImage": (io.BytesIO(image_bytes((1000, 500))), "original.jpg"),
                },
                content_type="multipart/form-data",
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(captured["detection_size"], (1000, 500))
        self.assertEqual(captured["grading_marks"][0]["bbox"], [10.0, 10.0, 30.0, 30.0])
        self.assertEqual(response.get_json()["pageRoleHint"], "unknown")

    def test_falls_back_to_analysis_image_when_original_cannot_be_decoded(self):
        captured = {}

        class FakeOcrEngine:
            def ocr(self, _image, cls=True):
                return []

        def fake_detect(image):
            captured["detection_size"] = image.size
            return []

        with (
            patch.object(app_module, "get_ocr_engine", return_value=FakeOcrEngine()),
            patch.object(app_module, "detect_answer_sheet_layout", return_value=[]),
            patch.object(app_module, "detect_grading_marks", side_effect=fake_detect),
        ):
            response = app_module.app.test_client().post(
                "/ocr",
                data={
                    "image": (io.BytesIO(image_bytes((100, 50))), "analysis.jpg"),
                    "originalImage": (io.BytesIO(b"unsupported-original-format"), "original.heic"),
                },
                content_type="multipart/form-data",
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(captured["detection_size"], (100, 50))


if __name__ == "__main__":
    unittest.main()

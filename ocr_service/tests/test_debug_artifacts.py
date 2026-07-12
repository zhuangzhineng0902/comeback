import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from PIL import Image

from debug_artifacts import write_debug_artifacts


class DebugArtifactsTest(unittest.TestCase):
    def test_writes_layout_grading_combined_and_metadata_outputs(self):
        with tempfile.TemporaryDirectory() as directory, patch.dict(
            "os.environ", {"OCR_DEBUG_OUTPUT_DIR": directory}
        ):
            artifacts = write_debug_artifacts(
                filename="paper.jpg",
                analysis_image=Image.new("RGB", (200, 100), "white"),
                detection_image=Image.new("RGB", (400, 200), "white"),
                layout_regions=[{"regionType": "subjective_question", "bbox": [10, 10, 100, 80], "confidence": 0.9}],
                original_marks=[{"markType": "cross", "bbox": [40, 40, 80, 80], "confidence": 0.9}],
                scaled_marks=[{"markType": "cross", "bbox": [20, 20, 40, 40], "confidence": 0.9}],
            )

            self.assertEqual({artifact["kind"] for artifact in artifacts}, {"layout", "grading-original", "combined-ocr", "metadata"})
            self.assertTrue(all(Path(artifact["path"]).is_file() for artifact in artifacts))


if __name__ == "__main__":
    unittest.main()

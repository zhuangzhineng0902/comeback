import unittest

from layout import deduplicate_layout_regions


class LayoutRegionTest(unittest.TestCase):
    def test_removes_near_duplicate_regions_but_keeps_nested_question_groups(self):
        regions = [
            {"regionType": "subjective_question", "bbox": [10, 10, 500, 500], "confidence": 0.9},
            {"regionType": "subjective_question", "bbox": [12, 12, 498, 498], "confidence": 0.8},
            {"regionType": "subjective_question", "bbox": [20, 20, 240, 240], "confidence": 0.95},
        ]

        result = deduplicate_layout_regions(regions)

        self.assertEqual(len(result), 2)
        self.assertTrue(any(item["bbox"] == [10, 10, 500, 500] for item in result))
        self.assertTrue(any(item["bbox"] == [20, 20, 240, 240] for item in result))


if __name__ == "__main__":
    unittest.main()

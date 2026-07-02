import unittest

from normalization import normalize_paddle_result


class NormalizePaddleResultTest(unittest.TestCase):
    def test_normalizes_paddle_ocr_result_into_blocks_and_question_candidates(self):
        result = [
            [
                [[[10, 20], [300, 20], [300, 60], [10, 60]], ("1. 解方程 x + 2 = 5", 0.96)],
                [[[320, 90], [480, 90], [480, 130], [320, 130]], ("学生答案：x = 2", 0.84)],
                [[[500, 95], [540, 95], [540, 135], [500, 135]], ("×", 0.91)],
            ]
        ]

        payload = normalize_paddle_result(result)

        self.assertTrue(payload["success"])
        self.assertEqual(payload["engine"], "paddleocr")
        self.assertEqual(payload["rawText"], "1. 解方程 x + 2 = 5\n学生答案：x = 2\n×")
        self.assertEqual(payload["textBlocks"][0]["bbox"], [10.0, 20.0, 300.0, 60.0])
        self.assertEqual(payload["textBlocks"][0]["role"], "question")
        self.assertEqual(payload["textBlocks"][1]["role"], "studentAnswer")
        self.assertEqual(payload["textBlocks"][2]["role"], "teacherMark")
        self.assertEqual(payload["questionCandidates"][0]["questionId"], "1")
        self.assertIn("解方程", payload["questionCandidates"][0]["text"])


if __name__ == "__main__":
    unittest.main()

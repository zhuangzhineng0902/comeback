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

    def test_builds_mistake_candidates_from_red_marks_near_questions(self):
        result = [
            [
                [[[100, 100], [360, 100], [360, 130], [100, 130]], ("9. 64 的算术平方根是____", 0.96)],
                [[[100, 300], [520, 300], [520, 330], [100, 330]], ("14. 计算：（1）-（7）", 0.94)],
                [[[120, 350], [320, 350], [320, 380], [120, 380]], ("(2) 4x² - 36 = 0", 0.91)],
            ]
        ]
        grading_marks = [
            {"markType": "cross", "bbox": [330, 342, 380, 392], "confidence": 0.88, "source": "red-ink"},
            {"markType": "deduction", "bbox": [390, 335, 430, 370], "confidence": 0.7, "markText": "-2", "source": "red-ink"},
        ]

        payload = normalize_paddle_result(result, grading_marks=grading_marks)

        self.assertEqual(len(payload["gradingMarks"]), 2)
        self.assertGreaterEqual(len(payload["mistakeCandidates"]), 1)
        candidate = payload["mistakeCandidates"][0]
        self.assertEqual(candidate["questionId"], "14")
        self.assertEqual(candidate["subQuestionId"], "2")
        self.assertIn("cross", candidate["markTypes"])
        self.assertIn("deduction", candidate["markTypes"])
        self.assertEqual(candidate["judgement"], "partial")

    def test_ignores_ocr_text_cross_without_red_ink_evidence(self):
        result = [
            [
                [[[80, 100], [620, 100], [620, 140], [80, 140]], ("8. 下列说法正确的是", 0.96)],
                [[[120, 180], [140, 180], [140, 210], [120, 210]], ("X", 0.94)],
                [[[160, 180], [500, 180], [500, 210], [160, 210]], ("A. 错误选项", 0.91)],
            ]
        ]

        payload = normalize_paddle_result(result)

        self.assertEqual(payload["mistakeCandidates"], [])

    def test_does_not_bind_right_column_red_marks_to_left_column_questions(self):
        result = [
            [
                [[[80, 1020], [620, 1020], [620, 1060], [80, 1060]], ("8. 函数图象选择题", 0.96)],
                [[[980, 640], [1380, 640], [1380, 680], [980, 680]], ("14. 计算：（1）-（7）", 0.94)],
            ]
        ]
        grading_marks = [
            {"markType": "cross", "bbox": [930, 970, 970, 1010], "confidence": 0.8, "source": "red-ink"},
        ]

        payload = normalize_paddle_result(result, grading_marks=grading_marks)

        self.assertEqual(len(payload["mistakeCandidates"]), 1)
        self.assertEqual(payload["mistakeCandidates"][0]["questionId"], "14")


if __name__ == "__main__":
    unittest.main()

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

    def test_infers_missing_first_choice_question_from_options(self):
        result = [
            [
                [[[90, 140], [520, 140], [520, 170], [90, 170]], ("一、选择题：本题共8小题", 0.96)],
                [[[105, 230], [155, 230], [155, 255], [105, 255]], ("A.1", 0.99)],
                [[[250, 230], [300, 230], [300, 255], [250, 255]], ("B.2", 0.99)],
                [[[405, 230], [455, 230], [455, 255], [405, 255]], ("C.3", 0.99)],
                [[[570, 230], [620, 230], [620, 255], [570, 255]], ("D.4", 0.99)],
                [[[75, 265], [395, 265], [395, 295], [75, 295]], ("2. 下面各组数中，是勾股数的是（）", 0.97)],
            ]
        ]
        grading_marks = [
            {"markType": "unknown", "bbox": [716, 194, 722, 202], "confidence": 0.47, "source": "red-ink"},
        ]

        payload = normalize_paddle_result(result, grading_marks=grading_marks)

        self.assertTrue(any(candidate["questionId"] == "1" for candidate in payload["questionCandidates"]))
        q1_candidate = next(candidate for candidate in payload["mistakeCandidates"] if candidate["questionId"] == "1")
        self.assertEqual(q1_candidate["judgement"], "suspected")

    def test_inferred_choice_question_ignores_far_lower_red_marks(self):
        result = [
            [
                [[[90, 140], [520, 140], [520, 170], [90, 170]], ("一、选择题：本题共8小题", 0.96)],
                [[[105, 230], [155, 230], [155, 255], [105, 255]], ("A.1", 0.99)],
                [[[250, 230], [300, 230], [300, 255], [250, 255]], ("B.2", 0.99)],
                [[[405, 230], [455, 230], [455, 255], [405, 255]], ("C.3", 0.99)],
                [[[570, 230], [620, 230], [620, 255], [570, 255]], ("D.4", 0.99)],
                [[[75, 265], [395, 265], [395, 295], [75, 295]], ("2. 下面各组数中，是勾股数的是（）", 0.97)],
            ]
        ]
        grading_marks = [
            {"markType": "unknown", "bbox": [716, 194, 722, 202], "confidence": 0.47, "source": "red-ink"},
            {"markType": "unknown", "bbox": [650, 1000, 670, 1020], "confidence": 0.47, "source": "red-ink"},
        ]

        payload = normalize_paddle_result(result, grading_marks=grading_marks)

        q1_candidate = next(candidate for candidate in payload["mistakeCandidates"] if candidate["questionId"] == "1")
        self.assertLess(q1_candidate["bbox"][3], 300)

    def test_binds_red_correction_on_right_side_of_left_column_question(self):
        result = [
            [
                [[[105, 227], [619, 227], [619, 252], [105, 252]], ("1. 第一题", 0.97)],
                [[[75, 260], [395, 260], [395, 290], [75, 290]], ("2. 上一题", 0.97)],
                [[[77, 380], [610, 380], [610, 410], [77, 410]], ("3. 已知△ABC，求作△A'B'C'", 0.92)],
                [[[77, 498], [480, 498], [480, 530], [77, 530]], ("4. 下一题", 0.88)],
                [[[975, 145], [1365, 145], [1365, 175], [975, 175]], ("9. 右栏题目", 0.95)],
                [[[973, 190], [1365, 190], [1365, 220], [973, 220]], ("10. 右栏题目", 0.95)],
                [[[975, 233], [1453, 233], [1453, 257], [975, 257]], ("11. 右栏题目", 0.95)],
            ]
        ]
        grading_marks = [
            {"markType": "unknown", "bbox": [492, 420, 498, 426], "confidence": 0.47, "source": "red-ink"},
        ]

        payload = normalize_paddle_result(result, grading_marks=grading_marks)

        q3_candidate = next(candidate for candidate in payload["mistakeCandidates"] if candidate["questionId"] == "3")
        self.assertEqual(q3_candidate["judgement"], "suspected")


if __name__ == "__main__":
    unittest.main()

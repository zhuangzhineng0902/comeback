import unittest

from normalization import normalize_paddle_result


def line(text, box, confidence=0.95):
    x1, y1, x2, y2 = box
    return [[[x1, y1], [x2, y1], [x2, y2], [x1, y2]], (text, confidence)]


class SingleSheetBindingTest(unittest.TestCase):
    def test_ignores_formula_zero_and_binds_marks_to_major_question(self):
        result = [[
            line("14. 计算（每题3分）", [950, 95, 1250, 120]),
            line("(2) (x-y)^3", [1320, 120, 1550, 145]),
            line("0. ÷", [1460, 190, 1520, 215]),
            line("(4) 化简", [1320, 250, 1450, 275]),
            line("15. 化简求值", [965, 555, 1300, 580]),
        ]]
        marks = [
            {"markType": "cross", "bbox": [1560, 185, 1600, 230], "confidence": 0.8, "source": "red-ink"},
            {"markType": "cross", "bbox": [1680, 285, 1735, 320], "confidence": 0.8, "source": "red-ink"},
        ]

        payload = normalize_paddle_result(result, grading_marks=marks)

        self.assertFalse(any(candidate["questionId"] == "0" for candidate in payload["questionCandidates"]))
        self.assertEqual({(item["questionId"], item["subQuestionId"]) for item in payload["mistakeCandidates"]}, {("14", "2"), ("14", "4")})


if __name__ == "__main__":
    unittest.main()

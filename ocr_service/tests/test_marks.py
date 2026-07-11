import unittest

from marks import _classify_red_component


class RedMarkShapeTest(unittest.TestCase):
    def test_classifies_two_balanced_diagonals_as_cross(self):
        points = [(value, value) for value in range(10, 51)] + [(value, 60 - value) for value in range(10, 51)]
        mark_type, confidence = _classify_red_component(
            [point[0] for point in points], [point[1] for point in points], (10, 10, 51, 51)
        )
        self.assertEqual(mark_type, "cross")
        self.assertGreater(confidence, 0.5)

    def test_does_not_classify_a_single_diagonal_as_cross(self):
        points = [(value, value) for value in range(10, 91)]
        mark_type, _ = _classify_red_component(
            [point[0] for point in points], [point[1] for point in points], (10, 10, 91, 91)
        )
        self.assertNotEqual(mark_type, "cross")


if __name__ == "__main__":
    unittest.main()

from collections import deque
from typing import Any


def _classify_red_component(xs: list[int], ys: list[int], bbox: tuple[int, int, int, int]) -> tuple[str, float]:
    x1, y1, x2, y2 = bbox
    width = max(1, x2 - x1)
    height = max(1, y2 - y1)
    if width < 12 or height < 12:
        return "unknown", 0.45

    # A real X occupies both diagonals. Long ticks, underlines and correction
    # strokes normally occupy only one diagonal or have a very skewed aspect.
    positive = 0
    negative = 0
    tolerance = 0.16
    for x, y in zip(xs, ys):
        nx = (x - x1) / width
        ny = (y - y1) / height
        if abs(nx - ny) <= tolerance:
            positive += 1
        if abs(nx + ny - 1) <= tolerance:
            negative += 1

    total = max(1, len(xs))
    positive_ratio = positive / total
    negative_ratio = negative / total
    balance = min(positive, negative) / max(1, max(positive, negative))
    aspect = width / height
    if 0.35 <= aspect <= 2.8 and positive_ratio >= 0.16 and negative_ratio >= 0.16 and balance >= 0.42:
        confidence = min(0.96, 0.55 + min(positive_ratio, negative_ratio) * 0.8 + balance * 0.12)
        return "cross", confidence
    if 0.2 <= aspect <= 5 and max(positive_ratio, negative_ratio) >= 0.2:
        return "check", min(0.85, 0.5 + max(positive_ratio, negative_ratio) * 0.5)
    return "unknown", 0.45


def detect_red_marks(image: Any) -> list[dict[str, Any]]:
    rgb = image.convert("RGB")
    width, height = rgb.size
    pixels = rgb.load()
    visited: set[tuple[int, int]] = set()
    step = 2
    marks = []

    def is_red(x: int, y: int) -> bool:
        red, green, blue = pixels[x, y]
        return red >= 145 and red - green >= 45 and red - blue >= 45 and red > green * 1.25 and red > blue * 1.25

    for y in range(0, height, step):
        for x in range(0, width, step):
            if (x, y) in visited or not is_red(x, y):
                continue

            queue = deque([(x, y)])
            visited.add((x, y))
            xs = []
            ys = []

            while queue:
                cx, cy = queue.popleft()
                xs.append(cx)
                ys.append(cy)
                for nx, ny in (
                    (cx + step, cy),
                    (cx - step, cy),
                    (cx, cy + step),
                    (cx, cy - step),
                    (cx + step, cy + step),
                    (cx + step, cy - step),
                    (cx - step, cy + step),
                    (cx - step, cy - step),
                ):
                    if nx < 0 or ny < 0 or nx >= width or ny >= height or (nx, ny) in visited:
                        continue
                    if is_red(nx, ny):
                        visited.add((nx, ny))
                        queue.append((nx, ny))

            area = len(xs) * step * step
            if area < 28:
                continue

            x1, y1, x2, y2 = min(xs), min(ys), max(xs) + step, max(ys) + step
            box_width = max(1, x2 - x1)
            box_height = max(1, y2 - y1)
            if box_width < 6 and box_height < 6:
                continue

            mark_type, shape_confidence = _classify_red_component(xs, ys, (x1, y1, x2, y2))
            marks.append(
                {
                    "markType": mark_type,
                    "bbox": [float(x1), float(y1), float(x2), float(y2)],
                    "confidence": min(shape_confidence, 0.45 + area / 1200),
                    "source": "red-ink",
                }
            )

    return marks[:120]

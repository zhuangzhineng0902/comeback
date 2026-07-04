from collections import deque
from typing import Any


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

            mark_type = "cross" if box_width >= 12 and box_height >= 12 else "unknown"
            marks.append(
                {
                    "markType": mark_type,
                    "bbox": [float(x1), float(y1), float(x2), float(y2)],
                    "confidence": min(0.95, 0.45 + area / 1800),
                    "source": "red-ink",
                }
            )

    return marks[:120]

import re
from typing import Any


QUESTION_PREFIX_RE = re.compile(r"^\s*(?:第\s*)?([0-9]{1,3}|[一二三四五六七八九十]{1,4})\s*[\.、\)）]")
TEACHER_MARK_RE = re.compile(r"^[×xX√✓✔△]|扣\s*\d+|-\s*\d+|半[对勾]")
STUDENT_ANSWER_RE = re.compile(r"(学生答案|答案|解[:：]|答[:：]|所以|因为|故)")


def _as_number(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number


def normalize_bbox(value: Any) -> list[float] | None:
    if not isinstance(value, list):
        return None

    if len(value) >= 4 and all(not isinstance(item, list) for item in value[:4]):
        numbers = [_as_number(item) for item in value[:4]]
        if any(item is None for item in numbers):
            return None
        x1, y1, x2, y2 = numbers
        return [min(x1, x2), min(y1, y2), max(x1, x2), max(y1, y2)]

    points = []
    for item in value:
        if isinstance(item, (list, tuple)) and len(item) >= 2:
            x = _as_number(item[0])
            y = _as_number(item[1])
            if x is not None and y is not None:
                points.append((x, y))

    if not points:
        return None

    xs = [point[0] for point in points]
    ys = [point[1] for point in points]
    return [min(xs), min(ys), max(xs), max(ys)]


def _flatten_result(result: Any) -> list[Any]:
    if not isinstance(result, list):
        return []

    flattened: list[Any] = []
    for item in result:
        if _looks_like_paddle_line(item) or isinstance(item, dict):
            flattened.append(item)
        elif isinstance(item, list):
            flattened.extend(_flatten_result(item))
    return flattened


def _looks_like_paddle_line(item: Any) -> bool:
    return (
        isinstance(item, (list, tuple))
        and len(item) >= 2
        and isinstance(item[1], (list, tuple))
        and len(item[1]) >= 1
        and isinstance(item[1][0], str)
    )


def _parse_item(item: Any) -> dict[str, Any] | None:
    if isinstance(item, dict):
        text = item.get("text") or item.get("content") or item.get("words") or item.get("value")
        if not isinstance(text, str) or not text.strip():
            return None
        confidence = _as_number(item.get("confidence") or item.get("score") or item.get("probability"))
        return {
            "text": text.strip(),
            "bbox": normalize_bbox(item.get("bbox") or item.get("box") or item.get("position")),
            "confidence": confidence,
        }

    if not _looks_like_paddle_line(item):
        return None

    text_part = item[1][0]
    if not isinstance(text_part, str) or not text_part.strip():
        return None

    confidence = _as_number(item[1][1]) if len(item[1]) > 1 else None
    return {
        "text": text_part.strip(),
        "bbox": normalize_bbox(item[0]),
        "confidence": confidence,
    }


def classify_role(text: str) -> str:
    if TEACHER_MARK_RE.search(text.strip()):
        return "teacherMark"
    if QUESTION_PREFIX_RE.search(text):
        return "question"
    if STUDENT_ANSWER_RE.search(text):
        return "studentAnswer"
    return "other"


def _candidate_from_block(block: dict[str, Any], index: int) -> dict[str, Any] | None:
    match = QUESTION_PREFIX_RE.search(block["text"])
    if not match:
        return None

    text = QUESTION_PREFIX_RE.sub("", block["text"], count=1).strip()
    return {
        "questionId": match.group(1),
        "text": text or block["text"],
        "bbox": block.get("bbox"),
        "confidence": block.get("confidence") or max(0.5, 0.9 - index * 0.01),
    }


def normalize_paddle_result(result: Any) -> dict[str, Any]:
    blocks = []
    for item in _flatten_result(result):
        parsed = _parse_item(item)
        if not parsed:
            continue
        block = {
            "text": parsed["text"],
            "role": classify_role(parsed["text"]),
        }
        if parsed.get("bbox") is not None:
            block["bbox"] = parsed["bbox"]
        if parsed.get("confidence") is not None:
            block["confidence"] = parsed["confidence"]
        blocks.append(block)

    question_candidates = [
        candidate
        for index, block in enumerate(blocks)
        if (candidate := _candidate_from_block(block, index)) is not None
    ]

    raw_text = "\n".join(block["text"] for block in blocks)
    return {
        "success": True,
        "engine": "paddleocr",
        "summary": f"recognized {len(blocks)} text blocks",
        "rawText": raw_text,
        "textBlocks": blocks,
        "questionCandidates": question_candidates,
    }

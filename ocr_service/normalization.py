import math
import re
from typing import Any


QUESTION_PREFIX_RE = re.compile(r"^\s*(?:第\s*)?([0-9]{1,3}|[一二三四五六七八九十]{1,4})\s*[\.、\)）]")
TEACHER_MARK_RE = re.compile(r"^[×xX√✓✔△]|扣\s*\d+|-\s*\d+|半[对勾]")
STUDENT_ANSWER_RE = re.compile(r"(学生答案|答案|解[:：]|答[:：]|所以|因为|故)")
SUB_QUESTION_RE = re.compile(r"^\s*[\(（]([0-9]{1,2})[\)）]")


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


def _center(box: list[float] | None) -> tuple[float, float] | None:
    if not box:
        return None
    return ((box[0] + box[2]) / 2, (box[1] + box[3]) / 2)


def _union_box(boxes: list[list[float] | None]) -> list[float] | None:
    valid = [box for box in boxes if box]
    if not valid:
        return None
    return [min(box[0] for box in valid), min(box[1] for box in valid), max(box[2] for box in valid), max(box[3] for box in valid)]


def _horizontal_overlap_ratio(a: list[float] | None, b: list[float] | None) -> float:
    if not a or not b:
        return 0
    overlap = max(0, min(a[2], b[2]) - max(a[0], b[0]))
    width = max(1, min(a[2] - a[0], b[2] - b[0]))
    return overlap / width


def _distance(a: tuple[float, float], b: tuple[float, float]) -> float:
    return math.hypot(a[0] - b[0], a[1] - b[1])


def _find_nearest_question(mark: dict[str, Any], questions: list[dict[str, Any]]) -> dict[str, Any] | None:
    mark_center = _center(mark.get("bbox"))
    if not mark_center:
        return None

    question_centers = [_center(question.get("bbox")) for question in questions]
    x_centers = sorted(center[0] for center in question_centers if center)
    median_x = x_centers[len(x_centers) // 2] if x_centers else mark_center[0]
    prefer_right_column = mark_center[0] > median_x
    ranked = []
    for question in questions:
        question_box = question.get("bbox")
        question_center = _center(question_box)
        if not question_center:
            continue
        if prefer_right_column and question_center[0] < median_x:
            continue
        if not prefer_right_column and question_center[0] > median_x + 180:
            continue
        y_gap = mark_center[1] - question_center[1]
        if y_gap < -90:
            continue
        overlap = _horizontal_overlap_ratio(mark.get("bbox"), question_box)
        x_gap = max(0, question_box[0] - mark_center[0], mark_center[0] - question_box[2])
        if overlap <= 0 and x_gap > 420:
            continue
        ranked.append((abs(y_gap) + x_gap * 0.4 + _distance(mark_center, question_center) * 0.05, question))

    if not ranked:
        return None
    return sorted(ranked, key=lambda item: item[0])[0][1]


def _find_sub_question(mark: dict[str, Any], blocks: list[dict[str, Any]], question: dict[str, Any] | None) -> str | None:
    mark_center = _center(mark.get("bbox"))
    if not mark_center:
        return None

    candidates = []
    question_y = (question.get("bbox") or [0, 0, 0, 0])[1] if question else 0
    for block in blocks:
        match = SUB_QUESTION_RE.search(block.get("text", ""))
        block_center = _center(block.get("bbox"))
        if not match or not block_center:
            continue
        if block_center[1] < question_y - 20:
            continue
        if block_center[1] > mark_center[1] + 70:
            continue
        if abs(block_center[1] - mark_center[1]) > 140:
            continue
        candidates.append((_distance(mark_center, block_center), match.group(1)))

    if not candidates:
        return None
    return sorted(candidates, key=lambda item: item[0])[0][1]


def _judgement_from_marks(mark_types: list[str]) -> str:
    if "partial" in mark_types or "deduction" in mark_types:
        return "partial"
    if "cross" in mark_types:
        return "wrong"
    if "question" in mark_types or "unknown" in mark_types:
        return "suspected"
    return "unknown"


def build_mistake_candidates(
    blocks: list[dict[str, Any]],
    question_candidates: list[dict[str, Any]],
    grading_marks: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    grouped: dict[tuple[str, str], dict[str, Any]] = {}

    for mark in grading_marks:
        question = _find_nearest_question(mark, question_candidates)
        if not question:
            continue
        sub_id = _find_sub_question(mark, blocks, question)
        key = (str(question.get("questionId", "")), sub_id or "")
        current = grouped.setdefault(
            key,
            {
                "questionId": question.get("questionId"),
                "subQuestionId": sub_id,
                "text": question.get("text"),
                "bbox": question.get("bbox"),
                "confidence": 0,
                "markTypes": [],
                "marks": [],
            },
        )
        current["marks"].append(mark)
        current["bbox"] = _union_box([current.get("bbox"), mark.get("bbox")])
        current["confidence"] = max(current.get("confidence") or 0, mark.get("confidence") or 0.5)
        mark_type = mark.get("markType", "unknown")
        if mark_type not in current["markTypes"]:
            current["markTypes"].append(mark_type)

    candidates = []
    for candidate in grouped.values():
        mark_types = candidate.pop("marks") and candidate["markTypes"]
        candidate["judgement"] = _judgement_from_marks(mark_types)
        candidate["evidenceSummary"] = f"题号 {candidate.get('questionId')}{'(' + candidate.get('subQuestionId') + ')' if candidate.get('subQuestionId') else ''} 附近发现批改标记：{', '.join(mark_types)}。"
        candidates.append(candidate)

    return sorted(candidates, key=lambda item: ((item.get("bbox") or [0, 0, 0, 0])[1], (item.get("bbox") or [0, 0, 0, 0])[0]))


def _mark_from_text_block(block: dict[str, Any]) -> dict[str, Any] | None:
    text = block.get("text", "").strip()
    if not text:
        return None
    if re.search(r"^[:：]?\s*-\s*\d+(?:\.\d+)?$", text) or re.search(r"扣\s*\d+", text):
        mark_type = "deduction"
    elif re.search(r"^[×xX]$", text):
        mark_type = "cross"
    elif re.search(r"^[√✓✔]$", text):
        mark_type = "check"
    elif re.search(r"半[对勾]", text):
        mark_type = "partial"
    elif re.search(r"度\.?\s*\d+", text):
        mark_type = "deduction"
    else:
        return None
    return {
        "markType": mark_type,
        "markText": text,
        "bbox": block.get("bbox"),
        "confidence": block.get("confidence", 0.6),
        "source": "ocr-text",
    }


def normalize_paddle_result(result: Any, grading_marks: list[dict[str, Any]] | None = None) -> dict[str, Any]:
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
    normalized_marks = [*(grading_marks or [])]
    normalized_marks.extend(mark for block in blocks if (mark := _mark_from_text_block(block)) is not None)
    mistake_candidates = build_mistake_candidates(blocks, question_candidates, normalized_marks)

    raw_text = "\n".join(block["text"] for block in blocks)
    return {
        "success": True,
        "engine": "paddleocr",
        "summary": f"recognized {len(blocks)} text blocks",
        "rawText": raw_text,
        "textBlocks": blocks,
        "questionCandidates": question_candidates,
        "gradingMarks": normalized_marks,
        "mistakeCandidates": mistake_candidates,
    }

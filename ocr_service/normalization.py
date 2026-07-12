import math
import re
from typing import Any


QUESTION_PREFIX_RE = re.compile(r"^\s*(?:第\s*)?([0-9]{1,3}|[一二三四五六七八九十]{1,4})\s*[\.、\)）]")
TEACHER_MARK_RE = re.compile(r"^[×xX√✓✔△]|扣\s*\d+|-\s*\d+|半[对勾]")
STUDENT_ANSWER_RE = re.compile(r"(学生答案|答案|解[:：]|答[:：]|所以|因为|故)")
SUB_QUESTION_RE = re.compile(r"^\s*[\(（]([0-9]{1,2})[\)）]")
CHOICE_OPTION_RE = re.compile(r"^\s*([A-D])\s*[\.．、]")


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
    if match.group(1) == "0":
        return None
    if match.group(1) in {"一", "二", "三", "四"} and re.search(r"选择题|填空题|解.*题|本题|共\d+小题", text):
        return None

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


def _infer_missing_choice_question_candidates(
    blocks: list[dict[str, Any]],
    question_candidates: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    existing_ids = {str(candidate.get("questionId")) for candidate in question_candidates}
    if "1" in existing_ids:
        return []

    section_blocks = [
        block
        for block in blocks
        if "选择题" in block.get("text", "") and block.get("bbox")
    ]
    if not section_blocks:
        return []

    next_question = next(
        (
            candidate
            for candidate in question_candidates
            if str(candidate.get("questionId")) == "2" and candidate.get("bbox")
        ),
        None,
    )
    if not next_question:
        return []

    section_y = min((block["bbox"][1] for block in section_blocks), default=0)
    next_y = next_question["bbox"][1]
    option_blocks = [
        block
        for block in blocks
        if block.get("bbox")
        and section_y < block["bbox"][1] < next_y
        and CHOICE_OPTION_RE.search(block.get("text", ""))
    ]
    option_labels = {CHOICE_OPTION_RE.search(block.get("text", "")).group(1) for block in option_blocks}
    if len(option_labels) < 3:
        return []

    option_box = _union_box([block.get("bbox") for block in option_blocks])
    if not option_box:
        return []

    return [
        {
            "questionId": "1",
            "text": "OCR 未完整识别第 1 题题干，已根据 A-D 选项行反推为第 1 题选择题。",
            "bbox": option_box,
            "confidence": min(block.get("confidence") or 0.7 for block in option_blocks),
            "inferred": True,
        }
    ]


def _horizontal_overlap_ratio(a: list[float] | None, b: list[float] | None) -> float:
    if not a or not b:
        return 0
    overlap = max(0, min(a[2], b[2]) - max(a[0], b[0]))
    width = max(1, min(a[2] - a[0], b[2] - b[0]))
    return overlap / width


def _distance(a: tuple[float, float], b: tuple[float, float]) -> float:
    return math.hypot(a[0] - b[0], a[1] - b[1])


def _is_mark_in_question_column(mark_box: list[float] | None, question_box: list[float] | None) -> bool:
    if not mark_box or not question_box:
        return False

    mark_x = (mark_box[0] + mark_box[2]) / 2
    question_width = max(1, question_box[2] - question_box[0])
    left_tolerance = max(120, question_width * 0.25)
    right_tolerance = max(180, question_width * 0.35)
    return question_box[0] - left_tolerance <= mark_x <= question_box[2] + right_tolerance


def _is_major_solution_question(question: dict[str, Any]) -> bool:
    question_id = str(question.get("questionId", ""))
    return question_id.isdigit() and int(question_id) >= 14


def _question_columns(questions: list[dict[str, Any]]) -> list[list[dict[str, Any]]]:
    positioned = [question for question in questions if question.get("bbox") and len(question["bbox"]) == 4]
    if not positioned:
        return []
    positioned.sort(key=lambda question: question["bbox"][0])
    page_span = max(question["bbox"][2] for question in positioned) - min(question["bbox"][0] for question in positioned)
    split_gap = max(220.0, page_span * 0.18)
    columns: list[list[dict[str, Any]]] = []
    previous_left = None
    for question in positioned:
        left = float(question["bbox"][0])
        if previous_left is None or left - previous_left > split_gap:
            columns.append([])
        columns[-1].append(question)
        previous_left = left
    return [sorted(column, key=lambda question: question["bbox"][1]) for column in columns]


def _find_nearest_question(mark: dict[str, Any], questions: list[dict[str, Any]]) -> dict[str, Any] | None:
    mark_center = _center(mark.get("bbox"))
    if not mark_center:
        return None

    columns = _question_columns(questions)
    if not columns:
        return None
    column_lefts = [sum(float(question["bbox"][0]) for question in column) / len(column) for column in columns]
    selected_index = min(range(len(columns)), key=lambda index: abs(mark_center[0] - column_lefts[index]))
    if len(columns) > 1:
        for index in range(len(columns) - 1):
            boundary = (column_lefts[index] + column_lefts[index + 1]) / 2
            if mark_center[0] <= boundary:
                selected_index = index
                break
        else:
            selected_index = len(columns) - 1

    column = columns[selected_index]
    first_top = float(column[0]["bbox"][1])
    if mark_center[1] < first_top - 90:
        return None
    preceding = [question for question in column if float(question["bbox"][1]) <= mark_center[1] + 20]
    selected = preceding[-1] if preceding else column[0]
    selected_box = selected["bbox"]
    if selected.get("inferred") and abs(mark_center[1] - _center(selected_box)[1]) > 110:
        return None
    max_vertical_gap = 1200 if _is_major_solution_question(selected) else 700
    if mark_center[1] - float(selected_box[1]) > max_vertical_gap:
        return None
    return selected


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
        if question and not _is_mark_in_question_column(block.get("bbox"), question.get("bbox")) and not _is_major_solution_question(question):
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


def _is_candidate_grading_mark(mark: dict[str, Any]) -> bool:
    source = mark.get("source")
    mark_type = mark.get("markType")
    if source == "yolo-error-mark":
        return mark_type == "cross" and (mark.get("confidence") or 0) >= 0.4
    if source == "yolo-error-mark-review":
        return mark_type == "question" and (mark.get("confidence") or 0) >= 0.4
    if source == "red-ink":
        if mark_type in {"unknown", "check", "none"}:
            return False
        if mark_type == "cross" and (mark.get("confidence") or 0) < 0.5:
            return False
        return True

    # OCR text has no color channel. A standalone X/check can be a student's
    # black-pen option elimination mark, so only keep textual marks that imply
    # teacher grading semantics on their own.
    return source == "ocr-text" and mark_type in {"deduction", "partial"}


def build_mistake_candidates(
    blocks: list[dict[str, Any]],
    question_candidates: list[dict[str, Any]],
    grading_marks: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    grouped: dict[tuple[str, str], dict[str, Any]] = {}

    for mark in grading_marks:
        if not _is_candidate_grading_mark(mark):
            continue
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
                "questionBbox": question.get("bbox"),
                "inferred": question.get("inferred", False),
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
        marks = candidate.pop("marks")
        question_box = candidate.pop("questionBbox", None)
        is_inferred = bool(candidate.get("inferred"))
        mark_types = marks and candidate["markTypes"]
        if set(mark_types) == {"unknown"}:
            has_unknown_inside_question = any(
                question_box
                and (mark_box := mark.get("bbox"))
                and (
                    question_box[0] <= ((mark_box[0] + mark_box[2]) / 2) <= question_box[2]
                    or (is_inferred and _is_mark_in_question_column(mark_box, question_box))
                )
                for mark in marks
            )
            if not has_unknown_inside_question:
                continue
        candidate["judgement"] = _judgement_from_marks(mark_types)
        candidate["requiresManualReview"] = any(
            mark.get("source") == "yolo-error-mark-review" or mark.get("requiresManualReview") is True
            for mark in marks
        )
        candidate["evidenceSummary"] = f"题号 {candidate.get('questionId')}{'(' + candidate.get('subQuestionId') + ')' if candidate.get('subQuestionId') else ''} 附近发现批改标记：{', '.join(mark_types)}。"
        # Below this threshold, fragmented red ticks and long correction
        # strokes generate substantially more false positives than useful Xs.
        has_yolo_evidence = any(str(mark.get("source", "")).startswith("yolo-error-mark") for mark in marks)
        if (candidate.get("confidence") or 0) >= (0.4 if has_yolo_evidence else 0.6):
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
    question_candidates.extend(_infer_missing_choice_question_candidates(blocks, question_candidates))
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

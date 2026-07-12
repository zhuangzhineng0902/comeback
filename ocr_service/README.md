# OCR Service

This service provides a local OCR endpoint for the private tutor app. It follows the same idea as the referenced `error_correction` project: run OCR before the large model, then send text blocks, bounding boxes, teacher marks, and question candidates to the AI analyzer.

The service does not copy code from that project. It exposes a small HTTP contract that the Next.js app already consumes through `OCR_SERVICE_URL`.

## Endpoints

- `GET /health`
- `POST /ocr` with multipart field `image`

Example response:

```json
{
  "success": true,
  "engine": "paddleocr",
  "summary": "recognized 12 text blocks",
  "rawText": "1. ...",
  "textBlocks": [
    { "text": "1. 解方程 x + 2 = 5", "bbox": [10, 20, 300, 60], "confidence": 0.96, "role": "question" }
  ],
  "questionCandidates": [
    { "questionId": "1", "text": "解方程 x + 2 = 5", "bbox": [10, 20, 300, 60], "confidence": 0.96 }
  ]
}
```

## Run Locally

```bash
python3 -m venv .venv-ocr
source .venv-ocr/bin/activate
pip install -r ocr_service/requirements.txt
pip install paddlepaddle
python3 ocr_service/app.py
```

The service also loads `models/answer_sheet_layout.pt` from OCRAutoScore to
locate answer-sheet regions before MiniMax interprets grading marks. Layout
detection runs in an isolated subprocess so PyTorch does not share a process
with PaddleOCR.

Optional layout settings:

```bash
OCR_LAYOUT_ENABLED="true"
OCR_LAYOUT_MODEL_PATH="/absolute/path/to/answer_sheet_layout.pt"
OCR_LAYOUT_CONFIDENCE="0.25"
OCR_LAYOUT_IMAGE_SIZE="640"
OCR_LAYOUT_TIMEOUT_SECONDS="45"
```

The grading detector uses the locally trained single-class YOLO26n checkpoint
and SAHI sliced inference. The `/ocr` request may include both `image` (the
1600px OCR/AI analysis image) and `originalImage` (the original upload). YOLO
runs on `originalImage` for every independently analyzed page, then its boxes
are scaled into OCR coordinates. In composite-paper mode, grading candidates
from pages classified as question pages are discarded during answer matching.

```bash
OCR_GRADING_ENABLED="true"
OCR_GRADING_MODEL_PATH="/absolute/path/to/error_mark_yolo26n_hard_v2.pt"
OCR_GRADING_DEVICE="mps"
OCR_GRADING_CANDIDATE_CONFIDENCE="0.03"
OCR_GRADING_FINAL_CONFIDENCE="0.40"
OCR_GRADING_AUTO_CONFIDENCE="0.80"
OCR_GRADING_SLICE_SIZE="640"
OCR_GRADING_OVERLAP="0.20"
OCR_GRADING_NMS_IOU="0.50"
OCR_GRADING_TIMEOUT_SECONDS="90"
```

Intermediate visual debugging is disabled by default. Enable it globally or
send `debug=true` in a single multipart `/ocr` request. The response then
contains `debugArtifacts` for the layout overlay, original-resolution YOLO
overlay, combined OCR-coordinate overlay, and JSON metadata.

```bash
OCR_DEBUG_ARTIFACTS="true"
OCR_DEBUG_OUTPUT_DIR="/absolute/path/to/tmp/ocr-debug"
```

When globally enabled, files are available from
`http://127.0.0.1:5005/debug-artifacts/<filename>`.

Then set the Next.js app environment:

```bash
OCR_SERVICE_URL="http://127.0.0.1:5005/ocr"
OCR_TIMEOUT_MS="120000"
MINIMAX_MAX_COMPLETION_TOKENS="16000"
MINIMAX_TIMEOUT_MS="90000"
ENABLE_AI_FALLBACK="false"
```

For Apple Silicon or CPU/GPU-specific installs, use the PaddlePaddle wheel that matches your Python and hardware environment.

Large uploaded photos are resized before OCR. Override the default longest side if needed:

```bash
OCR_MAX_SIDE="1800"
```

## Test

```bash
PYTHONPATH=ocr_service python3 -m unittest discover -s ocr_service/tests
```

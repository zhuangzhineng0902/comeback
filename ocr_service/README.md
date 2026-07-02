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

Then set the Next.js app environment:

```bash
OCR_SERVICE_URL="http://127.0.0.1:5005/ocr"
```

For Apple Silicon or CPU/GPU-specific installs, use the PaddlePaddle wheel that matches your Python and hardware environment.

## Test

```bash
PYTHONPATH=ocr_service python3 -m unittest discover -s ocr_service/tests
```

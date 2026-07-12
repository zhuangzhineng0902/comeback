# Detect wrong-question pipeline

Pipeline stages:

1. `MarkDetector`: SAHI 640x640 overlapping slices, single-class YOLO Detect inference, axis-aligned IoU NMS.
2. `LayoutSegmenter`: parses OCR four-point coordinates, clusters columns, assigns marks to question/sub-question intervals, exports atomic crops.
3. `VLMRefiner`: bounded concurrent MiniMax calls with timeout, retry, JSON extraction and schema validation.
4. `augment.py`: legacy experimental Copy-Paste augmentation; it is not part of the current production training path.

The detector requires a single-class Ultralytics Detect checkpoint named `error_mark`.

```bash
python -m error_pipeline.cli \
  --image paper.jpg \
  --ocr-json ocr.json \
  --model ocr_service/models/error_mark_yolo26n_hard_v2.pt \
  --output-dir output/run-001 \
  --device cpu \
  --candidate-confidence 0.03 \
  --confidence 0.40 \
  --refine
```

Copy-Paste augmentation:

```bash
python -m error_pipeline.augment \
  --background-dir data/clean-papers \
  --symbol-dir data/red-symbols \
  --output-dir data/augmented \
  --count 2000
```

Keep a real, untouched validation set. Synthetic samples should improve recall but must not be used to report production accuracy.

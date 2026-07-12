# Train the exam grading-mark OBB model (legacy experiment)

The production grading detector now uses single-class YOLO Detect + SAHI. Do
not deploy checkpoints produced by this legacy OBB workflow to the OCR service.

[中文文档](README.zh-CN.md)

1. Initialize the dataset without duplicating the 91 source photos:

```bash
.venv-ocr/bin/python scripts/obb/prepare_dataset.py \
  --source /Users/zhuangzhineng/Downloads/试卷 \
  --output data/exam_marks_obb
```

2. Optionally generate high-confidence pseudo-labels, then review every image manually:

```bash
.venv-ocr/bin/python scripts/obb/bootstrap_labels.py \
  --dataset data/exam_marks_obb --min-confidence 0.60
```

Annotate every red error symbol as one tight rotated rectangle named `error_mark`. Keep correct ticks, scores, long red slashes, handwriting and circles as background unless they unambiguously mean an error. Empty reviewed images are valid negative samples. Pseudo-labels are drafts, not ground truth.

3. Export labels as Ultralytics YOLO OBB (`class x1 y1 x2 y2 x3 y3 x4 y4`) into the matching `labels/{split}` folder.

4. Validate labels:

```bash
.venv-ocr/bin/python scripts/obb/validate_labels.py --dataset data/exam_marks_obb
```

5. Train on Apple Silicon:

```bash
.venv-ocr/bin/python scripts/obb/train.py \
  --data data/exam_marks_obb/data.yaml \
  --device mps --epochs 180 --imgsz 1024 --batch 4
```

The checkpoint is written to `runs/exam-mark-obb/yolo11n/weights/best.pt`. Copy it to a stable model directory only after the untouched test split passes the required precision and recall thresholds.

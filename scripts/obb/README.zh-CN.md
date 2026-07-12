# 试卷批改符号 YOLO11-OBB 训练指南

> 历史实验方案：当前生产系统已改用单类别 YOLO Detect + SAHI。本目录仅用于复现实验，不要将这里的 OBB 权重接入 `ocr_service/grading.py`。

[English](README.md)

本目录提供从原始试卷照片、红叉伪标签、人工复核、标签质检到YOLO11-OBB训练和测试的完整工具链。

## 1. 环境准备

在项目根目录执行：

```bash
cd /Users/zhuangzhineng/Documents/ai_workspace/comeback
source .venv-ocr/bin/activate
pip install -r ocr_service/requirements.txt
```

训练脚本默认使用Apple Silicon的MPS；NVIDIA服务器可将`--device`改为`0`。

## 2. 初始化数据集

当前原始照片目录为：

```text
/Users/zhuangzhineng/Downloads/试卷
```

执行：

```bash
.venv-ocr/bin/python scripts/obb/prepare_dataset.py \
  --source /Users/zhuangzhineng/Downloads/试卷 \
  --output /Users/zhuangzhineng/Downloads/试卷标注_OBB
```

脚本默认创建软链接，不会重复复制原图。它会按整套试卷分组划分训练、验证和测试集，防止同一套试卷的相邻页泄漏到不同集合。

当前91张照片的划分结果为：

- 训练集：55张
- 验证集：20张
- 测试集：16张

目录结构：

```text
试卷标注_OBB/
├── data.yaml
├── manifest.json
├── images/
│   ├── train/
│   ├── val/
│   └── test/
└── labels/
    ├── train/
    ├── val/
    └── test/
```

## 3. 生成伪标签

为了减少从零画框的工作量，可以先用本地红色形状检测器生成高置信度OBB初稿：

```bash
.venv-ocr/bin/python scripts/obb/bootstrap_labels.py \
  --dataset /Users/zhuangzhineng/Downloads/试卷标注_OBB \
  --min-confidence 0.60 \
  --overwrite
```

重要：伪标签不是人工真值，不能未经复核直接训练生产模型。

## 4. 人工标注规范

类别只有一个：

```text
error_mark
```

应当标注：

- 明确表示答案错误的红叉。
- 明确表示该小题错误的半叉或批改符号。
- 与某道题直接关联的错误标记。

不应标注：

- 表示正确的红勾和长对勾。
- 分数、扣分数字本身。
- 老师书写的评语和订正答案。
- 贯穿多题的长红色斜线。
- 圈画、下划线和学生自己的红色笔迹。
- 不能确定含义的红色墨迹。

标注框要求：

- 使用旋转框紧贴符号主体，避免包含大块题干或手写答案。
- 四个角点应按符号方向排列，不能自相交。
- 同一符号只标一个框。
- 被窗口边缘截断且含义不明确的符号不标。
- 没有错误标记的图片应人工确认后保留空标签，它们是重要负样本。

Ultralytics OBB标签格式为：

```text
class_id x1 y1 x2 y2 x3 y3 x4 y4
```

坐标必须按图片宽高归一化到`0~1`。示例：

```text
0 0.260132 0.216657 0.221123 0.147599 0.313201 0.118343 0.352210 0.187401
```

推荐使用支持旋转框的Ultralytics Platform或CVAT进行人工复核，导出时选择Ultralytics YOLO OBB格式。

## 5. 标签质检

完成全部人工复核后执行严格校验：

```bash
.venv-ocr/bin/python scripts/obb/validate_labels.py \
  --dataset /Users/zhuangzhineng/Downloads/试卷标注_OBB
```

校验器会检查：

- 每张图片是否有对应标签文件。
- 每行是否包含类别和8个角点坐标。
- 类别是否为`0`。
- 坐标是否处于`0~1`。
- 验证集和测试集是否包含真实错误标记。

只有严格校验通过后才能开始训练。

## 6. Copy-Paste数据增强

从人工确认的清晰红叉中抠出透明PNG，放入符号目录；正常或无批改试卷放入背景目录：

```bash
PYTHONPATH=ocr_service .venv-ocr/bin/python -m error_pipeline.augment \
  --background-dir data/clean-papers \
  --symbol-dir data/red-symbols \
  --output-dir data/augmented \
  --count 2000 \
  --seed 42
```

增强数据只加入训练集，不得进入验证集和测试集。验证与测试必须保持100%真实照片。

## 7. 开始训练

Apple Silicon推荐命令：

```bash
.venv-ocr/bin/python scripts/obb/train.py \
  --data /Users/zhuangzhineng/Downloads/试卷标注_OBB/data.yaml \
  --model yolo11n-obb.pt \
  --device mps \
  --epochs 180 \
  --imgsz 1024 \
  --batch 4
```

如果内存不足，将`--batch`降为`2`；仍然不足时将`--imgsz`降为`768`。不建议直接降到`640`，因为填空题中的小红叉容易在缩放后丢失。

NVIDIA GPU示例：

```bash
.venv-ocr/bin/python scripts/obb/train.py \
  --data /Users/zhuangzhineng/Downloads/试卷标注_OBB/data.yaml \
  --device 0 \
  --epochs 180 \
  --imgsz 1024 \
  --batch 8
```

## 8. 训练产物

默认输出目录：

```text
runs/exam-mark-obb/yolo11n/
```

关键文件：

```text
weights/best.pt       验证集表现最好的权重
weights/last.pt       最后一个训练周期的权重
results.csv           每轮训练指标
results.png           训练曲线
confusion_matrix.png  混淆矩阵
test_metrics.json     独立测试集最终指标
```

中断后可以使用Ultralytics恢复训练：

```python
from ultralytics import YOLO

model = YOLO("runs/exam-mark-obb/yolo11n/weights/last.pt")
model.train(resume=True)
```

## 9. 上线验收标准

建议至少满足：

- 测试集Precision不低于`0.95`，优先控制误报。
- 测试集Recall不低于`0.85`。
- 验证集与测试集没有Copy-Paste生成图片。
- `2916.JPG`只识别`14(2)`、`14(4)`、`15`、`16`对应的错误标记。
- `2906.JPG`和`2907.JPG`等题目页不能误报错题。
- `2908.JPG`和`2909.JPG`答题卡中的红叉和扣分区域不能明显漏检。

如果Precision不足，应优先补充红勾、长斜线、红色分数和老师批注等困难负样本，而不是继续堆叠合成红叉。

## 10. 接入推理流水线

验收通过后，将权重复制到稳定目录：

```bash
mkdir -p ocr_service/models
cp runs/exam-mark-obb/yolo11n/weights/best.pt \
  ocr_service/models/error_mark_yolo11n_obb.pt
```

调用企业级OBB流水线：

```bash
PYTHONPATH=ocr_service .venv-ocr/bin/python -m error_pipeline.cli \
  --image /absolute/path/paper.jpg \
  --ocr-json /absolute/path/ocr.json \
  --model ocr_service/models/error_mark_yolo11n_obb.pt \
  --output-dir output/error-pipeline/run-001 \
  --device mps \
  --slice-size 640 \
  --overlap 0.2 \
  --refine
```

推理采用SAHI滑窗和多边形NMS；YOLO只负责定位错误符号，题号归属、切图和内容解析分别由几何模块与MiniMax处理。

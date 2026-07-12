from __future__ import annotations

import argparse
import json
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser(description="Train and validate a YOLO11-OBB grading-mark detector")
    parser.add_argument("--data", type=Path, required=True); parser.add_argument("--model", default="yolo11n-obb.pt")
    parser.add_argument("--device", default="mps"); parser.add_argument("--epochs", type=int, default=180)
    parser.add_argument("--imgsz", type=int, default=1024); parser.add_argument("--batch", type=int, default=4)
    parser.add_argument("--project", type=Path, default=Path("runs/exam-mark-obb")); parser.add_argument("--name", default="yolo11n")
    args = parser.parse_args()
    if not args.data.is_file(): raise SystemExit(f"data.yaml not found: {args.data}")
    from ultralytics import YOLO
    model = YOLO(args.model)
    model.train(data=str(args.data), epochs=args.epochs, imgsz=args.imgsz, batch=args.batch, device=args.device,
                workers=2, patience=40, save_period=10, cache="disk", seed=42, deterministic=True,
                hsv_h=0.05, hsv_s=0.6, hsv_v=0.4, degrees=15, scale=0.35, translate=0.08,
                fliplr=0.0, flipud=0.0, mosaic=0.25, close_mosaic=15, project=str(args.project), name=args.name)
    best = args.project / args.name / "weights" / "best.pt"
    if not best.is_file(): raise SystemExit(f"Training completed but best.pt was not found: {best}")
    metrics = YOLO(str(best)).val(data=str(args.data), split="test", imgsz=args.imgsz, device=args.device)
    summary = {"best": str(best.resolve()), "map50_95": float(metrics.box.map), "map50": float(metrics.box.map50),
               "map75": float(metrics.box.map75)}
    (args.project / args.name / "test_metrics.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()

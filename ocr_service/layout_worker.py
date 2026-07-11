import json
import sys

from ultralytics import YOLO


CLASS_NAMES = {
    0: "student_id",
    1: "subjective_question",
    2: "fillin_question",
    3: "objective_question",
}


def main() -> None:
    model_path, image_path, confidence, image_size = sys.argv[1:5]
    model = YOLO(model_path)
    result = model.predict(
        image_path,
        imgsz=int(image_size),
        conf=float(confidence),
        verbose=False,
    )[0]
    regions = []
    for box in result.boxes:
        class_id = int(box.cls.item())
        regions.append(
            {
                "regionType": CLASS_NAMES.get(class_id, str(result.names.get(class_id, "unknown"))),
                "bbox": [round(float(value), 2) for value in box.xyxy[0].tolist()],
                "confidence": round(float(box.conf.item()), 4),
                "source": "ocrautoscore-yolov8",
            }
        )
    print(json.dumps(regions, ensure_ascii=True))


if __name__ == "__main__":
    main()

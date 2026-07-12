import json
import sys

from sahi import AutoDetectionModel
from sahi.predict import get_sliced_prediction


def main() -> None:
    if len(sys.argv) != 10:
        raise SystemExit(
            "usage: grading_worker.py MODEL IMAGE DEVICE CANDIDATE_CONF FINAL_CONF AUTO_CONF SLICE_SIZE OVERLAP NMS_IOU"
        )

    model_path, image_path, device = sys.argv[1:4]
    candidate_confidence = float(sys.argv[4])
    final_confidence = float(sys.argv[5])
    auto_confidence = float(sys.argv[6])
    slice_size = int(sys.argv[7])
    overlap = float(sys.argv[8])
    nms_iou = float(sys.argv[9])

    model = AutoDetectionModel.from_pretrained(
        model_type="ultralytics",
        model_path=model_path,
        confidence_threshold=candidate_confidence,
        device=device,
        image_size=slice_size,
    )
    result = get_sliced_prediction(
        image_path,
        model,
        slice_height=slice_size,
        slice_width=slice_size,
        overlap_height_ratio=overlap,
        overlap_width_ratio=overlap,
        postprocess_type="NMS",
        postprocess_match_metric="IOU",
        postprocess_match_threshold=nms_iou,
        verbose=0,
    )
    marks = []
    for prediction in result.object_prediction_list:
        confidence = float(prediction.score.value)
        if confidence < final_confidence or prediction.category.name != "error_mark":
            continue
        marks.append(
            {
                "markType": "cross" if confidence >= auto_confidence else "question",
                "bbox": [float(value) for value in prediction.bbox.to_xyxy()],
                "confidence": confidence,
                "source": "yolo-error-mark" if confidence >= auto_confidence else "yolo-error-mark-review",
                "model": "yolo26n-hard-v2",
                "requiresManualReview": confidence < auto_confidence,
            }
        )
    print(json.dumps(marks[:120], ensure_ascii=False))


if __name__ == "__main__":
    main()

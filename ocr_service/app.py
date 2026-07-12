import os
import logging
from io import BytesIO
from threading import Lock

from flask import Flask, jsonify, request, send_from_directory
from PIL import Image

from debug_artifacts import debug_artifacts_enabled, get_debug_output_dir, write_debug_artifacts
from grading import detect_grading_marks, grading_detector_available, scale_grading_marks
from layout import detect_answer_sheet_layout, layout_detector_available
from marks import detect_red_marks
from normalization import normalize_paddle_result

app = Flask(__name__)
_ocr_engine = None
_ocr_engine_lock = Lock()
_ocr_call_lock = Lock()


def get_ocr_engine():
    global _ocr_engine
    with _ocr_engine_lock:
        if _ocr_engine is not None:
            return _ocr_engine

        try:
            from paddleocr import PaddleOCR
        except ImportError as exc:
            raise RuntimeError(
                "paddleocr is not installed. Install ocr_service/requirements.txt and a matching paddlepaddle wheel."
            ) from exc

        _ocr_engine = PaddleOCR(
            use_angle_cls=True,
            lang=os.getenv("OCR_LANG", "ch"),
            show_log=os.getenv("OCR_SHOW_LOG", "false").lower() == "true",
        )
        return _ocr_engine


def prepare_image_for_ocr(image: Image.Image) -> Image.Image:
    max_side = int(os.getenv("OCR_MAX_SIDE", "1800"))
    if max_side <= 0:
        return image

    width, height = image.size
    longest = max(width, height)
    if longest <= max_side:
        return image

    scale = max_side / longest
    next_size = (max(1, int(width * scale)), max(1, int(height * scale)))
    return image.resize(next_size, Image.Resampling.LANCZOS)


@app.get("/health")
def health():
    return jsonify({
        "ok": True,
        "service": "private-tutor-ocr",
        "engine": "paddleocr",
        "layoutDetector": "ocrautoscore-yolov8" if layout_detector_available() else "disabled",
        "gradingDetector": "yolo26n-hard-v2-sahi" if grading_detector_available() else "red-ink-fallback",
    })


@app.get("/debug-artifacts/<path:filename>")
def debug_artifact(filename):
    return send_from_directory(get_debug_output_dir(), filename)


@app.post("/ocr")
def ocr():
    uploaded = request.files.get("image")
    if uploaded is None:
        return jsonify({"success": False, "error": "missing image form field"}), 400

    try:
        analysis_image = Image.open(BytesIO(uploaded.read())).convert("RGB")
        image = prepare_image_for_ocr(analysis_image)
    except Exception as exc:
        return jsonify({"success": False, "error": f"invalid image: {exc}"}), 400

    detection_image = analysis_image
    original_uploaded = request.files.get("originalImage")
    if original_uploaded is not None:
        try:
            detection_image = Image.open(BytesIO(original_uploaded.read())).convert("RGB")
        except Exception:
            app.logger.warning("Original image could not be decoded for YOLO; using the analysis JPEG instead")

    try:
        import numpy as np

        with _ocr_call_lock:
            raw_result = get_ocr_engine().ocr(np.array(image), cls=True)
    except RuntimeError as exc:
        app.logger.exception("OCR runtime setup failed")
        return jsonify({"success": False, "error": str(exc)}), 503
    except Exception as exc:
        app.logger.exception("OCR engine failed")
        return jsonify({"success": False, "error": f"ocr failed: {exc}"}), 500

    try:
        layout_regions = detect_answer_sheet_layout(image)
    except Exception:
        app.logger.exception("Answer-sheet layout detection failed; continuing with full-page OCR")
        layout_regions = []

    detected_marks = []
    try:
        detected_marks = detect_grading_marks(detection_image)
        grading_marks = scale_grading_marks(detected_marks, detection_image.size, image.size)
    except Exception:
        app.logger.exception("YOLO grading-mark detection failed; using red-ink fallback")
        grading_marks = detect_red_marks(image)

    payload = normalize_paddle_result(raw_result, grading_marks=grading_marks)
    payload["layoutRegions"] = layout_regions
    payload["pageRoleHint"] = "answer_sheet" if layout_regions else "unknown"
    payload["filename"] = uploaded.filename
    debug_requested = request.form.get("debug")
    if debug_artifacts_enabled(debug_requested):
        payload["debugArtifacts"] = write_debug_artifacts(
            filename=uploaded.filename,
            analysis_image=image,
            detection_image=detection_image,
            layout_regions=layout_regions,
            original_marks=detected_marks,
            scaled_marks=grading_marks,
        )
    return jsonify(payload)


if __name__ == "__main__":
    logging.basicConfig(level=os.getenv("OCR_LOG_LEVEL", "INFO"))
    host = os.getenv("OCR_HOST", "127.0.0.1")
    port = int(os.getenv("OCR_PORT", "5005"))
    app.run(host=host, port=port)

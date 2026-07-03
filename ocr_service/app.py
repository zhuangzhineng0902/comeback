import os
from io import BytesIO

from flask import Flask, jsonify, request
from PIL import Image

from normalization import normalize_paddle_result

app = Flask(__name__)
_ocr_engine = None


def get_ocr_engine():
    global _ocr_engine
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
    return jsonify({"ok": True, "service": "private-tutor-ocr", "engine": "paddleocr"})


@app.post("/ocr")
def ocr():
    uploaded = request.files.get("image")
    if uploaded is None:
        return jsonify({"success": False, "error": "missing image form field"}), 400

    try:
        image = prepare_image_for_ocr(Image.open(BytesIO(uploaded.read())).convert("RGB"))
    except Exception as exc:
        return jsonify({"success": False, "error": f"invalid image: {exc}"}), 400

    try:
        import numpy as np

        raw_result = get_ocr_engine().ocr(np.array(image), cls=True)
    except RuntimeError as exc:
        return jsonify({"success": False, "error": str(exc)}), 503
    except Exception as exc:
        return jsonify({"success": False, "error": f"ocr failed: {exc}"}), 500

    payload = normalize_paddle_result(raw_result)
    payload["filename"] = uploaded.filename
    return jsonify(payload)


if __name__ == "__main__":
    host = os.getenv("OCR_HOST", "127.0.0.1")
    port = int(os.getenv("OCR_PORT", "5005"))
    app.run(host=host, port=port)

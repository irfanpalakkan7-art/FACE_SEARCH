"""Local browser interface for the AI Webcam Detector."""

from __future__ import annotations

import atexit
import base64
import csv
import threading
import time
import webbrowser
from collections import deque

import cv2
import numpy as np
from flask import Flask, jsonify, request, send_file

from main import LOG_PATH, PROJECT_ROOT, WebcamDetector


MAX_FRAME_BYTES = 4 * 1024 * 1024
detector = WebcamDetector()
inference_lock = threading.Lock()
app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = MAX_FRAME_BYTES


def close_detector() -> None:
    detector.optional.close()


atexit.register(close_detector)


@app.get("/")
def index():
    return send_file(PROJECT_ROOT / "index.html", mimetype="text/html")


@app.get("/api/status")
def status():
    return jsonify(
        {
            "model_ready": detector.model is not None,
            "model_error": detector.model_error,
            "confidence": detector.confidence_threshold,
            "logging": detector.logger.enabled,
            "sound": detector.sound_enabled,
            "face_mesh": detector.optional.face_mesh_available,
            "pose": detector.optional.pose_available,
        }
    )


@app.post("/api/detect")
def detect():
    upload = request.files.get("frame")
    if upload is None:
        return jsonify({"error": "Send a webcam image using the 'frame' form field."}), 400

    raw = upload.read(MAX_FRAME_BYTES + 1)
    if not raw:
        return jsonify({"error": "The uploaded webcam image is empty."}), 400
    if len(raw) > MAX_FRAME_BYTES:
        return jsonify({"error": "The webcam image is too large."}), 413

    frame = cv2.imdecode(np.frombuffer(raw, dtype=np.uint8), cv2.IMREAD_COLOR)
    if frame is None:
        return jsonify({"error": "The uploaded file is not a supported image."}), 400

    if not inference_lock.acquire(blocking=False):
        return jsonify({"error": "A frame is already being processed. Please retry shortly."}), 429

    try:
        started_at = time.perf_counter()
        annotated = detector.process_frame(frame)
        inference_ms = round((time.perf_counter() - started_at) * 1000, 1)
    except Exception as exc:
        app.logger.exception("Frame detection failed")
        return jsonify({"error": f"Frame detection failed: {exc}"}), 500
    finally:
        inference_lock.release()

    encoded_ok, encoded = cv2.imencode(".jpg", annotated, [cv2.IMWRITE_JPEG_QUALITY, 82])
    if not encoded_ok:
        return jsonify({"error": "Could not encode the annotated webcam frame."}), 500

    analysis = detector.last_analysis
    return jsonify(
        {
            **analysis,
            "inference_ms": inference_ms,
            "image": base64.b64encode(encoded.tobytes()).decode("ascii"),
        }
    )


@app.post("/api/settings")
def settings():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify({"error": "Settings must be sent as a JSON object."}), 400

    if "confidence" in payload:
        try:
            confidence = float(payload["confidence"])
        except (TypeError, ValueError):
            return jsonify({"error": "Confidence must be a number between 0.1 and 0.95."}), 400
        if not 0.1 <= confidence <= 0.95:
            return jsonify({"error": "Confidence must be between 0.1 and 0.95."}), 400
        detector.confidence_threshold = confidence

    if "sound" in payload:
        if not isinstance(payload["sound"], bool):
            return jsonify({"error": "Sound setting must be true or false."}), 400
        detector.sound_enabled = payload["sound"]

    return jsonify(
        {
            "confidence": detector.confidence_threshold,
            "sound": detector.sound_enabled,
        }
    )


@app.post("/api/logging")
def toggle_logging():
    enabled = detector.logger.toggle()
    if enabled:
        try:
            detector.logger.write_manual("LOGGING_STATUS", "enabled=True")
        except OSError as exc:
            app.logger.exception("Could not write logging status")
            return jsonify({"error": f"Could not write the event log: {exc}"}), 500
    return jsonify({"logging": enabled})


@app.post("/api/screenshot")
def screenshot():
    upload = request.files.get("frame")
    if upload is None:
        return jsonify({"error": "Send an annotated frame using the 'frame' form field."}), 400
    raw = upload.read(MAX_FRAME_BYTES + 1)
    if not raw:
        return jsonify({"error": "The screenshot image is empty."}), 400
    if len(raw) > MAX_FRAME_BYTES:
        return jsonify({"error": "The screenshot image is too large."}), 413

    frame = cv2.imdecode(np.frombuffer(raw, dtype=np.uint8), cv2.IMREAD_COLOR)
    if frame is None:
        return jsonify({"error": "The screenshot is not a supported image."}), 400

    if not detector.save_screenshot(frame):
        return jsonify({"error": "The screenshot could not be saved. Check folder permissions."}), 500
    saved_path = detector.last_screenshot_path
    return jsonify({"saved": True, "filename": saved_path.name if saved_path else ""})


@app.get("/api/events")
def events():
    if not LOG_PATH.exists():
        return jsonify({"events": []})

    try:
        with LOG_PATH.open("r", encoding="utf-8-sig", newline="") as csv_file:
            rows = deque(csv.DictReader(csv_file), maxlen=12)
    except OSError as exc:
        app.logger.exception("Could not read event log")
        return jsonify({"error": f"Could not read the event log: {exc}"}), 500
    return jsonify({"events": list(reversed(rows))})


@app.get("/api/events.csv")
def download_events():
    if not LOG_PATH.exists():
        return jsonify({"error": "The event log file does not exist yet."}), 404
    return send_file(LOG_PATH, as_attachment=True, download_name="webcam-events.csv", mimetype="text/csv")


@app.errorhandler(413)
def request_too_large(_error):
    return jsonify({"error": "The uploaded file is too large."}), 413


def main() -> None:
    print("AI Webcam Detector web dashboard")
    print("Open http://127.0.0.1:5000 in your browser.")
    print("Camera access and image processing stay on this computer.")
    threading.Timer(1.5, lambda: webbrowser.open("http://127.0.0.1:5000")).start()
    app.run(host="127.0.0.1", port=5000, debug=False, threaded=True)


if __name__ == "__main__":
    main()

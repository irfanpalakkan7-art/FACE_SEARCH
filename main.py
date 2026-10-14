"""AI Webcam Detector demo for a Windows laptop with optional MediaPipe cues.

This project is designed as a beginner-friendly local webcam detection app.
It shows a live camera feed, detects faces and objects, logs meaningful events,
and allows saving screenshots manually.
"""

from __future__ import annotations

import csv
import threading
import time
from datetime import datetime
from pathlib import Path

try:
    import cv2
    import numpy as np
except ImportError as exc:
    raise SystemExit(
        "OpenCV is missing. Install the project requirements before running this app."
    ) from exc

try:
    from ultralytics import YOLO
except ImportError:  # pragma: no cover - ultralytics is optional during import
    YOLO = None

try:
    import mediapipe as mp
except ImportError:  # pragma: no cover - optional feature
    mp = None

try:
    import winsound
except ImportError:  # pragma: no cover - Windows only
    winsound = None


PROJECT_ROOT = Path(__file__).resolve().parent
LOG_DIR = PROJECT_ROOT / "logs"
LOG_PATH = LOG_DIR / "events.csv"
SCREENSHOT_DIR = PROJECT_ROOT / "screenshots"
MODELS_DIR = PROJECT_ROOT / "models"


def ensure_project_files() -> None:
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    SCREENSHOT_DIR.mkdir(parents=True, exist_ok=True)
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    if not LOG_PATH.exists():
        with LOG_PATH.open("w", encoding="utf-8", newline="") as csv_file:
            writer = csv.writer(csv_file)
            writer.writerow(["timestamp", "event", "details"])


class EventLogger:
    def __init__(self, path: Path, enabled: bool = True):
        self.path = path
        self.enabled = enabled
        self.state: dict[str, bool] = {}

    def toggle(self) -> bool:
        self.enabled = not self.enabled
        return self.enabled

    def update(self, name: str, active: bool, details: str = "") -> None:
        previous = self.state.get(name)
        if previous == active:
            return
        self.state[name] = active
        if not self.enabled or (previous is None and not active):
            return
        status = "STARTED" if active else "CLEARED"
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        with self.path.open("a", encoding="utf-8", newline="") as csv_file:
            writer = csv.writer(csv_file)
            writer.writerow([timestamp, f"{name}:{status}", details])

    def write_manual(self, event_name: str, details: str = "") -> None:
        if not self.enabled:
            return
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        with self.path.open("a", encoding="utf-8", newline="") as csv_file:
            writer = csv.writer(csv_file)
            writer.writerow([timestamp, event_name, details])


class OptionalMediaPipe:
    def __init__(self):
        self.face_mesh = None
        self.pose = None
        self.face_mesh_available = False
        self.pose_available = False
        self.eye_closure_start = None

        if mp is None:
            return

        try:
            self.face_mesh = mp.solutions.face_mesh.FaceMesh(
                static_image_mode=False,
                max_num_faces=1,
                min_detection_confidence=0.5,
                min_tracking_confidence=0.5,
            )
            self.face_mesh_available = True
        except Exception:
            self.face_mesh_available = False

        try:
            self.pose = mp.solutions.pose.Pose(
                static_image_mode=False,
                model_complexity=1,
                min_detection_confidence=0.5,
                min_tracking_confidence=0.5,
            )
            self.pose_available = True
        except Exception:
            self.pose_available = False

    def close(self) -> None:
        if self.face_mesh is not None:
            self.face_mesh.close()
        if self.pose is not None:
            self.pose.close()

    def eye_closure_status(self, frame: np.ndarray, face_rectangles: list[tuple[int, int, int, int]]) -> tuple[bool, str]:
        if self.face_mesh is None or not self.face_mesh_available or not face_rectangles:
            self.eye_closure_start = None
            return False, ""

        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        result = self.face_mesh.process(rgb)
        if result.multi_face_landmarks is None:
            self.eye_closure_start = None
            return False, ""

        landmarks = result.multi_face_landmarks[0].landmark
        if len(landmarks) < 468:
            self.eye_closure_start = None
            return False, ""

        left_eye = [landmarks[i] for i in (133, 159, 145, 153, 144)]
        right_eye = [landmarks[i] for i in (362, 386, 374, 381, 380)]

        def vertical_distance(points):
            ys = [p.y for p in points]
            return max(ys) - min(ys)

        left_v = vertical_distance(left_eye)
        right_v = vertical_distance(right_eye)
        left_h = abs(left_eye[0].x - left_eye[3].x)
        right_h = abs(right_eye[0].x - right_eye[3].x)
        if left_h <= 0 or right_h <= 0:
            self.eye_closure_start = None
            return False, ""

        left_ratio = left_v / left_h
        right_ratio = right_v / right_h
        eye_ratio = (left_ratio + right_ratio) / 2.0
        if eye_ratio < 0.16:
            if self.eye_closure_start is None:
                self.eye_closure_start = time.time()
            if time.time() - self.eye_closure_start >= 1.2:
                return True, "Prolonged eye closure cue"
            return False, ""

        self.eye_closure_start = None
        return False, ""

    def posture_cues(self, frame: np.ndarray) -> list[str]:
        if self.pose is None or not self.pose_available:
            return []

        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        result = self.pose.process(rgb)
        if result.pose_landmarks is None:
            return []

        lm = result.pose_landmarks.landmark
        cues: list[str] = []

        def visible(index: int) -> bool:
            return lm[index].visibility is not None and lm[index].visibility > 0.5

        nose = lm[0]
        left_shoulder = lm[11]
        right_shoulder = lm[12]

        if visible(0) and visible(11) and visible(12):
            shoulder_y = (left_shoulder.y + right_shoulder.y) / 2.0
            if nose.y > shoulder_y + 0.06:
                cues.append("Head-down posture cue")
            shoulder_center_x = (left_shoulder.x + right_shoulder.x) / 2.0
            if abs(nose.x - shoulder_center_x) > 0.12:
                cues.append("Leaning or off-center posture cue")

        if visible(23) and visible(24) and visible(11) and visible(12):
            left_hip = lm[23]
            right_hip = lm[24]
            hip_y = (left_hip.y + right_hip.y) / 2.0
            shoulder_y = (left_shoulder.y + right_shoulder.y) / 2.0
            if hip_y > shoulder_y + 0.08:
                cues.append("Possible slouch or lean cue")

        return cues


class WebcamDetector:
    def __init__(self):
        ensure_project_files()
        self.logger = EventLogger(LOG_PATH, enabled=True)
        self.optional = OptionalMediaPipe()
        self.capture = None
        self.frame_width = 640
        self.frame_height = 480
        self.fps = 0.0
        self.paused = False
        self.model = None
        self.model_error = ""
        self.sound_enabled = True
        self.last_alert_time = 0.0
        self.alert_cooldown = 2.0
        self.alert_lock = threading.Lock()
        self.confidence_threshold = 0.35
        self.last_screenshot_path: Path | None = None
        self.message_text = ""
        self.message_until = 0.0
        self.face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
        if self.face_cascade.empty():
            self.face_cascade = None
            self.message_text = "Face detection unavailable: cascade failed to load"
            self.message_until = time.time() + 2.0

        self.model = self.load_yolo_model()
        if self.model is None:
            print(f"YOLO model could not load: {self.model_error}")
        self.event_state: dict[str, bool] = {}
        self.event_candidates: dict[str, tuple[bool, float]] = {}
        self.event_debounce_seconds = 0.4
        self.last_analysis = {
            "face_count": 0,
            "person_count": 0,
            "phone_count": 0,
            "book_count": 0,
            "events": [],
            "detections": [],
            "face_mesh_available": self.optional.face_mesh_available,
            "pose_available": self.optional.pose_available,
        }

    def show_message(self, text: str, seconds: float = 1.5) -> None:
        self.message_text = text
        self.message_until = time.time() + seconds

    def load_yolo_model(self):
        if YOLO is None:
            self.model_error = "Ultralytics is not installed. Run pip install -r requirements.txt"
            return None
        try:
            model = YOLO("yolov8n.pt")
            self.model_error = ""
            return model
        except Exception as exc:  # pragma: no cover - network/download can fail
            self.model_error = str(exc)
            return None

    def open_camera(self) -> bool:
        for idx in (0, 1):
            cap = cv2.VideoCapture(idx)
            if cap.isOpened():
                cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.frame_width)
                cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.frame_height)
                self.capture = cap
                print(f"Webcam opened on index {idx}.")
                return True
            cap.release()
        print("No webcam found on index 0 or 1.")
        return False

    def toggle_logging(self) -> None:
        enabled = self.logger.toggle()
        self.logger.write_manual("LOGGING_STATUS", f"enabled={enabled}")
        self.show_message(f"Logging {'enabled' if enabled else 'disabled'}")
        print(f"Event logging is now {'enabled' if enabled else 'disabled'}.")

    def trigger_alert(self, event_name: str) -> None:
        if not self.sound_enabled:
            return
        now = time.time()
        with self.alert_lock:
            if now - self.last_alert_time < self.alert_cooldown:
                return
            self.last_alert_time = now

        def play_sound() -> None:
            try:
                if winsound is not None:
                    winsound.Beep(900, 180)
                else:
                    print(f"Alert: {event_name}")
            except Exception as exc:
                print(f"Alert sound unsupported: {exc}")

        threading.Thread(target=play_sound, daemon=True).start()

    def _log_event(self, name: str, active: bool, details: str = "") -> None:
        previous = self.event_state.get(name, False)
        if previous == active:
            self.event_candidates.pop(name, None)
            return

        now = time.monotonic()
        candidate = self.event_candidates.get(name)
        if candidate is None or candidate[0] != active:
            self.event_candidates[name] = (active, now)
            return

        if now - candidate[1] < self.event_debounce_seconds:
            return

        self.event_candidates.pop(name, None)
        self.event_state[name] = active
        self.logger.update(name, active, details)
        if active:
            self.trigger_alert(name)

    def save_screenshot(self, frame: np.ndarray) -> bool:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
        path = SCREENSHOT_DIR / f"webcam_{timestamp}.png"
        try:
            ok = cv2.imwrite(str(path), frame)
            if ok:
                self.last_screenshot_path = path
                self.show_message(f"Saved screenshot: {path.name}")
                print(f"Screenshot saved to: {path}")
                return True
            print(f"Failed to save screenshot to {path}")
            return False
        except Exception as exc:
            print(f"Screenshot save error: {exc}")
            self.show_message("Screenshot save failed")
            return False

    def detect_faces(self, gray_frame: np.ndarray) -> list[tuple[int, int, int, int]]:
        if self.face_cascade is None:
            return []
        faces = self.face_cascade.detectMultiScale(
            gray_frame,
            scaleFactor=1.1,
            minNeighbors=5,
            minSize=(30, 30),
            flags=cv2.CASCADE_SCALE_IMAGE,
        )
        return [(int(x), int(y), int(w), int(h)) for x, y, w, h in faces]

    def detect_objects(self, frame: np.ndarray) -> list[dict]:
        if self.model is None:
            return []
        try:
            results = self.model(
                frame,
                conf=self.confidence_threshold,
                verbose=False,
            )
        except Exception as exc:
            print(f"YOLO inference error: {exc}")
            return []

        detections: list[dict] = []
        for result in results:
            names = getattr(result, "names", {})
            for det in result.boxes:
                cls_id = int(det.cls.item())
                conf = float(det.conf.item())
                x1, y1, x2, y2 = det.xyxy[0].tolist()
                label = names.get(cls_id, str(cls_id))
                detections.append(
                    {
                        "label": label,
                        "confidence": conf,
                        "bbox": (int(x1), int(y1), int(x2), int(y2)),
                    }
                )
        return detections

    def overlap(self, rect_a: tuple[int, int, int, int], rect_b: tuple[int, int, int, int]) -> bool:
        x1_a, y1_a, w_a, h_a = rect_a
        x2_a = x1_a + w_a
        y2_a = y1_a + h_a
        x1_b, y1_b, w_b, h_b = rect_b
        x2_b = x1_b + w_b
        y2_b = y1_b + h_b

        overlap_w = max(0, min(x2_a, x2_b) - max(x1_a, x1_b))
        overlap_h = max(0, min(y2_a, y2_b) - max(y1_a, y1_b))
        overlap_area = overlap_w * overlap_h
        area_a = w_a * h_a
        area_b = w_b * h_b
        return overlap_area > 0 and (overlap_area / max(area_a, area_b)) > 0.02

    def draw_boxes(self, frame: np.ndarray, faces: list[tuple[int, int, int, int]], detections: list[dict]) -> tuple[int, int, int]:
        face_count = 0
        for x, y, w, h in faces:
            face_count += 1
            cv2.rectangle(frame, (x, y), (x + w, y + h), (0, 255, 0), 2)
            cv2.putText(frame, "Face", (x, y - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)

        person_count = 0
        phone_count = 0
        book_count = 0
        for det in detections:
            label = det["label"].lower()
            conf = det["confidence"]
            x1, y1, x2, y2 = det["bbox"]
            if label == "person":
                person_count += 1
                color = (0, 165, 255)
            elif "phone" in label:
                phone_count += 1
                color = (255, 255, 0)
            elif "book" in label:
                book_count += 1
                color = (147, 20, 255)
            else:
                color = (128, 128, 128)

            cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
            text = f"{label} {conf:.2f}"
            cv2.putText(frame, text, (x1, max(0, y1 - 10)), cv2.FONT_HERSHEY_SIMPLEX, 0.45, color, 2)

        return person_count, phone_count, book_count

    def draw_status(self, frame: np.ndarray, face_count: int, person_count: int, phone_count: int, book_count: int, fps: float, current_events: list[str]) -> None:
        cv2.putText(frame, "AI Webcam Detector", (20, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2)
        cv2.putText(frame, f"Webcam: {'OK' if self.capture is not None and self.capture.isOpened() else 'Unavailable'}", (20, 48), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
        cv2.putText(frame, f"Face count: {face_count}", (20, 74), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
        cv2.putText(frame, f"Person count: {person_count}", (20, 100), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
        cv2.putText(frame, f"Cell phone count: {phone_count}", (20, 126), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
        cv2.putText(frame, f"Book count: {book_count}", (20, 152), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
        cv2.putText(frame, f"FPS: {fps:.1f}", (20, 178), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
        cv2.putText(frame, f"Logging: {'ON' if self.logger.enabled else 'OFF'}", (20, 204), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
        cv2.putText(frame, f"YOLO: {'ready' if self.model is not None else 'unavailable'}", (20, 230), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
        cv2.putText(frame, f"Optional: {'MediaPipe available' if self.optional.face_mesh_available or self.optional.pose_available else 'MediaPipe unavailable'}", (20, 256), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
        if current_events:
            events_text = ", ".join(current_events[:4])
            cv2.putText(frame, f"Current events: {events_text}", (20, 282), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 255, 255), 1)
        cv2.putText(frame, "Controls: Q quit | P pause | S screenshot | L logging", (20, frame.shape[0] - 20), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)

    def update_detection_events(self, face_count: int, person_count: int, faces: list[tuple[int, int, int, int]], detections: list[dict], posture_cues: list[str], eye_message: str) -> list[str]:
        current: list[str] = []

        no_face = face_count == 0
        self._log_event("No face detected", no_face, "Face detection found none in the current frame")
        if no_face:
            current.append("No face detected")

        multiple_people = person_count > 1
        self._log_event("Multiple people detected", multiple_people, f"person_count={person_count}")
        if multiple_people:
            current.append("Multiple people detected")

        overlap_detected = False
        for face_rect in faces:
            for det in detections:
                label = det["label"].lower()
                if label not in {"book", "cell phone"}:
                    continue
                if self.overlap(face_rect, det["bbox"]):
                    overlap_detected = True
                    break
            if overlap_detected:
                break
        self._log_event("Possible face obstruction", overlap_detected, "Detected overlap between face and object box")
        if overlap_detected:
            current.append("Possible face obstruction")

        if eye_message:
            self._log_event("Prolonged eye closure cue", True, eye_message)
            current.append("Prolonged eye closure cue")
        else:
            self._log_event("Prolonged eye closure cue", False, "Eyes open or landmarks unavailable")

        all_posture_cues = [
            "Head-down posture cue",
            "Leaning or off-center posture cue",
            "Possible slouch or lean cue",
        ]
        active_posture = set(posture_cues)
        for cue in all_posture_cues:
            is_active = cue in active_posture
            self._log_event(cue, is_active, "Approximate posture cue")
            if is_active:
                current.append(cue)

        return [name for name, active in self.event_state.items() if active]

    def process_frame(self, frame: np.ndarray) -> np.ndarray:
        display = cv2.flip(frame.copy(), 1)
        gray = cv2.cvtColor(display, cv2.COLOR_BGR2GRAY)
        faces = self.detect_faces(gray)
        detections = self.detect_objects(display)
        person_count, phone_count, book_count = self.draw_boxes(display, faces, detections)

        eye_message = ""
        if self.optional.face_mesh_available:
            eye_active, eye_message = self.optional.eye_closure_status(display, faces)
            if eye_active:
                eye_message = "Prolonged eye closure cue"

        posture_cues = self.optional.posture_cues(display) if self.optional.pose_available else []
        current_events = self.update_detection_events(len(faces), person_count, faces, detections, posture_cues, eye_message)
        self.last_analysis = {
            "face_count": len(faces),
            "person_count": person_count,
            "phone_count": phone_count,
            "book_count": book_count,
            "events": current_events,
            "detections": [
                {
                    "label": item["label"],
                    "confidence": round(item["confidence"], 3),
                }
                for item in detections
            ],
            "face_mesh_available": self.optional.face_mesh_available,
            "pose_available": self.optional.pose_available,
        }

        if len(faces) == 0:
            cv2.putText(display, "No face detected", (20, 90), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 255), 2)
        if eye_message:
            cv2.putText(display, eye_message, (20, 110), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 255), 2)
        for i, cue in enumerate(posture_cues[:2]):
            cv2.putText(display, cue, (20, 130 + 20 * i), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 0), 2)

        self.draw_status(display, len(faces), person_count, phone_count, book_count, self.fps, current_events)

        if time.time() < self.message_until and self.message_text:
            cv2.putText(display, self.message_text, (20, display.shape[0] - 12), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 1)

        return display

    def run(self) -> int:
        print("AI Webcam Detector starting...")
        print("Controls: Q quit, P pause/resume, S save screenshot, L toggle logging")
        print("Detections may be incorrect for far-away, partially hidden, or partially visible faces.")

        if not self.open_camera():
            print("No webcam available. Please connect a camera and try again.")
            return 1

        start_time = time.time()
        frame_count = 0
        try:
            while True:
                ret, frame = self.capture.read()
                if not ret or frame is None:
                    print("Webcam read failed. The camera may be disconnected.")
                    self.show_message("Webcam read failed", 1.5)
                    time.sleep(0.2)
                    continue

                frame_count += 1
                if not self.paused:
                    elapsed = max(1.0, time.time() - start_time)
                    self.fps = frame_count / elapsed
                    display = self.process_frame(frame)
                else:
                    display = cv2.flip(frame.copy(), 1)
                    cv2.putText(display, "Paused", (20, 40), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (255, 255, 255), 2)
                    cv2.putText(display, "Press P to resume", (20, 70), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
                    self.fps = 0.0

                cv2.imshow("AI Webcam Detector", display)
                key = cv2.waitKey(1) & 0xFF

                if key == ord("q"):
                    break
                if key == ord("p"):
                    self.paused = not self.paused
                    self.show_message("Paused" if self.paused else "Resumed")
                if key == ord("s"):
                    self.save_screenshot(display)
                if key == ord("l"):
                    self.toggle_logging()

        finally:
            if self.capture is not None:
                self.capture.release()
            cv2.destroyAllWindows()
            self.optional.close()
            print("Camera released cleanly. Application closed.")

        return 0


def main() -> int:
    print("AI_Webcam_Detector")
    print("This demo runs locally without uploading webcam frames to any external service.")
    detector = WebcamDetector()
    return detector.run()


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        print("Program interrupted by user.")
        raise SystemExit(0)
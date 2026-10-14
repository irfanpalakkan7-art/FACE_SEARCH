# AI Webcam Detector

A local-only computer-vision demo with a clean browser dashboard. The browser
accesses your webcam, sends frames to the Python app on your own computer, and
shows the annotated results. The application binds only to `127.0.0.1`; it does
not upload frames to a cloud service.

## What it can do

- Live camera preview with annotated detection boxes
- OpenCV face detection and face count (not identity recognition)
- YOLOv8 Nano object detection and person/phone/book counts
- Confidence threshold control, event cues, CSV logging, and manual screenshots
- Optional MediaPipe eye-closure and approximate posture cues
- Cooldown-limited, non-blocking Windows sound alerts
- Responsive layout for desktop, tablet, and mobile screens

The default YOLOv8 Nano model uses COCO classes. It supports `person` and
`cell phone`, but does **not** include `book`. A book count of zero therefore
does not mean that no book is present. Rectangle overlap is only a possible
obstruction cue, not proof. Eye and posture cues are approximate, not health,
attention, or behavior assessments. Detections can be wrong, especially for
small, far-away, occluded, or partially out-of-frame subjects.

## Requirements

- Windows 10 or 11
- Python 3.11 (64-bit recommended)
- Webcam and browser camera permission
- Internet access for the first automatic YOLO model download

CPU inference works; CUDA is not required. Ultralytics uses an available,
correctly configured CUDA GPU automatically; otherwise it falls back to CPU.

## Setup in VS Code (Windows PowerShell)

Open this project folder in VS Code, open **Terminal → New Terminal**, and run:

```powershell
cd "C:\Users\hp\OneDrive\Desktop\python\AI_WEBCAM_DETECTOR"
py -3.11 -m venv .venv311
.\.venv311\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

If PowerShell blocks environment activation, run:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\.venv311\Scripts\Activate.ps1
```

In VS Code, choose the project environment via **Ctrl+Shift+P → Python: Select
Interpreter → `.venv311\Scripts\python.exe`**.

## Run the browser dashboard (easiest way)

In File Explorer, open the project folder and double-click
`start_web_app.bat`. It starts the Python server and opens the website in your
browser. Keep the black terminal window open while you use the app. Press
**Ctrl+C** in that window to stop the website.

## Run from the VS Code terminal

```powershell
cd "C:\Users\hp\OneDrive\Desktop\python\AI_WEBCAM_DETECTOR"
.\.venv311\Scripts\Activate.ps1
python web_app.py
```

The app opens **http://127.0.0.1:5000** in your browser. Keep the terminal open
while using the dashboard. Press **Ctrl+C** in that terminal to stop the local
web server. Press **Start camera** in the page and allow camera access when
asked. Camera access is requested only after pressing that button.

Opening `index.html` directly shows a styled preview, but browser security means
it cannot connect to the local Python detection API. Use `start_web_app.bat`
for full live detection.

The existing OpenCV desktop window can still be started separately with:

```powershell
python main.py
```

Do not run the desktop and browser interfaces at the same time if they both
need exclusive access to the same camera.

## Dashboard controls

- **Start camera / Stop session** — open or release the browser camera
- **Confidence threshold** — adjust the minimum YOLO detection confidence
- **Event logging** — enable/disable transition logging
- **Sound alerts** — enable/disable cooldown-limited sound alerts
- **Camera button** — save the current annotated frame manually
- **Download event log** — download the local CSV
- **P** — pause/resume detection; **S** — save an annotated screenshot

Screenshots are saved to `screenshots/`. Events are recorded in
`logs/events.csv` with the columns `timestamp,event,details`. Images are never
saved automatically.

## Optional MediaPipe cues

MediaPipe is kept optional because package support depends on Python and
Windows compatibility. With Python 3.11 active, try:

```powershell
python -m pip install mediapipe==0.10.14
```

Restart `web_app.py` after installing. If MediaPipe cannot be imported or
initialized, the rest of the app keeps working without those cues. The
dashboard displays optional feature availability.

## Troubleshooting

### `py -3.11` is not recognized

Install 64-bit Python 3.11, then restart VS Code. Check available Python
versions with:

```powershell
py -0p
```

### Camera permission denied or no camera found

- Allow camera access for your browser in Windows **Settings → Privacy &
  security → Camera**.
- Allow camera access for desktop apps as well.
- Close other programs currently using the camera.
- Try a modern browser and open the exact local URL `http://127.0.0.1:5000`.

### Address already in use

Stop the other server using port 5000 with **Ctrl+C** in its terminal, then run
`python web_app.py` again.

### YOLO model download fails

The first run downloads `yolov8n.pt`. Check your internet connection and retry.
You may also download it from the Ultralytics model source; keep the weights
local and restart the app. The model is loaded once at startup, not per frame.

### Missing packages

Activate `.venv311` and reinstall:

```powershell
python -m pip install -r requirements.txt
```

### Event log or screenshot cannot be saved

Check that this project folder and its `logs` and `screenshots` subfolders are
writable. The web interface reports save errors rather than silently claiming
success.

## Privacy and responsible use

The website is intended for local demonstrations. The server listens only on
the local computer (`127.0.0.1`). Webcam frames are processed locally and are
not transmitted to an external service. No face identity recognition or
automatic screenshot recording is performed. Treat every result as an
uncertain visual cue, not as proof of a person's identity, health, attention,
intent, or conduct.

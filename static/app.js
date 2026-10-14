"use strict";

const elements = {
  clock: document.getElementById("clock"),
  modelName: document.getElementById("modelName"),
  modelState: document.getElementById("modelState"),
  modelDot: document.getElementById("modelDot"),
  optionalStatus: document.getElementById("optionalStatus"),
  sessionStatus: document.getElementById("sessionStatus"),
  liveBadge: document.getElementById("liveBadge"),
  cameraPlaceholder: document.getElementById("cameraPlaceholder"),
  annotatedFrame: document.getElementById("annotatedFrame"),
  cameraVideo: document.getElementById("cameraVideo"),
  backendNotice: document.getElementById("backendNotice"),
  backendNoticeTitle: document.getElementById("backendNoticeTitle"),
  backendNoticeText: document.getElementById("backendNoticeText"),
  retryBackendButton: document.getElementById("retryBackendButton"),
  captureCanvas: document.getElementById("captureCanvas"),
  frameResolution: document.getElementById("frameResolution"),
  latencyPill: document.getElementById("latencyPill"),
  latencyText: document.getElementById("latencyText"),
  startButton: document.getElementById("startButton"),
  stopButton: document.getElementById("stopButton"),
  pauseButton: document.getElementById("pauseButton"),
  screenshotButton: document.getElementById("screenshotButton"),
  fpsValue: document.getElementById("fpsValue"),
  faceCount: document.getElementById("faceCount"),
  personCount: document.getElementById("personCount"),
  phoneCount: document.getElementById("phoneCount"),
  bookCount: document.getElementById("bookCount"),
  bookCaption: document.getElementById("bookCaption"),
  peopleCaption: document.getElementById("peopleCaption"),
  eventCount: document.getElementById("eventCount"),
  eventChips: document.getElementById("eventChips"),
  confidenceSlider: document.getElementById("confidenceSlider"),
  confidenceValue: document.getElementById("confidenceValue"),
  loggingSwitch: document.getElementById("loggingSwitch"),
  soundSwitch: document.getElementById("soundSwitch"),
  activityList: document.getElementById("activityList"),
  refreshEvents: document.getElementById("refreshEvents"),
  toastRegion: document.getElementById("toastRegion"),
  fileModeBanner: document.getElementById("fileModeBanner"),
  privacyTitle: document.getElementById("privacyTitle"),
  privacyDescription: document.getElementById("privacyDescription"),
  environmentLabel: document.getElementById("environmentLabel"),
  sessionMode: document.getElementById("sessionMode"),
  cameraDescription: document.getElementById("cameraDescription"),
  downloadLog: document.getElementById("downloadLog"),
  viewLogLink: document.getElementById("viewLogLink"),
  loggingDescription: document.getElementById("loggingDescription"),
  soundDescription: document.getElementById("soundDescription"),
};

const isFilePreview = window.location.protocol === "file:";
const isGitHubPages = window.location.hostname.endsWith(".github.io");
const isHuggingFaceSpace = window.location.hostname.endsWith(".hf.space");
const configuredApiRoot = String(window.VISION_API_BASE || "").trim().replace(/\/+$/, "");
const apiRoot = isFilePreview ? "" : configuredApiRoot || window.location.origin;
const browserInferenceMode = (isGitHubPages || new URLSearchParams(window.location.search).get("browser-ai") === "1")
  && !configuredApiRoot;
const backendConfigured = !isGitHubPages || Boolean(configuredApiRoot);
const remoteBackend = isHuggingFaceSpace || Boolean(configuredApiRoot && configuredApiRoot !== window.location.origin);
const state = {
  stream: null,
  running: false,
  paused: false,
  busy: false,
  backendAvailable: false,
  hasAnnotatedFrame: false,
  generation: 0,
  confidence: 0.35,
  latestImage: null,
  objectDetector: null,
  faceDetector: null,
  modelLoad: null,
  lastConfidence: null,
  frames: [],
  lastEventRefresh: 0,
  errorToastAt: 0,
};

function configureDeploymentCopy() {
  if (browserInferenceMode) {
    elements.privacyTitle.textContent = "Your camera stays yours.";
    elements.privacyDescription.textContent =
      "Detection runs in your browser. Camera frames are not uploaded to a server.";
    elements.environmentLabel.innerHTML = "<i></i> ON-DEVICE AI";
    elements.sessionMode.innerHTML = '<i></i> Browser session';
    elements.modelName.textContent = "MediaPipe vision";
    elements.bookCaption.textContent = "COCO model class";
    elements.cameraDescription.textContent = "Live feed analyzed privately in your browser.";
    elements.loggingDescription.textContent = "Session-only cues; nothing is uploaded";
    elements.soundDescription.textContent = "Unavailable in browser-only mode";
    elements.cameraPlaceholder.querySelector("strong").textContent = "Start on-device detection";
    elements.cameraPlaceholder.querySelector("span").textContent =
      "The AI models run in this browser; the camera feed stays on your device.";
    elements.cameraPlaceholder.querySelector("small").textContent =
      "The first start downloads the vision models. Camera permission is requested only after you press Start.";
    elements.loggingSwitch.disabled = true;
    elements.soundSwitch.disabled = true;
    elements.downloadLog.classList.add("hidden");
    elements.viewLogLink.classList.add("hidden");
    elements.activityList.replaceChildren();
    const empty = document.createElement("div");
    empty.className = "activity-empty";
    empty.textContent = "No server log in browser-only mode. Cues are displayed for this session only.";
    elements.activityList.appendChild(empty);
    return;
  }
  if (!isGitHubPages && !remoteBackend) return;
  elements.privacyTitle.textContent = "Frames are sent to the hosted detector.";
  elements.privacyDescription.textContent =
    "Camera frames are transmitted to the configured Python service for analysis. Do not use this demo with sensitive footage.";
  elements.environmentLabel.innerHTML = "<i></i> HOSTED DETECTOR";
  elements.sessionMode.innerHTML = '<i></i> Cloud session';
  elements.cameraDescription.textContent = "Annotated feed from the hosted detector.";
  elements.loggingDescription.textContent = "Disabled in public hosted mode";
  elements.soundDescription.textContent = "Disabled in public hosted mode";
  elements.cameraPlaceholder.querySelector("strong").textContent = "Start a hosted detection session";
  elements.cameraPlaceholder.querySelector("span").textContent =
    "Camera frames are sent to Hugging Face for analysis.";
  elements.cameraPlaceholder.querySelector("small").textContent =
    "Do not use with sensitive footage; stop the session to release your camera.";
  elements.loggingSwitch.disabled = true;
  elements.soundSwitch.disabled = true;
  elements.downloadLog.classList.add("hidden");
  elements.viewLogLink.classList.add("hidden");
  elements.activityList.replaceChildren();
  const empty = document.createElement("div");
  empty.className = "activity-empty";
  empty.textContent = "Hosted demo keeps event logs off to protect visitors' privacy.";
  elements.activityList.appendChild(empty);
}

function showBackendSetupNotice() {
  elements.modelState.textContent = "Hosted backend not connected";
  elements.modelDot.classList.add("error");
  elements.optionalStatus.textContent = "Connect the Python detector to enable live detection";
  elements.fileModeBanner.querySelector("strong").textContent = "Connect the hosted Python detector";
  elements.fileModeBanner.querySelector("span").textContent =
    "GitHub Pages only hosts this website. Set the Hugging Face Space URL in static/app-config.js, then push the change to GitHub.";
  elements.fileModeBanner.classList.remove("hidden");
}

function showToast(message, isError = false) {
  const toast = document.createElement("div");
  toast.className = `toast${isError ? " error" : ""}`;
  toast.textContent = message;
  elements.toastRegion.appendChild(toast);
  window.setTimeout(() => toast.remove(), 3800);
}

function setSwitch(button, enabled) {
  button.setAttribute("aria-checked", String(enabled));
}

function updateClock() {
  elements.clock.textContent = new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date());
}

async function apiRequest(url, options = {}) {
  const response = await fetch(`${apiRoot}${url}`, { cache: "no-store", ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Request failed (${response.status})`);
  }
  return data;
}

async function loadStatus() {
  if (browserInferenceMode) {
    elements.modelState.textContent = "Browser AI loads when you start";
    elements.modelDot.classList.remove("error", "ready");
    elements.optionalStatus.textContent = "Face and object detection run on this device";
    setSwitch(elements.loggingSwitch, false);
    setSwitch(elements.soundSwitch, false);
    return;
  }
  if (!backendConfigured) {
    showBackendSetupNotice();
    return;
  }
  if (isFilePreview) {
    elements.modelState.textContent = "Start local Python service";
    elements.modelDot.classList.add("error");
    elements.optionalStatus.textContent = "Optional features shown after server starts";
    elements.fileModeBanner.classList.remove("hidden");
    return;
  }

  try {
    const status = await apiRequest("/api/status");
    state.backendAvailable = true;
    if (status.public_demo) {
      elements.loggingSwitch.disabled = true;
      elements.soundSwitch.disabled = true;
      elements.downloadLog.classList.add("hidden");
      elements.viewLogLink.classList.add("hidden");
      elements.activityList.replaceChildren();
      const empty = document.createElement("div");
      empty.className = "activity-empty";
      empty.textContent = "Hosted demo keeps event logs off to protect visitors' privacy.";
      elements.activityList.appendChild(empty);
    }
    elements.modelState.textContent = status.model_ready
      ? "Ready · YOLOv8 Nano"
      : "Model unavailable · check terminal";
    elements.modelDot.classList.toggle("ready", status.model_ready);
    elements.modelDot.classList.toggle("error", !status.model_ready);
    elements.confidenceSlider.value = Math.round(status.confidence * 100);
    state.confidence = status.confidence;
    updateConfidenceDisplay();
    setSwitch(elements.loggingSwitch, status.logging);
    setSwitch(elements.soundSwitch, status.sound);
    const optionalFeatures = [];
    if (status.face_mesh) optionalFeatures.push("Face Mesh");
    if (status.pose) optionalFeatures.push("Pose");
    elements.optionalStatus.textContent = optionalFeatures.length
      ? `Optional cues available · ${optionalFeatures.join(" + ")}`
      : "Optional eye/posture cues off · MediaPipe not available";
    if (!status.model_ready) {
      showToast(`Model unavailable: ${status.model_error || "see the terminal for details"}`, true);
    }
  } catch (error) {
    state.backendAvailable = false;
    elements.modelState.textContent = "Python service is not responding";
    elements.modelDot.classList.add("error");
    elements.optionalStatus.textContent = "Start the Python service to enable detection";
    elements.fileModeBanner.querySelector("strong").textContent = remoteBackend
      ? "Hosted detector is waking up or unavailable"
      : "Local detection service is not responding";
    elements.fileModeBanner.querySelector("span").textContent = remoteBackend
      ? `Could not reach ${apiRoot}. Hugging Face may be starting the Space; wait a moment, then retry.`
      : "Double-click start_web_app.bat, then open http://127.0.0.1:5000. Keep its terminal window open.";
    elements.fileModeBanner.classList.remove("hidden");
    showToast(`Cannot reach the detector service: ${error.message}`, true);
  }
}

function setSessionConnected(connected, detectorConnected = false) {
  elements.sessionStatus.classList.toggle("connected", connected && detectorConnected);
  elements.sessionStatus.querySelector("span").textContent = !connected
    ? "Camera disconnected"
    : detectorConnected
      ? "Camera and detector connected"
      : "Camera open · connecting detector";
  elements.liveBadge.classList.toggle("live", connected && detectorConnected);
  elements.liveBadge.querySelector("span").textContent = !connected
    ? "STANDBY"
    : detectorConnected
      ? "LIVE"
      : "CONNECTING";
}

function updateConfidenceDisplay() {
  const percent = Number(elements.confidenceSlider.value);
  elements.confidenceValue.value = `${percent}%`;
  elements.confidenceValue.textContent = `${percent}%`;
  elements.confidenceSlider.style.background =
    `linear-gradient(to right, #2ca482 0%, #2ca482 ${percent}%, #e5ece8 ${percent}%, #e5ece8 100%)`;
}

async function startCamera() {
  if (state.running) return;
  if (!backendConfigured && !browserInferenceMode) {
    showBackendSetupNotice();
    showToast("The hosted Python backend has not been connected yet.", true);
    return;
  }
  if (isFilePreview) {
    elements.fileModeBanner.classList.remove("hidden");
    showToast("Open start_web_app.bat to start the local detection service.", true);
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    showToast("Camera access is unavailable. Open this app at http://127.0.0.1:5000 in a modern browser.", true);
    return;
  }

  elements.startButton.disabled = true;
  elements.startButton.querySelector("span").textContent = browserInferenceMode
    ? "Loading browser AI…"
    : "Requesting camera…";
  try {
    if (browserInferenceMode) {
      elements.modelState.textContent = "Loading browser vision models…";
      await loadBrowserModels();
      elements.modelName.textContent = "MediaPipe EfficientDet Lite0";
      elements.modelState.textContent = "Ready · browser AI";
      elements.modelDot.classList.remove("error");
      elements.modelDot.classList.add("ready");
    } else {
      const backend = await apiRequest("/api/status");
      state.backendAvailable = true;
      elements.modelState.textContent = backend.model_ready
        ? "Ready · YOLOv8 Nano"
        : "Model unavailable · check terminal";
      elements.modelDot.classList.toggle("ready", backend.model_ready);
      elements.modelDot.classList.toggle("error", !backend.model_ready);
      if (!backend.model_ready) {
        throw new Error(`The local server is running, but YOLO is unavailable: ${backend.model_error || "model failed to load"}`);
      }
    }
    state.stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        width: { ideal: 640 },
        height: { ideal: 480 },
        frameRate: { ideal: 20, max: 30 },
      },
    });
    elements.cameraVideo.srcObject = state.stream;
    await elements.cameraVideo.play();
    state.running = true;
    state.paused = false;
    state.generation += 1;
    elements.cameraPlaceholder.classList.add("hidden");
    elements.annotatedFrame.classList.add("hidden");
    elements.annotatedFrame.removeAttribute("src");
    elements.cameraVideo.classList.remove("hidden");
    elements.backendNotice.classList.toggle("hidden", browserInferenceMode);
    if (!browserInferenceMode) {
      elements.backendNoticeTitle.textContent = "Connecting to detector…";
      elements.backendNoticeText.textContent = remoteBackend
        ? "Camera frames are sent to the hosted Python detector for analysis."
        : "Your camera is open. Waiting for the Python detection service.";
    }
    elements.frameResolution.classList.remove("hidden");
    elements.latencyPill.classList.remove("hidden");
    elements.startButton.classList.add("hidden");
    elements.stopButton.classList.remove("hidden");
    elements.pauseButton.classList.remove("hidden");
    elements.screenshotButton.disabled = true;
    setSessionConnected(true, false);
    const track = state.stream.getVideoTracks()[0];
    const settings = track?.getSettings() || {};
    elements.frameResolution.textContent = `${settings.width || 640} × ${settings.height || 480}`;
    showToast(browserInferenceMode
      ? "Camera connected. Frames are analyzed on this device."
      : remoteBackend
        ? "Camera connected. Frames are sent to the hosted detector."
        : "Camera connected. Frames are analyzed locally.");
    runDetectionLoop(state.generation);
  } catch (error) {
    if (state.stream) {
      state.stream.getTracks().forEach((track) => track.stop());
      state.stream = null;
    }
    let message = error.message || "Could not open the camera.";
    if (error.name === "NotAllowedError") {
      message = "Camera permission was denied. Allow camera access in your browser settings and try again.";
    } else if (error.name === "NotFoundError") {
      message = "No camera was found. Connect or enable a webcam, then try again.";
    }
    if (browserInferenceMode) {
      elements.modelState.textContent = "Browser AI could not start";
      elements.modelDot.classList.add("error");
      message = `Could not load the browser vision models: ${error.message}`;
    } else if (!state.backendAvailable || error instanceof TypeError) {
      elements.modelState.textContent = "Python service is not responding";
      elements.modelDot.classList.add("error");
      message = remoteBackend
        ? `The hosted detector at ${apiRoot} is unavailable. It may be waking up; retry shortly.`
        : `The detector server at ${apiRoot || "this page's server"} is unreachable. Run start_web_app.bat and open http://127.0.0.1:5000.`;
    }
    showToast(message, true);
  } finally {
    elements.startButton.disabled = false;
    elements.startButton.querySelector("span").textContent = "Start camera";
  }
}

function stopCamera() {
  state.running = false;
  state.paused = false;
  state.generation += 1;
  state.busy = false;
  if (state.stream) {
    state.stream.getTracks().forEach((track) => track.stop());
    state.stream = null;
  }
  elements.cameraVideo.srcObject = null;
  elements.cameraVideo.classList.add("hidden");
  elements.annotatedFrame.classList.add("hidden");
  elements.annotatedFrame.removeAttribute("src");
  elements.backendNotice.classList.add("hidden");
  elements.cameraPlaceholder.classList.remove("hidden");
  elements.frameResolution.classList.add("hidden");
  elements.latencyPill.classList.add("hidden");
  elements.startButton.classList.remove("hidden");
  elements.stopButton.classList.add("hidden");
  elements.pauseButton.classList.add("hidden");
  elements.screenshotButton.disabled = true;
  elements.fpsValue.textContent = "--";
  state.latestImage = null;
  state.hasAnnotatedFrame = false;
  state.frames = [];
  resetMetrics();
  setSessionConnected(false);
}

function resetMetrics() {
  for (const metric of [elements.faceCount, elements.personCount, elements.phoneCount, elements.bookCount]) {
    metric.textContent = "—";
  }
  renderEvents([]);
}

function createImageBlob(dataUrl) {
  const [metadata, data] = dataUrl.split(",", 2);
  const mime = metadata.match(/data:(.*?);base64/)?.[1] || "image/jpeg";
  const binary = window.atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mime });
}

async function runDetectionLoop(generation) {
  if (!state.running || generation !== state.generation) return;
  if (state.paused) {
    window.setTimeout(() => runDetectionLoop(generation), 120);
    return;
  }
  if (state.busy || elements.cameraVideo.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    window.setTimeout(() => runDetectionLoop(generation), 120);
    return;
  }

  state.busy = true;
  try {
    const video = elements.cameraVideo;
    const canvas = elements.captureCanvas;
    canvas.width = Math.min(video.videoWidth || 640, 640);
    canvas.height = Math.round(canvas.width * ((video.videoHeight || 480) / (video.videoWidth || 640)));
    const context = canvas.getContext("2d", { alpha: false });
    if (browserInferenceMode) {
      await runBrowserDetection(video, canvas, context);
      if (!state.running || generation !== state.generation) return;
      state.backendAvailable = true;
      state.hasAnnotatedFrame = true;
      state.latestImage = canvas.toDataURL("image/jpeg", 0.82);
      elements.annotatedFrame.src = state.latestImage;
      elements.annotatedFrame.classList.remove("hidden");
      elements.cameraVideo.classList.add("hidden");
      elements.backendNotice.classList.add("hidden");
      elements.screenshotButton.disabled = false;
      elements.modelState.textContent = "Ready · browser AI";
      elements.modelDot.classList.remove("error");
      elements.modelDot.classList.add("ready");
      setSessionConnected(true, true);
      updateFrameRate();
      return;
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.76));
    if (!blob) throw new Error("Could not capture a webcam frame.");

    const form = new FormData();
    form.append("frame", blob, "webcam.jpg");
    form.append("confidence", String(state.confidence));
    const result = await apiRequest("/api/detect", { method: "POST", body: form });
    if (!state.running || generation !== state.generation) return;
    if (typeof result.image !== "string" || !result.image.startsWith("/9j/")) {
      throw new Error("The detection service returned an invalid image. Restart the local server and try again.");
    }

    const image = `data:image/jpeg;base64,${result.image}`;
    elements.annotatedFrame.src = image;
    elements.annotatedFrame.classList.remove("hidden");
    elements.cameraVideo.classList.add("hidden");
    elements.backendNotice.classList.add("hidden");
    state.backendAvailable = true;
    state.hasAnnotatedFrame = true;
    state.latestImage = image;
    elements.screenshotButton.disabled = false;
    elements.modelState.textContent = "Ready · YOLOv8 Nano";
    elements.modelDot.classList.remove("error");
    elements.modelDot.classList.add("ready");
    setSessionConnected(true, true);
    elements.faceCount.textContent = result.face_count;
    elements.personCount.textContent = result.person_count;
    elements.phoneCount.textContent = result.phone_count;
    elements.bookCount.textContent = result.book_count;
    elements.peopleCaption.textContent = result.person_count > 1
      ? "Multiple people detected"
      : "YOLO detections";
    elements.latencyText.textContent = `${Math.round(result.inference_ms)} ms`;
    updateFrameRate();
    renderEvents(result.events || []);

    const now = Date.now();
    if (now - state.lastEventRefresh > 4000) {
      state.lastEventRefresh = now;
      refreshEvents();
    }
  } catch (error) {
    if (state.running && generation === state.generation && Date.now() - state.errorToastAt > 5000) {
      state.errorToastAt = Date.now();
      const backendUnavailable = error instanceof TypeError;
      state.backendAvailable = !backendUnavailable;
      elements.backendNotice.classList.remove("hidden");
      elements.backendNoticeTitle.textContent = backendUnavailable
        ? browserInferenceMode
          ? "Browser AI could not analyze this frame"
          : remoteBackend ? "Hosted detector is unavailable" : "Python detector is offline"
        : "Could not analyze this frame";
      elements.backendNoticeText.textContent = backendUnavailable
        ? browserInferenceMode
          ? error.message
          : remoteBackend
          ? `The camera is working, but ${apiRoot} is not responding. The Hugging Face Space may be waking up; retry in a moment.`
          : `The browser camera is working, but the local API at ${apiRoot} is not responding. Restart start_web_app.bat, then retry.`
        : error.message;
      elements.cameraVideo.classList.remove("hidden");
      elements.annotatedFrame.classList.add("hidden");
      elements.modelState.textContent = backendUnavailable
        ? browserInferenceMode
          ? "Browser AI is not responding"
          : "Python service is not responding"
        : "Detection error · see details";
      elements.modelDot.classList.remove("ready");
      elements.modelDot.classList.add("error");
      setSessionConnected(true, false);
      state.latestImage = null;
      elements.screenshotButton.disabled = true;
      showToast(backendUnavailable
        ? browserInferenceMode
          ? error.message
          : remoteBackend
          ? "Camera preview is live, but the hosted detector cannot be reached."
          : "Camera preview is live, but the detector API cannot be reached."
        : error.message, true);
    }
  } finally {
    state.busy = false;
    if (state.running && generation === state.generation) {
      window.setTimeout(() => runDetectionLoop(generation), 120);
    }
  }

}

async function loadBrowserModels() {
  if (state.objectDetector && state.faceDetector) return;
  if (state.modelLoad) return state.modelLoad;

  state.modelLoad = (async () => {
    const vision = await import("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.0/vision_bundle.mjs");
    const fileset = await vision.FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.0/wasm",
    );
    const tasks = [
      vision.ObjectDetector.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath: "https://storage.googleapis.com/mediapipe-tasks/object_detector/efficientdet_lite0_uint8.tflite",
        },
        runningMode: "IMAGE",
        scoreThreshold: state.confidence,
        maxResults: 30,
      }),
      vision.FaceDetector.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite",
        },
        runningMode: "IMAGE",
        minDetectionConfidence: Math.max(0.3, state.confidence),
      }),
    ];
    try {
      [state.objectDetector, state.faceDetector] = await Promise.all(tasks);
    } catch (error) {
      await Promise.allSettled(tasks);
      throw new Error(`Could not initialize MediaPipe models. Check your internet connection and browser compatibility. ${error.message}`);
    }
  })();

  try {
    await state.modelLoad;
  } catch (error) {
    state.modelLoad = null;
    throw error;
  }
}

async function runBrowserDetection(video, canvas, context) {
  await loadBrowserModels();
  if (state.lastConfidence !== state.confidence) {
    await state.objectDetector.setOptions({ scoreThreshold: state.confidence });
    await state.faceDetector.setOptions({
      minDetectionConfidence: Math.max(0.3, state.confidence),
    });
    state.lastConfidence = state.confidence;
  }

  context.save();
  context.translate(canvas.width, 0);
  context.scale(-1, 1);
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  context.restore();

  const startedAt = performance.now();
  const objects = state.objectDetector.detect(canvas).detections;
  const faces = state.faceDetector.detect(canvas).detections;
  const elapsed = performance.now() - startedAt;
  const count = { person: 0, phone: 0, book: 0 };
  const objectBoxes = [];

  for (const detection of objects) {
    const category = detection.categories[0];
    if (!category) continue;
    const label = category.categoryName.toLowerCase();
    if (label === "person") count.person += 1;
    if (label === "cell phone") count.phone += 1;
    if (label === "book") count.book += 1;
    const box = detection.boundingBox;
    objectBoxes.push({ label, box });
    drawDetectionBox(context, box, `${category.categoryName} ${Math.round(category.score * 100)}%`, "#f59e0b");
  }

  const faceBoxes = [];
  for (const detection of faces) {
    const box = detection.boundingBox;
    faceBoxes.push(box);
    drawDetectionBox(context, box, "Face", "#2ca482");
  }

  const events = [];
  if (count.person > 1) events.push("Multiple people detected");
  if (faceBoxes.some((face) => objectBoxes.some((object) =>
    ["book", "cell phone"].includes(object.label) && boxesOverlap(face, object.box),
  ))) {
    events.push("Possible face obstruction");
  }

  elements.faceCount.textContent = String(faceBoxes.length);
  elements.personCount.textContent = String(count.person);
  elements.phoneCount.textContent = String(count.phone);
  elements.bookCount.textContent = String(count.book);
  elements.peopleCaption.textContent = count.person > 1
    ? "Multiple people detected"
    : "Browser AI detections";
  elements.latencyText.textContent = `${Math.round(elapsed)} ms`;
  renderEvents(events);
}

function drawDetectionBox(context, box, label, color) {
  context.strokeStyle = color;
  context.lineWidth = Math.max(2, context.canvas.width / 240);
  context.strokeRect(box.originX, box.originY, box.width, box.height);
  context.font = `600 ${Math.max(13, Math.round(context.canvas.width / 42))}px sans-serif`;
  const textWidth = context.measureText(label).width;
  const labelHeight = Math.max(20, Math.round(context.canvas.width / 32));
  const textTop = Math.max(labelHeight, box.originY);
  context.fillStyle = color;
  context.fillRect(box.originX, textTop - labelHeight, textWidth + 12, labelHeight);
  context.fillStyle = "#ffffff";
  context.fillText(label, box.originX + 6, textTop - Math.round(labelHeight * 0.28));
}

function boxesOverlap(first, second) {
  return first.originX < second.originX + second.width
    && first.originX + first.width > second.originX
    && first.originY < second.originY + second.height
    && first.originY + first.height > second.originY;
}

async function retryBackend() {
  elements.retryBackendButton.disabled = true;
  elements.retryBackendButton.textContent = "Checking…";
  try {
    if (browserInferenceMode) {
      await loadBrowserModels();
      elements.modelState.textContent = "Ready · browser AI";
      elements.modelDot.classList.remove("error");
      elements.modelDot.classList.add("ready");
      elements.backendNotice.classList.add("hidden");
      if (state.running) runDetectionLoop(state.generation);
      return;
    }
    const status = await apiRequest("/api/status");
    state.backendAvailable = true;
    if (!status.model_ready) {
      throw new Error(`The service is running, but YOLO is unavailable: ${status.model_error || "model could not load"}`);
    }
    elements.modelState.textContent = "Ready · YOLOv8 Nano";
    elements.modelDot.classList.remove("error");
    elements.modelDot.classList.add("ready");
    elements.backendNoticeTitle.textContent = "Detector connected";
    elements.backendNoticeText.textContent = "Processing a fresh camera frame now…";
    if (state.running) runDetectionLoop(state.generation);
    else elements.backendNotice.classList.add("hidden");
  } catch (error) {
    elements.modelState.textContent = "Python service is not responding";
    elements.modelDot.classList.add("error");
    elements.backendNoticeTitle.textContent = "Could not connect to detector";
    elements.backendNoticeText.textContent = error.message;
    showToast(error.message, true);
  } finally {
    elements.retryBackendButton.disabled = false;
    elements.retryBackendButton.textContent = "Retry connection";
  }
}

function updateFrameRate() {
  const now = performance.now();
  state.frames.push(now);
  state.frames = state.frames.filter((timestamp) => now - timestamp < 3000);
  const elapsed = state.frames.length > 1
    ? (state.frames[state.frames.length - 1] - state.frames[0]) / 1000
    : 0;
  elements.fpsValue.textContent = elapsed > 0
    ? ((state.frames.length - 1) / elapsed).toFixed(1)
    : "—";
}

function renderEvents(events) {
  elements.eventCount.textContent = `${events.length} active`;
  elements.eventChips.replaceChildren();
  if (events.length === 0) {
    const empty = document.createElement("span");
    empty.className = "empty-events";
    empty.textContent = state.running ? "No active cues in this frame." : "No active events. Start the camera to begin.";
    elements.eventChips.appendChild(empty);
    return;
  }

  for (const eventName of events) {
    const chip = document.createElement("span");
    chip.className = "event-chip";
    if (eventName.toLowerCase().includes("obstruction")) chip.classList.add("warning");
    if (eventName.toLowerCase().includes("posture") || eventName.toLowerCase().includes("lean")) {
      chip.classList.add("neutral");
    }
    chip.textContent = eventName;
    elements.eventChips.appendChild(chip);
  }
}

function describeEvent(eventName) {
  return eventName.replace(/:STARTED$/, " · detected").replace(/:CLEARED$/, " · cleared");
}

async function refreshEvents() {
  if (remoteBackend || browserInferenceMode) return;
  if (isFilePreview) {
    elements.activityList.replaceChildren();
    const empty = document.createElement("div");
    empty.className = "activity-empty";
    empty.textContent = "Run start_web_app.bat to connect the local event log.";
    elements.activityList.appendChild(empty);
    return;
  }

  try {
    const result = await apiRequest("/api/events");
    elements.activityList.replaceChildren();
    if (!result.events.length) {
      const empty = document.createElement("div");
      empty.className = "activity-empty";
      empty.textContent = "No events logged yet.";
      elements.activityList.appendChild(empty);
      return;
    }

    for (const item of result.events.slice(0, 6)) {
      const row = document.createElement("div");
      row.className = "activity-item";
      const mark = document.createElement("i");
      mark.className = `activity-mark${item.event.endsWith(":CLEARED") ? " cleared" : ""}`;
      const copy = document.createElement("div");
      copy.className = "activity-copy";
      const title = document.createElement("strong");
      title.textContent = describeEvent(item.event);
      const details = document.createElement("span");
      details.textContent = item.details || "Detection state changed";
      const timestamp = document.createElement("time");
      timestamp.className = "activity-time";
      timestamp.textContent = item.timestamp || "";
      row.append(mark, copy, timestamp);
      copy.append(title, details);
      elements.activityList.appendChild(row);
    }
  } catch (error) {
    showToast(`Could not refresh event log: ${error.message}`, true);
  }
}

async function setLogging() {
  if (remoteBackend || browserInferenceMode) {
    showToast("Event logging is disabled on the hosted public demo.", true);
    return;
  }
  if (isFilePreview) {
    showToast("Run start_web_app.bat to change event logging.", true);
    return;
  }
  const currentlyEnabled = elements.loggingSwitch.getAttribute("aria-checked") === "true";
  elements.loggingSwitch.disabled = true;
  try {
    const result = await apiRequest("/api/logging", { method: "POST" });
    setSwitch(elements.loggingSwitch, result.logging);
    showToast(`Event logging ${result.logging ? "enabled" : "disabled"}.`);
    refreshEvents();
  } catch (error) {
    setSwitch(elements.loggingSwitch, currentlyEnabled);
    showToast(error.message, true);
  } finally {
    elements.loggingSwitch.disabled = false;
  }
}

async function setSound() {
  if (remoteBackend || browserInferenceMode) {
    showToast("Sound alerts are unavailable on the hosted demo.", true);
    return;
  }
  if (isFilePreview) {
    showToast("Run start_web_app.bat to change detection settings.", true);
    return;
  }
  const currentlyEnabled = elements.soundSwitch.getAttribute("aria-checked") === "true";
  const nextValue = !currentlyEnabled;
  elements.soundSwitch.disabled = true;
  try {
    await apiRequest("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sound: nextValue }),
    });
    setSwitch(elements.soundSwitch, nextValue);
    showToast(`Sound alerts ${nextValue ? "enabled" : "disabled"}.`);
  } catch (error) {
    showToast(error.message, true);
  } finally {
    elements.soundSwitch.disabled = false;
  }
}

async function saveScreenshot() {
  if (isFilePreview) {
    showToast("Run start_web_app.bat to save screenshots.", true);
    return;
  }
  if (!state.latestImage) {
    showToast("Start the camera and wait for an analyzed frame before saving.", true);
    return;
  }
  elements.screenshotButton.disabled = true;
  if (remoteBackend || browserInferenceMode) {
    const link = document.createElement("a");
    link.href = state.latestImage;
    link.download = `vision-desk-${new Date().toISOString().replace(/[:.]/g, "-")}.jpg`;
    link.click();
    showToast("Annotated frame downloaded to this device.");
    elements.screenshotButton.disabled = !state.running;
    return;
  }
  try {
    const form = new FormData();
    form.append("frame", createImageBlob(state.latestImage), "annotated-frame.jpg");
    const result = await apiRequest("/api/screenshot", { method: "POST", body: form });
    showToast(`Screenshot saved to screenshots/${result.filename}`);
  } catch (error) {
    showToast(error.message, true);
  } finally {
    elements.screenshotButton.disabled = !state.running;
  }
}

function togglePause() {
  if (!state.running || !state.stream) return;
  state.paused = !state.paused;
  const track = state.stream.getVideoTracks()[0];
  if (track) track.enabled = !state.paused;
  elements.liveBadge.querySelector("span").textContent = state.paused ? "PAUSED" : "LIVE";
  elements.liveBadge.classList.toggle("live", !state.paused);
  elements.pauseButton.querySelector("span").textContent = state.paused ? "Resume" : "Pause";
  elements.pauseButton.querySelector("svg").innerHTML = state.paused
    ? '<path d="m9 6 10 6-10 6z"/>'
    : '<path d="M9 5v14M15 5v14"/>';
  elements.fpsValue.textContent = state.paused ? "--" : elements.fpsValue.textContent;
  showToast(state.paused ? "Detection paused." : "Detection resumed.");
}

let settingsTimer;
async function updateConfidence() {
  if (isFilePreview) return;
  const value = Number(elements.confidenceSlider.value);
  state.confidence = value / 100;
  updateConfidenceDisplay();
  if (browserInferenceMode) {
    state.lastConfidence = null;
    return;
  }
  window.clearTimeout(settingsTimer);
  settingsTimer = window.setTimeout(async () => {
    try {
      await apiRequest("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confidence: state.confidence }),
      });
    } catch (error) {
      showToast(error.message, true);
    }
  }, 180);
}

elements.startButton.addEventListener("click", startCamera);
elements.stopButton.addEventListener("click", stopCamera);
elements.pauseButton.addEventListener("click", togglePause);
elements.screenshotButton.addEventListener("click", saveScreenshot);
elements.confidenceSlider.addEventListener("input", updateConfidence);
elements.loggingSwitch.addEventListener("click", setLogging);
elements.soundSwitch.addEventListener("click", setSound);
elements.refreshEvents.addEventListener("click", refreshEvents);
elements.retryBackendButton.addEventListener("click", retryBackend);
elements.annotatedFrame.addEventListener("error", () => {
  if (!state.running) return;
  state.hasAnnotatedFrame = false;
  elements.annotatedFrame.classList.add("hidden");
  elements.cameraVideo.classList.remove("hidden");
  elements.backendNotice.classList.remove("hidden");
  elements.backendNoticeTitle.textContent = "Could not show the annotated frame";
  elements.backendNoticeText.textContent = "The camera is still on. Restart the local detector service and retry.";
});
document.getElementById("downloadLog").addEventListener("click", (event) => {
  if (isFilePreview) {
    event.preventDefault();
    showToast("Run start_web_app.bat to download the local event log.", true);
  }
});
window.addEventListener("beforeunload", () => {
  if (state.stream) state.stream.getTracks().forEach((track) => track.stop());
});
window.addEventListener("keydown", (event) => {
  if (event.target instanceof HTMLInputElement) return;
  if (event.key.toLowerCase() === "s" && state.running) saveScreenshot();
  if (event.key.toLowerCase() === "p" && state.running) togglePause();
  if (event.key.toLowerCase() === "q" && state.running) stopCamera();
});

updateClock();
configureDeploymentCopy();
window.setInterval(updateClock, 1000);
loadStatus();
refreshEvents();

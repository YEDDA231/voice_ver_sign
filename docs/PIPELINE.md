# Translation pipelines (conceptual diagram)

The dashboard implements **two flows** aligned with the project architecture.

## Sign → Voice

1. **Webcam** — browser `getUserMedia` → `<video>` (frames for OpenCV on server).
2. **Image recognition** — OpenCV preprocessing; **Tesseract OCR** or **Google Cloud Vision** for text (English hand-sign context per design note).
3. **Text** — intermediate string.
4. **Text-to-voice** — **pyttsx3** or **Coqui TTS** (server); browser `speechSynthesis` is a temporary demo.
5. **Sound** — speaker output.

**API stubs:** `POST /api/pipeline/sign-to-voice/recognize`, `POST /api/pipeline/sign-to-voice/speak`

## Voice → Sign

1. **Voice** — microphone capture (Whisper input).
2. **Voice → text** — **Whisper** and/or **SpeechRecognition**.
3. **Text** — transcript.
4. **Text → image** — **Stable Diffusion** or a **web API** for sign visuals.
5. **Sign image** — display in the UI.

**API stubs:** `POST /api/pipeline/voice-to-sign/transcribe`, `POST /api/pipeline/voice-to-sign/render`

## Status

`GET /api/pipeline/status` — JSON describing steps and planned integrations.

Replace stub handlers in `server/app.py` with real model calls as you add dependencies (`requirements-vision.txt`, Whisper, etc.).

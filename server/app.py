"""
Voice Ver Sign – FastAPI backend.
Single server that provides API endpoints and serves the frontend.
"""
from __future__ import annotations

import os
import threading
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Optional

from fastapi import FastAPI, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, RedirectResponse
from pydantic import BaseModel, Field, ConfigDict

from . import database as db
from . import auth
from . import config
from .security_headers import (
    build_security_headers,
    is_html_response,
    _build_csp,
)
# `install_security_middleware` is the public API of security_headers but
# we instantiate the middleware inline below to allow per-app header tuning.

# ── Pydantic Models ──

class LoginRequest(BaseModel):
    email: str
    password: str

class SignupRequest(BaseModel):
    firstName: str
    lastName: str
    email: str
    password: str
    userType: str = "hearing"

class AdminCreateUserRequest(BaseModel):
    name: str
    email: str
    password: str
    userType: str = "hearing"

class ForgotPasswordRequest(BaseModel):
    email: str

class InputToggleRequest(BaseModel):
    active: bool

class CreateChatRequest(BaseModel):
    title: str = "New conversation"

class SendMessageRequest(BaseModel):
    content: str

class PreferencesRequest(BaseModel):
    data: dict = {}


class PipelineSignRecognizeRequest(BaseModel):
    """Webcam frames and/or MediaPipe hand landmarks for live FSL / Collated recognition."""

    model_config = ConfigDict(populate_by_name=True)
    image_base64: Optional[str] = Field(None, alias="imageBase64")
    frames: Optional[list[str]] = Field(None, alias="frames")
    landmarks: Optional[Any] = None
    landmark_frames: Optional[list] = Field(None, alias="landmarkFrames")


class PipelineTextPayload(BaseModel):
    text: str = ""


class PipelineVoiceTranscribeRequest(BaseModel):
    """Audio blob base64 when you integrate Whisper — optional for now."""

    model_config = ConfigDict(populate_by_name=True)
    audio_base64: Optional[str] = Field(None, alias="audioBase64")
    note: Optional[str] = None


# ── App Setup ──

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Create DB tables on startup (SQLite/Postgres). Use Alembic for managed migrations in production if needed."""
    db.init_db()
    _seed_admin_if_configured()

    def _warmup_signs():
        try:
            from .sign_dataset import warmup_dataset

            warmup_dataset()
        except Exception as exc:
            print(f"Sign dataset warmup skipped: {exc}")

    threading.Thread(target=_warmup_signs, daemon=True, name="fsl-warmup").start()
    yield


app = FastAPI(title="Voice Ver Sign", version="2.0.0", lifespan=lifespan)

_cors_origins = config.get_cors_origins()

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=bool(_cors_origins),
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=[
        "Authorization",
        "Content-Type",
        "Accept",
        "Origin",
        "X-Requested-With",
    ],
    max_age=600,
)

# Security headers (CSP, X-Frame-Options, Permissions-Policy, ...)
# Set VVS_CSP_REPORT_ONLY=1 in env to switch CSP to report-only mode.
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

_csp_report_only = os.getenv("VVS_CSP_REPORT_ONLY", "").lower() in ("1", "true", "yes")
_csp = _build_csp(os.getenv("VVS_CSP_EXTRA_ORIGINS", ""))
_headers = build_security_headers(_csp)
_csp_header_name = (
    "Content-Security-Policy-Report-Only" if _csp_report_only else "Content-Security-Policy"
)
_headers.pop("Content-Security-Policy", None)
_headers[_csp_header_name] = _csp


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)
        for k, v in _headers.items():
            response.headers.setdefault(k, v)
        if is_html_response(response.headers.get("content-type", "")):
            response.headers.setdefault("Cache-Control", "no-store")
        return response


app.add_middleware(SecurityHeadersMiddleware)

# Device state (in-memory)
_device_state = {"mic": False, "camera": False}


# ── Auth Helper ──

def get_current_user(authorization: Optional[str] = Header(None)) -> dict | None:
    if not authorization:
        return None
    token = authorization.replace("Bearer ", "")
    user_id = auth.decode_token(token)
    if not user_id:
        return None
    return db.get_user_by_id(user_id)


def require_user(authorization: Optional[str] = Header(None)) -> dict:
    user = get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user


def require_admin(authorization: Optional[str] = Header(None)) -> dict:
    user = require_user(authorization)
    if user.get("user_type") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


def _seed_admin_if_configured() -> None:
    """Optional first admin from environment (not for public signup)."""
    email = os.getenv("ADMIN_EMAIL", "").strip().lower()
    password = os.getenv("ADMIN_PASSWORD", "")
    if not email or not password:
        return
    if db.get_user_by_email(email):
        return
    name = (os.getenv("ADMIN_NAME") or "Administrator").strip() or "Administrator"
    db.create_user(email, auth.hash_password(password), name, "admin")


def _is_dev_mode_enabled() -> bool:
    """Dev mode must be explicitly enabled by the operator.

    When `VVS_DEV_MODE=1`, the `/api/auth/dev-auto-login` endpoint becomes
    available. It is intended for local development only and should NEVER
    be enabled in production.
    """
    return os.getenv("VVS_DEV_MODE", "").lower() in ("1", "true", "yes", "on")


# ── Health ──

@app.get("/api/health")
def health():
    return {"status": "ok", "service": "voice_ver_sign"}


# ── Auth Routes ──

@app.post("/api/auth/login")
def login(req: LoginRequest):
    email = (req.email or "").strip().lower()[:254]
    password = req.password or ""
    if not email or not password:
        raise HTTPException(status_code=400, detail="Email and password are required.")
    if len(password) > 128:
        # Avoid spending CPU on bcrypt for absurdly long inputs.
        raise HTTPException(status_code=401, detail="Invalid email or password")
    user = db.get_user_by_email(email)
    if not user or not auth.verify_password(password, user["password_hash"]):
        # Constant-time-friendly: still verify against a dummy hash so
        # the response time is similar for "user not found" vs "wrong password".
        if not user:
            auth.verify_password(password, auth.hash_password("__v2s_dummy__"))
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = auth.create_token(user["id"])
    return {
        "token": token,
        "user": {
            "id": user["id"],
            "name": user["name"],
            "email": user["email"],
            "userType": user["user_type"],
        },
    }


@app.post("/api/auth/signup")
def signup(req: SignupRequest):
    if req.userType not in ("hearing", "deaf"):
        raise HTTPException(status_code=400, detail="userType must be hearing or deaf")
    # Server-side input length guards (defense in depth).
    first_name = (req.firstName or "").strip()[:60]
    last_name = (req.lastName or "").strip()[:60]
    email = (req.email or "").strip().lower()[:254]
    password = req.password or ""
    if not first_name or not last_name or not email:
        raise HTTPException(status_code=400, detail="First name, last name, and email are required.")
    if len(password) < 8 or len(password) > 128:
        raise HTTPException(status_code=400, detail="Password must be 8-128 characters.")
    if db.get_user_by_email(email):
        raise HTTPException(status_code=409, detail="Email already registered")
    password_hash = auth.hash_password(password)
    name = f"{first_name} {last_name}".strip()
    user = db.create_user(email, password_hash, name, req.userType)
    token = auth.create_token(user["id"])
    return {
        "token": token,
        "user": {
            "id": user["id"],
            "name": user["name"],
            "email": user["email"],
            "userType": user["user_type"],
        },
    }


# ── Dev-only auto-login ──
# IMPORTANT: This endpoint is ONLY mounted when VVS_DEV_MODE=1 is set in the
# environment. It is intended for local development and must not be enabled
# in production. The endpoint ensures an admin user exists (using
# ADMIN_EMAIL / ADMIN_PASSWORD if configured, or a deterministic dev admin
# otherwise) and returns a JWT for that user.
if _is_dev_mode_enabled():
    @app.get("/api/auth/dev-mode-status")
    def dev_mode_status():
        """Public indicator that dev mode is on. The endpoint does NOT
        leak any credentials — it only tells the client whether the
        dev auto-login button should be shown."""
        return {"devMode": True}

    @app.post("/api/auth/dev-auto-login")
    def dev_auto_login():
        if not _is_dev_mode_enabled():  # double-check at request time
            raise HTTPException(status_code=404, detail="Not found")

        # Prefer the operator-configured admin if available
        email = os.getenv("ADMIN_EMAIL", "").strip().lower()
        password = os.getenv("ADMIN_PASSWORD", "")
        admin_user = None

        if email and password:
            admin_user = db.get_user_by_email(email)
            if not admin_user:
                # Seed the configured admin on first dev login
                name = (os.getenv("ADMIN_NAME") or "Administrator").strip() or "Administrator"
                db.create_user(email, auth.hash_password(password), name, "admin")
                admin_user = db.get_user_by_email(email)
        else:
            # Fallback: deterministic dev admin
            email = "admin@voice_ver_sign.local"
            password = "dev"
            admin_user = db.get_user_by_email(email)
            if not admin_user:
                db.create_user(email, auth.hash_password(password), "Dev Admin", "admin")
                admin_user = db.get_user_by_email(email)

        if not admin_user:
            raise HTTPException(status_code=500, detail="Could not prepare dev admin")

        token = auth.create_token(admin_user["id"])
        return {
            "token": token,
            "user": {
                "id": admin_user["id"],
                "name": admin_user.get("name", "Administrator"),
                "email": admin_user.get("email", email),
                "userType": "admin",
            },
        }


@app.post("/api/auth/forgot-password")
def forgot_password(req: ForgotPasswordRequest):
    email = (req.email or "").strip().lower()[:254]
    if not email:
        # Generic response either way to avoid email enumeration.
        return {"message": "If this email exists, a reset link has been sent."}
    user = db.get_user_by_email(email)
    if user:
        reset_token = auth.create_token(user["id"])
        # NOTE: replace with the public base URL of the deployed app via env in production.
        from os import getenv as _getenv
        base_url = _getenv("VVS_PUBLIC_BASE_URL", "http://localhost:5000").rstrip("/")
        reset_link = f"{base_url}/reset-password.html?token={reset_token}"

        print(f"\n--- PASSWORD RESET ---")
        print(f"Sending password reset link to: {req.email}")
        print(f"Reset Link: {reset_link}")
        print(f"----------------------\n")
        
        """
        # ==========================================
        # HOW TO IMPLEMENT EMAIL SENDING
        # ==========================================
        import smtplib
        from email.mime.text import MIMEText
        from email.mime.multipart import MIMEMultipart
        
        SMTP_SERVER = "smtp.gmail.com"
        SMTP_PORT = 587
        SMTP_USER = os.getenv("SMTP_USER", "your-email@gmail.com")
        SMTP_PASS = os.getenv("SMTP_PASS", "your-app-password") # Use an App Password!
        
        msg = MIMEMultipart()
        msg['From'] = SMTP_USER
        msg['To'] = req.email
        msg['Subject'] = "Voice Ver Sign - Password Reset"
        
        body = f"Hello {user['name']},\\n\\nClick the link below to reset your password:\\n{reset_link}\\n\\nIf you did not request this, please ignore this email."
        msg.attach(MIMEText(body, 'plain'))
        
        try:
            with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as server:
                server.starttls()
                server.login(SMTP_USER, SMTP_PASS)
                server.send_message(msg)
            print("Real Email sent successfully!")
        except Exception as e:
            print(f"Failed to send email: {e}")
        """
        
    return {"message": "If this email exists, a reset link has been sent."}


@app.get("/api/auth/me")
def auth_me(authorization: Optional[str] = Header(None)):
    """Current user profile (role drives dashboard layout)."""
    user = require_user(authorization)
    return {
        "user": {
            "id": user["id"],
            "name": user["name"],
            "email": user["email"],
            "userType": user["user_type"],
        }
    }


@app.get("/api/admin/stats")
def admin_stats(authorization: Optional[str] = Header(None)):
    """Aggregate counts — admin only; backed by SQLAlchemy / DATABASE_URL."""
    require_admin(authorization)
    return {
        "usersTotal": db.count_users(),
        "chatsTotal": db.count_chats(),
        "usersByType": {
            "hearing": db.count_users_by_type("hearing"),
            "deaf": db.count_users_by_type("deaf"),
            "admin": db.count_users_by_type("admin"),
        },
    }


@app.get("/api/admin/users")
def admin_list_users(authorization: Optional[str] = Header(None)):
    require_admin(authorization)
    return {"users": db.get_all_users()}


@app.delete("/api/admin/users/{user_id}")
def admin_delete_user(user_id: str, authorization: Optional[str] = Header(None)):
    require_admin(authorization)
    # Check that admin is not deleting themselves
    current_admin = get_current_user(authorization)
    if current_admin and current_admin["id"] == user_id:
        raise HTTPException(status_code=400, detail="Super administrators cannot delete their own profile.")
    if not db.delete_user(user_id):
        raise HTTPException(status_code=404, detail="User not found")
    return {"deleted": True}


@app.post("/api/admin/users")
def admin_create_user(req: AdminCreateUserRequest, authorization: Optional[str] = Header(None)):
    require_admin(authorization)
    if req.userType not in ("hearing", "deaf", "admin"):
        raise HTTPException(status_code=400, detail="userType must be hearing, deaf or admin")
    name = (req.name or "").strip()[:120]
    email = (req.email or "").strip().lower()[:254]
    password = req.password or ""
    if not name or not email:
        raise HTTPException(status_code=400, detail="Name and email are required.")
    if len(password) < 8 or len(password) > 128:
        raise HTTPException(status_code=400, detail="Password must be 8-128 characters.")
    if db.get_user_by_email(email):
        raise HTTPException(status_code=409, detail="Email already registered")
    password_hash = auth.hash_password(password)
    user = db.create_user(email, password_hash, name, req.userType)
    return {"user": user}


# ── Chat Routes ──

@app.get("/api/chats")
def list_chats(authorization: Optional[str] = Header(None)):
    user = require_user(authorization)
    return {"chats": db.get_chats(user["id"])}


@app.post("/api/chats")
def create_chat(req: CreateChatRequest, authorization: Optional[str] = Header(None)):
    user = require_user(authorization)
    title = (req.title or "New conversation").strip()[:120]
    chat = db.create_chat(user["id"], title or "New conversation")
    return {"chat": chat}


@app.delete("/api/chats/{chat_id}")
def delete_chat(chat_id: str, authorization: Optional[str] = Header(None)):
    user = require_user(authorization)
    if not db.delete_chat(chat_id, user["id"]):
        raise HTTPException(status_code=404, detail="Chat not found")
    return {"deleted": True}


@app.patch("/api/chats/{chat_id}/pin")
def pin_chat(chat_id: str, authorization: Optional[str] = Header(None)):
    user = require_user(authorization)
    chat = db.toggle_pin_chat(chat_id, user["id"])
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    return {"chat": chat}


@app.get("/api/chats/{chat_id}/messages")
def list_messages(chat_id: str, authorization: Optional[str] = Header(None)):
    require_user(authorization)
    return {"messages": db.get_messages(chat_id)}


@app.post("/api/chats/{chat_id}/messages")
def send_message(chat_id: str, req: SendMessageRequest, authorization: Optional[str] = Header(None)):
    require_user(authorization)
    # Server-side content-length guard (defense in depth alongside the
    # client-side cap in dashboard-shared.js). Hard limit protects the DB
    # from oversized payloads.
    content = (req.content or "").strip()
    if not content:
        raise HTTPException(status_code=400, detail="Message content cannot be empty.")
    if len(content) > 2000:
        raise HTTPException(
            status_code=400,
            detail="Message is too long. Please keep messages under 2000 characters.",
        )
    user_msg = db.add_message(chat_id, "user", content)

    from .sign_dataset import chat_translation

    response_text = chat_translation(content)
    assistant_msg = db.add_message(chat_id, "assistant", response_text)

    return {"userMessage": user_msg, "assistantMessage": assistant_msg}


# ── Preferences ──

@app.get("/api/preferences")
def get_preferences(authorization: Optional[str] = Header(None)):
    user = require_user(authorization)
    return {"preferences": db.get_preferences(user["id"])}


@app.put("/api/preferences")
def save_preferences(req: PreferencesRequest, authorization: Optional[str] = Header(None)):
    user = require_user(authorization)
    saved = db.save_preferences(user["id"], req.data)
    return {"preferences": saved}


# ── Device Input Toggle ──

@app.post("/api/input/mic")
def toggle_mic(payload: InputToggleRequest):
    _device_state["mic"] = payload.active
    return {"device": "mic", "active": _device_state["mic"]}


@app.post("/api/input/camera")
def toggle_camera(payload: InputToggleRequest):
    _device_state["camera"] = payload.active
    return {"device": "camera", "active": _device_state["camera"]}


# ── Live sign / voice pipelines (FSL-105 + Collated) ──

def _sign_vision_health() -> dict:
    from .sign_dataset import dataset_health

    health = dataset_health()
    return {
        "ready": bool(health.get("ready")),
        "modelLoaded": bool(health.get("modelLoaded")),
        "message": health.get("message") or "Sign datasets loaded.",
        "collatedLetters": health.get("collatedLetters"),
        "fslClassCount": health.get("fslClassCount"),
        "visionReady": health.get("visionReady"),
    }


@app.get("/api/pipeline/status")
def pipeline_status():
    """Live translation pipelines backed by Collated + FSL-105."""
    vision = _sign_vision_health()
    return {
        "flows": {
            "sign_to_voice": {
                "steps": ["webcam", "dataset_match", "text", "browser_speech_synthesis"],
                "integrations": ["Collated A–Z", "FSL-105", "MediaPipe landmarks", "OpenCV"],
                "ready": vision["ready"],
                "vision": vision,
            },
            "voice_to_sign": {
                "steps": ["microphone", "browser_speech_recognition", "text", "dataset_clip"],
                "integrations": ["Web Speech API", "FSL-105 videos", "Collated alphabet images"],
                "ready": True,
            },
        }
    }


@app.get("/api/signs/catalog")
def signs_catalog():
    from .sign_dataset import catalog

    return catalog()


@app.post("/api/signs/resolve")
def signs_resolve(req: PipelineTextPayload):
    from .sign_dataset import resolve_text_to_signs

    return resolve_text_to_signs(req.text)


@app.get("/api/signs/media/letter/{letter}")
def signs_media_letter(letter: str):
    from .sign_dataset import pick_collated_image

    path = pick_collated_image(letter)
    if not path or not path.is_file():
        raise HTTPException(status_code=404, detail="Letter image not found")
    return FileResponse(path, media_type="image/jpeg")


@app.get("/api/signs/media/fsl/{label_id}")
def signs_media_fsl(label_id: int):
    from .sign_dataset import extract_fsl_thumb

    path = extract_fsl_thumb(label_id)
    if not path or not path.is_file():
        raise HTTPException(status_code=404, detail="FSL preview not found")
    return FileResponse(path, media_type="image/jpeg")


@app.post("/api/pipeline/sign-to-voice/recognize")
def pipeline_sign_to_voice_recognize(req: PipelineSignRecognizeRequest):
    """Live recognition against FSL-105 clips and Collated letter images."""
    from .sign_recognition import recognize_live

    try:
        batch = [f for f in (req.frames or []) if f and len(f) > 50]
        result = recognize_live(
            image_base64=req.image_base64,
            frames=batch,
            landmarks=req.landmarks,
            landmark_frames=req.landmark_frames,
        )
        result.update(
            {
                "stage": "image_recognition",
                "ready": True,
                "receivedFrames": len(batch),
                "receivedFrame": bool(req.image_base64 and len(req.image_base64) > 50),
                "integration": ["FSL-105", "Collated"],
            }
        )
        return result
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Recognition failed: {exc}") from exc


@app.post("/api/pipeline/sign-to-voice/speak")
def pipeline_sign_to_voice_speak(req: PipelineTextPayload):
    """Synthesize speech. Falls back directly to the client browser's native SpeechSynthesis API."""
    from .tts_service import synthesize_speech_base64

    text = (req.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="No text to speak.")

    audio_base64 = synthesize_speech_base64(text)
    payload = {
        "text": text,
        "stage": "text_to_voice",
        "ready": bool(audio_base64),
        "integration": ["Browser SpeechSynthesis API"],
    }
    if audio_base64:
        payload["audioBase64"] = audio_base64
        payload["audioMimeType"] = "audio/wav"
        payload["message"] = "Server TTS audio generated."
    else:
        payload["message"] = "Using native browser speechSynthesis."
    return payload


@app.post("/api/pipeline/voice-to-sign/transcribe")
def pipeline_voice_to_sign_transcribe(req: PipelineVoiceTranscribeRequest):
    """Browser Web Speech API does live STT; this acknowledges the pipeline."""
    return {
        "text": "",
        "stage": "voice_to_text",
        "ready": True,
        "useBrowserSpeech": True,
        "integration": ["Web Speech API"],
        "message": "Use the microphone — speech-to-text runs live in the browser.",
    }


@app.post("/api/pipeline/voice-to-sign/render")
def pipeline_voice_to_sign_render(req: PipelineTextPayload):
    """Map transcript text onto FSL-105 clips and Collated letter images."""
    from .sign_dataset import resolve_text_to_signs

    resolved = resolve_text_to_signs(req.text)
    first = resolved["matches"][0] if resolved["matches"] else None
    return {
        "text": resolved["text"],
        "imageUrl": first["imageUrl"] if first else None,
        "matches": resolved["matches"],
        "stage": "text_to_image",
        "ready": bool(first),
        "integration": ["FSL-105", "Collated"],
        "message": resolved["message"],
    }


# ── Static Files & Root Redirect ──

@app.get("/")
def root():
    """Landing page — marketing site; workspace is at /dashboards/guest.html."""
    return RedirectResponse(url="/index.html#home")


# Mount static files LAST so API routes take priority
STATIC_DIR = Path(__file__).resolve().parent.parent / "public"
if STATIC_DIR.exists():
    app.mount("/", StaticFiles(directory=str(STATIC_DIR), html=True), name="static")

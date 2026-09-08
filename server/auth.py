"""
Authentication utilities for Voice Ver Sign.
JWT token creation/validation and password hashing.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import time
import base64
import os

from dotenv import load_dotenv

load_dotenv()

SECRET_KEY = os.getenv("SECRET_KEY") or os.environ.get("VVS_SECRET", "voice_ver_sign-dev-secret-key-change-in-prod")
TOKEN_EXPIRY = 86400 * 7  # 7 days


def hash_password(password: str) -> str:
    salt = os.urandom(16).hex()
    hashed = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 100_000).hex()
    return f"{salt}:{hashed}"


def verify_password(password: str, stored_hash: str) -> bool:
    try:
        salt, hashed = stored_hash.split(":")
        check = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 100_000).hex()
        return hmac.compare_digest(check, hashed)
    except Exception:
        return False


def create_token(user_id: str) -> str:
    header = base64.urlsafe_b64encode(json.dumps({"alg": "HS256", "typ": "JWT"}).encode()).decode().rstrip("=")
    payload_data = {"sub": user_id, "exp": int(time.time()) + TOKEN_EXPIRY}
    payload = base64.urlsafe_b64encode(json.dumps(payload_data).encode()).decode().rstrip("=")
    signature = hmac.new(SECRET_KEY.encode(), f"{header}.{payload}".encode(), hashlib.sha256).hexdigest()
    return f"{header}.{payload}.{signature}"


def decode_token(token: str) -> str | None:
    """Returns user_id if token is valid, None otherwise."""
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return None
        header, payload, signature = parts
        expected_sig = hmac.new(SECRET_KEY.encode(), f"{header}.{payload}".encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(signature, expected_sig):
            return None
        # Pad base64
        padding = 4 - len(payload) % 4
        if padding != 4:
            payload += "=" * padding
        payload_data = json.loads(base64.urlsafe_b64decode(payload))
        if payload_data.get("exp", 0) < time.time():
            return None
        return payload_data.get("sub")
    except Exception:
        return None

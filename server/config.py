"""
Application configuration from environment variables.
Use a .env file locally (not committed) — see .env.example.
"""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

# Project root (voice_ver_sign/)
_ROOT = Path(__file__).resolve().parent.parent


def get_database_url() -> str:
    """
    SQLAlchemy URL.
    - Production examples:
      postgresql+psycopg2://user:pass@host:5432/voice_ver_sign
      mysql+pymysql://user:pass@localhost:3306/voice_ver_sign  (MySQL 8.0, e.g. XAMPP)
    """
    url = os.getenv("DATABASE_URL", "").strip()
    if url:
        return url

    # Requested configuration for MySQL
    mysql_host = os.getenv('MYSQL_HOST') or 'localhost'
    mysql_user = os.getenv('MYSQL_USER') or 'root'
    mysql_password = os.getenv('MYSQL_PASSWORD') or 'Lambofgod_666'
    mysql_db = os.getenv('MYSQL_DB') or 'hotel_management'

    return f"mysql+pymysql://{mysql_user}:{mysql_password}@{mysql_host}/{mysql_db}"


def is_sqlite(url: str) -> bool:
    return url.startswith("sqlite")


def get_cors_origins() -> list[str]:
    raw = os.getenv("CORS_ORIGINS", "").strip()
    parts = [o.strip() for o in raw.split(",") if o.strip()]
    # If the operator did not set CORS_ORIGINS, default to same-origin
    # (no Access-Control-Allow-Origin header is sent — the browser
    # blocks cross-origin XHR). For local dev, the demo is same-origin
    # anyway. To permit a specific origin, set CORS_ORIGINS=...
    if not parts:
        return []
    return parts

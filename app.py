"""
Voice Ver Sign — single entry point (run after activating your venv):

    python app.py

This file *is* the simple loader: it loads `.env`, then starts **uvicorn**.

Why uvicorn (and not `http.server`)?
--------------------------------------
The backend is **FastAPI**, which speaks **ASGI**. Something must run that protocol.
**Uvicorn** is that small server — it serves both `/api/...` (Python) and static files
from `public/`. Python’s built‑in `http.server` only serves files; it cannot run your
login/signup/chat APIs or database code. So for this project, uvicorn is required
unless you rewrite the whole backend (e.g. PHP/Node) or drop the API entirely.
"""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

_ROOT = Path(__file__).resolve().parent
load_dotenv(_ROOT / ".env")


def main() -> None:
    import uvicorn

    # Only watch source + static files — not .venv (avoids reload loops on Windows).
    reload = os.getenv("UVICORN_RELOAD", "true").strip().lower() in (
        "1",
        "true",
        "yes",
        "on",
    )
    reload_dirs = [str(_ROOT / "server"), str(_ROOT / "public")]

    uvicorn.run(
        "server.app:app",
        host=os.getenv("HOST", "0.0.0.0"),
        port=int(os.getenv("PORT", "5000")),
        reload=reload,
        reload_dirs=reload_dirs if reload else None,
    )


if __name__ == "__main__":
    main()

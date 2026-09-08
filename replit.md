# Voice2Sign (Replit / dev notes)

A voice-to-sign language web app: **HTML/CSS/JS** in `public/` and **FastAPI** in `server/`.

## Project structure

```
voice_ver_sign/
├── app.py                  # **Single entry:** loads .env, runs uvicorn (port 5000 by default)
├── requirements.txt
├── server/
│   ├── app.py              # FastAPI `app`, API routes, StaticFiles mount → public/
│   ├── auth.py
│   ├── config.py
│   ├── models.py
│   └── database.py
└── public/                 # Web UI
```

## Architecture

- **One process:** `python app.py` runs **uvicorn** with `server.app:app`, which serves **`public/`** and **`/api/*`** on the **same origin** (default **http://127.0.0.1:5000**).
- **Virtual environment:** use `.venv` and `pip install -r requirements.txt`, then `python app.py`.

## Workflows

- **Setup**: `scripts/setup.ps1` or `scripts/setup.sh` (creates venv + installs deps).
- **Start app**: `python app.py` → `http://127.0.0.1:5000/`
- **Database**: SQLite at `data/voice_ver_sign.db` by default, or `DATABASE_URL` for MySQL/PostgreSQL.
- **Health**: `GET /api/health`

## Deployment

Use a reverse proxy with **HTTPS** in production; set **`CORS_ORIGINS`**. Docker: `uvicorn server.app:app` (see `Dockerfile`). See **`README.md`**.

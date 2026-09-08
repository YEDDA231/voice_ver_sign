# Target software stack (aligned with project specification)

| Area | Technology |
|------|------------|
| **Developer OS** | Windows 11 / Linux (Ubuntu) |
| **IDE** | Visual Studio Code |
| **Backend** | Python 3.10+ (FastAPI, SQLAlchemy), Node.js 18+ (if you add a JS toolchain) |
| **Database** | **MySQL 8.0** (XAMPP / MySQL Workbench) — use `DATABASE_URL=mysql+pymysql://...` |
| **Persistence (this repo)** | SQLite (dev) or MySQL / PostgreSQL via `DATABASE_URL` |
| **AI / APIs** | Gradio / FastAPI for model services; **Whisper** (speech) as needed |
| **Vision** | **OpenCV** — install from `requirements-vision.txt` for server-side video/image processing |
| **Model evaluation** | Scikit-learn / TensorFlow suites (optional, separate from this web server) |

## OpenCV

```bash
pip install -r requirements-vision.txt
```

Use OpenCV in Python services (e.g. processing frames from the browser via uploads or future WebRTC). The browser still uses **getUserMedia** for camera/mic; OpenCV is for **backend** CV pipelines.

## MySQL 8.0 with this app

1. Create a database (e.g. `voice_ver_sign`) in MySQL Workbench or phpMyAdmin.
2. Install deps: `pip install -r requirements.txt` (includes `pymysql`).
3. In `.env`:  
   `DATABASE_URL=mysql+pymysql://USER:PASSWORD@127.0.0.1:3306/voice_ver_sign`
4. Start the app — tables are created on startup (`create_all`). For production, consider Alembic migrations (see `docs/DATABASE.md`).

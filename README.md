# Voice Ver Sign

Web app for voice ↔ sign language workflows. The **frontend is served by the same FastAPI process** as the API, so you run **one server** on localhost (or behind a reverse proxy in production).

## Project layout

```
voice_ver_sign/
├── .venv/                  # Python virtual environment (create locally — not committed)
├── app.py                  # **Run this** — loads .env, starts uvicorn (use with venv)
├── requirements.txt        # Pinned dependencies
├── .env.example            # Copy to .env for local secrets / DATABASE_URL
├── Dockerfile              # Container image (API + static UI)
├── docker-compose.yml      # Example: app + PostgreSQL
├── scripts/
│   ├── setup.ps1           # Windows: create venv + pip install
│   └── setup.sh            # Linux/macOS: same
├── server/
│   ├── app.py              # FastAPI app, routes, static mount
│   ├── auth.py             # JWT / password helpers
│   ├── config.py           # DATABASE_URL, CORS helpers
│   ├── models.py           # SQLAlchemy ORM models
│   └── database.py         # Engine, sessions, CRUD
├── docs/
│   ├── DATABASE.md         # DB / migrations notes
│   └── TECH_STACK.md       # Spec alignment (MySQL 8, OpenCV, Whisper, etc.)
└── public/                 # Static web app (only copy served at runtime)
    ├── index.html
    ├── dashboard.html      # Redirects to dashboards/hearing.html (legacy URL)
    ├── dashboards/         # Role-specific UIs (HTML + thin CSS hooks)
    │   ├── hearing.html
    │   ├── deaf.html
    │   └── admin.html
    ├── css/                # styles.css + dashboard-{hearing,deaf,admin}.css
    ├── js/                 # app.js, api.js, auth.js, dashboard-shared.js, dashboard-*.js (boot)
    ├── login.html
    └── ...
```

**Important:** The running app loads static files from **`public/`** only (`server/app.py`).

### Why does `app.py` start Uvicorn?

**FastAPI** is an **ASGI** app. It needs an ASGI server (**Uvicorn** is the usual choice) to handle `/api/...` (auth, chats, DB) and to serve `public/` on the same origin. Python’s **`http.server`** only serves static files and **cannot** run your API. **`app.py`** is already the minimal “loader”: load `.env` → run Uvicorn.

## Virtual environment (recommended)

Always use a **venv** so dependencies match production and don’t pollute global Python.  
**VS Code / Pylance:** the workspace is set to **`voice_ver_sign/.venv`** so imports like `sqlalchemy` resolve; if your OS differs, choose **Python: Select Interpreter** and point at `.venv` (Windows: `Scripts\python.exe`, Linux/macOS: `bin/python`).

### Windows (PowerShell)

```powershell
cd voice_ver_sign
.\scripts\setup.ps1
.\.venv\Scripts\Activate.ps1
python app.py
```

### Linux / macOS

```bash
cd voice_ver_sign
chmod +x scripts/setup.sh
./scripts/setup.sh
source .venv/bin/activate
python app.py
```

### Manual venv

```bash
cd voice_ver_sign
python -m venv .venv
# Windows: .\.venv\Scripts\activate
# Unix:    source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
python app.py
```

Default URL: **http://127.0.0.1:5000/** → **hearing dashboard** (`/dashboards/hearing.html`; `/dashboard.html` redirects there). After login, users are sent to **`/dashboards/{hearing|deaf|admin}.html`** by account type. Log in is optional (links in the header). Health: **GET** `/api/health`.

## Configuration (.env)

1. Copy **`.env.example`** → **`.env`** in `voice_ver_sign/`.
2. Optional variables:
   - **`DATABASE_URL`** — if unset, SQLite is used at **`data/voice_ver_sign.db`**.
   - **`VVS_SECRET`** — JWT signing key (**set a long random value in production**).
   - **`CORS_ORIGINS`** — comma-separated origins; defaults to empty (same-origin only). Use your real domain in production.
   - **`VVS_PUBLIC_BASE_URL`** — public base URL used in password-reset email links (e.g. `https://app.yourdomain.com`).
   - **`VVS_ENABLE_HSTS`** — `1` to send `Strict-Transport-Security` (only enable behind HTTPS).
   - **`VVS_CSP_REPORT_ONLY`** — `1` to send the CSP in `Report-Only` mode (useful when first rolling out a stricter policy).
   - **`VVS_CSP_EXTRA_ORIGINS`** — comma-separated extra origins to allow in `connect-src`.
   - **`VVS_DEV_MODE`** — `1` to mount the dev-only auto-login endpoint
     (`POST /api/auth/dev-auto-login`) and reveal the "Auto-login as admin"
     panel on the login page. **Never enable in production.** When set, the
     server will auto-seed an admin from `ADMIN_EMAIL` / `ADMIN_PASSWORD`
     (or fall back to `admin@voice_ver_sign.local` / `dev`).
   - **`HOST`** / **`PORT`** — bind address (default `0.0.0.0` / **`5000`**).

**`app.py`** loads **`.env`** automatically before starting the server.

## Security headers (HTTP hardening)

`server/security_headers.py` adds the following headers to every response:

- `Content-Security-Policy` (strict, same-origin)
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy`
- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Resource-Policy: same-origin`
- `Cache-Control: no-store` on HTML responses
- `Strict-Transport-Security` (only when `VVS_ENABLE_HSTS=1`)

See `docs/DESIGN.md` for the policy values and tunables.

### Dev auto-reload (uvicorn)

Reload **only** watches **`server/`** and **`public/`**, so edits under **`.venv`** don’t trigger endless restarts. If you still want no reload: **`UVICORN_RELOAD=false`** in `.env` or run production-style:

`uvicorn server.app:app --host 0.0.0.0 --port 5000` (no `--reload`).

## Database (SQLite, MySQL 8, or PostgreSQL)

- **Local dev (default):** SQLite at **`data/voice_ver_sign.db`** — no extra setup; tables are created on startup.
- **MySQL 8.0** (XAMPP / Workbench): `pip install -r requirements.txt` includes **`pymysql`**. Set e.g.  
  `DATABASE_URL=mysql+pymysql://user:pass@127.0.0.1:3306/voice_ver_sign`
- **PostgreSQL:** e.g. `DATABASE_URL=postgresql+psycopg2://user:pass@host:5432/voice_ver_sign`

See **`.env.example`**, **`docs/DATABASE.md`**, **`docs/TECH_STACK.md`**, **`docs/PIPELINE.md`**, and **`docs/DESIGN.md`** (role dashboards, mic UX, responsive notes).

## Docker (deployment-ready)

**SQLite inside the container** (quick demo):

```bash
docker build -t voice_ver_sign .
docker run -p 8000:8000 -e VVS_SECRET=your-secret voice_ver_sign
```

Open **http://127.0.0.1:8000/**.

**PostgreSQL** (example compose file included):

```bash
docker compose up --build
```

App listens on **8000**; Postgres is wired via `DATABASE_URL` in `docker-compose.yml`.

## Production checklist

1. **venv or container** with pinned `requirements.txt`.
2. **`VVS_SECRET`** and **`DATABASE_URL`** via environment (not files in `public/`).
3. **HTTPS** at the reverse proxy; set **`CORS_ORIGINS`** to your site only.
4. **Persist** SQLite volume or use PostgreSQL with backups.
5. Optional: **Gunicorn** + Uvicorn workers, e.g.  
   `gunicorn server.app:app -k uvicorn.workers.UvicornWorker -b 0.0.0.0:8000`

## Step-by-Step Implementation Guides

### 1. Email Integration (Password Reset)
The backend is already prepared with an `smtplib` implementation snippet inside the `/api/auth/forgot-password` route in `server/app.py`. To activate it:
1. **Update `server/app.py`:** Go to line ~190 in `server/app.py` and remove the multi-line string quotes (`"""`) wrapped around the email sending code.
2. **Generate an App Password:** If using Gmail, go to your Google Account -> Security -> 2-Step Verification -> App Passwords and generate a new password. Do not use your actual account password.
3. **Set Environment Variables:** Add your credentials to your `.env` file:
   ```env
   SMTP_USER=your-email@gmail.com
   SMTP_PASS=your-generated-app-password
   ```
4. **Restart the Server:** Your `/api/auth/forgot-password` endpoint will now fire actual emails containing the reset link token.

### 2. MySQL Database Integration
The app currently falls back to a local SQLite file (`voice_ver_sign.db`) if it cannot connect to MySQL. To properly connect to MySQL Workbench:
1. **Install MySQL & Workbench:** Ensure your MySQL service (e.g., via XAMPP, WAMP, or standalone) is installed and running on port `3306`.
2. **Create the Database:** Open MySQL Workbench and run `CREATE DATABASE hotel_management;` (or whichever database name you prefer).
3. **Set Environment Variables:** In your `.env` file, define the connection details:
   ```env
   MYSQL_HOST=localhost
   MYSQL_USER=root
   MYSQL_PASSWORD=your_password_here
   MYSQL_DB=hotel_management
   ```
4. **Sync Schema:** Restart the FastAPI backend (`python app.py`). SQLAlchemy will automatically detect the database and create all necessary tables (`users`, `chats`, `messages`, `preferences`).

### 3. Required APIs & Integrations for Full Functionality
To convert the current UI into a fully working, production-ready system, you will need to integrate the following external APIs and Machine Learning models into the `server/app.py` pipeline routes:

#### A. Voice $\rightarrow$ Sign Translation Pipeline
1. **Speech-to-Text (Transcribing Voice)**
   - **Recommendation:** **OpenAI Whisper API** (Fastest, highest accuracy) or Google Cloud Speech-to-Text.
   - **Local Alternative:** Run `whisper` locally on a GPU.
2. **Text-to-Sign (Visualizing Signs)**
   - **Recommendation:** You will need an API that maps English text to Sign Language Glosses, and then plays back 3D avatar animations or stitches pre-recorded video clips. Companies like **Signum** or custom **WebGL/Unity Avatar** integrations are standard here.

#### B. Sign $\rightarrow$ Voice Translation Pipeline
1. **Computer Vision (Recognizing Signs)**
   - **Recommendation:** Connect the webcam frame stream to **Google MediaPipe** (for hand/pose tracking keypoints) fed into a custom trained LSTM/Transformer model (like TensorFlow/PyTorch) that translates hand movements into english words.
2. **Text-to-Speech (Speaking the Translation out loud)**
   - **Recommendation:** **ElevenLabs API** (for highly realistic, natural voices) or Google Cloud TTS. 
   - **Local Alternative:** `pyttsx3` or `Coqui TTS`.

#### C. Monetization & Infrastructure
1. **Payment Gateway (For Subscriptions)**
   - **Recommendation:** **Stripe API**. You will need to build Stripe Checkout webhooks into FastAPI to upgrade user tiers in the database automatically when they successfully pay.
2. **Cloud Storage (For Pro User File Uploads)**
   - **Recommendation:** **AWS S3** or **Cloudinary**. Do not store large user images or files directly on your server disk; use S3 buckets and save the URLs in your database.
3. **Email Provider (For Password Resets)**
   - **Recommendation:** **SendGrid**, **Mailgun**, or **AWS SES**. While `smtplib` via a Gmail App Password works well for testing, production apps should use dedicated email APIs to prevent reset emails from going to Spam folders.

### 4. Final Deployment Recommendations & Step-by-Step Guides
Before deploying Voice Ver Sign to a live Linux server (e.g., Ubuntu on AWS EC2 or DigitalOcean), ensure the following furnishings are complete.

#### 1. Change the Secret Key
You must secure your JWT tokens so users cannot forge admin accounts.
1. Open your terminal or command prompt.
2. Run `python -c "import secrets; print(secrets.token_hex(32))"` to generate a completely random, secure 64-character string.
3. Open your `.env` file on the server.
4. Replace the old key with the new one: `VVS_SECRET=your_new_random_string_here`.
5. Restart your FastAPI server.

#### 2. Set Up a Reverse Proxy (HTTPS with NGINX)
Because the app uses `navigator.mediaDevices.getUserMedia()` for the webcam and microphone, modern browsers **strictly require HTTPS**. If you serve this over HTTP, the browser will block the camera entirely.
1. Map your domain (e.g., `app.yourdomain.com`) to your server's IP address using your DNS provider.
2. Install NGINX: `sudo apt update && sudo apt install nginx`.
3. Create a configuration file: `sudo nano /etc/nginx/sites-available/voice_ver_sign` and paste this block:
   ```nginx
   server {
       server_name app.yourdomain.com;
       location / {
           proxy_pass http://127.0.0.1:5000; # Forward requests to your local Python server
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
       }
   }
   ```
4. Enable the site: `sudo ln -s /etc/nginx/sites-available/voice_ver_sign /etc/nginx/sites-enabled/` and restart NGINX: `sudo systemctl restart nginx`.
5. Install Certbot to get a free SSL certificate: `sudo apt install certbot python3-certbot-nginx`.
6. Run Certbot to automatically configure HTTPS: `sudo certbot --nginx -d app.yourdomain.com`.

#### 3. Run with Gunicorn (Production Server)
Running `python app.py` directly is fine for testing, but in production, it will crash under heavy traffic. You need Gunicorn to manage multiple workers.
1. Ensure your virtual environment is activated and install Gunicorn: `pip install gunicorn uvicorn`.
2. Create a Systemd service to run your app in the background permanently: `sudo nano /etc/systemd/system/voice_ver_sign.service`
3. Paste the following configuration (update `/path/to/` with your actual directory):
   ```ini
   [Unit]
   Description=Gunicorn process for Voice Ver Sign
   After=network.target

   [Service]
   User=ubuntu
   Group=www-data
   WorkingDirectory=/path/to/voice_ver_sign
   Environment="PATH=/path/to/voice_ver_sign/.venv/bin"
   ExecStart=/path/to/voice_ver_sign/.venv/bin/gunicorn server.app:app -w 4 -k uvicorn.workers.UvicornWorker -b 127.0.0.1:5000

   [Install]
   WantedBy=multi-user.target
   ```
4. Enable and start the service: 
   - `sudo systemctl daemon-reload`
   - `sudo systemctl enable voice_ver_sign`
   - `sudo systemctl start voice_ver_sign`

#### 4. Implement a Task Queue (Redis + Celery)
If you decide to run heavy machine learning models (like Whisper or MediaPipe) locally on your own server instead of using APIs, you must push that heavy processing to the background so your web server doesn't freeze the UI for other users.
1. Install Redis on your server: `sudo apt install redis-server`.
2. Start Redis: `sudo systemctl enable redis-server && sudo systemctl start redis-server`.
3. Install Celery in your python environment: `pip install celery redis`.
4. Create a `celery_app.py` wrapper file in your `server/` directory:
   ```python
   from celery import Celery
   celery = Celery('voice_ver_sign', broker='redis://localhost:6379/0', backend='redis://localhost:6379/0')

   @celery.task
   def process_video_frame_job(frame_data):
       # Put your heavy MediaPipe / translation logic here!
       return "Translated Text"
   ```
5. In your `server/app.py`, instead of processing the frame directly, you push it to the queue: `process_video_frame_job.delay(req.image_base64)`.
6. Run the Celery worker in a separate terminal or as another Systemd service: `celery -A server.celery_app worker --loglevel=info`.

## Security model (browser)

- No user-editable API/WebSocket URLs — same-origin **`fetch("/api/...")`** only.
- JWT in `localStorage` is convenient for demos; production often prefers **httpOnly cookies** + HTTPS.

## Camera and microphone

- **localhost** / **127.0.0.1:** HTTP is usually allowed for getUserMedia.
- **Other hosts:** serve the app over **HTTPS**.

## License

See repository owner for license terms.

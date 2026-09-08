# Production-style image: single process serves API + static files
FROM python:3.12-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

COPY requirements.txt .
RUN pip install --upgrade pip && pip install -r requirements.txt

COPY server ./server
COPY public ./public

# SQLite persistence (mount a volume at /app/data in production)
RUN mkdir -p /app/data

EXPOSE 8000

# Load env at runtime; DATABASE_URL can point to PostgreSQL instead
CMD ["uvicorn", "server.app:app", "--host", "0.0.0.0", "--port", "8000"]

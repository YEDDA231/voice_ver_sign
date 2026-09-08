# Database integration

## Stack

- **ORM:** SQLAlchemy 2.x (`server/models.py`, `server/database.py`)
- **Default:** SQLite file at `data/voice_ver_sign.db` (created automatically)
- **Production:** Set **`DATABASE_URL`** to PostgreSQL, e.g.  
  `postgresql+psycopg2://USER:PASS@HOST:5432/DBNAME`

Tables are created on app startup via `Base.metadata.create_all()` (see `db.init_db()` in the FastAPI lifespan).

## Schema (overview)

| Table            | Purpose                          |
|------------------|----------------------------------|
| `users`          | Accounts (email, password hash, profile) |
| `chats`          | Conversations per user           |
| `messages`       | Chat messages (user + assistant) |
| `user_preferences` | JSON blob per user (UI prefs) |

## Migrations (optional next step)

For teams that need versioned schema changes, add **Alembic**:

```bash
.venv\Scripts\activate   # or source .venv/bin/activate
pip install alembic
alembic init alembic
```

Point Alembic’s `env.py` at the same `DATABASE_URL` / engine as `server/database.py`, then replace unconditional `create_all` in production with `alembic upgrade head` in your deploy pipeline.

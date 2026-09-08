"""
Database access layer (SQLAlchemy).
Configure with DATABASE_URL — SQLite file by default, or PostgreSQL in production.
"""
from __future__ import annotations

import uuid
from contextlib import contextmanager
from datetime import datetime
from typing import Generator

from sqlalchemy import create_engine, func, select
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.exc import OperationalError

from . import config
from .models import Base, Chat, Message, User, UserPreference


_engine: Engine | None = None
_SessionLocal: sessionmaker[Session] | None = None


def get_engine() -> Engine:
    global _engine
    if _engine is None:
        url = config.get_database_url()
        kwargs: dict = {"echo": False}
        if config.is_sqlite(url):
            kwargs["connect_args"] = {"check_same_thread": False}
        else:
            kwargs["pool_pre_ping"] = True
            
        temp_engine = create_engine(url, **kwargs)
        
        if not config.is_sqlite(url):
            try:
                with temp_engine.connect() as conn:
                    pass
                _engine = temp_engine
            except Exception as e:
                print(f"\n--- DATABASE WARNING ---")
                print(f"Could not connect to MySQL database.")
                print("Make sure your MySQL server is running and the database exists if you want to use it.")
                print("Falling back to local SQLite database: sqlite:///./voice_ver_sign.db")
                print(f"------------------------\n")
                fallback_url = "sqlite:///./voice_ver_sign.db"
                _engine = create_engine(fallback_url, connect_args={"check_same_thread": False})
        else:
            _engine = temp_engine
            
    return _engine


def get_session_factory() -> sessionmaker[Session]:
    global _SessionLocal
    if _SessionLocal is None:
        _SessionLocal = sessionmaker(
            autocommit=False,
            autoflush=False,
            bind=get_engine(),
        )
    return _SessionLocal


@contextmanager
def session_scope() -> Generator[Session, None, None]:
    """Transactional scope — commit on success, rollback on error."""
    factory = get_session_factory()
    session = factory()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def init_db() -> None:
    """Create tables if they do not exist (dev / single-node deploy). Use Alembic for controlled migrations in larger teams."""
    engine = get_engine()
    Base.metadata.create_all(bind=engine)


def _user_to_dict(user: User) -> dict:
    return {
        "id": user.id,
        "email": user.email,
        "password_hash": user.password_hash,
        "name": user.name,
        "user_type": user.user_type,
        "created_at": user.created_at.isoformat() if user.created_at else None,
    }


def _chat_to_dict(chat: Chat) -> dict:
    return {
        "id": chat.id,
        "user_id": chat.user_id,
        "title": chat.title,
        "pinned": chat.pinned,
        "created_at": chat.created_at.isoformat() if chat.created_at else None,
    }


def _msg_to_dict(msg: Message) -> dict:
    return {
        "id": msg.id,
        "chat_id": msg.chat_id,
        "role": msg.role,
        "content": msg.content,
        "created_at": msg.created_at.isoformat() if msg.created_at else None,
    }


# ── Users ──


def create_user(email: str, password_hash: str, name: str, user_type: str = "hearing") -> dict:
    user_id = str(uuid.uuid4())
    with session_scope() as session:
        user = User(
            id=user_id,
            email=email.lower().strip(),
            password_hash=password_hash,
            name=name,
            user_type=user_type,
            created_at=datetime.utcnow(),
        )
        session.add(user)
        session.flush()
        return _user_to_dict(user)


def get_user_by_email(email: str) -> dict | None:
    email = email.lower().strip()
    with session_scope() as session:
        user = session.scalar(select(User).where(User.email == email))
        return _user_to_dict(user) if user else None


def get_user_by_id(user_id: str) -> dict | None:
    with session_scope() as session:
        user = session.get(User, user_id)
        return _user_to_dict(user) if user else None


# ── Chats ──


def get_chats(user_id: str) -> list[dict]:
    with session_scope() as session:
        rows = session.scalars(
            select(Chat).where(Chat.user_id == user_id).order_by(Chat.created_at.desc())
        ).all()
        return [_chat_to_dict(c) for c in rows]


def create_chat(user_id: str, title: str = "New conversation") -> dict:
    chat_id = str(uuid.uuid4())
    with session_scope() as session:
        chat = Chat(
            id=chat_id,
            user_id=user_id,
            title=title,
            pinned=False,
            created_at=datetime.utcnow(),
        )
        session.add(chat)
        session.flush()
        return _chat_to_dict(chat)


def delete_chat(chat_id: str, user_id: str) -> bool:
    with session_scope() as session:
        chat = session.get(Chat, chat_id)
        if not chat or chat.user_id != user_id:
            return False
        session.delete(chat)
        return True


def toggle_pin_chat(chat_id: str, user_id: str) -> dict | None:
    with session_scope() as session:
        chat = session.get(Chat, chat_id)
        if not chat or chat.user_id != user_id:
            return None
        chat.pinned = not chat.pinned
        session.flush()
        return _chat_to_dict(chat)


# ── Messages ──


def add_message(chat_id: str, role: str, content: str) -> dict:
    msg_id = str(uuid.uuid4())
    with session_scope() as session:
        msg = Message(
            id=msg_id,
            chat_id=chat_id,
            role=role,
            content=content,
            created_at=datetime.utcnow(),
        )
        session.add(msg)
        session.flush()
        return _msg_to_dict(msg)


def get_messages(chat_id: str) -> list[dict]:
    with session_scope() as session:
        rows = session.scalars(
            select(Message).where(Message.chat_id == chat_id).order_by(Message.created_at.asc())
        ).all()
        return [_msg_to_dict(m) for m in rows]


# ── Preferences ──


def get_preferences(user_id: str) -> dict:
    with session_scope() as session:
        pref = session.get(UserPreference, user_id)
        if not pref or pref.data is None:
            return {}
        return dict(pref.data)


def save_preferences(user_id: str, data: dict) -> dict:
    with session_scope() as session:
        pref = session.get(UserPreference, user_id)
        if pref is None:
            pref = UserPreference(user_id=user_id, data=dict(data))
            session.add(pref)
        else:
            pref.data = dict(data)
        session.flush()
        return dict(data)


# ── Admin / metrics (optional) ──


def count_users() -> int:
    with session_scope() as session:
        n = session.scalar(select(func.count()).select_from(User))
        return int(n or 0)


def count_chats() -> int:
    with session_scope() as session:
        n = session.scalar(select(func.count()).select_from(Chat))
        return int(n or 0)


def count_users_by_type(user_type: str) -> int:
    with session_scope() as session:
        n = session.scalar(select(func.count()).select_from(User).where(User.user_type == user_type))
        return int(n or 0)


def get_all_users() -> list[dict]:
    with session_scope() as session:
        rows = session.scalars(select(User).order_by(User.created_at.desc())).all()
        return [_user_to_dict(u) for u in rows]


def delete_user(user_id: str) -> bool:
    with session_scope() as session:
        user = session.get(User, user_id)
        if not user:
            return False
        # Chats and user_preferences relationships are configured with cascade delete in models.py,
        # but to be safe and thorough:
        chats = session.scalars(select(Chat).where(Chat.user_id == user_id)).all()
        for chat in chats:
            session.delete(chat)
        pref = session.get(UserPreference, user_id)
        if pref:
            session.delete(pref)
        session.delete(user)
        return True


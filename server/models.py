"""Modelos SQLAlchemy 2.x y sesión de base de datos de NexoIT.

Una sola tabla por ahora: `users` (clientes y administradores).
La base es SQLite local; el archivo está ignorado por git (*.sqlite3).
"""

from __future__ import annotations

import os
from datetime import datetime
from pathlib import Path

from sqlalchemy import DateTime, Integer, String, create_engine, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker

# Ruta de la base: server/app.sqlite3 (override con NEXOIT_DB).
DB_PATH = Path(os.environ.get("NEXOIT_DB") or Path(__file__).with_name("app.sqlite3"))
DATABASE_URL = f"sqlite:///{DB_PATH.as_posix()}"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
    future=True,
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    """Base declarativa de SQLAlchemy 2.x."""


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    nombre: Mapped[str] = mapped_column(String(120), nullable=False)
    rol: Mapped[str] = mapped_column(String(20), nullable=False, default="cliente")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    def __repr__(self) -> str:  # pragma: no cover - ayuda de depuración
        return f"<User {self.email} ({self.rol})>"


def init_db() -> None:
    """Crea las tablas si no existen (se llama al iniciar la app)."""
    Base.metadata.create_all(bind=engine)


def get_db():
    """Dependencia de FastAPI: sesión por request, siempre cerrada."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

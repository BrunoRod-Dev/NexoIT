"""Modelos SQLAlchemy 2.x y sesión de base de datos de NexoIT.

Una sola tabla por ahora: `users` (clientes y administradores).
La base es SQLite local; el archivo está ignorado por git (*.sqlite3).
"""

from __future__ import annotations

import os
from datetime import datetime
from pathlib import Path

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    create_engine,
    func,
)
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


class Consulta(Base):
    """Consulta enviada desde el sitio (anónima o vinculada a una cuenta)."""

    __tablename__ = "consultas"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id"), nullable=True, index=True
    )
    nombre: Mapped[str] = mapped_column(String(120), nullable=False)
    email: Mapped[str] = mapped_column(String(320), nullable=False, index=True)
    mensaje: Mapped[str] = mapped_column(Text, nullable=False)
    estado: Mapped[str] = mapped_column(String(20), nullable=False, default="nueva")
    config_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    def __repr__(self) -> str:  # pragma: no cover - ayuda de depuración
        return f"<Consulta {self.id} {self.email} ({self.estado})>"


class Diseno(Base):
    """Casa guardada desde el configurador (JSON completo del estado)."""

    __tablename__ = "disenos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"), nullable=False, index=True
    )
    nombre: Mapped[str] = mapped_column(String(120), nullable=False)
    data: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    def __repr__(self) -> str:  # pragma: no cover - ayuda de depuración
        return f"<Diseno {self.id} user={self.user_id}>"


def init_db() -> None:
    """Crea las tablas si no existen y aplica mini-migraciones (SQLite)."""
    Base.metadata.create_all(bind=engine)
    migrate_schema(engine)


def migrate_schema(bind) -> None:
    """Agrega columnas nuevas a tablas existentes (create_all no altera)."""
    with bind.connect() as conn:
        rows = conn.exec_driver_sql("PRAGMA table_info(consultas)").fetchall()
        columns = [row[1] for row in rows]
        if columns and "config_json" not in columns:
            conn.exec_driver_sql("ALTER TABLE consultas ADD COLUMN config_json TEXT")
            conn.commit()


def get_db():
    """Dependencia de FastAPI: sesión por request, siempre cerrada."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

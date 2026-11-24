"""Autenticación, sesiones y CSRF de NexoIT.

- Passwords con bcrypt (passlib).
- Sesión en cookie firmada por SessionMiddleware (httpOnly, samesite=lax).
- CSRF: token por sesión en hidden input, verificado en cada POST.
- Dependencias `require_auth` / `require_admin` usadas por las rutas.
"""

from __future__ import annotations

import re
import secrets

from fastapi import Depends, Request
from passlib.context import CryptContext
from sqlalchemy import select
from sqlalchemy.orm import Session

from models import User, get_db

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$")
MIN_PASSWORD_LENGTH = 8
ROLES = ("cliente", "admin")


class AuthRequired(Exception):
    """Se lanza cuando falta sesión; main.py la convierte en redirect al login."""

    def __init__(self, next_url: str = "/app/perfil") -> None:
        self.next_url = next_url


class AdminRequired(Exception):
    """Se lanza cuando el usuario no es admin; main.py devuelve 403."""


# --- Passwords -------------------------------------------------------------


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return pwd_context.verify(password, password_hash)
    except (ValueError, TypeError):
        return False


# --- Validaciones ----------------------------------------------------------


def normalize_email(email: str) -> str:
    return (email or "").strip().lower()


def valid_email(email: str) -> bool:
    email = normalize_email(email)
    return len(email) <= 255 and bool(EMAIL_RE.match(email))


def valid_password(password: str) -> bool:
    return len(password or "") >= MIN_PASSWORD_LENGTH


# --- Consultas -------------------------------------------------------------


def get_user_by_email(db: Session, email: str) -> User | None:
    return db.scalar(select(User).where(User.email == normalize_email(email)))


def create_user(
    db: Session,
    *,
    email: str,
    password: str,
    nombre: str,
    rol: str = "cliente",
) -> User:
    user = User(
        email=normalize_email(email),
        password_hash=hash_password(password),
        nombre=(nombre or "").strip(),
        rol=rol if rol in ROLES else "cliente",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def authenticate(db: Session, email: str, password: str) -> User | None:
    user = get_user_by_email(db, email)
    if user is None:
        return None
    if not verify_password(password, user.password_hash):
        return None
    return user


# --- Sesión ----------------------------------------------------------------


def current_user(request: Request, db: Session) -> User | None:
    user_id = request.session.get("user_id")
    if not user_id:
        return None
    return db.get(User, user_id)


def login_session(request: Request, user: User) -> None:
    """Inicia sesión y rota el token CSRF (evita fijación de token)."""
    request.session.clear()
    request.session["user_id"] = user.id
    request.session["csrf_token"] = secrets.token_urlsafe(32)


def logout_session(request: Request) -> None:
    request.session.clear()


def require_auth(
    request: Request,
    db: Session = Depends(get_db),
) -> User:
    user = current_user(request, db)
    if user is None:
        target = request.url.path
        if request.url.query:
            target = f"{target}?{request.url.query}"
        raise AuthRequired(target)
    return user


def require_admin(user: User = Depends(require_auth)) -> User:
    if user.rol != "admin":
        raise AdminRequired()
    return user


# --- CSRF ------------------------------------------------------------------


def ensure_csrf(request: Request) -> str:
    token = request.session.get("csrf_token")
    if not token:
        token = secrets.token_urlsafe(32)
        request.session["csrf_token"] = token
    return token


def verify_csrf(request: Request, token: str | None) -> bool:
    expected = request.session.get("csrf_token")
    if not expected or not token:
        return False
    return secrets.compare_digest(str(expected), str(token))

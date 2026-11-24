"""NexoIT · Área de clientes (FastAPI + Jinja2 + SQLite).

Levantar en desarrollo:
    uvicorn main:app --reload --port 8000

Sitio estático: se sirven sólo las tres páginas whitelisteadas con FileResponse
(montar el repo raíz expondría el código del server). `assets/` se monta como
estático porque no contiene código.
"""

from __future__ import annotations

import os
import sys
from contextlib import asynccontextmanager
from pathlib import Path
from urllib.parse import quote

from fastapi import Depends, FastAPI, Form, Request
from fastapi.responses import FileResponse, HTMLResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from sqlalchemy import select
from sqlalchemy.orm import Session
from starlette.middleware.sessions import SessionMiddleware

import auth
from models import User, get_db, init_db

BASE_DIR = Path(__file__).resolve().parent
SITE_DIR = BASE_DIR.parent

# --- Secret de sesión: fail fast fuera de desarrollo -------------------------
# NEXOIT_SECRET_KEY es obligatoria. Única excepción: NEXOIT_ENV=dev (local),
# que habilita un secreto de desarrollo con warning ruidoso.
ENV = (os.environ.get("NEXOIT_ENV") or "").strip().lower()
SECRET_KEY = (os.environ.get("NEXOIT_SECRET_KEY") or "").strip()

if not SECRET_KEY:
    if ENV == "dev":
        SECRET_KEY = "nexoit-dev-insecure-secret-change-me"
        print(
            "WARNING: NEXOIT_ENV=dev sin NEXOIT_SECRET_KEY. "
            "Usando un secreto de desarrollo inseguro; no exponer este proceso.",
            file=sys.stderr,
            flush=True,
        )
    else:
        raise RuntimeError(
            "NEXOIT_SECRET_KEY no está definida. Definí la variable de entorno "
            "con un valor largo y aleatorio antes de arrancar "
            "(o usá NEXOIT_ENV=dev para desarrollo local)."
        )

SESSION_MAX_AGE = 60 * 60 * 8  # 8 horas


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


app = FastAPI(
    title="NexoIT · Área de clientes",
    lifespan=lifespan,
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)

app.add_middleware(
    SessionMiddleware,
    secret_key=SECRET_KEY,
    session_cookie="nexoit_session",
    max_age=SESSION_MAX_AGE,
    same_site="lax",
    https_only=False,  # poner en True detrás de HTTPS
)

# Sitio: sólo assets estáticos + páginas whitelisteadas (nunca el repo entero).
app.mount("/assets", StaticFiles(directory=SITE_DIR / "assets"), name="assets")
app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")

templates = Jinja2Templates(directory=str(BASE_DIR / "templates"))


def render(request: Request, name: str, status_code: int = 200, **context):
    """Renderiza una plantilla con user/csrf siempre disponibles."""
    context.setdefault("user", None)
    context.setdefault("csrf_token", auth.ensure_csrf(request))
    return templates.TemplateResponse(
        request=request,
        name=name,
        context=context,
        status_code=status_code,
    )


def safe_next(next_url: str | None) -> str:
    """Evita open redirect: sólo rutas internas de la app."""
    if next_url and next_url.startswith("/app/") and not next_url.startswith("//"):
        return next_url
    return "/app/perfil"


# --- Sitio estático (whitelist) --------------------------------------------


@app.get("/", include_in_schema=False)
def site_index() -> FileResponse:
    return FileResponse(SITE_DIR / "index.html")


@app.get("/index.html", include_in_schema=False)
def site_index_explicit() -> FileResponse:
    # Alias explícito: los links "Volver a NexoIT" apuntan a /index.html y
    # ../index.html; bajo file:// funciona, bajo el server necesita esta ruta.
    return FileResponse(SITE_DIR / "index.html")


@app.get("/grow/index.html", include_in_schema=False)
def site_grow() -> FileResponse:
    return FileResponse(SITE_DIR / "grow" / "index.html")


@app.get("/home/index.html", include_in_schema=False)
def site_home() -> FileResponse:
    return FileResponse(SITE_DIR / "home" / "index.html")


# --- Área de clientes ------------------------------------------------------


@app.get("/app", include_in_schema=False)
def app_root() -> RedirectResponse:
    return RedirectResponse("/app/perfil", status_code=302)


@app.get("/app/login", response_class=HTMLResponse)
def login_form(
    request: Request,
    next: str = "",
    db: Session = Depends(get_db),
):
    user = auth.current_user(request, db)
    if user is not None:
        return RedirectResponse(safe_next(next), status_code=302)
    return render(request, "login.html", next_url=safe_next(next), email="")


@app.post("/app/login", response_class=HTMLResponse)
def login_submit(
    request: Request,
    email: str = Form(""),
    password: str = Form(""),
    csrf_token: str = Form(""),
    next: str = Form(""),
    db: Session = Depends(get_db),
):
    target = safe_next(next)
    if not auth.verify_csrf(request, csrf_token):
        return render(
            request,
            "login.html",
            status_code=400,
            error="La sesión expiró. Probá de nuevo.",
            email=email,
            next_url=target,
        )

    user = auth.authenticate(db, email, password)
    if user is None:
        return render(
            request,
            "login.html",
            status_code=401,
            error="Email o contraseña incorrectos.",
            email=email,
            next_url=target,
        )

    auth.login_session(request, user)
    return RedirectResponse(target, status_code=302)


@app.get("/app/registro", response_class=HTMLResponse)
def register_form(request: Request, db: Session = Depends(get_db)):
    user = auth.current_user(request, db)
    if user is not None:
        return RedirectResponse("/app/perfil", status_code=302)
    return render(request, "registro.html", nombre="", email="")


@app.post("/app/registro", response_class=HTMLResponse)
def register_submit(
    request: Request,
    nombre: str = Form(""),
    email: str = Form(""),
    password: str = Form(""),
    csrf_token: str = Form(""),
    db: Session = Depends(get_db),
):
    nombre = (nombre or "").strip()
    email = auth.normalize_email(email)

    def fail(message: str, status_code: int = 400):
        return render(
            request,
            "registro.html",
            status_code=status_code,
            error=message,
            nombre=nombre,
            email=email,
        )

    if not auth.verify_csrf(request, csrf_token):
        return fail("La sesión expiró. Probá de nuevo.")

    if len(nombre) < 2 or len(nombre) > 120:
        return fail("Contanos tu nombre (entre 2 y 120 caracteres).")
    if not auth.valid_email(email):
        return fail("Revisá el email: no parece válido.")
    if not auth.valid_password(password):
        return fail("La contraseña necesita al menos 8 caracteres.")
    if len(password.encode("utf-8")) > 72:
        return fail("La contraseña no puede superar los 72 caracteres.")
    if auth.get_user_by_email(db, email) is not None:
        return fail("Ya existe una cuenta con ese email. Probá ingresar.", status_code=409)

    user = auth.create_user(db, email=email, password=password, nombre=nombre, rol="cliente")
    auth.login_session(request, user)
    return RedirectResponse("/app/perfil", status_code=302)


@app.get("/app/perfil", response_class=HTMLResponse)
def profile(
    request: Request,
    user: User = Depends(auth.require_auth),
):
    return render(request, "perfil.html", user=user)


@app.get("/app/admin", response_class=HTMLResponse)
def admin(
    request: Request,
    user: User = Depends(auth.require_admin),
    db: Session = Depends(get_db),
):
    users = db.scalars(
        select(User).order_by(User.created_at.desc(), User.id.desc())
    ).all()
    return render(request, "admin.html", user=user, users=users)


@app.post("/app/logout")
def logout(request: Request, csrf_token: str = Form("")):
    if not auth.verify_csrf(request, csrf_token):
        return HTMLResponse(
            "<h1>400</h1><p>Token CSRF inválido.</p><p><a href=\"/app/perfil\">Volver</a></p>",
            status_code=400,
        )
    auth.logout_session(request)
    return RedirectResponse("/", status_code=302)


@app.get("/app/logout", include_in_schema=False)
def logout_get() -> RedirectResponse:
    # Sin estado: un GET nunca cierra sesión.
    return RedirectResponse("/app/perfil", status_code=302)


# --- Errores de acceso -----------------------------------------------------


@app.exception_handler(auth.AuthRequired)
async def handle_auth_required(request: Request, exc: auth.AuthRequired):
    target = quote(exc.next_url, safe="/")
    return RedirectResponse(f"/app/login?next={target}", status_code=302)


@app.exception_handler(auth.AdminRequired)
async def handle_admin_required(request: Request, exc: auth.AdminRequired):
    return HTMLResponse(forbidden_page(request), status_code=403)


def forbidden_page(request: Request) -> str:
    return f"""<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Acceso restringido · NexoIT</title>
  <meta name="theme-color" content="#0b1220">
  <link rel="icon" href="/assets/img/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="/assets/css/tokens.css">
  <link rel="stylesheet" href="/assets/css/base.css">
  <link rel="stylesheet" href="/assets/css/components.css">
  <link rel="stylesheet" href="/static/app.css">
</head>
<body>
  <main id="contenido" class="app-main">
    <section class="section" aria-labelledby="forbidden-title">
      <div class="section__head">
        <p class="badge">403</p>
        <h1 class="section__title" id="forbidden-title">Acceso restringido</h1>
        <p class="section__lead">Esta sección requiere rol administrador.</p>
      </div>
      <div class="card">
        <p class="card__text">Si creés que es un error, escribinos a hola@nexoit.com.</p>
        <p><a class="btn btn--primary" href="/app/perfil">Volver a mi cuenta</a>
           <a class="btn btn--ghost" href="/">Ir al sitio</a></p>
      </div>
    </section>
  </main>
</body>
</html>"""

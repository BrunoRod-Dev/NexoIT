"""NexoIT · Área de clientes (FastAPI + Jinja2 + SQLite).

Levantar en desarrollo:
    uvicorn main:app --reload --port 8000

Sitio estático: se sirven sólo las tres páginas whitelisteadas con FileResponse
(montar el repo raíz expondría el código del server). `assets/` se monta como
estático porque no contiene código.
"""

from __future__ import annotations

import os
import re
import sys
import tempfile
import threading
import time
import unicodedata
from collections import deque
from contextlib import asynccontextmanager
from pathlib import Path
from urllib.parse import quote, urlparse

from fastapi import Depends, FastAPI, File, Form, Request, UploadFile
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from sqlalchemy import select, update
from sqlalchemy.orm import Session
from starlette.middleware.sessions import SessionMiddleware

import auth
from models import Consulta, User, get_db, init_db

try:
    import ezdxf
except Exception:  # pragma: no cover - si falta la dependencia, se responde 400
    ezdxf = None

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

# --- Rate limiting (en memoria, por proceso) --------------------------------
# Límites por IP. En producción multi-worker habría que usar Redis u otro
# almacén compartido; para un único proceso alcanza.
RATE_LIMITS = {
    "consultas": {"limit": 10, "window": 60},  # 10 por minuto
    "registro": {"limit": 5, "window": 3600},  # 5 por hora
    "login": {"limit": 10, "window": 600},  # 10 cada 10 minutos
    "dxf": {"limit": 5, "window": 60},  # 5 planos CAD por minuto
}

RATE_LIMIT_MESSAGES = {
    "consultas": "Demasiadas consultas en poco tiempo. Esperá un momento.",
    "registro": "Demasiados registros desde esta conexión. Esperá un rato y probá de nuevo.",
    "login": "Demasiados intentos. Esperá unos minutos y probá de nuevo.",
    "dxf": "Demasiados planos CAD en poco tiempo. Esperá un momento.",
}

# --- DXF (F2c) -------------------------------------------------------------
MAX_DXF_BYTES = 5 * 1024 * 1024
MAX_DXF_REQUEST_BYTES = MAX_DXF_BYTES + 1024 * 1024  # multipart overhead
DXF_CHUNK_SIZE = 64 * 1024
MAX_DXF_POLYLINES = 5000
DXF_FALLBACK = (
    "No pudimos leer los ambientes automáticamente. "
    "Probá subir una imagen del plano y dibujarlos encima."
)
DXF_TOO_LARGE = "El DXF supera los 5 MB. Exportá sólo la planta."
DXF_UNITS = {
    1: (0.0254, "in"),
    2: (0.3048, "ft"),
    4: (0.001, "mm"),
    5: (0.01, "cm"),
    6: (1.0, "m"),
}
DXF_TIPOS = {
    "dormitorio": ("DORMITORIO", "HABITACION", "BEDROOM"),
    "living": ("LIVING", "COMEDOR", "ESTAR", "SALA", "LIVINGROOM", "LIVING ROOM"),
    "cocina": ("COCINA", "KITCHEN"),
    "bano": ("BANO", "BATH"),
    "oficina": ("OFICINA", "ESCRITORIO", "OFFICE", "STUDY"),
    "garage": ("GARAGE", "GARAJE", "COCHERA"),
    "exterior": ("PATIO", "JARDIN", "EXTERIOR", "TERRAZA", "BALCON"),
}


class DxfError(Exception):
    """Error de parseo con mensaje apto para el cliente."""


def _norm_label(text: str) -> str:
    text = unicodedata.normalize("NFKD", text or "")
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    return re.sub(r"\s+", " ", text).strip().upper()


def _tipo_from_label(text: str):
    norm = _norm_label(text)
    for tipo, keys in DXF_TIPOS.items():
        for key in keys:
            if key in norm:
                return tipo
    return None


def parse_dxf(data: bytes):
    """Extrae ambientes de LWPOLYLINE cerradas + labels TEXT/MTEXT.

    Estrategia v1 declarada: cada polilínea cerrada es un ambiente candidato y
    cada texto se asigna al bbox que lo contiene. No infiere muros ni puertas.
    """
    if ezdxf is None:
        raise DxfError(DXF_FALLBACK)

    path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".dxf", delete=False) as handle:
            path = handle.name
            handle.write(data)

        doc = ezdxf.readfile(path)
        model = doc.modelspace()

        ambientes = []
        for entity in model.query("LWPOLYLINE"):
            if len(ambientes) > MAX_DXF_POLYLINES:
                raise DxfError(
                    "El DXF tiene demasiados ambientes para procesar. Exportá sólo la planta."
                )
            if not entity.closed:
                continue
            points = [(float(p[0]), float(p[1])) for p in entity.get_points("xy")]
            if len(points) < 3:
                continue
            xs = [p[0] for p in points]
            ys = [p[1] for p in points]
            x, y = min(xs), min(ys)
            w, h = max(xs) - x, max(ys) - y
            if w <= 0 or h <= 0:
                continue
            ambientes.append({"x": x, "y": y, "w": w, "h": h, "label": None})

        if not ambientes:
            raise DxfError(DXF_FALLBACK)

        advertencias = []
        for entity in model.query("TEXT MTEXT"):
            try:
                insert = entity.dxf.insert
                if entity.dxftype() == "MTEXT":
                    content = entity.plain_text()
                else:
                    content = entity.dxf.text
                tx, ty = float(insert[0]), float(insert[1])
            except Exception:
                continue
            nombre = re.sub(r"\s+", " ", (content or "")).strip()
            if not nombre:
                continue
            target = None
            for room in ambientes:
                if (
                    room["x"] <= tx <= room["x"] + room["w"]
                    and room["y"] <= ty <= room["y"] + room["h"]
                ):
                    if target is None or room["w"] * room["h"] < target["w"] * target["h"]:
                        target = room
            if target is None or target["label"] is not None:
                continue
            tipo = _tipo_from_label(nombre)
            clean = nombre[:40]
            if tipo is None:
                tipo = "living"
                advertencias.append(f"Revisá el tipo de “{clean}”.")
            target["label"] = (tipo, clean)

        insunits = 0
        try:
            insunits = int(doc.header.get("$INSUNITS", 0) or 0)
        except Exception:
            insunits = 0

        if insunits in DXF_UNITS:
            factor, unidades = DXF_UNITS[insunits]
            unidades = f"{unidades} ($INSUNITS)"
        else:
            promedio = sum(max(r["w"], r["h"]) for r in ambientes) / len(ambientes)
            if promedio > 500:
                factor, unidades = 0.001, "mm (estimado)"
            elif promedio > 50:
                factor, unidades = 0.01, "cm (estimado)"
            else:
                factor, unidades = 1.0, "m (estimado)"
            advertencias.append(
                "Unidades estimadas por el tamaño del plano: revisá las medidas."
            )

        sin_texto = False
        resultado = []
        for room in ambientes:
            if room["label"]:
                tipo, nombre = room["label"]
            else:
                tipo, nombre = "living", "Ambiente"
                sin_texto = True
            resultado.append(
                {
                    "tipo": tipo,
                    "nombre": nombre,
                    "x": round(room["x"] * factor, 2),
                    "y": round(room["y"] * factor, 2),
                    "w": round(room["w"] * factor, 2),
                    "h": round(room["h"] * factor, 2),
                }
            )
        if sin_texto:
            advertencias.append(
                "Hay ambientes sin texto: los nombramos “Ambiente” y podés renombrarlos."
            )

        return {"ambientes": resultado, "unidades": unidades, "advertencias": advertencias}
    finally:
        if path:
            try:
                os.remove(path)
            except OSError:
                pass


class RateLimiter:
    """Ventana deslizante por clave (IP), en memoria y con purga periódica."""

    PURGE_EVERY_SECONDS = 300

    def __init__(self, limit: int, window: int) -> None:
        self.limit = limit
        self.window = window
        self._hits: dict[str, deque[float]] = {}
        self._lock = threading.Lock()
        self._last_purge = time.monotonic()

    def allow(self, key: str) -> bool:
        now = time.monotonic()
        with self._lock:
            self._purge(now)
            bucket = self._hits.setdefault(key, deque())
            while bucket and bucket[0] <= now - self.window:
                bucket.popleft()
            if len(bucket) >= self.limit:
                return False
            bucket.append(now)
            return True

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()
            self._last_purge = time.monotonic()

    def _purge(self, now: float) -> None:
        if now - self._last_purge < self.PURGE_EVERY_SECONDS:
            return
        for key in list(self._hits):
            bucket = self._hits[key]
            while bucket and bucket[0] <= now - self.window:
                bucket.popleft()
            if not bucket:
                del self._hits[key]
        self._last_purge = now


_limiters = {
    name: RateLimiter(cfg["limit"], cfg["window"]) for name, cfg in RATE_LIMITS.items()
}


def reset_rate_limits() -> None:
    """Limpia los contadores (útil para tests y reinicios de proceso)."""
    for limiter in _limiters.values():
        limiter.reset()


def client_ip(request: Request) -> str:
    return request.client.host if request.client else "desconocido"


def rate_limited(request: Request, bucket: str) -> bool:
    return not _limiters[bucket].allow(client_ip(request))


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

# --- Revalidación de HTML y assets -----------------------------------------
# Evita que el navegador sirva JS/CSS viejo tras un deploy: el cliente siempre
# revalida (los estáticos responden 304 barato vía ETag/Last-Modified).
NO_CACHE_PATHS = {
    "/",
    "/index.html",
    "/grow/index.html",
    "/home/index.html",
    "/home/configurador/index.html",
}
NO_CACHE_PREFIXES = ("/assets/", "/static/", "/app")


@app.middleware("http")
async def revalidate_assets(request: Request, call_next):
    response = await call_next(request)
    path = request.url.path
    if path in NO_CACHE_PATHS or path.startswith(NO_CACHE_PREFIXES):
        response.headers["Cache-Control"] = "no-cache"
    return response


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    return response

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


def same_origin(request: Request) -> bool:
    """Endpoint público sin cookie: si viene Origin/Referer, exigir mismo host."""
    origin = request.headers.get("origin") or request.headers.get("referer")
    if not origin:
        return True
    netloc = urlparse(origin).netloc
    host = request.headers.get("host", "")
    return bool(netloc) and netloc.lower() == host.lower()


# --- Sitio estático (whitelist) --------------------------------------------


@app.api_route("/", methods=["GET", "HEAD"], include_in_schema=False)
def site_index() -> FileResponse:
    return FileResponse(SITE_DIR / "index.html")


@app.api_route("/index.html", methods=["GET", "HEAD"], include_in_schema=False)
def site_index_explicit() -> FileResponse:
    # Alias explícito: los links "Volver a NexoIT" apuntan a /index.html y
    # ../index.html; bajo file:// funciona, bajo el server necesita esta ruta.
    return FileResponse(SITE_DIR / "index.html")


@app.api_route("/grow/index.html", methods=["GET", "HEAD"], include_in_schema=False)
def site_grow() -> FileResponse:
    return FileResponse(SITE_DIR / "grow" / "index.html")


@app.api_route("/home/index.html", methods=["GET", "HEAD"], include_in_schema=False)
def site_home() -> FileResponse:
    return FileResponse(SITE_DIR / "home" / "index.html")


@app.api_route(
    "/home/configurador/index.html", methods=["GET", "HEAD"], include_in_schema=False
)
def site_home_configurador() -> FileResponse:
    return FileResponse(SITE_DIR / "home" / "configurador" / "index.html")


@app.api_route("/sitemap.xml", methods=["GET", "HEAD"], include_in_schema=False)
def site_sitemap() -> FileResponse:
    return FileResponse(SITE_DIR / "sitemap.xml", media_type="application/xml")


@app.api_route("/robots.txt", methods=["GET", "HEAD"], include_in_schema=False)
def site_robots() -> FileResponse:
    return FileResponse(SITE_DIR / "robots.txt", media_type="text/plain")


# --- Consultas desde el sitio (endpoint público) ---------------------------


@app.post("/consultas", status_code=201)
async def create_consulta(request: Request, db: Session = Depends(get_db)):
    """Recibe una consulta del hub. Anónima o vinculada a la sesión actual."""
    if rate_limited(request, "consultas"):
        return JSONResponse(
            {"ok": False, "error": RATE_LIMIT_MESSAGES["consultas"]},
            status_code=429,
        )

    if not same_origin(request):
        return JSONResponse(
            {"ok": False, "error": "Origen no permitido."}, status_code=403
        )

    try:
        data = await request.json()
    except Exception:
        return JSONResponse({"ok": False, "error": "Datos inválidos."}, status_code=400)
    if not isinstance(data, dict):
        return JSONResponse({"ok": False, "error": "Datos inválidos."}, status_code=400)

    nombre = str(data.get("nombre") or "").strip()
    email = auth.normalize_email(str(data.get("email") or ""))
    mensaje = str(data.get("mensaje") or "").strip()

    if len(nombre) < 2 or len(nombre) > 120:
        return JSONResponse(
            {"ok": False, "error": "El nombre debe tener entre 2 y 120 caracteres."},
            status_code=400,
        )
    if not auth.valid_email(email):
        return JSONResponse(
            {"ok": False, "error": "Revisá el email: no parece válido."},
            status_code=400,
        )
    if len(mensaje) < 10 or len(mensaje) > 2000:
        return JSONResponse(
            {"ok": False, "error": "El mensaje debe tener entre 10 y 2000 caracteres."},
            status_code=400,
        )

    user = auth.current_user(request, db)
    db.add(
        Consulta(
            nombre=nombre,
            email=email,
            mensaje=mensaje,
            estado="nueva",
            user_id=user.id if user is not None else None,
        )
    )
    db.commit()
    return JSONResponse({"ok": True}, status_code=201)


# --- DXF del arquitecto (F2c) ----------------------------------------------


@app.post("/dxf-parse")
async def dxf_parse(request: Request, file: UploadFile = File(...)):
    """Convierte un DXF en ambientes candidatos (v1: polilíneas + textos)."""
    if rate_limited(request, "dxf"):
        return JSONResponse(
            {"ok": False, "error": RATE_LIMIT_MESSAGES["dxf"]}, status_code=429
        )
    if not same_origin(request):
        return JSONResponse(
            {"ok": False, "error": "Origen no permitido."}, status_code=403
        )

    length_header = request.headers.get("content-length")
    if length_header:
        try:
            if int(length_header) > MAX_DXF_REQUEST_BYTES:
                return JSONResponse(
                    {"ok": False, "error": DXF_TOO_LARGE}, status_code=400
                )
        except ValueError:
            pass

    chunks = []
    total = 0
    try:
        while True:
            chunk = await file.read(DXF_CHUNK_SIZE)
            if not chunk:
                break
            total += len(chunk)
            if total > MAX_DXF_BYTES:
                return JSONResponse(
                    {"ok": False, "error": DXF_TOO_LARGE}, status_code=400
                )
            chunks.append(chunk)
    except Exception:
        return JSONResponse({"ok": False, "error": DXF_FALLBACK}, status_code=400)

    data = b"".join(chunks)
    if not data:
        return JSONResponse({"ok": False, "error": DXF_FALLBACK}, status_code=400)

    try:
        result = parse_dxf(data)
    except DxfError as exc:
        return JSONResponse({"ok": False, "error": str(exc)}, status_code=400)
    except Exception:
        return JSONResponse({"ok": False, "error": DXF_FALLBACK}, status_code=400)

    return JSONResponse({"ok": True, **result}, status_code=200)


# --- Área de clientes ------------------------------------------------------


@app.get("/app", include_in_schema=False)
def app_root() -> RedirectResponse:
    return RedirectResponse("/app/perfil", status_code=302)


@app.get("/app/login", response_class=HTMLResponse)
def login_form(
    request: Request,
    next: str = "",
    error: str = "",
    db: Session = Depends(get_db),
):
    user = auth.current_user(request, db)
    if user is not None:
        return RedirectResponse(safe_next(next), status_code=302)
    message = RATE_LIMIT_MESSAGES["login"] if error == "rate_limit" else ""
    return render(
        request, "login.html", next_url=safe_next(next), email="", error=message
    )


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
    if rate_limited(request, "login"):
        return RedirectResponse("/app/login?error=rate_limit", status_code=302)

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
def register_form(request: Request, error: str = "", db: Session = Depends(get_db)):
    user = auth.current_user(request, db)
    if user is not None:
        return RedirectResponse("/app/perfil", status_code=302)
    message = RATE_LIMIT_MESSAGES["registro"] if error == "rate_limit" else ""
    return render(request, "registro.html", nombre="", email="", error=message)


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

    if rate_limited(request, "registro"):
        return RedirectResponse("/app/registro?error=rate_limit", status_code=302)

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

    # Backfill: las consultas anónimas hechas con este email pasan a la cuenta.
    db.execute(
        update(Consulta)
        .where(Consulta.email == user.email, Consulta.user_id.is_(None))
        .values(user_id=user.id)
    )
    db.commit()

    auth.login_session(request, user)
    return RedirectResponse("/app/perfil", status_code=302)


@app.get("/app/perfil", response_class=HTMLResponse)
def profile(
    request: Request,
    user: User = Depends(auth.require_auth),
    db: Session = Depends(get_db),
):
    consultas = db.scalars(
        select(Consulta)
        .where(Consulta.user_id == user.id)
        .order_by(Consulta.created_at.desc(), Consulta.id.desc())
    ).all()
    return render(request, "perfil.html", user=user, consultas=consultas)


@app.get("/app/admin", response_class=HTMLResponse)
def admin(
    request: Request,
    user: User = Depends(auth.require_admin),
    db: Session = Depends(get_db),
):
    users = db.scalars(
        select(User).order_by(User.created_at.desc(), User.id.desc())
    ).all()
    rows = db.execute(
        select(Consulta, User)
        .outerjoin(User, Consulta.user_id == User.id)
        .order_by(Consulta.created_at.desc(), Consulta.id.desc())
    ).all()
    consultas = [(consulta, cuenta) for consulta, cuenta in rows]
    return render(request, "admin.html", user=user, users=users, consultas=consultas)


@app.post("/app/admin/consultas/{consulta_id}/leida")
def mark_consulta_leida(
    consulta_id: int,
    request: Request,
    csrf_token: str = Form(""),
    user: User = Depends(auth.require_admin),
    db: Session = Depends(get_db),
):
    if not auth.verify_csrf(request, csrf_token):
        return HTMLResponse(
            "<h1>400</h1><p>Token CSRF inválido.</p>", status_code=400
        )
    consulta = db.get(Consulta, consulta_id)
    if consulta is not None:
        consulta.estado = "leida"
        db.commit()
    return RedirectResponse("/app/admin", status_code=302)


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

# NexoIT · Área de clientes (Fase 1.1)

Backend mínimo en **FastAPI + SQLAlchemy 2 + SQLite** para el registro abierto y el
área de clientes del hub NexoIT. Reutiliza el sistema de diseño del sitio
(`/assets/css/tokens.css`, `base.css`, `components.css`) y agrega sólo
`server/static/app.css` para formularios.

> Estado: **fase 1.1**. El formulario del hub (`index.html`) todavía no está
> conectado; se hará en la fase 1.2.

## Requisitos

- Python **3.10+** (probado con 3.12.2)
- Sin base de datos externa: SQLite en `server/app.sqlite3`

## Puesta en marcha

```powershell
cd server
python -m venv .venv
.\.venv\Scripts\activate          # Linux/macOS: source .venv/bin/activate
pip install -r requirements.txt
$env:NEXOIT_ENV = "dev"           # sólo desarrollo local
uvicorn main:app --reload --port 8000
```

Sin `NEXOIT_SECRET_KEY` y sin `NEXOIT_ENV=dev` el proceso **aborta al arrancar**
con un error explícito (fail fast). En producción:

```powershell
$env:NEXOIT_SECRET_KEY = "<cadena larga y aleatoria>"
uvicorn main:app --port 8000
```

Abrir <http://127.0.0.1:8000/> (sitio) y <http://127.0.0.1:8000/app/registro>
(alta de cliente).

> `.venv/` y `*.sqlite3` están en el `.gitignore` raíz: no se versionan.

### Variables de entorno

| Variable | Default | Uso |
|---|---|---|
| `NEXOIT_SECRET_KEY` | **sin default** | firma de la cookie de sesión. **Obligatoria**: si falta, el proceso no arranca (salvo `NEXOIT_ENV=dev`). |
| `NEXOIT_ENV` | vacío | `dev` habilita un secreto de desarrollo inseguro **con warning** en consola. Cualquier otro valor exige `NEXOIT_SECRET_KEY`. |
| `NEXOIT_DB` | `server/app.sqlite3` | ruta alternativa de la base. |

## Administradores

```powershell
.\.venv\Scripts\python.exe create_admin.py admin@nexoit.com "PasswordSegura1" "Nombre Apellido"
```

- Si el email no existe, crea el usuario con `rol=admin`.
- Si ya existe, actualiza password, nombre y fuerza `rol=admin`.

## Rutas

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/` | hub (sirve `../index.html` vía whitelist) |
| GET | `/index.html` | alias explícito del hub (links "Volver a NexoIT") |
| GET | `/grow/index.html`, `/home/index.html` | landings de división (whitelist) |
| GET | `/assets/*` | estáticos del sitio (CSS, SVG, JS) |
| GET/POST | `/app/registro` | alta abierta (nombre, email, password ≥ 8) |
| GET/POST | `/app/login` | ingreso con cookie de sesión |
| GET | `/app/perfil` | datos de cuenta (requiere sesión) |
| GET | `/app/admin` | listado de usuarios y consultas (requiere rol admin) |
| POST | `/app/admin/consultas/{id}/leida` | marca una consulta como leída (admin, CSRF) |
| POST | `/consultas` | consulta pública desde el sitio (JSON, sin CSRF) |
| POST | `/app/logout` | cierra sesión y vuelve a `/` |
| GET | `/static/app.css` | estilos de formularios (sólo server) |

`/app` redirige a `/app/perfil`. Las rutas privadas sin sesión redirigen a
`/app/login?next=<ruta original>` (sólo se aceptan rutas internas `/app/...`).

### Consultas desde el sitio

`POST /consultas` recibe JSON `{"nombre", "email", "mensaje"}`:

| Caso | Respuesta |
|---|---|
| válida | **201** `{"ok": true}` |
| nombre fuera de 2–120 / email inválido / mensaje fuera de 10–2000 | **400** `{"ok": false, "error": "…"}` |
| `Origin` o `Referer` presente de otro host | **403** `{"ok": false, "error": "Origen no permitido."}` |

- Con sesión activa la consulta queda vinculada a `user_id`; sin sesión, `NULL`.
- Al registrarse un email, las consultas anónimas de ese email se **backfillean**
  a la cuenta nueva (`UPDATE consultas SET user_id = … WHERE email = … AND user_id IS NULL`).
- No usa CSRF cookie: el endpoint es público y la defensa es el chequeo de origen.

## Seguridad implementada

- **Passwords**: bcrypt vía `passlib` (cost 12). Límite de 72 bytes de bcrypt
  validado con mensaje explícito.
- **Sesión**: cookie firmada por `SessionMiddleware` (itsdangerous),
  `httpOnly`, `samesite=lax`, `Max-Age=8h`. En producción usar HTTPS y
  `https_only=True`.
- **CSRF**: token aleatorio por sesión en `<input type="hidden">` de cada POST,
  verificado con `secrets.compare_digest`. Se rota al iniciar sesión.
- **Autorización**: dependencias `require_auth` / `require_admin`; `/app/admin`
  responde 403 para clientes.
- **Enumeración de usuarios**: el login devuelve siempre "Email o contraseña
  incorrectos" (401), sin distinguir si el email existe.
- **Superficie**: no se monta el repo raíz; sólo `/assets` y tres páginas
  explícitas con `FileResponse`. `/server/**` y `*.sqlite3` devuelven 404.
- **OpenAPI**: deshabilitado (`docs_url=None`).
- **Rate limiting** (en memoria, por IP y por proceso):
  `POST /consultas` **10/min**, `POST /app/registro` **5/hora**,
  `POST /app/login` **10 cada 10 min**. Al exceder: JSON **429** en consultas y
  redirect con mensaje genérico en login/registro (sin revelar si el email existe).
  Los límites son constantes (`RATE_LIMITS`) al inicio de `main.py`. Con más de
  un worker/proceso hace falta un almacén compartido (Redis): el conteo actual
  no se comparte entre procesos. Detrás de un reverse proxy, `request.client.host`
  es la IP del proxy: para limitar por IP real, arrancar uvicorn con
  `--proxy-headers --forwarded-allow-ips=<proxy>` y confiar en el header.
- **Headers de seguridad** en todas las respuestas:
  `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
  `Referrer-Policy: strict-origin-when-cross-origin`.

## Pendiente / límites conocidos

- **Verificación de email**: no hay envío SMTP; cualquier email con formato
  válido se acepta (verificación queda para una fase con proveedor de correo).
- **Recuperación de contraseña**: no implementada.
- **CSP**: no se agrega en esta ronda a propósito. El sitio y el configurador usan
  estilos y scripts inline legítimos (SVG, `configurador.js`, `<style>` page-scoped),
  por lo que una CSP necesita nonces/hashes y un estudio previo para no romper nada.
- **Rate limiting distribuido**: el conteo es en memoria y por proceso; con varios
  workers o réplicas hace falta Redis (o similar).
- **Migraciones**: se usa `create_all`; para cambios de esquema conviene
  incorporar Alembic.
- **SQLite**: sin WAL ni pool tuneado; suficiente para esta fase, no para alta
  concurrencia.
- **Tests**: la validación de esta fase fue manual (smoke tests con `curl`);
  falta una suite automatizada (`pytest` + `httpx`).
- **Formulario del hub**: fase 1.2.

## Tests

```powershell
pip install -r requirements-dev.txt
python -m pytest tests/ -q
```

- La suite usa una **SQLite temporal** (`NEXOIT_DB` apunta a un archivo en
  `%TEMP%`): nunca toca `server/app.sqlite3`.
- `NEXOIT_SECRET_KEY` se setea a un valor de test antes de importar la app.
- Los contadores de rate limit se reinician entre tests.
- Cobertura: auth/roles, consultas (validaciones, origen, sesión, 429), estáticos
  (200/404, headers, no-cache, noscript).

## Nota de ejecución

Si el puerto `8000` está ocupado por otro proceso, usar por ejemplo:

```powershell
uvicorn main:app --port 8011
```

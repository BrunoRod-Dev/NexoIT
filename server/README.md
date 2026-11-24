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
uvicorn main:app --reload --port 8000
```

Abrir <http://127.0.0.1:8000/> (sitio) y <http://127.0.0.1:8000/app/registro>
(alta de cliente).

> `.venv/` y `*.sqlite3` están en el `.gitignore` raíz: no se versionan.

### Variables de entorno

| Variable | Default | Uso |
|---|---|---|
| `NEXOIT_SECRET_KEY` | secreto de desarrollo (inseguro) | firma de la cookie de sesión. **Obligatoria en producción.** |
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
| GET | `/grow/index.html`, `/home/index.html` | landings de división (whitelist) |
| GET | `/assets/*` | estáticos del sitio (CSS, SVG, JS) |
| GET/POST | `/app/registro` | alta abierta (nombre, email, password ≥ 8) |
| GET/POST | `/app/login` | ingreso con cookie de sesión |
| GET | `/app/perfil` | datos de cuenta (requiere sesión) |
| GET | `/app/admin` | listado de usuarios (requiere rol admin) |
| POST | `/app/logout` | cierra sesión y vuelve a `/` |
| GET | `/static/app.css` | estilos de formularios (sólo server) |

`/app` redirige a `/app/perfil`. Las rutas privadas sin sesión redirigen a
`/app/login?next=<ruta original>` (sólo se aceptan rutas internas `/app/...`).

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

## Pendiente / límites conocidos

- **Verificación de email**: no hay envío SMTP; cualquier email con formato
  válido se acepta (verificación queda para una fase con proveedor de correo).
- **Recuperación de contraseña**: no implementada.
- **Rate limiting / bloqueo por intentos**: no implementado (recomendado antes
  de exponer públicamente).
- **Migraciones**: se usa `create_all`; para cambios de esquema conviene
  incorporar Alembic.
- **SQLite**: sin WAL ni pool tuneado; suficiente para esta fase, no para alta
  concurrencia.
- **Tests**: la validación de esta fase fue manual (smoke tests con `curl`);
  falta una suite automatizada (`pytest` + `httpx`).
- **Formulario del hub**: fase 1.2.

## Nota de ejecución

Si el puerto `8000` está ocupado por otro proceso, usar por ejemplo:

```powershell
uvicorn main:app --port 8011
```

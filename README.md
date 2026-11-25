# NexoIT

## Qué es

**NexoIT** (soluciones IT, hub) → **NexoHome** (domótica) · **NexoGrow** (cultivo personalizado con IA):

- **NexoGrow** (`grow/`) — huerta inteligente: cámaras y sensores, riego y dosificación de nutrientes A/B automatizados, monitoreo 24/7 y dashboard web; funciona sin internet. Hoy en fase piloto.
- **NexoHome** (`home/`) — domótica simple y confiable: iluminación, clima, seguridad, rutinas y consumo desde el celular.
- **Configurador 3D** (`home/configurador/`) — room builder anónimo y sin cuenta: 3 templates de partida, editor 2D con preview 3D en vivo y sugerencias por ambiente.

El hub (`index.html`) es la única puerta de entrada: desde ahí se navega a cada división y de vuelta. Las divisiones no se enlazan entre sí.

## Estructura de carpetas

```
NexoIT/
├── index.html                  # Hub
├── README.md / CHANGELOG.md
├── sitemap.xml · robots.txt    # SEO (URL predecible de Pages)
├── grow/
│   └── index.html              # Landing NexoGrow (incluye sección "Cómo funciona")
├── home/
│   ├── index.html              # Landing NexoHome
│   └── configurador/
│       └── index.html          # Configurador 3D (room builder)
├── assets/
│   ├── css/                    # tokens.css · base.css · components.css
│   ├── js/                     # main.js (registry) · configurador.js
│   ├── img/                    # logo · favicon · hero-abstracto.svg · og-*.png
│   └── vendor/                 # three.min.js · OrbitControls.js (solo /home/configurador/)
├── server/                     # Backend FastAPI (área de clientes)
│   ├── main.py · auth.py · models.py · create_admin.py
│   ├── start-nexoit.bat · crear-admin.bat
│   ├── requirements.txt · requirements-dev.txt · README.md (detalle)
│   ├── static/app.css · templates/ (login, registro, perfil, admin, base_app)
│   ├── tests/                  # conftest + test_auth + test_consultas + test_static
│   └── app.sqlite3 · .venv/
└── .github/workflows/ci.yml    # CI: pytest + node --check
```

## Sistema de diseño

**Tema "Deep tech dark":** fondo `#0b1220`, acentos vía tokens (hub teal `#2dd4bf`, Grow `#4ade80`, Home `#60a5fa`); las páginas heredan por theme classes (`theme--grow` / `theme--home`) — cero cambios de CSS o imports en las divisiones.

### Tokens (`tokens.css`)

`:root { --color-bg, --color-surface, --color-text, --color-muted, --color-border, --accent, --accent-contrast, --font-sans, --space-1..--space-8, --radius, --shadow, … }`

Themes: `body.theme--grow { --accent: #4ade80 }`, `body.theme--home { --accent: #60a5fa }` (hub: teal `#2dd4bf`).

### Inventario de clases (BEM-lite) — completo y verificado contra el disco

**`assets/css/components.css` (sitio):**

- `.site-header` (`.site-header__inner`, `.site-header__brand`; estado `.is-scrolled`)
- `.nav` (`.nav__link`, `.nav__link--account`, `.nav__toggle`, `.nav__dot`, `.nav__dot--grow`, `.nav__dot--home`)
- `.skip-link` (vive en `base.css`)
- `.btn` (`.btn--primary`, `.btn--ghost`, `.btn--accent`, `.btn--grow`, `.btn--home`)
- `.badge`
- `.section` (`.section__head`, `.section__title`, `.section__lead`)
- `.hero` (`.hero__title`, `.hero__subtitle`, `.hero__actions`, `.hero--split`, `.hero__visual`)
- `.cards` y `.card` (`.card__icon`, `.card__title`, `.card__text`, `.card--grow`, `.card--home`, `.card > .btn`)
- `.split`
- `.steps` y `.step` (`.step__num`)
- `.placeholder` (`.placeholder__title`, `.placeholder__text`)
- `.contact` (`.contact__actions`)
- `.field` (`.field__label`, `.field__input`) y `.form-status` (`.form-status--ok`, `.form-status--error`) — form de contacto
- `.site-footer` (`.site-footer__brand`, `.site-footer__links`, `.site-footer__legal`)

**Page-scoped** (definidas en el `<style>` de cada página — patrón configurador, sin tocar components.css):

- `grow/`: `.flow`, `.flow__step`, `.flow__circle`, `.flow__arrow`
- `home/configurador/`: `.config-hero`, `.config-grid`, `.config-stage`, `.config-canvas`, `.config-side`, `.config-panel` (`.config-panel__head/__name/__desc/__count/__row/__empty/__dot`), `.config-toggles`, `.config-toggle` (`.config-toggle__dot`, `--iluminacion`, `--clima`, `--seguridad`, `--energia`), `.config-cta`, `.config-hint`, `.config-teaser`, `.house-switch`, `.house-switch__btn`

**`server/static/app.css` (área `/app`):** `.app-main`, `.app-dl`, `.app-list` (`.app-list__item`), `.form-card`, `.form-actions`, `.form-hint`, `.field__hint`, `.btn--small`, `.btn--icon`, `.badge--nueva`, `.badge--leida`, `.nav__logout`, `.alert`, `.card__meta` (reutiliza `.card` y `.field*` del sitio).

### Reglas

- **Clase nueva solo si ninguna existente la cubre.**
- **Presupuesto < 50 KB** de CSS+JS combinados del sitio de marketing, cero recursos externos, system fonts. **Exclusión:** `assets/vendor/three.min.js`, `assets/vendor/OrbitControls.js`, `assets/vendor/pdf.min.js` + `pdf.worker.min.js` y `assets/js/configurador.js` solo cargan en `/home/configurador/`, nunca en la landing.
- **Header:** un solo relleno por pantalla (Hablemos); navegación y divisiones en links quietos con dot de color; cero botones en el header. **Hero del hub:** variante definitiva abstracta (`hero-abstracto.svg`); la familia fue descartada (vive en el historial de git).
- **Animaciones page-scoped** en un `<style>` de página (ej.: diagrama "Cómo funciona" de Grow); la regla global `prefers-reduced-motion` de `base.css` neutraliza toda animación (`animation-duration: .01ms !important`), sin guard local por página.
- **Links:** solo hub ↔ divisiones, sin cross-links entre divisiones; las subpáginas de una división (p. ej. `home/configurador/`) se enlazan desde su propia landing.
- **Triggers de refactor:** con la 4ª página o el 2º cambio de nav → centralizar header/footer en partials.
- **Colores por categoría del configurador:** Iluminación `#2dd4bf` · Climatización `#60a5fa` · Seguridad `#f87171` · Energía `#4ade80`.
- **JS:** `main.js` es un registry de `data-modules` (sin JS el sitio sigue funcionando). Módulos: `header` (estado de scroll) y `contacto-form` (en `#contacto` de las 3 páginas): intercepta el submit y hace `POST /consultas` con JSON `{nombre, email, mensaje}` — **201** → `.form-status--ok` + `form.reset()`; **400** → `.form-status--error` con el mensaje del server; fallo de red → error genérico. **Sin JS el form no envía: mailto y WhatsApp siguen como base funcional** (con `<noscript>` apuntando a ellos).

## La app (`server/`)

Área de clientes en FastAPI. Detalle completo en `server/README.md`.

- **Correr:** `server\start-nexoit.bat` (activa `.venv`, `NEXOIT_ENV=dev`, `uvicorn main:app --port 8011` → <http://localhost:8011>). Manual: activar `server\.venv` y correr `uvicorn main:app --port 8011` desde `server/`.
- **Crear admin:** `server\crear-admin.bat` (o `python create_admin.py <email> <password> [nombre]`).
- **Endpoints:** `POST /consultas` (público, JSON `{nombre, email, mensaje}`, **201** `{"ok":true}` / **400** `{"ok":false,"error":…}`, rate limit **10/min** por IP, chequeo same-origin cuando hay `Origin`/`Referer`); `/app/login`, `/app/registro`, `/app/perfil`, `/app/admin` (con marca de consulta leída) y `/app/logout`. Rate limits: registro **5/h**, login **10/10 min** (en memoria por IP).
- **Seguridad:** passwords con **bcrypt** (passlib); cookie de sesión firmada `nexoit_session` (8 h, `httpOnly`, `samesite=lax`); **CSRF** con token por sesión verificado en cada POST; **same-origin** en `/consultas`; headers `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`; API docs deshabilitados; mounts estáticos limitados a `assets/` y `static/`.
- **Tests:** **21 tests** con pytest — `test_auth` (8), `test_consultas` (6), `test_static` (7). Correrlos desde la raíz: `server\.venv\Scripts\python -m pytest server/tests -q` (deps en `requirements-dev.txt`: pytest 9.2.0 + httpx2).
- **CI:** `.github/workflows/ci.yml` — pytest + `node --check` de `assets/js/main.js` y `assets/js/configurador.js` en push/PR a `main`.

## SEO

- **URL predecible:** `https://brunorod-dev.github.io/NexoIT/`
- **`sitemap.xml`** (hub, grow, home, configurador) y **`robots.txt`** (con `Sitemap:` apuntando a esa base).
- **OG:** `assets/img/og-*.png` (1200×630, dark) + `og:image` relativa y `og:url` absoluta en cada página.
- **JSON-LD:** en el hub (con teléfono placeholder) y `WebPage` por división con `url` absoluta.
- **Regla de dominio:** si cambia el dominio → actualizar `sitemap.xml`, `robots.txt`, `og:url` y `og:image` (ver pendientes).

## Configurador 3D

El configurador evolucionó de "casas modelo" a **room builder**: 3 templates de partida (depto, casa, desde cero), editor 2D en DOM + preview 3D data-driven y un motor de sugerencias por tipo de ambiente (tabla de automatización recomendada). Anónimo y sin cuenta: el borrador vive en `localStorage` (`nexo-casa-draft`) y el estado se lee con `window.nexoConfigurador.getState()`.

**Modo "Subí tu plano":** la imagen (PNG/JPG nativas; PDF de la primera página vía **pdf.js 3.11.174 vendoreado con carga diferida** — sólo se descarga al subir un PDF) entra como base atenuada del editor para dibujar encima, con proyección como textura en el preview 3D cuando aplica; el draft guarda la imagen downscaleada (~2.5 MB de límite práctico).

**Clases page-scoped del builder** (definidas en el `<style>` de `home/configurador/index.html`, mismo patrón que `.flow*`; no integran el inventario del contrato): `.builder-step*`, `.template-*`, `.builder-grid/.builder-plan/.plan*`, `.room*` (+ colores por `data-tipo`), `.palette*`, `.props*`, `.suggest*`, `.totals`, `.config-cta/.config-teaser`, `.draft-hint`, `body.is-dragging`; con una MQ propia `min-width: 62rem`.

### Roadmap

- **F2b:** subir tu plano como base del editor — **hecho**.
- **F2c:** importación DXF automática (con `ezdxf`).
- **F3:** guardar diseño con cuenta + consulta estructurada en el admin.

## Pendientes (TODOs)

- [ ] Dominio final: actualizar `sitemap.xml`, `robots.txt`, `og:url` y `og:image` a URLs absolutas (hoy rutas relativas + URL predecible de Pages; WhatsApp y otros scrapers requieren absolutas).
- [ ] Email real (hoy: `hola@nexoit.com` de ejemplo).
- [ ] WhatsApp real (botón/canal de contacto).
- [ ] Teléfono del JSON-LD (hoy placeholder `+54 9 11 0000-0000`, lo maneja `index.html` del hub).
- [ ] SMTP verificación (el envío real del form de contacto).
- [ ] Rate-limit en Redis (`POST /consultas` es en memoria, por proceso).
- [ ] CSP (cabecera `Content-Security-Policy`).
- [ ] Unificación de `.field`: `server/static/app.css` define `.field`/`.field__label`/`.field__input` propios; unificarlos con los del sitio.

## Workflow

- **Branches cortas + PRs:** una rama por tarea acotada, revisión y merge.
- **Deploy:** GitHub Pages desde `main`.
- **Cache:** el server sirve páginas y assets con `Cache-Control: no-cache` (revalidación barata vía ETag); GitHub Pages cachea por su cuenta (~10 min).

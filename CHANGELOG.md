# Changelog

Historial por fases de NexoIT. Fuente de hashes/fechas: `git log --oneline`.

## v1 — 2026-11-24 (496b609)

- Repo inicial con el README base.
- El sitio de v1 y su sistema de diseño viajaron consolidados en `a0b3b88` (la historia arranca con el sitio ya en v3).

## v2 — 2026-11-24 (a0b3b88)

- Reposicionamiento de NexoGrow a **cultivo personalizado con IA** ("piloto honesto") y voseo unificado en todo el sitio.
- Tema **"Deep tech dark"** (`#0b1220`, acentos teal/verde/azul) heredado por theme classes.

## v3 — 2026-11-24 (a0b3b88)

- Hub + landings reales de **NexoGrow** y **NexoHome** con nomenclatura canónica (NexoGrow/NexoHome sin espacio).
- HTML/CSS/JS vanilla, BEM-lite, cero recursos externos, presupuesto < 50 KB.

## 1.1 — 2026-11-24 (34a1c77 · 5e97c5f)

- Backend FastAPI: registro, sesiones firmadas y roles (usuario/admin) con `server/` y plantillas Jinja.
- Fixes de seguridad y estabilidad: secret fail-fast, `/index.html` explícito, pins de dependencias, tope de nombre.

## 1.2a/b — 2026-11-24 (774acd1 · b6f6c7a)

- Accesos **Ingresar / Crear cuenta** en el sitio + logout con icono en `/app/` + scripts `.bat` de arranque.
- **Form de contacto persistente** en el hub (`POST /consultas`), consultas en perfil y panel admin; rediseño minimalista del header (`e7d5869`) y fix de revalidación de assets + `<noscript>` (`f22ddb4`).

## Configurador 3D F0/F1 — 2026-11-25 (a494dd6)

- Configurador 3D público en `home/configurador/`: dos casas modelo, toggles por categoría con panel resumen.
- Gancho en la landing de NexoHome + vendor de three.js excluido del presupuesto.

## R1 — 2026-11-25 (2eb2831)

- Rate limiting en endpoints públicos (consultas/registro/login), headers de seguridad y suite **pytest** (19 tests; hoy 21).

## R2 — 2026-11-25 (3a55a2f)

- Hero del hub a la variante **abstracta** definitiva (`hero-abstracto.svg`); la familia quedó descartada en el historial.
- Imágenes **OG 1200×630** dark para las tres marcas (`og-nexoit`, `og-grow`, `og-home`).

## R3 — 2026-11-25 (e9afef0)

- **Forms de consultas en Grow y Home** (mismo módulo `contacto-form` y endpoint que el hub) y sección **"Cómo funciona"** en Grow con diagrama animado page-scoped.
- Headers móviles del configurador y de la app arreglados.

## R4 — 2026-11-25 (797c8de)

- `sitemap.xml` y `robots.txt` con la URL predecible de Pages; **JSON-LD `WebPage`** por división y `og:url` absolutas.
- Fix del wrap del diagrama de Grow (umbral de apilado).

## R5 — 2026-11-25

- **CI** (`.github/workflows/ci.yml`): pytest + `node --check` de `main.js` y `configurador.js` en push/PR a `main`.
- **Docs**: README consolidado de punta a punta y este CHANGELOG (aún sin commitear).

## F2a — Room builder con sugerencias

- El configurador pasa de "casas modelo" a **room builder**: 3 templates de partida (depto, casa, desde cero) con editor 2D en DOM y preview 3D data-driven que se arma en vivo.
- **Motor de sugerencias** por tipo de ambiente: tabla de automatización recomendada según el espacio.
- Borrador **anónimo en `localStorage`** (`nexo-casa-draft`) y API `window.nexoConfigurador.getState()` — sin cuenta.
- Landing de NexoHome actualizada al builder; F2b (plano como base) y F2c (DXF) quedan como teasers, F3 como futuro.

## F2b — Plano como base del editor

- Modo **"Subí tu plano"**: imagen (PNG/JPG) como base atenuada del editor para dibujar encima; PDF según soporte activo del vendor.
- El plano se proyecta como **textura en el preview 3D** cuando aplica.
- El draft en `localStorage` guarda la imagen **downscaleada** (~2.5 MB de límite práctico), sin cuenta.
- El teaser de la landing pasa a feature real: "Subí tu plano y dibujá tus ambientes encima."

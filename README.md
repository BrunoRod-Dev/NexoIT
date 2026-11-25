# NexoIT

Jerarquía real: **NexoIT** (soluciones IT, hub) → **NexoHome** (domótica) · **NexoGrow** (cultivo personalizado con IA).

- **NexoGrow** (`grow/`, landing v3) — cultivo personalizado con IA: huerta inteligente con cámaras, sensores, riego y dosificación de nutrientes A/B automatizados, monitoreo 24/7 y dashboard web (funciona sin internet).
- **NexoHome** (`home/`, landing v3) — domótica y hogar inteligente: iluminación, clima, seguridad, rutinas y consumo desde el celular.

El hub (`index.html`) es la única puerta de entrada: desde ahí se navega a cada división y de vuelta. Las divisiones no se enlazan entre sí.

## Estructura de carpetas

```
NexoIT/
├── index.html              # Hub (no editar desde esta división de trabajo)
├── README.md
├── grow/
│   └── index.html          # Landing NexoGrow (cultivo con IA)
├── home/
│   ├── index.html          # Landing NexoHome (domótica)
│   └── configurador/       # Configurador 3D público (casas modelo, toggles en 3D)
└── assets/
    ├── css/
    │   ├── tokens.css      # Variables de diseño + themes por división
    │   ├── base.css        # Reset y tipografía base
    │   └── components.css  # Componentes (.btn, .site-header, …)
    ├── js/
    │   └── main.js         # Registry de data-modules (opcional por página)
    └── img/                # logo, favicon, og-*.png
```

## Tema (v2)

**Deep tech dark:** fondo `#0b1220`, acentos teal/verde/azul vía tokens (hub teal `#2dd4bf`, Grow `#4ade80`, Home `#60a5fa`); las páginas heredan por theme classes (`theme--grow` / `theme--home`) — cero cambios de CSS o imports en las divisiones.

## Contrato de diseño

Las páginas solo pueden usar estos tokens y clases. **Clase nueva solo si ninguna existente la cubre**.

### Tokens (`tokens.css`)

`:root { --color-bg, --color-surface, --color-text, --color-muted, --accent, --accent-contrast, --font-sans, --space-1..--space-8, --radius, --shadow }`

Themes (v2): `body.theme--grow { --accent: #4ade80 }`, `body.theme--home { --accent: #60a5fa }` (hub: teal `#2dd4bf`).

### Clases disponibles (BEM-lite) — inventario v1.1

- `.site-header` (`.site-header__inner`, `.site-header__brand`, `.nav`, `.nav__link`, `.nav__link--account` (modificador del link de cuenta: separación y padding propios), `.nav__toggle`, `.nav__dot`, `.nav__dot--grow`, `.nav__dot--home`) — `.nav__dot*` definidas en components.css y usadas en el header y hero del hub
- `.btn` (`.btn--primary`, `.btn--ghost`, `.btn--accent`, `.btn--grow`, `.btn--home`)
- `.section` (`.section__head`, `.section__title`, `.section__lead`)
- `.placeholder` (`.placeholder__title`, `.placeholder__text`)
- `.contact` (`.contact__actions`)
- `.field` (`.field__label`, `.field__input`) y `.form-status` (`.form-status--ok`, `.form-status--error`) — form de contacto del hub
- `.site-footer` (`.site-footer__brand`, `.site-footer__links`, `.site-footer__legal`)
- `.badge`
- `.hero` (`.hero__title`, `.hero__subtitle`, `.hero__actions`, `.hero--split`, `.hero__visual`)
- `.cards` y `.card` (`.card__icon`, `.card__title`, `.card__text`, `.card--grow`, `.card--home`)
- `.split`
- `.steps` y `.step` (`.step__num`)
- `.skip-link`

**Regla de diseño del header:** un solo relleno por pantalla (Hablemos); navegación y divisiones en links quietos con dot de color; cero botones en el header.

`main.js` es un registry de `data-modules`; funciona igual si la página no tiene `data-modules` (importarlo no rompe nada).

Módulos: `header` (estado de scroll) y `contacto-form` (`data-module="contacto-form"` en la sección `#contacto` del hub): intercepta el submit y hace `POST /consultas` con JSON `{nombre, email, mensaje}`, pintando el resultado en `.form-status` — **201** → `.form-status--ok` "¡Consulta enviada!" + `form.reset()`; **400** → `.form-status--error` con el mensaje del server; fallo de red/respuesta inesperada → error genérico local. Flujo: form → API `/consultas` → DB → perfil del usuario / admin. **Sin JS: el form no envía; mailto y WhatsApp siguen como base funcional** (conservados visibles como alternativa).

## Triggers de refactor acordados

- **Cuando exista la 4ª página** → centralizar header/footer en partials.
- **Cuando el nav cambie por 2ª vez** → centralizar header/footer en partials.

## Presupuesto de performance

- CSS + JS combinados: **< 50 KB**.
- **Cero recursos externos** (sin CDNs, fuentes ni scripts de terceros).
- **System fonts** (`--font-sans` apunta a la pila del sistema).
- Exclusión del configurador: los assets de vendor (`assets/vendor/three.min.js`, `OrbitControls.js`) y `assets/js/configurador.js` se excluyen del presupuesto <50KB: solo cargan en `/home/configurador/`, nunca en la landing. El presupuesto rige el CSS+JS del sitio de marketing.

## Regla de links

- Solo **hub ↔ divisiones**: desde el hub a `grow/` y `home/`, y desde cada división de vuelta al hub (`../`).
- **Sin cross-links** entre divisiones.
- Las subpáginas de una división (p. ej. `home/configurador/`) se enlazan desde su propia landing; nunca entre divisiones.

## Configurador 3D

Página pública en `home/configurador/`: dos casas modelo con toggles de Iluminación / Climatización / Seguridad / Energía y panel resumen, todo en 3D desde el navegador y sin cuenta. Colores por categoría (referencia del contrato visual):

- **Iluminación** `#2dd4bf` · **Climatización** `#60a5fa` · **Seguridad** `#f87171` · **Energía** `#4ade80`.

### Fases futuras

- **F2:** upload de plano propio + guardar diseño con cuenta.
- **F3:** selección de lo configurado → consulta automática en el admin.

## Pendientes (TODOs)

- [ ] Email real (hoy: `hola@nexoit.com` de ejemplo).
- [ ] WhatsApp real (botón/canal de contacto).
- [ ] Teléfono del JSON-LD (hoy placeholder `+54 9 11 0000-0000`, lo maneja `index.html` del hub).
- [ ] Imágenes OG: `assets/img/og-nexoit.png` (hub), `assets/img/og-grow.png` y `assets/img/og-home.png` (hoy sin `og:image`; deberán seguir el estilo dark `#0b1220`).
- [ ] Contenido complementario de las landings v3 de `grow/` y `home/` (precios, casos, FAQ según corresponda).

## Workflow

- **Branches cortas + PRs**: una rama por tarea acotada, revisión y merge.
- **Deploy**: GitHub Pages desde `main`.
- **Cache de dev**: el server pide revalidación de assets (`Cache-Control: no-cache`); GitHub Pages cachea por su cuenta (~10 min).

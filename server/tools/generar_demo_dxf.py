"""Genera la casa de demo en DXF (9 ambientes, sin solapamientos).

Uso (desde la raíz del repo o desde server/):
    python server/tools/generar_demo_dxf.py

Salidas:
- assets/demo/plano-demo-casa.dxf        (metros, $INSUNITS=6) -> se commitea
- <Desktop>/plano-demo-casa.dxf          (copia de la variante metros)
- <Desktop>/plano-demo-casa-cm.dxf       (centímetros, sin $INSUNITS: prueba la heurística)

Cada ambiente es una LWPOLYLINE cerrada con un TEXT centrado cuyo nombre matchea
el diccionario ES del parser (`server/main.py` -> DXF_TIPOS).
"""

from __future__ import annotations

from pathlib import Path

import ezdxf
from ezdxf.enums import TextEntityAlignment

REPO_ROOT = Path(__file__).resolve().parents[2]
REPO_DXF = REPO_ROOT / "assets" / "demo" / "plano-demo-casa.dxf"

# (nombre, x, y, ancho, alto) en metros. Planta de 12.5 x 10 m, sin solapes.
ROOMS = [
    ("LIVING-COMEDOR", 0.0, 0.0, 5.0, 4.0),
    ("COCINA", 5.0, 0.0, 3.0, 3.0),
    ("BAÑO 1", 5.0, 4.0, 2.0, 2.0),
    ("BAÑO 2", 7.0, 5.0, 2.0, 2.0),
    ("DORMITORIO 3", 0.0, 4.0, 3.5, 3.0),
    ("DORMITORIO 1", 0.0, 7.0, 3.5, 3.0),
    ("DORMITORIO 2", 3.5, 7.0, 3.5, 3.0),
    ("GARAGE", 8.5, 0.0, 3.5, 5.0),
    ("PATIO", 7.0, 7.0, 4.0, 3.0),
]


def _solapamientos() -> list[tuple[str, str]]:
    choques = []
    for i, (nombre_a, xa, ya, wa, ha) in enumerate(ROOMS):
        for nombre_b, xb, yb, wb, hb in ROOMS[i + 1 :]:
            if xa < xb + wb and xb < xa + wa and ya < yb + hb and yb < ya + ha:
                choques.append((nombre_a, nombre_b))
    return choques


def build(scale: float = 1.0, insunits: int | None = 6) -> ezdxf.document.Drawing:
    doc = ezdxf.new("R2010")
    doc.header["$INSUNITS"] = 0 if insunits is None else insunits
    msp = doc.modelspace()

    for nombre, x, y, w, h in ROOMS:
        px, py = x * scale, y * scale
        pw, ph = w * scale, h * scale
        msp.add_lwpolyline(
            [(px, py), (px + pw, py), (px + pw, py + ph), (px, py + ph)],
            close=True,
        )

        alto_texto = min(0.3, w / (max(len(nombre), 1) * 0.8), h / 3.0) * scale
        texto = msp.add_text(nombre, dxfattribs={"height": alto_texto})
        texto.set_placement(
            (px + pw / 2, py + ph / 2), align=TextEntityAlignment.MIDDLE_CENTER
        )

    return doc


def main() -> int:
    choques = _solapamientos()
    if choques:
        print("ERROR: ambientes solapados:", choques)
        return 1

    metros = build(1.0, 6)
    centimetros = build(100.0, None)

    destinos = [
        (metros, REPO_DXF),
        (metros, Path.home() / "Desktop" / "plano-demo-casa.dxf"),
        (centimetros, Path.home() / "Desktop" / "plano-demo-casa-cm.dxf"),
    ]

    REPO_DXF.parent.mkdir(parents=True, exist_ok=True)
    for doc, destino in destinos:
        doc.saveas(str(destino))
        print(f"{destino}  ({destino.stat().st_size} bytes)")

    ancho = max(x + w for _, x, _, w, _ in ROOMS)
    alto = max(y + h for _, _, y, _, h in ROOMS)
    print(f"planta: {ancho:g} x {alto:g} m | ambientes: {len(ROOMS)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

"""Tests del parser DXF (POST /dxf-parse)."""

import io

import ezdxf

MESSAGE_FALLBACK = (
    "No pudimos leer los ambientes automáticamente. "
    "Probá subir una imagen del plano y dibujarlos encima."
)


def build_dxf(rooms):
    doc = ezdxf.new("R2010")
    doc.header["$INSUNITS"] = 6
    model = doc.modelspace()
    for x, y, w, h, label in rooms:
        model.add_lwpolyline(
            [(x, y), (x + w, y), (x + w, y + h), (x, y + h)], close=True
        )
        text = model.add_text(label, dxfattribs={"height": 0.2})
        text.set_placement((x + 0.3, y + 0.3))
    stream = io.StringIO()
    doc.write(stream)
    return stream.getvalue().encode("utf-8")


def post_dxf(client, data, name="plano.dxf"):
    return client.post("/dxf-parse", files={"file": (name, data, "application/dxf")})


def test_dxf_valido_extrae_ambientes(client):
    data = build_dxf(
        [
            (0, 0, 4, 3, "DORMITORIO 1"),
            (5, 0, 3, 2.5, "COCINA"),
            (9, 0, 2, 2, "BAÑO"),
        ]
    )
    response = post_dxf(client, data)
    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert len(body["ambientes"]) == 3

    tipos = {a["tipo"] for a in body["ambientes"]}
    assert tipos == {"dormitorio", "cocina", "bano"}
    assert body["unidades"].startswith("m")
    nombres = {a["nombre"] for a in body["ambientes"]}
    assert "DORMITORIO 1" in nombres


def test_dxf_invalido_400_estatico(client):
    response = post_dxf(client, b"esto no es un dxf")
    assert response.status_code == 400
    body = response.json()
    assert body["ok"] is False
    assert body["error"] == MESSAGE_FALLBACK


def test_dxf_sin_polilineas_400(client):
    doc = ezdxf.new("R2010")
    doc.header["$INSUNITS"] = 6
    model = doc.modelspace()
    model.add_text("Solo texto", dxfattribs={"height": 0.2}).set_placement((1, 1))
    stream = io.StringIO()
    doc.write(stream)

    response = post_dxf(client, stream.getvalue().encode("utf-8"))
    assert response.status_code == 400
    assert response.json()["error"] == MESSAGE_FALLBACK


def test_dxf_rate_limit_429(client):
    data = build_dxf([(0, 0, 4, 3, "LIVING")])
    for _ in range(5):
        assert post_dxf(client, data).status_code == 200

    blocked = post_dxf(client, data)
    assert blocked.status_code == 429
    assert (
        blocked.json()["error"]
        == "Demasiados planos CAD en poco tiempo. Esperá un momento."
    )


def test_dxf_demasiado_grande_400(client):
    payload = b"X" * (5 * 1024 * 1024 + 512 * 1024)  # ~5.5 MB
    response = post_dxf(client, payload, name="grande.dxf")
    assert response.status_code == 400
    body = response.json()
    assert body["ok"] is False
    assert body["error"] == "El DXF supera los 5 MB. Exportá sólo la planta."

"""Tests del endpoint público de consultas y su rate limit."""

import models
from models import Consulta, SessionLocal


def payload(**overrides):
    data = {
        "nombre": "Anon Test",
        "email": "anon@test.local",
        "mensaje": "Consulta anonima de prueba suficientemente larga.",
    }
    data.update(overrides)
    return data


def test_consulta_anonima_valida(client):
    response = client.post("/consultas", json=payload())
    assert response.status_code == 201
    assert response.json() == {"ok": True}


def test_consulta_validaciones_400(client):
    cases = [
        (payload(nombre="A"), "El nombre debe tener entre 2 y 120 caracteres."),
        (payload(email="no-es-email"), "Revisá el email: no parece válido."),
        (payload(mensaje="12345"), "El mensaje debe tener entre 10 y 2000 caracteres."),
    ]
    for data, expected in cases:
        response = client.post("/consultas", json=data)
        assert response.status_code == 400, data
        body = response.json()
        assert body["ok"] is False
        assert body["error"] == expected


def test_consulta_origin_ajeno_403(client):
    response = client.post(
        "/consultas", json=payload(), headers={"Origin": "http://evil.example"}
    )
    assert response.status_code == 403
    assert response.json()["error"] == "Origen no permitido."


def test_consulta_con_sesion_adjunta_user_id(client, register):
    assert register(email="sesion@test.local").status_code == 302

    response = client.post(
        "/consultas", json=payload(email="sesion@test.local", nombre="Sesion")
    )
    assert response.status_code == 201

    db = SessionLocal()
    try:
        consulta = (
            db.query(Consulta)
            .filter(Consulta.email == "sesion@test.local")
            .order_by(Consulta.id.desc())
            .first()
        )
        assert consulta is not None
        assert consulta.user_id is not None
    finally:
        db.close()


def test_consulta_rate_limit_429(client):
    for _ in range(10):
        assert client.post("/consultas", json=payload()).status_code == 201

    blocked = client.post("/consultas", json=payload())
    assert blocked.status_code == 429
    assert (
        blocked.json()["error"]
        == "Demasiadas consultas en poco tiempo. Esperá un momento."
    )


def test_consulta_se_guarda_en_db_de_test():
    # La suite corre contra una DB temporal; el nombre trae el prefijo del tmp.
    assert "nexoit-tests-" in str(models.engine.url)

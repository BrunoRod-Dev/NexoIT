"""Tests de diseños guardados (F3) y de la config en consultas."""

import json

from sqlalchemy import create_engine

import models
from models import Consulta, Diseno, SessionLocal


def diseno_payload(**overrides):
    data = {
        "nombre": "Mi casa",
        "data": {
            "ambientes": [
                {"id": "r1", "tipo": "living", "nombre": "Living", "x": 0, "y": 0, "w": 5, "h": 4},
                {"id": "r2", "tipo": "dormitorio", "nombre": "Dormitorio", "x": 5, "y": 0, "w": 4, "h": 3},
            ],
            "aceptadas": {"r1": ["luz"], "r2": []},
            "template": "casa",
            "plano": None,
        },
    }
    data.update(overrides)
    return data


def guardar(client, csrf, **overrides):
    token = csrf("/app/perfil")
    return client.post(
        "/app/guardar-diseno",
        json=diseno_payload(**overrides),
        headers={"X-CSRF-Token": token},
    )


def config_snapshot():
    return {
        "ambientes": [
            {"id": "r1", "tipo": "living", "nombre": "Living", "x": 0, "y": 0, "w": 5, "h": 4}
        ],
        "dispositivos": [
            {"categoria": "iluminacion", "nombre": "Dicroica LED", "ambiente": "Living"}
        ],
    }


def test_guardar_diseno_sin_sesion_redirige(client):
    response = client.post("/app/guardar-diseno", json=diseno_payload())
    assert response.status_code == 302
    assert response.headers["location"].startswith("/app/login?next=")


def test_guardar_diseno_sin_csrf_400(client, register):
    assert register(email="sin@test.local").status_code == 302
    response = client.post("/app/guardar-diseno", json=diseno_payload())
    assert response.status_code == 400
    assert response.json()["error"] == "La sesión expiró. Recargá la página."


def test_guardar_diseno_y_listarlo(client, csrf, register):
    assert register(email="duena@test.local").status_code == 302

    saved = guardar(client, csrf)
    assert saved.status_code == 200
    body = saved.json()
    assert body["ok"] is True
    assert body["id"] > 0
    assert body["nombre"] == "Mi casa"

    lista = client.get("/app/mis-disenos")
    assert lista.status_code == 200
    disenos = lista.json()["disenos"]
    assert len(disenos) == 1
    assert disenos[0]["ambientes_count"] == 2

    detalle = client.get(f"/app/disenos/{body['id']}")
    assert detalle.status_code == 200
    assert len(detalle.json()["diseno"]["data"]["ambientes"]) == 2

    # Actualizar el mismo diseño no crea otro.
    updated = client.post(
        "/app/guardar-diseno",
        json=diseno_payload(nombre="Mi casa v2", diseno_id=body["id"]),
        headers={"X-CSRF-Token": csrf("/app/perfil")},
    )
    assert updated.status_code == 200
    assert updated.json()["id"] == body["id"]
    assert len(client.get("/app/mis-disenos").json()["disenos"]) == 1


def test_guardar_diseno_validaciones_400(client, csrf, register):
    assert register(email="valid@test.local").status_code == 302
    token = csrf("/app/perfil")

    corto = client.post(
        "/app/guardar-diseno",
        json=diseno_payload(nombre="A"),
        headers={"X-CSRF-Token": token},
    )
    assert corto.status_code == 400
    assert corto.json()["error"] == "El nombre debe tener entre 2 y 120 caracteres."

    grande = client.post(
        "/app/guardar-diseno",
        json=diseno_payload(data={"ambientes": [], "blob": "x" * (3 * 1024 * 1024)}),
        headers={"X-CSRF-Token": token},
    )
    assert grande.status_code == 400
    assert grande.json()["error"] == "El diseño supera los 3 MB. Quitá el plano pesado."


def test_diseno_de_otro_usuario_404(client, csrf, register):
    assert register(email="a@test.local", nombre="Usuario A").status_code == 302
    diseno_id = guardar(client, csrf).json()["id"]
    client.post("/app/logout", data={"csrf_token": csrf("/app/perfil")})

    assert register(email="b@test.local", nombre="Usuario B").status_code == 302

    assert client.get(f"/app/disenos/{diseno_id}").status_code == 404
    borrar = client.post(
        f"/app/disenos/{diseno_id}/borrar", data={"csrf_token": csrf("/app/perfil")}
    )
    assert borrar.status_code == 404

    db = SessionLocal()
    try:
        assert db.get(Diseno, diseno_id) is not None
    finally:
        db.close()


def test_borrar_diseno_propio_redirige(client, csrf, register):
    assert register(email="borra@test.local").status_code == 302
    diseno_id = guardar(client, csrf).json()["id"]

    response = client.post(
        f"/app/disenos/{diseno_id}/borrar", data={"csrf_token": csrf("/app/perfil")}
    )
    assert response.status_code == 302
    assert response.headers["location"] == "/app/perfil"
    assert client.get("/app/mis-disenos").json()["disenos"] == []


def test_consulta_con_config_persiste(client):
    response = client.post(
        "/consultas",
        json={
            "nombre": "Anon Config",
            "email": "config@test.local",
            "mensaje": "Quiero presupuesto para esta casa del configurador.",
            "config": config_snapshot(),
        },
    )
    assert response.status_code == 201

    db = SessionLocal()
    try:
        consulta = (
            db.query(Consulta)
            .filter(Consulta.email == "config@test.local")
            .order_by(Consulta.id.desc())
            .first()
        )
        assert consulta is not None
        assert consulta.user_id is None
        guardado = json.loads(consulta.config_json)
        assert guardado["ambientes"][0]["nombre"] == "Living"
        assert guardado["dispositivos"][0]["categoria"] == "iluminacion"
    finally:
        db.close()


def test_consulta_config_demasiado_grande_400(client):
    response = client.post(
        "/consultas",
        json={
            "nombre": "Anon Config",
            "email": "config@test.local",
            "mensaje": "Quiero presupuesto para esta casa del configurador.",
            "config": {"ambientes": [], "blob": "y" * (200 * 1024 + 1024)},
        },
    )
    assert response.status_code == 400
    assert response.json()["error"] == "La configuración supera los 200 KB."


def test_migracion_agrega_config_json(tmp_path):
    ruta = tmp_path / "vieja.sqlite3"
    engine = create_engine(f"sqlite:///{ruta.as_posix()}")
    with engine.connect() as conn:
        conn.exec_driver_sql(
            "CREATE TABLE consultas (id INTEGER PRIMARY KEY, nombre TEXT)"
        )
        conn.exec_driver_sql("INSERT INTO consultas (nombre) VALUES ('vieja')")
        conn.commit()

    models.migrate_schema(engine)

    with engine.connect() as conn:
        columnas = [fila[1] for fila in conn.exec_driver_sql("PRAGMA table_info(consultas)")]
        assert "config_json" in columnas
        filas = conn.exec_driver_sql("SELECT nombre, config_json FROM consultas").fetchall()
        assert filas == [("vieja", None)]
    engine.dispose()

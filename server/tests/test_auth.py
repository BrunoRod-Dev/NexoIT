"""Tests de registro, login, sesión y roles."""


def test_registro_valido_redirige_y_muestra_perfil(client, register):
    response = register(email="valido@test.local", nombre="Valido Test")
    assert response.status_code == 302
    assert response.headers["location"] == "/app/perfil"

    perfil = client.get("/app/perfil")
    assert perfil.status_code == 200
    assert "valido@test.local" in perfil.text
    assert "Valido Test" in perfil.text


def test_registro_email_duplicado(client, csrf, register):
    assert register(email="dup@test.local").status_code == 302

    # Cerrar sesión para volver a ver el formulario de registro.
    perfil = client.get("/app/perfil")
    assert perfil.status_code == 200
    token = csrf("/app/perfil")
    assert client.post("/app/logout", data={"csrf_token": token}).status_code == 302

    duplicate = register(email="dup@test.local", nombre="Dup Test")
    assert duplicate.status_code == 409
    assert "Ya existe una cuenta con ese email" in duplicate.text


def test_registro_password_corta(client, csrf):
    response = client.post(
        "/app/registro",
        data={
            "csrf_token": csrf("/app/registro"),
            "nombre": "Corta",
            "email": "corta@test.local",
            "password": "corta",
        },
    )
    assert response.status_code == 400
    assert "al menos 8 caracteres" in response.text


def test_login_password_incorrecta(client, csrf, register):
    assert register(email="login@test.local").status_code == 302
    token = csrf("/app/perfil")
    client.post("/app/logout", data={"csrf_token": token})

    response = client.post(
        "/app/login",
        data={
            "csrf_token": csrf("/app/login"),
            "email": "login@test.local",
            "password": "incorrecta123",
        },
    )
    assert response.status_code == 401
    assert "Email o contraseña incorrectos." in response.text


def test_login_ok_redirige_a_perfil(client, csrf, register):
    assert register(email="ok@test.local").status_code == 302
    client.post("/app/logout", data={"csrf_token": csrf("/app/perfil")})

    response = client.post(
        "/app/login",
        data={
            "csrf_token": csrf("/app/login"),
            "email": "ok@test.local",
            "password": "Secreta123",
        },
    )
    assert response.status_code == 302
    assert response.headers["location"] == "/app/perfil"
    assert client.get("/app/perfil").status_code == 200


def test_logout_limpia_sesion(client, csrf, register):
    assert register(email="logout@test.local").status_code == 302
    token = csrf("/app/perfil")

    response = client.post("/app/logout", data={"csrf_token": token})
    assert response.status_code == 302
    assert response.headers["location"] == "/"

    perfil = client.get("/app/perfil", follow_redirects=False)
    assert perfil.status_code == 302
    assert "/app/login" in perfil.headers["location"]


def test_admin_requiere_rol_admin(client, register):
    assert register(email="cliente@test.local").status_code == 302

    response = client.get("/app/admin")
    assert response.status_code == 403
    assert "Acceso restringido" in response.text


def test_perfil_sin_sesion_redirige_a_login(client):
    response = client.get("/app/perfil", follow_redirects=False)
    assert response.status_code == 302
    assert "next=/app/perfil" in response.headers["location"]

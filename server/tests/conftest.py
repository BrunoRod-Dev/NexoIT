"""Configuración de la suite: DB temporal aislada + TestClient.

La DB real (server/app.sqlite3) nunca se toca: antes de importar main/models se
fuerza NEXOIT_DB a un archivo temporal de la sesión de tests.
"""

import os
import pathlib
import re
import shutil
import sys
import tempfile

# Siempre secreto de test: pisa cualquier valor de producción del entorno.
os.environ["NEXOIT_SECRET_KEY"] = "test-secret-key-not-for-production"
_TMP_DIR = pathlib.Path(tempfile.mkdtemp(prefix="nexoit-tests-"))
os.environ["NEXOIT_DB"] = str(_TMP_DIR / "test.sqlite3")

# Permite correr `pytest server/tests/` desde la raíz del repo (y desde server/).
_SERVER_DIR = pathlib.Path(__file__).resolve().parents[1]
if str(_SERVER_DIR) not in sys.path:
    sys.path.insert(0, str(_SERVER_DIR))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402  (importa models con NEXOIT_DB ya apuntando al temporal)
from models import init_db  # noqa: E402


@pytest.fixture(scope="session")
def app():
    return main.app


@pytest.fixture(scope="session", autouse=True)
def _test_database():
    init_db()
    yield
    from models import engine

    engine.dispose()
    shutil.rmtree(_TMP_DIR, ignore_errors=True)


@pytest.fixture()
def client(app):
    with TestClient(app, follow_redirects=False) as test_client:
        yield test_client


@pytest.fixture(autouse=True)
def _clear_rate_limits():
    main.reset_rate_limits()
    yield
    main.reset_rate_limits()


@pytest.fixture()
def csrf(client):
    """Devuelve el token CSRF de un formulario GET."""

    def _token(path: str) -> str:
        html = client.get(path).text
        match = re.search(r'name="csrf_token" value="([^"]+)"', html)
        assert match, f"No se encontró csrf_token en {path}"
        return match.group(1)

    return _token


@pytest.fixture()
def register(client, csrf):
    """Registra un usuario (deja la sesión iniciada)."""

    def _register(
        email: str = "ana@test.local",
        nombre: str = "Ana Test",
        password: str = "Secreta123",
        follow_redirects: bool = False,
    ):
        return client.post(
            "/app/registro",
            data={
                "csrf_token": csrf("/app/registro"),
                "nombre": nombre,
                "email": email,
                "password": password,
            },
            follow_redirects=follow_redirects,
        )

    return _register

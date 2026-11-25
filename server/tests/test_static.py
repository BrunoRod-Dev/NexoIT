"""Tests de páginas estáticas, whitelist y headers."""

PAGES = [
    "/",
    "/index.html",
    "/grow/index.html",
    "/home/index.html",
    "/home/configurador/index.html",
    "/assets/js/main.js",
]


def test_paginas_y_assets_200(client):
    for path in PAGES:
        response = client.get(path)
        assert response.status_code == 200, path


def test_codigo_del_server_no_expuesto(client):
    for path in ["/server/main.py", "/models.py", "/app.sqlite3"]:
        assert client.get(path).status_code == 404, path


def test_headers_de_seguridad(client):
    for path in ["/", "/assets/js/main.js", "/app/login", "/no-existe"]:
        response = client.get(path)
        assert response.headers["x-content-type-options"] == "nosniff", path
        assert response.headers["x-frame-options"] == "DENY", path
        assert (
            response.headers["referrer-policy"]
            == "strict-origin-when-cross-origin"
        ), path


def test_cache_control_no_cache(client):
    paths = PAGES + ["/assets/css/tokens.css", "/static/app.css"]
    for path in paths:
        response = client.get(path)
        assert response.headers.get("cache-control") == "no-cache", path


def test_noscript_en_el_hub(client):
    html = client.get("/").text
    assert "<noscript>" in html
    assert "El form necesita JavaScript" in html

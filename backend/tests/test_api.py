import pytest
from fastapi.testclient import TestClient

from app.main import crea_app


@pytest.fixture
def c():
    return TestClient(crea_app())


def test_health(c):
    assert c.get("/api/health").json() == {"status": "ok"}


def test_catalogo_trae_codigo_y_no_las_cargas(c):
    a = {x["id"]: x for x in c.get("/api/ataques").json()}
    assert set(a) == {"inyeccion-sql", "xss-reflejado", "recorrido-rutas", "fuerza-bruta", "idor", "redireccion-abierta", "clickjacking"}
    assert "peticiones" not in a["fuerza-bruta"] and a["fuerza-bruta"]["n_peticiones"] == 20
    assert "LIKE" in a["inyeccion-sql"]["codigo"]["vulnerable"]
    assert "is_relative_to(PUBLICO)" in a["recorrido-rutas"]["codigo"]["endurecida"]


def test_lanzar(c):
    r = c.post("/api/ataques/inyeccion-sql/lanzar", params={"modo": "vulnerable"}).json()
    assert r["exito"] is True and r["pasos"][0]["cumple"] is True and r["origen"].startswith("203.0.113.")


def test_matriz(c):
    m = c.get("/api/matriz").json()
    assert len(m) == 7
    assert all(f["vulnerable"] is True and f["endurecida"] is False for f in m)
    assert m[0]["ataque"] == "inyeccion-sql" and m[0]["nombre"] == "Inyección SQL"


def test_ataque_desconocido_y_modo_invalido(c):
    r = c.post("/api/ataques/no-existe/lanzar", params={"modo": "vulnerable"})
    assert r.status_code == 404 and r.json()["detail"] == "Ese ataque no está en el catálogo."
    assert c.post("/api/ataques/inyeccion-sql/lanzar", params={"modo": "otro"}).status_code == 422
    assert c.post("/api/ataques/inyeccion-sql/lanzar").status_code == 422


def test_limite_de_uso(monkeypatch):
    monkeypatch.setenv("LIMITE_POR_MINUTO", "3")
    c = TestClient(crea_app())

    def lanza():
        return c.post("/api/ataques/xss-reflejado/lanzar", params={"modo": "vulnerable"})

    assert [lanza().status_code for _ in range(3)] == [200, 200, 200]
    r = lanza()
    assert r.status_code == 429 and int(r.headers["Retry-After"]) > 0
    assert r.json()["detail"] == f"Demasiados lanzamientos. Espera {r.headers['Retry-After']} s."


def test_el_limite_es_por_visitante(monkeypatch):
    monkeypatch.setenv("LIMITE_POR_MINUTO", "1")
    monkeypatch.setenv("CLIENT_IP_HEADER", "True-Client-IP")
    c = TestClient(crea_app())

    def lanza(ip):
        return c.post("/api/ataques/xss-reflejado/lanzar", params={"modo": "vulnerable"}, headers={"True-Client-IP": ip}).status_code

    assert [lanza("198.51.100.1"), lanza("198.51.100.1"), lanza("198.51.100.2")] == [200, 429, 200]


def test_objetivo_cerrado_por_defecto_y_abierto_con_la_variable(monkeypatch):
    assert TestClient(crea_app()).get("/objetivo/vulnerable/buscar", params={"q": "a"}).status_code == 404
    monkeypatch.setenv("OBJETIVO_EXPUESTO", "true")
    assert TestClient(crea_app()).get("/objetivo/vulnerable/buscar", params={"q": "Teclado"}).status_code == 200


def test_limite_cero_rechaza_siempre_sin_romperse(monkeypatch):
    monkeypatch.setenv("LIMITE_POR_MINUTO", "0")
    c = TestClient(crea_app())
    assert [c.post("/api/ataques/xss-reflejado/lanzar", params={"modo": "vulnerable"}).status_code for _ in range(2)] == [429, 429]

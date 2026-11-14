import pytest
from fastapi.testclient import TestClient

from app.objetivo import FUENTES, crea_objetivo

SQLI = "' UNION SELECT email, clave FROM usuarios --"
XSS = "<script>alert(1)</script>"


@pytest.fixture
def c():
    return TestClient(crea_objetivo())


@pytest.fixture(params=["vulnerable", "endurecida"])
def modo(request):
    return request.param


def test_buscar_normal_en_ambos_modos(c, modo):
    r = c.get(f"/{modo}/buscar", params={"q": "Teclado"})
    assert r.status_code == 200 and "Teclado mecánico" in r.text


def test_sqli_extrae_usuarios_solo_en_vulnerable(c):
    assert "admin@lab.invalid" in c.get("/vulnerable/buscar", params={"q": SQLI}).text
    assert "admin@lab.invalid" not in c.get("/endurecida/buscar", params={"q": SQLI}).text


def test_xss_se_refleja_solo_en_vulnerable(c):
    assert XSS in c.get("/vulnerable/buscar", params={"q": XSS}).text
    r = c.get("/endurecida/buscar", params={"q": XSS})
    assert XSS not in r.text and "&lt;script&gt;" in r.text


def test_sql_roto_responde_500_corto(c):
    r = c.get("/vulnerable/buscar", params={"q": "'"})
    assert r.status_code == 500 and len(r.text) < 300
    assert c.get("/endurecida/buscar", params={"q": "'"}).status_code == 200


def test_la_base_es_de_solo_lectura(c):
    c.get("/vulnerable/buscar", params={"q": "'; DROP TABLE productos --"})
    assert "Teclado mecánico" in c.get("/vulnerable/buscar", params={"q": "Teclado"}).text


def test_archivo_publico(c, modo):
    assert "Horario de atención" in c.get(f"/{modo}/archivo", params={"nombre": "aviso.txt"}).text


def test_recorrido_lee_el_senuelo_solo_en_vulnerable(c):
    assert "SENUELO-LAB-7f3a" in c.get("/vulnerable/archivo", params={"nombre": "../secreto.txt"}).text
    assert c.get("/endurecida/archivo", params={"nombre": "../secreto.txt"}).status_code == 404


@pytest.mark.parametrize("nombre", ["/etc/passwd", "..\\secreto.txt", "C:\\Windows\\win.ini", "../../main.py", "../../../requirements.txt", "", "a\x00b"])
def test_nada_fuera_del_laboratorio(c, modo, nombre):
    r = c.get(f"/{modo}/archivo", params={"nombre": nombre})
    # "..\\" es un separador en Windows: ahí el modo vulnerable llega al señuelo, que sigue dentro del laboratorio
    assert r.status_code == 404 or (modo == "vulnerable" and "SENUELO" in r.text)


def test_login(c, modo):
    assert c.post(f"/{modo}/login", json={"usuario": "admin", "clave": "dragon2024"}).status_code == 200
    assert c.post(f"/{modo}/login", json={"usuario": "admin", "clave": "x"}).status_code == 401
    assert c.post(f"/{modo}/login", json={"usuario": "nadie", "clave": "x"}).status_code == 401


def test_bloqueo_tras_cinco_fallos_solo_en_endurecida():
    t = [0.0]
    c = TestClient(crea_objetivo(reloj=lambda: t[0]))
    for _ in range(5):
        c.post("/endurecida/login", json={"usuario": "admin", "clave": "x"})
    assert c.post("/endurecida/login", json={"usuario": "admin", "clave": "dragon2024"}).status_code == 429
    t[0] = 61.0
    assert c.post("/endurecida/login", json={"usuario": "admin", "clave": "dragon2024"}).status_code == 200
    for _ in range(6):
        c.post("/vulnerable/login", json={"usuario": "admin", "clave": "x"})
    assert c.post("/vulnerable/login", json={"usuario": "admin", "clave": "dragon2024"}).status_code == 200


def test_fuentes_expone_las_dos_versiones():
    assert "LIKE '%{q}%'" in FUENTES["buscar"]["vulnerable"] and "?" in FUENTES["buscar"]["endurecida"]
    assert set(FUENTES) == {"login", "buscar", "archivo"}

"""E2E contra el laboratorio en marcha.

    docker compose up -d --build --wait
    uv run --with pytest --with playwright pytest e2e

En local usa un navegador instalado con BROWSER_CHANNEL=msedge; en el CI, el Chromium de Playwright.
"""
import os

import pytest
from playwright.sync_api import Page, expect, sync_playwright

BASE = os.environ.get("BASE_URL", "http://localhost:8095")
ATAQUES = {
    "inyeccion-sql": "Inyección SQL",
    "xss-reflejado": "XSS reflejado",
    "recorrido-rutas": "Recorrido de rutas",
    "fuerza-bruta": "Fuerza bruta de login",
}
MODOS = {"vulnerable": "Vulnerable", "endurecida": "Endurecida"}
errores: list[str] = []


@pytest.fixture(scope="module")
def page():
    with sync_playwright() as p:
        nav = p.chromium.launch(channel=os.environ.get("BROWSER_CHANNEL") or None)
        # Sin movimiento la reproducción es inmediata; el ritmo de presentación lo ejercita scripts/capturas.py.
        pagina = nav.new_context(viewport={"width": 1360, "height": 1000}, reduced_motion="reduce").new_page()
        # Solo cuentan los errores de la propia aplicación.
        pagina.on("console", lambda m: m.type == "error" and BASE in (m.location.get("url") or "") and errores.append(f"{m.text} {m.location.get('url')}"))
        pagina.on("pageerror", lambda e: errores.append(str(e)))
        yield pagina
        nav.close()


def abrir(page: Page) -> None:
    page.unroute_all()
    page.goto(BASE)
    expect(page.get_by_test_id("matriz")).to_be_visible()


def elegir(page: Page, ataque: str, modo: str) -> None:
    page.get_by_role("button", name=ATAQUES[ataque]).click()
    page.get_by_role("radio", name=MODOS[modo]).check()


@pytest.mark.parametrize("ataque", ATAQUES)
@pytest.mark.parametrize("modo", MODOS)
def test_cada_ataque_en_cada_modo_coincide_con_la_api(page: Page, ataque: str, modo: str):
    abrir(page)
    fila = next(f for f in page.request.get(f"{BASE}/api/matriz").json() if f["ataque"] == ataque)
    elegir(page, ataque, modo)
    expect(page.get_by_test_id("nodo-resultado")).to_have_attribute("data-activo", "false")
    page.get_by_role("button", name="Lanzar").click()
    expect(page.get_by_test_id("resultado")).to_have_text("El ataque tuvo éxito" if fila[modo] else "El ataque no tuvo éxito")
    expect(page.get_by_test_id("nodo-resultado")).to_have_attribute("data-activo", "true")
    expect(page.get_by_test_id("nodo-resultado")).to_contain_text("Éxito" if fila[modo] else "Sin éxito")
    expect(page.get_by_role("button", name="Lanzar")).to_be_enabled()


def test_la_fuerza_bruta_se_ve_peticion_a_peticion(page: Page):
    abrir(page)
    elegir(page, "fuerza-bruta", "endurecida")
    page.get_by_role("button", name="Lanzar").click()
    expect(page.locator(".paso")).to_have_count(20)
    expect(page.locator(".paso").nth(4)).to_have_text("401")
    expect(page.locator(".paso").nth(5)).to_have_text("429")
    expect(page.get_by_test_id("nodo-atacar")).to_contain_text("20 / 20")


def test_la_matriz_del_panel_es_la_de_la_api(page: Page):
    abrir(page)
    filas = page.get_by_test_id("matriz").locator("tbody tr")
    api = page.request.get(f"{BASE}/api/matriz").json()
    expect(filas).to_have_count(len(api))
    for i, f in enumerate(api):
        texto = [f["nombre"], *("Tuvo éxito" if f[m] else "No tuvo éxito" for m in MODOS)]
        expect(filas.nth(i).locator("th, td")).to_have_text(texto)


def test_error_de_la_api_rehabilita_el_boton(page: Page):
    abrir(page)
    page.route("**/lanzar*", lambda r: r.abort())
    page.get_by_role("button", name="Lanzar").click()
    expect(page.get_by_role("alert")).to_contain_text("No se pudo contactar con el laboratorio")
    expect(page.get_by_role("button", name="Lanzar")).to_be_enabled()


def test_limite_de_uso_se_muestra(page: Page):
    abrir(page)
    page.route("**/lanzar*", lambda r: r.fulfill(status=429, json={"detail": "Demasiados lanzamientos. Espera 12 s."}))
    page.get_by_role("button", name="Lanzar").click()
    expect(page.get_by_role("alert")).to_have_text("Demasiados lanzamientos. Espera 12 s.")
    expect(page.get_by_role("button", name="Lanzar")).to_be_enabled()


def test_el_objetivo_no_es_accesible(page: Page):
    assert page.request.get(f"{BASE}/objetivo/vulnerable/buscar?q=a").status == 404
    assert page.request.get(f"{BASE}/objetivo/vulnerable/archivo?nombre=../secreto.txt").status == 404


def test_sin_errores_de_consola_propios():
    # Los dos fallos provocados arriba (petición abortada y 429) son esperados.
    assert [e for e in errores if "lanzar" not in e] == []

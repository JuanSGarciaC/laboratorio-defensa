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
MODOS = ("vulnerable", "endurecida")
LANZAR = "Lanzar contra las dos"
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
    expect(page.get_by_role("button", name=LANZAR)).to_be_enabled()


def matriz(page: Page) -> dict:
    return {f["ataque"]: f for f in page.request.get(f"{BASE}/api/matriz").json()}


@pytest.mark.parametrize("ataque", ATAQUES)
def test_cada_ataque_contra_las_dos_versiones_coincide_con_la_api(page: Page, ataque: str):
    abrir(page)
    fila = matriz(page)[ataque]
    page.get_by_role("button", name=ATAQUES[ataque]).click()
    for modo in MODOS:
        expect(page.get_by_test_id(f"carril-{modo}")).to_have_attribute("data-estado", "reposo")
    page.get_by_role("button", name=LANZAR).click()
    for modo in MODOS:
        expect(page.get_by_test_id(f"resultado-{modo}")).to_have_text("El ataque tuvo éxito" if fila[modo] else "El ataque no tuvo éxito")
        expect(page.get_by_test_id(f"carril-{modo}")).to_have_attribute("data-estado", "exito" if fila[modo] else "fallo")
    expect(page.get_by_role("button", name=LANZAR)).to_be_enabled()


def test_la_fuerza_bruta_se_compara_peticion_a_peticion(page: Page):
    abrir(page)
    page.get_by_role("button", name=ATAQUES["fuerza-bruta"]).click()
    page.get_by_role("button", name=LANZAR).click()
    endurecida, vulnerable = page.locator(".col-endurecida .paso"), page.locator(".col-vulnerable .paso")
    expect(endurecida).to_have_count(20)
    expect(endurecida.nth(4)).to_have_text("401")
    expect(endurecida.nth(5)).to_have_text("429")
    expect(vulnerable.nth(11)).to_have_text("200")
    # Al terminar queda a la vista la petición que decidió el ataque, en las dos columnas.
    expect(vulnerable.nth(11)).to_have_attribute("aria-pressed", "true")
    expect(endurecida.nth(11)).to_have_attribute("aria-pressed", "true")
    expect(page.locator(".col-endurecida pre").last).to_contain_text("Cuenta bloqueada")


def test_el_diff_resalta_la_linea_que_cambia(page: Page):
    abrir(page)
    page.get_by_role("button", name=ATAQUES["inyeccion-sql"]).click()
    diff = page.get_by_test_id("diff")
    expect(diff.locator(".menos.clave").first).to_contain_text("LIKE '%{q}%'")
    expect(diff.locator(".mas.clave").first).to_contain_text("LIKE ?")
    expect(diff.locator(".dl:not(.menos):not(.mas)").first).to_contain_text("def buscar(db, q):")


def test_el_briefing_y_el_resultado_se_explican(page: Page):
    abrir(page)
    page.get_by_role("button", name=ATAQUES["fuerza-bruta"]).click()
    expect(page.get_by_label("Qué vas a ver")).to_contain_text("No hay límite de intentos")
    page.get_by_role("button", name=LANZAR).click()
    expect(page.get_by_test_id("frase-vulnerable")).to_contain_text("cayó en la petición 12 de 20 (admin:dragon2024 → 200)")
    expect(page.get_by_test_id("frase-endurecida")).to_contain_text("bloqueó la cuenta desde la petición 6 con 429")


def test_la_matriz_y_la_barra_lateral_son_las_de_la_api(page: Page):
    abrir(page)
    api = matriz(page)
    for ataque, f in api.items():
        boton = page.get_by_role("button", name=ATAQUES[ataque])
        expect(boton).to_contain_text("Vulnerable: " + ("entra" if f["vulnerable"] else "resiste"))
        expect(boton).to_contain_text("Endurecida: " + ("entra" if f["endurecida"] else "resiste"))
    page.get_by_role("tab", name="Matriz").click()
    filas = page.get_by_test_id("matriz").locator("tbody tr")
    expect(filas).to_have_count(len(api))
    for i, f in enumerate(api.values()):
        texto = [f["nombre"], *("Tuvo éxito" if f[m] else "No tuvo éxito" for m in MODOS)]
        expect(filas.nth(i).locator("th, td")).to_have_text(texto)


def test_error_de_la_api_rehabilita_el_boton(page: Page):
    abrir(page)
    page.route("**/lanzar*", lambda r: r.abort())
    page.get_by_role("button", name=LANZAR).click()
    expect(page.get_by_role("alert")).to_contain_text("No se pudo contactar con el laboratorio")
    expect(page.get_by_role("button", name=LANZAR)).to_be_enabled()


def test_limite_de_uso_se_muestra(page: Page):
    abrir(page)
    page.route("**/lanzar*", lambda r: r.fulfill(status=429, json={"detail": "Demasiados lanzamientos. Espera 12 s."}))
    page.get_by_role("button", name=LANZAR).click()
    expect(page.get_by_role("alert")).to_have_text("Demasiados lanzamientos. Espera 12 s.")
    expect(page.get_by_role("button", name=LANZAR)).to_be_enabled()


def test_el_objetivo_no_es_accesible(page: Page):
    assert page.request.get(f"{BASE}/objetivo/vulnerable/buscar?q=a").status == 404
    assert page.request.get(f"{BASE}/objetivo/vulnerable/archivo?nombre=../secreto.txt").status == 404


def test_sin_errores_de_consola_propios():
    # Los dos fallos provocados arriba (petición abortada y 429) son esperados.
    assert [e for e in errores if "lanzar" not in e] == []

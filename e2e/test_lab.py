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
        # La guía de primera vez tiene su propia prueba; aquí se da por vista para que no tape nada.
        pagina.add_init_script("localStorage.setItem('lab-guia', 'vista')")
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
    red = page.get_by_test_id("network")
    endurecida, vulnerable = red.locator("tr[data-modo=endurecida]"), red.locator("tr[data-modo=vulnerable]")
    expect(endurecida).to_have_count(20)
    expect(endurecida.nth(4).locator("td").nth(4)).to_have_text("401")
    expect(endurecida.nth(5).locator("td").nth(4)).to_have_text("429")
    expect(vulnerable.nth(11).locator("td").nth(4)).to_have_text("200 ✔")
    # Al terminar queda a la vista la petición que decidió el ataque, en crudo.
    expect(vulnerable.nth(11).get_by_role("button")).to_have_attribute("aria-pressed", "true")
    expect(page.get_by_test_id("crudo-respuesta")).to_contain_text("HTTP/1.1 200 OK")
    expect(page.get_by_test_id("crudo-respuesta")).to_contain_text("Sesión iniciada")
    endurecida.nth(5).get_by_role("button").click()
    expect(page.get_by_test_id("crudo-peticion")).to_contain_text("POST /endurecida/login HTTP/1.1")
    expect(page.get_by_test_id("crudo-peticion")).to_contain_text("content-type: application/json")
    expect(page.get_by_test_id("crudo-respuesta")).to_contain_text("HTTP/1.1 429 Too Many Requests")
    expect(page.get_by_test_id("crudo-respuesta")).to_contain_text("Cuenta bloqueada")
    # La terminal del atacante y el registro de cada servidor cuentan lo mismo.
    expect(page.get_by_test_id("terminal")).to_contain_text("[12/20] POST /login admin:dragon2024")
    expect(page.get_by_test_id("terminal")).to_contain_text("vulnerable: prueba de éxito cumplida en la petición 12")
    expect(page.get_by_test_id("registro-endurecida")).to_contain_text('"POST /endurecida/login" 429')


def test_la_guia_sale_la_primera_vez_y_se_puede_volver_a_ver(page: Page):
    ctx = page.context.browser.new_context(viewport={"width": 1360, "height": 1000}, reduced_motion="reduce")
    nueva = ctx.new_page()
    nueva.goto(BASE)
    guia = nueva.get_by_test_id("guia")
    expect(guia).to_contain_text("1 de 5")
    expect(nueva.locator(".ataques.guia-foco")).to_have_count(1)
    for _ in range(4):
        guia.get_by_role("button", name="Siguiente").click()
    expect(guia).to_contain_text("5 de 5")
    expect(nueva.locator(".detalle.guia-foco")).to_have_count(1)
    guia.get_by_role("button", name="Empezar").click()
    expect(guia).to_have_count(0)
    nueva.reload()
    expect(nueva.get_by_role("button", name=LANZAR)).to_be_enabled()
    expect(nueva.get_by_test_id("guia")).to_have_count(0)  # ya vista: no vuelve sola
    nueva.get_by_role("button", name="? Ver la guía").click()
    expect(nueva.get_by_test_id("guia")).to_contain_text("1 de 5")
    nueva.keyboard.press("Escape")
    expect(nueva.get_by_test_id("guia")).to_have_count(0)
    ctx.close()


def test_pausa_paso_y_una_sola_version(page: Page):
    abrir(page)
    page.get_by_role("button", name=ATAQUES["fuerza-bruta"]).click()
    page.get_by_role("button", name="❚❚ Pausa").click()
    page.get_by_role("button", name=LANZAR).click()
    filas = page.get_by_test_id("network").locator("tbody tr")
    expect(page.get_by_role("button", name="Paso ▸")).to_be_enabled()
    page.get_by_role("button", name="Paso ▸").click()
    page.get_by_role("button", name="Paso ▸").click()
    expect(filas).to_have_count(4)
    page.get_by_role("button", name="Solo vulnerable").click()
    expect(filas).to_have_count(2)
    expect(page.get_by_test_id("registro-endurecida")).to_have_count(0)
    expect(page.get_by_test_id("carril-endurecida")).to_have_count(0)
    page.get_by_role("button", name="▶ Seguir").click()
    expect(filas).to_have_count(20)
    page.get_by_role("button", name="Ambas").click()
    expect(filas).to_have_count(40)


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

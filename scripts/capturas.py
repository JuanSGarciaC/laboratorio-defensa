"""Regenera las capturas y el GIF del README contra un laboratorio en marcha.

    docker compose up -d --build --wait          # o uvicorn en local (ver README)
    uv run --with playwright --with pillow scripts/capturas.py            # http://localhost:8095 → docs/img

Opciones: --url, --out, --channel (msedge por defecto; chrome en Linux).
"""
import argparse
import io
import time
from pathlib import Path

from PIL import Image
from playwright.sync_api import Page, expect, sync_playwright

LANZAR = "Lanzar contra las dos"
ANCHO, ALTO = 1440, 900
GUIA_VISTA = "localStorage.setItem('lab-guia', 'vista')"  # la guía tiene su propia captura


def lanzar_y_esperar(page: Page, ataque: str) -> None:
    page.get_by_role("button", name=ataque).click()
    page.get_by_role("button", name=LANZAR).click()
    expect(page.get_by_test_id("resultado-endurecida")).to_be_visible(timeout=20000)
    page.wait_for_timeout(400)


def cuadro(page: Page) -> Image.Image:
    return Image.open(io.BytesIO(page.screenshot())).convert("RGB")


def ir_a(page: Page, selector: str) -> None:
    page.evaluate(f"document.querySelector('{selector}').scrollIntoView({{block: 'start'}}); window.scrollBy(0, -24)")
    page.wait_for_timeout(150)


def gif_fuerza_bruta(page: Page, cada_ms: int = 140) -> tuple[list[Image.Image], list[int]]:
    """Resumen → terminal en marcha → resultado y diff → Network, con pausas largas en cada parada."""
    cuadros, tiempos = [], []

    def pausa(ms: int) -> None:
        cuadros.append(cuadro(page))
        tiempos.append(ms)

    page.get_by_role("button", name="Fuerza bruta de login").click()
    page.evaluate("window.scrollTo(0, 0)")
    page.wait_for_timeout(700)  # termina el descifrado del título
    pausa(2200)  # el resumen: qué intenta y por qué una versión cae y la otra no
    ir_a(page, ".banco")
    page.get_by_role("button", name=LANZAR).click()
    while not page.get_by_test_id("resultado-endurecida").count():
        t0 = time.monotonic()
        pausa(0)
        page.wait_for_timeout(cada_ms)
        tiempos[-1] = round((time.monotonic() - t0) * 1000)  # el GIF va al ritmo real, captura incluida
    page.wait_for_timeout(500)
    pausa(1800)
    ir_a(page, ".conclusion")
    pausa(3200)  # la frase del resultado y el diff
    ir_a(page, ".detalle")
    pausa(3200)  # Network con la petición decisiva en crudo
    return cuadros, tiempos


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://localhost:8095")
    ap.add_argument("--out", default="docs/img")
    ap.add_argument("--channel", default="msedge")
    a = ap.parse_args()
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)

    with sync_playwright() as p:
        nav = p.chromium.launch(channel=a.channel)

        # La guía de primera vez, en su tercer paso.
        guia = nav.new_page(viewport={"width": ANCHO, "height": ALTO})
        guia.goto(a.url)
        for _ in range(2):
            guia.get_by_test_id("guia").get_by_role("button", name="Siguiente").click()
        guia.wait_for_timeout(800)
        guia.screenshot(path=out / "05-guia.png")
        guia.close()

        page = nav.new_page(viewport={"width": ANCHO, "height": ALTO})
        page.add_init_script(GUIA_VISTA)
        page.goto(a.url)
        expect(page.get_by_role("button", name=LANZAR)).to_be_enabled()

        lanzar_y_esperar(page, "Fuerza bruta de login")
        page.evaluate("window.scrollTo(0, 0)")
        page.screenshot(path=out / "01-consola.png", clip={"x": 0, "y": 0, "width": ANCHO, "height": 1000}, full_page=True)

        lanzar_y_esperar(page, "Inyección SQL")
        page.locator(".conclusion").screenshot(path=out / "02-resultado-y-diff.png")
        page.locator("#panel-detalle").screenshot(path=out / "03-network.png")
        page.get_by_role("tab", name="Matriz").click()
        page.locator("#panel-detalle").screenshot(path=out / "04-matriz.png")

        cuadros, tiempos = gif_fuerza_bruta(page)
        nav.close()

    # FASTOCTREE con 255 colores: el corte por mediana deja gris el fondo oscuro.
    cuadros = [c.resize((1080, 675), Image.LANCZOS).quantize(255, method=Image.Quantize.FASTOCTREE) for c in cuadros]
    gif = out / "fuerza-bruta.gif"
    cuadros[0].save(gif, save_all=True, append_images=cuadros[1:], duration=tiempos, loop=0, optimize=True)
    print(f"{len(cuadros)} fotogramas, {gif.stat().st_size / 1024:.0f} KB en {gif}")


if __name__ == "__main__":
    main()

"""Regenera las capturas y el GIF del README contra un laboratorio en marcha.

    docker compose up -d --build --wait
    uv run --with playwright --with pillow scripts/capturas.py            # http://localhost:8095 → docs/img

Opciones: --url, --out, --channel (msedge por defecto; chrome en Linux).
"""
import argparse
import io
from pathlib import Path

from PIL import Image
from playwright.sync_api import Page, expect, sync_playwright

LANZAR = "Lanzar contra las dos"


def lanzar_y_esperar(page: Page, ataque: str) -> None:
    page.get_by_role("button", name=ataque).click()
    page.get_by_role("button", name=LANZAR).click()
    expect(page.get_by_test_id("resultado-endurecida")).to_be_visible(timeout=15000)


def fotogramas(page: Page, zona: dict, cada_ms: int = 130) -> list[Image.Image]:
    """Lanza y fotografía la zona hasta que aparece el resultado, más un segundo y medio de pausa final."""
    page.get_by_role("button", name=LANZAR).click()
    cuadros, quietos = [], 0
    while quietos < 12:
        cuadros.append(Image.open(io.BytesIO(page.screenshot(clip=zona))).convert("RGB"))
        quietos += page.get_by_test_id("resultado-endurecida").count()
        page.wait_for_timeout(cada_ms)
    return cuadros


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
        page = nav.new_page(viewport={"width": 1440, "height": 900})
        page.goto(a.url)
        expect(page.get_by_role("button", name=LANZAR)).to_be_enabled()

        page.screenshot(path=out / "01-reposo.png")

        lanzar_y_esperar(page, "Inyección SQL")
        page.screenshot(path=out / "02-inyeccion-sql.png", full_page=True)

        page.get_by_role("tab", name="Código").click()
        page.locator("#panel-detalle").screenshot(path=out / "03-codigo.png")

        page.get_by_role("tab", name="Matriz").click()
        page.locator("#panel-detalle").screenshot(path=out / "04-matriz.png")

        # GIF: la misma fuerza bruta contra las dos versiones, a la par.
        page.get_by_role("button", name="Fuerza bruta de login").click()
        page.evaluate("window.scrollTo(0, 0)")
        cuadros = fotogramas(page, {"x": 0, "y": 0, "width": 1440, "height": 760})
        nav.close()

    # FASTOCTREE con 255 colores: el corte por mediana deja gris el fondo oscuro.
    cuadros = [c.resize((1080, 570), Image.LANCZOS).quantize(255, method=Image.Quantize.FASTOCTREE) for c in cuadros]
    gif = out / "fuerza-bruta.gif"
    cuadros[0].save(gif, save_all=True, append_images=cuadros[1:], duration=130, loop=0, optimize=True)
    print(f"{len(cuadros)} fotogramas, {gif.stat().st_size / 1024:.0f} KB en {gif}")


if __name__ == "__main__":
    main()

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


def elegir(page: Page, ataque: str, modo: str) -> None:
    page.get_by_role("button", name=ataque).click()
    page.get_by_role("radio", name=modo).check()


def lanzar_y_esperar(page: Page) -> None:
    page.get_by_role("button", name="Lanzar").click()
    expect(page.get_by_test_id("resultado")).to_be_visible(timeout=15000)


def fotogramas(page: Page, zona: dict, cada_ms: int = 130) -> list[Image.Image]:
    """Lanza y fotografía la zona hasta que aparece el resultado, más un segundo de pausa final."""
    page.get_by_role("button", name="Lanzar").click()
    cuadros, quietos = [], 0
    while quietos < 8:
        cuadros.append(Image.open(io.BytesIO(page.screenshot(clip=zona))).convert("RGB"))
        quietos += page.get_by_test_id("resultado").count()
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
        page = nav.new_page(viewport={"width": 1280, "height": 800})
        page.goto(a.url)
        expect(page.get_by_test_id("matriz")).to_be_visible()

        page.screenshot(path=out / "01-reposo.png")

        elegir(page, "Inyección SQL", "Vulnerable")
        lanzar_y_esperar(page)
        page.screenshot(path=out / "02-inyeccion-sql-vulnerable.png", full_page=True)

        elegir(page, "Inyección SQL", "Endurecida")
        lanzar_y_esperar(page)
        page.screenshot(path=out / "03-inyeccion-sql-endurecida.png", full_page=True)

        page.get_by_test_id("matriz").scroll_into_view_if_needed()
        page.get_by_test_id("matriz").screenshot(path=out / "04-matriz.png")

        # GIF: la misma fuerza bruta contra las dos versiones.
        page.evaluate("window.scrollTo(0, 0)")
        zona = {"x": 0, "y": 0, "width": 1280, "height": 640}
        cuadros = []
        for modo in ("Vulnerable", "Endurecida"):
            elegir(page, "Fuerza bruta de login", modo)
            cuadros += fotogramas(page, zona)
        nav.close()

    # FASTOCTREE con 255 colores: el corte por mediana deja gris el fondo oscuro.
    cuadros = [c.resize((960, 480), Image.LANCZOS).quantize(255, method=Image.Quantize.FASTOCTREE) for c in cuadros]
    gif = out / "fuerza-bruta.gif"
    cuadros[0].save(gif, save_all=True, append_images=cuadros[1:], duration=130, loop=0, optimize=True)
    print(f"{len(cuadros)} fotogramas, {gif.stat().st_size / 1024:.0f} KB en {gif}")


if __name__ == "__main__":
    main()

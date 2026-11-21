"""Regenera las capturas y el GIF del README contra un laboratorio en marcha.

    docker compose up -d --build --wait          # o uvicorn en local (ver README)
    uv run --with playwright --with pillow scripts/capturas.py            # http://localhost:8095 → docs/img

Opciones: --url, --out, --channel (msedge por defecto; chrome en Linux).

Capturas a escala 2 (nítidas en pantallas retina), recortadas a cada zona y con paleta de 256 colores.
El GIF se graba con el screencast de Chromium (un fotograma por cambio, con su hora real) y se remuestrea
a 14 fps con una sola paleta para todos los fotogramas: va al ritmo real y no parpadea.
"""
import argparse
import base64
import io
from pathlib import Path

from PIL import Image
from playwright.sync_api import Page, expect, sync_playwright

LANZAR = "Lanzar contra las dos"
VIEWPORT = {"width": 1440, "height": 900}
LATERAL = 310  # ancho de la barra lateral: el GIF y la guía recortan la columna principal
FPS = 14
GUIA_VISTA = "localStorage.setItem('lab-guia', 'vista')"  # la guía tiene su propia captura


def guardar_png(datos: bytes, ruta: Path) -> None:
    """PNG con paleta de 256 colores sin tramado: el texto queda limpio y el archivo pesa una fracción."""
    img = Image.open(io.BytesIO(datos)).convert("RGB")
    img.quantize(256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE).save(ruta, optimize=True)


def zona(page: Page, *selectores: str, margen: int = 12) -> dict:
    """Rectángulo, en coordenadas de página, que cubre todos los selectores."""
    return page.evaluate("""([sel, m]) => {
        const rs = sel.map(s => document.querySelector(s).getBoundingClientRect());
        const x = Math.min(...rs.map(r => r.left)) - m, y = Math.min(...rs.map(r => r.top)) + scrollY - m;
        return {x, y, width: Math.max(...rs.map(r => r.right)) + m - x, height: Math.max(...rs.map(r => r.bottom)) + scrollY + m - y};
    }""", [list(selectores), margen])


def captura(page: Page, ruta: Path, *selectores: str) -> None:
    guardar_png(page.screenshot(clip=zona(page, *selectores), full_page=True), ruta)


def lanzar_y_esperar(page: Page, ataque: str) -> None:
    page.get_by_role("button", name=ataque).click()
    page.get_by_role("button", name=LANZAR).click()
    expect(page.get_by_test_id("resultado-endurecida")).to_be_visible(timeout=20000)
    page.wait_for_timeout(1800)  # termina el destello final y el descifrado del título


def deslizar(page: Page, selector: str, espera: int) -> None:
    page.evaluate(f"window.scrollTo({{top: document.querySelector('{selector}').getBoundingClientRect().top + scrollY - 24, behavior: 'smooth'}})")
    page.wait_for_timeout(espera)


def grabar_gif(page: Page, ruta: Path) -> str:
    """Fuerza bruta: resumen → terminal en marcha → resultado y diff → Network."""
    cdp = page.context.new_cdp_session(page)
    cuadros: list[tuple[float, bytes]] = []

    def al_cuadro(ev: dict) -> None:
        cuadros.append((ev["metadata"]["timestamp"], base64.b64decode(ev["data"])))
        cdp.send("Page.screencastFrameAck", {"sessionId": ev["sessionId"]})

    page.get_by_role("button", name="Fuerza bruta de login").click()
    page.evaluate("window.scrollTo(0, 0)")
    page.wait_for_timeout(900)
    cdp.on("Page.screencastFrame", al_cuadro)
    cdp.send("Page.startScreencast", {"format": "png", "everyNthFrame": 1})
    page.wait_for_timeout(2500)  # el resumen: qué intenta y por qué una versión cae y la otra no
    deslizar(page, ".banco", 900)
    page.get_by_role("button", name=LANZAR).click()
    expect(page.get_by_test_id("resultado-endurecida")).to_be_visible(timeout=20000)
    page.wait_for_timeout(2200)
    deslizar(page, ".conclusion", 3800)  # la frase del resultado y el diff
    deslizar(page, ".detalle", 3800)  # Network con la petición decisiva en crudo
    cdp.send("Page.stopScreencast")
    cdp.detach()

    # Remuestreo a ritmo real: en cada instante, el último fotograma recibido. Los repetidos se funden en uno más largo.
    inicio, fin = cuadros[0][0], cuadros[-1][0] + 1.5
    paso, i, elegidos = 1 / FPS, 0, []
    for k in range(int((fin - inicio) * FPS)):
        while i + 1 < len(cuadros) and cuadros[i + 1][0] <= inicio + k * paso:
            i += 1
        if elegidos and elegidos[-1][0] == i:
            elegidos[-1][1] += 1
        else:
            elegidos.append([i, 1])

    recorte = (LATERAL, 0, VIEWPORT["width"], VIEWPORT["height"])
    imgs = {i: Image.open(io.BytesIO(cuadros[i][1])).convert("RGB").crop(recorte) for i, _ in elegidos}
    # Una sola paleta, sacada de un mosaico de fotogramas de todo el recorrido: sin parpadeo de colores entre cuadros.
    muestra = list(imgs.values())[:: max(1, len(imgs) // 8)]
    mosaico = Image.new("RGB", (muestra[0].width, muestra[0].height * len(muestra)))
    for n, m in enumerate(muestra):
        mosaico.paste(m, (0, n * m.height))
    paleta = mosaico.quantize(255, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
    marcos = [imgs[i].quantize(palette=paleta, dither=Image.Dither.NONE) for i, _ in elegidos]
    duraciones = [round(1000 * n / FPS) for _, n in elegidos]
    marcos[0].save(ruta, save_all=True, append_images=marcos[1:], duration=duraciones, loop=0, optimize=True)
    return f"{len(marcos)} fotogramas distintos a {FPS} fps, {sum(duraciones) / 1000:.1f} s"


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
        try:
            retina = nav.new_context(viewport=VIEWPORT, device_scale_factor=2)

            # La guía de primera vez, en su tercer paso, sobre la columna principal.
            guia = retina.new_page()
            guia.goto(a.url)
            for _ in range(2):
                guia.get_by_test_id("guia").get_by_role("button", name="Siguiente").click()
            guia.wait_for_timeout(1000)
            guardar_png(guia.screenshot(clip={"x": LATERAL, "y": 0, "width": VIEWPORT["width"] - LATERAL, "height": VIEWPORT["height"]}), out / "05-guia.png")
            guia.close()

            page = retina.new_page()
            page.add_init_script(GUIA_VISTA)
            page.goto(a.url)
            # Con fondo fijo, las capturas más altas que la ventana muestran un salto de tono a media altura.
            page.add_style_tag(content="body { background-attachment: scroll !important; }")
            expect(page.get_by_role("button", name=LANZAR)).to_be_enabled()

            lanzar_y_esperar(page, "Fuerza bruta de login")
            captura(page, out / "01-consola.png", ".banco")
            captura(page, out / "03-network.png", "#panel-detalle")

            lanzar_y_esperar(page, "Inyección SQL")
            captura(page, out / "02-resultado-y-diff.png", ".conclusion")
            page.get_by_role("tab", name="Matriz").click()
            page.wait_for_timeout(800)
            captura(page, out / "04-matriz.png", "#panel-detalle")

            lanzar_y_esperar(page, "Redirección abierta")
            captura(page, out / "06-redireccion-abierta.png", ".cabecera", ".conclusion")

            # El GIF a escala 1 y recortado sin redimensionar: el texto de la terminal se lee tal cual.
            video = nav.new_context(viewport=VIEWPORT).new_page()
            video.add_init_script(GUIA_VISTA)
            video.goto(a.url)
            expect(video.get_by_role("button", name=LANZAR)).to_be_enabled()
            print(grabar_gif(video, out / "fuerza-bruta.gif"))
        finally:
            nav.close()

    for f in sorted(out.iterdir()):
        print(f"{f.name}: {f.stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    main()

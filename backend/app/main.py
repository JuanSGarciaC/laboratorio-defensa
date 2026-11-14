"""API del laboratorio: catálogo, lanzar un ataque y matriz de resultados. Sirve también el panel compilado."""
import math
import os
import time
from collections import deque
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.staticfiles import StaticFiles

from .catalogo import ATAQUES
from .lanzador import Ejecucion, lanzar
from .objetivo import FUENTES, Modo, crea_objetivo

VENTANA = 60.0


def crea_app() -> FastAPI:
    # La configuración se lee aquí y no al importar, para que las pruebas puedan cambiarla.
    expuesto = os.environ.get("OBJETIVO_EXPUESTO", "").lower() == "true"
    cabecera_ip = os.environ.get("CLIENT_IP_HEADER", "")
    limite = int(os.environ.get("LIMITE_POR_MINUTO", "30"))

    app = FastAPI(title="Laboratorio de defensa", version="0.1.0")
    usos: dict[str, deque[float]] = {}  # solo en memoria: la IP no se guarda ni se muestra
    matriz: list[dict] = []

    def limitar(request: Request) -> None:
        ip = (cabecera_ip and request.headers.get(cabecera_ip)) or (request.client.host if request.client else "?")
        ahora = time.monotonic()
        for clave in [k for k, v in usos.items() if not v or ahora - v[-1] >= VENTANA]:
            del usos[clave]  # visitantes inactivos: el diccionario no crece sin fin
        cola = usos.setdefault(ip, deque())
        while cola and ahora - cola[0] >= VENTANA:
            cola.popleft()
        if len(cola) >= limite:
            espera = math.ceil(VENTANA - (ahora - cola[0])) if cola else int(VENTANA)
            raise HTTPException(429, f"Demasiados lanzamientos. Espera {espera} s.", headers={"Retry-After": str(espera)})
        cola.append(ahora)

    @app.get("/api/health")
    def health():
        return {"status": "ok"}

    @app.get("/api/ataques")
    def ataques():
        return [
            {**a.model_dump(exclude={"peticiones"}), "n_peticiones": len(a.peticiones), "codigo": FUENTES[a.funcion]}
            for a in ATAQUES.values()
        ]

    @app.post("/api/ataques/{id}/lanzar", dependencies=[Depends(limitar)])
    async def lanzar_ataque(id: str, modo: Modo) -> Ejecucion:
        if id not in ATAQUES:
            raise HTTPException(404, "Ese ataque no está en el catálogo.")
        return await lanzar(ATAQUES[id], modo)

    @app.get("/api/matriz")
    async def ver_matriz():
        if not matriz:  # se calcula una vez: el catálogo y el objetivo son deterministas
            matriz.extend([
                {"ataque": a.id, "nombre": a.nombre,
                 "vulnerable": (await lanzar(a, "vulnerable")).exito, "endurecida": (await lanzar(a, "endurecida")).exito}
                for a in ATAQUES.values()
            ])
        return matriz

    if expuesto:  # solo para probar a mano en local; la demo pública lo deja cerrado
        app.mount("/objetivo", crea_objetivo())

    dist = Path(__file__).resolve().parents[2] / "frontend" / "dist"
    if dist.is_dir():  # al final, para no tapar /api
        app.mount("/", StaticFiles(directory=dist, html=True), name="panel")
    return app


app = crea_app()

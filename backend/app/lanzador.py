"""Lanza un ataque del catálogo contra el objetivo, dentro del proceso.

No recibe URL ni host: las peticiones van por ASGITransport a un objetivo recién creado,
así que no pueden salir a la red ni apuntar a otro sitio.
"""
import random
import time

import httpx
from pydantic import BaseModel

from .catalogo import Ataque
from .objetivo import Modo, crea_objetivo

RECORTE = 2000


class Paso(BaseModel):
    n: int
    metodo: str
    ruta: str
    params: dict[str, str]
    cuerpo: dict[str, str] | None
    estado: int
    respuesta: str
    cumple: bool  # este paso satisface la prueba de éxito del ataque
    destino: str  # ruta con consulta, tal como la recibió el objetivo
    cabeceras_peticion: dict[str, str]
    cabeceras_respuesta: dict[str, str]
    bytes: int  # tamaño del cuerpo de la respuesta, sin recortar
    ms: float  # duración real, dentro del proceso


class Ejecucion(BaseModel):
    ataque: str
    modo: Modo
    origen: str
    pasos: list[Paso]
    exito: bool


async def lanzar(ataque: Ataque, modo: Modo) -> Ejecucion:
    origen = f"203.0.113.{random.randint(1, 254)}"  # rango reservado para documentación (RFC 5737)
    # Objetivo nuevo por ejecución: el bloqueo de una no afecta a la siguiente.
    transporte = httpx.ASGITransport(app=crea_objetivo(), client=(origen, 40000), raise_app_exceptions=False)
    pasos = []
    async with httpx.AsyncClient(transport=transporte, base_url=f"http://objetivo/{modo}") as cliente:
        for n, p in enumerate(ataque.peticiones, 1):
            inicio = time.perf_counter()
            r = await cliente.request(p.metodo, p.ruta, params=p.params, json=p.cuerpo)
            ms = (time.perf_counter() - inicio) * 1000
            cumple = (ataque.exito.contiene is not None and ataque.exito.contiene in r.text) or r.status_code == ataque.exito.estado
            pasos.append(Paso(n=n, metodo=p.metodo, ruta=p.ruta, params=p.params, cuerpo=p.cuerpo,
                              estado=r.status_code, respuesta=r.text[:RECORTE], cumple=cumple,
                              destino=r.request.url.raw_path.decode("ascii"),
                              cabeceras_peticion=dict(r.request.headers), cabeceras_respuesta=dict(r.headers),
                              bytes=len(r.content), ms=round(ms, 2)))
    return Ejecucion(ataque=ataque.id, modo=modo, origen=origen, pasos=pasos, exito=any(p.cumple for p in pasos))

"""Aplicación objetivo del laboratorio: cada ruta existe dos veces, vulnerable y endurecida.

Es vulnerable a propósito, pero acotada: la base es ficticia y de solo lectura, y ningún modo
lee archivos fuera de la carpeta lab/.
"""
import hashlib
import hmac
import html
import inspect
import os
import sqlite3
import time
from pathlib import Path
from typing import Callable, Literal

from fastapi import FastAPI
from fastapi.responses import HTMLResponse, JSONResponse, PlainTextResponse
from pydantic import BaseModel

Modo = Literal["vulnerable", "endurecida"]

LAB = (Path(__file__).parent / "lab").resolve()
PUBLICO = LAB / "publico"

_SAL = os.urandom(16)


def _hash(clave: str) -> str:
    return hashlib.scrypt(clave.encode(), salt=_SAL, n=2**12, r=8, p=1).hex()


_PRODUCTOS = [("Teclado mecánico", 320000), ("Ratón inalámbrico", 95000), ("Monitor 27 pulgadas", 1150000),
              ("Base para portátil", 78000), ("Cámara web", 210000)]
_USUARIOS = [("admin", "admin@lab.invalid", _hash("dragon2024")), ("soporte", "soporte@lab.invalid", _hash("Verano#88"))]


def _base() -> sqlite3.Connection:
    db = sqlite3.connect(":memory:", check_same_thread=False)
    db.execute("CREATE TABLE productos (nombre TEXT, precio INTEGER)")
    db.execute("CREATE TABLE usuarios (usuario TEXT, email TEXT, clave TEXT)")
    db.executemany("INSERT INTO productos VALUES (?, ?)", _PRODUCTOS)
    db.executemany("INSERT INTO usuarios VALUES (?, ?, ?)", _USUARIOS)
    db.commit()
    db.execute("PRAGMA query_only = ON")  # ni la inyección puede escribir
    return db


def _pagina(termino: str, filas: list) -> str:
    items = "".join(f"<li>{html.escape(str(a))}: {html.escape(str(b))}</li>" for a, b in filas)
    return f"<h1>Resultados para {termino}</h1><ul>{items}</ul>"


def _clave_correcta(db: sqlite3.Connection, usuario: str, clave: str) -> bool:
    fila = db.execute("SELECT clave FROM usuarios WHERE usuario = ?", (usuario,)).fetchone()
    return fila is not None and hmac.compare_digest(fila[0], _hash(clave))


# --- Búsqueda -----------------------------------------------------------------

def buscar_vulnerable(db, q):
    # El texto del visitante se pega dentro del SQL y vuelve a la página tal cual.
    filas = db.execute(f"SELECT nombre, precio FROM productos WHERE nombre LIKE '%{q}%'").fetchall()
    return _pagina(q, filas)


def buscar_endurecida(db, q):
    # El texto viaja como parámetro (nunca es SQL) y se escapa antes de mostrarlo.
    filas = db.execute("SELECT nombre, precio FROM productos WHERE nombre LIKE ?", (f"%{q}%",)).fetchall()
    return _pagina(html.escape(q), filas)


# --- Archivos -----------------------------------------------------------------

def archivo_vulnerable(nombre):
    # Une la ruta sin comprobar dónde termina: "../" sale de la carpeta pública.
    destino = (PUBLICO / nombre).resolve()
    return destino if destino.is_relative_to(LAB) else None  # límite del laboratorio, no una defensa


def archivo_endurecida(nombre):
    # Resuelve la ruta y exige que siga dentro de la carpeta pública.
    destino = (PUBLICO / nombre).resolve()
    return destino if destino.is_relative_to(PUBLICO) else None


# --- Login --------------------------------------------------------------------

def login_vulnerable(db, fallos, ahora, usuario, clave):
    # Sin límite: se puede probar una contraseña tras otra.
    return 200 if _clave_correcta(db, usuario, clave) else 401


def login_endurecida(db, fallos, ahora, usuario, clave):
    # Cinco fallos en un minuto bloquean la cuenta, aunque la sexta contraseña sea la buena.
    recientes = [t for t in fallos.get(usuario, []) if ahora - t < 60]
    if len(recientes) >= 5:
        return 429
    if _clave_correcta(db, usuario, clave):
        return 200
    fallos[usuario] = recientes + [ahora]
    return 401


_RUTAS = {
    "buscar": {"vulnerable": buscar_vulnerable, "endurecida": buscar_endurecida},
    "archivo": {"vulnerable": archivo_vulnerable, "endurecida": archivo_endurecida},
    "login": {"vulnerable": login_vulnerable, "endurecida": login_endurecida},
}
# El panel enseña este código tal cual: no hay una copia aparte que pueda quedar vieja.
FUENTES: dict[str, dict[str, str]] = {r: {m: inspect.getsource(f) for m, f in v.items()} for r, v in _RUTAS.items()}

_MENSAJE = {200: "Sesión iniciada", 401: "Usuario o clave incorrectos", 429: "Cuenta bloqueada un minuto por intentos fallidos"}


class Credenciales(BaseModel):
    usuario: str
    clave: str


def crea_objetivo(reloj: Callable[[], float] = time.monotonic) -> FastAPI:
    app = FastAPI(title="Objetivo del laboratorio", docs_url=None, redoc_url=None, openapi_url=None)
    db = _base()
    fallos: dict[str, list[float]] = {}

    @app.get("/{modo}/buscar", response_class=HTMLResponse)
    def buscar(modo: Modo, q: str = ""):
        try:
            return _RUTAS["buscar"][modo](db, q)
        except (sqlite3.Error, sqlite3.Warning):
            return PlainTextResponse("Error en la consulta", status_code=500)

    @app.get("/{modo}/archivo", response_class=PlainTextResponse)
    def archivo(modo: Modo, nombre: str = ""):
        try:
            destino = _RUTAS["archivo"][modo](nombre)
        except (ValueError, OSError):  # byte nulo o ruta imposible
            destino = None
        if destino is None or not destino.is_file():
            return PlainTextResponse("No existe", status_code=404)
        return destino.read_text(encoding="utf-8")

    @app.post("/{modo}/login")
    def login(modo: Modo, cred: Credenciales):
        estado = _RUTAS["login"][modo](db, fallos, reloj(), cred.usuario, cred.clave)
        return JSONResponse({"mensaje": _MENSAJE[estado]}, status_code=estado)

    return app

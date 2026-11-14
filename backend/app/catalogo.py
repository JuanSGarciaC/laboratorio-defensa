"""Catálogo de ataques, leído de ataques.yaml al importar."""
from pathlib import Path
from typing import Literal

import yaml
from pydantic import BaseModel


class Peticion(BaseModel):
    metodo: Literal["GET", "POST"]
    ruta: str
    params: dict[str, str] = {}
    cuerpo: dict[str, str] | None = None


class Exito(BaseModel):
    contiene: str | None = None
    estado: int | None = None


class Ataque(BaseModel):
    id: str
    nombre: str
    descripcion: str
    owasp: str
    attack: str
    funcion: Literal["login", "buscar", "archivo"]
    peticiones: list[Peticion]
    exito: Exito


_crudo = yaml.safe_load((Path(__file__).parent / "ataques.yaml").read_text(encoding="utf-8"))
ATAQUES: dict[str, Ataque] = {a["id"]: Ataque(**a) for a in _crudo}

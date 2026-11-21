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
    cabeceras: dict[str, str] = {}


class Exito(BaseModel):
    contiene: str | None = None  # en el cuerpo, o en la cabecera indicada
    estado: int | None = None
    cabecera: str | None = None
    falta: str | None = None  # la respuesta llega sin esta cabecera


class Ataque(BaseModel):
    id: str
    nombre: str
    descripcion: str
    owasp: str
    attack: str
    cwe: str
    falla: str  # por qué cae la versión vulnerable
    defensa: str  # qué hace distinto la endurecida
    funcion: Literal["login", "buscar", "archivo", "pedido", "salir", "inicio"]
    peticiones: list[Peticion]
    exito: Exito
    variable: str | None = None  # campo del cuerpo que el visitante puede cambiar con su diccionario


def con_ajustes(ataque: Ataque, intentos: int | None, diccionario: list[str] | None) -> list[Peticion]:
    """Peticiones del ataque con los ajustes del visitante. Solo cambia el valor de `variable`
    en el cuerpo: método, ruta y destino siguen siendo los del catálogo."""
    base = ataque.peticiones
    if diccionario:
        plantilla = base[0]
        base = [plantilla.model_copy(update={"cuerpo": {**(plantilla.cuerpo or {}), ataque.variable: c}}) for c in diccionario]
    return base[:intentos] if intentos else base


_crudo = yaml.safe_load((Path(__file__).parent / "ataques.yaml").read_text(encoding="utf-8"))
ATAQUES: dict[str, Ataque] = {a["id"]: Ataque(**a) for a in _crudo}

import asyncio
import inspect
import ipaddress

import pytest

from app.catalogo import ATAQUES, Peticion
from app.lanzador import lanzar


def corre(ataque, modo):
    return asyncio.run(lanzar(ataque, modo))


@pytest.mark.parametrize("id", ["inyeccion-sql", "xss-reflejado", "recorrido-rutas", "fuerza-bruta"])
def test_cada_ataque_funciona_en_vulnerable_y_falla_en_endurecida(id):
    assert corre(ATAQUES[id], "vulnerable").exito is True
    assert corre(ATAQUES[id], "endurecida").exito is False


def test_el_catalogo_tiene_los_cuatro_ataques_con_sus_etiquetas():
    assert list(ATAQUES) == ["inyeccion-sql", "xss-reflejado", "recorrido-rutas", "fuerza-bruta"]
    assert ATAQUES["fuerza-bruta"].attack == "T1110.001" and ATAQUES["recorrido-rutas"].owasp.startswith("A01:2021")


def test_fuerza_bruta_paso_a_paso():
    v = corre(ATAQUES["fuerza-bruta"], "vulnerable")
    assert len(v.pasos) == 20 and v.pasos[11].cumple and v.pasos[11].estado == 200
    assert sum(p.cumple for p in v.pasos) == 1
    e = corre(ATAQUES["fuerza-bruta"], "endurecida")
    assert [p.estado for p in e.pasos[:6]] == [401] * 5 + [429]


def test_origen_simulado_y_ejecuciones_aisladas():
    a, b = corre(ATAQUES["fuerza-bruta"], "endurecida"), corre(ATAQUES["fuerza-bruta"], "endurecida")
    assert ipaddress.ip_address(a.origen) in ipaddress.ip_network("203.0.113.0/24")
    assert b.pasos[0].estado == 401  # el bloqueo de la primera no llega a la segunda


def test_respuesta_recortada_y_error_del_objetivo_no_rompe():
    roto = ATAQUES["inyeccion-sql"].model_copy(update={"peticiones": [Peticion(metodo="GET", ruta="/buscar", params={"q": "'"})]})
    ej = corre(roto, "vulnerable")
    assert ej.pasos[0].estado == 500 and ej.exito is False
    largo = ATAQUES["xss-reflejado"].model_copy(update={"peticiones": [Peticion(metodo="GET", ruta="/buscar", params={"q": "a" * 5000})]})
    assert all(len(p.respuesta) <= 2000 for p in corre(largo, "vulnerable").pasos)


def test_el_lanzador_no_acepta_destino():
    assert list(inspect.signature(lanzar).parameters) == ["ataque", "modo"]

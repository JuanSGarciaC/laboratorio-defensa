import asyncio
import inspect
import ipaddress

import pytest

from app.catalogo import ATAQUES, Peticion, con_ajustes
from app.lanzador import lanzar


def corre(ataque, modo):
    return asyncio.run(lanzar(ataque, modo))


TODOS = ["inyeccion-sql", "xss-reflejado", "recorrido-rutas", "fuerza-bruta", "idor", "redireccion-abierta", "clickjacking"]


@pytest.mark.parametrize("id", TODOS)
def test_cada_ataque_funciona_en_vulnerable_y_falla_en_endurecida(id):
    assert corre(ATAQUES[id], "vulnerable").exito is True
    assert corre(ATAQUES[id], "endurecida").exito is False


def test_el_catalogo_tiene_los_siete_ataques_con_sus_etiquetas():
    assert list(ATAQUES) == TODOS
    assert ATAQUES["fuerza-bruta"].attack == "T1110.001" and ATAQUES["recorrido-rutas"].owasp.startswith("A01:2021")
    assert [ATAQUES[i].cwe for i in TODOS] == ["CWE-89", "CWE-79", "CWE-22", "CWE-307", "CWE-639", "CWE-601", "CWE-1021"]
    assert all(a.falla and a.defensa for a in ATAQUES.values())


def test_la_redireccion_no_se_sigue_y_el_destino_queda_en_location():
    v = corre(ATAQUES["redireccion-abierta"], "vulnerable").pasos
    assert [p.estado for p in v] == [302, 302]
    assert v[0].cabeceras_respuesta["location"] == "https://phishing.invalid/login"


def test_fuerza_bruta_paso_a_paso():
    v = corre(ATAQUES["fuerza-bruta"], "vulnerable")
    assert len(v.pasos) == 20 and v.pasos[11].cumple and v.pasos[11].estado == 200
    assert sum(p.cumple for p in v.pasos) == 1
    e = corre(ATAQUES["fuerza-bruta"], "endurecida")
    assert [p.estado for p in e.pasos[:6]] == [401] * 5 + [429]


def test_cada_paso_trae_la_peticion_y_la_respuesta_en_crudo():
    p = corre(ATAQUES["fuerza-bruta"], "endurecida").pasos[5]
    assert p.destino == "/endurecida/login"
    assert p.cabeceras_peticion["content-type"] == "application/json"
    assert p.cabeceras_respuesta["content-type"] == "application/json"
    assert p.bytes == len(p.respuesta.encode()) and p.ms >= 0
    q = corre(ATAQUES["recorrido-rutas"], "vulnerable").pasos[0]
    assert q.destino == "/vulnerable/archivo?nombre=..%2Fsecreto.txt"


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
    # Solo recibe peticiones del catálogo (ajustadas o no); ningún parámetro es una URL o un host.
    assert list(inspect.signature(lanzar).parameters) == ["ataque", "modo", "peticiones"]


def test_los_ajustes_solo_cambian_la_variable():
    fb = ATAQUES["fuerza-bruta"]
    ajustadas = con_ajustes(fb, 3, ["../../x", "http://otro.invalid", "a"])
    assert [(p.metodo, p.ruta, p.params, p.cabeceras) for p in ajustadas] == [("POST", "/login", {}, {})] * 3
    assert [p.cuerpo for p in ajustadas] == [{"usuario": "admin", "clave": c} for c in ("../../x", "http://otro.invalid", "a")]
    assert con_ajustes(fb, 5, None) == fb.peticiones[:5]

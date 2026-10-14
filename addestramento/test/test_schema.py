from __future__ import annotations

from generatore.schema import Carico, Schema, Sconnessione, Vincolo, valida

ESEMPIO = {
    "famiglia": "trave",
    "nodi": [[0, 0], [3, 0], [1, 0]],
    "aste": [[0, 1]],
    "vincoli": [
        {"nodo": 0, "tipo": "cerniera", "angolo": 0},
        {"asta": 0, "s": 0.3333333, "tipo": "carrello", "angolo": 0},
    ],
    "sconnessioni": [{"nodo": 2, "tipo": "cerniera", "svincolate": None}],
    "carichi": [
        {"tipo": "distribuito", "asta": 0, "s1": 0, "s2": 1, "direzione": -90, "coefficiente": 1},
        {"tipo": "forza", "nodo": 1, "direzione": 180, "coefficiente": 2},
        {"tipo": "momento", "asta": 0, "s": 0.5, "verso": -1, "coefficiente": 1},
    ],
}


def schema_buono() -> Schema:
    return Schema(
        famiglia="trave",
        nodi=[(0.0, 0.0), (3.0, 0.0)],
        aste=[(0, 1)],
        vincoli=[Vincolo(tipo="cerniera", angolo=0, nodo=0), Vincolo(tipo="carrello", angolo=0, nodo=1)],
        sconnessioni=[],
        carichi=[Carico(tipo="distribuito", coefficiente=1, direzione=-90, asta=0, s1=0, s2=1)],
    )


def test_andata_e_ritorno_json():
    s = Schema.da_json(ESEMPIO)
    assert s.a_json() == Schema.da_json(s.a_json()).a_json()
    assert s.a_json()["sconnessioni"][0]["svincolate"] is None
    assert s.a_json()["vincoli"][1] == {"asta": 0, "s": 0.3333333, "tipo": "carrello", "angolo": 0}


def test_valida_schema_buono():
    assert valida(schema_buono()) == []


def test_valida_riferimenti():
    s = schema_buono()
    s.aste.append((0, 7))
    s.vincoli.append(Vincolo(tipo="carrello", angolo=0, asta=5, s=0.5))
    s.vincoli.append(Vincolo(tipo="carrello", angolo=0, asta=0, s=1.2))
    s.carichi.append(Carico(tipo="distribuito", coefficiente=1, direzione=-90, asta=0, s1=0.8, s2=0.2))
    s.sconnessioni.append(Sconnessione(nodo=9, tipo="cerniera", svincolate=None))
    problemi = valida(s)
    assert len(problemi) == 5

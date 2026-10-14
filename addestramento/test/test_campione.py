from __future__ import annotations

import math

from generatore.campione import a_contratto, genera


def test_a_contratto_ribalta_y_e_angoli():
    prim = {
        "larghezza": 100, "altezza": 100,
        "aste": [{"a": {"x": 0, "y": 10}, "b": {"x": 50, "y": 10}, "spessore": 3, "confidenza": 1}],
        "pallini": [{"c": {"x": 5, "y": 20}, "r": 6, "confidenza": 1}],
        "corpi": [{"tipo": "triangolo", "attacco": {"x": 1, "y": 2}, "angolo": 0.3, "confidenza": 1}],
        "frecce": [{"punta": {"x": 10, "y": 20}, "direzione": math.pi / 2, "lunghezza": 40, "confidenza": 1}],
        "momenti": [{"centro": {"x": 3, "y": 4}, "raggio": 25, "verso": "orario", "confidenza": 1}],
        "nodi": [],
        "scritte": [{"centro": {"x": 7, "y": 8}, "valore": {"famiglia": "L", "valore": 1},
                     "estremi": [{"x": 0, "y": 90}, {"x": 100, "y": 90}], "confidenza": 1}],
    }
    c = a_contratto(prim, 100)
    assert c["aste"][0]["a"] == {"x": 0, "y": 90}
    assert c["pallini"][0]["c"] == {"x": 5, "y": 80}
    assert c["corpi"][0]["angolo"] == -0.3
    assert c["frecce"][0]["punta"] == {"x": 10, "y": 80}
    assert c["frecce"][0]["direzione"] == -math.pi / 2
    assert c["momenti"][0]["verso"] == "orario"
    assert c["scritte"][0]["estremi"][0] == {"x": 0, "y": 10}
    assert prim["aste"][0]["a"] == {"x": 0, "y": 10}  # l'ingresso non si tocca


def test_genera_ha_primitive_schema_e_meta():
    c = genera(5)
    assert set(c) >= {"primitive", "schema", "meta"}
    assert set(c["meta"]) >= {"seme", "famiglia", "stile", "riquadro", "scala"}
    assert c["meta"]["seme"] == 5
    assert genera(5)["primitive"] == c["primitive"]


def test_lo_schema_si_scrive_senza_arrotondare():
    import json
    from generatore.__main__ import serializza
    c = genera(27)
    assert json.loads(serializza(c))["schema"] == c["schema"]

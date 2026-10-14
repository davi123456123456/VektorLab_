from __future__ import annotations

import math

import numpy as np
import pytest

from generatore.scena import costruisci_scena, primitive_della_scena
from generatore.schema import Carico, Schema, Sconnessione, Vincolo

SCALA = 100.0
R = 0.06 * SCALA


def scena(schema, stile="catena", seme=0):
    return costruisci_scena(schema, np.random.default_rng(seme), SCALA, stile)


def prim(schema, stile="catena", seme=0):
    return primitive_della_scena(scena(schema, stile, seme))


def dist(p, q):
    return math.hypot(p["x"] - q["x"], p["y"] - q["y"])


def dist_retta(p, a, b):
    dx, dy = b["x"] - a["x"], b["y"] - a["y"]
    return abs((p["x"] - a["x"]) * dy - (p["y"] - a["y"]) * dx) / math.hypot(dx, dy)


def trave_con_cerniera():
    return Schema("trave", [(0, 0), (1, 0), (2, 0)], [(0, 1), (1, 2)],
                  [Vincolo("incastro", 270, nodo=0), Vincolo("incastro", 90, nodo=2)],
                  [Sconnessione(1, "cerniera", None)], [])


def test_cerniera_interna_completa():
    p = prim(trave_con_cerniera())
    assert len(p["pallini"]) == 1
    c = p["pallini"][0]["c"]
    estremi = [e for s in p["aste"] for e in (s["a"], s["b"])]
    vicini = [e for e in estremi if dist(e, c) < 2 * R]
    assert len(vicini) == 2
    assert all(abs(dist(e, c) - R) < 1e-6 for e in vicini)


def test_carrello_in_campata_tangente():
    s = Schema("trave", [(0, 0), (3, 0)], [(0, 1)],
               [Vincolo("incastro", 270, nodo=0), Vincolo("carrello", 0, asta=0, s=1 / 3)], [], [])
    p = prim(s)
    asta = p["aste"][0]
    (pallino,) = p["pallini"]
    assert abs(dist_retta(pallino["c"], asta["a"], asta["b"]) - R) < 1e-6
    rulli = [k for k in p["corpi"] if k["tipo"] == "triangoloRulli"]
    assert len(rulli) == 1
    assert abs(dist_retta(rulli[0]["attacco"], asta["a"], asta["b"]) - 2 * R) < 1e-6


def test_sconnessione_parziale_pallino_accanto():
    # es. 20 in B: colonna (0,0)-(0,1)-(0,2), diagonale (0,1)-(2,0) svincolata
    s = Schema("portale", [(0, 0), (0, 1), (0, 2), (2, 0)], [(0, 1), (1, 2), (1, 3)],
               [Vincolo("cerniera", 0, nodo=0), Vincolo("carrello", 0, nodo=3)],
               [Sconnessione(1, "cerniera", [2])], [])
    sc = scena(s)
    p = primitive_della_scena(sc)
    bx, by = sc.px(0, 1)
    pallino = min(p["pallini"], key=lambda c: math.hypot(c["c"]["x"] - bx, c["c"]["y"] - by))
    colonna = [a for a in p["aste"] if abs(a["a"]["x"] - a["b"]["x"]) < 1e-6]
    assert colonna
    assert abs(dist_retta(pallino["c"], colonna[0]["a"], colonna[0]["b"]) - R) < 1e-6
    assert pallino["c"]["x"] > colonna[0]["a"]["x"]  # dalla parte della diagonale


def test_distribuito_frecce_concordi_sull_asta():
    s = Schema("trave", [(0, 0), (2, 0)], [(0, 1)],
               [Vincolo("cerniera", 0, nodo=0), Vincolo("carrello", 0, nodo=1)], [],
               [Carico("distribuito", 2, direzione=-90, asta=0, s1=0, s2=1)])
    for seme in range(10):
        p = prim(s, seme=seme)
        frecce = p["frecce"]
        assert len(frecce) >= 3
        assert len({round(f["direzione"], 9) for f in frecce}) == 1
        asta = p["aste"][0]
        for f in frecce:
            punta = f["punta"]
            coda = {"x": punta["x"] - f["lunghezza"] * math.cos(f["direzione"]),
                    "y": punta["y"] - f["lunghezza"] * math.sin(f["direzione"])}
            assert min(dist_retta(punta, asta["a"], asta["b"]), dist_retta(coda, asta["a"], asta["b"])) < 1e-6
        assert any(sc["valore"] == {"famiglia": "q", "coefficiente": 2} for sc in p["scritte"])


def test_quote_a_catena_coprono_tutte_le_colonne():
    s = Schema("trave", [(0, 0), (1, 0), (3.5, 0)], [(0, 1), (1, 2)],
               [Vincolo("cerniera", 0, nodo=0), Vincolo("carrello", 0, asta=1, s=0.4), Vincolo("carrello", 0, nodo=2)],
               [Sconnessione(1, "cerniera", None)], [])
    sc = scena(s)
    p = primitive_della_scena(sc)
    xs_quote = {round(e["x"], 6) for q in p["scritte"] if q["valore"]["famiglia"] == "L" for e in q["estremi"]}
    # colonne attese: 0, 1, 2 (carrello a 0.4 dell'asta 1–3.5), 3.5 → in pixel
    attese = {round(x, 6) for x in (sc.px(0, 0)[0], sc.px(1, 0)[0], sc.px(2, 0)[0], sc.px(3.5, 0)[0])}
    assert attese <= xs_quote
    valori = sorted(q["valore"]["valore"] for q in p["scritte"] if q["valore"]["famiglia"] == "L")
    assert valori == [1, 1, 1.5]


@pytest.mark.parametrize("stile", ["catena", "accanto"])
def test_coordinate_finite_e_dentro(stile):
    from generatore.strutture import genera_schema
    for seme in range(80):
        schema = genera_schema(np.random.default_rng(seme))
        sc = scena(schema, stile, seme)
        p = primitive_della_scena(sc)
        assert set(p) == {"larghezza", "altezza", "aste", "pallini", "corpi", "frecce", "momenti", "nodi", "scritte"}
        punti = [q for s in p["aste"] for q in (s["a"], s["b"])] + [c["c"] for c in p["pallini"]] \
            + [k["attacco"] for k in p["corpi"]] + [f["punta"] for f in p["frecce"]] \
            + [m["centro"] for m in p["momenti"]] + [s["centro"] for s in p["scritte"]]
        for q in punti:
            assert math.isfinite(q["x"]) and math.isfinite(q["y"])
            assert 0 <= q["x"] <= sc.larghezza and 0 <= q["y"] <= sc.altezza
        x0, y0, x1, y1 = sc.riquadro
        assert 0 <= x0 < x1 <= sc.larghezza and 0 <= y0 < y1 <= sc.altezza


def test_la_freccia_di_una_forza_non_si_sovrappone_alle_aste():
    from generatore.strutture import genera_schema
    for seme in range(300):
        schema = genera_schema(np.random.default_rng(seme))
        sc = scena(schema, seme=seme)
        frecce = [e for e in sc.elementi if e.forma == "freccia"]
        for c in schema.carichi:
            if c.tipo != "forza" or c.nodo is None:
                continue
            P = sc.px(*schema.nodi[c.nodo])
            mie = [e for e in frecce if any(math.hypot(q[0] - P[0], q[1] - P[1]) < 1e-6 for q in e.punti)]
            assert mie, seme
            altro = [q for q in mie[0].punti if math.hypot(q[0] - P[0], q[1] - P[1]) > 1e-6][0]
            occupa = math.atan2(altro[1] - P[1], altro[0] - P[0])
            for i, j in schema.aste:
                if c.nodo not in (i, j):
                    continue
                Q = sc.px(*schema.nodi[j if i == c.nodo else i])
                asta = math.atan2(Q[1] - P[1], Q[0] - P[0])
                diff = abs((occupa - asta + math.pi) % (2 * math.pi) - math.pi)
                assert diff > math.radians(30), (seme, schema.a_json())

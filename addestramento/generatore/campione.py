"""
CAMPIONE — uno schema casuale, disegnato, con le sue etichette.

Qui avviene l'UNICO passaggio dalle coordinate del generatore (pixel, y
verso il basso, come le immagini) a quelle del contratto TS di
`src/foto/tipi.ts` (y verso l'alto): si ribalta y e si cambia segno agli
angoli. Il `verso` dei momenti resta com'è: è quello visto sul foglio.
"""

from __future__ import annotations

import copy
from typing import Optional

import numpy as np

from .scena import costruisci_scena, primitive_della_scena
from .strutture import genera_schema, scegli


def a_contratto(prim: dict, altezza: float) -> dict:
    p = copy.deepcopy(prim)

    def ribalta(q: dict) -> None:
        q["y"] = altezza - q["y"]

    for s in p["aste"]:
        ribalta(s["a"])
        ribalta(s["b"])
    for c in p["pallini"]:
        ribalta(c["c"])
    for k in p["corpi"]:
        ribalta(k["attacco"])
        k["angolo"] = -k["angolo"]
    for f in p["frecce"]:
        ribalta(f["punta"])
        f["direzione"] = -f["direzione"]
    for m in p["momenti"]:
        ribalta(m["centro"])
    for q in p["nodi"]:
        ribalta(q)
    for s in p["scritte"]:
        ribalta(s["centro"])
        for e in s.get("estremi", []):
            ribalta(e)
    return p


def _con_rumore(prim: dict, rng: np.random.Generator, ampiezza: float) -> dict:
    """Errore di rilevazione: ogni punto spostato di ±ampiezza px."""
    p = copy.deepcopy(prim)

    def sposta(q: dict) -> None:
        q["x"] += float(rng.uniform(-ampiezza, ampiezza))
        q["y"] += float(rng.uniform(-ampiezza, ampiezza))

    for s in p["aste"]:
        sposta(s["a"])
        sposta(s["b"])
    for c in p["pallini"]:
        sposta(c["c"])
    for k in p["corpi"]:
        sposta(k["attacco"])
    for f in p["frecce"]:
        sposta(f["punta"])
    for m in p["momenti"]:
        sposta(m["centro"])
    for s in p["scritte"]:
        sposta(s["centro"])
        for e in s.get("estremi", []):
            sposta(e)
    return p


def genera(seme: int, solo_etichette: bool = True, rumore: float = 0.0, stile: Optional[str] = None) -> dict:
    if not solo_etichette:
        raise NotImplementedError("immagine e maschera arrivano con la rasterizzazione")
    rng = np.random.default_rng(seme)
    schema = genera_schema(rng)
    scala = float(rng.uniform(70, 130))
    stile_quote = scegli(rng, ("catena", "catena", "accanto"))
    sc = costruisci_scena(schema, rng, scala, stile_quote)
    prim = primitive_della_scena(sc)
    if rumore > 0:
        prim = _con_rumore(prim, rng, rumore)
    return {
        "primitive": a_contratto(prim, sc.altezza),
        "schema": schema.a_json(),
        "meta": {"seme": seme, "famiglia": schema.famiglia, "stile": stile or stile_quote,
                 "quote": stile_quote, "riquadro": list(sc.riquadro), "scala": scala},
    }

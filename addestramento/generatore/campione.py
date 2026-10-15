"""
CAMPIONE — uno schema casuale, disegnato, con le sue etichette.

Qui avviene l'UNICO passaggio dalle coordinate del generatore (pixel, y
verso il basso, come le immagini) a quelle del contratto TS di
`src/foto/tipi.ts` (y verso l'alto): si ribalta y e si cambia segno agli
angoli. Il `verso` dei momenti resta com'è: è quello visto sul foglio.
"""

from __future__ import annotations

import copy
from pathlib import Path
from typing import Optional

import numpy as np
from PIL import Image

from .effetti import applica, deformazione_casuale, fotometria, trasforma_primitive
from .pagina import componi_pagina
from .scena import MARGINE, costruisci_scena, primitive_della_scena
from .stili import scegli_stile
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


def _trasla(prim: dict, dx: float, dy: float) -> dict:
    p = copy.deepcopy(prim)

    def sposta(q: dict) -> None:
        q["x"] += dx
        q["y"] += dy

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
    for q in p["nodi"]:
        sposta(q)
    for s in p["scritte"]:
        sposta(s["centro"])
        for e in s.get("estremi", []):
            sposta(e)
    return p


def genera(seme: int, solo_etichette: bool = True, rumore: float = 0.0, stile: Optional[str] = None) -> dict:
    """
    Un campione. Con `solo_etichette` restano le primitive ideali della scena
    (per la campagna sulle regole); altrimenti l'intera foto: pagina, effetti,
    e le primitive portate nella foto con la stessa trasformazione.
    """
    rng = np.random.default_rng(seme)
    schema = genera_schema(rng)
    if solo_etichette:
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

    st = scegli_stile(rng, stile)
    stile_quote = scegli(rng, ("catena", "catena", "accanto"))
    # la figura occupa dal 35 al 65 % della larghezza di un foglio vero
    larghezza_l = max(x for x, _ in schema.nodi) - min(x for x, _ in schema.nodi) + 2 * MARGINE
    scala = float(np.clip(rng.uniform(0.35, 0.65) * rng.uniform(1100, 1600) / larghezza_l, 45, 190))
    sc = costruisci_scena(schema, rng, scala, stile_quote)
    pagina, maschera, info = componi_pagina(sc, st, rng)
    prim = primitive_della_scena(sc)
    for s in prim["aste"]:
        s["spessore"] = st.asta * scala  # lo spessore davvero disegnato
    prim = _trasla(prim, *info["spostamento"])
    prim["larghezza"], prim["altezza"] = pagina.size

    fattore = float(rng.uniform(0.55, 0.9))
    uscita = (int(pagina.width * fattore), int(pagina.height * fattore))
    d = deformazione_casuale(rng, pagina.width, pagina.height, uscita)
    foto, mfoto = applica(pagina, maschera, d, rng, scegli(rng, ("tovaglia", "scrivania", "scuro")))
    foto = fotometria(foto, rng)
    prim = trasforma_primitive(prim, d)
    if rumore > 0:
        prim = _con_rumore(prim, rng, rumore)
    x0, y0, x1, y1 = info["riquadro"]
    angoli = d.avanti(np.array([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], dtype=float))
    riquadro = [float(max(0.0, angoli[:, 0].min())), float(max(0.0, angoli[:, 1].min())),
                float(min(uscita[0], angoli[:, 0].max())), float(min(uscita[1], angoli[:, 1].max()))]
    return {
        "primitive": a_contratto(prim, uscita[1]),
        "schema": schema.a_json(),
        "meta": {"seme": seme, "famiglia": schema.famiglia, "stile": st.nome, "quote": stile_quote,
                 "riquadro": riquadro, "scala": scala},
        "immagine": foto,
        "maschera": mfoto,
    }


def scrivi(campione: dict, cartella: Path, nome: str, serializza) -> None:
    """`nome.json` (primitive, schema, meta); con l'immagine anche `nome.png` e `nome-maschera.png`."""
    cartella.mkdir(parents=True, exist_ok=True)
    dati = {k: v for k, v in campione.items() if k not in ("immagine", "maschera")}
    (cartella / f"{nome}.json").write_text(serializza(dati) + "\n", encoding="utf-8")
    if "immagine" in campione:
        campione["immagine"].save(cartella / f"{nome}.png", optimize=False)
        Image.fromarray(campione["maschera"]).save(cartella / f"{nome}-maschera.png", optimize=False)

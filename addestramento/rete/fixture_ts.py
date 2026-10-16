"""
FIXTURE PER LA DECODIFICA IN TYPESCRIPT (test/foto/campioni-rete).

    python -m rete.fixture_ts

  · `ideale-NNNNNNN.json`: le uscite che darebbe una rete perfetta, cioè i
    bersagli costruiti sull'immagine completata di bianco fino a multipli di
    32 (come la vede la rete): `seg` in RLE (classe, quanti, …) e `testa`
    sparsa ([canale, riga, colonna, valore] dove |valore| > 1e-3), con le
    primitive vere, lo schema e il riquadro della figura (px y giù);
  · `foto-NNNNNNN.pgm.gz` + `.json`: una foto sintetica intera per la prova
    con la rete vera.
"""

from __future__ import annotations

import gzip
import json
from pathlib import Path
from typing import List

import numpy as np

from generatore.__main__ import serializza
from generatore.campione import genera

from .bersagli import costruisci
from .grigi import pgm

CARTELLA = Path(__file__).resolve().parents[2] / "test" / "foto" / "campioni-rete"
RITAGLI = range(2_000_001, 2_000_011)
PAGINE = range(2_000_101, 2_000_104)
FOTO = 2_000_201
SOGLIA = 1e-3


def rle(a: np.ndarray) -> List[int]:
    piatto = a.ravel()
    cambi = np.flatnonzero(np.diff(piatto)) + 1
    inizi = np.concatenate([[0], cambi])
    lunghezze = np.diff(np.concatenate([inizi, [len(piatto)]]))
    return [int(v) for coppia in zip(piatto[inizi], lunghezze) for v in coppia]


def da_rle(voci: List[int], forma) -> np.ndarray:
    valori, quanti = voci[0::2], voci[1::2]
    return np.repeat(np.array(valori, dtype=np.int64), quanti).reshape(forma)


def sparsa(m: np.ndarray) -> List[list]:
    k, i, j = np.nonzero(np.abs(m) > SOGLIA)
    return [[int(a), int(b), int(c), round(float(m[a, b, c]), 4)] for a, b, c in zip(k, i, j)]


def da_sparsa(voci: List[list], forma) -> np.ndarray:
    m = np.zeros(forma, dtype=np.float32)
    for k, i, j, v in voci:
        m[k, i, j] = v
    return m


def ideale(c: dict) -> dict:
    altezza, larghezza = c["maschera"].shape
    H, W = -(-altezza // 32) * 32, -(-larghezza // 32) * 32
    m = np.zeros((H, W), dtype=np.uint8)
    m[:altezza, :larghezza] = c["maschera"]
    # le primitive sono y su rispetto all'immagine vera: il riempimento sta in basso
    b = costruisci(m, c["primitive"], altezza)
    return {"larghezza": larghezza, "altezza": altezza, "H": H, "W": W,
            "seg": {"forma": list(b["seg"].shape), "rle": rle(b["seg"])},
            "testa": {"forma": list(b["mappe"].shape), "voci": sparsa(b["mappe"])},
            "primitive": c["primitive"], "schema": c["schema"], "riquadro": c["meta"]["riquadro"]}


def main() -> None:
    CARTELLA.mkdir(parents=True, exist_ok=True)
    for semi, modo in ((RITAGLI, "ritaglio"), (PAGINE, "pagina")):
        for seme in semi:
            f = ideale(genera(seme, solo_etichette=False, modo=modo, rari=True))
            (CARTELLA / f"ideale-{seme:07d}.json").write_text(serializza(f) + "\n", encoding="utf-8")
    c = genera(FOTO, solo_etichette=False, modo="foto", rari=True)
    with gzip.open(CARTELLA / f"foto-{FOTO:07d}.pgm.gz", "wb", compresslevel=9) as g:
        g.write(pgm(c["immagine"]))
    dati = {"primitive": c["primitive"], "schema": c["schema"], "riquadro": c["meta"]["riquadro"]}
    (CARTELLA / f"foto-{FOTO:07d}.json").write_text(serializza(dati) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()

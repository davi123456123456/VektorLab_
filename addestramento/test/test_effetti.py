from __future__ import annotations

import copy
import math

import numpy as np
import pytest

from generatore.effetti import applica, deformazione_casuale, fotometria, trasforma_primitive
from generatore.pagina import componi_pagina
from generatore.scena import ASTA, SIMBOLO, costruisci_scena, primitive_della_scena
from generatore.stili import scegli_stile
from generatore.strutture import genera_schema


def pagina_con_primitive(seme):
    rng = np.random.default_rng(seme)
    sc = costruisci_scena(genera_schema(rng), rng, float(rng.uniform(80, 130)), "catena")
    img, m, info = componi_pagina(sc, scegli_stile(rng), rng)
    p = copy.deepcopy(primitive_della_scena(sc))
    dx, dy = info["spostamento"]
    for s in p["aste"]:
        for q in (s["a"], s["b"]):
            q["x"] += dx
            q["y"] += dy
    for c in p["pallini"]:
        c["c"]["x"] += dx
        c["c"]["y"] += dy
    p["larghezza"], p["altezza"] = img.size
    return rng, img, m, p


def test_avanti_e_indietro_si_annullano():
    rng = np.random.default_rng(3)
    d = deformazione_casuale(rng, 1200, 1700, (1100, 1500))
    punti = np.column_stack([rng.uniform(0, 1200, 200), rng.uniform(0, 1700, 200)])
    assert np.abs(d.indietro(d.avanti(punti)) - punti).max() < 0.5


@pytest.mark.parametrize("seme", range(20))
def test_le_etichette_seguono_i_pixel(seme):
    rng, img, m, p = pagina_con_primitive(seme)
    d = deformazione_casuale(rng, img.width, img.height, (img.width, img.height))
    img2, m2 = applica(img, m, d, rng, "tovaglia")
    p2 = trasforma_primitive(p, d)
    assert (p2["larghezza"], p2["altezza"]) == img2.size
    ys, xs = np.mgrid[0:m2.shape[0], 0:m2.shape[1]]

    def vicino(x, y, raggio, classe):
        x0, x1 = int(max(0, x - raggio - 2)), int(min(m2.shape[1], x + raggio + 3))
        y0, y1 = int(max(0, y - raggio - 2)), int(min(m2.shape[0], y + raggio + 3))
        finestra = m2[y0:y1, x0:x1]
        dist = np.hypot(xs[y0:y1, x0:x1] - x, ys[y0:y1, x0:x1] - y)
        return (finestra[dist <= raggio + 2] == classe).any()

    for c in p2["pallini"]:
        assert vicino(c["c"]["x"], c["c"]["y"], c["r"], SIMBOLO)
    centri = [((s["a"]["x"] + s["b"]["x"]) / 2, (s["a"]["y"] + s["b"]["y"]) / 2) for s in p2["aste"]]
    giusti = sum(vicino(x, y, 2, ASTA) for x, y in centri)
    assert giusti >= 0.95 * len(centri)


def test_fotometria_non_cambia_le_dimensioni():
    rng, img, _, _ = pagina_con_primitive(1)
    assert fotometria(img, rng).size == img.size


def test_stesso_seme_stessi_byte():
    def una():
        rng, img, m, _ = pagina_con_primitive(7)
        d = deformazione_casuale(rng, img.width, img.height, (900, 1300))
        a, ma = applica(img, m, d, rng, "scrivania")
        return fotometria(a, rng).tobytes(), ma.tobytes()
    assert una() == una()

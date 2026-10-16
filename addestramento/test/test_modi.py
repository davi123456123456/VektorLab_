from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
import pytest

from generatore.campione import genera
from generatore.scena import ASTA, CARICO, SIMBOLO

CAMPIONI = Path(__file__).resolve().parents[2] / "test" / "foto" / "campioni"


def allineate(c):
    m = c["maschera"]
    H, W = m.shape
    ys, xs = np.mgrid[0:H, 0:W]

    def vicino(x, y, raggio, classe):
        x0, x1 = int(max(0, x - raggio - 2)), int(min(W, x + raggio + 3))
        y0, y1 = int(max(0, y - raggio - 2)), int(min(H, y + raggio + 3))
        dist = np.hypot(xs[y0:y1, x0:x1] - x, ys[y0:y1, x0:x1] - y)
        return (m[y0:y1, x0:x1][dist <= raggio + 2] == classe).any()

    p = c["primitive"]
    pallini = [vicino(q["c"]["x"], H - q["c"]["y"], q["r"], SIMBOLO) for q in p["pallini"]]
    aste = [vicino((s["a"]["x"] + s["b"]["x"]) / 2, H - (s["a"]["y"] + s["b"]["y"]) / 2, 2, ASTA)
            for s in p["aste"]]
    return pallini + aste


@pytest.mark.parametrize("seme", range(6))
def test_ritaglio_a_768_attorno_alla_figura(seme):
    c = genera(seme, solo_etichette=False, modo="ritaglio")
    img = c["immagine"]
    assert max(img.size) == 768
    assert c["maschera"].shape == (img.height, img.width)
    assert (c["primitive"]["larghezza"], c["primitive"]["altezza"]) == img.size
    x0, y0, x1, y1 = c["meta"]["riquadro"]
    assert 0 <= x0 < x1 <= img.width and 0 <= y0 < y1 <= img.height
    assert 400 <= max(x1 - x0, y1 - y0) <= 768
    esiti = allineate(c)
    assert sum(esiti) >= 0.95 * len(esiti)


@pytest.mark.parametrize("seme", range(3))
def test_pagina_ridotta_a_768(seme):
    c = genera(seme, solo_etichette=False, modo="pagina")
    assert max(c["immagine"].size) == 768
    assert c["maschera"].shape == (c["immagine"].height, c["immagine"].width)


def test_il_percorso_solo_etichette_non_cambia():
    from generatore.__main__ import serializza
    atteso = json.loads((CAMPIONI / "00005.json").read_text())
    assert json.loads(serializza(genera(5))) == atteso


def verso_dalla_punta(m):
    """Contratto, y su: la punta gira attorno al centro in senso antiorario se (punta − centro) × direzione > 0."""
    f = m["freccia"]
    rx, ry = f["punta"]["x"] - m["centro"]["x"], f["punta"]["y"] - m["centro"]["y"]
    croce = rx * math.sin(f["direzione"]) - ry * math.cos(f["direzione"])
    return "antiorario" if croce > 0 else "orario"


def test_la_punta_dei_momenti_da_il_verso():
    visti = 0
    for seme in range(1, 40):
        c = genera(seme, solo_etichette=False, modo="ritaglio")
        m_img, H = c["maschera"], c["immagine"].height
        for m in c["primitive"]["momenti"]:
            assert verso_dalla_punta(m) == m["verso"]
            x, y = m["freccia"]["punta"]["x"], H - m["freccia"]["punta"]["y"]
            finestra = m_img[int(y) - 3:int(y) + 4, int(x) - 3:int(x) + 4]
            assert (finestra == CARICO).any()
            visti += 1
    assert visti >= 5


def test_solo_etichette_senza_punte_dei_momenti():
    for seme in range(1, 30):
        assert all("freccia" not in m for m in genera(seme)["primitive"]["momenti"])

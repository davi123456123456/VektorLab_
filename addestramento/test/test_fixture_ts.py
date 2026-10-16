from __future__ import annotations

import gzip
import json

import numpy as np
from PIL import Image

from generatore.campione import genera
from rete import fixture_ts
from rete.bersagli import costruisci
from rete.grigi import pgm


def test_rle_e_sparse_tornano_indietro():
    c = genera(2_000_001, solo_etichette=False, modo="ritaglio", rari=True)
    f = fixture_ts.ideale(c)
    H, W = f["H"], f["W"]
    assert H % 32 == 0 and W % 32 == 0 and H >= f["altezza"] and W >= f["larghezza"]
    m = np.zeros((H, W), dtype=np.uint8)
    m[: f["altezza"], : f["larghezza"]] = c["maschera"]
    b = costruisci(m, c["primitive"], f["altezza"])
    seg = fixture_ts.da_rle(f["seg"]["rle"], f["seg"]["forma"])
    testa = fixture_ts.da_sparsa(f["testa"]["voci"], f["testa"]["forma"])
    assert np.array_equal(seg, b["seg"])
    assert np.abs(testa - b["mappe"]).max() <= 1e-3


def test_pgm():
    a = np.array([[0, 10, 20, 30, 40], [50, 60, 70, 80, 90], [255, 254, 1, 2, 3]], dtype=np.uint8)
    img = Image.fromarray(np.stack([a, a, a], axis=-1))
    dati = pgm(img)
    assert dati.startswith(b"P5\n5 3\n255\n")
    assert dati[len(b"P5\n5 3\n255\n"):] == np.asarray(img.convert("L")).tobytes()


def test_fixture_scritte():
    cartella = fixture_ts.CARTELLA
    ideali = sorted(cartella.glob("ideale-*.json"))
    assert len(ideali) == 13
    for f in ideali:
        assert f.stat().st_size <= 400 * 1024, f
        d = json.loads(f.read_text())
        p = d["primitive"]
        assert p["aste"] and p["corpi"] and p["scritte"], f
        assert len(d["riquadro"]) == 4
    assert (cartella / "foto-2000201.json").exists()
    with gzip.open(cartella / "foto-2000201.pgm.gz") as g:
        assert g.read(3) == b"P5\n"

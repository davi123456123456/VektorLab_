from __future__ import annotations

import json

import numpy as np
import pytest
from PIL import Image

from generatore import dataset
from rete import vocabolario as V
from rete.bersagli import costruisci
from rete.dati import Campioni, trasla_primitive


@pytest.fixture(scope="module")
def dati(tmp_path_factory):
    uscita = tmp_path_factory.mktemp("dati")
    dataset.main(["--uscita", str(uscita), "--ritagli", "4", "--pagine", "2",
                  "--val-ritagli", "1", "--val-pagine", "1", "--processi", "2"])
    return uscita


def test_file_e_indice(dati):
    for parte, modo, n, primo in (("addestramento", "ritagli", 4, 1), ("addestramento", "pagine", 2, 5),
                                  ("validazione", "ritagli", 1, 1_000_001), ("validazione", "pagine", 1, 1_000_002)):
        cartella = dati / parte / modo
        indice = json.loads((cartella / "indice.json").read_text())
        assert [c["seme"] for c in indice["campioni"]] == list(range(primo, primo + n))
        for c in indice["campioni"]:
            img = Image.open(cartella / f"{c['nome']}.png")
            assert img.mode == "L" and max(img.size) == 768
            m = np.array(Image.open(cartella / f"{c['nome']}-maschera.png"))
            assert m.shape == (img.height, img.width) and m.max() <= 6
            j = json.loads((cartella / f"{c['nome']}.json").read_text())
            assert j["primitive"]["altezza"] == img.height and j["meta"]["seme"] == c["seme"]


def test_la_ripresa_non_riscrive(dati):
    prima = {p: p.stat().st_mtime_ns for p in dati.rglob("*.png")}
    dataset.main(["--uscita", str(dati), "--ritagli", "4", "--pagine", "2",
                  "--val-ritagli", "1", "--val-pagine", "1", "--processi", "1"])
    assert {p: p.stat().st_mtime_ns for p in dati.rglob("*.png")} == prima


def test_forme_dei_tensori(dati):
    ds = Campioni([dati / "addestramento" / "ritagli", dati / "addestramento" / "pagine"], lato=256)
    assert len(ds) == 6
    for k in range(len(ds)):
        x, b = ds[k]
        assert tuple(x.shape) == (1, 256, 256) and 0 <= float(x.min()) and float(x.max()) <= 1
        assert tuple(b["seg"].shape) == (128, 128)
        assert tuple(b["mappe"].shape) == (V.CANALI, 64, 64) == tuple(b["pesi_reg"].shape)


def test_ritaglio_centrato_come_a_mano(dati):
    cartella = dati / "addestramento" / "ritagli"
    ds = Campioni([cartella], lato=512, casuale=False)
    x, b = ds[0]
    nome = json.loads((cartella / "indice.json").read_text())["campioni"][0]["nome"]
    img = np.array(Image.open(cartella / f"{nome}.png"), dtype=np.float32) / 255
    m = np.array(Image.open(cartella / f"{nome}-maschera.png"))
    prim = json.loads((cartella / f"{nome}.json").read_text())["primitive"]
    H, W = m.shape
    ox, oy = (W - 512) // 2, (H - 512) // 2
    pezzo = np.ones((512, 512), dtype=np.float32)
    mpezzo = np.zeros((512, 512), dtype=np.uint8)
    # il ritaglio può sporgere: si riempie di bianco e di sfondo
    sx0, sy0 = max(0, ox), max(0, oy)
    sx1, sy1 = min(W, ox + 512), min(H, oy + 512)
    pezzo[sy0 - oy:sy1 - oy, sx0 - ox:sx1 - ox] = img[sy0:sy1, sx0:sx1]
    mpezzo[sy0 - oy:sy1 - oy, sx0 - ox:sx1 - ox] = m[sy0:sy1, sx0:sx1]
    atteso = costruisci(mpezzo, trasla_primitive(prim, ox, oy, 512), 512)
    assert np.allclose(x.numpy()[0], pezzo)
    assert np.array_equal(b["seg"].numpy(), atteso["seg"])
    assert np.allclose(b["mappe"].numpy(), atteso["mappe"])
    assert np.array_equal(b["pesi_reg"].numpy(), atteso["pesi_reg"])
    assert atteso["mappe"][V.MAPPE].max() == 1.0  # c'è almeno un oggetto nel pezzo


def test_trasla_primitive():
    p = {"larghezza": 100, "altezza": 80, "aste": [{"a": {"x": 10, "y": 70}, "b": {"x": 50, "y": 70}}],
         "pallini": [], "corpi": [], "frecce": [], "momenti": [], "nodi": [],
         "scritte": [{"centro": {"x": 30, "y": 60}, "estremi": [{"x": 10, "y": 65}, {"x": 50, "y": 65}]}]}
    q = trasla_primitive(p, 5, 8, 40)
    # y su: 70 nell'immagine alta 80 è 10 px dall'alto; nel pezzo (spostato di 8, alto 40) è a 2 px dall'alto
    assert q["aste"][0]["a"] == {"x": 5, "y": 38}
    assert q["scritte"][0]["estremi"][1] == {"x": 45, "y": 33}
    assert (q["larghezza"], q["altezza"]) == (40, 40)
    assert p["aste"][0]["a"] == {"x": 10, "y": 70}  # l'originale non cambia

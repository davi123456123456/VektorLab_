from __future__ import annotations

import json
import math

import numpy as np
from PIL import Image

from generatore.__main__ import main
from generatore.campione import genera
from generatore.scena import ASTA


def test_la_riga_di_comando_scrive_tre_file_per_campione(tmp_path):
    main(["--n", "3", "--seme", "5", "--uscita", str(tmp_path)])
    for seme in (5, 6, 7):
        nome = f"{seme:05d}"
        for coda in (".json", ".png", "-maschera.png"):
            assert (tmp_path / f"{nome}{coda}").stat().st_size > 0
        dati = json.loads((tmp_path / f"{nome}.json").read_text())
        img = Image.open(tmp_path / f"{nome}.png")
        x0, y0, x1, y1 = dati["meta"]["riquadro"]
        assert 0 <= x0 < x1 <= img.width and 0 <= y0 < y1 <= img.height
        assert (dati["primitive"]["larghezza"], dati["primitive"]["altezza"]) == img.size


def test_stesso_seme_file_identici(tmp_path):
    a, b = tmp_path / "a", tmp_path / "b"
    main(["--n", "2", "--seme", "11", "--uscita", str(a)])
    main(["--n", "2", "--seme", "11", "--uscita", str(b)])
    for f in sorted(a.iterdir()):
        assert f.read_bytes() == (b / f.name).read_bytes(), f.name


def test_la_galleria_si_scrive(tmp_path):
    main(["--n", "2", "--seme", "1", "--uscita", str(tmp_path), "--galleria"])
    assert (tmp_path / "galleria.png").stat().st_size > 0


def test_lo_spessore_delle_aste_e_quello_disegnato():
    giusti = totali = 0
    for seme in range(4):
        c = genera(seme, solo_etichette=False)
        m = c["maschera"]
        H = m.shape[0]
        for s in c["primitive"]["aste"]:
            ax, ay = s["a"]["x"], H - s["a"]["y"]
            bx, by = s["b"]["x"], H - s["b"]["y"]
            l = math.hypot(bx - ax, by - ay)
            if l < 60:
                continue
            nx, ny = -(by - ay) / l, (bx - ax) / l
            mx, my = (ax + bx) / 2, (ay + by) / 2
            profilo = [m[int(round(my + k * ny)), int(round(mx + k * nx))] == ASTA
                       for k in np.arange(-12, 12.5, 0.5)
                       if 0 <= int(round(my + k * ny)) < H and 0 <= int(round(mx + k * nx)) < m.shape[1]]
            larghezza = sum(profilo) * 0.5
            totali += 1
            giusti += abs(larghezza - s["spessore"]) <= 2.5
    assert totali > 5 and giusti >= 0.8 * totali

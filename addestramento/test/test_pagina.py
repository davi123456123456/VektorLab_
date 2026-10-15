from __future__ import annotations

import numpy as np
import pytest

from generatore.pagina import componi_pagina
from generatore.scena import ALTRO, ASTA, TESTO, costruisci_scena, primitive_della_scena
from generatore.stili import scegli_stile
from generatore.strutture import genera_schema


def pagina(seme, **opzioni):
    rng = np.random.default_rng(seme)
    sc = costruisci_scena(genera_schema(rng), rng, float(rng.uniform(70, 130)), "catena")
    stile = scegli_stile(rng)
    img, m, info = componi_pagina(sc, stile, rng, **opzioni)
    return sc, img, m, info


def fuori_dal_riquadro(m, riquadro):
    x0, y0, x1, y1 = (int(round(v)) for v in riquadro)
    dentro = np.zeros(m.shape, dtype=bool)
    dentro[max(0, y0):y1, max(0, x0):x1] = True
    return ~dentro


@pytest.mark.parametrize("seme", range(12))
def test_primitive_dentro_il_riquadro_e_niente_aste_fuori(seme):
    sc, img, m, info = pagina(seme)
    assert img.size == (m.shape[1], m.shape[0])
    dx, dy = info["spostamento"]
    x0, y0, x1, y1 = info["riquadro"]
    p = primitive_della_scena(sc)
    punti = [q for s in p["aste"] for q in (s["a"], s["b"])] + [c["c"] for c in p["pallini"]] \
        + [k["attacco"] for k in p["corpi"]] + [f["punta"] for f in p["frecce"]]
    for q in punti:
        assert x0 <= q["x"] + dx <= x1 and y0 <= q["y"] + dy <= y1
    assert not (m[fuori_dal_riquadro(m, info["riquadro"])] == ASTA).any()


def test_c_e_testo_fuori_dal_riquadro():
    _, _, m, info = pagina(3)
    assert (m[fuori_dal_riquadro(m, info["riquadro"])] == TESTO).any()


def test_la_sezione_e_altro_disegno():
    _, _, m, info = pagina(4, sezione=True)
    assert info["sezione"]
    assert (m[fuori_dal_riquadro(m, info["riquadro"])] == ALTRO).any()


def test_gli_appunti_non_cancellano_le_aste():
    sc, _, m_con, _ = pagina(8, appunti=True)
    sc2, _, m_senza, _ = pagina(8, appunti=False)
    # le aste della figura restano tutte: gli appunti si posano solo sullo sfondo
    assert (m_con == ASTA).sum() == (m_senza == ASTA).sum()


def test_stesso_seme_stessi_byte():
    _, a, ma, _ = pagina(9)
    _, b, mb, _ = pagina(9)
    assert a.tobytes() == b.tobytes() and ma.tobytes() == mb.tobytes()


@pytest.mark.parametrize("seme", [7736, 48308])
def test_figura_piu_alta_del_resto_della_pagina(seme):
    # figura alta e stretta alla scala massima, con un'intestazione lunga:
    # la pagina si allunga invece di tagliarla
    from generatore.campione import genera
    c = genera(seme, solo_etichette=False)
    assert c["maschera"].shape[::-1] == c["immagine"].size

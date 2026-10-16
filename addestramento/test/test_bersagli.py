from __future__ import annotations

import math

import numpy as np
import pytest

from generatore.campione import genera
from rete import vocabolario as V
from rete.bersagli import centro_cella, costruisci, estrai_picchi


def test_vocabolario():
    assert V.CANALI == 43 and V.CLASSI == 7
    assert len(V.TIPI_CORPO) == 8 and len(V.SCRITTE) == 20
    assert V.SCRITTA0 + len(V.SCRITTE) == V.QUOTA0 and V.QUOTA0 + 4 == V.CANALI
    assert set(V.MAPPE).isdisjoint(V.REGRESSIONI)
    assert sorted(V.MAPPE + V.REGRESSIONI) == list(range(V.CANALI))
    d = V.descrizione()
    assert len(d["canali"]) == V.CANALI and d["passi"] == {"seg": 2, "testa": 4}


def test_semipiano():
    # 0°, 45°, 90°, 135° (e i loro opposti) cadono lontano dal confine
    for gradi in (0, 45, 90, 135, 180, 225, 270, 315):
        a = V.semipiano(math.radians(gradi))
        b = V.semipiano(math.radians(gradi + 180))
        assert abs(a - b) < 1e-9
        assert -7 * math.pi / 8 + 0.3 < a < math.pi / 8 - 0.3


def giu(q, altezza):
    return q["x"], altezza - q["y"]


def vicino(picchi, x, y, tolleranza):
    """Il picco più vicino a (x, y) in px d'ingresso, se entro la tolleranza."""
    migliore = None
    for i, j, v in picchi:
        cx, cy = centro_cella(i, j)
        d = math.hypot(cx - x, cy - y)
        if d <= tolleranza and (migliore is None or d < migliore[0]):
            migliore = (d, i, j)
    return migliore


def angolo_da(m, ci, si, i, j):
    return math.atan2(m[si, i, j], m[ci, i, j])


def differenza_angolo(a, b):
    return abs((a - b + math.pi) % (2 * math.pi) - math.pi)


@pytest.fixture(scope="module")
def campioni():
    out = []
    for seme in range(1, 6):
        c = genera(seme, solo_etichette=False, modo="ritaglio", rari=True)
        out.append((c, costruisci(c["maschera"], c["primitive"], c["immagine"].height)))
    return out


def test_forme(campioni):
    for c, b in campioni:
        H, W = c["maschera"].shape
        assert b["seg"].shape == ((H + 1) // 2, (W + 1) // 2) and b["seg"].dtype == np.int64
        assert b["mappe"].shape == (V.CANALI, (H + 3) // 4, (W + 3) // 4) and b["mappe"].dtype == np.float32
        assert b["pesi_reg"].shape == b["mappe"].shape
        assert not b["pesi_reg"][V.MAPPE].any()


def test_andata_e_ritorno(campioni):
    contati = {"pallini": 0, "corpi": 0, "frecce": 0, "momenti": 0, "scritte": 0, "quote": 0}
    for c, b in campioni:
        m, p, H = b["mappe"], c["primitive"], c["immagine"].height
        picchi = {k: estrai_picchi(m[k]) for k in V.MAPPE}

        for q in p["pallini"]:
            t = vicino(picchi[V.PALLINO], *giu(q["c"], H), 4)
            assert t, q
            assert abs(m[V.RAGGIO, t[1], t[2]] * V.SCALA_RAGGIO - q["r"]) < 0.5
            contati["pallini"] += 1

        for k in p["corpi"]:
            canale = V.CORPO0 + V.TIPI_CORPO.index(k["tipo"])
            t = vicino(picchi[canale], *giu(k["attacco"], H), 4)
            assert t, k
            atteso = V.semipiano(k["angolo"]) if k["tipo"] in V.INTERNI else k["angolo"]
            letto = angolo_da(m, V.COS_CORPO, V.SIN_CORPO, t[1], t[2])
            assert math.degrees(differenza_angolo(letto, atteso)) < 2
            contati["corpi"] += 1

        for f in p["frecce"]:
            t = vicino(picchi[V.FRECCIA], *giu(f["punta"], H), 4)
            assert t, f
            letto = angolo_da(m, V.COS_FRECCIA, V.SIN_FRECCIA, t[1], t[2])
            assert math.degrees(differenza_angolo(letto, f["direzione"])) < 2
            assert abs(m[V.LUNG_FRECCIA, t[1], t[2]] * V.SCALA_LUNGHEZZA - f["lunghezza"]) < 2
            contati["frecce"] += 1

        for a in p["momenti"]:
            canale = V.MOMENTO0 + (0 if a["verso"] == "antiorario" else 1)
            assert vicino(picchi[canale], *giu(a["centro"], H), 4), a
            contati["momenti"] += 1

        for s in p["scritte"]:
            k = V.indice_scritta(s["valore"])
            if k is None:
                continue
            cx, cy = giu(s["centro"], H)
            t = vicino(picchi[V.SCRITTA0 + k], cx, cy, 4)
            assert t, s
            contati["scritte"] += 1
            if "estremi" in s:
                e1, e2 = V.estremi_canonici(s["centro"], s["estremi"])
                d = m[V.QUOTA0:V.QUOTA0 + 4, t[1], t[2]] * V.SCALA_QUOTA
                letti = [(s["centro"]["x"] + d[0], s["centro"]["y"] + d[1]),
                         (s["centro"]["x"] + d[2], s["centro"]["y"] + d[3])]
                for (lx, ly), e in zip(letti, (e1, e2)):
                    assert math.hypot(lx - e["x"], ly - e["y"]) < 4
                contati["quote"] += 1

        nodi = picchi[V.NODO]
        for s in p["aste"]:
            for e in (s["a"], s["b"]):
                assert vicino(nodi, *giu(e, H), 8), e
    # il test non è vacuo: ogni famiglia di primitive compare
    assert all(n > 0 for n in contati.values()), contati


def test_tipi_di_corpo_nei_campioni_rari():
    visti = set()
    for seme in range(1, 60):
        visti |= {k["tipo"] for k in genera(seme, rari=True)["primitive"]["corpi"]}
    assert visti == set(V.TIPI_CORPO)


def test_una_linea_sottile_resta_asta():
    m = np.zeros((16, 16), dtype=np.uint8)
    m[5, :] = 1        # linea orizzontale larga 1 px su una riga dispari
    m[:, 9] = 1        # e una verticale su una colonna dispari
    m[12, 12] = 5      # un pixel di testo
    m[12:14, 13] = 3   # carico accanto al testo
    vuoto = {"aste": [], "pallini": [], "corpi": [], "frecce": [], "momenti": [], "nodi": [], "scritte": [],
             "larghezza": 16, "altezza": 16}
    seg = costruisci(m, vuoto, 16)["seg"]
    assert (seg[2, :] == 1).all() and (seg[:, 4] == 1).all()
    assert seg[6, 6] == 5   # testo vince sul carico nello stesso blocco 2×2


def test_estrai_picchi():
    a = np.zeros((10, 10), dtype=np.float32)
    a[2, 3] = 0.9
    a[2, 4] = 0.5   # vicino più basso: non è un picco
    a[7, 7] = 0.2   # sotto soglia
    a[6, 1] = 0.4
    assert sorted(estrai_picchi(a)) == [(2, 3, pytest.approx(0.9)), (6, 1, pytest.approx(0.4))]


def test_le_punte_dei_momenti_sono_frecce(campioni):
    visti = 0
    for c, b in campioni:
        m, H = b["mappe"], c["immagine"].height
        picchi = estrai_picchi(m[V.FRECCIA])
        for a in c["primitive"]["momenti"]:
            f = a["freccia"]
            t = vicino(picchi, *giu(f["punta"], H), 4)
            assert t, a
            letto = angolo_da(m, V.COS_FRECCIA, V.SIN_FRECCIA, t[1], t[2])
            assert math.degrees(differenza_angolo(letto, f["direzione"])) < 2
            visti += 1
    assert visti > 0


def test_confini_delle_celle():
    # la cella k a passo 4 copre i pixel 4k … 4k+3 (centri dei pixel sugli interi)
    from rete.bersagli import _in_cella
    assert [_in_cella(x, 0)[1] for x in range(12)] == [0] * 4 + [1] * 4 + [2] * 4
    assert centro_cella(0, 0) == (1.5, 1.5) and centro_cella(2, 3) == (13.5, 9.5)
    assert _in_cella(13.5, 9.5) == (2, 3)


def test_descrizione_dei_momenti_per_la_decodifica():
    d = V.descrizione()
    m = d["momenti"]
    assert set(m) >= {"centri", "punta", "raggio", "verso"}
    assert "16" in m["centri"] and "17" in m["centri"]
    assert "601" in d["ingresso"]["grigio"] and "32" in d["ingresso"]["riempimento"]

from __future__ import annotations

import math

import numpy as np

from generatore.raster import rasterizza
from generatore.scena import ASTA, CARICO, SIMBOLO, TESTO, costruisci_scena
from generatore.schema import Carico, Schema, Sconnessione, Vincolo
from generatore.stili import scegli_stile

SCALA = 100.0


def schema_prova():
    return Schema("trave", [(0, 0), (1, 0), (3, 0)], [(0, 1), (1, 2)],
                  [Vincolo("incastro", 270, nodo=0), Vincolo("carrello", 0, asta=1, s=0.5),
                   Vincolo("carrello", 0, nodo=2)],
                  [Sconnessione(1, "cerniera", None)],
                  [Carico("distribuito", 2, direzione=-90, asta=1, s1=0, s2=1)])


def disegna(nome_stile="stampato", seme=0, senza_font=False):
    rng = np.random.default_rng(seme)
    sc = costruisci_scena(schema_prova(), rng, SCALA, "catena")
    stile = scegli_stile(rng, nome_stile)
    if senza_font:
        stile.font_testo = []
        stile.font_mano = []
    img, maschera = rasterizza(sc, stile, rng)
    return sc, img, maschera


def test_dimensioni_e_classi():
    sc, img, m = disegna()
    assert img.size == (sc.larghezza, sc.altezza)
    assert m.shape == (sc.altezza, sc.larghezza) and m.dtype == np.uint8
    assert {ASTA, CARICO, SIMBOLO, TESTO} <= set(np.unique(m).tolist())


def test_le_aste_stanno_dove_dicono_le_primitive():
    sc, _, m = disegna()
    simboli = [e.punti[0] for e in sc.elementi if e.classe == SIMBOLO]
    for e in sc.elementi:
        if e.forma != "linea" or e.spessore != "asta":
            continue
        (ax, ay), (bx, by) = e.punti
        for t in np.linspace(0.2, 0.8, 7):
            x, y = ax + t * (bx - ax), ay + t * (by - ay)
            if min(math.hypot(x - sx, y - sy) for sx, sy in simboli) < 0.3 * SCALA:
                continue
            assert m[int(round(y)), int(round(x))] == ASTA


def test_ogni_pallino_ha_il_suo_contorno():
    sc, _, m = disegna()
    for e in sc.elementi:
        if e.forma != "cerchio":
            continue
        (cx, cy), r = e.punti[0], e.raggio
        ys, xs = np.mgrid[0:m.shape[0], 0:m.shape[1]]
        anello = np.abs(np.hypot(xs - cx, ys - cy) - r) < 1.6
        assert (m[anello] == SIMBOLO).any()


def test_mano_diversa_da_stampato():
    _, a, _ = disegna("stampato", 3)
    _, b, _ = disegna("mano", 3)
    assert a.tobytes() != b.tobytes()


def test_senza_font_disegna_comunque_il_testo():
    _, _, m = disegna(senza_font=True)
    assert (m == TESTO).any()


def test_stesso_seme_stessi_byte():
    _, a, ma = disegna("quadretti", 5)
    _, b, mb = disegna("quadretti", 5)
    assert a.tobytes() == b.tobytes() and ma.tobytes() == mb.tobytes()


def test_il_tremolio_e_liscio_anche_sugli_archi():
    from generatore.raster import _Tela
    from generatore.scena import Scena
    rng = np.random.default_rng(1)
    t = _Tela(Scena([], 200, 200, SCALA, (0, 0, 200, 200)), scegli_stile(rng, "mano"), rng)
    r = 0.25 * SCALA
    arco = [(100 + r * math.cos(a), 100 + r * math.sin(a)) for a in np.linspace(0, 1.5 * math.pi, 36)]
    scarti = [math.hypot(x - 100, y - 100) - r for x, y in t.trema(arco)[1:-1]]
    cambi = sum(1 for a, b in zip(scarti, scarti[1:]) if a * b < 0)
    assert cambi <= 4


def test_le_scritte_nella_maschera_sono_solo_testo():
    from generatore.scena import Elemento, Scena
    sc = Scena([Elemento(TESTO, "testo", [(100, 50)], testo="3L/2 q M")], 200, 100, SCALA, (0, 0, 200, 100))
    rng = np.random.default_rng(0)
    _, m = rasterizza(sc, scegli_stile(rng, "stampato"), rng)
    assert set(np.unique(m).tolist()) == {0, TESTO}

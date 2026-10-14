from __future__ import annotations

import math
from collections import Counter

import numpy as np
import pytest

from generatore.schema import valida
from generatore.strutture import FAMIGLIE, genera_schema

GRADI_VINCOLO = {"incastro": 3, "cerniera": 2, "bipendolo": 2, "pattino": 2, "carrello": 1, "biella": 1}


def schemi(famiglia, n=300):
    return [genera_schema(np.random.default_rng(seme), famiglia) for seme in range(n)]


def allineate(s, k1, k2, nodo):
    """Le due aste escono dal nodo in direzioni opposte."""
    def verso(k):
        i, j = s.aste[k]
        altro = j if i == nodo else i
        (x0, y0), (x1, y1) = s.nodi[nodo], s.nodi[altro]
        return math.atan2(y1 - y0, x1 - x0)
    d = abs(verso(k1) - verso(k2)) % (2 * math.pi)
    return abs(d - math.pi) < 1e-9


@pytest.mark.parametrize("famiglia", FAMIGLIE)
def test_invarianti(famiglia):
    for s in schemi(famiglia):
        assert valida(s) == [], (famiglia, valida(s))
        # nodi sulla griglia L/2 e distinti
        for x, y in s.nodi:
            assert abs(x * 2 - round(x * 2)) < 1e-9 and abs(y * 2 - round(y * 2)) < 1e-9
        assert len(set(s.nodi)) == len(s.nodi)
        # aste non nulle e non doppie
        assert all(s.nodi[i] != s.nodi[j] for i, j in s.aste)
        assert len({frozenset(a) for a in s.aste}) == len(s.aste)
        # grafo connesso
        padre = list(range(len(s.nodi)))
        def trova(i):
            while padre[i] != i:
                i = padre[i]
            return i
        for i, j in s.aste:
            padre[trova(i)] = trova(j)
        assert len({trova(i) for i in range(len(s.nodi))}) == 1
        # abbastanza vincoli, mai due nello stesso punto
        assert sum(GRADI_VINCOLO[v.tipo] for v in s.vincoli) >= 3
        posti = [("n", v.nodo) if v.nodo is not None else ("a", v.asta, round(v.s, 6)) for v in s.vincoli]
        assert len(set(posti)) == len(posti)
        # in campata solo cerniere e carrelli
        assert all(v.tipo in ("cerniera", "carrello") for v in s.vincoli if v.asta is not None)
        # sconnessioni parziali: esattamente due aste saldate, allineate
        for c in s.sconnessioni:
            convergenti = [k for k, (i, j) in enumerate(s.aste) if c.nodo in (i, j)]
            assert len(convergenti) >= 2
            if c.svincolate is not None:
                saldate = [k for k in convergenti if k not in c.svincolate]
                assert len(saldate) == 2 and allineate(s, saldate[0], saldate[1], c.nodo)
            if c.tipo in ("bipendolo", "pattino"):
                assert len(convergenti) == 2 and allineate(s, convergenti[0], convergenti[1], c.nodo)


def test_stesso_seme_stesso_schema():
    a = genera_schema(np.random.default_rng(7))
    b = genera_schema(np.random.default_rng(7))
    assert a.a_json() == b.a_json()


def test_tutte_le_famiglie_compaiono():
    viste = Counter(genera_schema(np.random.default_rng(seme)).famiglia for seme in range(200))
    assert set(viste) == set(FAMIGLIE)


def test_ci_sono_carichi_e_sconnessioni():
    tutti = [s for f in FAMIGLIE for s in schemi(f, 60)]
    assert sum(len(s.carichi) for s in tutti) > len(tutti)
    assert any(c.svincolate is not None for s in tutti for c in s.sconnessioni)
    assert any(c.tipo == "bipendolo" for s in tutti for c in s.sconnessioni)
    assert any(v.asta is not None for s in tutti for v in s.vincoli)
    assert {c.tipo for s in tutti for c in s.carichi} == {"distribuito", "forza", "momento"}


def _punto(s, c):
    if c.nodo is not None:
        return s.nodi[c.nodo]
    (x0, y0), (x1, y1) = s.nodi[s.aste[c.asta][0]], s.nodi[s.aste[c.asta][1]]
    return (x0 + c.s * (x1 - x0), y0 + c.s * (y1 - y0))


def test_forze_mai_sopra_un_distribuito_ne_lungo_l_asta():
    for f in FAMIGLIE:
        for s in schemi(f, 150):
            distribuiti = [c for c in s.carichi if c.tipo == "distribuito"]
            for c in s.carichi:
                if c.tipo != "forza":
                    continue
                px, py = _punto(s, c)
                for q in distribuiti:
                    (x0, y0), (x1, y1) = s.nodi[s.aste[q.asta][0]], s.nodi[s.aste[q.asta][1]]
                    l2 = (x1 - x0) ** 2 + (y1 - y0) ** 2
                    t = ((px - x0) * (x1 - x0) + (py - y0) * (y1 - y0)) / l2
                    sulla_retta = abs((px - x0) * (y1 - y0) - (py - y0) * (x1 - x0)) < 1e-9
                    assert not (sulla_retta and q.s1 - 1e-9 <= t <= q.s2 + 1e-9), (f, s.a_json())
                if c.asta is not None:
                    (x0, y0), (x1, y1) = s.nodi[s.aste[c.asta][0]], s.nodi[s.aste[c.asta][1]]
                    d = math.radians(c.direzione)
                    croce = math.cos(d) * (y1 - y0) - math.sin(d) * (x1 - x0)
                    assert abs(croce) > 1e-6, (f, s.a_json())

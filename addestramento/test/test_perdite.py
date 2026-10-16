from __future__ import annotations

import numpy as np
import pytest
import torch

from generatore.campione import genera
from rete import vocabolario as V
from rete.bersagli import costruisci
from rete.dati import _pezzo, trasla_primitive
from rete.metriche import GRUPPI, Misure, metriche
from rete.perdite import pesi_classi_da, perdita


@pytest.fixture(scope="module")
def bersagli():
    # i primi due pezzi con frecce, corpi e scritte: le metriche non sono vacue
    lotto, seme = [], 0
    while len(lotto) < 2:
        seme += 1
        c = genera(seme, solo_etichette=False, modo="ritaglio", rari=True)
        b = costruisci(_pezzo(c["maschera"], 0, 0, 512, 0), trasla_primitive(c["primitive"], 0, 0, 512), 512)
        if all((b["mappe"][GRUPPI[g]] == 1).any() for g in ("frecce", "corpi", "scritte")):
            lotto.append(b)
    return {k: torch.from_numpy(np.stack([b[k] for b in lotto])) for k in ("seg", "mappe", "pesi_reg")}


def perfette(b):
    seg = torch.nn.functional.one_hot(b["seg"], V.CLASSI).permute(0, 3, 1, 2).float() * 40 - 20
    testa = b["mappe"].clone()
    mappe = b["mappe"][:, V.MAPPE]
    testa[:, V.MAPPE] = torch.where(mappe == 1, torch.tensor(20.0), torch.tensor(-20.0))
    return seg, testa


def vuote(b):
    seg = torch.zeros(b["seg"].shape[0], V.CLASSI, *b["seg"].shape[1:])
    seg[:, 0] = 20
    testa = torch.full_like(b["mappe"], -20.0)
    return seg, testa


def test_perdita_quasi_nulla_su_uscite_perfette(bersagli):
    pesi = torch.ones(V.CLASSI)
    totale, dettaglio = perdita(perfette(bersagli), bersagli, pesi)
    assert float(totale) < 1e-3, dettaglio
    assert set(dettaglio) == {"seg", "centri", "regressioni"}


def test_la_discesa_del_gradiente_la_fa_scendere(bersagli):
    torch.manual_seed(0)
    seg = torch.zeros(2, V.CLASSI, *bersagli["seg"].shape[1:], requires_grad=True)
    testa = torch.zeros_like(bersagli["mappe"]).requires_grad_(True)
    ottimizzatore = torch.optim.Adam([seg, testa], lr=0.1)
    valori = []
    for _ in range(40):
        totale, _ = perdita((seg, testa), bersagli, torch.ones(V.CLASSI))
        ottimizzatore.zero_grad()
        totale.backward()
        ottimizzatore.step()
        valori.append(totale.item())
    assert valori[0] > 0 and valori[-1] < 0.5 * valori[0]
    assert all(b <= a * 1.05 for a, b in zip(valori, valori[1:]))


def test_i_pesi_di_classe_contano(bersagli):
    uscite = (torch.randn(2, V.CLASSI, *bersagli["seg"].shape[1:]), torch.zeros_like(bersagli["mappe"]))
    a, da = perdita(uscite, bersagli, torch.ones(V.CLASSI))
    b, db = perdita(uscite, bersagli, torch.tensor([0.1, 3, 1, 1, 1, 1, 1.0]))
    assert abs(da["seg"] - db["seg"]) > 1e-3
    assert da["centri"] == db["centri"]


def test_pesi_classi_da():
    p = pesi_classi_da(np.array([0.9, 0.04, 0.01, 0.02, 0.01, 0.02, 0.0]))
    assert p.shape == (V.CLASSI,) and torch.isfinite(p).all()
    assert abs(float(p.mean()) - 1) < 1e-6
    assert p[0] < p[1] < p[2]


def test_metriche_perfette(bersagli):
    m = metriche(perfette(bersagli), bersagli)
    for g in GRUPPI:
        if m[f"{g}:veri"] > 0:
            assert m[f"{g}:precisione"] == 1.0 and m[f"{g}:richiamo"] == 1.0, g
    assert m["corpi:veri"] > 0 and m["frecce:veri"] > 0 and m["scritte:veri"] > 0
    presenti = set(bersagli["seg"].unique().tolist())
    for c in presenti:
        assert m[f"iou:{V.NOMI_CLASSI[c]}"] == 1.0
    assert m["corpi:errore_angolo"] < 1e-3 and m["frecce:errore_angolo"] < 1e-3


def test_metriche_su_uscite_vuote(bersagli):
    m = metriche(vuote(bersagli), bersagli)
    for g in GRUPPI:
        if m[f"{g}:veri"] > 0:
            assert m[f"{g}:richiamo"] == 0.0


def test_misure_si_sommano_sui_lotti(bersagli):
    uno = {k: v[:1] for k, v in bersagli.items()}
    due = {k: v[1:] for k, v in bersagli.items()}
    mis = Misure()
    for b in (uno, due):
        mis.aggiungi(vuote(b), b)
    insieme = metriche(vuote(bersagli), bersagli)
    assert mis.risultato() == insieme


def test_misure_perfette_si_sommano_sui_lotti(bersagli):
    uno = {k: v[:1] for k, v in bersagli.items()}
    due = {k: v[1:] for k, v in bersagli.items()}
    mis = Misure()
    for b in (uno, due):
        mis.aggiungi(perfette(b), b)
    assert mis.risultato() == metriche(perfette(bersagli), bersagli)
    assert mis.risultato()["corpi:veri"] == mis.risultato()["corpi:trovati"] > 0

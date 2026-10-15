from __future__ import annotations

import json

import pytest
import torch

from generatore import dataset
from rete.addestra import Config, addestra


@pytest.fixture(scope="module")
def dati(tmp_path_factory):
    uscita = tmp_path_factory.mktemp("dati")
    dataset.main(["--uscita", str(uscita), "--ritagli", "4", "--pagine", "0",
                  "--val-ritagli", "2", "--val-pagine", "0", "--processi", "1"])
    return uscita


def config(dati, uscita, **altro):
    base = dict(dati=dati, uscita=uscita, lato=128, lotto=1, epoche=15, lr=2e-3,
                dispositivo="cpu", processi=0, seme=0)
    base.update(altro)
    return Config(**base)


def test_la_perdita_scende(dati, tmp_path):
    migliore = addestra(config(dati, tmp_path / "a"))
    righe = [json.loads(r) for r in (tmp_path / "a" / "registro.jsonl").read_text().splitlines()]
    assert len(righe) == 15 and righe[-1]["passo"] == 60
    assert righe[-1]["perdita_addestramento"] < 0.5 * righe[0]["perdita_addestramento"]
    assert migliore.exists() and (tmp_path / "a" / "ultimo.pt").exists()
    assert "pallini:richiamo" in righe[-1]["metriche"]


def test_la_ripresa_da_gli_stessi_pesi(dati, tmp_path):
    # 4 campioni a lotti da 1: il passo 10 cade a metà della terza epoca
    filato = config(dati, tmp_path / "filato", epoche=6, max_passi=20)
    addestra(filato)
    ripreso = config(dati, tmp_path / "ripreso", epoche=6, max_passi=10)
    addestra(ripreso)
    stato = torch.load(tmp_path / "ripreso" / "ultimo.pt", weights_only=False)
    assert stato["passo"] == 10 and stato["passo_in_epoca"] == 2
    addestra(config(dati, tmp_path / "ripreso", epoche=6, max_passi=20))
    a = torch.load(tmp_path / "filato" / "ultimo.pt", weights_only=False)["modello"]
    b = torch.load(tmp_path / "ripreso" / "ultimo.pt", weights_only=False)["modello"]
    assert a.keys() == b.keys()
    for k in a:
        assert torch.equal(a[k], b[k]), k
    registro = (tmp_path / "ripreso" / "registro.jsonl").read_text().splitlines()
    assert [json.loads(r)["epoca"] for r in registro] == [0, 1, 2, 3, 4]

from __future__ import annotations

import numpy as np
import pytest
import torch

from rete import vocabolario as V
from rete.modello import Rete, conta_parametri


@pytest.fixture(scope="module")
def rete():
    torch.manual_seed(0)
    r = Rete()
    # statistiche di BatchNorm non banali, come dopo l'addestramento
    r.train()
    with torch.no_grad():
        for _ in range(3):
            r(torch.rand(2, 1, 128, 128))
    return r.eval()


def test_budget(rete):
    assert conta_parametri(rete) <= 1_500_000


@pytest.mark.parametrize("H,W", [(512, 512), (768, 544)])
def test_forme(rete, H, W):
    with torch.no_grad():
        seg, testa = rete(torch.rand(1, 1, H, W))
    assert tuple(seg.shape) == (1, V.CLASSI, H // 2, W // 2)
    assert tuple(testa.shape) == (1, V.CANALI, H // 4, W // 4)


def test_predici_sigmoide_solo_sulle_mappe(rete):
    x = torch.rand(1, 1, 128, 160)
    with torch.no_grad():
        _, grezza = rete(x)
        _, testa = rete.predici(x)
    assert torch.allclose(testa[:, V.MAPPE], torch.sigmoid(grezza[:, V.MAPPE]))
    assert torch.allclose(testa[:, V.REGRESSIONI], grezza[:, V.REGRESSIONI])


def test_onnx_come_torch(rete, tmp_path):
    import onnxruntime as ort
    percorso = tmp_path / "rete.onnx"
    torch.onnx.export(rete, torch.rand(1, 1, 256, 256), str(percorso), opset_version=17, dynamo=False,
                      input_names=["immagine"], output_names=["seg", "testa"],
                      dynamic_axes={"immagine": {0: "B", 2: "H", 3: "W"}, "seg": {0: "B", 2: "h2", 3: "w2"},
                                    "testa": {0: "B", 2: "h4", 3: "w4"}})
    x = torch.rand(1, 1, 768, 544)  # dimensioni diverse da quelle dell'esportazione
    with torch.no_grad():
        attesi = [t.numpy() for t in rete(x)]
    sessione = ort.InferenceSession(str(percorso), providers=["CPUExecutionProvider"])
    ottenuti = sessione.run(None, {"immagine": x.numpy()})
    for a, o in zip(attesi, ottenuti):
        assert a.shape == o.shape
        assert np.abs(a - o).max() < 1e-4

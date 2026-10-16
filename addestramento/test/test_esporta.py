from __future__ import annotations

import json

import numpy as np
import onnx
import pytest
import torch

from rete import vocabolario as V
from rete.esporta import OPERATORI, esporta
from rete.modello import Rete


@pytest.fixture(scope="module")
def esportata(tmp_path_factory):
    cartella = tmp_path_factory.mktemp("esporta")
    torch.manual_seed(1)
    r = Rete()
    r.train()
    with torch.no_grad():
        for _ in range(3):
            r(torch.rand(2, 1, 128, 128))
    r.eval()
    torch.save({"modello": r.state_dict()}, cartella / "pesi.pt")
    esporta(cartella / "pesi.pt", cartella / "foto.onnx", cartella / "foto.json")
    return r, cartella


def test_uscite_come_torch(esportata):
    import onnxruntime as ort
    r, cartella = esportata
    x = torch.rand(1, 1, 384, 320)
    with torch.no_grad():
        seg, testa = r.predici(x)
    s = ort.InferenceSession(str(cartella / "foto.onnx"), providers=["CPUExecutionProvider"])
    seg_o, testa_o = s.run(None, {"immagine": x.numpy()})
    assert testa_o.shape == tuple(testa.shape) and seg_o.shape == tuple(seg.shape)
    assert np.abs(testa_o[:, V.MAPPE] - testa.numpy()[:, V.MAPPE]).max() < 1e-2
    # i pesi in fp16 non cambiano la classe quasi da nessuna parte
    assert (seg_o.argmax(1) == seg.numpy().argmax(1)).mean() > 0.99


def test_operatori_e_peso(esportata):
    _, cartella = esportata
    m = onnx.load(str(cartella / "foto.onnx"))
    assert {n.op_type for n in m.graph.node} <= OPERATORI
    assert (cartella / "foto.onnx").stat().st_size <= 3.5 * 2 ** 20
    grandi = [i for i in m.graph.initializer if np.prod(i.dims) > 64]
    assert grandi and all(i.data_type == onnx.TensorProto.FLOAT16 for i in grandi)
    assert [i.name for i in m.graph.input] == ["immagine"]


def test_descrizione(esportata):
    _, cartella = esportata
    d = json.loads((cartella / "foto.json").read_text())
    assert len(d["canali"]) == V.CANALI
    assert d["modello"]["file"] == "foto.onnx" and d["modello"]["pesi"] == "fp16"
    assert set(d["uscite"]) == {"seg", "testa"}


def test_regressioni_in_fp16(esportata):
    import onnxruntime as ort
    r, cartella = esportata
    x = torch.rand(1, 1, 256, 320)
    with torch.no_grad():
        _, testa = r.predici(x)
    s = ort.InferenceSession(str(cartella / "foto.onnx"), providers=["CPUExecutionProvider"])
    _, testa_o = s.run(None, {"immagine": x.numpy()})
    assert np.abs(testa_o[:, V.REGRESSIONI] - testa.numpy()[:, V.REGRESSIONI]).max() < 0.05

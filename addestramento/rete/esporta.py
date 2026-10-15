"""
ESPORTAZIONE — la rete addestrata come file per il browser.

    python -m rete.esporta --pesi esiti/rete/migliore.pt \\
        --onnx ../public/modelli/foto.onnx --json ../public/modelli/foto.json

Si esporta `predici()` (sigmoide già applicata ai canali dei centri) in
ONNX opset 17, con altezza e larghezza libere. I pesi si salvano in fp16 e
un `Cast` li riporta in fp32 prima dell'uso: il file si dimezza e il
calcolo resta in fp32. Le costanti piccole (le scale dei Resize, la
maschera delle mappe) restano in fp32. Nel grafo ci sono solo operatori che
onnxruntime-web esegue: `OPERATORI` è l'elenco ammesso.
"""

from __future__ import annotations

import argparse
import io
import json
from pathlib import Path

import numpy as np
import onnx
import torch
from onnx import helper, numpy_helper

from . import vocabolario as V
from .modello import Rete, conta_parametri

OPSET = 17
OPERATORI = frozenset({"Conv", "Relu", "Clip", "HardSigmoid", "HardSwish", "Mul", "Add", "Concat", "Resize", "Cast",
                       "Sigmoid", "Identity", "Constant", "Shape", "Gather", "Slice", "Unsqueeze"})
PICCOLI = 64  # gli inizializzatori fino a questo numero di valori restano in fp32


class _Predici(torch.nn.Module):
    def __init__(self, rete: Rete):
        super().__init__()
        self.rete = rete

    def forward(self, x: torch.Tensor):
        return self.rete.predici(x)


def _in_fp16(modello: onnx.ModelProto) -> onnx.ModelProto:
    g = modello.graph
    lanci, nuovi = [], []
    for init in g.initializer:
        valori = numpy_helper.to_array(init)
        if init.data_type != onnx.TensorProto.FLOAT or valori.size <= PICCOLI:
            nuovi.append(init)
            continue
        nome16 = f"{init.name}__fp16"
        nuovi.append(numpy_helper.from_array(valori.astype(np.float16), nome16))
        lanci.append(helper.make_node("Cast", [nome16], [init.name], to=onnx.TensorProto.FLOAT,
                                      name=f"Cast_{init.name}"))
    del g.initializer[:]
    g.initializer.extend(nuovi)
    nodi = lanci + list(g.node)
    del g.node[:]
    g.node.extend(nodi)
    return modello


def esporta(pesi: Path, uscita_onnx: Path, uscita_json: Path) -> None:
    stato = torch.load(pesi, map_location="cpu", weights_only=False)
    rete = Rete()
    rete.load_state_dict(stato["modello"] if "modello" in stato else stato)
    rete.eval()
    buf = io.BytesIO()
    torch.onnx.export(_Predici(rete), torch.rand(1, 1, 256, 256), buf, opset_version=OPSET, dynamo=False,
                      input_names=["immagine"], output_names=["seg", "testa"],
                      dynamic_axes={"immagine": {0: "B", 2: "H", 3: "W"}, "seg": {0: "B", 2: "H2", 3: "W2"},
                                    "testa": {0: "B", 2: "H4", 3: "W4"}})
    modello = _in_fp16(onnx.load_from_string(buf.getvalue()))
    onnx.checker.check_model(modello)
    estranei = {n.op_type for n in modello.graph.node} - OPERATORI
    if estranei:
        raise ValueError(f"operatori non ammessi nel grafo: {sorted(estranei)}")
    uscita_onnx.parent.mkdir(parents=True, exist_ok=True)
    onnx.save(modello, str(uscita_onnx))

    d = V.descrizione()
    d["modello"] = {"file": uscita_onnx.name, "opset": OPSET, "pesi": "fp16", "parametri": conta_parametri(rete),
                    "epoca": stato.get("epoca"), "perdita_validazione": stato.get("perdita_validazione")}
    d["uscite"] = {
        "seg": "logit di classe [B, 7, H/2, W/2]",
        "testa": "[B, 43, H/4, W/4]: probabilità (sigmoide) sui canali 'mappa', valori grezzi sulle 'regressione'",
    }
    uscita_json.parent.mkdir(parents=True, exist_ok=True)
    uscita_json.write_text(json.dumps(d, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


def main(argv=None) -> None:
    a = argparse.ArgumentParser(prog="rete.esporta")
    a.add_argument("--pesi", type=Path, required=True)
    a.add_argument("--onnx", type=Path, required=True)
    a.add_argument("--json", type=Path, required=True)
    arg = a.parse_args(argv)
    esporta(arg.pesi, arg.onnx, arg.json)
    print(f"{arg.onnx}: {arg.onnx.stat().st_size / 2 ** 20:.2f} MB")


if __name__ == "__main__":
    main()

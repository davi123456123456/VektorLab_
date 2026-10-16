from __future__ import annotations


def test_librerie_della_rete():
    import onnx  # noqa: F401
    import onnxruntime  # noqa: F401
    import torch

    from rete import dispositivo

    principale = tuple(int(x) for x in torch.__version__.split(".")[:2])
    assert principale >= (2, 5)  # torch.onnx.export(dynamo=False) esiste dalla 2.5
    d = dispositivo()
    assert (torch.ones(3, device=d) + 1).sum().item() == 6

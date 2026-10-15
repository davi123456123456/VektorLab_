"""
Rete della struttura da foto (Fase 3): modello, bersagli, addestramento,
esportazione. Gira solo sulla macchina di sviluppo, nell'ambiente
`addestramento/.venv`.
"""

from __future__ import annotations


def dispositivo(scelta: str = "auto"):
    """La GPU del Mac (MPS) se c'è, altrimenti la CPU; `scelta` la impone."""
    import torch

    if scelta != "auto":
        return torch.device(scelta)
    return torch.device("mps" if torch.backends.mps.is_available() else "cpu")

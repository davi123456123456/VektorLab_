"""
PERDITE — quanto le uscite della rete distano dai bersagli.

  · segmentazione: entropia incrociata pesata per classe (lo sfondo è il
    90 % dei pixel: senza pesi la rete imparerebbe solo quello);
  · centri: perdita focale di CenterNet (α = 2, β = 4) sui logit, divisa
    per il numero di picchi;
  · regressioni: L1 dove `pesi_reg` vale 1, divisa per il numero di valori
    e pesata 0.5.
"""

from __future__ import annotations

from typing import Dict, Tuple

import numpy as np
import torch
import torch.nn.functional as F

from . import vocabolario as V

ALFA, BETA = 2.0, 4.0
PESO_REGRESSIONI = 0.5


def pesi_classi_da(frequenze: np.ndarray) -> torch.Tensor:
    """1/√frequenza, normalizzati a media 1; una classe mai vista vale come una rarissima."""
    f = np.maximum(np.asarray(frequenze, dtype=np.float64), 1e-4)
    p = 1 / np.sqrt(f)
    return torch.tensor(p / p.mean(), dtype=torch.float32)


def focale(logit: torch.Tensor, bersaglio: torch.Tensor) -> torch.Tensor:
    log_p, log_1mp = F.logsigmoid(logit), F.logsigmoid(-logit)
    p = torch.exp(log_p)
    positivi = bersaglio.eq(1).float()
    perdita_pos = -log_p * (1 - p) ** ALFA * positivi
    perdita_neg = -log_1mp * p ** ALFA * (1 - bersaglio) ** BETA * (1 - positivi)
    return (perdita_pos.sum() + perdita_neg.sum()) / positivi.sum().clamp(min=1)


def perdita(uscite: Tuple[torch.Tensor, torch.Tensor], bersagli: Dict[str, torch.Tensor],
            pesi_classi: torch.Tensor) -> Tuple[torch.Tensor, Dict[str, float]]:
    seg, testa = uscite
    p_seg = F.cross_entropy(seg, bersagli["seg"], weight=pesi_classi.to(seg.device))
    p_centri = focale(testa[:, V.MAPPE], bersagli["mappe"][:, V.MAPPE])
    pesi = bersagli["pesi_reg"]
    p_reg = (torch.abs(testa - bersagli["mappe"]) * pesi).sum() / pesi.sum().clamp(min=1)
    totale = p_seg + p_centri + PESO_REGRESSIONI * p_reg
    return totale, {"seg": p_seg.item(), "centri": p_centri.item(), "regressioni": p_reg.item()}

"""
MODELLO — una rete piccola che dalla foto in grigio produce le mappe.

Codificatore a blocchi residui invertiti (come MobileNetV2) fino a 1/32,
decodificatore U-Net con i salti a 1/16, 1/8, 1/4 e 1/2:

  · `seg` a 1/2: 7 logit di classe per cella;
  · `testa` a 1/4: i 43 canali di `vocabolario` (logit sulle mappe dei
    centri, valori sulle regressioni).

Le perdite lavorano sui logit; `predici()` applica la sigmoide ai soli
canali dei centri ed è ciò che si esporta per il browser. Si usano solo
operazioni che onnxruntime-web sa eseguire (convoluzioni, ReLU6 = Clip,
Hardswish, Resize al più vicino, Concat).
"""

from __future__ import annotations

import math
from typing import List, Tuple

import torch
from torch import nn

from . import vocabolario as V


def conv_bn(entrata: int, uscita: int, k: int = 3, passo: int = 1, gruppi: int = 1, attivazione=nn.ReLU6) -> nn.Sequential:
    strati = [nn.Conv2d(entrata, uscita, k, passo, k // 2, groups=gruppi, bias=False), nn.BatchNorm2d(uscita)]
    if attivazione is not None:
        strati.append(attivazione())
    return nn.Sequential(*strati)


class Invertito(nn.Module):
    """Blocco residuo invertito: espansione 1×1, profonda 3×3, proiezione 1×1."""

    def __init__(self, entrata: int, uscita: int, passo: int, espansione: int, attivazione=nn.ReLU6):
        super().__init__()
        medio = entrata * espansione
        strati = []
        if espansione != 1:
            strati.append(conv_bn(entrata, medio, 1, attivazione=attivazione))
        strati += [conv_bn(medio, medio, 3, passo, gruppi=medio, attivazione=attivazione),
                   conv_bn(medio, uscita, 1, attivazione=None)]
        self.corpo = nn.Sequential(*strati)
        self.residuo = passo == 1 and entrata == uscita

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        y = self.corpo(x)
        return x + y if self.residuo else y


def _stadio(entrata: int, uscita: int, n: int, espansione: int, attivazione) -> nn.Sequential:
    return nn.Sequential(*[Invertito(entrata if i == 0 else uscita, uscita, 2 if i == 0 else 1, espansione, attivazione)
                           for i in range(n)])


class Salita(nn.Module):
    """Raddoppia la risoluzione, unisce il salto e mescola con due convoluzioni."""

    def __init__(self, entrata: int, salto: int, uscita: int):
        super().__init__()
        self.su = nn.Upsample(scale_factor=2, mode="nearest")
        self.mescola = nn.Sequential(conv_bn(entrata + salto, uscita), conv_bn(uscita, uscita))

    def forward(self, x: torch.Tensor, salto: torch.Tensor) -> torch.Tensor:
        return self.mescola(torch.cat([self.su(x), salto], dim=1))


class Rete(nn.Module):
    def __init__(self):
        super().__init__()
        self.ingresso = nn.Sequential(conv_bn(1, 16, 3, 2), Invertito(16, 16, 1, 1))  # 1/2
        self.s4 = _stadio(16, 24, 2, 4, nn.ReLU6)                                          # 1/4
        self.s8 = _stadio(24, 40, 3, 4, nn.ReLU6)                                          # 1/8
        self.s16 = _stadio(40, 80, 3, 4, nn.Hardswish)                                     # 1/16
        self.s32 = _stadio(80, 128, 3, 4, nn.Hardswish)                                    # 1/32
        self.su16 = Salita(128, 80, 96)
        self.su8 = Salita(96, 40, 64)
        self.su4 = Salita(64, 24, 64)
        self.su2 = Salita(64, 16, 32)
        self.testa = nn.Sequential(conv_bn(64, 64), nn.Conv2d(64, V.CANALI, 1))
        self.seg = nn.Sequential(conv_bn(32, 32), nn.Conv2d(32, V.CLASSI, 1))
        # all'inizio le mappe dei centri dicono "quasi niente" (p ≈ 0.1), come in CenterNet
        with torch.no_grad():
            self.testa[-1].bias.zero_()
            self.testa[-1].bias[V.MAPPE] = -math.log((1 - 0.1) / 0.1)
        maschera = torch.zeros(1, V.CANALI, 1, 1)
        maschera[:, V.MAPPE] = 1.0
        self.register_buffer("_mappe", maschera, persistent=False)

    def forward(self, x: torch.Tensor) -> Tuple[torch.Tensor, torch.Tensor]:
        x2 = self.ingresso(x)
        x4 = self.s4(x2)
        x8 = self.s8(x4)
        x16 = self.s16(x8)
        x32 = self.s32(x16)
        y = self.su16(x32, x16)
        y = self.su8(y, x8)
        y4 = self.su4(y, x4)
        y2 = self.su2(y4, x2)
        return self.seg(y2), self.testa(y4)

    def predici(self, x: torch.Tensor) -> Tuple[torch.Tensor, torch.Tensor]:
        """Logit di segmentazione e testa con la sigmoide sui soli canali dei centri."""
        seg, testa = self.forward(x)
        return seg, torch.sigmoid(testa) * self._mappe + testa * (1 - self._mappe)


def conta_parametri(m: nn.Module) -> int:
    return sum(p.numel() for p in m.parameters())

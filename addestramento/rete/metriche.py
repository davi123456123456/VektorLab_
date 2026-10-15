"""
METRICHE — che cosa la rete trova davvero, in numeri leggibili.

  · `iou:<classe>`: intersezione su unione della segmentazione;
  · per pallini, corpi, frecce, momenti, nodi e scritte: i picchi previsti
    (sigmoide > 0.3, massimi locali) si accoppiano ai picchi veri dello
    STESSO canale entro 1 cella (quindi il tipo del vincolo, il verso del
    momento e il valore della scritta devono essere giusti); da qui
    precisione e richiamo;
  · errore medio d'angolo (gradi) di corpi e frecce sulle coppie trovate.

`Misure` somma i conteggi lotto per lotto; le grandezze senza casi
(nessun picco vero, nessuna classe presente) valgono None.
"""

from __future__ import annotations

import math
from typing import Dict, List, Optional, Tuple

import numpy as np
import torch

from . import vocabolario as V
from .bersagli import estrai_picchi

GRUPPI: Dict[str, List[int]] = {
    "pallini": [V.PALLINO],
    "corpi": list(range(V.CORPO0, V.CORPO0 + len(V.TIPI_CORPO))),
    "frecce": [V.FRECCIA],
    "momenti": [V.MOMENTO0, V.MOMENTO0 + 1],
    "nodi": [V.NODO],
    "scritte": list(range(V.SCRITTA0, V.SCRITTA0 + len(V.SCRITTE))),
}
ANGOLI = {"corpi": (V.COS_CORPO, V.SIN_CORPO), "frecce": (V.COS_FRECCIA, V.SIN_FRECCIA)}
SOGLIA = 0.3


def _accoppia(previsti: List[Tuple[int, int, float]], veri: np.ndarray) -> List[Tuple[Tuple[int, int], Tuple[int, int]]]:
    """Coppie (previsto, vero) entro 1 cella; i previsti più sicuri scelgono per primi."""
    liberi = [tuple(v) for v in veri]
    coppie = []
    for i, j, _ in sorted(previsti, key=lambda p: -p[2]):
        migliore = None
        for k, (a, b) in enumerate(liberi):
            d = max(abs(a - i), abs(b - j))
            if d <= 1 and (migliore is None or d < migliore[0]):
                migliore = (d, k)
        if migliore is not None:
            coppie.append(((i, j), liberi.pop(migliore[1])))
    return coppie


def _numpy(t: torch.Tensor) -> np.ndarray:
    return t.detach().float().cpu().numpy()


class Misure:
    def __init__(self):
        self.intersezione = np.zeros(V.CLASSI, dtype=np.int64)
        self.unione = np.zeros(V.CLASSI, dtype=np.int64)
        self.conti = {g: {"veri": 0, "trovati": 0, "giusti": 0} for g in GRUPPI}
        self.angoli = {g: [0.0, 0] for g in ANGOLI}

    def aggiungi(self, uscite: Tuple[torch.Tensor, torch.Tensor], bersagli: Dict[str, torch.Tensor]) -> None:
        seg = _numpy(uscite[0]).argmax(axis=1)
        vero_seg = _numpy(bersagli["seg"]).astype(np.int64)
        for c in range(V.CLASSI):
            a, b = seg == c, vero_seg == c
            self.intersezione[c] += int((a & b).sum())
            self.unione[c] += int((a | b).sum())

        testa = _numpy(uscite[1])
        mappe = _numpy(bersagli["mappe"])
        probabilita = 1 / (1 + np.exp(-np.clip(testa, -50, 50)))
        for n in range(testa.shape[0]):
            for g, canali in GRUPPI.items():
                for k in canali:
                    previsti = estrai_picchi(probabilita[n, k], SOGLIA)
                    veri = np.argwhere(mappe[n, k] == 1)
                    coppie = _accoppia(previsti, veri)
                    self.conti[g]["veri"] += len(veri)
                    self.conti[g]["trovati"] += len(previsti)
                    self.conti[g]["giusti"] += len(coppie)
                    if g in ANGOLI:
                        ci, si = ANGOLI[g]
                        for (i, j), (a, b) in coppie:
                            previsto = math.atan2(testa[n, si, i, j], testa[n, ci, i, j])
                            vero = math.atan2(mappe[n, si, a, b], mappe[n, ci, a, b])
                            self.angoli[g][0] += math.degrees(abs((previsto - vero + math.pi) % (2 * math.pi) - math.pi))
                            self.angoli[g][1] += 1

    def risultato(self) -> Dict[str, Optional[float]]:
        r: Dict[str, Optional[float]] = {}
        for c, nome in enumerate(V.NOMI_CLASSI):
            r[f"iou:{nome}"] = float(self.intersezione[c] / self.unione[c]) if self.unione[c] else None
        for g, c in self.conti.items():
            r[f"{g}:veri"] = c["veri"]
            r[f"{g}:trovati"] = c["trovati"]
            r[f"{g}:precisione"] = c["giusti"] / c["trovati"] if c["trovati"] else None
            r[f"{g}:richiamo"] = c["giusti"] / c["veri"] if c["veri"] else None
        for g, (somma, n) in self.angoli.items():
            r[f"{g}:errore_angolo"] = somma / n if n else None
        return r


def metriche(uscite: Tuple[torch.Tensor, torch.Tensor], bersagli: Dict[str, torch.Tensor]) -> Dict[str, Optional[float]]:
    m = Misure()
    m.aggiungi(uscite, bersagli)
    return m.risultato()

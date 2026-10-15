"""
BERSAGLI — dalle etichette di un campione a ciò che la rete deve produrre.

  · `seg`: la maschera ridotta a 1/2. In ogni blocco 2×2 vince la classe più
    importante (testo > asta > simbolo > carico > ausiliaria > altro >
    sfondo): con la moda una linea d'asta larga 1 px sparirebbe;
  · `mappe`: 43 canali a 1/4 (vedi `vocabolario`). Sui canali dei centri una
    gaussiana (σ = 1.5 celle) col picco = 1 nella cella del punto; sui canali
    di regressione il valore, nella cella del picco e nelle 4 vicine;
  · `pesi_reg`: 1 dove una regressione vale, 0 altrove (anche su tutti i
    canali dei centri).

La cella (riga, colonna) a passo s copre i pixel s·colonna … s·colonna + s − 1,
quindi il suo centro è a s·colonna + (s − 1)/2 (pixel con il centro sugli
interi, come gli indici della maschera). Le primitive arrivano nel contratto
(y verso l'alto) e qui si riportano in pixel y giù; i punti fuori
dall'immagine si saltano.
"""

from __future__ import annotations

import math
from typing import Dict, List, Tuple

import numpy as np

from . import vocabolario as V

# rango di ogni classe nella riduzione: vince il più alto
_RANGO = np.array([0, 5, 2, 3, 4, 6, 1], dtype=np.uint8)  # sfondo, asta, ausiliaria, carico, simbolo, testo, altro
_CLASSE_DEL_RANGO = np.argsort(_RANGO).astype(np.int64)


def centro_cella(riga: int, colonna: int, passo: int = V.PASSO_TESTA) -> Tuple[float, float]:
    """Centro della cella in pixel d'ingresso (x, y giù)."""
    return colonna * passo + (passo - 1) / 2, riga * passo + (passo - 1) / 2


def _in_cella(x: float, y: float, passo: int = V.PASSO_TESTA) -> Tuple[int, int]:
    return int(round((y - (passo - 1) / 2) / passo)), int(round((x - (passo - 1) / 2) / passo))


def riduci_seg(maschera: np.ndarray) -> np.ndarray:
    H, W = maschera.shape
    h, w = (H + 1) // 2, (W + 1) // 2
    ranghi = np.zeros((2 * h, 2 * w), dtype=np.uint8)
    ranghi[:H, :W] = _RANGO[maschera]
    ridotti = ranghi.reshape(h, 2, w, 2).max(axis=(1, 3))
    return _CLASSE_DEL_RANGO[ridotti]


class _Tela:
    def __init__(self, h: int, w: int):
        self.h, self.w = h, w
        self.mappe = np.zeros((V.CANALI, h, w), dtype=np.float32)
        self.pesi = np.zeros((V.CANALI, h, w), dtype=np.float32)
        self._regressioni: List[Tuple[int, int, Dict[int, float]]] = []
        r = int(math.ceil(3 * V.SIGMA))
        dy, dx = np.mgrid[-r:r + 1, -r:r + 1]
        self._gauss = np.exp(-(dx ** 2 + dy ** 2) / (2 * V.SIGMA ** 2)).astype(np.float32)
        self._r = r

    def centro(self, canale: int, x: float, y: float, valori: Dict[int, float] = None):
        i, j = _in_cella(x, y)
        if not (0 <= i < self.h and 0 <= j < self.w):
            return None
        r = self._r
        i0, i1, j0, j1 = max(0, i - r), min(self.h, i + r + 1), max(0, j - r), min(self.w, j + r + 1)
        g = self._gauss[i0 - i + r:i1 - i + r, j0 - j + r:j1 - j + r]
        np.maximum(self.mappe[canale, i0:i1, j0:j1], g, out=self.mappe[canale, i0:i1, j0:j1])
        if valori:
            self._regressioni.append((i, j, valori))
        return i, j

    def chiudi(self) -> None:
        # prima le celle vicine di tutti, poi i picchi: un picco non viene mai
        # coperto dal vicino di un altro oggetto
        for vicine in (True, False):
            for i, j, valori in self._regressioni:
                celle = ((i - 1, j), (i + 1, j), (i, j - 1), (i, j + 1)) if vicine else ((i, j),)
                for a, b in celle:
                    if 0 <= a < self.h and 0 <= b < self.w:
                        for k, v in valori.items():
                            self.mappe[k, a, b] = v
                            self.pesi[k, a, b] = 1.0


def _nodi(aste: list, altezza: float) -> List[Tuple[float, float]]:
    """Estremi delle aste, fusi quando distano meno di 2 celle."""
    punti = [(e["x"], altezza - e["y"]) for s in aste for e in (s["a"], s["b"])]
    gruppi: List[List[Tuple[float, float]]] = []
    for p in punti:
        for g in gruppi:
            cx, cy = np.mean(g, axis=0)
            if math.hypot(p[0] - cx, p[1] - cy) < 2 * V.PASSO_TESTA:
                g.append(p)
                break
        else:
            gruppi.append([p])
    return [tuple(np.mean(g, axis=0)) for g in gruppi]


def costruisci(maschera: np.ndarray, primitive: dict, altezza: float) -> Dict[str, np.ndarray]:
    H, W = maschera.shape
    t = _Tela((H + 3) // 4, (W + 3) // 4)

    def giu(q: dict) -> Tuple[float, float]:
        return q["x"], altezza - q["y"]

    for c in primitive["pallini"]:
        t.centro(V.PALLINO, *giu(c["c"]), {V.RAGGIO: c["r"] / V.SCALA_RAGGIO})
    for k in primitive["corpi"]:
        a = V.semipiano(k["angolo"]) if k["tipo"] in V.INTERNI else k["angolo"]
        t.centro(V.CORPO0 + V.TIPI_CORPO.index(k["tipo"]), *giu(k["attacco"]),
                 {V.COS_CORPO: math.cos(a), V.SIN_CORPO: math.sin(a)})
    for f in primitive["frecce"]:
        t.centro(V.FRECCIA, *giu(f["punta"]), {
            V.COS_FRECCIA: math.cos(f["direzione"]), V.SIN_FRECCIA: math.sin(f["direzione"]),
            V.LUNG_FRECCIA: f["lunghezza"] / V.SCALA_LUNGHEZZA})
    for m in primitive["momenti"]:
        t.centro(V.MOMENTO0 + (0 if m["verso"] == "antiorario" else 1), *giu(m["centro"]))
    for x, y in _nodi(primitive["aste"], altezza):
        t.centro(V.NODO, x, y)
    for s in primitive["scritte"]:
        k = V.indice_scritta(s["valore"])
        if k is None:
            continue
        valori = None
        if s.get("estremi"):
            e1, e2 = V.estremi_canonici(s["centro"], s["estremi"])
            cx, cy = s["centro"]["x"], s["centro"]["y"]
            valori = {V.QUOTA0 + n: v / V.SCALA_QUOTA for n, v in enumerate(
                (e1["x"] - cx, e1["y"] - cy, e2["x"] - cx, e2["y"] - cy))}
        t.centro(V.SCRITTA0 + k, *giu(s["centro"]), valori)
    t.chiudi()
    return {"seg": riduci_seg(maschera), "mappe": t.mappe, "pesi_reg": t.pesi}


def estrai_picchi(mappa: np.ndarray, soglia: float = 0.3) -> List[Tuple[int, int, float]]:
    """Massimi locali 3×3 sopra la soglia, come (riga, colonna, valore)."""
    h, w = mappa.shape
    bordo = np.pad(mappa, 1, mode="constant", constant_values=-np.inf)
    vicini = np.stack([bordo[1 + di:1 + di + h, 1 + dj:1 + dj + w]
                       for di in (-1, 0, 1) for dj in (-1, 0, 1) if (di, dj) != (0, 0)])
    picco = (mappa >= vicini.max(axis=0)) & (mappa > soglia)
    return [(int(i), int(j), float(mappa[i, j])) for i, j in zip(*np.nonzero(picco))]

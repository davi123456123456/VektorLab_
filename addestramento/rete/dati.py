"""
DATI — i campioni del disco come tensori per l'addestramento.

Da ogni immagine (lato lungo 768) si prende un pezzo `lato × lato`: a caso
durante l'addestramento, al centro per la validazione. Dove il pezzo sporge
dall'immagine si riempie di bianco (e di sfondo nella maschera). Le
primitive si spostano nello stesso modo e i bersagli si costruiscono sul
pezzo. Niente ribaltamenti: cambierebbero il verso dei momenti e degli
orientamenti dei vincoli.

Il caso dipende solo da (seme, epoca, indice): i processi del DataLoader
fanno pezzi diversi fra loro, e un addestramento ripreso rivede gli stessi
pezzi di uno continuo.
"""

from __future__ import annotations

import copy
import json
from pathlib import Path
from typing import Dict, List, Tuple

import numpy as np
import torch
from PIL import Image
from torch.utils.data import Dataset

from .bersagli import costruisci


def trasla_primitive(prim: dict, ox: float, oy: float, lato: int) -> dict:
    """
    Primitive del contratto (y su) dell'immagine intera → quelle del pezzo
    `lato × lato` il cui angolo in alto a sinistra sta in (ox, oy) px y giù.
    """
    p = copy.deepcopy(prim)
    altezza = prim["altezza"]

    def sposta(q: dict) -> None:
        q["x"] = q["x"] - ox
        q["y"] = lato - ((altezza - q["y"]) - oy)

    for s in p["aste"]:
        sposta(s["a"])
        sposta(s["b"])
    for c in p["pallini"]:
        sposta(c["c"])
    for k in p["corpi"]:
        sposta(k["attacco"])
    for f in p["frecce"]:
        sposta(f["punta"])
    for m in p["momenti"]:
        sposta(m["centro"])
    for q in p["nodi"]:
        sposta(q)
    for s in p["scritte"]:
        sposta(s["centro"])
        for e in s.get("estremi", []):
            sposta(e)
    p["larghezza"], p["altezza"] = lato, lato
    return p


def _pezzo(a: np.ndarray, ox: int, oy: int, lato: int, riempimento) -> np.ndarray:
    H, W = a.shape
    out = np.full((lato, lato), riempimento, dtype=a.dtype)
    x0, y0, x1, y1 = max(0, ox), max(0, oy), min(W, ox + lato), min(H, oy + lato)
    if x1 > x0 and y1 > y0:
        out[y0 - oy:y1 - oy, x0 - ox:x1 - ox] = a[y0:y1, x0:x1]
    return out


class Campioni(Dataset):
    def __init__(self, cartelle: List[Path], lato: int = 512, casuale: bool = True, seme: int = 0):
        self.voci: List[Tuple[Path, str]] = []
        for cartella in cartelle:
            cartella = Path(cartella)
            indice = json.loads((cartella / "indice.json").read_text(encoding="utf-8"))
            self.voci += [(cartella, c["nome"]) for c in indice["campioni"]]
        self.lato, self.casuale, self.seme = lato, casuale, seme
        self.epoca = 0

    def imposta_epoca(self, epoca: int) -> None:
        self.epoca = epoca

    def __len__(self) -> int:
        return len(self.voci)

    def __getitem__(self, k: int) -> Tuple[torch.Tensor, Dict[str, torch.Tensor]]:
        cartella, nome = self.voci[k]
        img = np.asarray(Image.open(cartella / f"{nome}.png").convert("L"), dtype=np.float32) / 255
        m = np.asarray(Image.open(cartella / f"{nome}-maschera.png"), dtype=np.uint8)
        prim = json.loads((cartella / f"{nome}.json").read_text(encoding="utf-8"))["primitive"]
        H, W = m.shape
        L = self.lato
        if self.casuale:
            rng = np.random.default_rng([self.seme, self.epoca, k])
            ox = int(rng.integers(min(0, W - L), max(0, W - L) + 1))
            oy = int(rng.integers(min(0, H - L), max(0, H - L) + 1))
        else:
            ox, oy = (W - L) // 2, (H - L) // 2
        b = costruisci(_pezzo(m, ox, oy, L, 0), trasla_primitive(prim, ox, oy, L), L)
        x = torch.from_numpy(_pezzo(img, ox, oy, L, 1.0))[None]
        return x, {"seg": torch.from_numpy(b["seg"]), "mappe": torch.from_numpy(b["mappe"]),
                   "pesi_reg": torch.from_numpy(b["pesi_reg"])}

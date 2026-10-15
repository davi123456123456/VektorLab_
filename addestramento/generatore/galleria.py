"""
GALLERIA — i campioni messi accanto alle loro etichette, per guardarli.

Per ogni campione: la foto, e accanto la stessa foto con la maschera a colori
semitrasparente e le primitive disegnate sopra. Se un'etichetta non cade sul
suo tratto lo si vede a colpo d'occhio, ed è il controllo che conta: la
verifica grafica si fa guardando le immagini.
"""

from __future__ import annotations

import math
from pathlib import Path
from typing import List

import numpy as np
from PIL import Image, ImageDraw

COLORI = np.array([[0, 0, 0], [230, 30, 30], [0, 150, 255], [255, 140, 0],
                   [200, 0, 200], [0, 170, 0], [140, 140, 140]], dtype=float)
LATO = 420


def _sovrapposta(c: dict) -> Image.Image:
    img = c["immagine"].convert("RGB")
    a = np.asarray(img, dtype=float)
    m = c["maschera"]
    colori = COLORI[m]
    misto = np.where((m > 0)[..., None], 0.45 * a + 0.55 * colori, a)
    out = Image.fromarray(misto.astype(np.uint8))
    d = ImageDraw.Draw(out)
    p = c["primitive"]
    H = img.height
    giu = lambda q: (q["x"], H - q["y"])  # noqa: E731  il contratto ha y verso l'alto
    for s in p["aste"]:
        d.line([giu(s["a"]), giu(s["b"])], fill=(255, 0, 0), width=1)
    for q in p["pallini"]:
        x, y = giu(q["c"])
        d.ellipse([x - q["r"], y - q["r"], x + q["r"], y + q["r"]], outline=(255, 0, 255), width=2)
    for k in p["corpi"]:
        x, y = giu(k["attacco"])
        u = (-math.sin(k["angolo"]), -math.cos(k["angolo"]))  # puntamento, y giù
        d.line([(x, y), (x - 25 * u[0], y - 25 * u[1])], fill=(160, 0, 255), width=3)
    for f in p["frecce"]:
        x, y = giu(f["punta"])
        d.line([(x, y), (x - f["lunghezza"] * math.cos(f["direzione"]), y + f["lunghezza"] * math.sin(f["direzione"]))],
               fill=(255, 140, 0), width=2)
        d.ellipse([x - 3, y - 3, x + 3, y + 3], fill=(255, 140, 0))
    for m_ in p["momenti"]:
        x, y = giu(m_["centro"])
        d.ellipse([x - m_["raggio"], y - m_["raggio"], x + m_["raggio"], y + m_["raggio"]], outline=(255, 140, 0))
    for s in p["scritte"]:
        if "estremi" in s:
            d.line([giu(s["estremi"][0]), giu(s["estremi"][1])], fill=(0, 120, 255), width=2)
    x0, y0, x1, y1 = c["meta"]["riquadro"]
    d.rectangle([x0, y0, x1, y1], outline=(0, 200, 0), width=2)
    return out


def galleria(campioni: List[dict], percorso: Path, colonne: int = 5) -> None:
    riquadri = []
    for c in campioni:
        img = c["immagine"].convert("RGB")
        k = LATO / max(img.size)
        dim = (max(1, int(img.width * k)), max(1, int(img.height * k)))
        riquadri.append((img.resize(dim, Image.LANCZOS), _sovrapposta(c).resize(dim, Image.LANCZOS)))
    colonne = max(1, min(colonne, len(riquadri)))
    righe = math.ceil(len(riquadri) / colonne)
    tavola = Image.new("RGB", (colonne * 2 * LATO, righe * LATO), "white")
    for i, (a, b) in enumerate(riquadri):
        x, y = (i % colonne) * 2 * LATO, (i // colonne) * LATO
        tavola.paste(a, (x, y))
        tavola.paste(b, (x + LATO, y))
    percorso.parent.mkdir(parents=True, exist_ok=True)
    tavola.save(percorso)

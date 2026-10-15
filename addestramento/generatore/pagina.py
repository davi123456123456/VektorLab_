"""
PAGINA D'ESAME — lo schema dentro un foglio vero.

Le foto che arriveranno sono fogli interi: intestazione, "Esercizio N",
l'enunciato sotto, la riga "GRUPPO D  L=1600mm …", a volte una seconda figura
(la sezione trasversale da verificare), appunti a penna o a matita. Tutto
questo è testo o "altro disegno" per la maschera, e non produce primitive:
le primitive restano solo quelle dello schema, spostate di `spostamento`.

Gli appunti si posano solo sullo sfondo della maschera: possono passare sopra
il disegno nell'immagine, ma non cancellano le aste dalle etichette.
"""

from __future__ import annotations

import dataclasses
import math
from typing import List, Optional, Tuple

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFont

from .raster import rasterizza
from .scena import ALTRO, TESTO, Scena
from .stili import Stile
from .strutture import scegli

INTESTAZIONI = (
    ("ESAME SCRITTO DI ELEMENTI DELLE MACCHINE T", "Corso di Laurea Triennale in Ingegneria Meccanica"),
    ("PROVA SCRITTA DI SCIENZA DELLE COSTRUZIONI", "Corso di Laurea in Ingegneria Civile"),
    ("ESAME DI MECCANICA DEI SOLIDI", "Corso di Laurea in Ingegneria Industriale"),
)
MESI = ("gennaio", "febbraio", "giugno", "luglio", "settembre", "novembre")
FRASI = (
    "La struttura rappresentata schematicamente in Figura è realizzata con un profilo",
    "a sezione tubolare di diametro esterno De e diametro interno Di.",
    "In base allo schema dei vincoli e dei carichi riportato in Figura, calcolare le",
    "reazioni vincolari e tracciare i diagrammi dell'azione interna di ciascun elemento.",
    "Si individui, quindi, il punto più sollecitato e si verifichi la struttura,",
    "esprimendone il coefficiente di sicurezza minimo C.S.",
    "Si consideri un materiale avente limite di snervamento pari a Sy=300MPa.",
    "Determinare la tensione equivalente di von Mises nel punto più sollecitato.",
    "Si trascuri la cedevolezza assiale degli elementi.",
    "Il materiale è un acciaio avente E=200GPa e la sezione è quadrata di lato H.",
)
APPUNTI = ("M = ∫T dx", "Ra = ?", "σ = N/A + M/W", "HA + HB = 0", "C.S. = Sy/σid", "τ = T·S/(I·b)", "q·L²/8")


def _disegno_maschera(m: Image.Image) -> ImageDraw.ImageDraw:
    """Disegno sulla maschera senza antialiasing: i bordi sfumati sarebbero altre classi."""
    d = ImageDraw.Draw(m)
    d.fontmode = "1"
    return d


def _font(percorsi: List[str], dimensione: int) -> ImageFont.ImageFont:
    for p in percorsi:
        try:
            return ImageFont.truetype(p, dimensione)
        except OSError:
            continue
    return ImageFont.load_default(dimensione)


class _Pagina:
    def __init__(self, larghezza: int, altezza: int, stile: Stile, rng):
        self.img = Image.new("RGB", (larghezza, altezza), stile.colore_carta)
        self.d = ImageDraw.Draw(self.img)
        self.m = Image.new("L", (larghezza, altezza), 0)
        self.dm = _disegno_maschera(self.m)
        self.stile = stile
        self.rng = rng
        self.inchiostro = stile.colore_inchiostro

    def testo(self, xy: Tuple[float, float], t: str, dimensione: int, ancora: str = "la",
              grassetto: bool = False) -> None:
        font = _font(([p for p in self.stile.font_testo if "Bold" in p] if grassetto else [])
                     + self.stile.font_testo, dimensione)
        self.d.text(xy, t, fill=self.inchiostro, font=font, anchor=ancora)
        self.dm.text(xy, t, fill=TESTO, font=font, anchor=ancora)


def componi_pagina(sc: Scena, stile: Stile, rng: np.random.Generator,
                   sezione: Optional[bool] = None, appunti: Optional[bool] = None):
    # la figura si disegna senza quadretti: quelli sono della pagina, e
    # passano sotto il disegno senza doppioni sfasati
    figura, mfigura = rasterizza(sc, dataclasses.replace(stile, colore_quadretti=None), rng)
    W = max(int(rng.integers(1100, 1601)), figura.width + 160)
    H = int(W * 1.414)
    pg = _Pagina(W, H, stile, rng)
    if stile.colore_quadretti is not None:
        passo = sc.scala / 5
        for x in np.arange(float(rng.uniform(0, passo)), W, passo):
            pg.d.line([(x, 0), (x, H)], fill=stile.colore_quadretti, width=1)
        for y in np.arange(float(rng.uniform(0, passo)), H, passo):
            pg.d.line([(0, y), (W, y)], fill=stile.colore_quadretti, width=1)

    corpo = max(12, W // 48)
    y = int(rng.integers(50, 110))
    stampato = stile.nome == "stampato"
    if stampato and rng.random() < 0.75:
        titolo, corso = scegli(rng, INTESTAZIONI)
        pg.testo((W / 2, y), titolo, int(corpo * 1.3), "mm", grassetto=True)
        pg.testo((W / 2, y + corpo * 1.7), corso, corpo, "mm")
        pg.testo((W / 2, y + corpo * 3.2), f"{int(rng.integers(1, 29))} {scegli(rng, MESI)} {int(rng.integers(2015, 2025))}",
                 corpo, "mm")
        y += int(corpo * 4.5)
        if rng.random() < 0.4:
            for riga, (a, b) in enumerate((("Cognome:", "Matricola:"), ("Nome:", "Gruppo:"))):
                yy = y + riga * int(corpo * 2.2)
                pg.d.rectangle([W * 0.12, yy, W * 0.62, yy + corpo * 1.8], outline=pg.inchiostro, width=2)
                pg.d.rectangle([W * 0.64, yy, W * 0.88, yy + corpo * 1.8], outline=pg.inchiostro, width=2)
                pg.testo((W * 0.13, yy + corpo * 0.9), a, corpo, "lm")
                pg.testo((W * 0.65, yy + corpo * 0.9), b, corpo, "lm")
            y += int(corpo * 5)
    if rng.random() < 0.3:
        # banda grigia di oscuramento: sfondo per la maschera
        pg.d.rectangle([W * 0.1, y, W * 0.85, y + corpo * 3], fill=(205, 205, 205))
        y += int(corpo * 4)
    pg.testo((W * 0.08, y), f"Esercizio {int(rng.integers(1, 5))}", int(corpo * 1.1), "la", grassetto=True)
    y += int(corpo * 2)

    # ── la figura, e accanto (o sotto) la sezione trasversale ──
    con_sezione = bool(rng.random() < 0.25) if sezione is None else sezione
    largo_sezione = int(W * 0.25) if con_sezione else 0
    x_fig = int(rng.integers(int(W * 0.05), max(int(W * 0.05) + 1, W - figura.width - largo_sezione - int(W * 0.05))))
    y_fig = y
    pagina_reg = pg.img.crop((x_fig, y_fig, x_fig + figura.width, y_fig + figura.height))
    pg.img.paste(ImageChops.darker(pagina_reg, figura), (x_fig, y_fig))
    m = np.asarray(pg.m, dtype=np.uint8).copy()
    reg = m[y_fig:y_fig + figura.height, x_fig:x_fig + figura.width]
    m[y_fig:y_fig + figura.height, x_fig:x_fig + figura.width] = np.where(mfigura > 0, mfigura, reg)
    pg.m = Image.fromarray(m)
    pg.dm = _disegno_maschera(pg.m)
    if con_sezione:
        xs = min(W - largo_sezione, x_fig + figura.width + 20)
        _sezione(pg, xs, y_fig + figura.height * 0.2, largo_sezione * 0.8, corpo)

    # ── enunciato e dati ──
    y = y_fig + figura.height + corpo
    for frase in FRASI[int(rng.integers(0, 4)) * 2:][: int(rng.integers(3, 7))]:
        if y > H - 3 * corpo:
            break
        pg.testo((W * 0.08, y), frase, corpo)
        y += int(corpo * 1.5)
    if y < H - 3 * corpo:
        y += corpo
        dati = f"GRUPPO {scegli(rng, 'ABCD')}    L={int(rng.integers(5, 30)) * 100}mm    " \
               f"q={int(rng.integers(1, 20))}N/mm    d={int(rng.integers(20, 80))}mm"
        pg.testo((W * 0.08, y), dati, corpo, grassetto=True)

    # ── appunti a penna o matita: solo sullo sfondo della maschera ──
    if (rng.random() < 0.4) if appunti is None else appunti:
        _appunti(pg, x_fig, y_fig, figura.width, figura.height, corpo)

    x0, y0, x1, y1 = sc.riquadro
    info = {"spostamento": (float(x_fig), float(y_fig)),
            "riquadro": (x0 + x_fig, y0 + y_fig, x1 + x_fig, y1 + y_fig), "sezione": con_sezione}
    return pg.img, np.asarray(pg.m, dtype=np.uint8).copy(), info


def _sezione(pg: _Pagina, x: float, y: float, larghezza: float, corpo: int) -> None:
    """Sezione trasversale campita con le sue quote: 'altro disegno'."""
    rng = pg.rng
    b, h = larghezza, larghezza * float(rng.uniform(0.6, 1.1))
    forma = scegli(rng, ("rettangolo", "T", "doppiaT"))
    s = b * 0.18
    if forma == "rettangolo":
        poli = [(x, y), (x + b, y), (x + b, y + h), (x, y + h)]
    elif forma == "T":
        poli = [(x, y), (x + b, y), (x + b, y + s), (x + b / 2 + s / 2, y + s), (x + b / 2 + s / 2, y + h),
                (x + b / 2 - s / 2, y + h), (x + b / 2 - s / 2, y + s), (x, y + s)]
    else:
        poli = [(x, y), (x + b, y), (x + b, y + s), (x + b / 2 + s / 2, y + s), (x + b / 2 + s / 2, y + h - s),
                (x + b, y + h - s), (x + b, y + h), (x, y + h), (x, y + h - s), (x + b / 2 - s / 2, y + h - s),
                (x + b / 2 - s / 2, y + s), (x, y + s)]
    W, H = pg.img.size
    sagoma = Image.new("L", (W, H), 0)
    ImageDraw.Draw(sagoma).polygon(poli, fill=255)
    tratteggio = Image.new("L", (W, H), 0)
    dt = ImageDraw.Draw(tratteggio)
    for k in np.arange(-h, b, max(6.0, b / 14)):
        dt.line([(x + k, y + h), (x + k + h, y)], fill=255, width=1)
    dentro = ImageChops.multiply(sagoma, tratteggio)
    pg.img.paste(pg.inchiostro, mask=dentro)
    pg.m.paste(ALTRO, mask=dentro)
    pg.d.line(poli + [poli[0]], fill=pg.inchiostro, width=2)
    pg.dm.line(poli + [poli[0]], fill=ALTRO, width=2)
    yq = y + h + corpo
    pg.d.line([(x, yq), (x + b, yq)], fill=pg.inchiostro, width=1)
    pg.dm.line([(x, yq), (x + b, yq)], fill=ALTRO, width=1)
    pg.testo((x + b / 2, yq + corpo * 0.8), scegli(rng, ("B", "B1", "b")), corpo, "mm")
    pg.testo((x + b / 2, y - corpo), scegli(rng, ("SEZ G-G", "Sezione A-A", "")) or "Sez.", corpo, "mm")


def _appunti(pg: _Pagina, x_fig: int, y_fig: int, w: int, h: int, corpo: int) -> None:
    rng = pg.rng
    W, H = pg.img.size
    grigio = int(rng.integers(90, 150))
    colore = (grigio, grigio, grigio + 10)
    strato = Image.new("L", (W, H), 0)
    ds = ImageDraw.Draw(strato)
    font = _font(pg.stile.font_mano or pg.stile.font_testo, int(corpo * 1.2))
    for _ in range(int(rng.integers(1, 4))):
        if rng.random() < 0.3:
            xy = (x_fig + float(rng.uniform(0, w)), y_fig + float(rng.uniform(0, h)))
        else:
            xy = (float(rng.uniform(0.02, 0.3)) * W, y_fig + float(rng.uniform(0, h)))
        t = scegli(rng, APPUNTI)
        pg.d.text(xy, t, fill=colore, font=font)
        ds.text(xy, t, fill=255, font=font)
    if rng.random() < 0.5:
        # segni a matita sopra il disegno
        x, y = x_fig + float(rng.uniform(0.2, 0.8)) * w, y_fig + float(rng.uniform(0.2, 0.8)) * h
        punti = [(x + 40 * math.cos(a), y + 15 * math.sin(3 * a)) for a in np.linspace(0, 3, 12)]
        pg.d.line(punti, fill=colore, width=1)
        ds.line(punti, fill=255, width=1)
    m = np.asarray(pg.m, dtype=np.uint8).copy()
    m[(np.asarray(strato) > 0) & (m == 0)] = TESTO
    pg.m = Image.fromarray(m)
    pg.dm = _disegno_maschera(pg.m)

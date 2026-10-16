"""
STILI DI DISEGNO — come appare la stessa scena su fogli diversi.

  · 'stampato'  il foglio d'esame: tratti netti, aste più spesse delle quote,
                caratteri senza grazie (il caso principale);
  · 'mano'      tratti tremolanti con sbavature agli estremi, penna blu o
                nera, caratteri calligrafici;
  · 'quadretti' come 'mano', su carta a quadretti.

Gli spessori sono frazioni di L: si moltiplicano per la scala del disegno,
così una figura piccola non ha linee da pennarello. I font si cercano fra
quelli di sistema e non si distribuiscono: senza font si usa quello di
Pillow.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import List, Optional, Tuple

import numpy as np

from .strutture import scegli

CARTELLE_FONT = (
    "/System/Library/Fonts", "/System/Library/Fonts/Supplemental", "/Library/Fonts",
    "/usr/share/fonts", "/usr/local/share/fonts",
)
STAMPA = ("Arial", "Helvetica", "HelveticaNeue", "Arial Bold", "Arial Italic", "Verdana",
          "Tahoma", "Trebuchet MS", "DejaVuSans", "LiberationSans")
MANO = ("Bradley Hand Bold", "Noteworthy", "Chalkboard", "ChalkboardSE", "MarkerFelt",
        "Comic Sans MS", "Chalkduster")


def trova_font() -> Tuple[List[str], List[str]]:
    """Percorsi dei font di sistema disponibili: (da stampa, a mano)."""
    trovati = {}
    for cartella in CARTELLE_FONT:
        if not os.path.isdir(cartella):
            continue
        for radice, _, file in os.walk(cartella):
            for f in file:
                nome, est = os.path.splitext(f)
                if est.lower() in (".ttf", ".ttc", ".otf"):
                    trovati.setdefault(nome, os.path.join(radice, f))
    return ([trovati[n] for n in STAMPA if n in trovati], [trovati[n] for n in MANO if n in trovati])


_FONT_CACHE: Optional[Tuple[List[str], List[str]]] = None


def _font() -> Tuple[List[str], List[str]]:
    global _FONT_CACHE
    if _FONT_CACHE is None:
        _FONT_CACHE = trova_font()
    return _FONT_CACHE


@dataclass
class Stile:
    nome: str
    # spessori in frazioni di L
    asta: float
    simbolo: float
    sottile: float
    tremolio: float  # ampiezza del tremolio in frazioni di L (0 = stampato)
    colore_inchiostro: Tuple[int, int, int]
    colore_carta: Tuple[int, int, int]
    colore_quadretti: Optional[Tuple[int, int, int]] = None
    font_testo: List[str] = field(default_factory=list)
    font_mano: List[str] = field(default_factory=list)
    corpo_testo: float = 0.2  # altezza delle scritte in frazioni di L
    rulli: str = "cerchietti"  # cerchietti | linea
    incastro: str = "muro"  # muro | tratteggio
    quota: str = "frecce"  # frecce | trattini
    freccia_piena: bool = True
    # proporzioni dei simboli di vincolo: nei fogli veri cambiano parecchio
    # (una cerniera con un tratteggio lungo e rado è alta quanto un carrello)
    dim_vincolo: float = 1.0       # fattore sul triangolo
    tratteggio: float = 1.0        # fattore sulla lunghezza dei tratti del terreno
    base_terreno: float = 0.15     # mezza larghezza della linea del terreno, in L
    righe_tratteggio: int = 6
    verso_tratteggio: int = 1      # i tratti scendono a sinistra (1) o a destra (-1)


def _simboli(st: Stile, rng: np.random.Generator) -> Stile:
    st.dim_vincolo = float(rng.uniform(0.85, 1.45))
    st.tratteggio = float(rng.uniform(0.8, 2.8))
    st.base_terreno = float(rng.uniform(0.11, 0.24))
    st.righe_tratteggio = int(rng.integers(3, 8))
    st.verso_tratteggio = int(scegli(rng, (1, -1)))
    if st.nome == "stampato" and rng.random() < 0.25:
        # stampa chiara o fotocopia sbiadita: tratti grigi
        grigio = int(rng.integers(70, 125))
        st.colore_inchiostro = (grigio, grigio, grigio)
    return st


def scegli_stile(rng: np.random.Generator, nome: Optional[str] = None) -> Stile:
    nome = nome or scegli(rng, ("stampato", "stampato", "stampato", "mano", "quadretti"))
    stampa, mano = _font()
    if nome == "stampato":
        grigio = int(rng.integers(0, 40))
        return _simboli(Stile(
            nome=nome, asta=float(rng.uniform(0.022, 0.04)), simbolo=float(rng.uniform(0.012, 0.02)),
            sottile=float(rng.uniform(0.006, 0.01)), tremolio=0.0,
            colore_inchiostro=(grigio, grigio, grigio), colore_carta=(255, 255, 255),
            font_testo=list(stampa), font_mano=list(mano),
            corpo_testo=float(rng.uniform(0.16, 0.24)),
            rulli=scegli(rng, ("cerchietti", "cerchietti", "linea")),
            incastro=scegli(rng, ("muro", "tratteggio")),
            quota=scegli(rng, ("frecce", "frecce", "trattini")),
            freccia_piena=bool(rng.random() < 0.8),
        ), rng)
    inchiostro = scegli(rng, ((20, 30, 110), (25, 25, 30), (40, 40, 60)))
    carta = (int(rng.integers(240, 256)), int(rng.integers(240, 256)), int(rng.integers(230, 250)))
    return _simboli(Stile(
        nome=nome, asta=float(rng.uniform(0.022, 0.035)), simbolo=float(rng.uniform(0.014, 0.022)),
        sottile=float(rng.uniform(0.008, 0.012)), tremolio=float(rng.uniform(0.006, 0.015)),
        colore_inchiostro=inchiostro, colore_carta=carta,
        colore_quadretti=(int(rng.integers(150, 190)), int(rng.integers(185, 215)), 235) if nome == "quadretti" else None,
        font_testo=list(mano) or list(stampa), font_mano=list(mano),
        corpo_testo=float(rng.uniform(0.2, 0.28)),
        rulli="cerchietti", incastro="tratteggio",
        quota=scegli(rng, ("frecce", "trattini")), freccia_piena=False,
    ), rng)

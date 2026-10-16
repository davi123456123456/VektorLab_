"""
RASTERIZZAZIONE — la scena vettoriale diventa immagine e maschera.

Ogni elemento si disegna DUE volte con gli stessi punti: sull'immagine (a
risoluzione doppia, poi ridotta, per avere bordi morbidi) e sulla maschera
(a risoluzione piena, con l'id della classe). Il tremolio del disegno a mano
si calcola una volta sola e si applica a entrambe: la maschera segue il
tratto davvero disegnato.

Le classi si dipingono in ordine di priorità (spec §6): una linea d'asta che
passa sopra un richiamo resta asta, una scritta sopra tutto resta scritta.
"""

from __future__ import annotations

import math
from typing import Dict, List, Sequence, Tuple

import numpy as np
from PIL import Image, ImageDraw, ImageFont

from .scena import ALTRO, ASTA, AUSILIARIA, CARICO, SIMBOLO, TESTO, Elemento, Scena, punta_dell_arco, punti_dell_arco
from .stili import Stile

SS = 2  # sovracampionamento dell'immagine
PRIORITA = {ALTRO: 0, AUSILIARIA: 1, CARICO: 2, SIMBOLO: 3, ASTA: 4, TESTO: 5}
Punto = Tuple[float, float]


class _Tela:
    def __init__(self, sc: Scena, stile: Stile, rng: np.random.Generator):
        self.s = sc.scala
        self.stile = stile
        self.rng = rng
        self.img = Image.new("RGB", (sc.larghezza * SS, sc.altezza * SS), stile.colore_carta)
        self.di = ImageDraw.Draw(self.img)
        self.maschera = Image.new("L", (sc.larghezza, sc.altezza), 0)
        self.dm = ImageDraw.Draw(self.maschera)
        # senza antialiasing: sulla maschera i bordi sfumati delle lettere
        # diventerebbero valori intermedi, cioè altre classi
        self.dm.fontmode = "1"
        self._font: Dict[Tuple[str, int], ImageFont.ImageFont] = {}

    # ── primitive di disegno ──
    def larghezza(self, spessore: str) -> float:
        return {"asta": self.stile.asta, "simbolo": self.stile.simbolo,
                "sottile": self.stile.sottile}[spessore] * self.s

    def trema(self, punti: Sequence[Punto]) -> List[Punto]:
        """Tratto a mano: deviazione liscia perpendicolare, sbavatura agli estremi."""
        ampiezza = self.stile.tremolio * self.s
        if ampiezza <= 0 or len(punti) < 2:
            return list(punti)
        fuori: List[Punto] = []
        fase = float(self.rng.uniform(0, 2 * math.pi))
        # un'onda ogni 0.6–1.6 L di tratto percorso: la mano trema lungo la
        # strada fatta, non a ogni vertice del poligono che approssima un arco
        onda_l = float(self.rng.uniform(0.6, 1.6)) * self.s
        percorso = 0.0
        for k in range(len(punti) - 1):
            (ax, ay), (bx, by) = punti[k], punti[k + 1]
            l = math.hypot(bx - ax, by - ay)
            if l < 1e-9:
                continue
            ux, uy = (bx - ax) / l, (by - ay) / l
            n = max(1, int(l / (0.08 * self.s)) + 1)
            for i in range(n + (1 if k == len(punti) - 2 else 0)):
                t = i / n
                onda = ampiezza * math.sin(fase + 2 * math.pi * (percorso + t * l) / onda_l)
                fuori.append((ax + t * (bx - ax) - uy * onda, ay + t * (by - ay) + ux * onda))
            percorso += l
        if len(fuori) >= 2:
            for estremo, vicino in ((0, 1), (len(fuori) - 1, len(fuori) - 2)):
                (ex, ey), (vx, vy) = fuori[estremo], fuori[vicino]
                l = math.hypot(ex - vx, ey - vy) or 1.0
                sbava = float(self.rng.uniform(-0.3, 1.2)) * ampiezza
                fuori[estremo] = (ex + (ex - vx) / l * sbava, ey + (ey - vy) / l * sbava)
        return fuori

    def linea(self, punti: Sequence[Punto], spessore: str, classe: int) -> None:
        tratto = self.trema(punti)
        w = self.larghezza(spessore)
        self.di.line([(x * SS, y * SS) for x, y in tratto], fill=self.stile.colore_inchiostro,
                     width=max(1, round(w * SS)), joint="curve")
        self.dm.line(tratto, fill=classe, width=max(1, round(w)))

    def cerchio(self, c: Punto, r: float, spessore: str, classe: int) -> None:
        punti = [(c[0] + r * math.cos(t), c[1] + r * math.sin(t)) for t in np.linspace(0, 2 * math.pi, 33)]
        if self.stile.tremolio > 0:
            self.linea(punti, spessore, classe)
            return
        w = self.larghezza(spessore)
        self.di.ellipse([(c[0] - r) * SS, (c[1] - r) * SS, (c[0] + r) * SS, (c[1] + r) * SS],
                        outline=self.stile.colore_inchiostro, width=max(1, round(w * SS)))
        self.dm.ellipse([c[0] - r, c[1] - r, c[0] + r, c[1] + r], outline=classe, width=max(1, round(w)))

    def poligono(self, punti: Sequence[Punto], spessore: str, classe: int, pieno: bool = False) -> None:
        if pieno:
            self.di.polygon([(x * SS, y * SS) for x, y in punti], fill=self.stile.colore_inchiostro)
            self.dm.polygon(list(punti), fill=classe)
            return
        self.linea(list(punti) + [punti[0]], spessore, classe)

    def percorso_font(self, mano: bool) -> str:
        elenco = self.stile.font_mano if mano and self.stile.font_mano else self.stile.font_testo
        return elenco[int(self.rng.integers(len(elenco)))] if elenco else ""

    def font(self, percorso: str, dimensione: int) -> ImageFont.ImageFont:
        chiave = (percorso, dimensione)
        if chiave not in self._font:
            try:
                self._font[chiave] = (ImageFont.truetype(percorso, dimensione) if percorso
                                      else ImageFont.load_default(dimensione))
            except OSError:
                self._font[chiave] = ImageFont.load_default(dimensione)
        return self._font[chiave]

    def testo(self, centro: Punto, testo: str, classe: int) -> None:
        corpo = self.stile.corpo_testo * self.s
        # lo stesso font a due grandezze: la maschera è a risoluzione piena
        percorso = self.percorso_font(self.stile.nome != "stampato")
        f2 = self.font(percorso, max(6, round(corpo * SS)))
        f1 = self.font(percorso, max(4, round(corpo)))
        self.di.text((centro[0] * SS, centro[1] * SS), testo, fill=self.stile.colore_inchiostro, font=f2, anchor="mm")
        self.dm.text(centro, testo, fill=classe, font=f1, anchor="mm")


def rasterizza(sc: Scena, stile: Stile, rng: np.random.Generator) -> Tuple[Image.Image, np.ndarray]:
    t = _Tela(sc, stile, rng)
    if stile.colore_quadretti is not None:
        passo = sc.scala / 5
        scarto = float(rng.uniform(0, passo))
        for x in np.arange(scarto, sc.larghezza, passo):
            t.di.line([(x * SS, 0), (x * SS, sc.altezza * SS)], fill=stile.colore_quadretti, width=SS)
        for y in np.arange(scarto, sc.altezza, passo):
            t.di.line([(0, y * SS), (sc.larghezza * SS, y * SS)], fill=stile.colore_quadretti, width=SS)
    for e in sorted(sc.elementi, key=lambda x: PRIORITA.get(x.classe, 0)):
        _disegna(t, e)
    immagine = t.img.resize((sc.larghezza, sc.altezza), Image.LANCZOS)
    return immagine, np.asarray(t.maschera, dtype=np.uint8).copy()


# ═══════════════════════════════ ELEMENTI ═══════════════════════════════

def _disegna(t: _Tela, e: Elemento) -> None:
    if e.forma == "linea":
        t.linea(e.punti, e.spessore, e.classe)
    elif e.forma == "cerchio":
        t.cerchio(e.punti[0], e.raggio, e.spessore, e.classe)
    elif e.forma == "testo":
        t.testo(e.punti[0], e.testo, e.classe)
    elif e.forma == "freccia":
        _freccia(t, e.punti[0], e.punti[1], e.classe)
    elif e.forma == "quota":
        _quota(t, e.punti[0], e.punti[1], e.classe)
    elif e.forma == "arco":
        _arco(t, e)
    elif e.forma == "vincolo":
        _vincolo(t, e)


def _punta(t: _Tela, coda: Punto, punta: Punto, classe: int, piena: bool) -> None:
    l = math.hypot(punta[0] - coda[0], punta[1] - coda[1]) or 1.0
    ux, uy = (punta[0] - coda[0]) / l, (punta[1] - coda[1]) / l
    lung, larg = 0.08 * t.s, 0.035 * t.s
    base = (punta[0] - ux * lung, punta[1] - uy * lung)
    a = (base[0] - uy * larg, base[1] + ux * larg)
    b = (base[0] + uy * larg, base[1] - ux * larg)
    if piena:
        t.poligono([punta, a, b], "simbolo", classe, pieno=True)
    else:
        t.linea([a, punta, b], "simbolo", classe)


def _freccia(t: _Tela, coda: Punto, punta: Punto, classe: int) -> None:
    t.linea([coda, punta], "simbolo", classe)
    _punta(t, coda, punta, classe, t.stile.freccia_piena)


def _quota(t: _Tela, a: Punto, b: Punto, classe: int) -> None:
    t.linea([a, b], "sottile", classe)
    l = math.hypot(b[0] - a[0], b[1] - a[1]) or 1.0
    ux, uy = (b[0] - a[0]) / l, (b[1] - a[1]) / l
    if t.stile.quota == "frecce":
        for p, q in ((a, b), (b, a)):
            dentro = (p[0] + (q[0] - p[0]) / l * 0.08 * t.s, p[1] + (q[1] - p[1]) / l * 0.08 * t.s)
            _punta(t, dentro, p, classe, True)
    else:
        k = 0.04 * t.s
        for p in (a, b):
            t.linea([(p[0] - (ux - uy) * k, p[1] - (uy + ux) * k), (p[0] + (ux - uy) * k, p[1] + (uy + ux) * k)],
                    "sottile", classe)


def _arco(t: _Tela, e: Elemento) -> None:
    t.linea(punti_dell_arco(e.punti[0], e.raggio, e.angoli), "simbolo", e.classe)
    # il verso è quello visto sul foglio: gli angoli crescono in senso orario
    coda, punta = punta_dell_arco(e.punti[0], e.raggio, e.angoli, e.testo)
    _punta(t, coda, punta, e.classe, True)


def _vincolo(t: _Tela, e: Elemento) -> None:
    (ax, ay), alfa, s, tipo = e.punti[0], e.angolo, t.s, e.testo
    if tipo in ("doppioPendoloInterno", "pattinoInterno"):
        # l'angolo è la direzione dell'asta
        u = (math.cos(alfa), math.sin(alfa))
    else:
        u = (math.sin(alfa), -math.cos(alfa))  # puntamento, verso la struttura
    v = (-u[1], u[0])

    def P(du: float, dv: float) -> Punto:
        return (ax + (du * u[0] + dv * v[0]) * s, ay + (du * u[1] + dv * v[1]) * s)

    st = t.stile
    lu, lv = 0.06 * st.tratteggio, 0.05 * st.tratteggio * st.verso_tratteggio

    def terreno(du: float) -> None:
        b = st.base_terreno
        t.linea([P(du, -b), P(du, b)], "simbolo", SIMBOLO)
        for k in np.linspace(-0.8 * b, b, st.righe_tratteggio):
            t.linea([P(du, k), P(du - lu, k - lv)], "sottile", SIMBOLO)

    def cerchietto(du: float, dv: float, r: float) -> None:
        t.cerchio(P(du, dv), r * s, "simbolo", SIMBOLO)

    if tipo in ("triangolo", "triangoloRulli"):
        h, w = 0.16 * st.dim_vincolo, 0.1 * st.dim_vincolo
        t.poligono([P(0, 0), P(-h, -w), P(-h, w)], "simbolo", SIMBOLO)
        base = -h
        if tipo == "triangoloRulli":
            if t.stile.rulli == "cerchietti":
                r0 = 0.028
                cerchietto(base - r0, -0.045, r0)
                cerchietto(base - r0, 0.045, r0)
                base -= 2 * r0
            else:
                t.linea([P(base - 0.035, -w), P(base - 0.035, w)], "simbolo", SIMBOLO)
                base -= 0.035
        terreno(base)
    elif tipo == "incastro":
        t.linea([P(0, -0.15), P(0, 0.15)], "asta" if t.stile.incastro == "muro" else "simbolo", SIMBOLO)
        for k in np.linspace(-0.13, 0.15, st.righe_tratteggio):
            t.linea([P(0, k), P(-0.08 * st.tratteggio, k - 0.06 * st.tratteggio * st.verso_tratteggio)],
                    "sottile", SIMBOLO)
    elif tipo == "doppioPendolo":
        for dv in (-0.05, 0.05):
            t.linea([P(0, dv), P(-0.14, dv)], "simbolo", SIMBOLO)
            cerchietto(0, dv, 0.018)
            cerchietto(-0.14, dv, 0.018)
        terreno(-0.16)
    elif tipo == "pattino":
        t.poligono([P(0, -0.07), P(0, 0.07), P(-0.08, 0.07), P(-0.08, -0.07)], "simbolo", SIMBOLO)
        t.linea([P(-0.1, -0.15), P(-0.1, 0.15)], "simbolo", SIMBOLO)
        terreno(-0.12)
    elif tipo == "biella":
        t.linea([P(0, 0), P(-0.22, 0)], "simbolo", SIMBOLO)
        cerchietto(0, 0, 0.025)
        cerchietto(-0.22, 0, 0.025)
        terreno(-0.25)
    elif tipo == "doppioPendoloInterno":
        for du in (-0.06, 0.06):
            t.linea([P(du, -0.06), P(du, 0.06)], "simbolo", SIMBOLO)
        for dv in (-0.035, 0.035):
            t.linea([P(-0.06, dv), P(0.06, dv)], "simbolo", SIMBOLO)
            cerchietto(-0.045, dv, 0.012)
            cerchietto(0.045, dv, 0.012)
    elif tipo == "pattinoInterno":
        t.poligono([P(-0.07, -0.05), P(0.07, -0.05), P(0.07, 0.05), P(-0.07, 0.05)], "simbolo", SIMBOLO)
        t.linea([P(-0.03, -0.08), P(-0.03, 0.08)], "simbolo", SIMBOLO)

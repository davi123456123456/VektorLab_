"""
SCENA VETTORIALE — lo schema disegnato come su un foglio d'esame.

È il rovescio delle regole di lettura (spec §7): dove la lettura dice "un
pallino che interrompe la linea è una cerniera", il disegno mette il pallino
nel nodo e ferma le aste sul suo bordo. Una sola scena produce sia le
`Primitive` ideali sia, con uno stile, l'immagine e la maschera: per questo
etichette e pixel non possono divergere.

Coordinate in pixel con y verso il BASSO. Gli angoli delle primitive sono
nello stesso riferimento (y giù): per le frecce l'angolo della punta, per i
corpi di vincolo `α_giù = −α_VektorLab`. La conversione al contratto TS (y
su) la fa `campione.a_contratto`, una volta sola, negando y e angoli.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

import numpy as np

from .schema import Schema

SFONDO, ASTA, AUSILIARIA, CARICO, SIMBOLO, TESTO, ALTRO = 0, 1, 2, 3, 4, 5, 6

TIPO_CORPO = {
    "cerniera": "triangolo", "carrello": "triangoloRulli", "incastro": "incastro",
    "bipendolo": "doppioPendolo", "pattino": "pattino", "biella": "biella",
}
TIPO_INTERNO = {"bipendolo": "doppioPendoloInterno", "pattino": "pattinoInterno"}
MARGINE = 1.6  # L attorno alla struttura: appoggi, carichi, quote
EPS = 1e-9

Punto = Tuple[float, float]


@dataclass
class Elemento:
    classe: int
    forma: str  # linea | cerchio | arco | testo | vincolo | freccia | quota
    punti: List[Punto]
    raggio: float = 0.0
    spessore: str = "sottile"  # asta | simbolo | sottile
    pieno: bool = False
    testo: str = ""
    angolo: float = 0.0  # radianti, y giù (vincoli)
    angoli: Optional[Tuple[float, float]] = None  # archi: gradi come in PIL
    primitiva: Optional[dict] = None


@dataclass
class Scena:
    elementi: List[Elemento]
    larghezza: int
    altezza: int
    scala: float
    riquadro: Tuple[float, float, float, float]
    origine: Tuple[float, float] = (0.0, 0.0)  # (x, y) in L dell'angolo in alto a sinistra

    def px(self, x: float, y: float) -> Punto:
        return ((x - self.origine[0]) * self.scala, (self.origine[1] - y) * self.scala)


# ═══════════════════════════════ AIUTI ═══════════════════════════════

def _sub(a: Punto, b: Punto) -> Punto:
    return (a[0] - b[0], a[1] - b[1])


def _add(a: Punto, b: Punto, k: float = 1.0) -> Punto:
    return (a[0] + k * b[0], a[1] + k * b[1])


def _unit(v: Punto) -> Punto:
    n = math.hypot(*v)
    return (v[0] / n, v[1] / n) if n > EPS else (0.0, 0.0)


def _dir_px(theta_su_gradi: float) -> Punto:
    """Direzione di un carico (gradi, y su) come versore in pixel (y giù)."""
    t = math.radians(theta_su_gradi)
    return (math.cos(t), -math.sin(t))


def _puntamento_px(alfa_giu: float) -> Punto:
    """Versore di puntamento del vincolo in pixel: û = (−sin α, cos α) con y ribaltata."""
    return (math.sin(alfa_giu), -math.cos(alfa_giu))


def _pt(p: Punto) -> dict:
    return {"x": float(p[0]), "y": float(p[1])}


def formatta_l(v: float) -> str:
    n2 = round(v * 2)
    if abs(v * 2 - n2) > 1e-6:
        return f"{v:g}L"
    if n2 % 2 == 0:
        n = n2 // 2
        return "L" if n == 1 else f"{n}L"
    return "L/2" if n2 == 1 else f"{n2}L/2"


def formatta_coefficiente(c: float, simbolo: str) -> str:
    if abs(c - 1) < EPS:
        return simbolo
    if abs(c - 0.5) < EPS:
        return f"{simbolo}/2"
    return f"{c:g}{simbolo}"


# ═══════════════════════════════ COSTRUZIONE ═══════════════════════════════

def costruisci_scena(schema: Schema, rng: np.random.Generator, scala: float, stileQuote: str) -> Scena:
    xs = [x for x, _ in schema.nodi]
    ys = [y for _, y in schema.nodi]
    origine = (min(xs) - MARGINE, max(ys) + MARGINE)
    larghezza = int(math.ceil((max(xs) - min(xs) + 2 * MARGINE) * scala))
    altezza = int(math.ceil((max(ys) - min(ys) + 2 * MARGINE) * scala))
    sc = Scena([], larghezza, altezza, scala, (0, 0, larghezza, altezza), origine)
    r = 0.06 * scala
    el = sc.elementi

    nodi_px = [sc.px(x, y) for x, y in schema.nodi]
    estremi: List[List[Punto]] = [[nodi_px[i], nodi_px[j]] for i, j in schema.aste]
    al_nodo: Dict[int, List[int]] = {i: [] for i in range(len(schema.nodi))}
    for k, (i, j) in enumerate(schema.aste):
        al_nodo[i].append(k)
        al_nodo[j].append(k)

    def lato(k: int, nodo: int) -> int:
        return 0 if schema.aste[k][0] == nodo else 1

    def altro_capo(k: int, nodo: int) -> Punto:
        return nodi_px[schema.aste[k][1 - lato(k, nodo)]]

    def accorcia(k: int, nodo: int, di: float) -> None:
        estremi[k][lato(k, nodo)] = _add(nodi_px[nodo], _unit(_sub(altro_capo(k, nodo), nodi_px[nodo])), di)

    def pallino(c: Punto) -> None:
        el.append(Elemento(SIMBOLO, "cerchio", [c], raggio=r, spessore="simbolo",
                           primitiva={"genere": "pallino", "c": _pt(c), "r": r}))

    def corpo(tipo_schema: str, attacco: Punto, alfa_su_gradi: float, interno: Optional[str] = None,
              angolo_giu: Optional[float] = None) -> None:
        tipo = interno or TIPO_CORPO[tipo_schema]
        alfa = angolo_giu if angolo_giu is not None else -math.radians(alfa_su_gradi)
        el.append(Elemento(SIMBOLO, "vincolo", [attacco], raggio=r, spessore="simbolo", testo=tipo,
                           angolo=alfa, primitiva={"genere": "corpo", "tipo": tipo, "attacco": _pt(attacco),
                                                   "angolo": alfa}))

    sconnessioni = {c.nodo: c for c in schema.sconnessioni}
    vincoli_nodo = {v.nodo: v for v in schema.vincoli if v.nodo is not None}

    # ── nodi: sconnessioni e vincoli ──
    for n in range(len(schema.nodi)):
        P = nodi_px[n]
        c = sconnessioni.get(n)
        v = vincoli_nodo.get(n)
        u = _puntamento_px(-math.radians(v.angolo)) if v else (0.0, -1.0)
        if c is not None and c.tipo in TIPO_INTERNO:
            for k in al_nodo[n]:
                accorcia(k, n, 0.08 * scala)
            asse = math.atan2(*reversed(_sub(altro_capo(al_nodo[n][0], n), P)))
            corpo(c.tipo, P, 0, interno=TIPO_INTERNO[c.tipo], angolo_giu=asse)
        elif c is not None and c.svincolate is None:
            pallino(P)
            for k in al_nodo[n]:
                accorcia(k, n, r)
            if v:
                corpo(v.tipo, _add(P, u, -r), v.angolo)
        elif c is not None:
            saldate = [k for k in al_nodo[n] if k not in c.svincolate]
            d = _unit(_sub(altro_capo(saldate[0], n), P))
            normale = (-d[1], d[0])
            verso_svincolate = _unit(tuple(np.sum([_sub(altro_capo(k, n), P) for k in c.svincolate], axis=0)))
            segno = 1.0 if normale[0] * verso_svincolate[0] + normale[1] * verso_svincolate[1] >= 0 else -1.0
            C = _add(P, normale, segno * r)
            pallino(C)
            for k in c.svincolate:
                estremi[k][lato(k, n)] = _add(C, _unit(_sub(altro_capo(k, n), C)), r)
            if v:
                corpo(v.tipo, _add(P, u, -2 * r), v.angolo)
        elif v is not None:
            if v.tipo in ("cerniera", "carrello"):
                if len(al_nodo[n]) == 1 and rng.random() < 0.5:
                    pallino(P)
                    accorcia(al_nodo[n][0], n, r)
                    corpo(v.tipo, _add(P, u, -r), v.angolo)
                else:
                    pallino(_add(P, u, -r))
                    corpo(v.tipo, _add(P, u, -2 * r), v.angolo)
            else:
                corpo(v.tipo, P, v.angolo)

    # ── vincoli in campata: pallino tangente, la linea prosegue ──
    def lungo(k: int, s: float) -> Punto:
        a, b = nodi_px[schema.aste[k][0]], nodi_px[schema.aste[k][1]]
        return _add(a, _sub(b, a), s)

    for v in schema.vincoli:
        if v.asta is None:
            continue
        P = lungo(v.asta, v.s)
        u = _puntamento_px(-math.radians(v.angolo))
        pallino(_add(P, u, -r))
        corpo(v.tipo, _add(P, u, -2 * r), v.angolo)

    # ── aste ──
    for a, b in estremi:
        el.append(Elemento(ASTA, "linea", [a, b], spessore="asta",
                           primitiva={"genere": "asta", "a": _pt(a), "b": _pt(b), "spessore": 0.03 * scala}))

    _carichi(schema, sc, rng, lungo, nodi_px)
    _quote(schema, sc, rng, stileQuote)
    _distrattori(schema, sc, rng, nodi_px, estremi)
    sc.riquadro = _riquadro(sc)
    return sc


def _carichi(schema: Schema, sc: Scena, rng, lungo, nodi_px) -> None:
    el, s = sc.elementi, sc.scala

    def posizione(c) -> Punto:
        return nodi_px[c.nodo] if c.nodo is not None else lungo(c.asta, c.s)

    def freccia(coda: Punto, punta: Punto) -> None:
        d = _sub(punta, coda)
        el.append(Elemento(CARICO, "freccia", [coda, punta], spessore="simbolo", primitiva={
            "genere": "freccia", "punta": _pt(punta), "direzione": math.atan2(d[1], d[0]),
            "lunghezza": math.hypot(*d)}))

    def scritta(centro: Punto, famiglia: str, coeff: float) -> None:
        el.append(Elemento(TESTO, "testo", [centro], testo=formatta_coefficiente(coeff, famiglia),
                           primitiva={"genere": "scritta", "centro": _pt(centro),
                                      "valore": {"famiglia": famiglia, "coefficiente": coeff}}))

    for c in schema.carichi:
        if c.tipo == "distribuito":
            P1, P2 = lungo(c.asta, c.s1), lungo(c.asta, c.s2)
            d = _dir_px(c.direzione)
            n = int(min(9, max(3, round(4 * math.hypot(*_sub(P2, P1)) / s) + 1)))
            lung = float(rng.uniform(0.35, 0.55)) * s
            punte = rng.random() < 0.75
            lontani = []
            for t in np.linspace(0, 1, n):
                vicino = _add(P1, _sub(P2, P1), float(t))
                if punte:
                    coda = _add(vicino, d, -lung)
                    freccia(coda, vicino)
                    lontani.append(coda)
                else:
                    punta = _add(vicino, d, lung)
                    freccia(vicino, punta)
                    lontani.append(punta)
            if rng.random() < 0.6:
                el.append(Elemento(CARICO, "linea", [lontani[0], lontani[-1]]))
            fuori = (-d[0], -d[1]) if punte else d
            medio = ((lontani[0][0] + lontani[-1][0]) / 2, (lontani[0][1] + lontani[-1][1]) / 2)
            scritta(_add(medio, fuori, 0.22 * s), "q", c.coefficiente)
        elif c.tipo == "forza":
            P = posizione(c)
            d = _dir_px(c.direzione)
            lung = 0.5 * s
            if rng.random() < 0.7:
                coda, punta = _add(P, d, -lung), P
                lontano = coda
            else:
                coda, punta = P, _add(P, d, lung)
                lontano = punta
            freccia(coda, punta)
            scritta(_add(lontano, (-d[1], d[0]), 0.18 * s), "F", c.coefficiente)
        else:
            P = posizione(c)
            raggio = 0.25 * s
            inizio = float(rng.uniform(0, 360))
            verso = "antiorario" if c.verso == 1 else "orario"
            el.append(Elemento(CARICO, "arco", [P], raggio=raggio, spessore="simbolo", testo=verso,
                               angoli=(inizio, inizio + 270),
                               primitiva={"genere": "momento", "centro": _pt(P), "raggio": raggio, "verso": verso}))
            vuoto = math.radians(inizio - 45)
            scritta(_add(P, (math.cos(vuoto), math.sin(vuoto)), 1.5 * raggio), "M", c.coefficiente)


def _punti_notevoli(schema: Schema) -> List[Tuple[float, float]]:
    """Nodi, vincoli in campata, estremi dei distribuiti, punti dei carichi (in L)."""
    def lungo(k, s):
        (x0, y0), (x1, y1) = schema.nodi[schema.aste[k][0]], schema.nodi[schema.aste[k][1]]
        return (x0 + s * (x1 - x0), y0 + s * (y1 - y0))
    punti = list(schema.nodi)
    punti += [lungo(v.asta, v.s) for v in schema.vincoli if v.asta is not None]
    for c in schema.carichi:
        if c.tipo == "distribuito":
            punti += [lungo(c.asta, c.s1), lungo(c.asta, c.s2)]
        elif c.asta is not None:
            punti.append(lungo(c.asta, c.s))
    return [(round(x, 9), round(y, 9)) for x, y in punti]


def _quote(schema: Schema, sc: Scena, rng, stile: str) -> None:
    el, s = sc.elementi, sc.scala
    punti = _punti_notevoli(schema)
    inclinate = any(abs(schema.nodi[i][0] - schema.nodi[j][0]) > EPS and abs(schema.nodi[i][1] - schema.nodi[j][1]) > EPS
                    for i, j in schema.aste)

    def quota(a: Punto, b: Punto, valore: float, testo_in: Punto) -> None:
        el.append(Elemento(AUSILIARIA, "quota", [a, b]))
        el.append(Elemento(TESTO, "testo", [testo_in], testo=formatta_l(valore), primitiva={
            "genere": "scritta", "centro": _pt(testo_in), "valore": {"famiglia": "L", "valore": valore},
            "estremi": [_pt(a), _pt(b)]}))

    if stile == "accanto" and not inclinate:
        cx = sum(x for x, _ in schema.nodi) / len(schema.nodi)
        cy = sum(y for _, y in schema.nodi) / len(schema.nodi)
        for k, (i, j) in enumerate(schema.aste):
            (x0, y0), (x1, y1) = schema.nodi[i], schema.nodi[j]
            l = math.hypot(x1 - x0, y1 - y0)
            ts = sorted({0.0, 1.0} | {round(((x - x0) * (x1 - x0) + (y - y0) * (y1 - y0)) / l ** 2, 9)
                                      for x, y in punti
                                      if abs((x - x0) * (y1 - y0) - (y - y0) * (x1 - x0)) < 1e-7
                                      and 0 < ((x - x0) * (x1 - x0) + (y - y0) * (y1 - y0)) / l ** 2 < 1})
            n = (-(y1 - y0) / l, (x1 - x0) / l)
            mx, my = (x0 + x1) / 2, (y0 + y1) / 2
            if n[0] * (mx - cx) + n[1] * (my - cy) < 0:
                n = (-n[0], -n[1])
            for t0, t1 in zip(ts, ts[1:]):
                a = (x0 + t0 * (x1 - x0), y0 + t0 * (y1 - y0))
                b = (x0 + t1 * (x1 - x0), y0 + t1 * (y1 - y0))
                centro = ((a[0] + b[0]) / 2 + 0.22 * n[0], (a[1] + b[1]) / 2 + 0.22 * n[1])
                valore = round(l * (t1 - t0) * 2) / 2
                el.append(Elemento(TESTO, "testo", [sc.px(*centro)], testo=formatta_l(valore), primitiva={
                    "genere": "scritta", "centro": _pt(sc.px(*centro)),
                    "valore": {"famiglia": "L", "valore": valore},
                    "estremi": [_pt(sc.px(*a)), _pt(sc.px(*b))]}))
        return

    xs = sorted({x for x, _ in punti})
    ys = sorted({y for _, y in punti})
    ymin, ymax = min(y for _, y in punti), max(y for _, y in punti)
    xmin, xmax = min(xs), max(xs)
    if len(xs) >= 2:
        sotto = rng.random() < 0.7
        yq = ymin - 0.9 if sotto else ymax + 0.9
        for x in xs:
            colonna = [y for px_, y in punti if px_ == x]
            y_vicino = min(colonna) if sotto else max(colonna)
            el.append(Elemento(AUSILIARIA, "linea", [sc.px(x, yq + (-0.1 if sotto else 0.1)),
                                                     sc.px(x, y_vicino + (-0.15 if sotto else 0.15))]))
        for xa, xb in zip(xs, xs[1:]):
            testo = sc.px((xa + xb) / 2, yq + (-0.18 if sotto else 0.18))
            quota(sc.px(xa, yq), sc.px(xb, yq), round((xb - xa) * 2) / 2, testo)
    if len(ys) >= 2:
        sinistra = rng.random() < 0.5
        xq = xmin - 0.9 if sinistra else xmax + 0.9
        for y in ys:
            riga = [x for x, py in punti if py == y]
            x_vicino = min(riga) if sinistra else max(riga)
            el.append(Elemento(AUSILIARIA, "linea", [sc.px(xq + (-0.1 if sinistra else 0.1), y),
                                                     sc.px(x_vicino + (-0.15 if sinistra else 0.15), y)]))
        for ya, yb in zip(ys, ys[1:]):
            testo = sc.px(xq + (-0.25 if sinistra else 0.25), (ya + yb) / 2)
            quota(sc.px(xq, ya), sc.px(xq, yb), round((yb - ya) * 2) / 2, testo)


def _distrattori(schema: Schema, sc: Scena, rng, nodi_px, estremi) -> None:
    el, s = sc.elementi, sc.scala
    if rng.random() < 0.7:
        for k, P in enumerate(nodi_px):
            if k >= 26:
                break
            el.append(Elemento(TESTO, "testo", [_add(P, (-0.22 * s, -0.22 * s))], testo=chr(ord("A") + k)))
    for a, b in estremi:
        if rng.random() < 0.15:
            m = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
            d = _unit(_sub(b, a))
            n = (-d[1], d[0])
            el.append(Elemento(AUSILIARIA, "linea", [_add(m, n, -0.06 * s), _add(m, n, 0.06 * s)]))


def _riquadro(sc: Scena) -> Tuple[float, float, float, float]:
    xs, ys = [], []
    for e in sc.elementi:
        for x, y in e.punti:
            m = e.raggio + (0.15 * sc.scala if e.forma in ("testo", "vincolo") else 0)
            xs += [x - m, x + m]
            ys += [y - m, y + m]
    pad = 0.1 * sc.scala
    return (max(0.0, min(xs) - pad), max(0.0, min(ys) - pad),
            min(float(sc.larghezza), max(xs) + pad), min(float(sc.altezza), max(ys) + pad))


# ═══════════════════════════════ PRIMITIVE ═══════════════════════════════

def primitive_della_scena(sc: Scena) -> dict:
    """Le Primitive del contratto TS, ancora in pixel y giù."""
    p = {"larghezza": sc.larghezza, "altezza": sc.altezza, "aste": [], "pallini": [], "corpi": [],
         "frecce": [], "momenti": [], "nodi": [], "scritte": []}
    for e in sc.elementi:
        q = e.primitiva
        if q is None:
            continue
        g = q["genere"]
        if g == "asta":
            p["aste"].append({"a": q["a"], "b": q["b"], "spessore": q["spessore"], "confidenza": 1})
        elif g == "pallino":
            p["pallini"].append({"c": q["c"], "r": q["r"], "confidenza": 1})
        elif g == "corpo":
            p["corpi"].append({"tipo": q["tipo"], "attacco": q["attacco"], "angolo": q["angolo"], "confidenza": 1})
        elif g == "freccia":
            p["frecce"].append({"punta": q["punta"], "direzione": q["direzione"], "lunghezza": q["lunghezza"],
                                "confidenza": 1})
        elif g == "momento":
            p["momenti"].append({"centro": q["centro"], "raggio": q["raggio"], "verso": q["verso"], "confidenza": 1})
        elif g == "scritta":
            voce = {"centro": q["centro"], "valore": q["valore"], "confidenza": 1}
            if "estremi" in q:
                voce["estremi"] = q["estremi"]
            p["scritte"].append(voce)
    return p

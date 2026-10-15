"""
FAMIGLIE DI STRUTTURE CASUALI, come quelle dei fogli d'esame.

Ogni famiglia imita esercizi veri del banco di prova: trave continua
(01, 07, 09, 13, 16), mensola, portale (21), telaio a L, gradini (04),
anello chiuso (06, 10, 15), a T o ad H (03, 12, 08), aste a 45° (14, 23).
Non si cerca l'isostaticità: si cercano strutture DISEGNABILI con le
convenzioni dei fogli d'esame, cioè che la lettura di una foto possa
ricostruire senza ambiguità. Per questo:

  · i vincoli in campata sono solo cerniere e carrelli (col pallino);
  · una sconnessione parziale tiene saldate esattamente due aste allineate
    (la colonna dell'es. 20 in B, la trave dell'es. 08 in B);
  · doppio pendolo e pattino interni stanno fra due aste allineate.

Nodi su griglia L/2, y verso l'alto, angoli in gradi.
"""

from __future__ import annotations

import math
from typing import List, Optional, Sequence, Tuple

import numpy as np

from .schema import Carico, Schema, Sconnessione, Vincolo

FAMIGLIE: Tuple[str, ...] = ("trave", "mensola", "portale", "telaioL", "gradini", "anello", "T", "inclinata")

GRADI_VINCOLO = {"incastro": 3, "cerniera": 2, "bipendolo": 2, "pattino": 2, "carrello": 1, "biella": 1}
# puntamento dei vincoli: a terra il vertice guarda in alto, a soffitto in basso
A_TERRA, A_SOFFITTO, PARETE_SINISTRA, PARETE_DESTRA = 0, 180, 270, 90
COEFFICIENTI = (1, 1, 1, 1, 2, 2, 3, 0.5)
EPS = 1e-9


def scegli(rng: np.random.Generator, voci: Sequence, pesi: Optional[Sequence[float]] = None):
    """Scelta riproducibile da una sequenza qualsiasi (anche di tuple)."""
    if pesi is None:
        return voci[int(rng.integers(len(voci)))]
    p = np.asarray(pesi, dtype=float)
    return voci[int(rng.choice(len(voci), p=p / p.sum()))]


class _Costruttore:
    def __init__(self, famiglia: str):
        self.famiglia = famiglia
        self.nodi: List[Tuple[float, float]] = []
        self.aste: List[Tuple[int, int]] = []
        self.vincoli: List[Vincolo] = []
        self.sconnessioni: List[Sconnessione] = []
        self.carichi: List[Carico] = []

    # ── geometria ──
    def nodo(self, x: float, y: float) -> int:
        for i, (a, b) in enumerate(self.nodi):
            if abs(a - x) < EPS and abs(b - y) < EPS:
                return i
        self.nodi.append((float(x), float(y)))
        return len(self.nodi) - 1

    def asta(self, i: int, j: int) -> int:
        self.aste.append((i, j))
        return len(self.aste) - 1

    def catena(self, punti: Sequence[Tuple[float, float]]) -> List[int]:
        idx = [self.nodo(x, y) for x, y in punti]
        return [self.asta(idx[k], idx[k + 1]) for k in range(len(idx) - 1)]

    def dove(self, x: float, y: float):
        """('n', nodo) se il punto è un nodo, ('a', asta, s) se cade dentro un'asta."""
        for i, (a, b) in enumerate(self.nodi):
            if abs(a - x) < EPS and abs(b - y) < EPS:
                return ("n", i)
        for k, (i, j) in enumerate(self.aste):
            (x0, y0), (x1, y1) = self.nodi[i], self.nodi[j]
            l2 = (x1 - x0) ** 2 + (y1 - y0) ** 2
            s = ((x - x0) * (x1 - x0) + (y - y0) * (y1 - y0)) / l2
            croce = (x - x0) * (y1 - y0) - (y - y0) * (x1 - x0)
            if abs(croce) < EPS and EPS < s < 1 - EPS:
                return ("a", k, s)
        return None

    def grado(self, i: int) -> int:
        return sum(1 for a in self.aste if i in a)

    def occupato(self, posto) -> bool:
        for v in self.vincoli:
            if posto[0] == "n" and v.nodo == posto[1]:
                return True
            if posto[0] == "a" and v.asta == posto[1] and abs((v.s or 0) - posto[2]) < EPS:
                return True
        return False

    # ── vincoli e sconnessioni ──
    def vincolo(self, x: float, y: float, tipo: str, angolo: float) -> bool:
        posto = self.dove(x, y)
        if posto is None or self.occupato(posto):
            return False
        if posto[0] == "a" and tipo not in ("cerniera", "carrello"):
            return False
        if posto[0] == "n":
            self.vincoli.append(Vincolo(tipo=tipo, angolo=angolo, nodo=posto[1]))
        else:
            self.vincoli.append(Vincolo(tipo=tipo, angolo=angolo, asta=posto[1], s=round(posto[2], 9)))
        return True

    def sconnetti(self, i: int, tipo: str = "cerniera", svincolate: Optional[List[int]] = None) -> None:
        self.sconnessioni.append(Sconnessione(nodo=i, tipo=tipo, svincolate=svincolate))

    def schema(self) -> Schema:
        return Schema(self.famiglia, list(self.nodi), list(self.aste),
                      list(self.vincoli), list(self.sconnessioni), list(self.carichi))


def luce(rng: np.random.Generator, intere: bool = False) -> float:
    if intere:
        return float(scegli(rng, (1, 1, 1, 2, 2, 3)))
    return float(scegli(rng, (1, 1, 1, 1, 2, 0.5, 1.5)))


# ═══════════════════════════════ FAMIGLIE ═══════════════════════════════

def _trave(rng, c: _Costruttore) -> None:
    campate = [luce(rng) for _ in range(int(rng.integers(2, 5)))]
    sbalzo = rng.random() < 0.3
    xs = [0.0]
    for l in campate:
        xs.append(xs[-1] + l)
    interni = xs[1:-1]
    cerniere = [x for x in interni if rng.random() < 0.25]
    nodi_x = sorted({0.0, xs[-1], *cerniere})
    c.catena([(x, 0.0) for x in nodi_x])
    for x in cerniere:
        c.sconnetti(c.nodo(x, 0.0))
    sinistro = scegli(rng, ("incastro", "cerniera", "carrello"), (0.25, 0.45, 0.3))
    c.vincolo(0.0, 0.0, sinistro, PARETE_SINISTRA if sinistro == "incastro" else A_TERRA)
    for x in interni:
        if rng.random() < 0.65:
            c.vincolo(x, 0.0, scegli(rng, ("carrello", "cerniera"), (0.7, 0.3)), A_TERRA)
    if not sbalzo:
        destro = scegli(rng, ("carrello", "cerniera", "incastro"), (0.6, 0.25, 0.15))
        c.vincolo(xs[-1], 0.0, destro, PARETE_DESTRA if destro == "incastro" else A_TERRA)


def _mensola(rng, c: _Costruttore) -> None:
    l = float(scegli(rng, (1, 1.5, 2, 2, 3)))
    if rng.random() < 0.6:
        c.catena([(0.0, 0.0), (l, 0.0)])
        c.vincolo(0.0, 0.0, "incastro", PARETE_SINISTRA)
        if rng.random() < 0.3:
            c.vincolo(l, 0.0, "carrello", A_TERRA)
    else:
        c.catena([(0.0, 0.0), (0.0, l)])
        c.vincolo(0.0, 0.0, "incastro", A_TERRA)


def _portale(rng, c: _Costruttore) -> None:
    w = luce(rng, intere=True)
    h = float(scegli(rng, (1, 2, 2)))
    diagonale = rng.random() < 0.25
    colonna = [(0.0, 0.0), (0.0, h / 2), (0.0, h)] if diagonale else [(0.0, 0.0), (0.0, h)]
    c.catena(colonna)
    cerniera_in_mezzo = rng.random() < 0.4
    traverso = [(0.0, h), (w / 2, h), (w, h)] if cerniera_in_mezzo else [(0.0, h), (w, h)]
    c.catena(traverso)
    c.catena([(w, h), (w, 0.0)])
    if cerniera_in_mezzo:
        c.sconnetti(c.nodo(w / 2, h))
    if diagonale:
        p = c.nodo(0.0, h / 2)
        d = c.asta(p, c.nodo(w, 0.0))
        c.sconnetti(p, "cerniera", [d])
    if rng.random() < 0.25:
        # mensolina verticale sul traverso, come nell'es. 21
        xs = w / 2 if not cerniera_in_mezzo and (w / 2) * 2 == round(w) else None
        if xs is not None and c.dove(xs, h) is not None:
            posto = c.dove(xs, h)
            if posto[0] == "a":
                _spezza(c, posto[1], posto[2])
            c.catena([(xs, h), (xs, h + scegli(rng, (0.5, 1)))])
    coppia = scegli(rng, (("incastro", "incastro"), ("cerniera", "carrello"), ("cerniera", "cerniera"), ("incastro", "carrello")))
    c.vincolo(0.0, 0.0, coppia[0], A_TERRA)
    c.vincolo(w, 0.0, coppia[1], A_TERRA)


def _telaio_l(rng, c: _Costruttore) -> None:
    w = luce(rng, intere=True)
    h = float(scegli(rng, (1, 1.5, 2)))
    if w >= 2 and rng.random() < 0.4:
        c.catena([(0.0, 0.0), (0.0, h), (w / 2, h), (w, h)])
        c.sconnetti(c.nodo(w / 2, h))
    else:
        c.catena([(0.0, 0.0), (0.0, h), (w, h)])
    c.vincolo(0.0, 0.0, scegli(rng, ("incastro", "cerniera")), A_TERRA)
    fine = scegli(rng, (("carrello", A_TERRA), ("cerniera", A_TERRA), ("carrello", PARETE_DESTRA)))
    c.vincolo(w, h, fine[0], fine[1])


def _gradini(rng, c: _Costruttore) -> None:
    x, y = 0.0, 0.0
    punti = [(x, y)]
    verticale = True
    for _ in range(int(rng.integers(3, 6))):
        if verticale:
            y += scegli(rng, (-1, -0.5, 0.5, 1, 1))
        else:
            x += scegli(rng, (0.5, 1, 1, 2))
        punti.append((x, y))
        verticale = not verticale
    aste = c.catena(punti)
    # cerniera a metà del tratto orizzontale più lungo, se cade sulla griglia
    orizzontali = [k for k in aste if c.nodi[c.aste[k][0]][1] == c.nodi[c.aste[k][1]][1]]
    lunga = max(orizzontali, key=lambda k: abs(c.nodi[c.aste[k][1]][0] - c.nodi[c.aste[k][0]][0]))
    (x0, y0), (x1, _) = c.nodi[c.aste[lunga][0]], c.nodi[c.aste[lunga][1]]
    if (x1 - x0) in (1.0, 2.0) and rng.random() < 0.6:
        m = _spezza(c, lunga, 0.5)
        c.sconnetti(m)
    c.vincolo(*punti[0], scegli(rng, ("carrello", "cerniera")),
              scegli(rng, (PARETE_SINISTRA, A_TERRA if punti[1][1] > punti[0][1] else A_SOFFITTO)))
    ultimo, penultimo = punti[-1], punti[-2]
    if ultimo[0] == penultimo[0]:
        angolo = A_SOFFITTO if ultimo[1] > penultimo[1] else A_TERRA
    else:
        angolo = PARETE_DESTRA
    c.vincolo(*ultimo, "incastro", angolo)


def _anello(rng, c: _Costruttore) -> None:
    w = float(scegli(rng, (2, 3, 4)))
    h = float(scegli(rng, (1, 2)))
    lati = {
        "basso": [(0.0, 0.0), (w, 0.0)], "destra": [(w, 0.0), (w, h)],
        "alto": [(w, h), (0.0, h)], "sinistra": [(0.0, h), (0.0, 0.0)],
    }
    mezzi = {"basso": (w / 2, 0.0), "destra": (w, h / 2), "alto": (w / 2, h)}
    usati = [k for k in mezzi if rng.random() < 0.35 and _sulla_griglia(mezzi[k])]
    for nome, (a, b) in lati.items():
        c.catena([a, mezzi[nome], b] if nome in usati else [a, b])
    candidati = [(0.0, 0.0), (0.0, h), (w, h), (w, 0.0)] + [mezzi[k] for k in usati]
    for k in rng.permutation(len(candidati))[: int(rng.integers(1, 4))]:
        c.sconnetti(c.nodo(*candidati[int(k)]))
    if "alto" in usati and rng.random() < 0.3:
        m = c.nodo(*mezzi["alto"])
        c.sconnessioni = [x for x in c.sconnessioni if x.nodo != m]
        c.sconnetti(m, "bipendolo")
    xs = [x / 2 for x in range(1, int(w * 2))]
    a1, a2 = sorted(scegli(rng, [(p, q) for p in xs for q in xs if q - p >= 1]))
    c.vincolo(a1, 0.0, "carrello", A_TERRA)
    c.vincolo(a2, 0.0, "cerniera", A_TERRA)
    if rng.random() < 0.25:
        c.catena([(w, h), (w + 1, h)])


def _t(rng, c: _Costruttore) -> None:
    variante = scegli(rng, ("T", "H", "08"))
    if variante == "T":
        w = float(scegli(rng, (2, 3, 4)))
        xb = float(scegli(rng, [x for x in (1, 2, 3) if x < w]))
        c.catena([(0.0, 0.0), (xb, 0.0), (w, 0.0)])
        giu = rng.random() < 0.7
        h = float(scegli(rng, (1, 1.5, 2)))
        c.catena([(xb, 0.0), (xb, -h if giu else h)])
        c.vincolo(0.0, 0.0, scegli(rng, ("carrello", "cerniera")), A_TERRA)
        c.vincolo(w, 0.0, scegli(rng, ("incastro", "carrello")), PARETE_DESTRA if rng.random() < 0.5 else A_TERRA)
        if c.vincoli[-1].tipo == "carrello":
            c.vincoli[-1].angolo = A_TERRA
        c.vincolo(xb, -h if giu else h, "carrello", scegli(rng, (PARETE_DESTRA, PARETE_SINISTRA)))
    elif variante == "H":
        c.catena([(0.0, 0.0), (0.0, 1.0), (0.0, 2.0)])
        c.catena([(2.0, 2.0), (2.0, 1.0), (2.0, 0.0)])
        c.catena([(0.0, 1.0), (1.0, 1.0), (2.0, 1.0)])
        c.sconnetti(c.nodo(1.0, 1.0))
        c.vincolo(0.0, 2.0, "cerniera", A_SOFFITTO)
        c.vincolo(2.0, 2.0, "carrello", PARETE_DESTRA)
        c.vincolo(2.0, 0.0, "carrello", A_TERRA)
    else:
        # es. 08: trave continua, colonna incernierata accanto, telaio chiuso a destra
        a, b, e = c.nodo(0, 0), c.nodo(1, 0), c.nodo(2, 0)
        cc, d = c.nodo(1, 1), c.nodo(2, 1)
        c.asta(a, b)
        c.asta(b, e)
        bc = c.asta(b, cc)
        c.asta(cc, d)
        c.asta(d, e)
        c.sconnetti(b, "cerniera", [bc])
        c.sconnetti(d)
        c.sconnetti(e)
        c.vincolo(0.0, 0.0, "carrello", A_TERRA)
        c.vincolo(2.0, 0.0, "cerniera", A_TERRA)


def _inclinata(rng, c: _Costruttore) -> None:
    variante = scegli(rng, ("X", "zigzag", "falda"))
    if variante == "X":
        e = c.nodo(0.5, 0.5)
        for (x, y) in ((0, 1), (1, 1), (1, 0), (0, 0)):
            c.asta(c.nodo(x, y), e)
        c.sconnetti(e)
        for (x, y), ang in (((0, 1), A_SOFFITTO), ((1, 1), A_SOFFITTO), ((1, 0), A_TERRA), ((0, 0), A_TERRA)):
            c.vincolo(float(x), float(y), "cerniera", ang)
    elif variante == "zigzag":
        c.catena([(0.0, 3.0), (1.0, 2.0), (0.0, 1.0), (1.0, 0.0)])
        c.vincolo(0.0, 3.0, "cerniera", PARETE_SINISTRA)
        c.vincolo(1.0, 0.0, scegli(rng, ("carrello", "cerniera")), A_TERRA)
    else:
        l = float(scegli(rng, (1, 2)))
        c.catena([(0.0, 0.0), (l, l)])
        c.vincolo(0.0, 0.0, "cerniera", A_TERRA)
        c.vincolo(l, l, "carrello", A_TERRA)


COSTRUTTORI = {
    "trave": _trave, "mensola": _mensola, "portale": _portale, "telaioL": _telaio_l,
    "gradini": _gradini, "anello": _anello, "T": _t, "inclinata": _inclinata,
}


# ═══════════════════════════════ CARICHI ═══════════════════════════════

def _carichi(rng, c: _Costruttore) -> None:
    for _ in range(int(scegli(rng, (0, 1, 1, 2, 2, 3)))):
        tipo = scegli(rng, ("distribuito", "forza", "momento"), (0.45, 0.35, 0.2))
        coeff = float(scegli(rng, COEFFICIENTI))
        if tipo == "distribuito":
            k = int(rng.integers(len(c.aste)))
            if any(x.tipo == "distribuito" and x.asta == k for x in c.carichi):
                continue
            (x0, y0), (x1, y1) = c.nodi[c.aste[k][0]], c.nodi[c.aste[k][1]]
            if abs(y1 - y0) < EPS:
                direzione = scegli(rng, (-90, -90, -90, 90))
            elif abs(x1 - x0) < EPS:
                direzione = scegli(rng, (0, 180))
            else:
                direzione = -90
            s1, s2 = 0.0, 1.0
            if _sulla_griglia(((x0 + x1) / 2, (y0 + y1) / 2)) and rng.random() < 0.3:
                s1, s2 = scegli(rng, ((0.0, 0.5), (0.5, 1.0)))
            q = Carico(tipo="distribuito", coefficiente=coeff, direzione=float(direzione), asta=k, s1=s1, s2=s2)
            if any(x.tipo == "forza" and _sotto(c, _punto(c, x), q) for x in c.carichi):
                continue
            if not _blocco_disegnabile(c, q):
                continue
            c.carichi.append(q)
            continue
        posto = _posto_puntuale(rng, c)
        if posto is None:
            continue
        # due frecce nello stesso punto si sovrappongono, due archi vicini si
        # toccano e le loro scritte si confondono
        qui = _punto(c, Carico(tipo=tipo, coefficiente=coeff, **posto))
        if tipo == "forza" and any(x.tipo == "forza" and _punto(c, x) == qui for x in c.carichi):
            continue
        if tipo == "momento" and any(x.tipo == "momento" and math.dist(_punto(c, x), qui) < 0.75 for x in c.carichi):
            continue
        if tipo == "forza":
            # una forza non si disegna sopra un distribuito, né lungo l'asta che
            # la porta: sul foglio sarebbe una freccia che non si distingue
            prova = Carico(tipo="forza", coefficiente=coeff, **posto)
            if any(x.tipo == "distribuito" and _sotto(c, _punto(c, prova), x) for x in c.carichi):
                continue
            for _ in range(6):
                prova.direzione = float(scegli(rng, (-90, -90, 0, 180, 90, -45, -135)))
                if _disegnabile(c, prova):
                    c.carichi.append(prova)
                    break
        else:
            c.carichi.append(Carico(tipo="momento", coefficiente=coeff, verso=int(scegli(rng, (1, -1))), **posto))


def _posto_puntuale(rng, c: _Costruttore) -> Optional[dict]:
    liberi = [i for i in range(len(c.nodi)) if c.grado(i) == 1 and not c.occupato(("n", i))]
    if liberi and rng.random() < 0.5:
        return {"nodo": int(scegli(rng, liberi))}
    if rng.random() < 0.5:
        return {"nodo": int(rng.integers(len(c.nodi)))}
    k = int(rng.integers(len(c.aste)))
    (x0, y0), (x1, y1) = c.nodi[c.aste[k][0]], c.nodi[c.aste[k][1]]
    if not _sulla_griglia(((x0 + x1) / 2, (y0 + y1) / 2)):
        return None
    return {"asta": k, "s": 0.5}


def _punto(c: _Costruttore, x: Carico) -> Tuple[float, float]:
    if x.nodo is not None:
        return c.nodi[x.nodo]
    (x0, y0), (x1, y1) = c.nodi[c.aste[x.asta][0]], c.nodi[c.aste[x.asta][1]]
    return (x0 + x.s * (x1 - x0), y0 + x.s * (y1 - y0))


def _sotto(c: _Costruttore, p: Tuple[float, float], q: Carico) -> bool:
    """Il punto cade sulla retta dell'asta caricata, dentro il tratto del distribuito o a un suo capo."""
    (x0, y0), (x1, y1) = c.nodi[c.aste[q.asta][0]], c.nodi[c.aste[q.asta][1]]
    l2 = (x1 - x0) ** 2 + (y1 - y0) ** 2
    t = ((p[0] - x0) * (x1 - x0) + (p[1] - y0) * (y1 - y0)) / l2
    retta = abs((p[0] - x0) * (y1 - y0) - (p[1] - y0) * (x1 - x0)) < EPS
    return retta and q.s1 - EPS <= t <= q.s2 + EPS


def _blocco_disegnabile(c: _Costruttore, q: Carico) -> bool:
    """
    Almeno un lato dell'asta ha posto per le frecce del distribuito: nello
    zigzag di aste a 45° un carico verticale sull'asta di mezzo attraversa
    comunque un'altra asta, e sul foglio non si disegna.
    """
    (x0, y0), (x1, y1) = c.nodi[c.aste[q.asta][0]], c.nodi[c.aste[q.asta][1]]
    d = (math.cos(math.radians(q.direzione)), math.sin(math.radians(q.direzione)))
    altre = [(c.nodi[i], c.nodi[j]) for k, (i, j) in enumerate(c.aste) if k != q.asta]

    def libero(lato: float) -> bool:
        for t in np.linspace(q.s1 + 0.1 * (q.s2 - q.s1), q.s2 - 0.1 * (q.s2 - q.s1), 5):
            px, py = x0 + t * (x1 - x0), y0 + t * (y1 - y0)
            for k in (0.12, 0.22):
                p = (px + lato * k * d[0], py + lato * k * d[1])
                if any(_dist_segmento(p, a, b) < 0.1 for a, b in altre):
                    return False
        return True

    return libero(1.0) or libero(-1.0)


def _dist_segmento(p, a, b) -> float:
    dx, dy = b[0] - a[0], b[1] - a[1]
    l2 = dx * dx + dy * dy
    t = 0.0 if l2 < EPS else max(0.0, min(1.0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2))
    return math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy)


def _disegnabile(c: _Costruttore, f: Carico) -> bool:
    """La freccia ha almeno un lato libero da aste e dal corpo del vincolo."""
    d = (math.cos(math.radians(f.direzione)), math.sin(math.radians(f.direzione)))
    p = _punto(c, f)
    if f.asta is not None:
        (x0, y0), (x1, y1) = c.nodi[c.aste[f.asta][0]], c.nodi[c.aste[f.asta][1]]
        l = math.hypot(x1 - x0, y1 - y0)
        return abs(d[0] * (y1 - y0) - d[1] * (x1 - x0)) / l > math.sin(math.radians(30))
    uscite = []
    for i, j in c.aste:
        if f.nodo in (i, j):
            q = c.nodi[j if i == f.nodo else i]
            l = math.hypot(q[0] - p[0], q[1] - p[1])
            uscite.append(((q[0] - p[0]) / l, (q[1] - p[1]) / l))
    for v in c.vincoli:
        if v.nodo == f.nodo:
            # il corpo del vincolo sta dalla parte opposta al puntamento
            a = math.radians(v.angolo)
            uscite.append((math.sin(a), -math.cos(a)))
    libero = lambda v: all(v[0] * u[0] + v[1] * u[1] < math.cos(math.radians(30)) for u in uscite)  # noqa: E731
    return libero(d) or libero((-d[0], -d[1]))


# ═══════════════════════════════ AIUTI ═══════════════════════════════

def _spezza(c: _Costruttore, k: int, s: float) -> int:
    """Spezza l'asta k in un nodo nuovo all'ascissa s; restituisce il nodo."""
    i, j = c.aste[k]
    (x0, y0), (x1, y1) = c.nodi[i], c.nodi[j]
    m = c.nodo(x0 + s * (x1 - x0), y0 + s * (y1 - y0))
    c.aste[k] = (i, m)
    c.asta(m, j)
    return m


def _sulla_griglia(p: Tuple[float, float]) -> bool:
    return all(abs(v * 2 - round(v * 2)) < EPS for v in p)


def _garantisci_vincoli(c: _Costruttore) -> None:
    """Almeno tre gradi di vincolo: si promuovono i carrelli a cerniere."""
    for v in c.vincoli:
        if sum(GRADI_VINCOLO[x.tipo] for x in c.vincoli) >= 3:
            return
        if v.tipo == "carrello":
            v.tipo = "cerniera"
    if sum(GRADI_VINCOLO[x.tipo] for x in c.vincoli) < 3:
        for i in range(len(c.nodi)):
            if c.vincolo(*c.nodi[i], "incastro", A_TERRA):
                return


def _specchia(s: Schema) -> Schema:
    """Simmetria rispetto a una verticale: varietà gratis, stesse regole."""
    xmax = max(x for x, _ in s.nodi)
    s.nodi = [(xmax - x, y) for x, y in s.nodi]
    for v in s.vincoli:
        v.angolo = (360 - v.angolo) % 360
    for c in s.carichi:
        if c.direzione is not None:
            c.direzione = ((180 - c.direzione + 180) % 360) - 180
        if c.verso is not None:
            c.verso = -c.verso
    return s


def genera_schema(rng: np.random.Generator, famiglia: Optional[str] = None) -> Schema:
    famiglia = famiglia or scegli(rng, FAMIGLIE)
    c = _Costruttore(famiglia)
    COSTRUTTORI[famiglia](rng, c)
    _garantisci_vincoli(c)
    _carichi(rng, c)
    s = c.schema()
    if rng.random() < 0.5:
        s = _specchia(s)
    return s

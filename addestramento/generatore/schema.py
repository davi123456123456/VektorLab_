"""
SCHEMA — la struttura che il generatore disegna, in unità di L.

È il "modello atteso" di ogni campione: quello che la lettura della foto
dovrebbe restituire. Il formato JSON è condiviso con TypeScript
(`src/foto/schema.ts`), che lo converte in un `Progetto` di VektorLab con il
builder dell'app: il Python non conosce il formato `.vektor`, e così non c'è
un secondo posto dove tenerlo allineato.

Convenzioni: y verso l'alto, angoli in GRADI. Per i vincoli l'angolo è la
direzione di puntamento di VektorLab (0° = vertice in alto); per i carichi è
la direzione della punta. `svincolate: None` = sconnessione completa; un
elenco d'aste = sconnessione parziale, le altre aste del nodo restano saldate.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Optional, Tuple

TIPI_VINCOLO = ("incastro", "cerniera", "carrello", "bipendolo", "pattino", "biella")
TIPI_SCONNESSIONE = ("cerniera", "bipendolo", "pattino")


@dataclass
class Vincolo:
    tipo: str
    angolo: float
    nodo: Optional[int] = None
    asta: Optional[int] = None
    s: Optional[float] = None


@dataclass
class Sconnessione:
    nodo: int
    tipo: str
    svincolate: Optional[List[int]]


@dataclass
class Carico:
    tipo: str  # 'distribuito' | 'forza' | 'momento'
    coefficiente: float
    direzione: Optional[float] = None
    verso: Optional[int] = None
    nodo: Optional[int] = None
    asta: Optional[int] = None
    s: Optional[float] = None
    s1: Optional[float] = None
    s2: Optional[float] = None


@dataclass
class Schema:
    famiglia: str
    nodi: List[Tuple[float, float]]
    aste: List[Tuple[int, int]]
    vincoli: List[Vincolo] = field(default_factory=list)
    sconnessioni: List[Sconnessione] = field(default_factory=list)
    carichi: List[Carico] = field(default_factory=list)

    def a_json(self) -> dict:
        return {
            "famiglia": self.famiglia,
            "nodi": [[x, y] for x, y in self.nodi],
            "aste": [[i, j] for i, j in self.aste],
            "vincoli": [_senza_vuoti(v.__dict__, ("nodo", "asta", "s", "tipo", "angolo")) for v in self.vincoli],
            "sconnessioni": [
                {"nodo": c.nodo, "tipo": c.tipo, "svincolate": None if c.svincolate is None else list(c.svincolate)}
                for c in self.sconnessioni
            ],
            "carichi": [
                _senza_vuoti(c.__dict__, ("tipo", "nodo", "asta", "s", "s1", "s2", "direzione", "verso", "coefficiente"))
                for c in self.carichi
            ],
        }

    @staticmethod
    def da_json(d: dict) -> "Schema":
        return Schema(
            famiglia=d["famiglia"],
            nodi=[(float(x), float(y)) for x, y in d["nodi"]],
            aste=[(int(i), int(j)) for i, j in d["aste"]],
            vincoli=[Vincolo(**v) for v in d.get("vincoli", [])],
            sconnessioni=[Sconnessione(**c) for c in d.get("sconnessioni", [])],
            carichi=[Carico(**c) for c in d.get("carichi", [])],
        )


def _senza_vuoti(d: dict, ordine: Tuple[str, ...]) -> dict:
    """Le chiavi a None non si scrivono: il JSON resta leggibile a occhio."""
    return {k: d[k] for k in ordine if d.get(k) is not None}


def valida(s: Schema) -> List[str]:
    """Elenco dei problemi di riferimento: vuoto se lo schema è sano."""
    problemi: List[str] = []
    n, m = len(s.nodi), len(s.aste)
    nodo_ok = lambda i: i is not None and 0 <= i < n  # noqa: E731
    asta_ok = lambda k: k is not None and 0 <= k < m  # noqa: E731

    for k, (i, j) in enumerate(s.aste):
        if not (nodo_ok(i) and nodo_ok(j)):
            problemi.append(f"asta {k}: nodo inesistente")
        elif i == j:
            problemi.append(f"asta {k}: estremi coincidenti")
    for v in s.vincoli:
        if v.tipo not in TIPI_VINCOLO:
            problemi.append(f"vincolo: tipo {v.tipo} sconosciuto")
        if v.nodo is not None:
            if not nodo_ok(v.nodo):
                problemi.append(f"vincolo: nodo {v.nodo} inesistente")
        elif not asta_ok(v.asta):
            problemi.append(f"vincolo: asta {v.asta} inesistente")
        elif v.s is None or not 0 < v.s < 1:
            problemi.append(f"vincolo su asta {v.asta}: ascissa {v.s} fuori da (0, 1)")
    for c in s.sconnessioni:
        if not nodo_ok(c.nodo):
            problemi.append(f"sconnessione: nodo {c.nodo} inesistente")
        if c.tipo not in TIPI_SCONNESSIONE:
            problemi.append(f"sconnessione: tipo {c.tipo} sconosciuto")
        for k in c.svincolate or []:
            if not asta_ok(k):
                problemi.append(f"sconnessione: asta {k} inesistente")
    for c in s.carichi:
        if c.tipo == "distribuito":
            if not asta_ok(c.asta):
                problemi.append(f"distribuito: asta {c.asta} inesistente")
            elif c.s1 is None or c.s2 is None or not 0 <= c.s1 < c.s2 <= 1:
                problemi.append(f"distribuito: tratto {c.s1}–{c.s2} non valido")
        elif c.tipo in ("forza", "momento"):
            if c.nodo is not None:
                if not nodo_ok(c.nodo):
                    problemi.append(f"{c.tipo}: nodo {c.nodo} inesistente")
            elif not asta_ok(c.asta) or c.s is None or not 0 < c.s < 1:
                problemi.append(f"{c.tipo}: posizione non valida")
        else:
            problemi.append(f"carico: tipo {c.tipo} sconosciuto")
    return problemi

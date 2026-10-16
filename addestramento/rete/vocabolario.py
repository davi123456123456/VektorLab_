"""
VOCABOLARIO — che cosa c'è in ogni canale d'uscita della rete.

È il contratto con la decodifica della Fase 4: l'ordine dei canali non si
cambia senza cambiare anche `src/foto/` e `public/modelli/foto.json`.

Coordinate: le regressioni sono in pixel d'ingresso e negli angoli del
contratto di `src/foto/tipi.ts` (y verso l'alto, radianti).

Due grandezze sono ambigue di mezzo giro: l'asse di un vincolo interno (il
simbolo è lo stesso girato di 180°) e l'ordine dei due estremi di una quota.
Una regressione su un valore ambiguo impara la media, cioè niente: le si
porta in un semipiano fisso col confine a 22,5° (e 202,5°), lontano dalle
direzioni dei disegni (0°, 45°, 90°, 135°).

Il canale delle frecce contiene le punte di TUTTE le frecce, comprese
quelle degli archi dei momenti. La rete trova bene una punta e la sua
direzione, mentre il verso di un arco, guardato dal centro, non lo
distingue: i canali 16 e 17 si accendono insieme. La decodifica quindi:
fonde i canali 16 e 17 (massimo) per trovare i centri; prende la punta
del canale delle frecce più vicina al centro, fra 6 e 90 px d'ingresso;
stima il raggio come |punta − centro|; il verso è antiorario se
(punta − centro) × direzione > 0 (y su). Sulla validazione sintetica
questa regola dà il verso giusto nell'81 % dei momenti (91 % conoscendo
il raggio vero). Quella punta non è un carico: non diventa una Freccia.
"""

from __future__ import annotations

import math
from typing import Optional, Sequence, Tuple

# nell'ordine di `TipoCorpo` in src/foto/tipi.ts
TIPI_CORPO: Tuple[str, ...] = (
    "triangolo", "triangoloRulli", "incastro", "doppioPendolo",
    "pattino", "biella", "doppioPendoloInterno", "pattinoInterno",
)
INTERNI = frozenset({"doppioPendoloInterno", "pattinoInterno"})

SCRITTE: Tuple[Tuple[str, float], ...] = tuple(
    [("L", v) for v in (0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4)]
    + [(f, v) for f in ("q", "F", "M") for v in (1, 2, 3, 0.5)]
)
NOMI_SCRITTE = ("L/2", "L", "3L/2", "2L", "5L/2", "3L", "7L/2", "4L",
                "q", "2q", "3q", "q/2", "F", "2F", "3F", "F/2", "M", "2M", "3M", "M/2")

CLASSI = 7  # 0 sfondo, 1 asta, 2 ausiliaria, 3 carico, 4 simbolo, 5 testo, 6 altro
NOMI_CLASSI = ("sfondo", "asta", "ausiliaria", "carico", "simbolo", "testo", "altro")

PALLINO, RAGGIO = 0, 1
CORPO0 = 2
COS_CORPO, SIN_CORPO = 10, 11
FRECCIA, COS_FRECCIA, SIN_FRECCIA, LUNG_FRECCIA = 12, 13, 14, 15
MOMENTO0 = 16  # 16 antiorario, 17 orario
NODO = 18
SCRITTA0 = 19
QUOTA0 = 39    # dx1, dy1, dx2, dy2
CANALI = 43

MAPPE = [PALLINO] + list(range(CORPO0, CORPO0 + len(TIPI_CORPO))) + [FRECCIA, MOMENTO0, MOMENTO0 + 1, NODO] \
    + list(range(SCRITTA0, SCRITTA0 + len(SCRITTE)))
REGRESSIONI = [RAGGIO, COS_CORPO, SIN_CORPO, COS_FRECCIA, SIN_FRECCIA, LUNG_FRECCIA] + list(range(QUOTA0, QUOTA0 + 4))

SCALA_RAGGIO = 10.0
SCALA_LUNGHEZZA = 100.0
SCALA_QUOTA = 100.0
PASSO_SEG, PASSO_TESTA = 2, 4
SIGMA = 1.5  # delle gaussiane dei centri, in celle della testa

_CONFINE = math.pi / 8  # 22,5°


def semipiano(angolo: float) -> float:
    """L'angolo, o il suo opposto, in [-7π/8, π/8)."""
    a = (angolo - _CONFINE) % math.pi  # in [0, π)
    return a + _CONFINE - math.pi


def estremi_canonici(centro: dict, estremi: Sequence[dict]) -> Tuple[dict, dict]:
    """I due estremi di una quota in ordine fisso: la direzione dal primo al secondo sta nel semipiano."""
    e1, e2 = estremi
    d = math.atan2(e2["y"] - e1["y"], e2["x"] - e1["x"])
    return (e1, e2) if abs(semipiano(d) - d) < 1e-9 else (e2, e1)


def indice_scritta(valore: dict) -> Optional[int]:
    famiglia = valore.get("famiglia")
    numero = valore.get("valore", valore.get("coefficiente"))
    for k, (f, v) in enumerate(SCRITTE):
        if f == famiglia and numero is not None and abs(numero - v) < 1e-9:
            return k
    return None


def descrizione() -> dict:
    """Il contenuto di `foto.json`: come leggere le uscite della rete."""
    canali = []
    canali.append({"canale": PALLINO, "nome": "pallino", "genere": "mappa"})
    canali.append({"canale": RAGGIO, "nome": "raggio", "genere": "regressione", "scala": SCALA_RAGGIO})
    for k, t in enumerate(TIPI_CORPO):
        canali.append({"canale": CORPO0 + k, "nome": f"corpo:{t}", "genere": "mappa", "tipo": t})
    canali.append({"canale": COS_CORPO, "nome": "corpo:cos", "genere": "regressione", "scala": 1.0})
    canali.append({"canale": SIN_CORPO, "nome": "corpo:sin", "genere": "regressione", "scala": 1.0})
    canali.append({"canale": FRECCIA, "nome": "freccia", "genere": "mappa",
                   "nota": "punte di tutte le frecce, anche di quelle degli archi dei momenti"})
    canali.append({"canale": COS_FRECCIA, "nome": "freccia:cos", "genere": "regressione", "scala": 1.0})
    canali.append({"canale": SIN_FRECCIA, "nome": "freccia:sin", "genere": "regressione", "scala": 1.0})
    canali.append({"canale": LUNG_FRECCIA, "nome": "freccia:lunghezza", "genere": "regressione",
                   "scala": SCALA_LUNGHEZZA})
    nota = "i canali 16 e 17 non distinguono il verso: fonderli (massimo), il verso viene dalla punta"
    canali.append({"canale": MOMENTO0, "nome": "momento:antiorario", "genere": "mappa", "verso": "antiorario",
                   "nota": nota})
    canali.append({"canale": MOMENTO0 + 1, "nome": "momento:orario", "genere": "mappa", "verso": "orario",
                   "nota": nota})
    canali.append({"canale": NODO, "nome": "nodo", "genere": "mappa"})
    for k, (f, v) in enumerate(SCRITTE):
        voce = {"canale": SCRITTA0 + k, "nome": f"scritta:{NOMI_SCRITTE[k]}", "genere": "mappa", "famiglia": f}
        voce["valore" if f == "L" else "coefficiente"] = v
        canali.append(voce)
    for k, nome in enumerate(("dx1", "dy1", "dx2", "dy2")):
        canali.append({"canale": QUOTA0 + k, "nome": f"quota:{nome}", "genere": "regressione",
                       "scala": SCALA_QUOTA})
    assert [c["canale"] for c in canali] == list(range(CANALI))
    return {
        "versione": 1,
        "ingresso": {"canali": 1, "valori": "grigio in [0, 1], 1 = bianco", "multiplo": 32,
                     "grigio": "luminanza ITU-R 601 (PIL 'L'): 0.299 R + 0.587 G + 0.114 B, diviso 255",
                     "riempimento": "bianco (1) a destra e in basso fino a multipli di 32"},
        "passi": {"seg": PASSO_SEG, "testa": PASSO_TESTA},
        "classi": list(NOMI_CLASSI),
        "canali": canali,
        "centro_cella": "x = colonna·passo + (passo − 1)/2, y = riga·passo + (passo − 1)/2 (px, y giù)",
        "angoli": "radianti, y su; l'angolo dei corpi interni e la direzione dall'estremo 1 al 2 delle quote "
                  "sono nel semipiano [-7π/8, π/8)",
        "sigma": SIGMA,
        "momenti": {
            "centri": "massimo dei canali 16 e 17",
            "punta": "il picco del canale freccia più vicino al centro, fra 6 e 90 px d'ingresso; non è un carico",
            "raggio": "circa |punta − centro|",
            "verso": "antiorario se (punta − centro) × direzione > 0 (y su), altrimenti orario",
        },
    }

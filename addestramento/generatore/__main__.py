"""
Riga di comando del generatore.

    python -m generatore --n 50 --seme 1 --uscita esiti/prova [--solo-etichette] [--rumore 3]
                         [--modo foto|pagina|ritaglio] [--rari]
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from typing import List, Optional

from .campione import MODI, genera, scrivi
from .galleria import galleria


def _arrotonda(x):
    if isinstance(x, float):
        return round(x, 4)
    if isinstance(x, dict):
        return {k: _arrotonda(v) for k, v in x.items()}
    if isinstance(x, list):
        return [_arrotonda(v) for v in x]
    return x


def serializza(c: dict) -> str:
    """JSON compatto: le primitive in pixel si arrotondano, lo schema MAI (è il riferimento esatto)."""
    uscita = dict(c)
    uscita["primitive"] = _arrotonda(c["primitive"])
    return json.dumps(uscita, separators=(",", ":"), ensure_ascii=False)


def main(argv: Optional[List[str]] = None) -> None:
    a = argparse.ArgumentParser(prog="generatore")
    a.add_argument("--n", type=int, default=10)
    a.add_argument("--seme", type=int, default=1)
    a.add_argument("--uscita", type=Path, default=Path("esiti/prova"))
    a.add_argument("--solo-etichette", action="store_true")
    a.add_argument("--rumore", type=float, default=0.0)
    a.add_argument("--stile", choices=("stampato", "mano", "quadretti"), default=None)
    a.add_argument("--modo", choices=MODI, default="foto",
                   help="foto: il foglio intero; pagina e ritaglio: come li vede la rete (lato lungo 768)")
    a.add_argument("--rari", action="store_true", help="anche doppi pendoli, pattini e bielle")
    a.add_argument("--galleria", action="store_true")
    a.add_argument("--solo-json", action="store_true",
                   help="percorso completo (foglio e foto), ma su disco solo il JSON")
    arg = a.parse_args(argv)
    campioni = []
    for seme in range(arg.seme, arg.seme + arg.n):
        c = genera(seme, solo_etichette=arg.solo_etichette, rumore=arg.rumore, stile=arg.stile,
                   modo=arg.modo, rari=arg.rari)
        if arg.solo_json:
            c_scritto = {k: v for k, v in c.items() if k not in ("immagine", "maschera")}
        else:
            c_scritto = c
        scrivi(c_scritto, arg.uscita, f"{seme:05d}", serializza)
        if arg.galleria and not arg.solo_etichette:
            campioni.append(c)
    if campioni:
        galleria(campioni, arg.uscita / "galleria.png")


if __name__ == "__main__":
    main()

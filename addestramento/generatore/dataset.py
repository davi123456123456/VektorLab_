"""
DATASET — i campioni per la rete, scritti una volta su disco.

    python -m generatore.dataset --uscita esiti/dati --ritagli 8000 --pagine 2000 \\
        --val-ritagli 500 --val-pagine 200 --processi 6

Quattro cartelle: `addestramento/ritagli`, `addestramento/pagine`,
`validazione/ritagli`, `validazione/pagine`. Semi d'addestramento da 1, di
validazione da 1 000 001; le pagine proseguono dopo i ritagli, così nessuno
schema compare due volte. Tutti gli schemi usano anche i vincoli rari.

Per ogni campione `NNNNNNN.png` (grigio), `NNNNNNN-maschera.png`,
`NNNNNNN.json` (primitive, schema, meta); il JSON si scrive per ultimo ed è
il segno che il campione è completo. Una nuova esecuzione salta i campioni
completi: si riprende da dove ci si era fermati. Alla fine ogni cartella ha
il suo `indice.json`.
"""

from __future__ import annotations

import argparse
import json
import os
from multiprocessing import Pool
from pathlib import Path
from typing import List, Optional, Tuple

from PIL import Image

from .__main__ import serializza
from .campione import genera

VALIDAZIONE = 1_000_001


def _nome(seme: int) -> str:
    return f"{seme:07d}"


def _completo(cartella: Path, seme: int) -> bool:
    n = _nome(seme)
    return all((cartella / f).exists() for f in (f"{n}.png", f"{n}-maschera.png", f"{n}.json"))


def _scrivi(lavoro: Tuple[str, str, int]) -> int:
    cartella, modo, seme = Path(lavoro[0]), lavoro[1], lavoro[2]
    c = genera(seme, solo_etichette=False, modo=modo, rari=True)
    n = _nome(seme)
    c["immagine"].convert("L").save(cartella / f"{n}.png")
    Image.fromarray(c["maschera"]).save(cartella / f"{n}-maschera.png")
    dati = {k: v for k, v in c.items() if k not in ("immagine", "maschera")}
    provvisorio = cartella / f"{n}.json.tmp"
    provvisorio.write_text(serializza(dati) + "\n", encoding="utf-8")
    os.replace(provvisorio, cartella / f"{n}.json")
    return seme


def _indice(cartella: Path, modo: str, semi: range) -> None:
    campioni = []
    for seme in semi:
        j = json.loads((cartella / f"{_nome(seme)}.json").read_text(encoding="utf-8"))
        campioni.append({"nome": _nome(seme), "seme": seme, "famiglia": j["meta"]["famiglia"],
                         "larghezza": j["primitive"]["larghezza"], "altezza": j["primitive"]["altezza"]})
    (cartella / "indice.json").write_text(
        json.dumps({"modo": modo, "campioni": campioni}, ensure_ascii=False, indent=0) + "\n", encoding="utf-8")


def main(argv: Optional[List[str]] = None) -> None:
    a = argparse.ArgumentParser(prog="generatore.dataset")
    a.add_argument("--uscita", type=Path, default=Path("esiti/dati"))
    a.add_argument("--ritagli", type=int, default=8000)
    a.add_argument("--pagine", type=int, default=2000)
    a.add_argument("--val-ritagli", type=int, default=500)
    a.add_argument("--val-pagine", type=int, default=200)
    a.add_argument("--processi", type=int, default=max(1, (os.cpu_count() or 2) - 2))
    arg = a.parse_args(argv)

    parti = []
    for parte, primo, n_ritagli, n_pagine in (("addestramento", 1, arg.ritagli, arg.pagine),
                                              ("validazione", VALIDAZIONE, arg.val_ritagli, arg.val_pagine)):
        parti.append((arg.uscita / parte / "ritagli", "ritaglio", range(primo, primo + n_ritagli)))
        parti.append((arg.uscita / parte / "pagine", "pagina",
                      range(primo + n_ritagli, primo + n_ritagli + n_pagine)))

    lavori = []
    for cartella, modo, semi in parti:
        cartella.mkdir(parents=True, exist_ok=True)
        lavori += [(str(cartella), modo, s) for s in semi if not _completo(cartella, s)]
    totale = len(lavori)
    if totale:
        print(f"{totale} campioni da generare con {arg.processi} processi", flush=True)
        fatti = 0
        with Pool(arg.processi) as pool:
            for _ in pool.imap_unordered(_scrivi, lavori, chunksize=4):
                fatti += 1
                if fatti % 200 == 0 or fatti == totale:
                    print(f"  {fatti}/{totale}", flush=True)
    for cartella, modo, semi in parti:
        _indice(cartella, modo, semi)


if __name__ == "__main__":
    main()

"""
GRIGI — immagini in PGM (P5) per gli strumenti in Node, che non sanno
leggere PNG né WebP.

    python -m rete.grigi --foto ../dati-foto/foto --uscita CARTELLA
    python -m rete.grigi --sintetici 50 --seme 3000001 --uscita CARTELLA

Il grigio è quello di PIL `L` (ITU-R 601), lo stesso della rete. Con
`--sintetici` ogni foto (`modo='foto'`, vincoli rari) porta il suo JSON con
primitive, schema e riquadro. La cartella d'uscita è temporanea: la
cancella chi la usa.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import List, Optional

from PIL import Image

ESTENSIONI = (".png", ".jpg", ".jpeg", ".webp")


def pgm(img: Image.Image) -> bytes:
    g = img.convert("L")
    return f"P5\n{g.width} {g.height}\n255\n".encode() + g.tobytes()


def main(argv: Optional[List[str]] = None) -> None:
    a = argparse.ArgumentParser(prog="rete.grigi")
    a.add_argument("--uscita", type=Path, required=True)
    a.add_argument("--foto", type=Path)
    a.add_argument("--sintetici", type=int, default=0)
    a.add_argument("--seme", type=int, default=3_000_001)
    arg = a.parse_args(argv)
    arg.uscita.mkdir(parents=True, exist_ok=True)
    if arg.foto:
        for f in sorted(p for p in arg.foto.iterdir() if p.suffix.lower() in ESTENSIONI):
            (arg.uscita / f"{f.stem}.pgm").write_bytes(pgm(Image.open(f)))
    if arg.sintetici:
        from generatore.__main__ import serializza
        from generatore.campione import genera
        for seme in range(arg.seme, arg.seme + arg.sintetici):
            c = genera(seme, solo_etichette=False, modo="foto", rari=True)
            (arg.uscita / f"{seme:07d}.pgm").write_bytes(pgm(c["immagine"]))
            dati = {"primitive": c["primitive"], "schema": c["schema"], "riquadro": c["meta"]["riquadro"]}
            (arg.uscita / f"{seme:07d}.json").write_text(serializza(dati) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()

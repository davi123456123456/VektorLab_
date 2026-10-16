"""
GUARDA — la rete sulle foto vere, da guardare a occhio.

    python -m rete.guarda --pesi esiti/rete/migliore.pt
        [--foto ../dati-foto/foto] [--riquadri ../dati-foto/riquadri.json] [--uscita ../dati-foto/esiti-rete]

Per ogni foto due passate, come farà l'app:

  · pagina: l'immagine intera con il lato lungo a 1024 px;
  · ritaglio: il riquadro della figura (scritto a mano in `riquadri.json`)
    allargato del 15 %, con il lato lungo a 768 px.

Per ciascuna una sovrapposizione: i colori della segmentazione e i picchi
col loro significato (tipo di vincolo e puntamento, frecce, versi dei
momenti, valori delle scritte, estremi delle quote). Le uscite restano in
`dati-foto/`, fuori da git come le foto.
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
from typing import Dict, Tuple

import numpy as np
import torch
from PIL import Image, ImageDraw, ImageFont

from . import dispositivo as scegli_dispositivo
from . import vocabolario as V
from .bersagli import centro_cella, estrai_picchi
from .metriche import GRUPPI
from .modello import Rete

COLORI = {1: (220, 30, 30), 2: (150, 150, 150), 3: (30, 160, 60), 4: (40, 90, 230), 5: (240, 140, 0), 6: (160, 60, 200)}
SIGLE = {"triangolo": "cer", "triangoloRulli": "car", "incastro": "inc", "doppioPendolo": "dp", "pattino": "pat",
         "biella": "bie", "doppioPendoloInterno": "dpi", "pattinoInterno": "pai"}
SOGLIA = 0.3
MARGINE = 0.15


def prepara(img: Image.Image, lato: int) -> Tuple[torch.Tensor, float]:
    """Grigio, lato lungo a `lato`, completato di bianco fino a multipli di 32."""
    scala = lato / max(img.size)
    w, h = round(img.width * scala), round(img.height * scala)
    g = np.asarray(img.convert("L").resize((w, h), Image.BILINEAR), dtype=np.float32) / 255
    W, H = -(-w // 32) * 32, -(-h // 32) * 32
    x = np.ones((H, W), dtype=np.float32)
    x[:h, :w] = g
    return torch.from_numpy(x)[None, None], scala


def _disegna(img: Image.Image, seg: np.ndarray, testa: np.ndarray) -> Tuple[Image.Image, Dict[str, int]]:
    base = img.convert("RGB")
    colori = np.zeros((*seg.shape, 3), dtype=np.uint8)
    alfa = np.zeros(seg.shape, dtype=np.uint8)
    for c, rgb in COLORI.items():
        colori[seg == c] = rgb
        alfa[seg == c] = 110
    strato = Image.fromarray(colori).resize((seg.shape[1] * 2, seg.shape[0] * 2), Image.NEAREST)
    maschera = Image.fromarray(alfa).resize(strato.size, Image.NEAREST)
    base.paste(strato.crop((0, 0, *base.size)), (0, 0), maschera.crop((0, 0, *base.size)))
    d = ImageDraw.Draw(base)
    font = ImageFont.load_default(size=13)
    conti: Dict[str, int] = {}

    def picchi(k):
        return estrai_picchi(testa[k], SOGLIA)

    for g, canali in GRUPPI.items():
        conti[g] = sum(len(picchi(k)) for k in canali)
    for i, j, _ in picchi(V.NODO):
        x, y = centro_cella(i, j)
        d.ellipse((x - 3, y - 3, x + 3, y + 3), fill=(0, 0, 0))
    for i, j, _ in picchi(V.PALLINO):
        x, y = centro_cella(i, j)
        r = max(3.0, testa[V.RAGGIO, i, j] * V.SCALA_RAGGIO)
        d.ellipse((x - r, y - r, x + r, y + r), outline=(0, 60, 255), width=2)
    for t, tipo in enumerate(V.TIPI_CORPO):
        for i, j, _ in picchi(V.CORPO0 + t):
            x, y = centro_cella(i, j)
            a = math.atan2(testa[V.SIN_CORPO, i, j], testa[V.COS_CORPO, i, j])
            d.line((x, y, x - 22 * math.sin(a), y - 22 * math.cos(a)), fill=(0, 0, 160), width=2)
            d.rectangle((x - 4, y - 4, x + 4, y + 4), outline=(0, 0, 160), width=2)
            d.text((x + 6, y + 4), SIGLE[tipo], fill=(0, 0, 160), font=font)
    for i, j, _ in picchi(V.FRECCIA):
        x, y = centro_cella(i, j)
        a = math.atan2(testa[V.SIN_FRECCIA, i, j], testa[V.COS_FRECCIA, i, j])
        lung = max(8.0, testa[V.LUNG_FRECCIA, i, j] * V.SCALA_LUNGHEZZA)
        d.line((x, y, x - lung * math.cos(a), y + lung * math.sin(a)), fill=(0, 140, 40), width=2)
        d.ellipse((x - 3, y - 3, x + 3, y + 3), fill=(0, 140, 40))
    for v, segno in ((0, "M+"), (1, "M-")):  # + antiorario, - orario
        for i, j, _ in picchi(V.MOMENTO0 + v):
            x, y = centro_cella(i, j)
            d.text((x - 8, y - 8), segno, fill=(200, 0, 120), font=font)
    for k, nome in enumerate(V.NOMI_SCRITTE):
        for i, j, _ in picchi(V.SCRITTA0 + k):
            x, y = centro_cella(i, j)
            if k < 8:
                dx1, dy1, dx2, dy2 = testa[V.QUOTA0:V.QUOTA0 + 4, i, j] * V.SCALA_QUOTA
                for dx, dy in ((dx1, dy1), (dx2, dy2)):
                    d.line((x, y, x + dx, y - dy), fill=(240, 140, 0), width=1)
            d.text((x + 4, y - 14), nome, fill=(190, 90, 0), font=font)
    return base, conti


@torch.no_grad()
def _passata(rete: Rete, img: Image.Image, lato: int, dev: torch.device):
    x, scala = prepara(img, lato)
    seg, testa = rete.predici(x.to(dev))
    seg = seg[0].argmax(0).cpu().numpy()
    testa = testa[0].cpu().numpy()
    ridotta = img.convert("RGB").resize((round(img.width * scala), round(img.height * scala)), Image.BILINEAR)
    return _disegna(ridotta, seg, testa)


def main(argv=None) -> None:
    a = argparse.ArgumentParser(prog="rete.guarda")
    a.add_argument("--pesi", type=Path, required=True)
    a.add_argument("--foto", type=Path, default=Path("../dati-foto/foto"))
    a.add_argument("--riquadri", type=Path, default=Path("../dati-foto/riquadri.json"))
    a.add_argument("--uscita", type=Path, default=Path("../dati-foto/esiti-rete"))
    a.add_argument("--dispositivo", default="auto")
    arg = a.parse_args(argv)

    dev = scegli_dispositivo(arg.dispositivo)
    stato = torch.load(arg.pesi, map_location="cpu", weights_only=False)
    rete = Rete()
    rete.load_state_dict(stato["modello"] if "modello" in stato else stato)
    rete.to(dev).eval()
    riquadri = json.loads(arg.riquadri.read_text())["riquadri"]
    arg.uscita.mkdir(parents=True, exist_ok=True)
    riepilogo = {}
    for f in sorted(p for p in arg.foto.iterdir() if p.suffix.lower() in (".png", ".jpg", ".jpeg", ".webp")):
        img = Image.open(f).convert("RGB")
        pagina, conti_pagina = _passata(rete, img, 1024, dev)
        pagina.save(arg.uscita / f"{f.stem}-pagina.png")
        x0, y0, x1, y1 = riquadri.get(f.stem, [0, 0, img.width, img.height])
        m = MARGINE * max(x1 - x0, y1 - y0)
        cx0, cy0, cx1, cy1 = round(x0 - m), round(y0 - m), round(x1 + m), round(y1 + m)
        # dove il riquadro allargato sporge dalla foto, bianco
        pezzo = Image.new("RGB", (cx1 - cx0, cy1 - cy0), "white")
        a0, b0, a1, b1 = max(0, cx0), max(0, cy0), min(img.width, cx1), min(img.height, cy1)
        pezzo.paste(img.crop((a0, b0, a1, b1)), (a0 - cx0, b0 - cy0))
        ritaglio, conti_ritaglio = _passata(rete, pezzo, 768, dev)
        ritaglio.save(arg.uscita / f"{f.stem}-ritaglio.png")
        riepilogo[f.stem] = {"pagina": conti_pagina, "ritaglio": conti_ritaglio}
        print(f.stem, conti_ritaglio, flush=True)
    (arg.uscita / "riepilogo.json").write_text(json.dumps(riepilogo, indent=1) + "\n")


if __name__ == "__main__":
    main()

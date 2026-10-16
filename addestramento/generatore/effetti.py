"""
EFFETTI FOTO — il foglio fotografato col telefono.

Due famiglie di effetti, trattate in modo diverso:

  · GEOMETRICI (prospettiva, rotazione, piega del foglio): spostano i pixel,
    quindi si applicano con la STESSA mappa a immagine, maschera e primitive.
    L'immagine e la maschera si campionano all'indietro (per ogni pixel
    d'uscita, da dove viene), i punti delle primitive si mandano in avanti;
    `indietro(avanti(p)) = p` è ciò che tiene allineate etichette e pixel;
  · FOTOMETRICI (ombra, dominante di colore, sfocatura, rumore, JPEG): non
    spostano niente e non toccano maschera né primitive.

La piega è uno spostamento verticale che dipende solo da x (una piega
verticale del foglio): si inverte in forma chiusa.
"""

from __future__ import annotations

import copy
import io
import math
from dataclasses import dataclass
from typing import Tuple

import numpy as np
from PIL import Image, ImageFilter
from scipy.ndimage import gaussian_filter, map_coordinates

from .strutture import scegli


@dataclass
class Deformazione:
    H: np.ndarray  # omografia 3×3: pagina (dopo la piega) → foto
    piega_ampiezza: float
    piega_centro: float
    piega_larghezza: float
    uscita: Tuple[int, int]

    def _piega(self, x: np.ndarray) -> np.ndarray:
        return self.piega_ampiezza * np.exp(-((x - self.piega_centro) / self.piega_larghezza) ** 2)

    def avanti(self, punti: np.ndarray) -> np.ndarray:
        """Punti della pagina (N×2, pixel y giù) → punti della foto."""
        p = np.asarray(punti, dtype=float)
        piegati = np.column_stack([p[:, 0], p[:, 1] + self._piega(p[:, 0])])
        omog = np.column_stack([piegati, np.ones(len(p))]) @ self.H.T
        return omog[:, :2] / omog[:, 2:3]

    def indietro(self, punti: np.ndarray) -> np.ndarray:
        """Punti della foto → punti della pagina."""
        q = np.asarray(punti, dtype=float)
        omog = np.column_stack([q, np.ones(len(q))]) @ np.linalg.inv(self.H).T
        piegati = omog[:, :2] / omog[:, 2:3]
        return np.column_stack([piegati[:, 0], piegati[:, 1] - self._piega(piegati[:, 0])])


def _omografia(da: np.ndarray, a: np.ndarray) -> np.ndarray:
    """Omografia che porta i 4 punti `da` nei 4 punti `a` (DLT)."""
    A, b = [], []
    for (x, y), (u, v) in zip(da, a):
        A.append([x, y, 1, 0, 0, 0, -u * x, -u * y])
        b.append(u)
        A.append([0, 0, 0, x, y, 1, -v * x, -v * y])
        b.append(v)
    h = np.linalg.solve(np.array(A, dtype=float), np.array(b, dtype=float))
    return np.append(h, 1.0).reshape(3, 3)


def deformazione_casuale(rng: np.random.Generator, larghezza: int, altezza: int,
                         uscita: Tuple[int, int]) -> Deformazione:
    W, H = uscita
    # il foglio occupa gran parte della foto, ruotato e un po' in prospettiva
    scala = min(W / larghezza, H / altezza) * float(rng.uniform(0.85, 1.02))
    angolo = math.radians(float(rng.uniform(-5, 5)))
    cx, cy = W / 2 + float(rng.uniform(-0.04, 0.04)) * W, H / 2 + float(rng.uniform(-0.04, 0.04)) * H
    angoli = np.array([[0, 0], [larghezza, 0], [larghezza, altezza], [0, altezza]], dtype=float)
    centrati = (angoli - [larghezza / 2, altezza / 2]) * scala
    rot = np.array([[math.cos(angolo), -math.sin(angolo)], [math.sin(angolo), math.cos(angolo)]])
    destinazione = centrati @ rot.T + [cx, cy]
    destinazione += rng.uniform(-0.035, 0.035, size=(4, 2)) * [W, H]
    return Deformazione(
        H=_omografia(angoli, destinazione),
        piega_ampiezza=float(rng.uniform(-0.012, 0.012)) * altezza if rng.random() < 0.5 else 0.0,
        piega_centro=float(rng.uniform(0.2, 0.8)) * larghezza,
        piega_larghezza=float(rng.uniform(0.05, 0.25)) * larghezza,
        uscita=(W, H),
    )


def _sfondo(rng: np.random.Generator, W: int, H: int, tipo: str) -> np.ndarray:
    ys, xs = np.mgrid[0:H, 0:W].astype(float)
    if tipo == "tovaglia":
        a = np.array(scegli(rng, ((200, 90, 60), (70, 110, 170), (220, 190, 120))), dtype=float)
        b = a * 0.75
        passo = float(rng.uniform(25, 60))
        quadri = ((xs // passo + ys // passo) % 2)[..., None]
        base = a * (1 - quadri) + b * quadri
    elif tipo == "scrivania":
        legno = np.array((150, 105, 70), dtype=float)
        venature = 0.85 + 0.15 * np.sin(ys / float(rng.uniform(6, 15)) + 3 * np.sin(xs / 200.0))
        base = legno * venature[..., None]
    else:  # bordo scuro (foto di uno schermo, telefono sul tavolo scuro)
        base = np.full((H, W, 3), float(rng.uniform(25, 60)))
    rumore = rng.normal(0, 6, size=(H, W, 1))
    return np.clip(base + rumore, 0, 255)


def applica(img: Image.Image, maschera: np.ndarray, d: Deformazione, rng: np.random.Generator,
            sfondo: str) -> Tuple[Image.Image, np.ndarray]:
    W, H = d.uscita
    ys, xs = np.mgrid[0:H, 0:W]
    origine = d.indietro(np.column_stack([xs.ravel(), ys.ravel()]).astype(float))
    ox, oy = origine[:, 0].reshape(H, W), origine[:, 1].reshape(H, W)
    sorgente = np.asarray(img, dtype=float)
    dentro = (ox >= 0) & (ox <= img.width - 1) & (oy >= 0) & (oy <= img.height - 1)
    uscita = _sfondo(rng, W, H, sfondo)
    for k in range(3):
        canale = map_coordinates(sorgente[..., k], [oy, ox], order=1, mode="nearest")
        uscita[..., k] = np.where(dentro, canale, uscita[..., k])
    m = map_coordinates(maschera, [oy, ox], order=0, mode="constant", cval=0)
    m = np.where(dentro, m, 0).astype(np.uint8)
    return Image.fromarray(uscita.astype(np.uint8)), m


def fotometria(img: Image.Image, rng: np.random.Generator) -> Image.Image:
    a = np.asarray(img, dtype=float)
    H, W = a.shape[:2]
    # ombra: un campo liscio che scurisce una parte del foglio
    campo = gaussian_filter(rng.normal(0, 1, size=(max(2, H // 64), max(2, W // 64))), 1.5)
    campo = (campo - campo.min()) / (np.ptp(campo) + 1e-9)
    ombra = np.array(Image.fromarray((campo * 255).astype(np.uint8)).resize((W, H), Image.BILINEAR), dtype=float) / 255
    a *= (1 - float(rng.uniform(0, 0.35)) * ombra)[..., None]
    if rng.random() < 0.3:
        # foto slavata: carta grigia e tratti chiari, poco contrasto
        a = a.mean() + (a - a.mean()) * float(rng.uniform(0.55, 0.9))
    # dominante di colore: di solito lieve, a volte forte (luce fredda, carta azzurrina)
    a *= rng.uniform(0.95, 1.03, size=3) if rng.random() < 0.7 else rng.uniform(0.85, 1.08, size=3)
    a += rng.normal(0, float(rng.uniform(0, 6)), size=a.shape)
    out = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
    sigma = float(rng.uniform(0, 1.2))
    if sigma > 0.2:
        out = out.filter(ImageFilter.GaussianBlur(sigma))
    riduzione = float(rng.uniform(0.6, 1.0))
    if riduzione < 0.95:
        piccola = out.resize((max(1, int(W * riduzione)), max(1, int(H * riduzione))), Image.BILINEAR)
        out = piccola.resize((W, H), Image.BILINEAR)
    buf = io.BytesIO()
    out.save(buf, format="JPEG", quality=int(rng.integers(40, 91)))
    buf.seek(0)
    return Image.open(buf).convert("RGB")


def trasforma_primitive(prim: dict, d: Deformazione) -> dict:
    """Primitive (pixel y giù della pagina) → primitive della foto."""
    p = copy.deepcopy(prim)

    def av(q: dict) -> np.ndarray:
        return d.avanti(np.array([[q["x"], q["y"]]]))[0]

    def metti(q: dict) -> None:
        x, y = av(q)
        q["x"], q["y"] = float(x), float(y)

    def scala_locale(q: dict) -> float:
        base = d.avanti(np.array([[q["x"], q["y"]], [q["x"] + 1, q["y"]], [q["x"], q["y"] + 1]]))
        return math.sqrt(np.linalg.norm(base[1] - base[0]) * np.linalg.norm(base[2] - base[0]))

    for s in p["aste"]:
        s["spessore"] *= scala_locale(s["a"])
        metti(s["a"])
        metti(s["b"])
    for c in p["pallini"]:
        c["r"] *= scala_locale(c["c"])
        metti(c["c"])
    for k in p["corpi"]:
        a = k["attacco"]
        u = (math.sin(k["angolo"]), -math.cos(k["angolo"]))  # puntamento in pixel y giù
        p0, p1 = d.avanti(np.array([[a["x"], a["y"]], [a["x"] + 2 * u[0], a["y"] + 2 * u[1]]]))
        v = p1 - p0
        k["angolo"] = float(math.atan2(v[0], -v[1]))
        a["x"], a["y"] = float(p0[0]), float(p0[1])
    for f in p["frecce"] + [m["freccia"] for m in p["momenti"] if "freccia" in m]:
        punta = np.array([f["punta"]["x"], f["punta"]["y"]])
        coda = punta - f["lunghezza"] * np.array([math.cos(f["direzione"]), math.sin(f["direzione"])])
        nuova_punta, nuova_coda = d.avanti(np.array([punta, coda]))
        dv = nuova_punta - nuova_coda
        f["punta"] = {"x": float(nuova_punta[0]), "y": float(nuova_punta[1])}
        f["direzione"] = float(math.atan2(dv[1], dv[0]))
        f["lunghezza"] = float(np.linalg.norm(dv))
    for m in p["momenti"]:
        m["raggio"] *= scala_locale(m["centro"])
        metti(m["centro"])
    for q in p["nodi"]:
        metti(q)
    for s in p["scritte"]:
        metti(s["centro"])
        for e in s.get("estremi", []):
            metti(e)
    p["larghezza"], p["altezza"] = d.uscita
    return p

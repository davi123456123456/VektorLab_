"""
ADDESTRAMENTO — la rete sui campioni del disco.

    python -m rete.addestra --dati esiti/dati --uscita esiti/rete [--epoche 20] [--lotto 4] ...

Legge `dati/addestramento/{ritagli,pagine}` e valida su
`dati/validazione/{ritagli,pagine}`. AdamW con riscaldamento e discesa a
coseno; i pesi di classe della segmentazione vengono dalle frequenze di
qualche centinaio di maschere e si salvano col resto.

In `uscita`: `registro.jsonl` (una riga per epoca: perdite, metriche di
validazione, tempi, memoria), `ultimo.pt` (tutto ciò che serve per
riprendere) e `migliore.pt` (i pesi con la perdita di validazione più
bassa). Se `ultimo.pt` c'è, si riprende da lì, anche a metà epoca: l'ordine
dei campioni dipende solo da (seme, epoca) e i pezzi da (seme, epoca,
indice), quindi un addestramento ripreso fa esattamente gli stessi passi di
uno continuo. `ultimo.pt` si salva a ogni fine epoca e ogni SALVA_OGNI passi: un'interruzione
brusca perde al più quei passi. Alla ripresa lato, lotto, epoche, lr e seme
devono essere gli stessi. `max_passi` ferma dopo quel numero di passi totali.
"""

from __future__ import annotations

import argparse
import dataclasses
import json
import math
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import numpy as np
import torch
from PIL import Image
from torch.utils.data import DataLoader

from . import dispositivo as scegli_dispositivo
from . import vocabolario as V
from .bersagli import riduci_seg
from .dati import Campioni
from .metriche import Misure
from .modello import Rete
from .perdite import pesi_classi_da, perdita


SALVA_OGNI = 500  # passi fra due salvataggi di ultimo.pt a metà epoca
# i campi che decidono l'ordine dei campioni e il ritmo: alla ripresa devono essere uguali
CAMPI_DELLA_RIPRESA = ("lato", "lotto", "epoche", "lr", "seme")


@dataclass
class Config:
    dati: Path
    uscita: Path
    lato: int = 512
    lotto: int = 4      # con 8 la GPU chiede 4,4 GB e un Mac da 8 GB va in swap (README)
    epoche: int = 20
    lr: float = 2e-3
    dispositivo: str = "auto"
    processi: int = 2
    seme: int = 0
    max_passi: Optional[int] = None


def _cartelle(dati: Path, parte: str):
    return [dati / parte / m for m in ("ritagli", "pagine") if (dati / parte / m / "indice.json").exists()
            and json.loads((dati / parte / m / "indice.json").read_text())["campioni"]]


def _frequenze(ds: Campioni, quante: int = 400) -> np.ndarray:
    conti = np.zeros(V.CLASSI, dtype=np.int64)
    for cartella, nome in ds.voci[:: max(1, len(ds.voci) // quante)]:
        seg = riduci_seg(np.asarray(Image.open(cartella / f"{nome}-maschera.png"), dtype=np.uint8))
        conti += np.bincount(seg.ravel(), minlength=V.CLASSI)
    return conti / conti.sum()


def _ritmo(passi_totali: int):
    riscaldamento = max(1, min(1000, passi_totali // 20))

    def f(passo: int) -> float:
        if passo < riscaldamento:
            return (passo + 1) / riscaldamento
        t = (passo - riscaldamento) / max(1, passi_totali - riscaldamento)
        return 0.5 * (1 + math.cos(math.pi * min(1.0, t)))
    return f


def _sposta(b: dict, dev: torch.device) -> dict:
    return {k: v.to(dev, non_blocking=True) for k, v in b.items()}


def _memoria_mb(dev: torch.device) -> Optional[float]:
    if dev.type == "mps":
        return torch.mps.driver_allocated_memory() / 2 ** 20
    if dev.type == "cuda":
        return torch.cuda.max_memory_allocated(dev) / 2 ** 20
    return None


@torch.no_grad()
def valida(modello: Rete, ds: Campioni, cfg: Config, dev: torch.device, pesi_classi: torch.Tensor) -> dict:
    modello.eval()
    misure, somma, n = Misure(), 0.0, 0
    for x, b in DataLoader(ds, batch_size=cfg.lotto, num_workers=cfg.processi):
        x, b = x.to(dev), _sposta(b, dev)
        uscite = modello(x)
        totale, _ = perdita(uscite, b, pesi_classi)
        somma += totale.item() * len(x)
        n += len(x)
        misure.aggiungi(uscite, b)
    modello.train()
    return {"perdita": somma / max(1, n), "metriche": misure.risultato()}


def addestra(cfg: Config) -> Path:
    cfg = dataclasses.replace(cfg, dati=Path(cfg.dati), uscita=Path(cfg.uscita))
    cfg.uscita.mkdir(parents=True, exist_ok=True)
    dev = scegli_dispositivo(cfg.dispositivo)
    ds = Campioni(_cartelle(cfg.dati, "addestramento"), lato=cfg.lato, casuale=True, seme=cfg.seme)
    ds_val = Campioni(_cartelle(cfg.dati, "validazione"), lato=cfg.lato, casuale=False)
    passi_per_epoca = len(ds) // cfg.lotto
    passi_totali = passi_per_epoca * cfg.epoche

    torch.manual_seed(cfg.seme)
    modello = Rete().to(dev)
    ottimizzatore = torch.optim.AdamW(modello.parameters(), lr=cfg.lr, weight_decay=1e-4)
    ritmo = torch.optim.lr_scheduler.LambdaLR(ottimizzatore, _ritmo(passi_totali))

    ultimo, migliore = cfg.uscita / "ultimo.pt", cfg.uscita / "migliore.pt"
    if ultimo.exists():
        stato = torch.load(ultimo, map_location="cpu", weights_only=False)
        diversi = [k for k in CAMPI_DELLA_RIPRESA if stato["config"].get(k) != str(getattr(cfg, k))]
        if diversi:
            raise ValueError(f"{ultimo} viene da una configurazione diversa ({', '.join(diversi)}): "
                             "riprendi con gli stessi valori o usa un'altra cartella d'uscita")
        modello.load_state_dict(stato["modello"])
        ottimizzatore.load_state_dict(stato["ottimizzatore"])
        ritmo.load_state_dict(stato["ritmo"])
        pesi_classi = stato["pesi_classi"]
        passo, epoca, passo_in_epoca = stato["passo"], stato["epoca"], stato["passo_in_epoca"]
        migliore_perdita, somma, n_somma = stato["migliore_perdita"], stato["somma"], stato["n_somma"]
        print(f"ripresa dal passo {passo} (epoca {epoca}, passo {passo_in_epoca} dell'epoca)", flush=True)
        # un'interruzione fra la riga del registro e il salvataggio lascerebbe righe in più
        registro = cfg.uscita / "registro.jsonl"
        if registro.exists():
            per_epoca = {}
            for r in registro.read_text(encoding="utf-8").splitlines():
                if r.strip() and json.loads(r)["epoca"] < epoca:
                    per_epoca[json.loads(r)["epoca"]] = r
            registro.write_text("".join(per_epoca[e] + "\n" for e in sorted(per_epoca)), encoding="utf-8")
    else:
        frequenze = _frequenze(ds)
        pesi_classi = pesi_classi_da(frequenze)
        (cfg.uscita / "pesi_classi.json").write_text(json.dumps(
            {"frequenze": frequenze.tolist(), "pesi": pesi_classi.tolist()}) + "\n")
        passo, epoca, passo_in_epoca = 0, 0, 0
        migliore_perdita, somma, n_somma = math.inf, 0.0, 0
    pesi_classi_dev = pesi_classi.to(dev)

    def salva() -> None:
        torch.save({"modello": modello.state_dict(), "ottimizzatore": ottimizzatore.state_dict(),
                    "ritmo": ritmo.state_dict(), "pesi_classi": pesi_classi, "passo": passo, "epoca": epoca,
                    "passo_in_epoca": passo_in_epoca, "migliore_perdita": migliore_perdita,
                    "somma": somma, "n_somma": n_somma, "config": {k: str(v) for k, v in vars(cfg).items()}},
                   cfg.uscita / "ultimo.tmp")
        (cfg.uscita / "ultimo.tmp").replace(ultimo)

    modello.train()
    while epoca < cfg.epoche:
        if cfg.max_passi is not None and passo >= cfg.max_passi:
            return migliore
        ds.imposta_epoca(epoca)
        ordine = torch.randperm(len(ds), generator=torch.Generator().manual_seed(cfg.seme * 100_003 + epoca))
        ordine = ordine[: passi_per_epoca * cfg.lotto].tolist()[passo_in_epoca * cfg.lotto:]
        inizio = time.time()
        for x, b in DataLoader(ds, batch_size=cfg.lotto, sampler=ordine, num_workers=cfg.processi,
                               drop_last=True, pin_memory=False):
            x, b = x.to(dev, non_blocking=True), _sposta(b, dev)
            totale, _ = perdita(modello(x), b, pesi_classi_dev)
            ottimizzatore.zero_grad(set_to_none=True)
            totale.backward()
            torch.nn.utils.clip_grad_norm_(modello.parameters(), 5.0)
            ottimizzatore.step()
            ritmo.step()
            somma += totale.item()
            n_somma += 1
            passo += 1
            passo_in_epoca += 1
            if passo % 50 == 0:
                memoria = _memoria_mb(dev)
                print(f"passo {passo}/{passi_totali}  perdita {somma / n_somma:.4f}  "
                      f"{(time.time() - inizio) / max(1, passo_in_epoca):.2f} s/passo"
                      + (f"  {memoria:.0f} MB" if memoria is not None else ""), flush=True)
            if cfg.max_passi is not None and passo >= cfg.max_passi and passo_in_epoca < passi_per_epoca:
                salva()
                return migliore
            if passo % SALVA_OGNI == 0 and passo_in_epoca < passi_per_epoca:
                salva()
        durata = time.time() - inizio

        v = valida(modello, ds_val, cfg, dev, pesi_classi_dev) if len(ds_val) else {"perdita": None, "metriche": {}}
        riga = {"epoca": epoca, "passo": passo, "perdita_addestramento": somma / max(1, n_somma),
                "perdita_validazione": v["perdita"], "metriche": v["metriche"], "lr": ritmo.get_last_lr()[0],
                "secondi_per_passo": durata / max(1, passo_in_epoca), "memoria_mb": _memoria_mb(dev)}
        with open(cfg.uscita / "registro.jsonl", "a", encoding="utf-8") as f:
            f.write(json.dumps(riga) + "\n")
        print(f"epoca {epoca}: addestramento {riga['perdita_addestramento']:.4f}  "
              f"validazione {v['perdita'] if v['perdita'] is None else round(v['perdita'], 4)}", flush=True)
        if v["perdita"] is not None and v["perdita"] < migliore_perdita:
            migliore_perdita = v["perdita"]
            torch.save({"modello": modello.state_dict(), "epoca": epoca, "perdita_validazione": v["perdita"]},
                       cfg.uscita / "migliore.tmp")
            (cfg.uscita / "migliore.tmp").replace(migliore)
        epoca += 1
        passo_in_epoca, somma, n_somma = 0, 0.0, 0
        salva()
    return migliore


def main(argv=None) -> None:
    a = argparse.ArgumentParser(prog="rete.addestra")
    a.add_argument("--dati", type=Path, required=True)
    a.add_argument("--uscita", type=Path, required=True)
    a.add_argument("--lato", type=int, default=Config.lato)
    a.add_argument("--lotto", type=int, default=Config.lotto)
    a.add_argument("--epoche", type=int, default=Config.epoche)
    a.add_argument("--lr", type=float, default=Config.lr)
    a.add_argument("--dispositivo", default=Config.dispositivo)
    a.add_argument("--processi", type=int, default=Config.processi)
    a.add_argument("--seme", type=int, default=Config.seme)
    a.add_argument("--max-passi", type=int, default=None)
    print(addestra(Config(**vars(a.parse_args(argv)))))


if __name__ == "__main__":
    main()

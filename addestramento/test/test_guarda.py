from __future__ import annotations

import json

import torch
from PIL import Image

from generatore.campione import genera
from rete.guarda import main, prepara
from rete.modello import Rete


def test_prepara_multiplo_di_32():
    x, scala = prepara(Image.new("RGB", (1000, 450), "white"), 768)
    assert tuple(x.shape[:2]) == (1, 1) and x.shape[2] % 32 == 0 and x.shape[3] % 32 == 0
    assert x.shape[3] >= 768 and abs(scala - 0.768) < 1e-9


def test_scrive_le_sovrapposizioni(tmp_path):
    foto = tmp_path / "foto"
    foto.mkdir()
    riquadri = {}
    for n, seme in (("01", 3), ("02", 4)):
        c = genera(seme, solo_etichette=False)
        c["immagine"].save(foto / f"{n}.png")
        riquadri[n] = c["meta"]["riquadro"]
    (tmp_path / "riquadri.json").write_text(json.dumps({"riquadri": riquadri}))
    torch.manual_seed(0)
    torch.save({"modello": Rete().state_dict()}, tmp_path / "pesi.pt")
    uscita = tmp_path / "esiti"
    main(["--pesi", str(tmp_path / "pesi.pt"), "--foto", str(foto), "--riquadri", str(tmp_path / "riquadri.json"),
          "--uscita", str(uscita), "--dispositivo", "cpu"])
    for n in ("01", "02"):
        for passata in ("pagina", "ritaglio"):
            assert Image.open(uscita / f"{n}-{passata}.png").size[0] > 0
    riepilogo = json.loads((uscita / "riepilogo.json").read_text())
    assert set(riepilogo) == {"01", "02"} and "pallini" in riepilogo["01"]["ritaglio"]

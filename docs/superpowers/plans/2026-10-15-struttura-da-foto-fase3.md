# Struttura da foto — Fase 3: rete e addestramento — Piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** una rete piccola, addestrata sui campioni sintetici, che dalla foto produce le mappe della spec §6 (segmentazione + picchi di pallini, vincoli, frecce, momenti, nodi, scritte) ed è esportata in ONNX per il browser.

**Architecture:** il generatore impara a produrre direttamente i campioni alla risoluzione con cui la rete li vedrà (ritaglio a 768 px attorno alla figura per la seconda passata, pagina intera ridotta a 768 px per la prima): è la soluzione al punto rinviato dalla revisione della Fase 2. Un dataset su disco (generato in parallelo) alimenta l'addestramento in PyTorch sulla GPU del Mac (MPS). I bersagli si costruiscono dalle etichette al volo. La rete esportata in ONNX ha i pesi in fp16 e calcola in fp32: piccola e compatibile con onnxruntime-web.

**Tech Stack:** Python 3.9 in un ambiente dedicato `addestramento/.venv` (numpy, scipy, Pillow, pytest, torch, onnx, onnxruntime — download approvato dall'utente il 2026-10-15).

**Spec:** `docs/superpowers/specs/2026-10-14-struttura-da-foto-design.md` (§5 due passate, §6 rete, §9, §10). Fase 2: `docs/superpowers/plans/2026-10-14-struttura-da-foto-fase2.md`; il README di `addestramento/` elenca i minori rinviati.

## Global Constraints

- Python **3.9** del sistema, ambiente `addestramento/.venv` (escluso da git); `requirements.txt` aggiornato con `torch`, `onnx`, `onnxruntime`.
- Dispositivo: `mps` se disponibile, altrimenti `cpu`; i test girano su CPU e in pochi secondi.
- Il generatore della Fase 2 resta compatibile: `genera(seme)` (solo etichette) e la campagna TS non cambiano.
- Ingresso della rete: immagine in scala di grigi, valori in [0, 1], lati multipli di 32; uscite a 1/2 (segmentazione) e 1/4 (tutte le altre teste) della risoluzione d'ingresso.
- Budget: ≤ 1.5 M parametri; file `public/modelli/foto.onnx` ≤ 3.5 MB.
- Nessun file generato (dati, pesi intermedi, registri) in git: tutto in `addestramento/esiti/`. Si versionano solo il modello finale e la sua descrizione (`public/modelli/foto.onnx`, `public/modelli/foto.json`).
- `dati-foto/` (foto vere) mai in git; le prove qualitative sulle foto vere scrivono in `dati-foto/esiti-rete/`.
- Nessuna modifica sotto `src/core/`; `npm test` e `npm run baseline:check` verdi.

## Formato delle uscite (contratto con la Fase 4)

Segmentazione `seg`: 7 canali a 1/2, classi della spec §6 (0 sfondo, 1 asta, 2 ausiliaria, 3 carico, 4 simbolo, 5 testo, 6 altro).

Teste `testa`: 43 canali a 1/4, in quest'ordine:

| Canali | Contenuto |
|---|---|
| 0 | pallini: mappa dei centri |
| 1 | pallini: raggio / 10 (px d'ingresso) |
| 2–9 | corpi di vincolo, uno per tipo, nell'ordine di `TipoCorpo` in `src/foto/tipi.ts` |
| 10–11 | corpi: cos α, sin α (α = angolo del contratto, puntamento VektorLab) |
| 12 | frecce: mappa delle punte |
| 13–14 | frecce: cos, sin della direzione (contratto, y su) |
| 15 | frecce: lunghezza / 100 (px d'ingresso) |
| 16–17 | momenti: antiorario, orario |
| 18 | nodi: estremi e incroci delle aste |
| 19–26 | scritte L: L/2, L, 3L/2, 2L, 5L/2, 3L, 7L/2, 4L |
| 27–38 | scritte q, 2q, 3q, q/2, F, 2F, 3F, F/2, M, 2M, 3M, M/2 |
| 39–42 | quote: (dx₁, dy₁, dx₂, dy₂) / 100 degli estremi rispetto al centro (px d'ingresso, y su) |

Le mappe dei centri sono probabilità (sigmoide); le regressioni valgono solo sui picchi. `foto.json` descrive questa tabella, la normalizzazione e i passi.

## Review Focus

1. **Bersagli fuori posto** (passo 1/4, y su contro y giù, scarto del ritaglio): un picco a un pixel di distanza insegna alla rete un errore sistematico → test di andata e ritorno nel Task 3: dai bersagli si ricavano i picchi e si ritrovano le primitive entro 1 px d'ingresso × 4.
2. **Rete che impara solo lo sfondo** (classi sbilanciate) → pesi di classe nella perdita (Task 6) e metriche per classe (Task 6, Task 9).
3. **ONNX non eseguibile nel browser** (operatori non supportati) → test nel Task 8 sull'elenco degli operatori del grafo esportato.
4. **Memoria del Mac (8 GB)** → valori predefiniti prudenti (lotti da 8, ritagli da 512) e misura della memoria nel Task 7.
5. **Ripresa dell'addestramento** dopo un'interruzione → test nel Task 7: due esecuzioni interrotte e riprese danno gli stessi pesi di una continua.

---

### Task 1: Ambiente della rete

**Files:** Modify `addestramento/requirements.txt`, `addestramento/.gitignore` (`.venv/`), `addestramento/README.md` · Test `addestramento/test/test_ambiente.py`

- [ ] **Step 1: test** — `test_librerie`: si importano `torch`, `onnx`, `onnxruntime`; `torch.__version__` ≥ 2.0; un tensore si somma sul dispositivo scelto da `generatore`/`rete` (`mps` o `cpu`).
- [ ] **Step 2:** con il vecchio ambiente il test fallisce (manca `torch`).
- [ ] **Step 3:** `/usr/bin/python3 -m venv addestramento/.venv`, `pip install -U pip`, `pip install -r requirements.txt`.
- [ ] **Step 4:** `addestramento/.venv/bin/python -m pytest -q` (dalla cartella `addestramento`) → tutti verdi, compresi gli 82 della Fase 2.
- [ ] **Step 5:** commit `addestramento: ambiente della rete`.

### Task 2: Campioni alla risoluzione della rete

**Files:** Modify `addestramento/generatore/campione.py`, `addestramento/generatore/__main__.py` · Test `addestramento/test/test_modi.py`

**Interfaces:** `genera(seme, solo_etichette=True, rumore=0.0, stile=None, modo='foto')` con `modo in {'foto', 'ritaglio', 'pagina'}`; `'foto'` è il percorso attuale. CLI `--modo`.

- **ritaglio** (seconda passata): la scala si sceglie perché il lato lungo del riquadro della figura valga `768 / (1 + 2p)` px, con margine `p ∈ [0.08, 0.3]`; la deformazione si compone con una traslazione e una scala che portano il riquadro deformato (allargato di `p`) in un'immagine con lato lungo **768**. Si deforma solo il ritaglio.
- **pagina** (prima passata): il percorso `'foto'` con l'uscita ridotta perché il lato lungo valga **768**.

- [ ] **Step 1: test** — per 6 semi in modo `ritaglio`: `max(immagine.size) == 768`, il riquadro sta nell'immagine e il suo lato lungo è fra 400 e 768 px; i centri dei pallini trasformati cadono su pixel di classe 4 (entro r + 2) e i punti medi delle aste su classe 1 (entro 2 px) nel 95 % dei casi; in modo `pagina`: `max(immagine.size) == 768`; `genera(5)` (solo etichette) invariato rispetto a prima (stesso JSON).
- [ ] **Step 2:** pytest → FAIL. **Step 3:** implementare. **Step 4:** PASS.
- [ ] **Step 5:** commit `addestramento: campioni alla risoluzione della rete`.

### Task 3: Vocabolario e bersagli

**Files:** Create `addestramento/rete/__init__.py`, `addestramento/rete/vocabolario.py`, `addestramento/rete/bersagli.py` · Test `addestramento/test/test_bersagli.py`

**Interfaces:**
- `vocabolario.py`: `TIPI_CORPO`, `SCRITTE` (le 20 voci della tabella, come `(famiglia, valore)`), `CANALI = 43`, `CLASSI = 7`, indici nominati (`PALLINO, RAGGIO, CORPO0, COS_CORPO, …`), `descrizione() -> dict` (il contenuto di `foto.json`).
- `bersagli.py`: `costruisci(maschera: ndarray, primitive: dict, altezza: int) -> dict[str, ndarray]` con `seg` (H/2 × W/2, int64), `mappe` (43 × H/4 × W/4, float32), `pesi_reg` (43 × H/4 × W/4, 1 dove una regressione vale). Segmentazione ridotta per **priorità di classe** (in un blocco 2×2 vince la classe più importante: testo > asta > simbolo > carico > ausiliaria > altro > sfondo), così le linee sottili non spariscono. Centri: gaussiane con σ = 1.5 (in celle 1/4); regressioni sul picco e sulle 4 celle vicine. Nodi: estremi delle aste, fusi entro 2 celle. Le primitive arrivano nel contratto (y su) e qui si riportano in pixel y giù.
- `estrai_picchi(mappa: ndarray, soglia: float = 0.3) -> list[tuple[int, int, float]]` (massimi locali 3×3).

- [ ] **Step 1: test** — andata e ritorno su 5 campioni `ritaglio`: dai bersagli, `estrai_picchi` sui canali dei pallini, dei corpi, delle frecce, dei momenti e delle scritte ritrova ogni primitiva entro 4 px d'ingresso (1 cella), con il tipo/classe giusto, e le regressioni lette sul picco ridanno raggio, angolo (entro 2°), lunghezza (entro 2 px) ed estremi delle quote (entro 4 px); una linea d'asta larga 1 px resta classe 1 nella segmentazione ridotta.
- [ ] **Step 2:** pytest → FAIL. **Step 3:** implementare. **Step 4:** PASS.
- [ ] **Step 5:** commit `rete: vocabolario e bersagli`.

### Task 4: Dataset su disco

**Files:** Create `addestramento/generatore/dataset.py` (`python -m generatore.dataset`), `addestramento/rete/dati.py` · Test `addestramento/test/test_dati.py`

**Interfaces:**
- `python -m generatore.dataset --uscita esiti/dati --ritagli 8000 --pagine 2000 --val-ritagli 500 --val-pagine 200 --processi 6`: semi d'addestramento da 1, di validazione da 1 000 001; per campione `NNNNNNN.png` (grigio), `NNNNNNN-maschera.png`, `NNNNNNN.json`; un `indice.json` per cartella. Riprende da dove si era fermato (salta i file già scritti).
- `rete/dati.py`: `class Campioni(torch.utils.data.Dataset)` con `__init__(cartelle: list[Path], lato: int = 512, casuale: bool = True, seme: int = 0)`; restituisce `(immagine [1×lato×lato], bersagli)`; ritaglio casuale (o centrato se `casuale=False`) con riempimento bianco/sfondo, primitive traslate di conseguenza; nessun ribaltamento (cambierebbe versi e orientamenti).

- [ ] **Step 1: test** — il dataset con 4 ritagli e 2 pagine scrive i file e l'indice; una seconda esecuzione non riscrive niente; `Campioni` restituisce tensori delle forme attese, e il bersaglio di un ritaglio centrato coincide con `costruisci` sull'immagine ritagliata a mano.
- [ ] **Step 2:** FAIL. **Step 3:** implementare. **Step 4:** PASS.
- [ ] **Step 5:** commit `rete: dataset su disco`.

### Task 5: Modello

**Files:** Create `addestramento/rete/modello.py` · Test `addestramento/test/test_modello.py`

**Interfaces:** `class Rete(nn.Module)` con `forward(x: [B,1,H,W]) -> (seg [B,7,H/2,W/2], testa [B,43,H/4,W/4])`; codificatore a blocchi residui invertiti (tipo MobileNetV2, attivazioni ReLU6/Hardswish) fino a 1/32, decodificatore U-Net con salti a 1/16, 1/8, 1/4, 1/2; teste convoluzionali; sigmoide sui canali delle mappe solo in `predici()` (le perdite lavorano sui logit). `conta_parametri(m) -> int`.

- [ ] **Step 1: test** — `conta_parametri(Rete()) <= 1_500_000`; forme d'uscita per ingressi 512×512 e 768×544; la rete si esporta in ONNX (opset 17, assi dinamici) e onnxruntime su CPU dà le stesse uscite di torch entro 1e-4.
- [ ] **Step 2:** FAIL. **Step 3:** implementare. **Step 4:** PASS.
- [ ] **Step 5:** commit `rete: modello`.

### Task 6: Perdite e metriche

**Files:** Create `addestramento/rete/perdite.py`, `addestramento/rete/metriche.py` · Test `addestramento/test/test_perdite.py`

**Interfaces:**
- `perdita(uscite, bersagli, pesi_classi: Tensor) -> (totale, dettaglio: dict)`: entropia incrociata pesata per la segmentazione; perdita focale di CenterNet (α=2, β=4) per le mappe, normalizzata sul numero di picchi; L1 mascherata per le regressioni (×0.5).
- `pesi_classi_da(frequenze: ndarray) -> Tensor`: 1/√frequenza, normalizzati a media 1.
- `metriche(uscite, bersagli) -> dict`: IoU per classe di segmentazione; per pallini, corpi (con tipo), frecce, momenti (con verso), scritte (con classe): precisione e richiamo dei picchi entro 1 cella; errore medio d'angolo dei corpi e delle frecce.

- [ ] **Step 1: test** — perdita nulla (o quasi) quando le uscite riproducono i bersagli (logit grandi coerenti); positiva e decrescente in una discesa del gradiente su un solo campione; i pesi di classe cambiano davvero la perdita di segmentazione; metriche perfette su uscite uguali ai bersagli, richiamo 0 su uscite vuote.
- [ ] **Step 2:** FAIL. **Step 3:** implementare. **Step 4:** PASS.
- [ ] **Step 5:** commit `rete: perdite e metriche`.

### Task 7: Ciclo di addestramento

**Files:** Create `addestramento/rete/addestra.py` (`python -m rete.addestra`) · Test `addestramento/test/test_addestra.py`

**Interfaces:** `addestra(config: Config) -> Path` (percorso dei pesi migliori); `Config` (dataclass): `dati`, `uscita`, `lato=512`, `lotto=8`, `epoche=20`, `lr=2e-3` (AdamW, coseno con riscaldamento), `dispositivo='auto'`, `processi=4`, `seme=0`, `max_passi=None`. Ogni epoca: validazione con `metriche`, registro in `uscita/registro.jsonl`, pesi `ultimo.pt` e `migliore.pt` (per perdita di validazione); ripresa automatica da `ultimo.pt`.

- [ ] **Step 1: test** — su 4 campioni minuscoli (lato 128, CPU) la perdita d'addestramento scende di almeno metà in 60 passi; un addestramento interrotto dopo 10 passi e ripreso fino a 20 dà gli stessi pesi di uno da 20 passi filati (stesso seme, CPU, `processi=0`).
- [ ] **Step 2:** FAIL. **Step 3:** implementare. **Step 4:** PASS. Misurare memoria e secondi per passo su `mps` con i valori predefiniti (riga nel README).
- [ ] **Step 5:** commit `rete: ciclo di addestramento`.

### Task 8: Esportazione per il browser

**Files:** Create `addestramento/rete/esporta.py` (`python -m rete.esporta`) · Test `addestramento/test/test_esporta.py`

**Interfaces:** `esporta(pesi: Path, uscita_onnx: Path, uscita_json: Path) -> None`: ONNX opset 17, assi dinamici su H e W; pesi convertiti in fp16 con un `Cast` a fp32 dopo ogni inizializzatore (il calcolo resta in fp32, il file si dimezza); `foto.json` = `vocabolario.descrizione()` + normalizzazione + passi + versione.

- [ ] **Step 1: test** — il modello esportato (da pesi casuali) dà con onnxruntime le uscite di torch entro 1e-2 sulle mappe dopo la sigmoide; gli operatori del grafo stanno nell'elenco `{Conv, Relu, Clip, HardSigmoid, HardSwish, Mul, Add, Concat, Resize, Cast, Sigmoid, Identity, Constant, Shape, Gather, Slice, Unsqueeze}`; il file è ≤ 3.5 MB; `foto.json` ha 43 canali descritti.
- [ ] **Step 2:** FAIL. **Step 3:** implementare. **Step 4:** PASS.
- [ ] **Step 5:** commit `rete: esportazione per il browser`.

### Task 9: Addestramento vero e rapporto

**Files:** Create `addestramento/rete/guarda.py` (prova qualitativa sulle foto vere) · Modify `addestramento/README.md` · Create `public/modelli/foto.onnx`, `public/modelli/foto.json`

- [ ] **Step 1:** `python -m generatore.dataset` con i valori predefiniti (≈ 10 700 campioni, ≈ 2–3 GB in `esiti/dati`).
- [ ] **Step 2:** `python -m rete.addestra` in sottofondo (alcune ore); se la validazione smette di migliorare prima, ci si ferma.
- [ ] **Step 3:** `python -m rete.esporta` → `public/modelli/`.
- [ ] **Step 4:** `python -m rete.guarda`: per ogni foto vera di `dati-foto/foto/`, la rete applicata all'immagine con lato lungo 1024 e ai ritagli attorno alla figura (riquadro scritto a mano in `dati-foto/riquadri.json`, uno per foto) → sovrapposizioni in `dati-foto/esiti-rete/` da guardare insieme a Davide.
- [ ] **Step 5:** README: tabella delle metriche di validazione per testa, tempi, dimensione del modello, impressioni sulle foto vere e cosa migliorare nel generatore.
- [ ] **Step 6:** `npm test`, `npx tsc -b`, `npm run baseline:check`, pytest verdi; commit `rete: primo modello addestrato`.

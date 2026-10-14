# Struttura da foto — Fase 2: generatore sintetico — Piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** un generatore Python che produce, per ogni seme, uno schema strutturale casuale disegnato come in un foglio d'esame fotografato, con le etichette esatte (maschera di segmentazione, `Primitive` del contratto TS, schema atteso), più una campagna che misura le regole di lettura della Fase 1 su migliaia di schemi.

**Architecture:** schema (in L) → **scena vettoriale** (layout + convenzioni di disegno: è l'inverso delle regole di lettura) → da una parte le `Primitive` ideali, dall'altra la rasterizzazione con uno stile → pagina d'esame (testo, altre figure, appunti) → effetti foto (prospettiva, piega, ombra, rumore) applicati con la stessa trasformazione a immagine, maschera e punti. Una sola scena genera immagine ed etichette, così non possono divergere. La campagna TS legge i campioni con `leggi()` e li confronta con lo schema convertito in `Progetto`.

**Tech Stack:** Python 3.9 del `.venv` già presente (`numpy 2.0`, `scipy 1.13`, `Pillow 11.3` con freetype, `pytest 8.4`) — nessun pacchetto nuovo; font di sistema macOS; TypeScript/Vitest per la campagna.

**Spec:** `docs/superpowers/specs/2026-10-14-struttura-da-foto-design.md` (§6 classi della maschera, §7 regole, §9 generatore, §10 valutazione). Fase 1: `docs/superpowers/plans/2026-10-14-struttura-da-foto-fase1.md`.

## Global Constraints

- Tutto il Python in `vektorlab/addestramento/`, compatibile **3.9** (`from __future__ import annotations`, niente `match`); dipendenze solo `numpy`, `scipy`, `Pillow`, `pytest`. Si esegue con `../.venv/bin/python` (radice del progetto); `addestramento/requirements.txt` le elenca per chi rifà l'ambiente.
- Casualità solo da `numpy.random.default_rng(seme)`: stesso seme → stessi byte.
- Font: scoperti a runtime fra quelli di sistema (macOS `/System/Library/Fonts`, `/System/Library/Fonts/Supplemental`, `/Library/Fonts`; Linux `/usr/share/fonts`), mai committati; senza font si usa `ImageFont.load_default()`.
- Classi della maschera (uint8): `0 sfondo` (quadretti compresi) · `1 asta` · `2 ausiliaria` · `3 carico` · `4 simbolo` · `5 testo` · `6 altroDisegno`. Priorità di disegno sulla maschera, dal basso: sfondo < altroDisegno < ausiliaria < carico < simbolo < asta < testo.
- Coordinate interne del generatore in pixel **y verso il basso**; la conversione al contratto TS (`src/foto/tipi.ts`: y verso l'alto, angoli in radianti antiorari, `verso` 'orario'/'antiorario' come visto sul foglio) avviene **una volta sola**, in `campione.py`.
- Lo schema è in unità di L, y verso l'alto, griglia L/2.
- Uscite generate in `addestramento/esiti/` (esclusa da git). Si committano solo codice e i 40 campioni JSON sintetici di prova in `test/foto/campioni/`.
- Nessuna modifica sotto `src/core/`; `npm run baseline:check` verde. Identificatori e commenti in italiano.

## Review Focus

1. **Deriva del contratto**: un nome di campo, l'asse y o l'unità degli angoli diversi fra il JSON Python e `tipi.ts` rompono la Fase 4 in silenzio → la campagna (Task 5) legge i JSON veri del generatore con `leggi()`, e un test pytest controlla le chiavi.
2. **Etichette disallineate dopo gli effetti**: un punto trasformato con una mappa e l'immagine con un'altra → test nel Task 8 che campiona la maschera nei punti trasformati.
3. **Schemi che le convenzioni di disegno non sanno esprimere** (cerniera parziale con gruppo saldato non rettilineo, due vincoli nello stesso punto, carico su un'asta inesistente) → invarianti nel Task 2.
4. **Determinismo**: due esecuzioni con lo stesso seme → file identici → test nel Task 9.
5. **Font assenti** su un'altra macchina (Colab) → test nel Task 6 con elenco di font vuoto.

## Formati condivisi

**`schema.json`** (prodotto da Python, letto da TS):

```json
{
  "famiglia": "trave",
  "nodi": [[0, 0], [3, 0]],
  "aste": [[0, 1]],
  "vincoli": [{"nodo": 0, "tipo": "cerniera", "angolo": 0},
              {"asta": 0, "s": 0.3333333, "tipo": "carrello", "angolo": 0}],
  "sconnessioni": [{"nodo": 2, "tipo": "cerniera", "svincolate": null}],
  "carichi": [{"tipo": "distribuito", "asta": 0, "s1": 0, "s2": 1, "direzione": -90, "coefficiente": 1},
              {"tipo": "forza", "nodo": 1, "direzione": 180, "coefficiente": 2},
              {"tipo": "momento", "asta": 0, "s": 0.5, "verso": -1, "coefficiente": 1}]
}
```

Angoli in **gradi** (vincoli nella convenzione di puntamento di VektorLab; carichi = direzione della punta, y verso l'alto). `svincolate: null` = tutte le aste del nodo separate; elenco di indici d'asta = sconnessione parziale, le altre restano saldate. Tipi di vincolo: `incastro, cerniera, carrello, bipendolo, pattino, biella`.

**Campione** `NNNNN.json`: `{ "primitive": <Primitive del contratto>, "schema": <schema>, "meta": { "seme", "famiglia", "stile", "riquadro": [x0, y0, x1, y1], "scala": px per L } }`, più `NNNNN.png` (immagine) e `NNNNN-maschera.png` quando non si chiede `--solo-etichette`.

---

### Task 1: Ambiente Python e schema

**Files:**
- Create: `addestramento/requirements.txt`, `addestramento/README.md`, `addestramento/.gitignore` (`esiti/`, `__pycache__/`, `.pytest_cache/`), `addestramento/pytest.ini` (`testpaths = test`)
- Create: `addestramento/generatore/__init__.py`, `addestramento/generatore/schema.py`
- Test: `addestramento/test/test_schema.py`

**Interfaces:**
- Produces (`schema.py`): dataclass `Vincolo(tipo: str, angolo: float, nodo: int | None = None, asta: int | None = None, s: float | None = None)`, `Sconnessione(nodo: int, tipo: str, svincolate: list[int] | None)`, `Carico(tipo: str, coefficiente: float, direzione: float | None = None, verso: int | None = None, nodo: int | None = None, asta: int | None = None, s: float | None = None, s1: float | None = None, s2: float | None = None)`, `Schema(famiglia: str, nodi: list[tuple[float, float]], aste: list[tuple[int, int]], vincoli, sconnessioni, carichi)`; `Schema.a_json() -> dict` (chiavi assenti omesse, `svincolate` sempre presente), `Schema.da_json(d: dict) -> Schema`; `valida(s: Schema) -> list[str]` (elenco di problemi, vuoto se valido).

- [ ] **Step 1: test** — `test_andata_e_ritorno_json` (schema d'esempio della sezione "Formati" → `da_json(a_json())` uguale); `test_valida_riferimenti` (asta con nodo inesistente, vincolo su asta inesistente, `s` fuori da (0,1), carico distribuito con `s1 >= s2` → ciascuno compare in `valida`); `test_valida_schema_buono` → `[]`.
- [ ] **Step 2:** `cd addestramento && ../../.venv/bin/python -m pytest -q` → FAIL (modulo assente).
- [ ] **Step 3:** implementare.
- [ ] **Step 4:** stesso comando → PASS.
- [ ] **Step 5:** commit `addestramento: ambiente e schema del generatore`.

### Task 2: Famiglie di strutture casuali

**Files:** Create `addestramento/generatore/strutture.py` · Test `addestramento/test/test_strutture.py`

**Interfaces:**
- Consumes: `Schema`, `valida`.
- Produces: `FAMIGLIE: tuple[str, ...] = ('trave', 'mensola', 'portale', 'telaioL', 'gradini', 'anello', 'T', 'inclinata')`; `genera_schema(rng: numpy.random.Generator, famiglia: str | None = None) -> Schema`.

Ogni famiglia imita gli esercizi visti (trave continua 01/07/09/13/16, mensola con sbalzo, portale 21, telaio a L, gradini 04, anello chiuso 06/10/15, a T 03/12, aste a 45° 14/23). Nodi su griglia L/2, luci fra 0.5 e 4 L. Vincoli orientati verso l'esterno della struttura (a terra puntano in alto, a soffitto in basso, a parete in orizzontale); vincoli in campata solo `cerniera`/`carrello`; cerniere interne su nodi, sconnessioni parziali **solo** se il gruppo saldato è una coppia di aste allineate (caso 20-B / 08-B); doppio pendolo interno solo fra due aste allineate. 0–3 carichi: distribuiti perpendicolari all'asta o verticali/orizzontali, forze a 0/45/90/…°, momenti; coefficienti in {1, 2, 3, 1/2}, più spesso 1.

- [ ] **Step 1: test** — su 300 semi per famiglia: `valida(s) == []`; nodi multipli di 0.5 e distinti; nessuna asta di lunghezza nulla né due aste sugli stessi nodi; grafo connesso; somma dei gradi di vincolo esterni ≥ 3 (incastro 3, cerniera/bipendolo/pattino 2, carrello/biella 1); nessun nodo con due vincoli esterni; ogni sconnessione parziale ha esattamente due aste saldate e allineate; `genera_schema(default_rng(7))` uguale due volte; ogni famiglia compare su 200 semi senza famiglia imposta.
- [ ] **Step 2:** pytest → FAIL. **Step 3:** implementare. **Step 4:** pytest → PASS.
- [ ] **Step 5:** commit `addestramento: famiglie di strutture casuali`.

### Task 3: Da schema a Progetto (TS)

**Files:**
- Create: `src/foto/schema.ts`
- Modify: `src/foto/traduci.ts` (esporta `direzioneDistribuito`, oggi privata)
- Test: `test/foto/schema.test.ts`

**Interfaces:**
- Produces: `interface SchemaGenerato` (forma JSON della sezione "Formati") e `schemaInProgetto(s: SchemaGenerato): Progetto`. Materiale `'S275'`, sezione `'IPE 300'`, `KILO = 1000`; vincoli su nodo → `vincolo`, su asta → `vincoloSuAsta`; `svincolate: null` → `sconnessioneNodale(nodo, tipo)`; elenco → `{ astaMaster: prima asta del nodo non elencata, asteSvincolate }`; distribuito con `direzioneDistribuito`; forze `forza`/`forzaInCampata(..., 'globale')`; momenti `momento`/`momentoInCampata` con `mz = verso·coef·1000`; il risultato passa da `migra`.

- [ ] **Step 1: test** — lo schema JSON dell'es. 20 scritto a mano → `confronta(schemaInProgetto(s), atteso20)` perfetto (`atteso20` = lo stesso builder di `test/foto/esercizi.test.ts`, estratto in `test/foto/attesi.ts` e importato da entrambi); sconnessione parziale → `asteSvincolate` = solo l'elencata; distribuito a −90° coefficiente 2 → `q1 = −2000`, `modo 'globaleY'`; forza in campata a 180° → `fx = −1000` in assi globali.
- [ ] **Step 2:** `npx vitest run test/foto/schema.test.ts` → FAIL. **Step 3:** implementare. **Step 4:** PASS; `npx tsc -b` pulito.
- [ ] **Step 5:** commit `foto: dallo schema del generatore al Progetto`.

### Task 4: Scena vettoriale e primitive ideali

**Files:** Create `addestramento/generatore/scena.py` · Test `addestramento/test/test_scena.py`

**Interfaces:**
- Consumes: `Schema`.
- Produces:
  - `Elemento` (dataclass): `classe: int` (id maschera), `forma: str` in `{'linea', 'polilinea', 'cerchio', 'poligono', 'arco', 'testo'}`, `punti: list[tuple[float, float]]` (px, y in basso), `raggio: float = 0`, `spessore: str` in `{'asta', 'simbolo', 'sottile'}`, `pieno: bool = False`, `testo: str = ''`, `angoli: tuple[float, float] | None = None` (arco, gradi), `primitiva: dict | None` (frammento di Primitive in px y-giù, angoli in radianti y-giù).
  - `Scena(elementi: list[Elemento], larghezza: int, altezza: int, scala: float, riquadro: tuple[float, float, float, float])`.
  - `costruisci_scena(schema: Schema, rng, scala: float, stileQuote: str) -> Scena` con `stileQuote in {'catena', 'accanto'}`; `primitive_della_scena(sc: Scena) -> dict` (Primitive in px **y-giù**: chiavi del contratto TS).

**Convenzioni di disegno** (l'inverso delle regole della spec §7 — sono quelle dei fogli d'esame):

| Nel modello | Si disegna |
|---|---|
| cerniera interna completa in un nodo | pallino centrato nel nodo, le aste si fermano sul bordo |
| + vincolo cerniera/carrello nello stesso nodo | come sopra + corpo sotto, attacco a `nodo − r·û` |
| sconnessione parziale (gruppo saldato rettilineo) | pallino accanto all'asta che prosegue, dalla parte dell'asta svincolata, che si ferma sul suo bordo puntando al centro |
| vincolo cerniera/carrello in campata | pallino tangente sotto la linea (`centro = P − r·û`), corpo con attacco a `P − 2r·û` |
| vincolo cerniera/carrello all'estremo | a caso: tangente (come in campata) o centrato con l'asta che vi finisce |
| incastro, bipendolo, pattino, biella | corpo senza pallino, attacco nel nodo |
| bipendolo/pattino interno | corpo interno centrato nel nodo, aste accorciate di metà simbolo |
| distribuito | 3–9 frecce equidistanti (≈ 4 per L), punte sull'asta (o code, se il blocco sta dalla parte verso cui puntano), inviluppo e campitura opzionali, scritta `q`/`2q` oltre le code |
| forza | una freccia di 0.4–0.6 L, punta o coda nel punto, scritta `F`/`2F` vicino alla coda |
| momento | arco di 270°, raggio 0.2–0.3 L, punta col verso giusto, scritta `M` |
| quote `'catena'` | catena orizzontale sotto (o sopra) per tutte le x distinte dei punti notevoli, catena verticale a sinistra (o destra) per le y; linee di richiamo sottili; scritta con valore ed `estremi` = capi della linea di quota |
| quote `'accanto'` | scritta accanto a ogni tratto (fra punti notevoli consecutivi), `estremi` = capi del tratto |
| distrattori | lettere dei nodi (testo), trattini su qualche asta (ausiliaria) |

Raggio del pallino `0.06·scala`, spessore d'asta `0.03·scala`. Valori di quota scritti come nella Fase 1 (`L`, `2L`, `L/2`, `3L/2`, …).

- [ ] **Step 1: test** — trave con cerniera interna completa: un pallino nel nodo, due segmenti d'asta che finiscono a distanza `r` dal centro; carrello in campata: pallino a distanza `r` dalla linea e corpo a `2r`; sconnessione parziale tipo 20-B: pallino a distanza `r` dalla colonna, dalla parte della diagonale; distribuito su 2 L: almeno 3 frecce con le punte (o le code) sull'asta e tutte con la stessa direzione; quote `'catena'`: l'insieme delle x degli `estremi` copre tutte le x distinte dei punti notevoli; tutte le coordinate finite e dentro `larghezza × altezza`; `primitive_della_scena` ha esattamente le chiavi del contratto (`larghezza, altezza, aste, pallini, corpi, frecce, momenti, nodi, scritte`).
- [ ] **Step 2:** pytest → FAIL. **Step 3:** implementare. **Step 4:** PASS.
- [ ] **Step 5:** commit `addestramento: scena vettoriale e primitive ideali`.

### Task 5: Campagna sulle primitive ideali

**Files:**
- Create: `addestramento/generatore/campione.py` (prima versione: `genera(seme, solo_etichette=True, rumore=0.0) -> dict` col JSON del campione, `a_contratto(prim: dict, altezza: int) -> dict`), `addestramento/generatore/__main__.py` (CLI: `--n`, `--seme`, `--uscita`, `--solo-etichette`, `--rumore`, `--galleria` riservato al Task 9)
- Create: `strumenti/foto/campagna.ts` + script `"foto:campagna": "tsx strumenti/foto/campagna.ts"`
- Create: `test/foto/campioni/00001.json … 00040.json` (generati con `--solo-etichette --seme 1 --n 40`), `test/foto/campagna.test.ts`
- Test: `addestramento/test/test_campione.py`

**Interfaces:**
- Consumes: `genera_schema`, `costruisci_scena`, `primitive_della_scena`; TS `leggi`, `confronta`, `schemaInProgetto`.
- Produces: `a_contratto` (y → `altezza − y`, angoli → `−θ`, `verso` invariato); rumore = spostamento uniforme in `[−rumore, +rumore]` px di ogni punto (estremi, centri, attacchi, punte, estremi delle quote).
- `campagna.ts`: `--n 500 --seme 1 --rumore 0`; lancia `$FOTO_PYTHON` (predefinito `../.venv/bin/python`) con `-m generatore --solo-etichette`, legge i JSON, e per famiglia stampa n, % perfetti, correzioni medie; poi i 10 casi peggiori con seme e `differenze`.

- [ ] **Step 1: test** — pytest: `a_contratto` ribalta y e angoli (una freccia verso il basso in y-giù, `+π/2`, diventa `−π/2`); `genera(5)` ha le chiavi `primitive`, `schema`, `meta`. Vitest `campagna.test.ts`: ogni campione di `test/foto/campioni/` letto con `leggi` e confrontato con `schemaInProgetto(schema)` è `perfetto`.
- [ ] **Step 2:** pytest e `npx vitest run test/foto/campagna.test.ts` → FAIL.
- [ ] **Step 3:** implementare `campione.py`, `__main__.py`, `campagna.ts`; generare i 40 campioni.
- [ ] **Step 4:** `npm run foto:campagna -- --n 500` e analisi di ogni caso non perfetto: errore del generatore (convenzione disegnata male → test pytest + correzione) o della lettura (test Vitest col `disegno()` che riproduce il caso + correzione in `src/foto/`). Si ripete fino a 100 % perfetti a rumore 0 sui 500; i casi che restano davvero ambigui si escludono dal generatore, con una riga nel registro.
- [ ] **Step 5:** pytest e vitest → PASS; `npm test`, `npx tsc -b`, `npm run baseline:check` verdi. Annotare in `addestramento/README.md` i numeri della campagna a rumore 0 e 3 px.
- [ ] **Step 6:** commit `foto: campagna sulle primitive del generatore`.

### Task 6: Stili e rasterizzazione

**Files:** Create `addestramento/generatore/stili.py`, `addestramento/generatore/raster.py` · Test `addestramento/test/test_raster.py`

**Interfaces:**
- Produces: `Stile` (dataclass: `nome` in `{'stampato', 'mano', 'quadretti'}`, spessori in px per `asta`/`simbolo`/`sottile`, `tremolio` px, `colore_inchiostro`, `font_testo: list[str]`, `font_mano: list[str]`, varianti dei simboli: `rulli` in `{'cerchietti', 'linea'}`, `incastro` in `{'muro', 'tratteggio'}`, `quota` in `{'frecce', 'trattini'}`); `scegli_stile(rng, nome: str | None = None) -> Stile`; `trova_font() -> tuple[list[str], list[str]]` (stampa, mano); `rasterizza(sc: Scena, stile: Stile, rng) -> tuple[PIL.Image.Image, numpy.ndarray]` (immagine RGB, maschera uint8 delle stesse dimensioni). Immagine disegnata a 2× e ridotta (LANCZOS); maschera a 1× con le priorità dei Global Constraints.

- [ ] **Step 1: test** — per una trave con cerniera, carrello in campata e distribuito: la maschera contiene le classi 1, 3, 4, 5; i pixel a distanza `< spessore/2` dai segmenti d'asta (lontano dai simboli) sono classe 1; il centro di ogni pallino ha un pixel di classe 4 a distanza `r`; stile `'mano'` ≠ `'stampato'` a parità di seme; `rasterizza` con `font_testo = font_mano = []` non lancia e disegna comunque classe 5; stesso seme → stessi byte.
- [ ] **Step 2:** pytest → FAIL. **Step 3:** implementare. **Step 4:** PASS.
- [ ] **Step 5:** commit `addestramento: stili e rasterizzazione`.

### Task 7: Pagina d'esame

**Files:** Create `addestramento/generatore/pagina.py` · Test `addestramento/test/test_pagina.py`

**Interfaces:**
- Produces: `componi_pagina(sc: Scena, stile: Stile, rng) -> tuple[Image, ndarray, dict]` che restituisce l'immagine della pagina, la maschera e un dict con `spostamento: (dx, dy)` (dove è finita la figura) e `riquadro`. La pagina (proporzione A4, 1100–1600 px di larghezza) ha a caso: intestazione d'esame, "Esercizio N", enunciato italiano sotto, riga "GRUPPO X L=… q=…", banda grigia, una seconda figura di sezione (rettangolo, T o doppia T campiti, con quote: classe 6), appunti a penna o matita anche sopra lo schema (classe 5), quadretti per lo stile `'quadretti'` (classe 0). Le primitive restano **solo** quelle dello schema, traslate di `spostamento`.

- [ ] **Step 1: test** — il `riquadro` contiene tutte le primitive traslate; la maschera ha pixel di classe 5 fuori dal riquadro (testo) e, quando c'è la sezione, di classe 6 fuori dal riquadro; nessun pixel di classe 1 fuori dal riquadro; stesso seme → stessi byte.
- [ ] **Step 2:** pytest → FAIL. **Step 3:** implementare. **Step 4:** PASS.
- [ ] **Step 5:** commit `addestramento: pagina d'esame`.

### Task 8: Effetti foto

**Files:** Create `addestramento/generatore/effetti.py` · Test `addestramento/test/test_effetti.py`

**Interfaces:**
- Produces: `Deformazione` con `avanti(punti: ndarray) -> ndarray` e `indietro(punti: ndarray) -> ndarray` (px y-giù), composta da omografia (prospettiva lieve, rotazione ±5°, scala) e piega (spostamento sinusoidale liscio, `indietro` analitico, `avanti` per iterazione di punto fisso); `deformazione_casuale(rng, larghezza, altezza, uscita: tuple[int, int]) -> Deformazione`; `applica(img, maschera, d, rng, sfondo: str) -> tuple[Image, ndarray]` (campionamento con `scipy.ndimage.map_coordinates`, ordine 1 per l'immagine e 0 per la maschera; fuori dal foglio: sfondo tovaglia/scrivania/bordo scuro, classe 0); `fotometria(img, rng) -> Image` (ombra, dominante, sfocatura, rumore, JPEG 40–90, riduzione) che non tocca la maschera; `trasforma_primitive(prim: dict, d: Deformazione) -> dict` (punti con `avanti`, direzioni trasformando un passo di 2 px lungo la direzione, raggi e spessori scalati con la scala locale).

- [ ] **Step 1: test** — `indietro(avanti(p)) ≈ p` entro 0.5 px su 200 punti; dopo `applica` + `trasforma_primitive`, la maschera nei centri dei pallini trasformati (entro `r`) contiene classe 4 e nei punti medi dei segmenti d'asta trasformati (entro 2 px) contiene classe 1, per il 95 % dei casi su 20 semi; `fotometria` lascia invariate le dimensioni; stesso seme → stessi byte.
- [ ] **Step 2:** pytest → FAIL. **Step 3:** implementare. **Step 4:** PASS.
- [ ] **Step 5:** commit `addestramento: effetti foto`.

### Task 9: Campione completo, riga di comando e galleria

**Files:**
- Modify: `addestramento/generatore/campione.py` (`genera(seme, solo_etichette=False, rumore=0.0, stile: str | None = None)` completo: schema → scena → raster → pagina → effetti → `a_contratto`), `addestramento/generatore/__main__.py`
- Create: `addestramento/generatore/galleria.py` · Test `addestramento/test/test_galleria.py`

**Interfaces:**
- Produces: `scrivi(campione: dict, cartella: Path, nome: str) -> None` (`nome.json`, `nome.png`, `nome-maschera.png`); `galleria(campioni: list[dict], percorso: Path, colonne: int = 5) -> None`: per ogni campione l'immagine e accanto la stessa con la maschera a colori semitrasparente e le primitive disegnate (segmenti, pallini, corpi con la freccia d'orientamento, frecce, archi, estremi delle quote); CLI `python -m generatore --n 50 --seme 1 --uscita esiti/prova --galleria`.

- [ ] **Step 1: test** — la CLI con `--n 3 --uscita <tmp>` scrive 3 × 3 file; due esecuzioni con lo stesso seme producono file identici (byte per byte); `--galleria` produce `galleria.png` più grande di zero; ogni `NNNNN.json` scritto si rilegge e ha `meta.riquadro` dentro l'immagine.
- [ ] **Step 2:** pytest → FAIL. **Step 3:** implementare. **Step 4:** PASS.
- [ ] **Step 5: controllo a occhio** — generare 50 campioni con galleria e confrontarli con le foto di `dati-foto/foto/` (18–24 soprattutto): annotare nel README cosa manca rispetto alle foto vere; correggere gli stili per i difetti evidenti (ognuno con un test se tocca le etichette).
- [ ] **Step 6:** `npm test`, `npx tsc -b`, `npm run baseline:check`, pytest verdi; commit `addestramento: campione completo e galleria`.

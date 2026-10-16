# Struttura da foto — Fase 4: dalla rete alla struttura — Piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** dalla foto (grigio in memoria) alle `Primitive` della Fase 1, in TypeScript: prima passata sulla pagina per trovare la figura, seconda sul ritaglio, decodifica delle mappe della rete; e `npm run foto:valuta`, che misura quante foto vere diventano la struttura giusta.

**Architecture:** tutto in `src/foto/rete/`, codice puro su array (nessuna immagine, nessun file): l'app (Fase 5) e gli strumenti in Node lo usano allo stesso modo. La rete si esegue con onnxruntime-web dietro una funzione `esegui(tensore) → uscite`, così le prove sostituiscono la rete con le uscite ideali (i bersagli di Python). Le foto si convertono in grigio (PGM) da Python solo per gli strumenti in Node, in una cartella temporanea che si cancella.

**Tech Stack:** TypeScript (vitest, tsx), onnxruntime-web 1.30.0 (MIT; download da approvare prima del Task 6), Python dell'ambiente `addestramento/.venv` per le fixture e la conversione delle immagini.

**Spec:** `docs/superpowers/specs/2026-10-14-struttura-da-foto-design.md` (§4 pipeline e contratti, §5 pagina e localizzazione, §6 uscite, §10 valutazione). Contratto della rete: `addestramento/rete/vocabolario.py` e `public/modelli/foto.json`. Fase 3: `docs/superpowers/plans/2026-10-15-struttura-da-foto-fase3.md`.

## Global Constraints

- Nessuna modifica sotto `src/core/`; `npm test`, `npx tsc -b`, `npm run baseline:check` verdi; pytest verde.
- `dati-foto/` mai in git; le uscite di `foto:valuta` vanno in `dati-foto/esiti/`; le immagini convertite in una cartella temporanea cancellata alla fine.
- La foto non si salva mai (R2): le funzioni di `src/foto/rete/` lavorano su array in memoria e non scrivono niente.
- Ingresso della rete: grigio ITU-R 601 in [0, 1], 1 = bianco, lato lungo **768** px (pagina e ritaglio), completato di bianco a destra e in basso fino a multipli di 32 (`foto.json`).
- Margine del ritaglio attorno alla figura: **15 %** del lato lungo del riquadro (come `rete/guarda.py`).
- Verso dei momenti: centri = massimo dei canali 16 e 17; punta = il picco del canale freccia più vicino al centro fra **6 e 90 px**; raggio = |punta − centro|; antiorario se (punta − centro) × direzione > 0 (y su); quella punta non diventa una Freccia (`foto.json`, `momenti`).
- Soglia dei picchi **0.3** (massimi locali 3×3), come in Python.
- Coordinate: le mappe e le celle sono in pixel y giù (centro della cella = passo·colonna + (passo − 1)/2); le `Primitive` in uscita sono y su (y = altezza − y_giù), angoli del contratto.
- Divisione del banco di prova (§10), coppie dello stesso esercizio insieme: **sviluppo** 01–08, 18, 19, 22; **prova** 09–17, 20, 21, 23, 24. Le soglie della decodifica si tarano solo su sviluppo.
- Obiettivo v1 (§10): in media ≤ 2 correzioni per esercizio sulla metà di prova.

Scelte rispetto alla spec, da riportare nel registro come `Ruling:`:
1. onnxruntime-web anche in Node (non onnxruntime-node): un solo pacchetto, e la valutazione prova lo stesso runtime dell'app. Se non gira in Node, onnxruntime-node solo per gli strumenti, dietro la stessa `esegui`.
2. Pagina (§5.1): la rete è addestrata con prospettiva, pieghe e ombre, quindi niente bordi del foglio né normalizzazione della luce; si corregge la **rotazione** stimandola dalle aste lette (mediana pesata dello scarto dal multiplo di 90° più vicino). Prospettiva vera solo se `foto:valuta` la mostra necessaria.
3. Sovrapposizioni di `foto:valuta` in SVG che richiamano la foto originale (`../foto/NN.*`) senza copiarla.

## Review Focus

1. **Foto senza schema** (pagina di solo testo, foto vuota): `riconosci` restituisce `{ esito: 'nessunoSchema' }` senza eccezioni → test nel Task 6.
2. **Immagini molto piccole o molto grandi** (screenshot da 300 px, foto da 4000 px): `riduci` porta il lato lungo a 768 senza perdere le linee sottili (media d'area in riduzione) e il tensore ha lati multipli di 32 → test nel Task 5.
3. **Più figure nel foglio** (sezione trasversale, secondo esercizio): `trovaFigure` le restituisce tutte e mette prima quella con aste e almeno un vincolo → test nel Task 5.
4. **Punta del momento vicina a una forza**: si toglie dalle frecce una sola punta per momento, la più vicina, e le altre restano forze → test nel Task 3.
5. **Foto ruotata di qualche grado**: dopo `raddrizza` le aste orizzontali e verticali tornano tali e la lettura dà lo stesso schema → test nel Task 5.

---

### Task 1: Fixture per la decodifica e conversione delle immagini (Python)

**Files:** Create `addestramento/rete/fixture_ts.py` (`python -m rete.fixture_ts`), `addestramento/rete/grigi.py` (`python -m rete.grigi`) · Test `addestramento/test/test_fixture_ts.py` · Create (generati) `test/foto/campioni-rete/`

**Interfaces:**
- Produces: in `test/foto/campioni-rete/`:
  - `ideale-NNNNNNN.json` per 10 ritagli (`modo='ritaglio'`, `rari=True`, semi 2 000 001–2 000 010) e 3 pagine (`modo='pagina'`, semi 2 000 101–2 000 103), con le uscite **ideali** costruite dai bersagli sull'immagine intera completata a multipli di 32: `{"larghezza", "altezza", "H", "W", "seg": {"forma": [h2, w2], "rle": [classe, quanti, …]}, "testa": {"forma": [43, h4, w4], "voci": [[canale, riga, colonna, valore], …]}, "primitive", "schema", "riquadro"}` (voci con |valore| > 1e-3, 4 decimali; `riquadro` in px y giù);
  - `foto-2000201.pgm.gz` + `foto-2000201.json` (`primitive`, `schema`, `riquadro`): una foto sintetica intera (`modo='foto'`) per la prova con la rete vera.
- `python -m rete.grigi --foto DIR --uscita DIR`: ogni immagine diventa `NOME.pgm` (P5, grigio PIL `L`); `--sintetici N --seme S`: N foto `modo='foto'` con `NNNNNNN.pgm` e `NNNNNNN.json` (`primitive`, `schema`, `riquadro`).

- [ ] **Step 1: test** — `test_rle_e_sparse_tornano_indietro` (dalla fixture si ricostruiscono `seg` e `mappe` uguali a `costruisci`, a meno di 1e-3); `test_pgm` (un'immagine 5×3 nota → header `P5\n5 3\n255\n` e i 15 byte del grigio PIL); `test_fixture_scritte` (13 `ideale-*.json` e la coppia `foto-*`; ogni ideale ha almeno un'asta, un corpo e una scritta; nessun file oltre 400 KB).
- [ ] **Step 2:** pytest → FAIL. **Step 3:** implementare e generare le fixture. **Step 4:** PASS.
- [ ] **Step 5:** commit `foto: fixture per la decodifica della rete`.

### Task 2: Vocabolario e tensori in TypeScript

**Files:** Create `src/foto/rete/vocabolario.ts`, `src/foto/rete/tensori.ts`, `test/foto/aiuti-rete.ts` · Test `test/foto/rete-tensori.test.ts`

**Interfaces:**
- `vocabolario.ts`: `TIPI_CORPO: TipoCorpo[]`, `SCRITTE: { famiglia: 'L'|'q'|'F'|'M'; valore: number }[]` (20, ordine di Python), costanti `PALLINO, RAGGIO, CORPO0, COS_CORPO, SIN_CORPO, FRECCIA, COS_FRECCIA, SIN_FRECCIA, LUNG_FRECCIA, MOMENTO0, NODO, SCRITTA0, QUOTA0, CANALI = 43, CLASSI = 7`, `CLASSE = { sfondo: 0, asta: 1, ausiliaria: 2, carico: 3, simbolo: 4, testo: 5, altro: 6 }`, scale `SCALA_RAGGIO = 10, SCALA_LUNGHEZZA = 100, SCALA_QUOTA = 100`, `PASSO_SEG = 2, PASSO_TESTA = 4`, `SOGLIA = 0.3`.
- `tensori.ts`: `interface Uscite { seg: Uint8Array; h2: number; w2: number; testa: Float32Array; h4: number; w4: number }` (seg = classe per cella, testa = 43 × h4 × w4 come esce da `predici`); `canale(u, k): Float32Array` (vista); `massimoCanali(u, canali: number[]): Float32Array`; `picchi(m: Float32Array, h, w, soglia = SOGLIA): { i: number; j: number; v: number }[]`; `centroCella(i, j, passo = PASSO_TESTA): { x: number; y: number }` (y giù); `segDaLogit(logit: Float32Array, h2, w2): Uint8Array` (argmax sui 7 canali).
- `aiuti-rete.ts`: `caricaIdeale(nome): { uscite: Uscite; larghezza; altezza; primitive: Primitive; schema: SchemaGenerato; riquadro: [number, number, number, number] }`, `nomiIdeali(): string[]`.

- [ ] **Step 1: test** — l'ordine dei canali e dei tipi coincide con `public/modelli/foto.json` (nomi, `tipo`, `famiglia`, `valore`/`coefficiente`); `picchi` su una mappa 10×10 fatta a mano ([2,3]=0.9, [2,4]=0.5, [7,7]=0.2, [6,1]=0.4) dà esattamente (2,3) e (6,1); `centroCella(2,3)` = (13.5, 9.5); `segDaLogit` sceglie la classe col logit maggiore; `caricaIdeale` di ogni fixture ricostruisce `testa` con il picco 1 dove la primitiva cade.
- [ ] **Step 2:** FAIL. **Step 3:** implementare. **Step 4:** PASS.
- [ ] **Step 5:** commit `foto: vocabolario e tensori della rete in TypeScript`.

### Task 3: Decodifica dei punti (pallini, vincoli, frecce, momenti, scritte, nodi)

**Files:** Create `src/foto/rete/puntuali.ts` · Test `test/foto/rete-puntuali.test.ts`

**Interfaces:**
- Consumes: Task 2.
- Produces: `interface Puntuali { pallini: Pallino[]; corpi: CorpoVincolo[]; frecce: Freccia[]; momenti: ArcoMomento[]; scritte: Scritta[]; nodi: Punto[] }` in **px y giù** (angoli già nel contratto, y su: è `decodifica` del Task 4 a ribaltare le y); `decodificaPuntuali(u: Uscite): Puntuali`.
- Regole: pallini dal canale 0 (r = canale 1 × 10); corpi dai picchi del massimo dei canali 2–9, tipo = argmax nella cella del picco, angolo = atan2(sin, cos) dei canali 10–11; frecce dai picchi del canale 12, direzione dai canali 13–14, lunghezza = canale 15 × 100; momenti dai picchi del massimo dei canali 16–17 con punta, raggio e verso per la regola dei Global Constraints, e la punta usata esce dalle frecce; scritte dai picchi del massimo dei canali 19–38, valore = argmax (`{famiglia:'L', valore}` o `{famiglia, coefficiente}`), per le L `estremi` = centro + (canali 39–42 × 100) (dy in y su); nodi dai picchi del canale 18; `confidenza` = valore del picco.

- [ ] **Step 1: test** — su ogni fixture ideale ogni primitiva vera si ritrova entro 4 px (pallini col raggio entro 1 px, corpi col tipo giusto e angolo entro 3°, frecce con direzione entro 3° e lunghezza entro 3 px, scritte col valore giusto e gli estremi entro 4 px); i momenti hanno il verso giusto (tutti) e raggio > 0; `frecce.length` = numero di frecce vere (le punte dei momenti non diventano frecce); `review focus 4`: una mappa sintetica con un momento e una forza la cui punta sta a 30 px dal centro e la punta dell'arco a 20 px → il momento prende la punta a 20 px e la forza resta.
- [ ] **Step 2:** FAIL. **Step 3:** implementare. **Step 4:** PASS.
- [ ] **Step 5:** commit `foto: decodifica di pallini, vincoli, frecce, momenti e scritte`.

### Task 4: Aste dalla segmentazione, e `decodifica` completa

**Files:** Create `src/foto/rete/aste.ts`, `src/foto/rete/decodifica.ts` · Test `test/foto/rete-decodifica.test.ts`

**Interfaces:**
- Consumes: Task 2, Task 3.
- Produces: `tracciaAste(u: Uscite, nodi: Punto[]): SegmentoAsta[]` (px y giù); `decodifica(u: Uscite, dim: { larghezza: number; altezza: number }): Primitive` (y su; scarta ciò che cade fuori da `larghezza × altezza`, cioè nel riempimento).
- Algoritmo di `tracciaAste` (non lo determinano firma e test):
  ```
  vertici = nodi
  per ogni coppia (a, b) con |ab| ≥ 10 px:
      campioni ogni 2 px lungo ab; un campione è "coperto" se nella seg (passo 2)
      c'è una cella di classe asta entro 1 cella
      accetta se coperti ≥ 85 %
  togli (a, b) se esiste un vertice c a meno di 6 px dal segmento ab (fuori dagli estremi)
      con (a, c) e (c, b) entrambe accettate
  spessore = 2 × (larghezza media, in celle, della fascia di asta attraversata
      perpendicolarmente nei punti a 1/4, 1/2, 3/4)
  ```

- [ ] **Step 1: test** — su ogni fixture ideale di ritaglio ogni asta vera ha un segmento con entrambi gli estremi entro 6 px e non ci sono segmenti in più (precisione ≥ 95 % sul totale); `leggi(decodifica(...))` confrontato con `schemaInProgetto(schema)` è **perfetto in almeno 9 fixture su 10** e nessuna lettura dà `erroreLettura`; lo spessore stimato sta fra 0.5× e 2× quello vero.
- [ ] **Step 2:** FAIL. **Step 3:** implementare. **Step 4:** PASS.
- [ ] **Step 5:** commit `foto: aste dalla segmentazione e decodifica completa`.

### Task 5: Ingresso, figura e raddrizzamento

**Files:** Create `src/foto/rete/ingresso.ts`, `src/foto/rete/figura.ts`, `src/foto/rete/raddrizza.ts` · Test `test/foto/rete-ingresso.test.ts`

**Interfaces:**
- `ingresso.ts`: `interface Grigio { dati: Uint8Array; larghezza: number; altezza: number }`; `riduci(g: Grigio, lato = 768): { grigio: Grigio; scala: number }` (media d'area se riduce, bilineare se ingrandisce); `tensore(g: Grigio): { dati: Float32Array; H: number; W: number }` (valori /255, bianco fino a multipli di 32); `ritaglia(g: Grigio, r: Riquadro, margine = 0.15): { grigio: Grigio; origine: { x: number; y: number } }` (bianco fuori dalla foto); `grigioDaRGBA(rgba: Uint8ClampedArray, larghezza, altezza): Grigio` (ITU-R 601, per il browser).
- `figura.ts`: `interface Riquadro { x0: number; y0: number; x1: number; y1: number }`; `trovaFigure(u: Uscite): { riquadro: Riquadro; aste: number; simboli: number }[]` in px dell'ingresso: celle di disegno (asta, simbolo, carico, ausiliaria) unite per vicinanza (dilatazione di 3 celle), una figura per componente; prima quelle con aste e almeno un picco di corpo dentro, poi per numero di celle d'asta; il riquadro si allarga a testo e ausiliaria entro 4 celle.
- `raddrizza.ts`: `raddrizza(p: Primitive): { primitive: Primitive; angolo: number }`: angolo = mediana, pesata per lunghezza, dello scarto di ogni asta dal multiplo di 90° più vicino (solo scarti < 10°); si ruotano attorno al centro dell'immagine tutti i punti e si correggono `angolo` dei corpi e `direzione` delle frecce; sotto 0.3° non si tocca niente.

- [ ] **Step 1: test** — `riduci` di un'immagine 4000×3000 con una riga nera larga 5 px dà 768×576 con la riga ancora scura (< 128) e di uno screenshot 300×200 dà 768×512; `tensore` ha `H`, `W` multipli di 32 e 1 nel riempimento; `ritaglia` oltre il bordo riempie di 255; `grigioDaRGBA` di (255,0,0) dà 76; `trovaFigure` sulle 3 fixture di pagina mette per prima una figura con IoU ≥ 0.6 rispetto a `riquadro`; con la seg di una pagina e un secondo gruppo di sole celle «altro» e «ausiliaria» (sezione), la figura strutturale resta prima (review focus 3); `raddrizza` delle primitive di 5 fixture ruotate di +4° e −3° attorno al centro ritrova l'angolo entro 0.3° e `leggi` dà lo stesso confronto perfetto delle primitive originali (review focus 5).
- [ ] **Step 2:** FAIL. **Step 3:** implementare. **Step 4:** PASS.
- [ ] **Step 5:** commit `foto: ingresso, figure e raddrizzamento`.

### Task 6: Rete in esecuzione e `riconosci`

**Prima del task:** chiedere a Davide il permesso di scaricare `onnxruntime-web@1.30.0` dal registro npm (MIT, ~145 MB in `node_modules`; nel browser si scarica solo la variante WASM).

**Files:** Modify `package.json` (dipendenza `onnxruntime-web`) · Create `src/foto/rete/onnx.ts`, `src/foto/rete/riconosci.ts` · Test `test/foto/rete-riconosci.test.ts`

**Interfaces:**
- `onnx.ts`: `type Esegui = (t: { dati: Float32Array; H: number; W: number }) => Promise<Uscite>`; `creaEsecutore(modello: Uint8Array | string): Promise<Esegui>` (import dinamico di onnxruntime-web, backend wasm, 1 thread in Node; converte `seg` con `segDaLogit`).
- `riconosci.ts`: `riconosci(g: Grigio, esegui: Esegui): Promise<Riconoscimento>` con `type Riconoscimento = { esito: 'ok'; primitive: Primitive; riquadro: Riquadro; figure: Riquadro[]; angolo: number } | { esito: 'nessunoSchema'; figure: Riquadro[] }`: pagina a 768 → `trovaFigure` → riquadro riportato in px della foto → `ritaglia` (15 %) → ritaglio a 768 → `decodifica` → `raddrizza`. `riquadro` e `figure` in px della foto originale.

- [ ] **Step 1: test** — con onnxruntime-web in Node e `public/modelli/foto.onnx`: un tensore bianco 1×1×256×320 dà `seg` 128×160 e `testa` 43 × 64 × 80; `riconosci` della foto bianca 800×600 → `nessunoSchema` (review focus 1); `riconosci` di `foto-2000201.pgm.gz` → `esito: 'ok'`, riquadro con IoU ≥ 0.5 rispetto a quello vero, e `leggi(primitive)` confrontato con lo schema richiede al più 3 correzioni; `riconosci` con un `esegui` finto che restituisce le uscite ideali di una fixture di pagina e poi del ritaglio arriva a una lettura perfetta.
- [ ] **Step 2:** FAIL. **Step 3:** implementare. **Step 4:** PASS.
- [ ] **Step 5:** commit `foto: la rete in esecuzione e riconosci`.

### Task 7: `npm run foto:valuta` e taratura su sviluppo

**Files:** Create `strumenti/foto/valuta.ts` · Modify `package.json` (`"foto:valuta": "tsx strumenti/foto/valuta.ts"`), `dati-foto/LEGGIMI.md` (fuori da git), `addestramento/README.md` · Test `test/foto/valuta.test.ts` (solo le funzioni pure: `tabella`, `svg`)

**Interfaces:**
- `npm run foto:valuta -- [--meta sviluppo|prova|tutte] [--sintetici N]`: converte le foto con `python -m rete.grigi` in una cartella temporanea (cancellata alla fine, anche in caso d'errore); per ogni foto `riconosci` → `leggi` → `confronta` con `dati-foto/atteso/NN.vektor` (`deserializza`); stampa per foto: correzioni, perfetto, `perCategoria`, avvisi principali; poi media delle correzioni e % di perfetti per metà. Scrive in `dati-foto/esiti/`: `NN.vektor` (la struttura letta, da aprire in VektorLab), `NN.json` (primitive, avvisi, riquadro, differenze), `NN.svg` (foto originale per riferimento + riquadro + aste, pallini, corpi, frecce, momenti, scritte decodificati). Con `--sintetici N` la stessa misura su N foto sintetiche (`modo='foto'`, semi da 3 000 001) contro il loro schema.
- Funzioni esportate per i test: `tabella(righe: RigaValuta[]): string`, `svg(foto: string, larghezza, altezza, r: Riconoscimento): string`.

- [ ] **Step 1: test** — `tabella` di due righe finte calcola media e % di perfetti; `svg` contiene `<image href="../foto/01.png"`, un `<rect>` per il riquadro e un elemento per ogni primitiva.
- [ ] **Step 2:** FAIL. **Step 3:** implementare. **Step 4:** PASS.
- [ ] **Step 5:** eseguire `npm run foto:valuta -- --meta sviluppo --sintetici 50`; guardare gli errori delle foto di sviluppo e tarare SOLO le soglie della decodifica (copertura delle aste, distanza delle punte dei momenti, dilatazione delle figure); ogni cambio con il suo test. Poi una sola esecuzione su `--meta prova`.
- [ ] **Step 6:** README (sezione «Fase 4»: tabella di sviluppo e di prova, sintetico, errori tipici e cosa migliorare) e `dati-foto/LEGGIMI.md` (come aprire `esiti/NN.vektor` e `NN.svg`). `npm test`, `npx tsc -b`, `npm run baseline:check`, pytest verdi.
- [ ] **Step 7:** commit `foto: valutazione sulle foto vere`.

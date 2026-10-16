# Struttura da foto — Fase 5: la foto nell'app (telefono) — Piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** dal tasto fotocamera del telefono alla struttura disegnata nel piano di lavoro: foto (scatto o galleria) → riquadro dello schema, ritoccabile → riconoscimento in un Web Worker → aste, nodi, vincoli e carichi al posto del disegno attuale, annullabili con un tocco, con l'elenco delle cose da controllare.

**Architecture:** il thread principale decodifica la foto (`createImageBitmap`, lato lungo al più 2400 px), la porta in grigio e TRASFERISCE i byte al worker `src/worker/foto.worker.ts`, che tiene la rete (onnxruntime-web/wasm, caricata al primo uso con barra di avanzamento) e la foto in memoria fra la prima passata (figure) e la seconda (lettura). La logica del worker è una funzione pura (`src/foto/app/servizio.ts`) provata in Node con una rete finta; il worker è un guscio. Il risultato entra nello store del foglio corrente come UN comando (`Struttura da foto`) che sostituisce il progetto: Annulla rimette il disegno di prima.

**Tech Stack:** React 19 + zustand (app esistente), Vite 8 (worker `type: 'module'`, asset `?url`), onnxruntime-web 1.30.0 (`onnxruntime-web/wasm`), vitest (Node), Playwright (già nel progetto) per la prova sul telefono contro la build (`npm run preview`).

**Spec:** `docs/superpowers/specs/2026-10-14-struttura-da-foto-design.md` §1, §2 (R1, R2, R5, R6), §5.4, §11 — con le decisioni di Davide del 2026-10-16 che la **cambiano**: (a) la funzione è **solo per il telefono** (sul computer non si vede niente: né tasto, né trascinamento, né incolla); (b) il risultato si **disegna nel piano di lavoro del foglio corrente**, non in un foglio o documento nuovo; (c) se il piano ha già un disegno lo **sostituisce**, con una sola operazione annullabile. Fase 4: `docs/superpowers/plans/2026-10-16-struttura-da-foto-fase4.md`.

## Global Constraints

- Telefono = `usaTelefono()` (`(max-width: 720px)`); su schermo largo nessun elemento della funzione è montato.
- R2: la foto non si conserva mai. Niente `localStorage`/`sessionStorage`/`indexedDB`/`caches`/`fetch` d'invio nei file della funzione; l'`ImageBitmap` si chiude (`close()`) appena letta; il worker dimentica il grigio dopo la lettura o all'annullamento; la foto non entra nel progetto, nella cronologia, nel `.vektor`. L'unica richiesta di rete è `GET /modelli/foto.onnx` (e il `.wasm`), che il browser mette in cache HTTP.
- R1: tutto nel browser, nessun server.
- R5: obiettivo < 3 s dal «Riconosci» al disegno su un telefono medio (escluso il primo scaricamento); si misura su computer e si annota.
- R6: rete + runtime ≤ ~8 MB compressi; nessun byte di onnxruntime nel pacchetto principale (import dinamico nel worker).
- Decodifica: lato lungo della foto decodificata al più **2400 px**; grigio ITU-R 601 composto su bianco (alfa).
- Comando: etichetta **`Struttura da foto`**; dopo il comando `casoCorrente` = primo caso del nuovo progetto e la vista si inquadra.
- Testi dell'interfaccia in italiano; la scritta di privacy nel pannello: «La foto resta sul telefono e non viene salvata.».
- Nessuna modifica sotto `src/core/`; `npm test`, `npx tsc -b`, `npm run baseline:check`, `npm run build` verdi.

Scelte da registrare come `Ruling:` all'esecuzione:
1. Decodifica e grigio nel thread principale, al worker solo i byte del grigio: `OffscreenCanvas` nei worker manca su Safari più vecchi; i byte trasferiti non si copiano.
2. «Elementi incerti in arancione» (§11) diventa l'elenco «Da controllare»: toccando una voce si selezionano gli elementi coinvolti (la selezione è già evidenziata). Un'evidenziazione arancione permanente toccherebbe `src/render/` e lo stato del foglio: dopo la v1, se serve.
3. Il «foglio raddrizzato» del riquadro (§11) è la foto com'è: la pagina non si raddrizza (ruling della Fase 4).

## Review Focus

1. **Foto senza schema** (un muro, una pagina di solo testo): messaggio «Nella foto non ho trovato uno schema», il disegno attuale resta com'era e non entra nessun comando → test nel Task 3 (servizio) e nel Task 5 (prova sul telefono con un'immagine bianca).
2. **Foto enorme** (48 MP): si decodifica a 2400 px di lato lungo senza esaurire la memoria → test nel Task 1 (`dimensioniDecodifica`).
3. **Primo uso senza rete** (modello non scaricabile): messaggio «Non riesco a scaricare il riconoscitore: serve la connessione la prima volta», niente cambia → test nel Task 3.
4. **Lo studente annulla al riquadro**: il worker dimentica la foto, il disegno resta → test nel Task 3 e nel Task 5.
5. **Annulla dopo il disegno**: torna esattamente il disegno di prima, compresi materiali, sezioni e casi → test nel Task 2.

---

### Task 1: Le due passate separate, grigio con l'alfa, avvisi legati agli elementi

**Files:** Modify `src/foto/rete/riconosci.ts`, `src/foto/rete/ingresso.ts`, `src/foto/traduci.ts`, `src/foto/index.ts` · Create `src/foto/app/decodifica.ts` · Test `test/foto/rete-riconosci.test.ts`, `test/foto/rete-ingresso.test.ts`, `test/foto/traduci.test.ts`, `test/foto/app-decodifica.test.ts`

**Interfaces:**
- `riconosci.ts`: `trovaSchemi(g: Grigio, esegui: Esegui): Promise<{ figure: Figura[]; scelta: number }>` (figure in px della foto, con `aste`, `simboli`, `vincoli`; `scelta` = indice della prima con aste e vincolo, −1 se nessuna); `leggiRiquadro(g: Grigio, r: Riquadro, esegui: Esegui): Promise<{ primitive: Primitive; angolo: number; ritaglio: { origine; scala } }>`; `riconosci` resta e le usa (stesso risultato di prima).
- `ingresso.ts`: `grigioDaRGBA` compone su bianco: L·a/255 + (255 − a).
- `index.ts`: `EsitoLettura` acquista `nodiDaPunti: Record<string, NodeId>` (id del punto del grafo → id del nodo del progetto), riempito da `traduci`.
- `app/decodifica.ts`: `dimensioniDecodifica(larghezza: number, altezza: number, massimo = 2400): { larghezza: number; altezza: number }`.

- [ ] **Step 1: test** — `trovaSchemi` + `leggiRiquadro` sulla foto sintetica di prova danno le stesse primitive di `riconosci`; la foto bianca dà `scelta: −1`; `grigioDaRGBA` di un pixel trasparente (0,0,0,0) dà 255 e di (0,0,0,128) dà 127; `leggi` di un disegno con un avviso `versoIncerto` su un punto dà in `nodiDaPunti[punto]` un id di nodo che esiste nel progetto; `dimensioniDecodifica(8000, 6000)` = 2400×1800, `(1000, 800)` invariato.
- [ ] **Step 2:** FAIL. **Step 3:** implementare. **Step 4:** PASS (anche i test della Fase 4).
- [ ] **Step 5:** commit `foto: due passate separate, grigio con l'alfa, avvisi legati ai nodi`.

### Task 2: Il comando «Struttura da foto»

**Files:** Create `src/foto/app/disegna.ts` · Test `test/foto/app-disegna.test.ts`

**Interfaces:**
- `comandoDaFoto(nuovo: Progetto): Comando` (etichetta `Struttura da foto`; `esegui` ricorda il progetto che sostituisce e restituisce `nuovo`; `annulla` restituisce quello ricordato).
- `disegnaDaFoto(store: UseBoundStore<StoreApi<Stato>>, nuovo: Progetto): void`: `esegui(comandoDaFoto(nuovo))`, poi `impostaCasoCorrente(nuovo.casi[0].id)` e `inquadraTutto()`.

- [ ] **Step 1: test** — con uno store da `creaStore()` caricato col portale degli esempi: `disegnaDaFoto` mette il progetto nuovo, `passato` cresce di 1 con etichetta `Struttura da foto`, `casoCorrente` è un caso del nuovo progetto; `annulla()` rimette un progetto `toEqual` a quello di prima (nodi, aste, vincoli, carichi, materiali, sezioni, casi) (review focus 5); `rifai()` lo rimette; il progetto serializzato (`serializza`) non contiene `avvisi` né niente della foto.
- [ ] **Step 2:** FAIL. **Step 3:** implementare. **Step 4:** PASS.
- [ ] **Step 5:** commit `foto: il comando che disegna la struttura letta`.

### Task 3: Il servizio del worker

**Files:** Create `src/foto/app/protocollo.ts`, `src/foto/app/servizio.ts`, `src/worker/foto.worker.ts`, `src/foto/app/ponte.ts` · Modify `src/foto/rete/onnx.ts` · Test `test/foto/app-servizio.test.ts`

**Interfaces:**
- `protocollo.ts`:
  - Richieste: `{ tipo: 'foto'; dati: Uint8Array; larghezza: number; altezza: number }` · `{ tipo: 'leggi'; riquadro: Riquadro }` · `{ tipo: 'dimentica' }`.
  - Risposte: `{ tipo: 'avanzamento'; fase: 'scarico' | 'cerco' | 'leggo'; fatto?: number; totale?: number }` · `{ tipo: 'figure'; figure: Figura[]; scelta: number }` · `{ tipo: 'nessunoSchema' }` · `{ tipo: 'letto'; progetto: Progetto; avvisi: Avviso[]; nodiDaPunti: Record<string, NodeId> }` · `{ tipo: 'errore'; messaggio: string }`.
- `servizio.ts`: `creaServizio(dip: { scaricaModello: (avanza: (fatto: number, totale?: number) => void) => Promise<Uint8Array>; creaEsegui: (modello: Uint8Array) => Promise<Esegui> }): { gestisci(r: Richiesta, rispondi: (x: Risposta) => void): Promise<void>; haFoto(): boolean }` — la rete si crea alla prima `foto` (una volta sola); `foto` → `trovaSchemi` → `figure` o `nessunoSchema` (e in quel caso dimentica la foto); `leggi` → `leggiRiquadro` → `leggi()` della Fase 1 → `letto`, poi dimentica; `dimentica` dimentica; ogni eccezione → `errore` con testo italiano, e la foto si dimentica.
- `onnx.ts`: `creaEsecutore(modello, opzioni: { thread?: number; wasm?: string })` imposta `ort.env.wasm.wasmPaths = { wasm }` quando dato.
- `foto.worker.ts`: guscio: `scaricaModello` con `fetch('/modelli/foto.onnx')` letto a pezzi (avanzamento da `content-length`), `wasm` da `import wasm from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url'`; `self.onmessage` → `servizio.gestisci`.
- `ponte.ts`: `class PonteFoto { invia(r: Richiesta, trasferisci?: Transferable[]): void; ascolta(f: (x: Risposta) => void): () => void; chiudi(): void }` (crea il worker al primo `invia`).

- [ ] **Step 1: test** (con `esegui` finto che restituisce le uscite ideali di una fixture di pagina, poi del ritaglio) — `foto` risponde `avanzamento` (scarico, cerco) e `figure` con `scelta ≥ 0`; `leggi` risponde `letto` con un progetto con almeno un'asta e poi `haFoto()` è falso; una foto bianca risponde `nessunoSchema` e `haFoto()` è falso (review focus 1); `dimentica` dopo `figure` → `haFoto()` falso (review focus 4); `scaricaModello` che rifiuta → `errore` con «Non riesco a scaricare il riconoscitore: serve la connessione la prima volta» (review focus 3); due `foto` di seguito creano la rete una volta sola.
- [ ] **Step 2:** FAIL. **Step 3:** implementare. **Step 4:** PASS; `npx tsc -b`.
- [ ] **Step 5:** commit `foto: il worker del riconoscimento`.

### Task 4: Il pannello sul telefono

**Files:** Create `src/ui/FotoTelefono.tsx`, `src/ui/AvvisiFoto.tsx` · Modify `src/ui/App.tsx` (il tasto `onFoto` apre il pannello, montato solo se `usaTelefono()`), `src/stile.css` · Test: Task 5 (prova sul telefono) e `npm run build`

**Interfaces:**
- `FotoTelefono({ chiudi, disegnato }: { chiudi: () => void; disegnato: (avvisi: AvvisoApp[]) => void })` — passi: **scegli** (bottoni «Scatta» — `<input type="file" accept="image/*" capture="environment">` — e «Galleria» — senza `capture`; la scritta di privacy) → **scarico/cerco** (barra con la percentuale dello scaricamento, poi «Cerco lo schema…») → **riquadro** (la foto rimpicciolita in un `<canvas>`, le figure tratteggiate, quella scelta piena; un tocco sceglie un'altra figura; quattro maniglie agli angoli la ritoccano; «Riconosci» e «Annulla») → **leggo** («Leggo lo schema…») → `disegnaDaFoto(useFogli.getState().foglioAttivo().store, progetto)`, `disegnato(avvisi)`, `chiudi()`. `nessunoSchema` → «Nella foto non ho trovato uno schema» e si torna a **scegli**; `errore` → il messaggio e si torna a **scegli**. Chiudendo: `ponte.invia({ tipo: 'dimentica' })`, la tela d'anteprima si svuota.
- Decodifica: `createImageBitmap(file, { imageOrientation: 'from-image' })` → `dimensioniDecodifica` → canvas → `getImageData` → `grigioDaRGBA` → `bitmap.close()` → `invia({ tipo: 'foto', … }, [dati.buffer])`.
- `AvvisiFoto({ avvisi, chiudi }: { avvisi: AvvisoApp[]; chiudi: () => void })` con `type AvvisoApp = { messaggio: string; nodi: NodeId[] }`: striscia in basso «Da controllare: N» che si apre in elenco; un tocco su una voce fa `seleziona({ nodi })`; si chiude a mano o cambiando foglio. Vive nello stato di `App`, non nello store né nel `.vektor`.

- [ ] **Step 1:** implementare; `npx tsc -b`, `npm run build` verdi; il pacchetto principale non contiene `onnxruntime` (`grep -L ort-wasm dist/assets/index-*.js`).
- [ ] **Step 2:** commit `foto: il pannello della foto sul telefono`.

### Task 5: Privacy, prova sul telefono, misure

**Files:** Create `test/foto/privacy.test.ts`, `strumenti/foto/provaTelefono.ts` · Modify `package.json` (`"foto:telefono": "tsx strumenti/foto/provaTelefono.ts"`), `test/foto/campioni-rete/` (una foto sintetica in JPEG per la prova, da `python -m rete.fixture_ts`), `addestramento/rete/fixture_ts.py`, `addestramento/README.md`

**Interfaces:**
- `privacy.test.ts`: nei file `src/foto/app/*`, `src/worker/foto.worker.ts`, `src/ui/FotoTelefono.tsx`, `src/ui/AvvisiFoto.tsx` non compaiono `localStorage`, `sessionStorage`, `indexedDB`, `caches.`, `sendBeacon`, `XMLHttpRequest`, `WebSocket`; `fetch(` compare solo con `'/modelli/foto.onnx'`; `FotoTelefono.tsx` chiama `close()` sulla bitmap.
- `npm run foto:telefono` (con `npm run preview` acceso): Playwright, viewport 390×844 con tocco: tasto «Struttura da foto» → «Galleria» → `setInputFiles` con `foto-2000201.jpg` → attende il riquadro → «Riconosci» → la striscia «Da controllare» o il messaggio di fine compare e lo schema è disegnato (il conteggio delle aste nello store di sviluppo non esiste in produzione: si controlla che il canvas non sia più quello vuoto confrontando due screenshot) → Annulla della cronologia → il canvas torna come prima; poi un'immagine bianca → «Nella foto non ho trovato uno schema»; poi a 1280×800 il tasto non esiste. Stampa i tempi (scaricamento, prima passata, lettura) e salva le schermate in `screenshots/foto-telefono/`.

- [ ] **Step 1: test** — `privacy.test.ts` (RED finché i file non rispettano le regole: si scrive per primo e si guarda fallire su un `localStorage` messo apposta, poi si toglie).
- [ ] **Step 2:** `npm run preview` (con `preview_start` `vektorlab-prod`) e `npm run foto:telefono` → tutte le verifiche passano; guardare le schermate.
- [ ] **Step 3:** README (sezione «Fase 5»: come si usa, tempi misurati, pesi scaricati: modello e `.wasm` compressi, cosa resta da provare su un telefono vero). `npm test`, `npx tsc -b`, `npm run baseline:check`, `npm run build`, pytest verdi.
- [ ] **Step 4:** commit `foto: privacy e prova sul telefono`.

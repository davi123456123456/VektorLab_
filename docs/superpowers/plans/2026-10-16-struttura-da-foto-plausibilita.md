# Struttura da foto — revisore di plausibilità — Piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** prima di disegnare, un passo che corregge le letture impossibili per un esercizio d'esame usando sia le regole di Davide sia quanto era sicura la rete: niente pattini esterni né bielle, incastri solo dove un'asta finisce, nessun pezzo staccato, struttura non labile.

**Architecture:** `rivedi(primitive)` in `src/foto/plausibilita.ts` legge le primitive con `leggi()`, guarda il risultato (grafo e progetto), corregge le PRIMITIVE (tipo di un corpo, un segmento d'asta che manca) e rilegge; ogni correzione diventa un avviso `revisione`. Il tipo alternativo di un vincolo è quello che la rete stessa dava come più probabile dopo il primo: per questo la decodifica conserva i punteggi di tutti i tipi.

**Tech Stack:** TypeScript (vitest); `analizzaCinematica` di `src/core` (solo lettura, il motore non si tocca).

**Spec:** `docs/superpowers/specs/2026-10-14-struttura-da-foto-design.md` §3 (vincoli), §7 (regole); decisioni di Davide del 2026-10-16: (a) negli esami non ci sono pattino esterno, biella, molla — i vincoli interni possono esserci tutti; (b) l'incastro sta dove un'asta finisce, mai a metà asta né fra due aste allineate a 180°; (c) aste separate con niente in mezzo sono un pezzo dimenticato: vanno collegate; (d) gli esercizi non sono labili.

## Global Constraints

- Tipi esterni ammessi: `triangolo`, `triangoloRulli`, `incastro`, `doppioPendolo`; esclusi `pattino`, `biella`. Interni ammessi tutti (`doppioPendoloInterno`, `pattinoInterno`, cerniere).
- Ripiego senza punteggi: `pattino` → `doppioPendolo`, `biella` → `triangoloRulli`, `incastro` fuori posto → `triangolo`.
- Incastro ammesso in un punto con una sola asta, o in uno spigolo (due aste non allineate); no a metà asta, fra due aste allineate (scarto < 10° da 180°), in un nodo con tre aste o più.
- Collegamento dei pezzi: la coppia più vicina fra un estremo libero di un pezzo e un punto dell'altro; segmento con lo spessore tipico; avviso «Ho aggiunto un tratto d'asta che mancava fra due pezzi: controllalo».
- Labilità: si provano i cambi di tipo di un vincolo (poi di due) in ordine di punteggio perso; si accetta il primo che rende la struttura non labile; se nessuno basta, avviso «La struttura letta è labile: controlla i vincoli», senza cambiare niente.
- Nessuna correzione su una lettura già plausibile: le letture ideali (`test/foto/campioni`, `campioni-foto`) restano identiche.
- Nessuna modifica sotto `src/core/`; `npm test`, `npx tsc -b`, `npm run baseline:check`, `npm run build` verdi.

## Review Focus

1. **Una struttura giusta non si tocca** (40 + 10 letture ideali): `rivedi` non cambia niente → test nel Task 2.
2. **Due pezzi lontani che sono davvero due cose** (es. una sezione rimasta nel riquadro): si collegano comunque, ma con l'avviso → test nel Task 2.
3. **Labile perché manca un vincolo** (la rete non l'ha visto): nessun cambio a caso, solo l'avviso → test nel Task 2.
4. **Incastro a uno spigolo di telaio**: resta → test nel Task 2.
5. **Tempo**: la ricerca sulla labilità non deve rallentare la lettura oltre ~100 ms → misura nel Task 3.

---

### Task 1: I punteggi dei tipi di vincolo

**Files:** Modify `src/foto/tipi.ts` (`CorpoVincolo.punteggi?: Partial<Record<TipoCorpo, number>>`; `CodiceAvviso` + `'revisione'`), `src/foto/rete/puntuali.ts` · Test `test/foto/rete-puntuali.test.ts`

- [ ] **Step 1: test** — sulle uscite ideali ogni corpo decodificato ha `punteggi` con 8 voci e il suo `tipo` è quello col punteggio più alto.
- [ ] **Step 2:** FAIL. **Step 3:** implementare. **Step 4:** PASS. **Step 5:** commit `foto: i punteggi di tutti i tipi di vincolo`.

### Task 2: Il revisore

**Files:** Create `src/foto/plausibilita.ts` · Test `test/foto/plausibilita.test.ts`

**Interfaces:** `rivedi(p: Primitive): { lettura: EsitoLettura; primitive: Primitive; correzioni: Avviso[] }` — `lettura.avvisi` comprende le correzioni (codice `revisione`, `punti` = il punto del grafo finale più vicino all'elemento corretto).

- [ ] **Step 1: test** (con `disegno()` di `test/foto/aiuti.ts`) — pattino esterno coi punteggi {pattino 0.6, doppioPendolo 0.3} → doppio pendolo; biella senza punteggi → carrello; pattino interno resta; incastro a metà trave {incastro 0.5, triangolo 0.3} → cerniera; incastro fra due aste allineate → cerniera; incastro all'estremo e a uno spigolo restano; trave in due pezzi allineati (0–1, 1.3–2) → un pezzo solo e un avviso; trave su due carrelli con {triangoloRulli 0.5, triangolo 0.45} su uno → quel carrello diventa cerniera e la struttura non è labile; trave con un solo carrello (manca un vincolo, punteggi netti) → nessun cambio, avviso «labile»; le 40 letture ideali di `test/foto/campioni` e le 10 di `campioni-foto` escono identiche (stessi confronti, nessuna correzione).
- [ ] **Step 2:** FAIL. **Step 3:** implementare. **Step 4:** PASS. **Step 5:** commit `foto: revisore di plausibilità`.

### Task 3: Nel motore, e quanto serve

**Files:** Modify `src/foto/app/servizio.ts` (dopo `leggiRiquadro` si usa `rivedi`), `strumenti/foto/valuta.ts` (`--senza-revisione` per confrontare), `addestramento/README.md`

- [ ] **Step 1: test** — nel test del servizio la risposta `letto` porta gli avvisi `revisione` quando ci sono (rete finta con un pattino).
- [ ] **Step 2:** implementare; `npm run foto:valuta -- --meta sviluppo` con e senza revisione: tabella nel README; poi una sola esecuzione su prova. Tempo medio di `rivedi` sulle foto di sviluppo.
- [ ] **Step 3:** `npm test`, `tsc`, `baseline:check`, `build`, `foto:telefono` verdi. Commit `foto: il revisore nel motore`.

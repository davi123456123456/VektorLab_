# Struttura da foto — Fase 1: lettura deterministica — Piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** dalle primitive che la rete produrrà (segmenti d'asta, pallini, corpi di vincolo, frecce, archi, scritte) ottenere un `Progetto` di VektorLab corretto, più gli strumenti per misurarlo sulle foto vere.

**Architecture:** quattro stadi puri in `src/foto/`: `costruisciGrafo` (tracciamento + regole del pallino) → `leggiCarichi` → `associaQuote` + `misura` (tratti → posizioni in L) → `traduci` (builder esistente). Il `Grafo` intermedio ha come archi i **tratti** (pezzi rettilinei fra punti notevoli consecutivi); i **membri** nascono solo in `traduci`. `confronta` misura le correzioni necessarie fra due `Progetto`.

**Tech Stack:** TypeScript strict, Vitest, `tsx`; nucleo VektorLab in sola lettura (`progetto()`, `migra`, `verificaIntegrita`, `espandi`, `gruppiSconnessione`, `risolviLU`).

**Spec:** `docs/superpowers/specs/2026-10-14-struttura-da-foto-design.md`

## Tabella di marcia (le fasi successive avranno ciascuna il proprio piano)

| Fase | Contenuto | Prodotto verificabile |
|---|---|---|
| **1 (questo piano)** | contratti, regole di lettura, metrica, traduzione, confronto, banco di prova reale, Salva/Apri `.vektor` | `leggi(primitive)` → `Progetto` corretto sulle ricostruzioni di esercizi veri |
| 2 | generatore sintetico Python (strutture, stili, pagine d'esame, etichette, galleria) + campagna: primitive ideali del generatore → `leggi` → `confronta` | galleria + % di letture perfette su migliaia di schemi |
| 3 | rete multi-testa, addestramento, esportazione ONNX | metriche sulla validazione sintetica |
| 4 | decodifica tensori → `Primitive`, pagina e localizzazione, `npm run foto:valuta` | correzioni medie sulle foto vere |
| 5 | integrazione nell'app (worker, riquadro, foglio nuovo, avvisi, privacy) | tasto fotocamera funzionante |

## Global Constraints

- Nessuna modifica sotto `src/core/`: `npm run baseline:check` resta verde (R4).
- `dati-foto/` è esclusa da git: foto e soluzioni degli esercizi veri non entrano nel repository pubblico.
- Identificatori, commenti e messaggi in italiano, nello stile del codice esistente.
- `Primitive`: coordinate in pixel con **y verso l'alto** (il ribaltamento lo farà la decodifica, una volta sola). Angoli in radianti.
- `PuntoGrafo.pos`: unità di L con y verso l'alto; L = 1 m, quindi i metri del `Progetto` coincidono con le L.
- Angolo dei vincoli: convenzione di VektorLab, direzione di puntamento, `û(α) = (−sin α, cos α)`.
- Valori: `q = 1000 N/m`, `F = 1000 N`, `M = 1000 N·m`, moltiplicati per il coefficiente letto.
- Materiale e sezione del modello letto: `'S275'`, `'IPE 300'` (i predefiniti dello store). Nome: `'Da foto'`.
- `npx tsc -b` pulito e `npm test` verde alla fine di ogni compito.

## Review Focus

1. **Scala del disegno**: lo stesso esercizio a 40 px/L o a 400 px/L deve dare lo stesso `Progetto` → test di invarianza di scala nel Compito 7.
2. **Disegno ruotato di qualche grado** (prospettiva corretta male) → stesso `Progetto` con rotazione di 3° → test nel Compito 7.
3. **Primitive vuote o senza vincoli** → `Progetto` vuoto con avviso `nessunaAsta`, mai un'eccezione → test nel Compito 7.
4. **Rilevazioni doppie** (tratto a mano ripassato, due picchi per lo stesso pallino) → fuse → test nei Compiti 2 e 3.
5. **Quota che non si aggancia a nessun punto** (quota di una sezione vicina) → scartata con avviso `quotaNonLetta` → test nel Compito 5.

---

### Task 1: Contratti, tolleranze, geometria e disegni di prova

**Files:**
- Create: `src/foto/tipi.ts`, `src/foto/parametri.ts`, `src/foto/geometria.ts`
- Create: `test/foto/aiuti.ts` (DSL per costruire `Primitive` leggibili nei test)
- Test: `test/foto/geometria.test.ts`

**Interfaces:**
- Produces (`tipi.ts`), usati da tutti i compiti:

```ts
export interface Punto { x: number; y: number }
export interface SegmentoAsta { a: Punto; b: Punto; spessore: number; confidenza: number }
export interface Pallino { c: Punto; r: number; confidenza: number }
export type TipoCorpo = 'triangolo' | 'triangoloRulli' | 'incastro' | 'doppioPendolo'
  | 'pattino' | 'biella' | 'doppioPendoloInterno' | 'pattinoInterno';
export interface CorpoVincolo { tipo: TipoCorpo; attacco: Punto; angolo: number; confidenza: number }
export interface Freccia { punta: Punto; direzione: number; lunghezza: number; confidenza: number }
export interface ArcoMomento { centro: Punto; raggio: number; verso: 'orario' | 'antiorario'; confidenza: number }
export type ValoreScritta =
  | { famiglia: 'L'; valore: number }
  | { famiglia: 'q' | 'F' | 'M'; coefficiente: number }
  | { famiglia: 'altro' };
export interface Scritta { centro: Punto; valore: ValoreScritta; estremi?: [Punto, Punto]; confidenza: number }
export interface Primitive {
  larghezza: number; altezza: number;
  aste: SegmentoAsta[]; pallini: Pallino[]; corpi: CorpoVincolo[];
  frecce: Freccia[]; momenti: ArcoMomento[]; nodi: Punto[]; scritte: Scritta[];
}
export type CodiceAvviso = 'nessunaAsta' | 'simboloIsolato' | 'cernieraAmbigua'
  | 'partizioneNonRappresentabile' | 'versoIncerto' | 'coefficienteNonLetto'
  | 'caricoNonAgganciato' | 'quotaNonLetta' | 'quoteIncoerenti' | 'nessunaQuota'
  | 'integrita';
export interface Avviso { codice: CodiceAvviso; messaggio: string; punti?: string[] }
export interface PuntoGrafo { id: string; px: Punto; pos?: Punto }
export interface TrattoGrafo { id: string; i: string; j: string }
export interface GiuntoGrafo { punto: string; tipo: 'cerniera' | 'bipendolo' | 'pattino'; gruppi: string[][] } // id di tratti
export interface VincoloGrafo { punto: string; tipo: 'incastro' | 'cerniera' | 'carrello' | 'bipendolo' | 'pattino' | 'biella'; angolo: number }
export type CaricoGrafo =
  | { tipo: 'distribuito'; da: string; a: string; direzione: number; coefficiente: number }
  | { tipo: 'forza'; punto: string; direzione: number; coefficiente: number }
  | { tipo: 'momento'; punto: string; verso: 1 | -1; coefficiente: number };
export interface QuotaGrafo { da: string; a: string; valore: number; direzione: 'x' | 'y' | 'asta' }
export interface Grafo {
  punti: PuntoGrafo[]; tratti: TrattoGrafo[]; giunti: GiuntoGrafo[];
  vincoli: VincoloGrafo[]; carichi: CaricoGrafo[]; quote: QuotaGrafo[]; avvisi: Avviso[];
}
```

- Produces (`parametri.ts`): `interface Tolleranze { tau: number; tauColonne: number; raggioTipico: number; spessoreTipico: number }` e `tolleranze(p: Primitive): Tolleranze`. Con `diag = hypot(larghezza, altezza)`: `spessoreTipico` = mediana degli spessori (senza aste: `0.004·diag`); `raggioTipico` = mediana dei raggi (senza pallini: `2·spessoreTipico`); `tau = max(3·spessoreTipico, 0.75·raggioTipico, 0.008·diag)`; `tauColonne = max(tau, 0.012·diag)`. Commento: sono valori di partenza, si tarano sulla metà di sviluppo.
- Produces (`geometria.ts`): `distanza(a,b)`, `proiezione(p,a,b): { t: number; punto: Punto; distanza: number }` (t non limitato, distanza dalla retta), `distanzaSegmento(p,a,b)`, `angoloDi(a,b)`, `differenzaAngoli(a,b)` in [0, π], `agganciaAngolo(a, passo, soglia)`, `raggruppa1D(valori, tolleranza): number[]` (indice di gruppo per valore, collegamento singolo sui valori ordinati, gruppi numerati in ordine crescente).
- Produces (`test/foto/aiuti.ts`): `disegno(scala = 100)` con i metodi in unità di L, y verso l'alto: `asta(x1,y1,x2,y2)`, `cerniera(x,y)` (pallino centrato: gli estremi d'asta che vi finiscono vengono accorciati di r), `appoggio(tipo, x, y, gradi, { pallino = true, interrompe = false })`, `corpo(tipo, x, y, gradi)`, `freccia(xp, yp, gradi, lung = 0.4)`, `distribuito(x1,y1,x2,y2, gradi, { n = 5, punte = true })`, `momento(x,y,verso)`, `quota(valore, x1,y1,x2,y2)`, `scritta(famiglia, coef, x, y)`, `ruota(gradi)`, `primitive(): Primitive`. Spessore 3 px, raggio pallino 0.06·scala.

- [ ] **Step 1: test di geometria** — `test/foto/geometria.test.ts`: `proiezione({x:5,y:3},{x:0,y:0},{x:10,y:0})` → `t = 0.5`, `distanza = 3`; `differenzaAngoli(0.1, 2π−0.1)` ≈ 0.2; `agganciaAngolo(91°, 45°, 5°)` = 90°, `agganciaAngolo(80°, 45°, 5°)` = 80°; `raggruppa1D([0, 2, 100, 103, 250], 5)` = `[0,0,1,1,2]`; `tolleranze` di un `disegno()` con un'asta lunga 1 L dà `tau ≥ 9` (3·spessore).
- [ ] **Step 2:** `npx vitest run test/foto/geometria.test.ts` → FAIL (moduli assenti).
- [ ] **Step 3:** implementare `tipi.ts`, `parametri.ts`, `geometria.ts`, `aiuti.ts`.
- [ ] **Step 4:** stesso comando → PASS; `npx tsc -b` pulito.
- [ ] **Step 5:** commit `foto: contratti, tolleranze, geometria`.

### Task 2: Lettura dei pallini

**Files:** Create `src/foto/letture/pallini.ts` · Test `test/foto/pallini.test.ts`

**Interfaces:**
- Consumes: `Primitive`, `Tolleranze`, geometria.
- Produces:

```ts
export type EsitoPallino = 'cerniera' | 'accanto' | 'appoggiato' | 'estremo' | 'isolato';
export interface EstremoRef { segmento: number; estremo: 'a' | 'b' }
export interface LetturaPallino {
  indice: number; esito: EsitoPallino;
  terminano: EstremoRef[];                      // estremi d'asta che finiscono sul pallino
  passanti: { segmento: number; t: number }[];  // aste che proseguono, t del punto di contatto
  corpo: number | null;                          // indice del corpo esterno "sotto"
}
export function leggiPallini(p: Primitive, tol: Tolleranze): LetturaPallino[];
```

Pallini a distanza fra i centri < r si fondono prima (si tiene il più confidente). Classificazione di ogni segmento vicino a un pallino (c, r):

```
dRetta = proiezione(c, a, b).distanza ; dEstremo = min(|c−a|, |c−b|) ; t = proiezione(c,a,b).t
termina  ⇔ dRetta < 0.5·r  e  dEstremo < r + tau
passa    ⇔ 0.5·r ≤ dRetta ≤ 1.5·r + tau  e  0 < t < 1   (contatto = proiezione)
esito: k = #termina, h = #passa
  k ≥ 2, h = 0 → 'cerniera' · k ≥ 1, h ≥ 1 → 'accanto' · k = 0, h ≥ 1 → 'appoggiato'
  k = 1, h = 0 → 'estremo'  · altrimenti  → 'isolato'
```

`corpo`: il corpo non interno con `attacco` più vicino al centro entro `2.5·r + tau`, altrimenti `null`.

- [ ] **Step 1: test, uno per riga della tabella della spec §7**: due aste che finiscono su una `cerniera` → `'cerniera'`, `corpo = null`; cerniera con triangolo sotto → `'cerniera'`, `corpo` = indice del triangolo; con rulli → idem col triangolo con rulli; colonna continua con diagonale che finisce sul pallino accanto (es. 20 in B) → `'accanto'`, `terminano.length = 1`, `passanti.length = 1`; trave continua con `appoggio('triangoloRulli', 1, 0, 0)` → `'appoggiato'`, `t ≈ 1/3` sulla trave 0–3; asta che finisce su un appoggio → `'estremo'`; pallino lontano da tutto → `'isolato'`; due pallini sovrapposti di 1 px → una sola lettura.
- [ ] **Step 2:** `npx vitest run test/foto/pallini.test.ts` → FAIL.
- [ ] **Step 3:** implementare `leggiPallini`.
- [ ] **Step 4:** → PASS.
- [ ] **Step 5:** commit `foto: lettura dei pallini`.

### Task 3: Costruzione del grafo (tracciamento e vincoli)

**Files:** Create `src/foto/letture/grafo.ts` · Test `test/foto/grafo.test.ts`

**Interfaces:**
- Consumes: `leggiPallini`, `Tolleranze`, tipi.
- Produces: `costruisciGrafo(p: Primitive, tol: Tolleranze): Grafo` (con `pos` non ancora assegnate, `carichi` e `quote` vuoti) e `inserisciPunto(g: Grafo, trattoId: string, px: Punto): string` (spezza il tratto e restituisce l'id del punto; se un punto esistente dista < tau, restituisce quello).

Ordine delle operazioni (ciascuna ha almeno un test):
1. Segmenti quasi coincidenti (paralleli entro 5°, distanza < spessore + 2 px, sovrapposti) → fusi (tratto ripassato a mano).
2. Corpi interni (`doppioPendoloInterno`, `pattinoInterno`): due estremi entro `tau + raggioTipico` dall'attacco, da parti opposte → consumati; punto nell'attacco; giunto `bipendolo`/`pattino` con un gruppo per lato.
3. Pallini, secondo `leggiPallini`: `cerniera` → punto nel centro, estremi che terminano lì, giunto `cerniera` con un gruppo per tratto; `accanto` → punto di contatto sull'asta che prosegue (spezzata), gli estremi che terminano vi si collegano, giunto `cerniera` con gruppi `[[tratti dell'asta che prosegue], [ciascun tratto che termina]]`; `appoggiato` → asta spezzata nel punto di contatto, nessun giunto; `estremo` → estremo nel centro; `isolato` → avviso `simboloIsolato`.
4. Estremi non consumati a distanza < tau → stesso punto (spigolo o incrocio, saldati).
5. Estremo a distanza < tau dall'interno di un altro segmento → incrocio a T (il segmento si spezza).
6. Due estremi liberi, allineati entro 10°, buco < 4·tau, nessun pallino o corpo nel buco → richiusi (un punto solo).
7. Vincoli: corpo del pallino → vincolo nel punto del pallino; corpi esterni senza pallino → estremo più vicino entro 2·tau, altrimenti punto inserito sull'asta più vicina entro 2·tau, altrimenti avviso `simboloIsolato`. Tipo: `triangolo→cerniera`, `triangoloRulli→carrello`, `incastro`, `doppioPendolo→bipendolo`, `pattino`, `biella`. Angolo `agganciaAngolo(angolo, 45°, 10°)`, poi arrotondato al grado.
8. `appoggiato` su un punto dove due tratti formano uno spigolo → avviso `cernieraAmbigua` con quel punto.

- [ ] **Step 1: test**: portale a L (spigolo) → 3 punti, 2 tratti, nessun giunto; incrocio a T → 4 punti, 3 tratti; tratto a mano con buco di 2·tau e nessun simbolo → 2 tratti uniti in un punto, nessun giunto (la fusione in un'asta sola la fa `traduci`); buco su una `cerniera` → giunto `cerniera` con 2 gruppi; il caso 20-B → giunto con gruppi `[[col_giù, col_su], [diagonale]]`; trave continua con carrello appoggiato in mezzeria → vincolo `carrello` angolo 0 sul punto di mezzeria, nessun giunto; cerniera con triangolo sotto e due aste → giunto `cerniera` **e** vincolo `cerniera`; incastro all'estremo senza pallino → vincolo `incastro`; doppio pendolo interno su trave → giunto `bipendolo`; carrello disegnato a 92° → angolo 90°; tratto ripassato due volte → 1 tratto; appoggio con pallino sotto uno spigolo → avviso `cernieraAmbigua`.
- [ ] **Step 2:** `npx vitest run test/foto/grafo.test.ts` → FAIL.
- [ ] **Step 3:** implementare `costruisciGrafo` e `inserisciPunto`.
- [ ] **Step 4:** → PASS.
- [ ] **Step 5:** commit `foto: tracciamento delle aste e regole del pallino`.

### Task 4: Carichi

**Files:** Create `src/foto/letture/carichi.ts` · Test `test/foto/carichi.test.ts`

**Interfaces:**
- Consumes: `Grafo`, `inserisciPunto`, `Primitive.frecce/momenti/scritte`.
- Produces: `leggiCarichi(g: Grafo, p: Primitive, tol: Tolleranze): void` (riempie `g.carichi`, aggiunge punti e avvisi).

Regole:
1. **Aggancio**: punta o coda entro `1.5·tau` da un tratto; altrimenti il primo tratto incontrato lungo l'asse della freccia entro una `lunghezza`; altrimenti avviso `caricoNonAgganciato`.
2. **Gruppi**: stessa direzione (≤ 15°), agganci sulla stessa retta, distanza fra agganci consecutivi ≤ 2.5 × la mediana del gruppo.
3. Gruppo con **≥ 3 frecce → distribuito**: estremi alla prima e all'ultima freccia, agganciati a un punto esistente entro 0.6 × passo, altrimenti `inserisciPunto`; direzione = media, `agganciaAngolo(·, 90°, 10°)` e poi `(·, 45°, 7°)`.
4. Gruppi da 1–2 frecce → **forze** nel punto d'aggancio (esistente entro tau, altrimenti inserito). Se cadono dentro l'estensione di un distribuito sulla stessa retta con verso opposto → scartate con avviso `versoIncerto`.
5. **Momenti**: punto esistente entro `2·raggio` dal centro, altrimenti proiezione sul tratto più vicino (inserito); `antiorario → +1`, `orario → −1`.
6. **Coefficienti**: a ogni carico la scritta più vicina della famiglia giusta (`distribuito→q`, `forza→F`, `momento→M`) entro `6·tau`, ciascuna usata una volta sola (abbinamento goloso per distanza crescente); altrimenti 1 con avviso `coefficienteNonLetto`.

- [ ] **Step 1: test**: 5 frecce in giù con le punte sulla trave → un distribuito, direzione −90°, estremi sui punti esistenti; blocco a destra di una colonna con le **code** sull'asta e frecce verso destra (es. 6) → direzione 0°; due gruppi affiancati giù/su (es. 16) → due distribuiti con direzioni −90° e +90°; freccia singola su un estremo → forza in quel punto; freccia singola a metà trave → forza con punto inserito; freccia contraria isolata dentro un distribuito → scartata e avviso `versoIncerto`; momento antiorario su un nodo → `verso = 1`; momento in campata → punto inserito; scritta `2q` vicina → coefficiente 2; nessuna scritta → coefficiente 1 e avviso `coefficienteNonLetto`.
- [ ] **Step 2:** `npx vitest run test/foto/carichi.test.ts` → FAIL.
- [ ] **Step 3:** implementare `leggiCarichi`.
- [ ] **Step 4:** → PASS.
- [ ] **Step 5:** commit `foto: carichi distribuiti, forze e momenti`.

### Task 5: Metrica — dai tratti alle posizioni

**Files:** Create `src/foto/metrica.ts` · Test `test/foto/metrica.test.ts`

**Interfaces:**
- Consumes: `Grafo`, `Primitive.scritte`, `Tolleranze`, `risolviLU` da `src/core/linalg/lu.ts` (sola lettura).
- Produces: `associaQuote(g: Grafo, p: Primitive, tol: Tolleranze): void` (riempie `g.quote`) e `misura(g: Grafo, tol: Tolleranze): void` (assegna `pos` a **tutti** i punti).

`associaQuote`: per ogni scritta `L` con `estremi`: `|dx| > 3|dy|` → `'x'`, `|dy| > 3|dx|` → `'y'`, altrimenti `'asta'`. Per `'x'` ciascun estremo si abbina al punto con x più vicina entro `tauColonne` (per `'y'` la y; per `'asta'` il punto più vicino). Estremo senza punto → quota scartata, avviso `quotaNonLetta`. Scritte `L` senza `estremi` → scartate con lo stesso avviso.

`misura`:

```
colonne = raggruppa1D(px.x dei punti, tauColonne) ; righe = idem su px.y
incognite: X[colonna], Y[riga]   (in L)
scala s [px/L] = mediana(|Δpx| / valore) sulle quote; senza quote: mediana delle lunghezze
                 dei tratti rettilinei massimali = 1 L, e avviso 'nessunaQuota'
equazioni (minimi quadrati pesati, eq. normali risolte con risolviLU):
  quota 'x':  X[cb] − X[ca] = ±valore                    peso 100
  quota 'y':  Y[rb] − Y[ra] = ±valore                    peso 100
  quota 'asta' su retta di angolo θ (agganciato a 45°):  ΔX = v·cosθ, ΔY = v·sinθ   peso 100
  colonne consecutive: X[c+1] − X[c] = Δpx / s           peso 1   (idem righe)
  tratto a 45° ± 7°:  ΔX = ±ΔY                            peso 10
  ancoraggio: X[0] = 0, Y[0] = 0                          peso 1000
passo = 1/2, oppure 1/mcm(2, denominatori delle quote lette)
X, Y arrotondati al multiplo di passo; due colonne che collassano → la seconda spostata di un passo
residuo di una quota > 0.1·valore → avviso 'quoteIncoerenti'
pos dei punti = (X[colonna], Y[riga]); i punti intermedi di un tratto inclinato si riproiettano sulla sua retta
```

- [ ] **Step 1: test**: trave dell'es. 19 (A, B, C, D con quote L, L, L) → x = 0, 1, 2, 3; schema tipo 18 con quote verticali L/2 + L/2 e orizzontali L/2, L/2, L → posizioni esatte; diagonale non quotata dell'es. 20 → B = (0, 1), G = (2, 0) (lunghezza √5 per geometria); totale 2L sopra parziali L + L → nessun avviso, totale 3L → avviso `quoteIncoerenti`; nessuna quota, aste da 100 px e 200 px → lunghezze 1 e 2 con avviso `nessunaQuota`; tratto non quotato di 150 px con s = 100 px/L → 1.5; asta a 46° → ΔX = ΔY; quota con L/3 → passo 1/6; quota il cui estremo non tocca nessun punto → avviso `quotaNonLetta` e nessuna eccezione.
- [ ] **Step 2:** `npx vitest run test/foto/metrica.test.ts` → FAIL.
- [ ] **Step 3:** implementare `associaQuote` e `misura`.
- [ ] **Step 4:** → PASS.
- [ ] **Step 5:** commit `foto: metrica dai tratti alle posizioni`.

### Task 6: Confronto fra due Progetto

**Files:** Create `src/foto/confronto.ts` · Test `test/foto/confronto.test.ts`

**Interfaces:**
- Consumes: `espandi`, `gruppiSconnessione` dal nucleo (sola lettura); `Progetto`.
- Produces:

```ts
export type Categoria = 'aste' | 'vincoli' | 'orientamenti' | 'sconnessioni' | 'carichi';
export interface Confronto {
  correzioni: number; perfetto: boolean;
  perCategoria: Record<Categoria, { attesi: number; trovati: number; giusti: number }>;
  differenze: string[];   // frasi tipo "manca il carrello in (2, 0)"
}
export function confronta(ottenuto: Progetto, atteso: Progetto): Confronto;
```

**Forma normale** (comune ai due modelli): `espandi` → pezzi fra punti; si fondono i pezzi collineari che si incontrano in un punto di grado 2 senza vincoli, sconnessioni né carichi puntuali. Ogni pezzo = coppia non ordinata di punti arrotondati a 1e-6. Vincoli = (punto, tipo) + angolo a parte; sconnessioni = (punto, tipo, numero di gruppi); carichi = (tipo, punto/i, direzione arrotondata al grado, valore). **Allineamento**: si prova ogni traslazione che porta un nodo dell'ottenuto su un nodo dell'atteso e si tiene quella con più pezzi coincidenti. Correzioni = mancanti + in più per pezzi, vincoli, sconnessioni e carichi; un tipo sbagliato nello stesso punto conta 1; un orientamento sbagliato conta 1 in `orientamenti`.

- [ ] **Step 1: test**: modello identico → 0, `perfetto`; copia traslata di (5, 3) → 0; carrello mancante → 1; cerniera al posto del carrello → 1; carrello girato di 90° → 1 in `orientamenti`; trave con `vincoloSuAsta` in mezzeria contro la stessa trave spezzata in due aste con il vincolo sul nodo → 0 (equivalenti); distribuito col verso invertito → 1; cerniera interna in più → 1.
- [ ] **Step 2:** `npx vitest run test/foto/confronto.test.ts` → FAIL.
- [ ] **Step 3:** implementare `confronta`.
- [ ] **Step 4:** → PASS.
- [ ] **Step 5:** commit `foto: confronto e conteggio delle correzioni`.

### Task 7: Traduzione in Progetto e `leggi`

**Files:** Create `src/foto/traduci.ts`, `src/foto/index.ts` · Test `test/foto/traduci.test.ts`, `test/foto/esercizi.test.ts`

**Interfaces:**
- Consumes: tutti i compiti precedenti; `progetto()`, `migra`, `verificaIntegrita` dal nucleo.
- Produces:

```ts
export interface EsitoLettura { progetto: Progetto; avvisi: Avviso[]; grafo: Grafo }
export function traduci(g: Grafo): { progetto: Progetto; avvisi: Avviso[] };
export function leggi(p: Primitive): EsitoLettura;
// leggi = tolleranze → costruisciGrafo → leggiCarichi → associaQuote → misura → traduci
```

`traduci`:
1. **Nodi del Progetto** = punti di grado ≠ 2, oppure di grado 2 con tratti non collineari (> 2°), oppure con un giunto. Gli altri punti sono **intermedi**.
2. Catene di tratti fra due nodi → un'asta (`'S275'`, `'IPE 300'`); gli intermedi diventano ascisse `s` = distanza / lunghezza.
3. Vincolo su nodo → `vincolo()`; su intermedio → `vincoloSuAsta(asta, s, tipo, angolo)`.
4. Giunto → `sconnessioneNodale(nodo, tipo, opzioni)`: tutti i gruppi singoli → nessuna opzione; un gruppo con ≥ 2 aste e gli altri singoli → `astaMaster` = prima del gruppo grande, `asteSvincolate` = aste dei gruppi singoli; più gruppi con ≥ 2 aste → avviso `partizioneNonRappresentabile` e giunto completo.
5. Distribuito fra `da` e `a` → un carico per ogni asta attraversata, con le sue `s1`/`s2`. Direzione −90°/+90° → `modo 'globaleY'`, `q = ±coef·1000`; 0°/180° → `'globaleX'`; altrimenti `modo 'angolo'`, `alpha = direzione`, `q = coef·1000`.
6. Forza → `forza(nodo, fx, fy)` oppure `forzaInCampata(asta, s, fx, fy, 'globale')` con `(fx, fy) = coef·1000·(cos, sin)`. Momento → `momento` / `momentoInCampata` con `mz = verso·coef·1000`.
7. Nome `'Da foto'`; il risultato passa da `migra`; le anomalie di `verificaIntegrita` diventano avvisi `integrita`.

- [ ] **Step 1: test di traduzione** (`traduci.test.ts`): trave continua con carrelli intermedi → **una** asta e `vincoliSuAsta` alle ascisse 1/3 e 2/3; caso 20-B → `asteSvincolate` contiene solo la diagonale; distribuito che scavalca un appoggio intermedio → un solo carico con `s1`/`s2` giusti; forza 2F verso sinistra → `fx = −2000`; momento orario coefficiente 1 → `mz = −1000`; primitive vuote → `Progetto` senza aste, avviso `nessunaAsta`, nessuna eccezione.
- [ ] **Step 2: test sugli esercizi veri** (`esercizi.test.ts`), ricostruiti con `disegno()` come li produrrebbe una rete perfetta e confrontati con `confronta(...)`, che deve dare `perfetto`, contro il `Progetto` atteso scritto col builder: **19** (trave con F in A, carrello-cerniera-carrello, quote L L L), **20** (telaio con diagonale incernierata in B, cerniera interna in D, q sul tratto D–E), **24** (incastro in A, momento in campata, cerniera nello spigolo B, cerniera a soffitto in C), **16** (due incastri, tre carrelli, q giù e q su affiancati). Per ciascuno, in più: invarianza di scala (`disegno(40)` e `disegno(400)` → stesso esito), rotazione di 3° → stesso esito, `analizzaCinematica` sul risultato non lancia eccezioni.
- [ ] **Step 3:** `npx vitest run test/foto/` → FAIL sui nuovi test.
- [ ] **Step 4:** implementare `traduci` e `leggi`.
- [ ] **Step 5:** `npx vitest run test/foto/` → PASS; `npm test` verde; `npm run baseline:check` verde; `npx tsc -b` pulito.
- [ ] **Step 6:** commit `foto: traduzione in Progetto e lettura completa`.

### Task 8: Salva e Apri file `.vektor`

**Files:** Create `src/state/file.ts` · Modify `src/ui/BarraFogli.tsx` · Test `test/unit/file.test.ts`

**Interfaces:**
- Produces: `serializza(p: Progetto): string` (JSON indentato di 2) e `deserializza(testo: string): { progetto: Progetto } | { errore: string }` (JSON non valido o senza `nodi`/`aste` → `errore: 'Il file non è un progetto VektorLab'`; altrimenti `verificaIntegrita(migra(p)).progetto`).
- UI: in `BarraFogli` due tasti, **Salva** (scarica `<nome del foglio>.vektor` con un `Blob` e un link temporaneo, poi `URL.revokeObjectURL`) e **Apri** (`<input type="file" accept=".vektor,application/json">` → `useFogli.getState().nuovo(nome, progetto)`, quindi non sovrascrive il foglio corrente; un errore va in `messaggia`).

- [ ] **Step 1: test**: andata e ritorno di `esempi[0].costruisci()` → stesso progetto dopo `migra`; testo `"ciao"` → `errore`; JSON senza `nodi` → `errore`.
- [ ] **Step 2:** `npx vitest run test/unit/file.test.ts` → FAIL.
- [ ] **Step 3:** implementare `file.ts` e i due tasti.
- [ ] **Step 4:** test → PASS; anteprima (`preview_start`): Salva scarica il file, Apri lo riapre in un foglio nuovo; `npm run baseline:check` verde.
- [ ] **Step 5:** commit `file .vektor: salva e apri`.

### Task 9: Banco di prova con le foto vere

**Files:**
- Modify: `.gitignore` (aggiunge `dati-foto/`)
- Create (esclusi da git): `dati-foto/foto/01.png … 24.webp` (copie delle immagini ricevute), `dati-foto/attesi.ts` (24 funzioni col builder, una per foto), `dati-foto/LEGGIMI.md` (per ogni foto: cosa contiene e i dubbi di lettura da far verificare all'utente)
- Create (versionato): `strumenti/foto/scriviAttesi.ts` + script `"foto:attesi": "tsx strumenti/foto/scriviAttesi.ts"` in `package.json`

**Interfaces:**
- Consumes: `serializza` (Compito 8), `progetto()`.
- Produces: `dati-foto/atteso/NN.vektor` per ogni foto: i file che `foto:valuta` (Fase 4) confronterà.

- [ ] **Step 1:** copiare le 24 immagini dalla cartella temporanea della sessione in `dati-foto/foto/` con i nomi a due cifre; aggiungere `dati-foto/` a `.gitignore`; `git status` non mostra `dati-foto/`.
- [ ] **Step 2:** scrivere `attesi.ts` leggendo ogni immagine (L = 1 m, carichi con coefficiente × 1000), e `LEGGIMI.md` con i dubbi.
- [ ] **Step 3:** `scriviAttesi.ts`: per ogni funzione scrive il `.vektor` e verifica che `verificaIntegrita` sia integro e che `analizzaCinematica` non lanci eccezioni; stampa una riga per foto.
- [ ] **Step 4:** `npm run foto:attesi` → 24 righe "ok", nessun errore.
- [ ] **Step 5:** commit solo di `.gitignore`, `strumenti/foto/scriviAttesi.ts` e `package.json`: `foto: banco di prova (dati esclusi da git)`.

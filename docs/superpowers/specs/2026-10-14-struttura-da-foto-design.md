# Struttura da foto — specifica di progetto

Data: 2026-10-14 · Stato: approvata in conversazione, sezione per sezione.

## 1. Scopo

Il tasto fotocamera di VektorLab (`onFoto` in `src/ui/App.tsx`) deve trasformare
la foto di un esercizio di Scienza delle Costruzioni / Elementi delle Macchine
in un `Progetto` già disegnato nel foglio. Lo usano **molti studenti**: il
motore disegna la sua migliore ipotesi e lo studente corregge a mano in
modellazione ciò che è sbagliato.

## 2. Requisiti

| # | Requisito |
|---|---|
| R1 | **Offline e gratuito**: nessuna API a pagamento, nessun server. Tutto gira nel browser, su telefono e computer. |
| R2 | **La foto non si conserva mai**: si elabora in memoria e si rilascia. Niente invii, niente IndexedDB/localStorage/cache, nessuna traccia nel progetto o nella cronologia di annulla. |
| R3 | Gli errori sono ammessi, ma il riconoscimento deve essere "avanzato": foto di fogli d'esame stampati (caso principale), scansioni, disegni a mano su quadretti. |
| R4 | Il motore di calcolo non si tocca: `npm run baseline:check` resta verde. |
| R5 | Tempo di riconoscimento < 3 s su un telefono di fascia media (escluso il primo scaricamento del modello). |
| R6 | Il modello scaricato pesa al massimo ~8 MB (rete + onnxruntime-web), caricato solo al primo uso. |

## 3. Ambito della prima versione

**Entra:** individuazione dello schema nel foglio; aste (posizione, inclinazione,
lunghezza); nodi; vincoli esterni (incastro, cerniera, carrello, doppio pendolo,
pattino, biella) con orientamento; sconnessioni interne (cerniera, doppio pendolo
interno, pattino interno) anche parziali; carichi distribuiti uniformi, forze
concentrate, momenti concentrati, con **verso** e coefficiente.

**Non entra:** molla; carichi trapezi/triangolari (riconosciuti come uniformi con
avviso); quote numeriche ("3 m", "4,5") — cadono in "altro" e si usa la
proporzione; lettere dei nodi (ignorate); sezioni trasversali e dati
dell'enunciato.

**Convenzioni di unità:** `L = 1 m`, `q = 1 kN/m`, `F = 1 kN`, `M = 1 kN·m`,
moltiplicati per il coefficiente letto ("2q" → 2 kN/m). Scritta illeggibile →
coefficiente 1 con avviso.

## 4. Architettura

Due metà che non si toccano:

```
vektorlab/addestramento/   Python — solo sul Mac di sviluppo o su Colab, mai nell'app
  generatore/              schemi casuali disegnati in molti stili + etichette esatte
  rete/                    rete multi-testa, addestramento, esportazione ONNX
vektorlab/src/foto/        TypeScript — nell'app, dentro un Web Worker
vektorlab/public/modelli/  foto.onnx (prodotto dell'addestramento, versionato)
vektorlab/dati-foto/       foto vere + .vektor corretti — ESCLUSA DA GIT (diritti d'autore)
```

Pipeline nell'app; ogni stadio ha ingresso e uscita tipizzati e si prova da solo:

```
foto ─► pagina ─► localizza ─► rete (ONNX) ─► primitive ─► letture ─► metrica ─► traduci ─► Progetto
        raddrizza  1ª passata   2ª passata     segmenti px  regole di  tratti →   builder +
        il foglio  pagina intera sul ritaglio  simboli,     lettura    posizioni  verificaIntegrita
        e l'ombra  → riquadri   ad alta ris.   frecce,      (§7)       in L (§8)
                                               quote
```

Contratti fra gli stadi:

- **`Primitive`** (pixel): segmenti d'asta, pallini (centro, raggio), corpi di
  vincolo (tipo, punto d'attacco, angolo, confidenza), frecce (punta,
  direzione), archi di momento (centro, verso), nodi, scritte (valore, estremi
  del tratto misurato).
- **`Schema`** (unità di L): punti notevoli, aste, vincoli, sconnessioni,
  carichi, ciascuno con confidenza, più l'elenco degli **avvisi**.
- **`Progetto`**: il tipo esistente, costruito con `progetto()` di
  `src/core/builder.ts`.

La post-elaborazione esiste in un solo posto (`src/foto/`): anche la
valutazione la esegue, in Node, con onnxruntime-node.

## 5. Pagina e localizzazione

1. **Pagina:** bordi del foglio → correzione prospettica; normalizzazione della
   luce (divisione per lo sfondo stimato con un filtro mediano largo).
2. **Prima passata** della rete sull'intera pagina a bassa risoluzione: si
   raggruppano i pixel di disegno (asta, simbolo, ausiliaria, carico) in
   figure. Uno **schema strutturale** è una figura con aste e almeno un
   vincolo; testo, sezioni tratteggiate, appunti vengono scartati.
3. **Seconda passata** sul solo ritaglio dello schema, lato lungo 768 px: su una
   pagina intera ridotta una "L/2" sarebbe alta 10 px e le linee sottili
   sparirebbero.
4. Più schemi nello stesso foglio → si riquadrano tutti e lo studente sceglie.

## 6. La rete

- **Ingresso:** scala di grigi, lato lungo 768 px, proporzioni conservate
  (rete completamente convoluzionale, lati multipli di 32).
- **Struttura:** codificatore leggero tipo MobileNet + decodificatore tipo U-Net,
  ~2 M parametri, esportata in ONNX fp16 (~3–4 MB). PyTorch puro con licenze
  permissive (niente Ultralytics/AGPL).
- **Uscite:**

| Testa | Risoluzione | Contenuto |
|---|---|---|
| Segmentazione | 1/2 | sfondo/quadretti · **asta** · ausiliaria (quote, richiami, marcatori di sezione) · carico (campiture, inviluppi) · simbolo · testo/appunti · altro disegno (sezioni trasversali) |
| Pallini | 1/4 | picco al centro + raggio |
| Corpi di vincolo | 1/4 | un canale per tipo: triangolo, triangolo con rulli, incastro, doppio pendolo, pattino, biella, doppio pendolo interno, pattino interno; picco nel **punto d'attacco**; 2 canali (cos, sin) di orientamento nella convenzione `û(α) = (−sin α, cos α)` |
| Frecce | 1/4 | picco sulla **punta** + direzione (cos, sin) |
| Momenti | 1/4 | picco al centro dell'arco; due canali: orario, antiorario |
| Nodi | 1/4 | estremi, spigoli, incroci |
| Scritte | 1/4 | vocabolario chiuso: L, 2L, 3L, 4L, L/2, 3L/2, L/3, 2L/3, L/4 · q, 2q, 3q, q/2 · F, 2F, 3F, F/2 · M, 2M, M/2 · altro; per le quote 4 canali con gli **estremi del tratto misurato** |

Le scritte di quota "su linea con frecce" e quelle "accanto all'asta" diventano
lo stesso dato: *fra questi due punti ci sono vL*.

## 7. Regole di lettura (TypeScript, deterministiche, testate una per una)

La rete dice *cosa è disegnato*; queste regole dicono *cosa significa*.

**Tracciamento.** Si parte da un punto qualunque della linea d'asta e la si
segue: cambio di direzione → nodo con aste saldate; interruzione su un simbolo
→ l'asta si divide; interruzione senza simbolo (tratto a mano non chiuso) → il
buco si richiude.

**Pallino:**

| Pallino | Sotto / attorno | Risultato |
|---|---|---|
| interrompe la linea (≥ 2 estremi d'asta sul pallino) | niente | aste divise + cerniera interna (`sconnessioneNodale`) |
| interrompe | triangolo tratteggiato | aste divise + cerniera a terra + cerniera interna |
| interrompe | triangolo con rulli | aste divise + carrello + cerniera interna |
| accanto a un'asta che prosegue, su cui finisce un'altra asta | — | l'asta che prosegue resta unica; **solo** quella che finisce è incernierata (sconnessione parziale, `asteSvincolate`) |
| appoggiato (la linea gli passa sopra continua) | triangolo / rulli | asta unica + cerniera / carrello in campata (`vincoloSuAsta`) |
| all'estremo di un'asta sola | triangolo / rulli | vincolo al nodo |

**Vincoli senza pallino:** doppio pendolo interno e pattino interno dividono
l'asta; incastro, doppio pendolo a terra, pattino, biella **non** la dividono
(vincolo al nodo, o `vincoloSuAsta` in campata).

**Ambiguità:** cerniera a terra col pallino su uno spigolo di due aste senza
interruzione evidente → spigolo rigido + cerniera a telaio, con avviso.

**Carichi:**
- ≥ 3 frecce parallele affiancate, stesso verso, appoggiate (punta o coda) alla
  stessa asta → **distribuito**; verso = verso delle punte, indipendente dal lato
  del blocco; estensione dalla prima all'ultima freccia. Gruppi vicini con versi
  opposti → carichi distinti. Frecce discordanti nel gruppo → avviso.
- Freccia isolata → **forza concentrata** (nodo o campata); direzione agganciata
  a 0°/45°/90° se vicina.
- Arco → **momento** con il suo verso (nodo o campata).
- Coefficiente dalla scritta più vicina della famiglia giusta.

## 8. Metrica: dai tratti alle posizioni

Le quote misurano **tratti** fra punti notevoli consecutivi, non membri.

1. **Punti notevoli:** estremi, spigoli, incroci, vincoli in campata, cerniere,
   inizio/fine carichi, punti di forze e momenti, piedi delle linee di richiamo.
2. Ogni quota = distanza fra due punti notevoli lungo la sua direzione
   (orizzontale, verticale o lungo l'asta); gli estremi stimati dalla rete si
   agganciano al punto notevole più vicino seguendo le linee di richiamo.
3. Posizioni per **concatenazione** dei tratti, separatamente in x e y (minimi
   quadrati pesati sui raggruppamenti di coordinate). Quote ridondanti (un
   totale sopra parziali) = controllo; incoerenza → avviso.
4. Tratti senza quota, in ordine: geometria (estremi già fissati), proporzione
   con la scala stimata arrotondata a L/2, e se nel disegno non si legge
   nessuna quota **L = 1** per l'asta tipica e le altre in proporzione.
5. Direzioni agganciate a 0°/45°/90° quando vicine (fogli piegati, prospettiva).
6. **Membri** solo alla fine: pezzo continuo fra due sconnessioni; lunghezza =
   somma dei suoi tratti. I vincoli esterni in campata non spezzano.

## 9. Generatore sintetico

Python, immagini prodotte **al volo** durante l'addestramento; su disco solo una
validazione fissa (~2000).

- **Strutture** su griglia L/2: travi continue 2–5 campate, mensole, portali,
  telai a L e a gradini, telai chiusi ad anello, strutture a T, aste a 45°;
  vincoli, cerniere e carichi casuali (anche distribuiti affiancati con versi
  opposti).
- **Stile principale "foto di foglio d'esame":** intestazione, enunciato, righe
  "GRUPPO D L=…", altri esercizi, sezioni trasversali tratteggiate, bande grigie,
  appunti a penna e matita anche sopra il disegno; pieghe e curvature, ombre,
  sfondi (tovaglie, scrivanie), bordi di schermo. Stili secondari: libro
  stampato, scansione, a mano su quadretti.
- **Varianti grafiche** 2–4 per simbolo; aste spesse e ausiliarie sottili, con
  spessori che variano.
- **Etichette** disegnate sulle stesse trasformazioni dell'immagine.
- **Galleria** di controllo: 50 esempi con etichette sovrapposte.

## 10. Valutazione

- `dati-foto/` (esclusa da git): foto + `.vektor` corretto disegnato in
  VektorLab con L = 1 m. Divisa in **sviluppo** (si guardano gli errori) e
  **prova** (si misura solo alle tappe).
- Confronto in unità di L a meno di una traslazione, per categoria: schema
  trovato · nodi · aste · vincoli esterni (tipo+posizione; orientamento a parte)
  · sconnessioni · carichi (tipo, asta, verso, estensione, coefficiente).
- Numero principale: **correzioni necessarie** per esercizio (elementi da
  aggiungere, togliere o modificare); accanto, % di esercizi perfetti.
- `npm run foto:valuta`: tabella + sovrapposizioni in `dati-foto/esiti/`.
  Stessa misura sul sintetico, per distinguere "rete che non ha imparato" da
  "foto diverse dal sintetico".
- **Obiettivo v1:** in media ≤ 2 correzioni per esercizio sulla metà di prova;
  R5 rispettato.

## 11. Integrazione nell'app

- **Ingresso:** telefono → "Scatta" / "Galleria"; computer → stesso tasto +
  trascinamento + incolla (⌘V) di uno screenshot.
- **Primo uso:** scaricamento del modello con barra di avanzamento; poi cache
  HTTP del browser (il modello, mai la foto).
- **Riquadro:** foglio raddrizzato con lo schema riquadrato, ritoccabile;
  "Riconosci". Più schemi → si tocca quello giusto.
- **Risultato:** **foglio nuovo** "Da foto N"; elementi incerti evidenziati in
  arancione; elenco di avvisi, toccandone uno si seleziona l'elemento. Materiale
  e sezione predefiniti. Gli avvisi non entrano nel file `.vektor`.
- **Privacy (R2):** la foto vive come `ImageBitmap`/buffer trasferito al worker;
  all'apertura del foglio nuovo si chiudono le bitmap e si rilasciano i
  riferimenti. Nessuna API di memorizzazione, nessuna richiesta di rete tranne lo
  scaricamento del modello.
- **Errori:** nessuno schema → messaggio, nessun foglio creato; modello non
  scaricabile → messaggio.

## 12. Rischi

| Rischio | Mitigazione |
|---|---|
| Divario sintetico → foto vere | galleria accanto alle foto vere; metrica separata sintetico/vero; si aggiungono stili al generatore dove sbaglia |
| Linee sottili perse nelle foto | seconda passata sul ritaglio ad alta risoluzione |
| Aste confuse con linee di richiamo | classe "ausiliaria" + spessore nel sintetico; le richiami finiscono sulle quote |
| Peso di onnxruntime-web | import dinamico, solo al primo tocco; variante WASM minima |
| Addestramento su M2 8 GB | rete piccola, lotti piccoli, generazione al volo; Colab come riserva |
| Regole adattate ai soli 50 esempi | metà di prova toccata solo alle tappe |

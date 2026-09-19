# Iterazione 12 — Interfaccia e presentazione

Diario di lavoro. Ogni punto riporta cosa è stato modificato, quali difetti
sono stati trovati guardando gli screenshot, e come sono stati corretti.

Vincolo dell'iterazione: **nessuna modifica al motore di calcolo**.
`npm run baseline:check` è stato eseguito dopo ogni punto.

---

## §1 — Dimensione dei bottoni

### Il punto unico

Prima ogni bottone portava le proprie misure scritte a mano
(`px-2 py-1 text-[11px]`, `rounded border`, colori in `style`), ripetute in
diciassette file. È il motivo per cui una correzione alle dimensioni non
sarebbe mai attecchita dappertutto.

Ora esiste **un solo punto**: `src/stile.css` porta i token di forma
(`--h-controllo`, `--s1…--s8`, `--raggio-controllo`, `--t-corpo`, `--transizione`)
e le classi `.btn`, `.btn-gruppo`, `.btn-minore`, `.campo`, `.tendina`,
`.riga-elenco`, `.riga-controlli`. I componenti le usano; nessun componente
scrive più un'altezza.

### Misure

| | prima | dopo |
|---|---|---|
| bottoni della barra | 24 px | **40 px** |
| bottoni nei pannelli | 22–24 px | **40 px** |
| testo dei bottoni | 11 px | **14 px** |
| campi e tendine | 20 px | **40 px** |
| righe di elenco | 23 px | **32 px** |
| maniglie dei pannelli | 14 px di larghezza | **24 px** |
| spaziatura fra bottoni | 4 px | **8 px** |

### Deviazioni dichiarate

Due misure non arrivano a 40 px, e per una ragione:

- **righe di elenco a 32 px.** Un elenco di venti nodi a quaranta pixel
  sarebbe alto ottocento e costringerebbe a scorrere una struttura piccola.
  32 resta sopra la soglia di un dito e raddoppia comunque il bersaglio.
- **maniglie dei pannelli a 24 px di larghezza.** Sono alte quanto la
  finestra, quindi verticalmente si prendono senza mirare; quaranta pixel per
  lato costerebbero ottanta pixel di disegno su uno schermo da 1280.

### Effetto collaterale, dichiarato

Con i bottoni a 40 px la barra superiore **occupa due righe sotto i 1920 px**
(109 px invece di 59). Recuperati settanta pixel togliendo la scritta
«AGGANCIO» — il gruppo la dichiara già a chi usa un lettore di schermo — e
raccogliendo modalità, strumenti e agganci in tre gruppi invece di quindici
bottoni separati, ma a 1440 non basta. È il prezzo dei quaranta pixel.

### Stati

`:hover` schiarisce il fondo, `:active` abbassa di un pixel, `:disabled`
riduce l'opacità e cambia il cursore, `aria-pressed="true"` colora d'accento.
Il fuoco da tastiera è visibile su **ogni** controllo, non solo sui bottoni:
la regola `:focus-visible` è scritta una volta per bottoni, campi, tendine e
qualunque elemento con `tabindex`.

### Verifica

Controllo automatico su cinque modalità: nessun controllo sotto i 30 px,
esclusi i cursori a scorrimento — che restano sottili per linguaggio, ma la
cui zona afferrabile è ora alta 40 px.

`npm run baseline:check` → **linea di base intatta**, 18 modelli.
Suite → 977 test verdi.

---

## §2 — Tabella dei materiali, ripristinata

### Che cos'era diventata

Quattro righe — E, ν, ρ, α — del **solo** materiale selezionato. Per sapere se
l'alluminio fosse più leggero della ghisa bisognava cambiare materiale, leggere,
cambiare di nuovo e ricordarsi il numero.

### Che cos'è ora

Tutti i materiali in tabella, con:

- **grandezze selezionabili** fra otto (E, Sy, ρ, ν, Su, α, γM, €/kg), scelta
  memorizzata in `localStorage`;
- **barre colorate** normalizzate sull'insieme mostrato, un colore per
  grandezza, prese dai token della palette;
- **materiale assegnato evidenziato** in accento;
- intestazioni abbreviate (`Sy`) con il nome esteso nel suggerimento.

### Il requisito che prima mancava

**La tabella sta nella larghezza del pannello.** Nessuno scorrimento
orizzontale. La regola è una funzione pura, `impaginazione()`, verificata da
dodici test:

| pannello | comportamento |
|---|---|
| ≥ 210 px | tabella; entrano le colonne che ci stanno |
| < 210 px | **schede**, una per materiale |
| colonne di troppo | **avviso**, non scorrimento |

Con tutte e otto le grandezze accese in un pannello da 288 px se ne mostrano
quattro e compare: «4 colonne non entrano nella larghezza del pannello:
togline qualcuna o allarga il pannello».

Le larghezze di colonna seguono il **contenuto**: ν porta «0,30» e non chiede
lo spazio di ρ, che porta «7850».

### Le due tabelle restano distinte

Le proprietà costanti stanno qui; il confronto fra materiali — peso, tensione,
utilizzo sulla struttura in esame — resta nel suo pannello. Un test verifica
che in questa tabella non compaia nessuna grandezza che dipende dalla
struttura.

`npm run baseline:check` → **intatta**.

---

## §3 — Analisi: testi più brevi

### Prima

Un paragrafo introduttivo, una tabella di sei righe sempre aperta, un riquadro
sul conteggio ingannevole, un elenco di diagnosi. Tutto stampato, ogni volta.

### Ora

```
IPERSTATICA 3 volte
1 corpo · 3 gdl · 6 gdv · rango 3
```

```
LABILE 1 grado · IPERSTATICA 1 volta
1 corpo · 3 gdl · 3 gdv · rango 2
I vincoli sono in numero sufficiente ma MAL DISPOSTI: sovrabbondano
in una direzione e mancano in un'altra.
```

Il verdetto porta **il grado** — «3 volte», «1 grado» — perché è la prima cosa
che si cerca dopo la parola. Il conteggio riga per riga, le diagnosi e i valori
singolari stanno nel blocco che si espande.

### La frase, una sola

Il modulo cinematico produce diagnosi complete, ed è giusto: servono nel
dettaglio e nel PDF. Sul pannello va la sola frase **azionabile**, e si scarta
quella che ripete il conteggio — «3 gradi di vincolo, 3 gradi di libertà,
rango 2: la struttura è LABILE» dice quello che le due righe sopra hanno già
detto, in tre righe. Il messaggio intero resta nel suggerimento.

Su una struttura sana non si aggiunge niente: «ISOSTATICA» ha già detto tutto.

### §3.3 — la stessa regola altrove

Ventiquattro paragrafi esplicativi permanenti censiti; i più lunghi ridotti a
una riga con il testo esteso nel suggerimento:

| dove | prima | dopo |
|---|---|---|
| Confronto materiali | 328 c | 76 c |
| Confronto materiali | 197 c | 56 c |
| Editor materiale | 187 c | 41 c |
| Editor materiale | 183 c | 63 c |
| Reazioni (×4) | 142, 130, 101, 95 c | 58, 33, 47, 60 c |

Sopra i 110 caratteri restano dieci paragrafi, tutti **condizionali** — stati
vuoti e messaggi d'errore — che compaiono solo quando servono davvero.

---

## §4 — Rifinitura estetica

### Le incoerenze, misurate

Prima di toccare qualcosa ho contato che cosa c'era. Il numero di valori
distinti in uso è la misura diretta della coerenza:

| | prima | dopo |
|---|---|---|
| dimensioni di carattere | **8** (9, 9.5, 10, 10.5, 11, 12, 13, 15) | **4** token |
| raggi degli angoli | **6** (`rounded`, `-sm`, `-t`, `-lg`, `-2xl`, `-full`) | **2** token + `-full` |
| spaziature fuori scala | 0.5, 1.5, 5, 9 (2, 6, 20, 36 px) | **nessuna** |
| colori esadecimali a mano | **13** | **0** |

I 34 colori scritti a mano — `#4a9eff`, `#c8d0dc`, `#ff5f56`… — duplicavano
token già esistenti, e uno (`#6b7686`) non corrispondeva a niente: era una
sfumatura di grigio nata per sbaglio. Tutti ricondotti alle variabili.

### La gerarchia tipografica

L'applicazione viveva a dieci pixel, che su uno schermo grande sono piccoli e
non lasciano spazio a una gerarchia. La scala è salita di un punto:

```
--t-titolo    16px   intestazioni di blocco
--t-corpo     14px   controlli e bottoni (la misura chiesta dal §1)
--t-etichetta 13px   etichette dei campi
--t-minuto    12px   valori, tabelle, note
```

I numeri restano monospaziati e allineati a destra, con lo stesso numero di
decimali nella stessa colonna.

### Difetti trovati guardando gli screenshot

| # | difetto | causa | correzione |
|---|---|---|---|
| 1 | «ricalcola» tagliato a metà dal bordo del pannello Analisi | era in fondo a un'area che scorre | spostato in intestazione |
| 2 | «ricalcola» in due posti diversi fra Analisi e Risultati | nessuna regola | stessa azione, stesso posto: intestazione in entrambi; in Risultati il bottone grande resta solo finché non c'è un risultato |
| 3 | «Scala diagrammi ×1.00» su tre righe | etichetta troppo lunga per la colonna | «Scala ×1.00» |
| 4 | «Cifre significative» su due righe | idem | «Cifre» |
| 5 | schede dei vincoli cresciute in altezza | la scala tipografica le aveva toccate | testo riportato a 11 px: il §1.2 dice che la tavolozza non si tocca |
| 6 | ultima colonna della tabella materiali contro il bordo | tabella a larghezza piena senza margine | margine del pannello e una cifra di respiro per colonna |
| 7 | barra superiore su due righe sotto i 1920 px | i 40 px dei bottoni | mitigato raggruppando modalità, strumenti e agganci e togliendo la scritta «AGGANCIO»; resta su due righe a 1440, ed è il prezzo dichiarato |

### Quello che NON è cambiato

La **palette** resta quella: N, T, M, deformata, reazioni, selezione e vincoli
hanno gli stessi valori esadecimali di prima. I colori nuovi non esistono; i
colori scritti a mano sono stati ricondotti ai token che già li descrivevano.

Le **icone dei vincoli** sono intatte, come chiede il §1.2.

---

## Verifica finale

```
npm run baseline:check   LINEA DI BASE INTATTA — 18 modelli, differenza nulla
npm test                 989 test verdi su 67 file
tsc -b                   pulito
npm run build            pulito
git diff core/           vuoto: statica, fem, post e kinematics intatti
```

I 989 test sono i 977 dell'iterazione precedente più **12 nuovi** sulla regola
di impaginazione della tabella dei materiali (§2.2).

### Screenshot

`screenshots-prima/` — 62 immagini catturate prima di toccare qualcosa
`screenshots/` — 73 immagini dopo, alle tre risoluzioni, pannelli aperti e chiusi

Le sezioni da confrontare per vedere il lavoro:

| file | che cosa mostra |
|---|---|
| `analisi-1440x900-pannelli-aperti.png` | il verdetto in due righe (§3) |
| `materiali-1440x900-pannelli-aperti.png` | la tabella con le barre (§2) |
| `vincoli-1280x800-pannelli-aperti.png` | la tavolozza intatta, i comandi più grandi (§1) |
| `risultati-1440x900-pannelli-aperti.png` | i controlli a 40 px e le etichette brevi |

### Il criterio di riuscita

«Affiancando due sezioni qualsiasi, devono sembrare parte dello stesso
programma.» Ciò che lo rende vero non è una scelta estetica ma una struttura:
quattro dimensioni di carattere, due raggi, una scala di spaziature, zero
colori scritti a mano, e un solo `.btn`. Un bottone aggiunto domani eredita
tutto senza che nessuno debba ricordarsene.

---

## Ritocchi dopo la prova sul campo

### Misure riviste

I 40 px dell'iterazione erano troppi. Ridotti, e con una misura DIVERSA per la
barra, perché il suo vincolo è diverso da quello dei pannelli:

| | iterazione 12 | ora |
|---|---|---|
| bottoni dei pannelli | 40 px | **34 px** |
| barra superiore | 40 px | **30 px** |
| controlli fitti (preset d'angolo) | 32 px | **26 px** |
| corpo del testo | 14 px | **13 px** |

I preset d'angolo tornano alla taglia di prima: sono ventiquattro in fila, e
alla taglia di un bottone d'azione riempivano mezzo pannello.

**La barra sta su una riga fino a 1280 px** — era il punto aperto dell'ultima
iterazione. Ci arriva così: controlli a 30 px, comandi raccolti in tre gruppi,
e il nome del modello che sparisce sotto i 1400 px perché è già scritto sulla
scheda del foglio a due centimetri di distanza.

### Tabella dei materiali

Spostata: non più in cima al pannello ma **accanto al confronto**, perché le
due tabelle rispondono alla stessa domanda da due lati. Nel blocco «Materiale
del modello» tornano le quattro righe del solo materiale scelto.

Stile rifatto: la barra non è più un trattino SOTTO il numero ma il FONDO della
cella, una banda che cresce da destra. Due elementi separati per dire una cosa
sola leggevano come un numero con una riga storta appiccicata.

---

## Basi per il telefono

L'applicazione su un telefono era inutilizzabile. Non per un dettaglio: per
quattro cose insieme.

### 1. Non si poteva selezionare niente

Le tolleranze di selezione — dieci pixel su un nodo, sette su un'asta — sono
scritte per un mouse. Un polpastrello copre una quarantina di pixel: si toccava
l'asta e non succedeva niente.

Ora `render/tocco.ts` risponde a una domanda sola — «il puntatore è grosso?» —
interrogando `(pointer: coarse)`, e le tolleranze si moltiplicano per 2,4. Non
si guarda la LARGHEZZA della finestra: un tablet largo ha le dita, un portatile
stretto ha il trackpad.

### 2. Non si poteva cancellare niente

Su un computer si seleziona e si preme Canc. Su un telefono non c'è Canc, e non
c'era nessun'altra via: si poteva disegnare ma non correggere.

La **barra delle azioni sulla selezione** galleggia sopra il disegno quando c'è
qualcosa di selezionato, dice CHE COSA è selezionato — «asta a1», non «1
elemento» — e offre duplica, deseleziona, elimina. Con un nodo vincolato offre
anche **togli vincolo**, che toglie il vincolo lasciando il nodo: prima
l'unica alternativa era cancellare il nodo, e con lui le aste che ci arrivano.

Serve anche col mouse: chi non conosce la scorciatoia trova un bottone.

### 3. La barra non era dimensionata

| | prima | ora |
|---|---|---|
| altezza su iPhone 13 | 203 px (5 righe) | **105 px** (2 righe) |
| modalità raggiungibili | 3 su 7 | **7 su 7** |
| bersaglio minimo | variabile | **44 px** |

I nomi diventano icone sotto i 900 px — sette nomi di modalità non stanno in
390 px — e il nome resta nel suggerimento e per i lettori di schermo. Le
opzioni di aggancio, che si toccano di rado, entrano in un menu «⋯». Le
modalità hanno una riga loro: lasciarle scorrere avrebbe nascosto quattro
voci su sette dietro un gesto che nessuno indovina, e la navigazione non si
nasconde.

### 4. I pannelli coprivano il disegno

Sotto i 720 px il pannello non sta accanto al disegno: ci passa sopra, a tutta
larghezza, e **parte chiuso**. Affiancato lasciava al modello una striscia di
centocinquanta pixel — si vedeva la griglia e nient'altro. E cambiare modalità
non lo apre più da sé: su schermo largo aprirlo è un servizio, su uno stretto
è un sipario.

### Verificato guidando il telefono

Con un iPhone 13 emulato, a tocchi veri: disegnata un'asta, selezionata,
eliminata; posato un vincolo su un nodo, selezionato il nodo, tolto il vincolo
lasciando il nodo. Canvas 326 px di 390, barra 105 px, nessun errore di
console.

### Quello che resta da fare

Queste sono basi, non una versione telefono finita. Restano: il pizzico per
zoomare, i pannelli come fogli che salgono dal basso invece che a tutto
schermo, e le tendine di sistema che su telefono aprono la rotella nativa e
andrebbero riviste una per una.

---

## Verifica finale dei ritocchi

```
npm run baseline:check   LINEA DI BASE INTATTA — 18 modelli, differenza nulla
npm test                 989 test verdi su 67 file
tsc -b                   pulito
git diff core/           vuoto
```

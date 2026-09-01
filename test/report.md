# Campagna di verifica del motore isostatico

Aggiornato al 2026-09-01. Riepilogo richiesto dall'iterazione 10 §10.3.

## Come leggerlo

La campagna ha due gambe, e servono a cose diverse:

- il **catalogo** (§10.1) confronta con soluzioni in forma chiusa calcolate a
  mano: dice se il risultato è *quello giusto*;
- la **campagna casuale** (§10.2) genera strutture e verifica gli
  **invarianti**: dice se il risultato è *coerente con sé stesso*, su casi che
  nessuno ha scritto a mano e che quindi nessuno ha inconsapevolmente scelto
  perché funzionavano.

La seconda ha trovato un bug che la prima non poteva trovare, e viceversa.

## Numeri

| | Casi | Esito |
|---|---|---|
| Catalogo analitico §10.1 | 47 | tutti superati |
| Campagna casuale §10.2 — travi e telai, angoli notevoli | 25 isostatiche su 120 generate | 0 fallimenti |
| Campagna casuale — angoli irregolari | 26 su 120 | 0 fallimenti |
| Campagna casuale — con sconnessioni interne | 53 su 150 | 0 fallimenti |
| Campagna casuale — sei aste | 63 su 200 | 0 fallimenti |
| Campagna casuale — dodici aste | 69 su 200 | 0 fallimenti |
| **Totale strutture casuali verificate** | **236** | **0 fallimenti** |
| Suite completa del progetto | 754 test | tutti verdi |

Ogni struttura casuale passa attraverso cinque prove — rotazione di +0,7 rad,
rotazione di −2,3 rad, linearità ×2, linearità ×−3, scala geometrica ×2 — più
l'equilibrio globale. Sono circa 1400 verifiche di invarianza.

Il tasso di scarto (circa una struttura su tre sopravvive) non è uno spreco:
è il filtro di isostaticità. Su una struttura labile o iperstatica gli
invarianti non direbbero niente sul metodo isostatico che si vuole verificare.

## Bug trovati e corretti

### 1. `spostamentoMassimo` sommava due massimi presi in punti diversi

**Trovato da**: catalogo §10.1, mensola con forza in punta.

Il codice prendeva lo spostamento maggiore fra i due estremi dell'asta e vi
sommava la freccia misurata rispetto alla corda. Sono due massimi raggiunti in
punti **diversi** — l'uno all'estremo, l'altra circa a metà — e sommarli dà un
maggiorante, non il massimo.

Su una mensola con forza in punta l'errore vale esattamente il **19,245 %**:
lo scarto fra l'elastica e la corda inclinata, normalizzato alla freccia di
punta, è 0,19245.

Il difetto era invisibile a occhio, perché la deformata **disegnata** era
giusta: sbagliato era solo il numero mostrato accanto, cioè il `δmax` della
striscia di sintesi e il fattore di amplificazione automatica. Ed era
invisibile anche ai test esistenti, perché sulla trave appoggiata — dove la
corda non si muove — la vecchia formula dava per caso il risultato esatto.

**Correzione**: il massimo si cerca punto per punto sui campioni, e in più si
valuta il punto di freccia massima, dove `frecciaMassima` è esatta perché
ricavata per integrazione. Così resta esatto anche dove lo era prima.

**Regressione**: `test/regressioni/spostamento_massimo_mensola.test.ts`.

### 2. Il residuo di equilibrio ignorava ΣMz, e la sua scala contava le sole forze

**Trovato da**: campagna casuale §10.2, seme 9019.

Il residuo era `hypot(ΣFx, ΣFy)`: uno squilibrio di **momento** non compariva
affatto, e l'autoverifica §9.2 poteva dichiarare equilibrata una struttura che
non lo era alla rotazione.

Il denominatore, poi, sommava i moduli delle sole forze. Su una struttura
caricata da coppie tende a zero, e un residuo assoluto di 1e-11 N diventava un
«64 %» che bocciava una soluzione perfettamente corretta. Un'autoverifica che
grida al lupo è peggio di nessuna autoverifica, perché insegna a ignorarla.

**Correzione**: i momenti entrano nel residuo divisi per la diagonale del
modello, che li rende una forza equivalente e quindi sommabili; sotto una
soglia di carico il confronto passa all'assoluto.

**Regressione**: `test/regressioni/residuo_equilibrio_momenti.test.ts`.

## Falsi allarmi, e perché li registro

Due categorie di fallimenti si sono rivelate difetti degli **strumenti di
misura**, non del motore. Le annoto perché rifarli costerebbe di nuovo tempo.

**Il comparatore relativo al singolo valore.** Rapportare lo scarto al valore
stesso sembra più severo ed è solo più rumoroso: su uno sforzo normale che
vale 1e-7 N in una struttura dove i momenti valgono 1e4 Nm, una differenza di
macchina diventa uno scarto del 50 %. Centinaia di falsi allarmi nascondevano
quelli veri. Il confronto va fatto rispetto all'**ampiezza del problema**, che
è poi ciò che significa «coincidere entro 1e-6 relativo».

**Il massimo cercato fra i campioni.** Il massimo di una parabola cade fra due
campioni, e cercarlo fra i soli campioni lo sottostima dello 0,06 % — che su
una tolleranza stretta si scambia per un errore del motore. Si leggono i punti
notevoli, che il campionatore inserisce apposta.

## Tolleranza, e perché è 1e-6

È quella del §9.16, e non è una soglia scelta per far passare i test: è il
limite del metodo. La matrice di rigidezza di un telaio articolato ha un
numero di condizionamento alto — `EA/L` e `12EI/L³` differiscono di ordini di
grandezza — e in doppia precisione l'accuratezza relativa che se ne ottiene è
intorno a 1e-7. Pretendere di più significherebbe misurare il rumore.

Resta abbondantemente sufficiente: un errore di segno o di proiezione produce
uno scarto dell'ordine dell'unità, sei ordini di grandezza sopra la soglia.

## Che cosa la campagna non copre

Detto esplicitamente, perché un elenco di verifiche superate senza i suoi
limiti è fuorviante:

- il generatore produce **spezzate aperte** di aste concatenate, con vincoli
  agli estremi. Copre travi, mensole, telai a L, a T e portali, ma non genera
  maglie chiuse né strutture reticolari;
- l'invariante di **scala geometrica** si applica ai soli carichi
  concentrati di forza: i distribuiti e le coppie non scalano come le
  lunghezze, e il rapporto atteso non è più 2;
- l'invariante di **rotazione** richiede carichi covarianti, quindi il
  generatore emette forze nodali, coppie e distribuiti in modo «angolo».
  I modi `globaleX` e `globaleY` sono legati agli assi del mondo e non
  ruotano con la struttura, per definizione.

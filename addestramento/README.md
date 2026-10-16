# Addestramento — struttura da foto

Generatore sintetico (Fase 2) e, più avanti, rete e addestramento (Fase 3).
Non fa parte dell'app: gira solo sulla macchina di sviluppo.

Spec: `../docs/superpowers/specs/2026-10-14-struttura-da-foto-design.md`.

## Ambiente

Ambiente dedicato `addestramento/.venv` (Python 3.9 del sistema, escluso da
git), con numpy, scipy, Pillow, pytest, torch, onnx, onnxruntime:

```bash
/usr/bin/python3 -m venv .venv
.venv/bin/python -m pip install -U pip
.venv/bin/python -m pip install -r requirements.txt
```

Sul Mac M2 installa torch 2.8 con la GPU (MPS); occupa ~650 MB su disco.
Il generatore della Fase 2 gira anche col `.venv` della cartella superiore.

## Comandi

```bash
.venv/bin/python -m pytest
```

Le uscite generate (immagini, gallerie) vanno in `esiti/`, esclusa da git.

## Campagna sulle regole di lettura

```bash
npm run foto:campagna -- --n 500 --seme 1 [--rumore 3] [--rari]
```

Il generatore produce le primitive ideali di N schemi casuali; la lettura
della Fase 1 (`src/foto/`) le legge e le confronta con lo schema di partenza.

| Prova (2026-10-15) | Letture perfette | Correzioni medie |
|---|---|---|
| semi 1–500, nessun rumore | 100 % | 0.00 |
| semi 1001–1500, nessun rumore | 100 % | 0.00 |
| semi 1–500, punti spostati di ±3 px | 97.0 % | 0.05 |
| semi 1–1000, `--rari`, nessun rumore (2026-10-16) | 99.9 % | 0.00 |
| semi 1–500, `--rari`, ±3 px (2026-10-16) | 96.6 % | 0.04 |

Con `--rari` (anche nel generatore) alcune cerniere diventano doppi pendoli o
pattini, alcuni carrelli bielle e alcune cerniere interne fra aste allineate
doppi pendoli o pattini interni: le famiglie da sole non li usano quasi mai,
ma la rete deve vederli. Senza l'opzione gli schemi restano quelli di prima.

Con il rumore gli errori residui sono soprattutto cerniere con pallini piccoli
(r ≈ 6 px) rispetto all'errore: andranno rivisti sulle uscite vere della rete
(Fase 4).

## Campioni completi e galleria

```bash
../../.venv/bin/python -m generatore --n 50 --seme 1 --uscita esiti/prova --galleria
```

Per ogni seme: `NNNNN.png` (la foto), `NNNNN-maschera.png` (classi 0–6 della
spec §6), `NNNNN.json` (primitive nel contratto di `src/foto/tipi.ts`, schema,
meta con il riquadro della figura). `galleria.png` mette ogni foto accanto
alla stessa con maschera e primitive sovrapposte: è lì che si controlla.

Con `--modo` si sceglie che cosa fotografare:

| Modo | Che cos'è | Lato lungo |
|---|---|---|
| `foto` (predefinito) | il foglio intero, come la foto di un telefono rimpicciolita | 600–1400 px |
| `pagina` | la stessa foto, come la vede la rete nella prima passata | 768 px |
| `ritaglio` | la figura e un margine dell'8–30 % attorno (seconda passata); la figura si disegna già alla risoluzione con cui finisce nel ritaglio, e si deforma solo il ritaglio | 768 px |

### Confronto a occhio con le foto vere (2026-10-15, foto 18–24)

Ci sono: fogli d'esame con intestazione, enunciato e riga GRUPPO, prospettiva,
rotazione, piega, ombre, sfondi (tovaglia, scrivania, bordo scuro), JPEG,
quote a catena con richiami lunghi, sezioni trasversali campite, appunti a
penna e matita, carta a quadretti.

Mancano ancora, da aggiungere se la rete sbaglia su questi casi:
- foto ravvicinate che tagliano il foglio ai bordi (le vere 18, 19, 24): meglio
  ottenute con ritagli casuali durante l'addestramento (Fase 3);
- la metà bassa del foglio è vuota: i fogli veri hanno più testo o l'esercizio
  successivo;
- caratteri con grazie e grassetti dei titoli vari come nei fogli veri;
- riflessi e mosso; pieghe orizzontali; foto di uno schermo (moiré).

## Rete (Fase 3)

```bash
.venv/bin/python -m generatore.dataset --uscita esiti/dati      # ~10 700 campioni, ~1 GB, ~25 min con 6 processi
.venv/bin/python -m rete.addestra --dati esiti/dati --uscita esiti/rete   # rilanciato riprende (al più 500 passi persi)
.venv/bin/python -m rete.esporta --pesi esiti/rete/migliore.pt \
    --onnx ../public/modelli/foto.onnx --json ../public/modelli/foto.json
.venv/bin/python -m rete.guarda --pesi esiti/rete/migliore.pt   # sovrapposizioni in ../dati-foto/esiti-rete/
```

- `rete/vocabolario.py`: i 43 canali della testa e le 7 classi (contratto con la Fase 4);
- `rete/bersagli.py`: dalle etichette ai bersagli; `rete/dati.py`: pezzi quadrati casuali;
- `rete/modello.py`: MobileNetV2 + U-Net, 1,07 M parametri;
- `rete/perdite.py`, `rete/metriche.py`, `rete/addestra.py`, `rete/esporta.py`, `rete/guarda.py`.

Misura sul Mac M2 da 8 GB (MPS, pezzi da 512, 2026-10-16):

| Lotto | s/passo | Memoria GPU | Note |
|---|---|---|---|
| 8 | 3,3 (0,53 senza swap) | 4,4 GB | il sistema va in swap: sconsigliato |
| 4 | 0,25 | 2,2 GB | predefinito: 20 epoche ≈ 3,5 ore |

### Primo modello (2026-10-16): `public/modelli/foto.onnx`

1,07 M parametri, 2,08 MB (pesi fp16), 20 epoche su 10 000 campioni sintetici
(8000 ritagli + 2000 pagine, con i vincoli rari), ~4 ore sul Mac M2; scelto
all'epoca 18 (perdita di validazione 0,175).

Due giri. Il primo (v1, in `esiti/rete-v1`) sulle foto vere leggeva tutte
le cerniere come carrelli e non distingueva il verso dei momenti; il
generatore è stato corretto (proporzioni dei simboli varie, punte degli
archi nel canale delle frecce, foto slavate) e la rete riaddestrata (v2).

Validazione sintetica (700 campioni, pezzi centrali da 512 px; picchi entro 1 cella):

| Testa | Precisione | Richiamo |
|---|---|---|
| pallini | 0,96 | 0,99 |
| vincoli (con il tipo) | 0,87 | 0,98 |
| frecce | 0,93 | 0,97 |
| nodi | 0,97 | 0,99 |
| scritte (con il valore) | 0,92 | 0,97 |
| momenti (canali 16–17) | 0,48 | 0,95 |

Valori dell'epoca 18, quella esportata. Errore d'angolo medio: vincoli 3,9°,
frecce 4,9°. IoU della segmentazione: asta 0,80, simbolo 0,68, carico 0,67,
testo 0,65, ausiliaria 0,63, altro 0,47.

I canali dei momenti trovano l'arco ma accendono entrambi i versi (per questo
la precisione è 0,48): il verso si legge dalla punta dell'arco nel canale
delle frecce. La regola per la decodifica è in `vocabolario.py` e in
`foto.json` (centri = massimo dei canali 16 e 17; punta = la freccia più
vicina, fra 6 e 90 px; verso dal prodotto vettoriale): dà il verso giusto
nell'81 % dei momenti della validazione; conoscendo il raggio vero
(per esempio dalla segmentazione dell'arco) si sale al 91 %.

Foto vere (`python -m rete.guarda`, ritaglio sul riquadro scritto a mano):

| | v1 | v2 |
|---|---|---|
| tipo dei vincoli (01, 07, 13, 17, 19–22, 24: 26 vincoli) | 8 / 26 (nessuna cerniera) | 23 / 26 |
| verso dei momenti (03, 04, 07, 11, 13, 15, 18, 23, 24) | ~50 % per costruzione | 6 / 9 (11 sbagliato, 03 senza punta, 07 non trovato) |

Impressioni sulle foto vere (v2): aste, pallini, distribuiti col verso giusto
(anche orizzontali), forze e scritte (L, 2L, L/2, q, 2q, F, M) si leggono bene
sia sui disegni puliti sia sui fogli fotografati. Errori visti:
- le frecce del segno di sezione (K nella 08) prese per carichi;
- la lettera «O» di un nodo (22) presa per un pallino;
- la cerniera a soffitto della 24 letta come carrello;
- la foto 21 (tratti grigi e sottili su carta azzurrina) segmenta male le colonne;
- sul disegno a mano su quadretti (17) doppioni e una biella inventata, e le
  «L» scritte a mano non sempre riconosciute.

Cosa migliorare nel generatore, se la Fase 4 lo conferma: segni di sezione
con frecce (come «altro disegno»), lettere dei nodi tonde (O, D, Q) vicino ai
pallini, vincoli a soffitto più frequenti, più disegni a mano su quadretti.

## Fase 4: dalla foto alla struttura (2026-10-16)

La decodifica vive in `src/foto/rete/` (TypeScript, la stessa nell'app e negli
strumenti): pagina a 768 px → figure (`figura.ts`) → ritaglio con il 15 % di
margine → rete → `decodifica.ts` (punti, aste fra i nodi, verso dei momenti
dalla punta) → `raddrizza.ts` → `quote.ts` (aggancio degli estremi) →
`leggi()` della Fase 1. La rete gira con onnxruntime-web anche in Node.

```bash
npm run foto:valuta -- --meta sviluppo|prova|tutte [--sintetici N]
```

Scrive in `dati-foto/esiti/` la struttura letta (`NN.vektor`, si apre in
VektorLab), `NN.json` e `NN.svg` (sovrapposizione sulla foto originale).
Metà di sviluppo: 01–08, 18, 19, 22; metà di prova: 09–17, 20, 21, 23, 24.

| Misura (2026-10-16) | Media correzioni | Perfette |
|---|---|---|
| ritagli sintetici di validazione, rete diretta (60) | — | 36 / 60 |
| foto sintetiche intere, due passate (50) | 2,64 | 17 / 50 |
| foto vere, sviluppo (11) | 4,18 | 2 / 11 |
| foto vere, **prova** (13, misurata una volta) | **4,92** | 2 / 13 |

Obiettivo v1 della spec (≤ 2 correzioni di media sulla prova): **non ancora
raggiunto**. Tempo: ~1 s a foto in Node su un thread (Mac M2).

Taratura fatta sulla metà di sviluppo (ognuna con il suo test):
- estremi delle quote agganciati al punto notevole più vicino lungo l'asse,
  entro il 30 % della quota: la regressione sbaglia di 6 px in mediana e 14 px
  al 90 % anche sul sintetico, la lettura li vuole entro ~10 px;
- carichi e ausiliarie sopra un'asta non la spezzano (nelle foto vere le aste
  sottili prendono il colore delle quote vicino a una forza); un pallino col
  centro sulla retta invece sì.

Errori che restano, quasi tutti della rete (da correggere nel generatore e
riaddestrando, non nella decodifica):
- aste sottili come le linee di quota lette come «ausiliaria» (05: la
  mensolina verticale; 12, 21: interi telai) — nei disegni sintetici le aste
  sono sempre più spesse delle ausiliarie;
- lettere dei nodi (A, B, C) e la «F» lette come «q»; frecce inventate (23);
- foto sintetiche intere peggiori dei ritagli: la figura è di ~310 px e va
  ingrandita 2,5× (il ritaglio d'addestramento non è mai sfocato così).

## Da fare (revisione della Fase 2, 2026-10-15)

Risolto nella Fase 3:
- **Risoluzione per la seconda passata.** Le foto sintetiche erano larghe
  600–1400 px, con il riquadro della figura di ~310 px di lato lungo mediano.
  Ora c'è il modo `ritaglio`, che genera la figura direttamente a 768 px:
  il riquadro va da 480 a 660 px.
- angolo dei vincoli interni ambiguo di 180°: nei bersagli va nel semipiano
  di `vocabolario.semipiano`;
- classi sottili perse nella riduzione: la segmentazione si riduce per
  priorità di classe (`bersagli.riduci_seg`);
- primitive `nodi` sempre vuote: i nodi dei bersagli vengono dagli estremi delle aste.

Dalla revisione della Fase 3 (2026-10-16), per le fasi successive:
- l'inchiostro disegnato sta ~0,5 px in alto a sinistra delle etichette
  (PIL tronca le coordinate e la tela è a 2×): la rete mette i picchi ~0,5 px
  in basso a destra del tratto. Uniforme e sotto 1/8 di cella: correggibile
  nella decodifica o nel raster;
- l'elenco degli operatori ammessi non è stato provato in onnxruntime-web:
  nel backend WASM ci sono tutti; HardSwish su WebGPU è da verificare (Fase 5).

Minori rinviati:
- due scritte di forze vicine (11 px) si possono scambiare (seme 285 con `--rari`, 1/1000);
- frecce dei carichi che attraversano i simboli di vincolo (2,6 % delle scene);
- la sezione trasversale può cadere sulla figura e sovrascriverne la maschera (~1/1500);
- test d'allineamento ancora permissivi (finestre di qualche pixel);
- i font calligrafici sono solo di macOS: su Colab lo stile a mano ricade sui
  font da stampa (e ∫ σ τ diventano quadratini);
- le lettere dei nodi possono cadere sulle aste a 45° (testo sopra l'asta nella maschera);
- `serializza` sta in `__main__` (meglio in `campione`); `meta.riquadro` è in
  pixel y giù mentre le primitive sono y su;
- ~0,4 s a campione (`applica` 60 %): per generare al volo servono più processi.

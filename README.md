# VektorLab

Analisi strutturale di **telai piani**, nel browser. Si disegna la struttura,
si mettono vincoli e carichi, e si leggono reazioni, diagrammi `N`, `T`, `M`,
deformata e verifiche di resistenza.

È una **beta**.

## Cosa fa

- **Topologia** — conta i corpi rigidi con union-find sui segmenti. Nulla
  separa un corpo tranne una sconnessione interna esplicita: né un nodo, né un
  vincolo esterno, né il modo in cui è stato tracciato il disegno.
- **Classificazione** — isostatica, iperstatica o labile, decisa sul **rango**
  della matrice cinematica e non sulla differenza `3n − v`: solo il rango
  intercetta i vincoli mal disposti, e labilità e iperstaticità possono
  coesistere.
- **Reazioni per due strade indipendenti** — equazioni cardinali sui corpi
  rigidi e metodo degli spostamenti. Il programma le confronta e lo dichiara se
  divergono.
- **Diagrammi** `N`, `T`, `M` ricostruiti per equilibrio del tronco (metodo
  dell'elementino), con corpo libero ispezionabile al clic.
- **Dieci autoverifiche** dopo ogni calcolo: momento nullo nelle cerniere,
  continuità nei nodi rigidi, `dM/ds = T` in forma differenziale e integrale,
  confronto incrociato fra i due motori.
- **Verifiche di resistenza** con von Mises e Tresca sul punto più sollecitato
  della sezione, non solo sulla fibra estrema.

## Avvio in locale

```bash
npm install
npm run dev
```

L'indirizzo compare nel terminale (di norma `http://localhost:5180`).

## Test

```bash
npm test
```

Sono oltre cinquecento, e comprendono una suite di venti casi con soluzione in
forma chiusa (trave appoggiata, mensola, Gerber, arco a tre cerniere, telai) e
i test di regressione sulla topologia.

## Struttura

```
src/core/     modello, topologia, FEM, statica — nessuna dipendenza da React
src/render/   disegno su canvas: scena, simboli, diagrammi
src/ui/       componenti React e pannelli
src/worker/   il solutore, che gira fuori dal thread dell'interfaccia
test/         suite automatica
cli/          analisi da riga di comando: npm run analyze -- file.vektor
```

La regola che tiene in piedi il progetto: **`core/` non importa nulla da
`ui/` o `render/`**. Un'analisi completa gira da riga di comando con un JSON in
ingresso, ed è il motivo per cui il nucleo è testabile senza un browser.

## Pubblicazione

Vedi [DEPLOY.md](DEPLOY.md).

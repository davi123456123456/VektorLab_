# Pubblicare VektorLab su Vercel

Procedura completa, dall'inizio. Non serve conoscere Vercel: bastano un account
GitHub e dieci minuti.

---

## A. Mettere il codice su GitHub

**1. Crea il repository vuoto.** Su [github.com/new](https://github.com/new):

- nome: `vektorlab`
- visibilità: come preferisci, Vercel funziona anche con i repository privati
- **NON** spuntare «Add a README file», «Add .gitignore» né la licenza

> Quella spunta è la causa più comune del rifiuto al primo `push`: GitHub
> creerebbe un commit che il tuo repository locale non ha, e i due storie
> divergerebbero prima ancora di cominciare.

**2. Carica il codice.** Dalla cartella `vektorlab`:

```bash
cd vektorlab
git init
git add .
git commit -m "VektorLab - prima versione pubblicabile"
git branch -M main
git remote add origin https://github.com/<tuo-utente>/vektorlab.git
git push -u origin main
```

Sostituisci `<tuo-utente>` con il tuo nome utente GitHub. Se ti chiede le
credenziali, la password NON è quella dell'account: serve un
[token personale](https://github.com/settings/tokens), oppure `gh auth login`
se hai la CLI di GitHub.

---

## B. Importare il progetto su Vercel

1. Vai su [vercel.com](https://vercel.com) e accedi **con l'account GitHub**.
2. **Add New… → Project**, poi scegli il repository `vektorlab`.
3. **Root Directory** — è il passaggio che si sbaglia più spesso:
   - se hai pubblicato **solo il contenuto** della cartella `vektorlab/`
     (cioè `index.html` e `package.json` stanno alla radice del repository),
     **lascia il campo vuoto**;
   - se hai pubblicato l'intera cartella di lavoro e `vektorlab/` è una
     **sottocartella**, imposta la Root Directory su `vektorlab`.

   Nel dubbio: apri il repository su GitHub. Se vedi `index.html` nella prima
   schermata, il campo va lasciato vuoto.
4. **Framework Preset**: `Vite`. Vengono compilati da soli, verifica che siano:
   - Build Command: `npm run build`
   - Output Directory: `dist`
   - Install Command: `npm install`
5. **Deploy**.

La prima build richiede uno o due minuti.

---

## C. Dopo il deploy

- L'indirizzo sarà `https://vektorlab.vercel.app`, o simile se il nome è già
  occupato. Lo trovi in cima alla pagina del progetto.
- **Ogni `git push` su `main` ripubblica il sito**, senza fare altro.
- Ogni push su un altro ramo genera un'**anteprima separata** con un suo
  indirizzo: serve a provare una modifica senza toccare la versione pubblica.
- Per un dominio tuo: *Project → Settings → Domains*.

Per aggiornare il sito:

```bash
git add .
git commit -m "descrizione della modifica"
git push
```

---

## D. Se qualcosa non funziona

| Sintomo | Causa quasi sempre | Rimedio |
|---|---|---|
| Build riuscita, **schermata bianca** | percorsi degli asset sbagliati, o `base` diverso da `/` in `vite.config.ts` | apri la console del browser (F12): se vedi 404 su `/assets/…`, controlla `base: '/'` e la Root Directory |
| **Errore di tipi** durante la build | Vercel esegue `tsc -b`, che in locale magari salti | esegui `npm run build` in locale: deve finire senza errori |
| **404 ricaricando** una pagina | manca il fallback SPA | `vercel.json` con la regola di rewrite è già incluso: verifica che sia stato committato |
| L'analisi **non parte solo in produzione** | il Web Worker non è stato incluso nel bundle | il worker va istanziato come `new Worker(new URL('./solver.worker.ts', import.meta.url), { type: 'module' })` — con un percorso in forma di stringa funziona in `dev` e fallisce in silenzio nella build |
| Build in **timeout** o memoria esaurita | bundle troppo grande | attiva il code splitting sui moduli pesanti |
| `npm ci` fallisce | `package-lock.json` non committato o incoerente | esegui `npm install` in locale, committa il lock aggiornato |

### Provare in locale la build di produzione

Prima di pubblicare, vale la pena riprodurre esattamente ciò che farà Vercel:

```bash
npm ci        # installa esattamente le versioni del lock
npm run build # tsc -b + vite build
npm run preview
```

Apri l'indirizzo mostrato e **usa davvero il programma**: carica un esempio,
lancia un'analisi, guarda i diagrammi. Che la build non dia errori non
significa che il sito funzioni — il Web Worker, in particolare, si rompe solo
lì.

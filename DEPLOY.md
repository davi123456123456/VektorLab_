# Pubblicare VektorLab su Vercel

Procedura completa, dall'inizio. Non serve conoscere Vercel: bastano un account
GitHub e dieci minuti.

---

## A. Mettere il codice su GitHub

Il repository locale **è già pronto**: `git init` è stato fatto, i file sono
committati sul ramo `main`, e l'identità git è configurata. Manca solo il
collegamento a GitHub.

### A.1 — Il token, al posto della password

Da anni GitHub non accetta più la password dell'account per il `push`. Serve un
*token*, che è una password usa-e-getta con permessi limitati.

1. Vai su [github.com/settings/tokens](https://github.com/settings/tokens/new)
   (Settings → Developer settings → Personal access tokens → Tokens classic).
2. **Note**: `vektorlab`. **Expiration**: 90 giorni va benissimo.
3. Spunta **solo** la casella `repo`. Nient'altro serve.
4. **Generate token**, poi **copialo subito**: GitHub lo mostra una volta sola.

Il token si incolla quando `git push` chiede la *password*. Con
`credential.helper osxkeychain` (già impostato) macOS lo salva nel Portachiavi e
non lo richiede più.

### A.2 — Collegare e caricare

Se il repository su GitHub **non esiste ancora**, crealo su
[github.com/new](https://github.com/new) con nome `vektorlab`, e **senza**
spuntare README, .gitignore o licenza — quelle spunte creano un commit che fa
divergere le due storie prima ancora di cominciare.

```bash
cd vektorlab
git remote add origin https://github.com/<tuo-utente>/vektorlab.git
git branch -M main
git push -u origin main
```

Se invece il repository **esiste già con dei file caricati a mano**, quella
copia va sostituita: è incompleta, ed è la causa degli errori
`TS2307 Cannot find module` nella build di Vercel.

```bash
cd vektorlab
git remote add origin https://github.com/<tuo-utente>/vektorlab.git
git push -u origin main --force
```

> `--force` **cancella i commit che ci sono ora su GitHub** e li sostituisce
> con quelli locali. Qui è giusto, perché quelli sono caricamenti parziali dello
> stesso progetto e non contengono niente che non sia già in locale. Ma è
> irreversibile: controlla di non avere modifiche fatte solo dal browser.

### A.3 — Verificare che sia arrivato tutto

Il file `ELENCO-FILE.txt` contiene i nomi di tutti i file che devono esserci.
Per confrontarlo con quello che è finito davvero su GitHub:

```bash
cd /tmp && rm -rf verifica && git clone --quiet https://github.com/<tuo-utente>/vektorlab.git verifica && cd verifica && git ls-files | diff - ELENCO-FILE.txt && echo "COMPLETO: non manca niente"
```

Se stampa `COMPLETO`, il caricamento è a posto. Se stampa delle righe, quelle
sono i file mancanti.

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
5. **Node.js Version**: `22.x`. È in *Settings → General*, e va controllata anche
   se il campo sembra già a posto.

   > Questa è la causa più insidiosa di una build che fallisce solo su Vercel.
   > Vite 8 non parte sotto Node 20.19, e non parte su nessuna 21: se Vercel
   > sceglie una di quelle versioni, `npm run build` esce con 1 senza che in
   > locale si sia visto niente, perché in locale gira una versione più nuova.
   > `engines.node` nel `package.json` dichiara `22.x` proprio per non lasciare
   > la scelta al caso.
6. **Deploy**.

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
| **`npm run build` esce 1 su Vercel ma funziona in locale** | versione di Node diversa: Vite 8 richiede `^20.19 \|\| >=22.12`, e in locale gira una versione più nuova che nasconde il problema | `engines.node` in `package.json` deve dire `22.x`, non un intervallo aperto come `>=20`; controlla anche *Project → Settings → Node.js Version* |
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

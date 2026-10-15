# Addestramento — struttura da foto

Generatore sintetico (Fase 2) e, più avanti, rete e addestramento (Fase 3).
Non fa parte dell'app: gira solo sulla macchina di sviluppo.

Spec: `../docs/superpowers/specs/2026-10-14-struttura-da-foto-design.md`.

## Ambiente

Si usa il `.venv` della cartella superiore (Python 3.9 con numpy, scipy,
Pillow, pytest). Per ricrearlo altrove:

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
```

## Comandi

```bash
../../.venv/bin/python -m pytest
```

Le uscite generate (immagini, gallerie) vanno in `esiti/`, esclusa da git.

## Campagna sulle regole di lettura

```bash
npm run foto:campagna -- --n 500 --seme 1 [--rumore 3]
```

Il generatore produce le primitive ideali di N schemi casuali; la lettura
della Fase 1 (`src/foto/`) le legge e le confronta con lo schema di partenza.

| Prova (2026-10-15) | Letture perfette | Correzioni medie |
|---|---|---|
| semi 1–500, nessun rumore | 100 % | 0.00 |
| semi 1001–1500, nessun rumore | 100 % | 0.00 |
| semi 1–500, punti spostati di ±3 px | 97.0 % | 0.05 |

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

## Da fare (revisione della Fase 2, 2026-10-15)

Da decidere nel piano della Fase 3, **prima** di addestrare:
- **Risoluzione per la seconda passata.** Le foto sintetiche sono larghe
  600–1400 px e il riquadro della figura ha il lato lungo mediano di ~310 px:
  per la seconda passata a 768 px (spec §5.3) andrebbe ingrandito ~2,5×, mentre
  le foto vere (3000–4000 px) si rimpiccioliscono. Strade: generare
  direttamente il ritaglio attorno alla figura alla risoluzione giusta (anche
  più veloce), oppure pagine renderizzate più grandi.

Minori rinviati:
- frecce dei carichi che attraversano i simboli di vincolo (2,6 % delle scene);
- la sezione trasversale può cadere sulla figura e sovrascriverne la maschera (~1/1500);
- angolo dei vincoli interni: è l'asse dell'asta, ma `trasforma_primitive` lo
  tratta come un puntamento, ed è ambiguo di 180° (conta solo per la testa
  d'orientamento della rete);
- le classi sottili (quote, richiami) si frammentano col campionamento al più
  vicino e la riduzione: dilatarle o usare il max-pool per i bersagli;
- test d'allineamento ancora permissivi (finestre di qualche pixel);
- le primitive `nodi` sono sempre vuote: serviranno alla testa Nodi;
- i font calligrafici sono solo di macOS: su Colab lo stile a mano ricade sui
  font da stampa (e ∫ σ τ diventano quadratini);
- le lettere dei nodi possono cadere sulle aste a 45° (testo sopra l'asta nella maschera);
- `serializza` sta in `__main__` (meglio in `campione`); `meta.riquadro` è in
  pixel y giù mentre le primitive sono y su;
- ~0,4 s a campione (`applica` 60 %): per generare al volo servono più processi.

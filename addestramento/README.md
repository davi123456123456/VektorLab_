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

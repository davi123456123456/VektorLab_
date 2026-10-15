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

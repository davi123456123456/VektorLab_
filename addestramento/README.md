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

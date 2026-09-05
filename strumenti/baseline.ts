/**
 * §0.2 — `npm run baseline:check`.
 *
 * Rigenera i risultati dei modelli di riferimento e li confronta con le
 * istantanee salvate in `test/baseline/`. Differenza attesa: esattamente
 * nulla, con tolleranza 1e-12 relativo per assorbire un eventuale riordino
 * di somme in virgola mobile.
 *
 * Quando qualcosa cambia, dice QUALE MODELLO, QUALE GRANDEZZA, QUALE ASCISSA
 * e di quanto — perché uno scostamento senza indirizzo costringe a cercarlo a
 * ritroso fra sei correzioni, che è il tempo che questo strumento esiste per
 * risparmiare.
 *
 *   npm run baseline:write   registra la linea di base (da fare una volta)
 *   npm run baseline:check   la verifica (da fare dopo ogni punto)
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODELLI } from '../test/baseline/modelli.js';
import { istantanea, confronta, type Istantanea } from '../test/baseline/istantanea.js';

const QUI = dirname(fileURLToPath(import.meta.url));
const CARTELLA = join(QUI, '..', 'test', 'baseline');

const scrivi = process.argv.includes('--scrivi');
const dettaglio = process.argv.includes('--dettaglio');

/** Quanti scostamenti mostrare per modello prima di riassumere. */
const MOSTRA = dettaglio ? Number.POSITIVE_INFINITY : 8;

function percorso(nome: string): string {
  return join(CARTELLA, `${nome}.json`);
}

/**
 * Traduce l'indirizzo interno nell'ascissa a cui corrisponde.
 *
 * «aste[0].griglia.M[40]» dice dove sta il numero nella struttura dati, non
 * dove sta sull'asta: il §0.2 chiede l'ascissa, che è l'unica coordinata con
 * cui si può andare a guardare il diagramma.
 */
function conAscissa(dove: string, s: Istantanea): string {
  const g = /^aste\[(\d+)\]\.(?:griglia|deformata)\.[a-zA-Z]+\[(\d+)\]$/.exec(dove);
  if (g) {
    const a = s.aste[Number(g[1])];
    const x = a?.griglia.x[Number(g[2])];
    if (a && x !== undefined) {
      return `${dove}   → asta ${a.astaId}, x = ${x.toFixed(4)} m di ${a.lunghezza.toFixed(4)}`;
    }
  }
  const d = /^aste\[(\d+)\]\.discontinuita\[(\d+)\]\./.exec(dove);
  if (d) {
    const a = s.aste[Number(d[1])];
    const x = a?.discontinuita[Number(d[2])]?.x;
    if (a && x !== undefined) return `${dove}   → asta ${a.astaId}, discontinuità a x = ${x.toFixed(4)} m`;
  }
  const n = /^aste\[(\d+)\]\./.exec(dove);
  if (n) {
    const a = s.aste[Number(n[1])];
    if (a) return `${dove}   → asta ${a.astaId}`;
  }
  return dove;
}

function registra(): void {
  if (!existsSync(CARTELLA)) mkdirSync(CARTELLA, { recursive: true });
  let byte = 0;
  for (const m of MODELLI) {
    const testo = `${JSON.stringify(istantanea(m.nome, m.progetto), null, 1)}\n`;
    writeFileSync(percorso(m.nome), testo);
    byte += testo.length;
    process.stdout.write(`  registrato  ${m.nome}\n`);
  }
  process.stdout.write(
    `\n${MODELLI.length} modelli, ${(byte / 1024).toFixed(0)} KB in test/baseline/\n`,
  );
}

function verifica(): number {
  const salvati = new Set(
    readdirSync(CARTELLA).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)),
  );
  let modelliConScostamenti = 0;
  let totale = 0;
  let peggiore = { dove: '', rel: 0, modello: '' };

  for (const m of MODELLI) {
    const f = percorso(m.nome);
    if (!existsSync(f)) {
      process.stdout.write(`  MANCA       ${m.nome} — nessuna linea di base registrata\n`);
      modelliConScostamenti++;
      continue;
    }
    salvati.delete(m.nome);
    const atteso = JSON.parse(readFileSync(f, 'utf8')) as Istantanea;
    const trovato = istantanea(m.nome, m.progetto);
    const scost = confronta(atteso, trovato);

    if (scost.length === 0) {
      process.stdout.write(`  identico    ${m.nome}\n`);
      continue;
    }
    modelliConScostamenti++;
    totale += scost.length;
    process.stdout.write(`\n  ✗ SCOSTAMENTO  ${m.nome} — ${scost.length} differenze\n`);
    for (const s of scost.slice(0, MOSTRA)) {
      const r = s.relativo !== undefined ? `   (relativo ${s.relativo.toExponential(3)})` : '';
      process.stdout.write(
        `      ${conAscissa(s.dove, trovato)}\n        atteso  ${JSON.stringify(s.atteso)}\n` +
        `        trovato ${JSON.stringify(s.trovato)}${r}\n`,
      );
      if (s.relativo !== undefined && s.relativo > peggiore.rel) {
        peggiore = { dove: s.dove, rel: s.relativo, modello: m.nome };
      }
    }
    if (scost.length > MOSTRA) {
      process.stdout.write(`      … e altre ${scost.length - MOSTRA} (usa --dettaglio)\n`);
    }
    process.stdout.write('\n');
  }

  for (const orfano of salvati) {
    process.stdout.write(`  in più      ${orfano}.json — nessun modello con questo nome\n`);
  }

  process.stdout.write('\n');
  if (modelliConScostamenti === 0) {
    process.stdout.write(
      `LINEA DI BASE INTATTA — ${MODELLI.length} modelli, differenza nulla su tutto.\n`,
    );
    return 0;
  }
  process.stdout.write(
    `LINEA DI BASE VIOLATA — ${modelliConScostamenti} modelli su ${MODELLI.length}, ` +
    `${totale} differenze.\n`,
  );
  if (peggiore.rel > 0) {
    process.stdout.write(
      `Scostamento maggiore: ${peggiore.modello} · ${peggiore.dove} ` +
      `· ${peggiore.rel.toExponential(3)} relativo.\n`,
    );
  }
  return 1;
}

process.stdout.write(
  scrivi
    ? '\nRegistrazione della linea di base\n\n'
    : '\nConfronto con la linea di base\n\n',
);
if (scrivi) { registra(); process.exit(0); }
process.exit(verifica());

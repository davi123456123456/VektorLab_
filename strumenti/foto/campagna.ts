/**
 * CAMPAGNA — le regole di lettura alla prova su molti schemi sintetici.
 *
 * Fa generare al generatore Python N campioni (solo le etichette, niente
 * immagini), legge ciascuno con `leggi()` e lo confronta con lo schema da cui
 * è nato. Stampa, per famiglia, quanti si leggono esattamente e quante
 * correzioni servono in media; poi i casi peggiori, con il seme per
 * riprodurli. È una misura: esce sempre con 0.
 *
 *   npm run foto:campagna -- --n 500 --seme 1 --rumore 3 [--rari]
 *
 * Con `--rari` gli schemi usano anche doppi pendoli, pattini e bielle.
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { confronta } from '../../src/foto/confronto.js';
import { leggi } from '../../src/foto/index.js';
import { schemaInProgetto, type SchemaGenerato } from '../../src/foto/schema.js';
import type { Primitive } from '../../src/foto/tipi.js';

const radice = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const opzione = (nome: string, predefinito: number): number => {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 ? Number(process.argv[i + 1]) : predefinito;
};
const n = opzione('n', 300);
const seme = opzione('seme', 1);
const rumore = opzione('rumore', 0);
const python = process.env.FOTO_PYTHON ?? join(radice, '..', '.venv', 'bin', 'python');

const cartella = mkdtempSync(join(tmpdir(), 'campagna-'));
const esito = spawnSync(python, [
  '-m', 'generatore', '--solo-etichette', '--n', String(n), '--seme', String(seme),
  '--rumore', String(rumore), '--uscita', cartella,
  ...(process.argv.includes('--rari') ? ['--rari'] : []),
], { cwd: join(radice, 'addestramento'), stdio: 'inherit' });
if (esito.status !== 0) {
  console.error(`Il generatore è uscito con ${esito.status}. Python usato: ${python} (variabile FOTO_PYTHON)`);
  process.exit(1);
}

interface Riga { n: number; perfetti: number; correzioni: number }
const perFamiglia = new Map<string, Riga>();
const casi: { seme: number; famiglia: string; correzioni: number; differenze: string[] }[] = [];

for (const file of readdirSync(cartella).filter((f) => f.endsWith('.json')).sort()) {
  const { primitive, schema, meta } = JSON.parse(readFileSync(join(cartella, file), 'utf8')) as {
    primitive: Primitive; schema: SchemaGenerato; meta: { seme: number; famiglia: string };
  };
  const c = confronta(leggi(primitive).progetto, schemaInProgetto(schema));
  const riga = perFamiglia.get(meta.famiglia) ?? { n: 0, perfetti: 0, correzioni: 0 };
  riga.n++;
  riga.perfetti += c.perfetto ? 1 : 0;
  riga.correzioni += c.correzioni;
  perFamiglia.set(meta.famiglia, riga);
  if (!c.perfetto) casi.push({ seme: meta.seme, famiglia: meta.famiglia, correzioni: c.correzioni, differenze: c.differenze });
}
rmSync(cartella, { recursive: true, force: true });

const pct = (a: number, b: number): string => `${((100 * a) / b).toFixed(1)} %`;
console.log(`\nCampagna: ${n} schemi, seme ${seme}, rumore ±${rumore} px\n`);
console.log('famiglia      n   perfetti   correzioni medie');
let tot: Riga = { n: 0, perfetti: 0, correzioni: 0 };
for (const [f, r] of [...perFamiglia].sort()) {
  console.log(`${f.padEnd(10)} ${String(r.n).padStart(4)}   ${pct(r.perfetti, r.n).padStart(8)}   ${(r.correzioni / r.n).toFixed(2)}`);
  tot = { n: tot.n + r.n, perfetti: tot.perfetti + r.perfetti, correzioni: tot.correzioni + r.correzioni };
}
console.log(`${'TOTALE'.padEnd(10)} ${String(tot.n).padStart(4)}   ${pct(tot.perfetti, tot.n).padStart(8)}   ${(tot.correzioni / tot.n).toFixed(2)}`);
if (casi.length > 0) {
  console.log('\nCasi peggiori:');
  for (const x of casi.sort((a, b) => b.correzioni - a.correzioni).slice(0, 10)) {
    console.log(`  seme ${x.seme} (${x.famiglia}), ${x.correzioni} correzioni: ${x.differenze.slice(0, 4).join(' | ')}`);
  }
}

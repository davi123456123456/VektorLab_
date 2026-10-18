/**
 * VALUTAZIONE — le foto vere (e quelle sintetiche) dall'inizio alla fine.
 *
 *   npm run foto:valuta -- [--meta sviluppo|prova|tutte] [--sintetici N] [--senza-revisione]
 *
 * Per ogni foto di `dati-foto/foto` con la sua soluzione in
 * `dati-foto/atteso/NN.vektor`: riconosci (rete in onnxruntime-web, due
 * passate) → leggi → confronta. Stampa le correzioni per foto e per
 * categoria, poi media e perfetti per metà. In `dati-foto/esiti/` scrive
 * NN.vektor (la struttura letta, da aprire in VektorLab), NN.json
 * (primitive, avvisi, differenze) e NN.svg (sovrapposizione sulla foto).
 *
 * Le foto si convertono in PGM con `python -m rete.grigi` in una cartella
 * temporanea, cancellata alla fine. Le soglie si tarano solo su «sviluppo».
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { confronta, type Confronto } from '../../src/foto/confronto.js';
import { leggi } from '../../src/foto/index.js';
import { rivedi } from '../../src/foto/plausibilita.js';
import { creaEsecutore } from '../../src/foto/rete/onnx.js';
import { leggiPGM } from '../../src/foto/rete/pgm.js';
import { riconosci, type Riconoscimento } from '../../src/foto/rete/riconosci.js';
import { schemaInProgetto } from '../../src/foto/schema.js';
import type { Primitive } from '../../src/foto/tipi.js';
import type { Progetto } from '../../src/core/model/types.js';
import { deserializza, serializza } from '../../src/state/file.js';
import { svg, tabella, type RigaValuta } from './valutaFormato.js';

// coppie dello stesso esercizio nella stessa metà (01=19, 04=18, 05=22)
const SVILUPPO = ['01', '02', '03', '04', '05', '06', '07', '08', '18', '19', '22'];
const PROVA = ['09', '10', '11', '12', '13', '14', '15', '16', '17', '20', '21', '23', '24'];

const radice = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const opzione = (nome: string) => {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const meta = opzione('meta') ?? 'sviluppo';
const sintetici = Number(opzione('sintetici') ?? 0);
// come nell'app la lettura passa dal revisore; --senza-revisione per misurare quanto serve
const senzaRevisione = process.argv.includes('--senza-revisione');
const leggiFoto = (p: Primitive) => (senzaRevisione ? leggi(p) : rivedi(p).lettura);
const python = process.env.FOTO_PYTHON ?? join(radice, 'addestramento', '.venv', 'bin', 'python');
const cartellaFoto = join(radice, 'dati-foto', 'foto');
const esiti = join(radice, 'dati-foto', 'esiti');

const vuoto: Primitive = { larghezza: 1, altezza: 1, aste: [], pallini: [], corpi: [], frecce: [], momenti: [], nodi: [], scritte: [] };

function riga(nome: string, m: RigaValuta['meta'], r: Riconoscimento | null, c: Confronto, avvisi: string[], ms: number): RigaValuta {
  return { nome, meta: m, esito: r ? r.esito : 'errore', correzioni: c.correzioni, perfetto: c.perfetto,
    perCategoria: c.perCategoria, differenze: c.differenze, avvisi, ms };
}

const tmp = mkdtempSync(join(tmpdir(), 'valuta-'));
try {
  const argomenti = ['-m', 'rete.grigi', '--uscita', tmp];
  if (meta !== 'nessuna') argomenti.push('--foto', cartellaFoto);
  if (sintetici > 0) argomenti.push('--sintetici', String(sintetici), '--seme', '3000001');
  const conv = spawnSync(python, argomenti, { cwd: join(radice, 'addestramento'), stdio: 'inherit' });
  if (conv.status !== 0) throw new Error(`conversione delle immagini fallita (Python: ${python})`);

  const esegui = await creaEsecutore(readFileSync(join(radice, 'public', 'modelli', 'foto.onnx')));
  const righe: RigaValuta[] = [];
  const scelte = meta === 'tutte' ? [...SVILUPPO, ...PROVA] : meta === 'prova' ? PROVA : meta === 'sviluppo' ? SVILUPPO : [];
  mkdirSync(esiti, { recursive: true });

  for (const nome of scelte) {
    const fileAtteso = join(radice, 'dati-foto', 'atteso', `${nome}.vektor`);
    const fileFoto = readdirSync(cartellaFoto).find((f) => f.startsWith(`${nome}.`));
    if (!existsSync(fileAtteso) || !fileFoto) continue;
    const d = deserializza(readFileSync(fileAtteso, 'utf8'));
    if ('errore' in d) throw new Error(`${fileAtteso}: ${d.errore}`);
    const g = leggiPGM(new Uint8Array(readFileSync(join(tmp, `${nome}.pgm`))));
    const t = performance.now();
    const r = await riconosci(g, esegui);
    const ms = Math.round(performance.now() - t);
    const letto = r.esito === 'ok' ? leggiFoto(r.primitive) : leggi(vuoto);
    const c = confronta(letto.progetto, d.progetto as Progetto);
    const avvisi = letto.avvisi.map((a) => a.codice);
    righe.push(riga(nome, SVILUPPO.includes(nome) ? 'sviluppo' : 'prova', r, c, avvisi, ms));
    writeFileSync(join(esiti, `${nome}.vektor`), serializza(letto.progetto));
    writeFileSync(join(esiti, `${nome}.json`), JSON.stringify({ riconoscimento: r, avvisi: letto.avvisi, differenze: c.differenze }, null, 1));
    writeFileSync(join(esiti, `${nome}.svg`), svg(`../foto/${fileFoto}`, g.larghezza, g.altezza, r));
  }

  for (const f of readdirSync(tmp).filter((x) => /^\d{7}\.json$/.test(x)).sort()) {
    const vero = JSON.parse(readFileSync(join(tmp, f), 'utf8'));
    const g = leggiPGM(new Uint8Array(readFileSync(join(tmp, f.replace('.json', '.pgm')))));
    const t = performance.now();
    const r = await riconosci(g, esegui);
    const ms = Math.round(performance.now() - t);
    const letto = r.esito === 'ok' ? leggiFoto(r.primitive) : leggi(vuoto);
    const c = confronta(letto.progetto, schemaInProgetto(vero.schema));
    righe.push(riga(f.replace('.json', ''), 'sintetico', r, c, letto.avvisi.map((a) => a.codice), ms));
  }

  console.log(tabella(righe));
  for (const x of righe.filter((y) => !y.perfetto && y.meta !== 'sintetico')) {
    console.log(`\n${x.nome} (${x.correzioni}): ${x.differenze.join(' | ')}${x.avvisi.length ? `\n   avvisi: ${x.avvisi.join(', ')}` : ''}`);
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

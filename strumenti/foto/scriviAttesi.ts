/**
 * Scrive le soluzioni attese del banco di prova in `dati-foto/atteso/NN.vektor`
 * e controlla che ciascuna sia un modello sano: integro, analizzabile, e —
 * siccome gli esercizi d'esame lo sono quasi sempre — isostatico. Una
 * soluzione labile o iperstatica è il segno più probabile di una lettura
 * sbagliata della foto, e va guardata.
 *
 * Le soluzioni stanno in `dati-foto/attesi.ts`, escluso da git come le foto.
 *
 *   npm run foto:attesi
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analizzaCinematica } from '../../src/core/index.js';
import { verificaIntegrita } from '../../src/core/model/integrita.js';
import { serializza } from '../../src/state/file.js';
import type { Progetto } from '../../src/core/model/types.js';

const radice = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const sorgente = join(radice, 'dati-foto', 'attesi.ts');
const uscita = join(radice, 'dati-foto', 'atteso');

if (!existsSync(sorgente)) {
  console.error(`Manca ${sorgente}: il banco di prova vive solo in locale.`);
  process.exit(1);
}
const { attesi } = (await import(sorgente)) as { attesi: Record<string, () => Progetto> };
mkdirSync(uscita, { recursive: true });

let errori = 0;
for (const [nome, costruisci] of Object.entries(attesi)) {
  const p = costruisci();
  const integrita = verificaIntegrita(p);
  let esito: string;
  try {
    const c = analizzaCinematica(p);
    esito = `${c.classificazione}  (labilità ${c.labilita}, iperstaticità ${c.iperstaticita})`;
  } catch (e) {
    esito = `ANALISI FALLITA: ${(e as Error).message}`;
    errori++;
  }
  if (!integrita.integro) {
    errori++;
    esito += `  ANOMALIE: ${integrita.anomalie.map((a) => a.messaggio).join('; ')}`;
  }
  writeFileSync(join(uscita, `${nome}.vektor`), serializza(p));
  console.log(`${integrita.integro ? 'ok ' : 'KO '} ${nome}  ${esito}`);
}
process.exit(errori > 0 ? 1 : 0);

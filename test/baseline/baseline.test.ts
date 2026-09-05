/**
 * §0.3 — la linea di base dentro la suite.
 *
 * `npm run baseline:check` è lo strumento da lanciare a mano dopo ogni punto,
 * con il suo resoconto leggibile. Questo test fa lo stesso confronto dentro
 * `npm test`: uno strumento che va ricordato prima o poi non viene lanciato,
 * e allora la linea di base smette di proteggere qualcosa.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODELLI } from './modelli.js';
import { istantanea, confronta, type Istantanea } from './istantanea.js';

const CARTELLA = dirname(fileURLToPath(import.meta.url));

describe('§0 — linea di base dei risultati', () => {
  it('ogni modello di riferimento ha la sua istantanea registrata', () => {
    const mancanti = MODELLI
      .filter((m) => !existsSync(join(CARTELLA, `${m.nome}.json`)))
      .map((m) => m.nome);
    expect(mancanti).toEqual([]);
  });

  for (const m of MODELLI) {
    it(`${m.nome} — risultati identici alla linea di base`, () => {
      const f = join(CARTELLA, `${m.nome}.json`);
      const atteso = JSON.parse(readFileSync(f, 'utf8')) as Istantanea;
      const scost = confronta(atteso, istantanea(m.nome, m.progetto));
      // Il messaggio porta i primi scostamenti con il loro indirizzo: un
      // «expected 3 to be 0» non direbbe quale grandezza è cambiata.
      expect(scost.slice(0, 5).map((s) => s.dove), JSON.stringify(scost.slice(0, 5), null, 1))
        .toEqual([]);
    });
  }
});

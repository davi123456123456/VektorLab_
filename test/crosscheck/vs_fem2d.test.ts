/**
 * VALIDAZIONE INCROCIATA con il solutore Python `fem2d`.
 *
 * `fem2d` è verificato indipendentemente contro le soluzioni analitiche ed è
 * scritto in un altro linguaggio, con un'altra struttura di codice e da un
 * altro percorso di ragionamento. Se i due motori concordano fino alla
 * precisione di macchina su telai iperstatici asimmetrici, gli errori
 * sistematici di convenzione (segni, trasformazioni, carichi equivalenti)
 * sono di fatto esclusi: sarebbe necessario commettere lo STESSO errore due
 * volte in due implementazioni diverse.
 *
 * Il riferimento si rigenera con:
 *     .venv/bin/python strutlab/fixtures/genera_riferimento_python.py \
 *         > strutlab/fixtures/riferimento_python.json
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { progetto, analizzaCaso, rettangolare } from '../../src/core/index.js';
import type { LoadCaseId } from '../../src/core/model/types.js';

const qui = dirname(fileURLToPath(import.meta.url));
const rif = JSON.parse(
  readFileSync(join(qui, '..', '..', 'fixtures', 'riferimento_python.json'), 'utf-8'),
) as {
  casi: Record<string, {
    spostamenti: number[][];
    reazioni: number[][];
    momenti_estremita: number[][];
  }>;
};

const CASO = 'principale' as LoadCaseId;
const SEZ = rettangolare(0.10, 0.20, 'SEZ');
const EB = { teoria: 'eulero-bernoulli' as const };

/** confronto relativo robusto anche quando il valore atteso è ~0 */
function vicino(ottenuto: number, atteso: number, tolRel = 1e-9, scala = 1) {
  const denom = Math.max(Math.abs(atteso), scala);
  expect(Math.abs(ottenuto - atteso) / denom).toBeLessThan(tolRel);
}

describe('confronto con fem2d (Python)', () => {
  it('portale a piedi incastrati con carico distribuito', () => {
    const atteso = rif.casi.portale_incastrato;
    const L = 6, H = 4, q = 25000;

    const p = progetto('portale');
    const p1 = p.nodo(0, 0);
    const t1 = p.nodo(0, H);
    const t2 = p.nodo(L, H);
    const p2 = p.nodo(L, 0);
    p.asta(p1, t1, 'S355', 'SEZ', EB);
    const trave = p.asta(t1, t2, 'S355', 'SEZ', EB);
    p.asta(t2, p2, 'S355', 'SEZ', EB);
    p.sezione(SEZ);
    p.vincolo(p1, 'incastro');
    p.vincolo(p2, 'incastro');
    p.distribuito(trave, -q);

    const r = analizzaCaso(p.costruisci(), CASO);

    // spostamenti nodali
    for (let k = 0; k < 4; k++) {
      vicino(r.spostamenti[3 * k], atteso.spostamenti[k][0], 1e-8, 1e-9);
      vicino(r.spostamenti[3 * k + 1], atteso.spostamenti[k][1], 1e-8, 1e-9);
      vicino(r.spostamenti[3 * k + 2], atteso.spostamenti[k][2], 1e-8, 1e-9);
    }

    // reazioni
    const R1 = r.reazioni.find((x) => x.nodoId === p1)!;
    const R2 = r.reazioni.find((x) => x.nodoId === p2)!;
    vicino(R1.fx, atteso.reazioni[0][0], 1e-8, 1);
    vicino(R1.fy, atteso.reazioni[0][1], 1e-8, 1);
    vicino(R1.mz, atteso.reazioni[0][2], 1e-8, 1);
    vicino(R2.fx, atteso.reazioni[1][0], 1e-8, 1);
    vicino(R2.fy, atteso.reazioni[1][1], 1e-8, 1);
    vicino(R2.mz, atteso.reazioni[1][2], 1e-8, 1);

    // momenti alle estremità di ogni asta
    for (let e = 0; e < 3; e++) {
      const asta = r.aste[e];
      vicino(asta.M[0], atteso.momenti_estremita[e][0], 1e-8, 1);
      vicino(asta.M[asta.M.length - 1], atteso.momenti_estremita[e][1], 1e-8, 1);
    }
  });

  it('telaio asimmetrico a due campate con carichi misti', () => {
    const atteso = rif.casi.telaio_due_campate;

    const p = progetto('telaio due campate');
    const a = p.nodo(0, 0);
    const b = p.nodo(0, 3.5);
    const c = p.nodo(5, 3.5);
    const d = p.nodo(9, 3.5);
    const e = p.nodo(9, 0);
    p.asta(a, b, 'S355', 'SEZ', EB);
    const t1 = p.asta(b, c, 'S355', 'SEZ', EB);
    const t2 = p.asta(c, d, 'S355', 'SEZ', EB);
    p.asta(d, e, 'S355', 'SEZ', EB);
    p.sezione(SEZ);
    p.vincolo(a, 'incastro');
    p.vincolo(e, 'cerniera');
    p.distribuito(t1, -18000);
    p.distribuito(t2, -12000);
    p.forza(b, 15000, 0);

    const r = analizzaCaso(p.costruisci(), CASO);

    for (let k = 0; k < 5; k++) {
      vicino(r.spostamenti[3 * k], atteso.spostamenti[k][0], 1e-8, 1e-9);
      vicino(r.spostamenti[3 * k + 1], atteso.spostamenti[k][1], 1e-8, 1e-9);
      vicino(r.spostamenti[3 * k + 2], atteso.spostamenti[k][2], 1e-8, 1e-9);
    }

    const Ra = r.reazioni.find((x) => x.nodoId === a)!;
    const Re = r.reazioni.find((x) => x.nodoId === e)!;
    vicino(Ra.fx, atteso.reazioni[0][0], 1e-8, 1);
    vicino(Ra.fy, atteso.reazioni[0][1], 1e-8, 1);
    vicino(Ra.mz, atteso.reazioni[0][2], 1e-8, 1);
    vicino(Re.fx, atteso.reazioni[1][0], 1e-8, 1);
    vicino(Re.fy, atteso.reazioni[1][1], 1e-8, 1);

    for (let el = 0; el < 4; el++) {
      const asta = r.aste[el];
      vicino(asta.M[0], atteso.momenti_estremita[el][0], 1e-8, 1);
      vicino(asta.M[asta.M.length - 1], atteso.momenti_estremita[el][1], 1e-8, 1);
    }

    expect(r.equilibrio.soddisfatto).toBe(true);
  });
});

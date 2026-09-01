/**
 * REGRESSIONE — `spostamentoMassimo` sommava due massimi presi in punti
 * diversi.
 *
 * Il caso minimo che lo riproduce: una mensola con forza in punta. Lo
 * spostamento massimo è quello della punta, e vale esattamente PL³/3EI; il
 * codice restituiva 1,19245 volte tanto, perché sommava lo spostamento
 * dell'estremo (in punta) alla freccia rispetto alla corda (a metà).
 *
 * Il numero 0,19245 non è casuale: è il massimo di
 * `x²(3L−x)/(2L³) − x/L` sul tratto, cioè lo scarto fra l'elastica e la
 * corda inclinata, normalizzato alla freccia di punta.
 *
 * Trovato dal catalogo del §10.1, non da un test scritto a mano: nessuno
 * l'avrebbe notato guardando il disegno, perché la deformata era giusta —
 * sbagliato era il numero mostrato accanto.
 */

import { describe, it, expect } from 'vitest';
import { progetto } from '../../src/core/builder.js';
import { preset, proprietaDa } from '../../src/core/materials/sezioniParametriche.js';
import { analizzaCaso } from '../../src/core/index.js';
import { materialePerId } from '../../src/core/materials/materials.js';
import type { LoadCaseId } from '../../src/core/model/types.js';

const CASO = 'principale' as LoadCaseId;
const SEZ = preset('IPE 300');
const EI = materialePerId('S275').E * proprietaDa(SEZ).I;

function mensolaConPunta(L: number, P: number) {
  const b = progetto('mensola');
  const s = b.sezioneParametrica('s', SEZ);
  const n1 = b.nodo(0, 0), n2 = b.nodo(L, 0);
  b.asta(n1, n2, 'S275', s, { teoria: 'eulero-bernoulli' });
  b.vincolo(n1, 'incastro');
  b.forza(n2, 0, -P);
  return analizzaCaso(b.costruisci(), CASO);
}

describe('mensola: lo spostamento massimo è quello della punta', () => {
  for (const [L, P] of [[4, 12e3], [7, 4e3], [2.5, 31e3]] as const) {
    it(`L=${L} m, P=${P / 1e3} kN`, () => {
      const r = mensolaConPunta(L, P);
      const atteso = (P * L ** 3) / (3 * EI);

      // il nodo di punta è il massimo, e lo è esattamente
      expect(r.spostamentoMassimo).toBeCloseTo(atteso, 9);

      // non deve MAI superare lo spostamento del nodo più lontano: su questa
      // struttura il massimo è in punta e non c'è niente che possa batterlo
      const massimoNodale = Math.max(...r.aste.flatMap(() =>
        [0, 1].map((k) => Math.hypot(
          r.spostamenti[3 * k], r.spostamenti[3 * k + 1]))));
      expect(r.spostamentoMassimo).toBeLessThanOrEqual(massimoNodale * (1 + 1e-9));
    });
  }

  it('sulla trave appoggiata resta esatto: la corda non si muove', () => {
    const L = 6, q = 10e3;
    const b = progetto('appoggiata');
    const s = b.sezioneParametrica('s', SEZ);
    const n1 = b.nodo(0, 0), n2 = b.nodo(L, 0);
    const el = b.asta(n1, n2, 'S275', s, { teoria: 'eulero-bernoulli' });
    b.vincolo(n1, 'cerniera'); b.vincolo(n2, 'carrello');
    b.distribuito(el, -q);
    const r = analizzaCaso(b.costruisci(), CASO);
    expect(r.spostamentoMassimo).toBeCloseTo((5 * q * L ** 4) / (384 * EI), 12);
  });
});

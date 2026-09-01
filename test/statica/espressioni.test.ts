/**
 * §6 — le espressioni polinomiali, e il grado atteso.
 */

import { describe, it, expect } from 'vitest';
import { progetto } from '../../src/core/builder.js';
import { preset } from '../../src/core/materials/sezioniParametriche.js';
import { analizzaCaso } from '../../src/core/index.js';
import {
  espressioniPerAsta, scrivi, valuta,
} from '../../src/core/statica/espressioni.js';
import type { LoadCaseId } from '../../src/core/model/types.js';

const CASO = 'principale' as LoadCaseId;

function espressioni(costruisci: (b: ReturnType<typeof progetto>) => void) {
  const b = progetto('x');
  costruisci(b);
  const r = analizzaCaso(b.costruisci(), CASO);
  const a = r.aste[0];
  return {
    tratti: espressioniPerAsta(a.ascisse, a.N, a.T, a.M, a.lunghezza),
    asta: a,
  };
}

describe('§6.3 — il grado atteso', () => {
  it('senza carico distribuito: T costante, M lineare', () => {
    const { tratti } = espressioni((b) => {
      const s = b.sezioneParametrica('s', preset('IPE 300'));
      const n1 = b.nodo(0, 0), n2 = b.nodo(4, 0);
      b.asta(n1, n2, 'S275', s, { teoria: 'eulero-bernoulli' });
      b.vincolo(n1, 'incastro');
      b.forza(n2, 0, -10e3);
    });
    expect(tratti).toHaveLength(1);
    expect(tratti[0].T!.coefficienti).toHaveLength(1);   // grado 0
    expect(tratti[0].M!.coefficienti).toHaveLength(2);   // grado 1
  });

  it('carico uniforme: T lineare, M parabolico', () => {
    const { tratti } = espressioni((b) => {
      const s = b.sezioneParametrica('s', preset('IPE 300'));
      const n1 = b.nodo(0, 0), n2 = b.nodo(6, 0);
      const el = b.asta(n1, n2, 'S275', s, { teoria: 'eulero-bernoulli' });
      b.vincolo(n1, 'cerniera'); b.vincolo(n2, 'carrello');
      b.distribuito(el, -10e3);
    });
    expect(tratti[0].T!.coefficienti).toHaveLength(2);   // grado 1
    expect(tratti[0].M!.coefficienti).toHaveLength(3);   // grado 2
  });

  it('carico triangolare: T parabolico, M cubico', () => {
    const { tratti } = espressioni((b) => {
      const s = b.sezioneParametrica('s', preset('IPE 300'));
      const n1 = b.nodo(0, 0), n2 = b.nodo(6, 0);
      const el = b.asta(n1, n2, 'S275', s, { teoria: 'eulero-bernoulli' });
      b.vincolo(n1, 'cerniera'); b.vincolo(n2, 'carrello');
      b.distribuito(el, 0, { q2: -12e3 });
    });
    expect(tratti[0].T!.coefficienti).toHaveLength(3);   // grado 2
    expect(tratti[0].M!.coefficienti).toHaveLength(4);   // grado 3
  });
});

describe('§6 — i coefficienti sono quelli che si scrivono a mano', () => {
  it('trave appoggiata: T(x) = 30 − 10x, M(x) = 30x − 5x²', () => {
    const { tratti } = espressioni((b) => {
      const s = b.sezioneParametrica('s', preset('IPE 300'));
      const n1 = b.nodo(0, 0), n2 = b.nodo(6, 0);
      const el = b.asta(n1, n2, 'S275', s, { teoria: 'eulero-bernoulli' });
      b.vincolo(n1, 'cerniera'); b.vincolo(n2, 'carrello');
      b.distribuito(el, -10e3);
    });
    const [t] = tratti;
    // in kN e kN/m
    expect(t.T!.coefficienti[0] / 1e3).toBeCloseTo(30, 6);
    expect(t.T!.coefficienti[1] / 1e3).toBeCloseTo(-10, 6);
    expect(t.M!.coefficienti[0] / 1e3).toBeCloseTo(0, 6);
    expect(t.M!.coefficienti[1] / 1e3).toBeCloseTo(30, 6);
    expect(t.M!.coefficienti[2] / 1e3).toBeCloseTo(-5, 6);
  });

  it('mensola con forza in punta: M(x) = −40 + 10x', () => {
    const { tratti } = espressioni((b) => {
      const s = b.sezioneParametrica('s', preset('IPE 300'));
      const n1 = b.nodo(0, 0), n2 = b.nodo(4, 0);
      b.asta(n1, n2, 'S275', s, { teoria: 'eulero-bernoulli' });
      b.vincolo(n1, 'incastro');
      b.forza(n2, 0, -10e3);
    });
    const [t] = tratti;
    expect(Math.abs(t.M!.coefficienti[0]) / 1e3).toBeCloseTo(40, 6);
    expect(Math.abs(t.M!.coefficienti[1]) / 1e3).toBeCloseTo(10, 6);
    // e M si annulla in punta, dove non c'è più niente oltre
    expect(Math.abs(valuta(t.M!, 4))).toBeLessThan(1);
  });
});

describe('§6.2 — verifica per sostituzione', () => {
  it('le espressioni riproducono i campioni agli estremi di ogni tratto', () => {
    const { tratti, asta } = espressioni((b) => {
      const s = b.sezioneParametrica('s', preset('IPE 300'));
      const n1 = b.nodo(0, 0), n2 = b.nodo(6, 0);
      const el = b.asta(n1, n2, 'S275', s, { teoria: 'eulero-bernoulli' });
      b.vincolo(n1, 'cerniera'); b.vincolo(n2, 'carrello');
      b.distribuito(el, -10e3);
      b.forzaInCampata(el, 0.7, 0, -20e3, 'globale');
    });
    // la forza concentrata spezza in due tratti
    expect(tratti.length).toBeGreaterThanOrEqual(2);

    const scala = Math.max(...[...asta.M].map(Math.abs), 1);
    for (const t of tratti) {
      for (const quale of ['N', 'T', 'M'] as const) {
        const p = t[quale];
        if (!p) continue;
        // in ogni campione del tratto, il polinomio deve dare lo stesso valore
        for (let k = 0; k < asta.ascisse.length; k++) {
          const x = asta.ascisse[k];
          if (x < t.da - 1e-9 || x > t.a + 1e-9) continue;
          const atteso = asta[quale][k];
          const ottenuto = valuta(p, x - t.da);
          expect(Math.abs(ottenuto - atteso)).toBeLessThan(scala * 1e-6);
        }
      }
    }
  });
});

describe('§6.3 — la forma scritta', () => {
  it('si legge come sul foglio', () => {
    const p = { coefficienti: [30e3, -10e3], scarto: 0 };
    const scritto = scrivi(
      { coefficienti: p.coefficienti.map((c) => c / 1e3), scarto: 0 }, 'kN');
    expect(scritto).toBe('−10 x + 30  kN');
  });

  it('i termini nulli non compaiono', () => {
    const scritto = scrivi({ coefficienti: [0, 0, 5], scarto: 0 }, 'kNm');
    expect(scritto).toBe('5 x²  kNm');
  });

  it('una costante resta una costante', () => {
    expect(scrivi({ coefficienti: [-12], scarto: 0 }, 'kN')).toBe('−12  kN');
  });

  it('il polinomio assente si dichiara, non si inventa', () => {
    expect(scrivi(null, 'kN')).toContain('non esprimibile');
  });
});

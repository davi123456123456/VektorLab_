/**
 * Transizione fra due risultati.
 */

import { describe, it, expect } from 'vitest';
import { progetto } from '../../src/core/builder.js';
import { preset } from '../../src/core/materials/sezioniParametriche.js';
import { analizzaCaso } from '../../src/core/index.js';
import { mescolaRisultati } from '../../src/anim/interpolazione.js';
import type { LoadCaseId, Progetto } from '../../src/core/model/types.js';

const CASO = 'principale' as LoadCaseId;

function trave(q: number, campate = 1): Progetto {
  const p = progetto('t');
  const sez = p.sezioneParametrica('s', preset('IPE 300'));
  const nodi = Array.from({ length: campate + 1 }, (_, i) => p.nodo((6 * i) / campate, 0));
  for (let i = 0; i < campate; i++) {
    const a = p.asta(nodi[i], nodi[i + 1], 'S275', sez, { teoria: 'eulero-bernoulli' });
    p.distribuito(a, -q);
  }
  p.vincolo(nodi[0], 'cerniera');
  p.vincolo(nodi[campate], 'carrello');
  return p.costruisci();
}

const analizza = (p: Progetto) =>
  analizzaCaso(p, CASO, { sezioniExtra: p.sezioniPersonalizzate });

describe('mescola risultati', () => {
  const leggero = analizza(trave(10e3));
  const pesante = analizza(trave(30e3));

  it('a t = 0 restituisce il vecchio, a t = 1 il nuovo', () => {
    const a = mescolaRisultati(leggero, pesante, 0);
    const b = mescolaRisultati(leggero, pesante, 1);
    expect(Math.max(...a.aste[0].M)).toBeCloseTo(Math.max(...leggero.aste[0].M), 3);
    expect(b).toBe(pesante);
  });

  it('a metà strada i valori stanno in mezzo', () => {
    const m = mescolaRisultati(leggero, pesante, 0.5);
    const mLeggero = Math.max(...leggero.aste[0].M);
    const mPesante = Math.max(...pesante.aste[0].M);
    expect(Math.max(...m.aste[0].M)).toBeCloseTo((mLeggero + mPesante) / 2, 1);
  });

  it('la transizione è monotona nel parametro', () => {
    let precedente = -Infinity;
    for (let t = 0; t <= 1; t += 0.1) {
      const m = mescolaRisultati(leggero, pesante, t);
      const massimo = Math.max(...m.aste[0].M);
      expect(massimo).toBeGreaterThanOrEqual(precedente - 1e-6);
      precedente = massimo;
    }
  });

  it('senza risultato precedente non c\'è nulla da mescolare', () => {
    expect(mescolaRisultati(null, pesante, 0.3)).toBe(pesante);
  });

  it('interpola anche reazioni e spostamenti', () => {
    const m = mescolaRisultati(leggero, pesante, 0.5);
    const rl = leggero.reazioni[0].fy;
    const rp = pesante.reazioni[0].fy;
    expect(m.reazioni[0].fy).toBeCloseTo((rl + rp) / 2, 6);
    expect(m.spostamentoMassimo).toBeCloseTo(
      (leggero.spostamentoMassimo + pesante.spostamentoMassimo) / 2, 9,
    );
  });

  it('regge campionamenti diversi fra i due risultati', () => {
    // aggiungere una forza in campata cambia le ascisse di campionamento:
    // mescolare indice per indice sarebbe scorretto
    const p = trave(10e3);
    const conForza: Progetto = {
      ...p,
      carichi: [...p.carichi, {
        id: 'cx' as never, casoId: CASO, tipo: 'forzaInCampata',
        astaId: p.aste[0].id, s: 0.37, fx: 0 as never, fy: -20e3 as never,
        riferimento: 'locale',
      }],
    };
    const nuovo = analizza(conForza);
    expect(nuovo.aste[0].ascisse.length).not.toBe(leggero.aste[0].ascisse.length);

    const m = mescolaRisultati(leggero, nuovo, 0.5);
    expect(m.aste[0].M.length).toBe(nuovo.aste[0].M.length);
    expect(m.aste[0].M.every(Number.isFinite)).toBe(true);
    // agli estremi il momento resta nullo in entrambi, quindi anche nel mezzo
    expect(Math.abs(m.aste[0].M[0])).toBeLessThan(1);
  });

  it('un\'asta che prima non esisteva compare già al valore finale', () => {
    const unaCampata = analizza(trave(10e3, 1));
    const dueCampate = analizza(trave(10e3, 2));
    const m = mescolaRisultati(unaCampata, dueCampate, 0.5);
    expect(m.aste.length).toBe(2);
    // la seconda asta non ha un precedente: nessuna interpolazione inventata
    expect(m.aste[1].M).toBe(dueCampate.aste[1].M);
  });
});

import { describe, it, expect } from 'vitest';
import {
  proiezione, distanzaSegmento, differenzaAngoli, agganciaAngolo, raggruppa1D,
} from '../../src/foto/geometria.js';
import { tolleranze } from '../../src/foto/parametri.js';
import { disegno } from './aiuti.js';

const GRADI = Math.PI / 180;

describe('geometria del piano', () => {
  it('la proiezione dà il parametro lungo il segmento e la distanza dalla retta', () => {
    const r = proiezione({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 });
    expect(r.t).toBeCloseTo(0.5, 12);
    expect(r.distanza).toBeCloseTo(3, 12);
    expect(r.punto).toEqual({ x: 5, y: 0 });
  });

  it('la proiezione non è limitata agli estremi, la distanza dal segmento sì', () => {
    expect(proiezione({ x: 15, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 }).t).toBeCloseTo(1.5, 12);
    expect(distanzaSegmento({ x: 15, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(5, 12);
  });

  it('la differenza fra angoli passa per lo zero e sta in [0, π]', () => {
    expect(differenzaAngoli(0.1, 2 * Math.PI - 0.1)).toBeCloseTo(0.2, 12);
    expect(differenzaAngoli(0, Math.PI)).toBeCloseTo(Math.PI, 12);
  });

  it('aggancia un angolo al passo solo entro la soglia', () => {
    expect(agganciaAngolo(91 * GRADI, 45 * GRADI, 5 * GRADI)).toBeCloseTo(90 * GRADI, 12);
    expect(agganciaAngolo(80 * GRADI, 45 * GRADI, 5 * GRADI)).toBeCloseTo(80 * GRADI, 12);
    expect(agganciaAngolo(-89 * GRADI, 90 * GRADI, 5 * GRADI)).toBeCloseTo(-90 * GRADI, 12);
  });

  it('raggruppa valori vicini e numera i gruppi in ordine crescente', () => {
    expect(raggruppa1D([0, 2, 100, 103, 250], 5)).toEqual([0, 0, 1, 1, 2]);
    expect(raggruppa1D([250, 0, 103, 2, 100], 5)).toEqual([2, 0, 1, 0, 1]);
  });
});

describe('tolleranze ricavate dal disegno', () => {
  it('tau non scende sotto tre spessori di linea', () => {
    const p = disegno().asta(0, 0, 1, 0).primitive();
    expect(tolleranze(p).tau).toBeGreaterThanOrEqual(9);
  });

  it('scalano con il disegno', () => {
    const piccolo = tolleranze(disegno(40).asta(0, 0, 3, 0).cerniera(1, 0).primitive());
    const grande = tolleranze(disegno(400).asta(0, 0, 3, 0).cerniera(1, 0).primitive());
    expect(grande.tauColonne / piccolo.tauColonne).toBeGreaterThan(5);
  });
});

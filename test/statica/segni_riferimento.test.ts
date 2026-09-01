/**
 * §3 — LA VERIFICA NUMERICA IMMEDIATA.
 *
 * Trave appoggiata di luce L, carico uniforme q verso il basso, x̂ da sinistra
 * a destra. Sono i valori che il documento prescrive, e ogni struttura più
 * complessa eredita questi segni: se non tornano qui, non tornano da nessuna
 * parte.
 *
 *   R_A = R_B = qL/2
 *   T(0) = +qL/2   T(L/2) = 0   T(L) = −qL/2
 *   M(0) = 0       M(L/2) = +qL²/8   M(L) = 0
 */

import { describe, it, expect } from 'vitest';
import { progetto } from '../../src/core/builder.js';
import { preset } from '../../src/core/materials/sezioniParametriche.js';
import { analizzaCaso } from '../../src/core/index.js';
import type { LoadCaseId, Progetto } from '../../src/core/model/types.js';

const CASO = 'principale' as LoadCaseId;
const L = 6;
const q = 10e3;          // N/m, verso il basso

function appoggiata(): Progetto {
  const p = progetto('appoggiata');
  const sez = p.sezioneParametrica('s', preset('IPE 300'));
  const a = p.nodo(0, 0);
  const b = p.nodo(L, 0);
  const asta = p.asta(a, b, 'S275', sez, { teoria: 'eulero-bernoulli' });
  p.vincolo(a, 'cerniera');
  p.vincolo(b, 'carrello');
  p.distribuito(asta, -q);          // negativo = verso il basso
  return p.costruisci();
}

const r = analizzaCaso(appoggiata(), CASO);
const asta = r.aste[0];

/**
 * Valore in x, INTERPOLATO fra i campioni.
 *
 * Prendere il campione più vicino sembra equivalente e non lo è: la griglia
 * non contiene necessariamente L/2, e a quel punto si confronta il valore in
 * un'altra sezione. Su una parabola con 40 campioni l'errore vale già lo
 * 0,06 %, abbastanza da far fallire un confronto esatto e far sospettare il
 * motore invece del metro.
 */
function a(x: number, quale: 'N' | 'T' | 'M'): number {
  const xs = asta.ascisse;
  const v = asta[quale];
  if (x <= xs[0]) return v[0];
  if (x >= xs[xs.length - 1]) return v[v.length - 1];
  for (let i = 0; i < xs.length - 1; i++) {
    if (x < xs[i] || x > xs[i + 1]) continue;
    const d = xs[i + 1] - xs[i];
    // ascisse coincidenti: è una discontinuità, non ci si interpola dentro
    if (d <= 1e-12) continue;
    return v[i] + ((v[i + 1] - v[i]) * (x - xs[i])) / d;
  }
  return v[v.length - 1];
}

describe('§3 — trave appoggiata, carico uniforme', () => {
  it('reazioni: R_A = R_B = qL/2', () => {
    expect(r.reazioni).toHaveLength(2);
    expect(r.reazioni[0].fy).toBeCloseTo((q * L) / 2, 6);
    expect(r.reazioni[1].fy).toBeCloseTo((q * L) / 2, 6);
    expect(r.reazioni[0].fx).toBeCloseTo(0, 6);
  });

  it('T(0) = +qL/2', () => {
    expect(a(0, 'T') / 1e3).toBeCloseTo((q * L) / 2 / 1e3, 6);
  });

  it('T(L/2) = 0', () => {
    expect(a(L / 2, 'T') / 1e3).toBeCloseTo(0, 6);
  });

  it('T(L) = −qL/2', () => {
    expect(a(L, 'T') / 1e3).toBeCloseTo(-(q * L) / 2 / 1e3, 6);
  });

  it('M(0) = 0', () => {
    expect(a(0, 'M') / 1e3).toBeCloseTo(0, 6);
  });

  it('M(L/2) = +qL²/8, POSITIVO', () => {
    // Il confronto va fatto su un CAMPIONE, non su un valore interpolato:
    // interpolando linearmente una parabola si sbaglia dello 0,06 %, che è
    // l'errore del metro e non del motore. Il campionatore mette un punto
    // notevole nel massimo proprio perché lo si possa leggere esatto.
    const massimo = asta.puntiNotevoli.find((x) => x.tipo === 'M_max');
    expect(massimo).toBeDefined();
    expect(massimo!.x).toBeCloseTo(L / 2, 6);
    expect(massimo!.M / 1e3).toBeCloseTo((q * L * L) / 8 / 1e3, 6);
    expect(massimo!.M).toBeGreaterThan(0);
  });

  it('M(L) = 0', () => {
    expect(a(L, 'M') / 1e3).toBeCloseTo(0, 6);
  });

  it('N è nullo dappertutto', () => {
    for (const n of asta.N) expect(Math.abs(n)).toBeLessThan(1e-6);
  });

  it('dT/dx = q_n = −q  (carico verso il basso, ŷ verso l alto)', () => {
    // T passa da +qL/2 a −qL/2 su tutta la luce: pendenza −q
    const pendenza = (a(L, 'T') - a(0, 'T')) / L;
    expect(pendenza).toBeCloseTo(-q, 3);
  });

  it('§9.13 — dM/dx = T su OGNI intervallo campionato', () => {
    // differenza centrata fra campioni consecutivi, confrontata con T nel
    // punto di mezzo: su un tratto parabolico è esatta a meno degli errori
    // di macchina, e vale per tutta la trave invece che in un punto solo
    const xs = asta.ascisse;
    let controllati = 0;
    for (let i = 0; i < xs.length - 1; i++) {
      const d = xs[i + 1] - xs[i];
      if (d < 1e-9) continue;                    // discontinuità: si salta
      const pendenza = (asta.M[i + 1] - asta.M[i]) / d;
      const tMedio = (asta.T[i] + asta.T[i + 1]) / 2;
      expect(pendenza / 1e3).toBeCloseTo(tMedio / 1e3, 6);
      controllati++;
    }
    expect(controllati).toBeGreaterThan(10);
  });

  it('M(b) − M(a) = ∫T dx  su tutta la luce (Simpson)', () => {
    // §9.14 — la verifica integrale, più robusta di quella differenziale
    const n = 200;
    let somma = 0;
    for (let i = 0; i <= n; i++) {
      const x = (i / n) * L;
      const peso = i === 0 || i === n ? 1 : i % 2 === 1 ? 4 : 2;
      somma += peso * a(x, 'T');
    }
    const integrale = (somma * (L / n)) / 3;
    // T è lineare a tratti sui campioni: Simpson su una spezzata interpolata
    // porta un errore di discretizzazione, quindi si confronta in relativo
    const atteso = a(L, 'M') - a(0, 'M');
    expect(Math.abs(integrale - atteso)).toBeLessThan(0.002 * ((q * L * L) / 8));
  });
});

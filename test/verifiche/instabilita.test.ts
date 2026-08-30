/**
 * Instabilità e deformabilità.
 */

import { describe, it, expect } from 'vitest';
import { progetto } from '../../src/core/builder.js';
import { preset } from '../../src/core/materials/sezioniParametriche.js';
import { analizzaCaso, verificaStruttura } from '../../src/core/index.js';
import { ALFA_CURVA, verificaInstabilita } from '../../src/core/checks/instabilita.js';
import { verificaEsercizio } from '../../src/core/checks/esercizio.js';
import { materialePerId } from '../../src/core/materials/materials.js';
import { proprietaDa } from '../../src/core/materials/sezioniParametriche.js';
import type { LoadCaseId } from '../../src/core/model/types.js';

const CASO = 'principale' as LoadCaseId;
const S275 = materialePerId('S275');

describe('carico critico euleriano', () => {
  const par = { famiglia: 'circolarePiena', D: 0.05 } as const;
  const q = proprietaDa(par);

  it('vale π²EI/L₀² nel caso fondamentale', () => {
    const L = 3;
    const v = verificaInstabilita({
      Nmin: -50e3, lunghezza: L, A: q.A, I: q.I, i: q.i, beta: 1, materiale: S275,
    });
    expect(v.Ncr).toBeCloseTo((Math.PI ** 2 * S275.E * q.I) / (L * L), 3);
    expect(v.L0).toBeCloseTo(L, 12);
  });

  it('la mensola (β = 2) ha un carico critico quattro volte minore', () => {
    const base = { Nmin: -50e3, lunghezza: 3, A: q.A, I: q.I, i: q.i, materiale: S275 };
    const cerniere = verificaInstabilita({ ...base, beta: 1 });
    const mensola = verificaInstabilita({ ...base, beta: 2 });
    expect(cerniere.Ncr / mensola.Ncr).toBeCloseTo(4, 9);
  });

  it('la snellezza è λ = L₀/i e λ̄ = √(A·f_y/N_cr)', () => {
    const L = 4;
    const v = verificaInstabilita({
      Nmin: -20e3, lunghezza: L, A: q.A, I: q.I, i: q.i, beta: 1, materiale: S275,
    });
    expect(v.lambda).toBeCloseTo(L / q.i, 9);
    expect(v.lambdaBarra).toBeCloseTo(Math.sqrt((q.A * 275e6) / v.Ncr), 9);
    // e λ̄ = λ/λ₁
    expect(v.lambdaBarra).toBeCloseTo(v.lambda / v.lambda1, 6);
  });
});

describe('curve di instabilità EC3', () => {
  const par = { famiglia: 'circolarePiena', D: 0.06 } as const;
  const q = proprietaDa(par);

  it('χ = 1 per aste tozze (λ̄ ≤ 0.2)', () => {
    const v = verificaInstabilita({
      Nmin: -10e3, lunghezza: 0.15, A: q.A, I: q.I, i: q.i, beta: 1, materiale: S275,
    });
    expect(v.lambdaBarra).toBeLessThanOrEqual(0.2);
    expect(v.chi).toBe(1);
    expect(v.note.join(' ')).toContain('tozza');
  });

  it('χ decresce al crescere della snellezza e resta in (0,1]', () => {
    let precedente = 1.01;
    for (const L of [1, 2, 3, 5, 8, 12]) {
      const v = verificaInstabilita({
        Nmin: -10e3, lunghezza: L, A: q.A, I: q.I, i: q.i, beta: 1, materiale: S275,
      });
      expect(v.chi).toBeGreaterThan(0);
      expect(v.chi).toBeLessThanOrEqual(1);
      expect(v.chi).toBeLessThanOrEqual(precedente + 1e-12);
      precedente = v.chi;
    }
  });

  it('la formula di χ è quella dell\'Eurocodice', () => {
    const L = 4;
    const v = verificaInstabilita({
      Nmin: -10e3, lunghezza: L, A: q.A, I: q.I, i: q.i, beta: 1, materiale: S275,
    });
    const a = ALFA_CURVA[v.curva];
    const lb = v.lambdaBarra;
    const phi = 0.5 * (1 + a * (lb - 0.2) + lb * lb);
    expect(v.chi).toBeCloseTo(1 / (phi + Math.sqrt(phi * phi - lb * lb)), 12);
  });

  it('χ è sempre minore del limite euleriano 1/λ̄²', () => {
    // le imperfezioni reali riducono la portata rispetto al caso ideale
    for (const L of [3, 6, 10]) {
      const v = verificaInstabilita({
        Nmin: -10e3, lunghezza: L, A: q.A, I: q.I, i: q.i, beta: 1, materiale: S275,
      });
      expect(v.chi).toBeLessThan(1 / (v.lambdaBarra * v.lambdaBarra));
    }
  });

  it('una curva più sfavorevole abbassa χ', () => {
    const base = { Nmin: -10e3, lunghezza: 4, A: q.A, I: q.I, i: q.i };
    const buona = verificaInstabilita({
      ...base, beta: 1, materiale: { ...S275, curvaInstabilita: 'a' },
    });
    const cattiva = verificaInstabilita({
      ...base, beta: 1, materiale: { ...S275, curvaInstabilita: 'd' },
    });
    expect(cattiva.chi).toBeLessThan(buona.chi);
  });

  it('senza curva dichiarata si usa la "c", cautelativa, e lo si dice', () => {
    const senza = { ...S275 };
    delete (senza as { curvaInstabilita?: string }).curvaInstabilita;
    const v = verificaInstabilita({
      Nmin: -10e3, lunghezza: 4, A: q.A, I: q.I, i: q.i, beta: 1, materiale: senza,
    });
    expect(v.curva).toBe('c');
    expect(v.note.join(' ')).toContain('cautelativa');
  });

  it('un\'asta tesa non è soggetta a instabilità', () => {
    const v = verificaInstabilita({
      Nmin: 50e3, lunghezza: 5, A: q.A, I: q.I, i: q.i, beta: 1, materiale: S275,
    });
    expect(v.compressa).toBe(false);
    expect(v.NEd).toBe(0);
    expect(v.verificato).toBe(true);
  });
});

describe('l\'instabilità può fallire mentre la resistenza passa', () => {
  it('asta lunga e snella: tensione bassa ma sbandamento', () => {
    const p = progetto('colonna snella');
    const sez = p.sezioneParametrica('s', { famiglia: 'circolareCava', D: 0.06, s: 0.003 });
    const a = p.nodo(0, 0);
    const b = p.nodo(0, 6);
    p.asta(a, b, 'S275', sez);
    p.vincolo(a, 'cerniera');
    p.vincolo(b, 'carrello', Math.PI / 2);   // scorre in verticale
    p.forza(b, 0, -40e3);
    const prog = p.costruisci();

    const r = analizzaCaso(prog, CASO, { sezioniExtra: prog.sezioniPersonalizzate });
    const v = verificaStruttura(prog, r, { sezioniExtra: prog.sezioniPersonalizzate });

    const resistenza = v.perAsta[0];
    const stabilita = v.instabilita.get(resistenza.astaId)!;

    // la tensione è modesta: la verifica di resistenza passa comodamente
    expect(resistenza.verificato).toBe(true);
    // ma l'asta è instabile
    expect(stabilita.compressa).toBe(true);
    expect(stabilita.verificato).toBe(false);
    expect(stabilita.lambdaBarra).toBeGreaterThan(1.5);
    expect(v.tutteVerificate).toBe(true);
    expect(v.tutteStabili).toBe(false);
  });
});

describe('deformabilità in esercizio', () => {
  it('la freccia si misura rispetto alla corda fra gli estremi', () => {
    const p = progetto('appoggiata');
    const sez = p.sezioneParametrica('s', preset('IPE 200'));
    const a = p.nodo(0, 0);
    const b = p.nodo(6, 0);
    const asta = p.asta(a, b, 'S275', sez, { teoria: 'eulero-bernoulli' });
    p.vincolo(a, 'cerniera');
    p.vincolo(b, 'carrello');
    p.distribuito(asta, -8e3);
    const prog = p.costruisci();
    const r = analizzaCaso(prog, CASO, { sezioniExtra: prog.sezioniPersonalizzate });

    const e = verificaEsercizio('a', r.aste[0], 250);
    // 5qL⁴/384EI con IPE 200
    const q = proprietaDa(preset('IPE 200'));
    const attesa = (5 * 8e3 * 6 ** 4) / (384 * 210e9 * q.I);
    expect(e.frecciaMassima).toBeCloseTo(attesa, 6);
    expect(e.xFreccia).toBeCloseTo(3, 1);
    expect(e.frecciaAmmessa).toBeCloseTo(6 / 250, 9);
    expect(e.verificato).toBe(e.frecciaMassima <= e.frecciaAmmessa);
  });

  it('il rapporto L/f è quello che si legge nelle relazioni', () => {
    const p = progetto('a');
    const sez = p.sezioneParametrica('s', preset('IPE 300'));
    const a = p.nodo(0, 0);
    const b = p.nodo(8, 0);
    const asta = p.asta(a, b, 'S275', sez, { teoria: 'eulero-bernoulli' });
    p.vincolo(a, 'cerniera');
    p.vincolo(b, 'carrello');
    p.distribuito(asta, -15e3);
    const prog = p.costruisci();
    const r = analizzaCaso(prog, CASO, { sezioniExtra: prog.sezioniPersonalizzate });
    const e = verificaEsercizio('a', r.aste[0], 250);
    expect(e.rapporto).toBeCloseTo(e.lunghezza / e.frecciaMassima, 6);
    expect(e.sfruttamento).toBeCloseTo(250 / e.rapporto, 6);
  });

  it('un limite più severo rende la verifica più difficile', () => {
    const p = progetto('a');
    const sez = p.sezioneParametrica('s', preset('IPE 200'));
    const a = p.nodo(0, 0);
    const b = p.nodo(7, 0);
    const asta = p.asta(a, b, 'S275', sez, { teoria: 'eulero-bernoulli' });
    p.vincolo(a, 'cerniera');
    p.vincolo(b, 'carrello');
    p.distribuito(asta, -6e3);
    const prog = p.costruisci();
    const r = analizzaCaso(prog, CASO, { sezioniExtra: prog.sezioniPersonalizzate });
    const largo = verificaEsercizio('a', r.aste[0], 200);
    const stretto = verificaEsercizio('a', r.aste[0], 500);
    expect(stretto.sfruttamento).toBeCloseTo(largo.sfruttamento * 2.5, 6);
  });
});

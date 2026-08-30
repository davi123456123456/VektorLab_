/**
 * Verifica di resistenza dall'analisi al coefficiente di sicurezza.
 */

import { describe, it, expect } from 'vitest';
import { progetto } from '../../src/core/builder.js';
import { preset } from '../../src/core/materials/sezioniParametriche.js';
import { analizzaCaso, verificaStruttura } from '../../src/core/index.js';
import { materialePerId } from '../../src/core/materials/materials.js';
import { indiceMomentoMassimo, verificaAsta } from '../../src/core/checks/verifica.js';
import { proprietaDa, type ParametriSezione } from '../../src/core/materials/sezioniParametriche.js';
import type { LoadCaseId, Progetto } from '../../src/core/model/types.js';

const CASO = 'principale' as LoadCaseId;

function mensola(par: ParametriSezione, L: number, P: number, materiale = 'S275'): Progetto {
  const p = progetto('mensola');
  const sez = p.sezioneParametrica('sez1', par);
  const a = p.nodo(0, 0);
  const b = p.nodo(L, 0);
  p.asta(a, b, materiale, sez, { teoria: 'eulero-bernoulli' });
  p.vincolo(a, 'incastro');
  p.forza(b, 0, -P);
  return p.costruisci();
}

function verifica(prog: Progetto) {
  const r = analizzaCaso(prog, CASO, { sezioniExtra: prog.sezioniPersonalizzate });
  return verificaStruttura(prog, r, { sezioniExtra: prog.sezioniPersonalizzate });
}

describe('la sezione verificata è quella con |M| massimo', () => {
  it('su una mensola è l\'incastro', () => {
    const prog = mensola({ famiglia: 'rettangolarePiena', B: 0.1, H: 0.2 }, 2, 20e3);
    const v = verifica(prog).perAsta[0];
    expect(v.sezione.x).toBeCloseTo(0, 9);
    expect(Math.abs(v.sezione.M)).toBeCloseTo(40e3, 3);
  });

  it('su una trave appoggiata è la mezzeria', () => {
    const p = progetto('appoggiata');
    const sez = p.sezioneParametrica('s', { famiglia: 'rettangolarePiena', B: 0.1, H: 0.3 });
    const a = p.nodo(0, 0);
    const b = p.nodo(6, 0);
    const asta = p.asta(a, b, 'S275', sez, { teoria: 'eulero-bernoulli' });
    p.vincolo(a, 'cerniera');
    p.vincolo(b, 'carrello');
    p.distribuito(asta, -10e3);
    const prog = p.costruisci();
    const v = verifica(prog).perAsta[0];
    expect(v.sezione.x).toBeCloseTo(3, 3);
    expect(v.sezione.M).toBeCloseTo(45e3, 1);
  });

  it('indiceMomentoMassimo trova davvero il massimo assoluto', () => {
    const prog = mensola({ famiglia: 'circolarePiena', D: 0.15 }, 3, 15e3);
    const r = analizzaCaso(prog, CASO, { sezioniExtra: prog.sezioniPersonalizzate });
    const i = indiceMomentoMassimo(r.aste[0]);
    const M = r.aste[0].M;
    for (let k = 0; k < M.length; k++) {
      expect(Math.abs(M[k])).toBeLessThanOrEqual(Math.abs(M[i]) + 1e-6);
    }
  });
});

describe('coefficiente di sicurezza', () => {
  it('vale resistenza / tensione ideale, e lo sfruttamento usa γ_M', () => {
    // sezione rettangolare in flessione quasi pura: σ_id = M/W, τ trascurabile
    const L = 4, P = 10e3;
    const par = { famiglia: 'rettangolarePiena', B: 0.1, H: 0.3 } as const;
    const prog = mensola(par, L, P);
    const v = verifica(prog).perAsta[0];
    const q = proprietaDa(par);
    const mat = materialePerId('S275');

    // il critico è la fibra estrema, dove τ = 0
    const sigmaAttesa = (P * L) / q.W;
    expect(v.sigmaIdeale).toBeCloseTo(sigmaAttesa, -3);
    expect(v.coefficienteSicurezza).toBeCloseTo(mat.resistenze.fy! / v.sigmaIdeale, 6);
    expect(v.sfruttamento).toBeCloseTo(
      v.sigmaIdeale / (mat.resistenze.fy! / mat.gammaM), 9,
    );
    // le due misure sono coerenti fra loro
    expect(v.sfruttamento).toBeCloseTo(mat.gammaM / v.coefficienteSicurezza, 9);
  });

  it('verificato equivale a sfruttamento ≤ 1', () => {
    for (const P of [5e3, 30e3, 200e3]) {
      const v = verifica(mensola(
        { famiglia: 'rettangolarePiena', B: 0.1, H: 0.3 }, 3, P,
      )).perAsta[0];
      expect(v.verificato).toBe(v.sfruttamento <= 1);
    }
  });

  it('raddoppiare il carico dimezza il coefficiente di sicurezza', () => {
    const par = { famiglia: 'circolarePiena', D: 0.12 } as const;
    const a = verifica(mensola(par, 2, 10e3)).perAsta[0];
    const b = verifica(mensola(par, 2, 20e3)).perAsta[0];
    expect(b.coefficienteSicurezza).toBeCloseTo(a.coefficienteSicurezza / 2, 6);
  });

  it('un acciaio più resistente alza il coefficiente in proporzione', () => {
    const par = { famiglia: 'rettangolarePiena', B: 0.1, H: 0.25 } as const;
    const s235 = verifica(mensola(par, 3, 20e3, 'S235')).perAsta[0];
    const s355 = verifica(mensola(par, 3, 20e3, 'S355')).perAsta[0];
    expect(s355.coefficienteSicurezza / s235.coefficienteSicurezza)
      .toBeCloseTo(355 / 235, 6);
  });
});

describe('il punto critico sulla sezione', () => {
  it('mensola tozza in IPE: il critico è nel passaggio anima-ala', () => {
    // M = 150 kNm e T = 300 kN: né la fibra estrema né il baricentro, ma la
    // fascia dei raccordi, dove σ è ancora alta e la larghezza è già crollata
    const prog = mensola(preset('IPE 300'), 0.5, 300e3);
    const v = verifica(prog).perAsta[0];
    const spigolo = 0.15 - 0.0107;           // faccia interna dell'ala
    const piede = spigolo - 0.015;           // fondo del raccordo (r = 15 mm)
    expect(Math.abs(v.critico.y)).toBeGreaterThan(piede - 2e-3);
    expect(Math.abs(v.critico.y)).toBeLessThan(spigolo);
    // e lì agiscono ENTRAMBE le componenti
    expect(Math.abs(v.critico.sigma)).toBeGreaterThan(0);
    expect(Math.abs(v.critico.tau)).toBeGreaterThan(0);
    expect(v.vonMisesMax).toBeCloseTo(
      Math.sqrt(v.critico.sigma ** 2 + 3 * v.critico.tau ** 2), 3,
    );
  });

  it('trave snella: il critico torna alla fibra estrema', () => {
    const prog = mensola(preset('IPE 300'), 6, 20e3);
    const v = verifica(prog).perAsta[0];
    expect(Math.abs(v.critico.y)).toBeCloseTo(0.15, 3);
    expect(Math.abs(v.critico.tau)).toBeLessThan(1e6);
  });
});

describe('criterio dipendente dal materiale', () => {
  it('acciaio: von Mises, con Tresca disponibile e più cautelativo', () => {
    const prog = mensola(preset('IPE 300'), 1.0, 300e3);
    const v = verifica(prog).perAsta[0];
    expect(v.criterio).toBe('vonMises');
    expect(v.trescaMax).toBeGreaterThanOrEqual(v.vonMisesMax - 1e-6);
  });

  it('Tresca su richiesta dà un coefficiente più basso', () => {
    const prog = mensola(preset('IPE 300'), 1.0, 300e3);
    const r = analizzaCaso(prog, CASO, { sezioniExtra: prog.sezioniPersonalizzate });
    const vm = verificaStruttura(prog, r, {
      sezioniExtra: prog.sezioniPersonalizzate, criterioPreferito: 'vonMises',
    }).perAsta[0];
    const tr = verificaStruttura(prog, r, {
      sezioniExtra: prog.sezioniPersonalizzate, criterioPreferito: 'tresca',
    }).perAsta[0];
    expect(tr.criterio).toBe('tresca');
    expect(tr.coefficienteSicurezza).toBeLessThanOrEqual(vm.coefficienteSicurezza + 1e-9);
  });

  it('ghisa: NON von Mises, ma massima tensione normale con f_t ≠ f_c', () => {
    const prog = mensola({ famiglia: 'rettangolarePiena', B: 0.1, H: 0.2 },
                         2, 20e3, 'GJL250');
    const v = verifica(prog).perAsta[0];
    expect(v.criterio).toBe('massimaTensioneNormale');
    // la resistenza usata è quella a trazione, molto minore di quella a compressione
    expect(v.resistenza).toBeCloseTo(250e6, 0);
    expect(v.note.join(' ')).toContain('FRAGILE');
    // von Mises resta calcolato per confronto
    expect(v.vonMisesMax).toBeGreaterThan(0);
  });

  it('calcestruzzo: la trazione governa, con un margine molto minore', () => {
    const par = { famiglia: 'rettangolarePiena', B: 0.3, H: 0.5 } as const;
    const acciaio = verifica(mensola(par, 3, 40e3, 'S275')).perAsta[0];
    const cls = verifica(mensola(par, 3, 40e3, 'C25_30')).perAsta[0];
    expect(cls.resistenza).toBeCloseTo(2.6e6, 0);
    expect(cls.coefficienteSicurezza).toBeLessThan(acciaio.coefficienteSicurezza);
  });

  it('legno: criterio ortotropo, con nota esplicativa', () => {
    const prog = mensola({ famiglia: 'rettangolarePiena', B: 0.16, H: 0.32 },
                         4, 8e3, 'GL24H');
    const v = verifica(prog).perAsta[0];
    expect(v.criterio).toBe('massimaTensioneNormale');
    expect(v.note.join(' ')).toContain('ORTOTROPO');
  });
});

describe('robustezza', () => {
  it('una sezione senza misure non è verificabile, e lo dice', () => {
    const p = progetto('legacy');
    const a = p.nodo(0, 0);
    const b = p.nodo(3, 0);
    p.asta(a, b, 'S275', 'IPE 300');   // sezione della libreria, senza parametri
    p.vincolo(a, 'incastro');
    p.forza(b, 0, -10e3);
    const prog = p.costruisci();
    const r = analizzaCaso(prog, CASO);
    const v = verificaStruttura(prog, r);
    expect(v.perAsta.length).toBe(0);
    expect(v.nonVerificabili.length).toBe(1);
    expect(v.nonVerificabili[0].motivo).toContain('misure');
  });

  it('aste con sezioni DIVERSE nello stesso modello', () => {
    const p = progetto('miste');
    const tubo = p.sezioneParametrica('s1', { famiglia: 'circolareCava', D: 0.15, s: 0.008 });
    const ipe = p.sezioneParametrica('s2', preset('IPE 200'));
    const rett = p.sezioneParametrica('s3', { famiglia: 'rettangolarePiena', B: 0.2, H: 0.3 });
    const n = [0, 1, 2, 3].map((i) => p.nodo(i * 2, 0));
    p.asta(n[0], n[1], 'S275', tubo);
    p.asta(n[1], n[2], 'S275', ipe);
    p.asta(n[2], n[3], 'S355', rett);
    p.vincolo(n[0], 'cerniera');
    p.vincolo(n[3], 'carrello');
    p.forza(n[1], 0, -20e3);
    p.forza(n[2], 0, -20e3);
    const prog = p.costruisci();
    const v = verifica(prog);
    expect(v.perAsta.length).toBe(3);
    expect(v.nonVerificabili.length).toBe(0);
    // ogni asta è verificata con la SUA sezione e il SUO materiale
    const gamme = v.perAsta.map((x) => x.coefficienteSicurezza);
    expect(new Set(gamme.map((g) => g.toFixed(4))).size).toBe(3);
  });

  it('sollecitazione nulla: coefficiente infinito, nessuna divisione per zero', () => {
    const p = progetto('scarica');
    const sez = p.sezioneParametrica('s', { famiglia: 'circolarePiena', D: 0.1 });
    const a = p.nodo(0, 0);
    const b = p.nodo(2, 0);
    p.asta(a, b, 'S275', sez);
    p.vincolo(a, 'incastro');
    p.vincolo(b, 'carrello');
    const prog = p.costruisci();
    const v = verifica(prog).perAsta[0];
    expect(v.sigmaIdeale).toBeCloseTo(0, 6);
    expect(v.coefficienteSicurezza).toBe(Infinity);
    expect(v.verificato).toBe(true);
  });
});

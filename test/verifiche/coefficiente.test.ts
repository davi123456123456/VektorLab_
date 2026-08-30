/**
 * Coefficiente di sicurezza: i numeri devono coincidere con quelli che si
 * ottengono a mano, su casi in cui il conto a mano si sa fare.
 */

import { describe, it, expect } from 'vitest';
import { progetto } from '../../src/core/builder.js';
import { analizzaCaso } from '../../src/core/index.js';
import { preset } from '../../src/core/materials/sezioniParametriche.js';
import { coefficienteCritico } from '../../src/core/checks/coefficiente.js';
import type { LoadCaseId, Progetto } from '../../src/core/model/types.js';

const CASO = 'principale' as LoadCaseId;

/** Mensola di 1 m, tondo pieno d = 40 mm, forza di 1 kN in punta. */
function mensola(materialeId = 'S275'): Progetto {
  const p = progetto('mensola');
  const sez = p.sezioneParametrica('tondo', { famiglia: 'circolarePiena' as const, D: 0.04 });
  const a = p.nodo(0, 0);
  const b = p.nodo(1, 0);
  p.asta(a, b, materialeId, sez, { teoria: 'eulero-bernoulli' });
  p.vincolo(a, 'incastro');
  p.forza(b, 0, -1e3);
  return p.costruisci();
}

// valori calcolati a mano, indipendenti dal codice
const D = 0.04;
const A_MANO = (Math.PI * D * D) / 4;              // 1.256637e-3 m²
const I_MANO = (Math.PI * D ** 4) / 64;            // 1.256637e-7 m⁴
const SIGMA_MANO = (1e3 * 1.0 / I_MANO) * (D / 2); // M·y/I = 159.15 MPa
const TAU_MANO = 1e3 / A_MANO;                     // T/A   = 0.796 MPa
const VM_MANO = Math.hypot(SIGMA_MANO, Math.sqrt(3) * TAU_MANO);

describe('mensola circolare con forza in punta', () => {
  const p = mensola();
  const r = analizzaCaso(p, CASO);
  const c = coefficienteCritico(p, r);

  it('trova la sezione critica all incastro', () => {
    expect(c.massimaTensione).not.toBeNull();
    expect(c.massimaTensione!.x).toBeCloseTo(0, 6);
    expect(Math.abs(c.massimaTensione!.M)).toBeCloseTo(1e3, 6);
    expect(Math.abs(c.massimaTensione!.T)).toBeCloseTo(1e3, 6);
    expect(c.massimaTensione!.N).toBeCloseTo(0, 6);
  });

  it('massimo momento e massima tensione coincidono', () => {
    // sezione unica e materiale unico: dove è massimo M è massima σ
    expect(c.coincidono).toBe(true);
  });

  it('σ = M·y/I vale 159.2 MPa', () => {
    expect(Math.abs(c.sigma)).toBeCloseTo(SIGMA_MANO, 0);
    expect(Math.abs(c.sigma) / 1e6).toBeCloseTo(159.15, 1);
  });

  it('τ = T/A vale 0.80 MPa', () => {
    expect(Math.abs(c.tau)).toBeCloseTo(TAU_MANO, 0);
    expect(Math.abs(c.tau) / 1e6).toBeCloseTo(0.796, 2);
  });

  it('σ_VM = √(σ² + 3τ²)', () => {
    expect(c.sigmaIdeale).toBeCloseTo(VM_MANO, 0);
    // il taglio pesa pochissimo: la trave è snella
    expect(c.sigmaIdeale / Math.abs(c.sigma)).toBeCloseTo(1, 4);
  });

  it('C.S. = S_y / σ_VM ≈ 1.73', () => {
    expect(c.resistenza).toBe(275e6);
    expect(c.coefficiente).toBeCloseTo(275e6 / VM_MANO, 3);
    expect(c.coefficiente).toBeCloseTo(1.728, 2);
    expect(c.verificato).toBe(true);
  });

  it('τ massima per il tondo vale 4/3 della media', () => {
    const m = coefficienteCritico(p, r, { modoTaglio: 'massima' });
    expect(Math.abs(m.tau) / Math.abs(c.tau)).toBeCloseTo(4 / 3, 3);
    expect(Math.abs(m.sigma)).toBeCloseTo(Math.abs(c.sigma), 0);
  });

  it('espone i cinque passaggi con i numeri sostituiti', () => {
    expect(c.passi.map((x) => x.numero)).toEqual([1, 2, 3, 4, 5]);
    expect(c.passi[4].righe[0].valore).toContain('1.7');
    expect(c.passi[1].righe.some((x) => x.formula === 'A')).toBe(true);
    expect(c.passi[1].righe.some((x) => x.formula === 'I')).toBe(true);
  });

  it('S_y minimo per C.S. = 1 è la tensione ideale stessa', () => {
    expect(c.suggerimenti!.syMinimo).toBeCloseTo(c.sigmaIdeale, 6);
  });

  it('la sezione già verifica: fattore di scala 1', () => {
    expect(c.suggerimenti!.fattoreScala).toBe(1);
    expect(c.suggerimenti!.dimensione!.nome).toContain('diametro');
    expect(c.suggerimenti!.dimensione!.attuale).toBeCloseTo(0.04, 9);
  });

  it('la fibra governante è quella tesa o compressa, non entrambe', () => {
    expect(['tesa', 'compressa']).toContain(c.fibraGovernante);
    expect(c.compressa).toBe(false);
  });
});

describe('sezione insufficiente', () => {
  /** stessa mensola con un carico dieci volte più grande */
  function sovraccarica(): Progetto {
    const p = progetto('mensola');
    const sez = p.sezioneParametrica('tondo', { famiglia: 'circolarePiena' as const, D: 0.04 });
    const a = p.nodo(0, 0);
    const b = p.nodo(1, 0);
    p.asta(a, b, 'S275', sez, { teoria: 'eulero-bernoulli' });
    p.vincolo(a, 'incastro');
    p.forza(b, 0, -1e4);
    return p.costruisci();
  }

  const p = sovraccarica();
  const c = coefficienteCritico(p, analizzaCaso(p, CASO));

  it('il coefficiente scende sotto 1', () => {
    expect(c.coefficiente).toBeLessThan(1);
    expect(c.verificato).toBe(false);
  });

  it('propone un diametro maggiore', () => {
    expect(c.suggerimenti!.fattoreScala).toBeGreaterThan(1);
    expect(c.suggerimenti!.dimensione!.minima)
      .toBeGreaterThan(c.suggerimenti!.dimensione!.attuale);
  });

  it('il diametro proposto porta il coefficiente a 1', () => {
    // rifà l'analisi con la sezione ingrandita e ricontrolla
    const d = c.suggerimenti!.dimensione!.minima;
    const q = progetto('mensola');
    const sez = q.sezioneParametrica(
      'tondo', { famiglia: 'circolarePiena', D: d },
    );
    const a = q.nodo(0, 0);
    const b = q.nodo(1, 0);
    q.asta(a, b, 'S275', sez, { teoria: 'eulero-bernoulli' });
    q.vincolo(a, 'incastro');
    q.forza(b, 0, -1e4);
    const pr = q.costruisci();
    const v = coefficienteCritico(pr, analizzaCaso(pr, CASO));
    expect(v.coefficiente).toBeCloseTo(1, 2);
  });

  it('per un tondo il diametro scala come la radice cubica del carico', () => {
    // σ ∝ 1/d³ e il taglio è trascurabile: d_min ∝ M^(1/3)
    const base = coefficienteCritico(mensola(), analizzaCaso(mensola(), CASO));
    const atteso = base.suggerimenti!.dimensione!.attuale
      * Math.cbrt(10 / base.coefficiente);
    expect(c.suggerimenti!.dimensione!.minima).toBeCloseTo(atteso / 10 ** (1 / 3) * 10 ** (1 / 3), 3);
  });
});

describe('momento discontinuo', () => {
  /** trave appoggiata con un momento concentrato in mezzeria */
  function conSalto(): Progetto {
    const p = progetto('salto');
    const sez = p.sezioneParametrica('s', preset('IPE 200'));
    const a = p.nodo(0, 0);
    const b = p.nodo(4, 0);
    const asta = p.asta(a, b, 'S275', sez, { teoria: 'eulero-bernoulli' });
    p.vincolo(a, 'cerniera');
    p.vincolo(b, 'carrello');
    p.momentoInCampata(asta, 0.5, 40e3);
    return p.costruisci();
  }

  const p = conSalto();
  const c = coefficienteCritico(p, analizzaCaso(p, CASO));

  it('riconosce il lato della discontinuità', () => {
    expect(c.massimoMomento).not.toBeNull();
    expect(c.massimoMomento!.x).toBeCloseTo(2, 6);
    expect(['−', '+']).toContain(c.massimoMomento!.lato);
  });

  it('riporta entrambi i valori ai lati del salto', () => {
    const s = c.massimoMomento!.salto!;
    expect(Math.abs(s.destra - s.sinistra)).toBeCloseTo(40e3, 0);
  });

  it('il valore riportato è quello maggiore in modulo', () => {
    const s = c.massimoMomento!.salto!;
    expect(Math.abs(c.massimoMomento!.M))
      .toBeCloseTo(Math.max(Math.abs(s.sinistra), Math.abs(s.destra)), 3);
  });
});

describe('dati mancanti', () => {
  it('senza S_y dichiara l errore invece di inventare il numero', () => {
    const p = mensola('ACCIAIO_GENERICO');
    const c = coefficienteCritico(p, analizzaCaso(p, CASO));
    expect(c.disponibile).toBe(false);
    expect(c.errori.map((e) => e.codice)).toContain('SY_MANCANTE');
    expect(Number.isNaN(c.coefficiente)).toBe(true);
    // le tensioni restano calcolabili: dipendono solo dalla geometria
    expect(c.sigmaIdeale).toBeGreaterThan(0);
    expect(c.suggerimenti!.syMinimo).toBeCloseTo(c.sigmaIdeale, 6);
  });
});

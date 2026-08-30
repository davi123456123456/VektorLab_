/**
 * Sezioni parametriche: proprietà geometriche contro le formule di manuale.
 */

import { describe, it, expect } from 'vitest';
import {
  PRESET, preset, larghezzaA, momentoStaticoA, proprietaDa, quoteNotevoli,
  sezioneDaParametri, nomePredefinito, estremiY,
} from '../../src/core/materials/sezioniParametriche.js';

describe('rettangolare piena', () => {
  const p = { famiglia: 'rettangolarePiena', B: 0.2, H: 0.4 } as const;
  const q = proprietaDa(p);

  it('A = b·h, I = b·h³/12, W = b·h²/6', () => {
    expect(q.A).toBeCloseTo(0.08, 12);
    expect(q.I).toBeCloseTo((0.2 * 0.4 ** 3) / 12, 15);
    expect(q.W).toBeCloseTo((0.2 * 0.4 ** 2) / 6, 15);
    expect(q.i).toBeCloseTo(0.4 / Math.sqrt(12), 12);
  });

  it('S(0) = b·h²/8 e S ai bordi è nullo', () => {
    expect(momentoStaticoA(p, 0)).toBeCloseTo((0.2 * 0.4 ** 2) / 8, 15);
    expect(momentoStaticoA(p, 0.2)).toBeCloseTo(0, 15);
    expect(momentoStaticoA(p, -0.2)).toBeCloseTo(0, 15);
  });

  it('τ massima al baricentro vale 1.5·T/A', () => {
    const T = 100e3;
    const tau = (T * momentoStaticoA(p, 0)) / (q.I * larghezzaA(p, 0));
    expect(tau).toBeCloseTo((1.5 * T) / q.A, 4);
  });

  it('la larghezza è costante e nulla fuori dalla sezione', () => {
    expect(larghezzaA(p, 0)).toBeCloseTo(0.2, 12);
    expect(larghezzaA(p, 0.19)).toBeCloseTo(0.2, 12);
    expect(larghezzaA(p, 0.21)).toBe(0);
  });
});

describe('circolare piena', () => {
  const p = { famiglia: 'circolarePiena', D: 0.2 } as const;
  const q = proprietaDa(p);

  it('A = πd²/4, I = πd⁴/64, W = πd³/32', () => {
    expect(q.A).toBeCloseTo((Math.PI * 0.04) / 4, 12);
    expect(q.I).toBeCloseTo((Math.PI * 0.2 ** 4) / 64, 15);
    expect(q.W).toBeCloseTo((Math.PI * 0.2 ** 3) / 32, 15);
    expect(q.i).toBeCloseTo(0.2 / 4, 12);
  });

  it('τ massima al baricentro vale 4/3 · T/A', () => {
    const T = 100e3;
    const tau = (T * momentoStaticoA(p, 0)) / (q.I * larghezzaA(p, 0));
    expect(tau).toBeCloseTo((4 / 3) * (T / q.A), 4);
  });

  it('la larghezza segue la corda del cerchio', () => {
    expect(larghezzaA(p, 0)).toBeCloseTo(0.2, 12);
    expect(larghezzaA(p, 0.06)).toBeCloseTo(2 * Math.sqrt(0.01 - 0.0036), 12);
    expect(larghezzaA(p, 0.1)).toBe(0);
  });
});

describe('circolare cava', () => {
  const p = { famiglia: 'circolareCava', D: 0.2, s: 0.008 } as const;
  const q = proprietaDa(p);
  const di = 0.2 - 2 * 0.008;

  it('proprietà come differenza fra cerchio esterno e interno', () => {
    expect(q.A).toBeCloseTo((Math.PI * (0.04 - di * di)) / 4, 12);
    expect(q.I).toBeCloseTo((Math.PI * (0.2 ** 4 - di ** 4)) / 64, 15);
  });

  it('a parete sottile τ massima tende a 2·T/A', () => {
    const T = 100e3;
    const tau = (T * momentoStaticoA(p, 0)) / (q.I * larghezzaA(p, 0));
    expect(tau / (T / q.A)).toBeGreaterThan(1.9);
    expect(tau / (T / q.A)).toBeLessThan(2.1);
  });

  it('spessore eccessivo è rifiutato', () => {
    expect(() => proprietaDa({ famiglia: 'circolareCava', D: 0.1, s: 0.06 })).toThrow();
  });
});

describe('rettangolare cava', () => {
  const p = { famiglia: 'rettangolareCava', B: 0.2, H: 0.3, s: 0.01 } as const;
  const q = proprietaDa(p);
  const bi = 0.18, hi = 0.28;

  it('proprietà come differenza fra rettangolo esterno e interno', () => {
    expect(q.A).toBeCloseTo(0.2 * 0.3 - bi * hi, 12);
    expect(q.I).toBeCloseTo((0.2 * 0.3 ** 3 - bi * hi ** 3) / 12, 15);
  });

  it('la larghezza crolla da b a 2t passando nelle anime', () => {
    expect(larghezzaA(p, 0.145)).toBeCloseTo(0.2, 12);   // dentro l'ala
    expect(larghezzaA(p, 0.1)).toBeCloseTo(0.02, 12);    // fra le anime
  });

  it('S è continuo attraverso il salto di larghezza', () => {
    const eps = 1e-9;
    const sopra = momentoStaticoA(p, hi / 2 + eps);
    const sotto = momentoStaticoA(p, hi / 2 - eps);
    expect(sopra).toBeCloseTo(sotto, 10);
  });

  it('spessore eccessivo è rifiutato', () => {
    expect(() => proprietaDa({ famiglia: 'rettangolareCava', B: 0.1, H: 0.1, s: 0.06 }))
      .toThrow();
  });
});

describe('profili commerciali (IPE / HEA / HEB)', () => {
  // La sezione è ricostruita per via parametrica — due ali, un'anima e i quattro
  // raccordi — non letta da una tabella di proprietà. Il confronto con i valori
  // di catalogo è quindi una verifica indipendente della formula, non una
  // tautologia: se il modello geometrico fosse sbagliato, lo scarto esploderebbe.

  it('A calcolata coincide con quella di catalogo entro lo 0.5 %', () => {
    let peggiore = 0, dove = '';
    for (const r of PRESET) {
      if (r.Atabellata === undefined) continue;
      const q = proprietaDa(r.parametri);
      const scarto = Math.abs(q.A - r.Atabellata * 1e-4) / (r.Atabellata * 1e-4);
      if (scarto > peggiore) { peggiore = scarto; dove = r.nome; }
    }
    expect(peggiore, `scarto massimo su ${dove}`).toBeLessThan(0.005);
  });

  it('I calcolata coincide con quella di catalogo entro lo 0.5 %', () => {
    let peggiore = 0, dove = '';
    for (const r of PRESET) {
      if (r.Itabellata === undefined) continue;
      const q = proprietaDa(r.parametri);
      const scarto = Math.abs(q.I - r.Itabellata * 1e-8) / (r.Itabellata * 1e-8);
      if (scarto > peggiore) { peggiore = scarto; dove = r.nome; }
    }
    expect(peggiore, `scarto massimo su ${dove}`).toBeLessThan(0.005);
  });

  it('senza i raccordi la sezione sarebbe sistematicamente più leggera del vero', () => {
    // è la prova che il termine di raccordo non è cosmetico: toglierlo produce
    // un errore a senso unico, dell'ordine del 3-8 % sull'area.
    for (const nome of ['IPE 200', 'IPE 300', 'IPE 500', 'HEB 300']) {
      const r = PRESET.find((x) => x.nome === nome)!;
      const conR = proprietaDa(r.parametri);
      const senzaR = proprietaDa({ ...r.parametri, r: 0 } as typeof r.parametri);
      expect(senzaR.A).toBeLessThan(conR.A);
      expect(senzaR.A).toBeLessThan(r.Atabellata! * 1e-4);
      const errore = (r.Atabellata! * 1e-4 - senzaR.A) / (r.Atabellata! * 1e-4);
      expect(errore).toBeGreaterThan(0.02);
      expect(errore).toBeLessThan(0.12);
    }
  });

  it('W tabellato coincide con I/(H/2)', () => {
    for (const r of PRESET) {
      const q = proprietaDa(r.parametri);
      expect(Math.abs(q.W - q.I / (q.H / 2)) / q.W).toBeLessThan(1e-12);
    }
  });

  it('la larghezza distingue ala e anima', () => {
    const p = preset('IPE 300');
    expect(larghezzaA(p, 0.149)).toBeCloseTo(0.15, 6);     // ala
    expect(larghezzaA(p, 0)).toBeCloseTo(0.0071, 6);       // anima
  });

  it('le quote notevoli includono il passaggio anima-ala', () => {
    const q = quoteNotevoli(preset('IPE 300'));
    const hw = 0.3 / 2 - 0.0107;
    expect(q.some((y) => Math.abs(y - hw) < 1e-6)).toBe(true);
    expect(q.some((y) => Math.abs(y + hw) < 1e-6)).toBe(true);
  });

  it('profilo sconosciuto: errore esplicito', () => {
    expect(() => preset('IPE 999')).toThrow(/IPE 999/);
  });
});

describe('sezioni asimmetriche (T, C, L)', () => {
  it('a T: il baricentro sta nell\'ala, W superiore ≠ W inferiore', () => {
    // T con ala larga in alto: il baricentro sale verso l'ala, quindi la fibra
    // inferiore è la più lontana e W_inf < W_sup.
    const p = { famiglia: 'aT', H: 0.2, B: 0.15, s1: 0.01, s2: 0.015 } as const;
    const q = proprietaDa(p);
    expect(q.ySup).toBeLessThan(q.yInf);          // baricentro sopra la mezzeria
    expect(q.ySup + q.yInf).toBeCloseTo(0.2, 12); // le due distanze coprono H
    expect(q.Winf).toBeLessThan(q.Wsup);
    expect(q.W).toBeCloseTo(Math.min(q.Wsup, q.Winf), 15);
    // controllo indipendente di A: ala + anima
    expect(q.A).toBeCloseTo(0.15 * 0.015 + (0.2 - 0.015) * 0.01, 12);
    // e di I con Huygens rispetto al baricentro trovato
    const yAla = 0.1 - 0.015 / 2, hAnima = 0.2 - 0.015;
    const yAnima = -0.1 + hAnima / 2;
    const Aala = 0.15 * 0.015, Aanima = hAnima * 0.01;
    const yg = (Aala * yAla + Aanima * yAnima) / (Aala + Aanima);
    const Iatteso =
      (0.15 * 0.015 ** 3) / 12 + Aala * (yAla - yg) ** 2 +
      (0.01 * hAnima ** 3) / 12 + Aanima * (yAnima - yg) ** 2;
    expect(q.I).toBeCloseTo(Iatteso, 14);
  });

  it('a C: simmetrica rispetto a y, quindi Wsup = Winf', () => {
    const p = { famiglia: 'aC', H: 0.2, B: 0.08, s1: 0.008, s2: 0.011 } as const;
    const q = proprietaDa(p);
    expect(q.Wsup).toBeCloseTo(q.Winf, 15);
    expect(q.A).toBeCloseTo(2 * 0.08 * 0.011 + (0.2 - 2 * 0.011) * 0.008, 12);
  });

  it('a L: baricentro fuori mezzeria e S(y) continuo al salto di larghezza', () => {
    const p = { famiglia: 'aL', H: 0.1, B: 0.1, s: 0.01 } as const;
    const q = proprietaDa(p);
    expect(q.A).toBeCloseTo(0.1 * 0.01 + (0.1 - 0.01) * 0.01, 12);
    expect(Math.abs(q.ySup - q.yInf)).toBeGreaterThan(0.01); // decisamente asimmetrica
    const yGiunzione = -q.yInf + 0.01;
    const eps = 1e-9;
    expect(momentoStaticoA(p, yGiunzione + eps))
      .toBeCloseTo(momentoStaticoA(p, yGiunzione - eps), 10);
  });

  it('per ogni famiglia S si annulla agli estremi ed è massimo al baricentro', () => {
    const casi = [
      { famiglia: 'rettangolarePiena', B: 0.2, H: 0.4 },
      { famiglia: 'rettangolareCava', B: 0.2, H: 0.3, s: 0.01 },
      { famiglia: 'circolarePiena', D: 0.2 },
      { famiglia: 'circolareCava', D: 0.2, s: 0.008 },
      { famiglia: 'doppioT', H: 0.3, B: 0.15, s1: 0.008, s2: 0.012 },
      { famiglia: 'aT', H: 0.2, B: 0.15, s1: 0.01, s2: 0.015 },
      { famiglia: 'aC', H: 0.2, B: 0.08, s1: 0.008, s2: 0.011 },
      { famiglia: 'aL', H: 0.1, B: 0.1, s: 0.01 },
      preset('IPE 300'),
      preset('HEA 200'),
    ] as const;
    for (const p of casi) {
      const q = proprietaDa(p);
      const { yInf, ySup } = estremiY(p);
      expect(momentoStaticoA(p, ySup)).toBeCloseTo(0, 12);
      expect(momentoStaticoA(p, -yInf)).toBeCloseTo(0, 12);
      // il massimo di S è al baricentro (y = 0 nel riferimento baricentrico)
      expect(momentoStaticoA(p, 0)).toBeCloseTo(q.Smax, 10);
      for (const t of [-0.4, -0.2, 0.2, 0.4]) {
        const y = t > 0 ? t * ySup : t * yInf;
        expect(momentoStaticoA(p, y)).toBeLessThanOrEqual(q.Smax + 1e-12);
      }
    }
  });
});

describe('costruzione della Sezione', () => {
  it('conserva i parametri come fonte di verità', () => {
    const s = sezioneDaParametri({ famiglia: 'circolareCava', D: 0.2, s: 0.008 }, 'sez1');
    expect(s.parametri).toEqual({ famiglia: 'circolareCava', D: 0.2, s: 0.008 });
    expect(s.A).toBeCloseTo(proprietaDa(s.parametri!).A, 15);
  });

  it('genera nomi leggibili con le misure', () => {
    expect(nomePredefinito({ famiglia: 'rettangolarePiena', B: 0.2, H: 0.4 }))
      .toBe('Rett 200×400');
    expect(nomePredefinito({ famiglia: 'circolareCava', D: 0.2, s: 0.008 }))
      .toBe('Ø 200×8.0');
    expect(nomePredefinito(preset('IPE 300'))).toBe('IPE 300');
  });

});

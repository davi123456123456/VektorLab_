/**
 * Stato tensionale e von Mises.
 *
 * I casi sono scelti per essere verificabili a mano: taglio puro, flessione
 * pura, e il caso combinato in cui il punto critico NON è né la fibra estrema
 * né il baricentro.
 */

import { describe, it, expect } from 'vitest';
import {
  distribuzioneTensioni, principali, tresca, vonMises,
} from '../../src/core/checks/tensioni.js';
import {
  preset, estremiY, proprietaDa, larghezzaA, momentoStaticoA,
} from '../../src/core/materials/sezioniParametriche.js';

describe('formule dello stato piano', () => {
  it('von Mises con solo σ vale |σ|', () => {
    expect(vonMises(200e6, 0)).toBeCloseTo(200e6, 6);
    expect(vonMises(-200e6, 0)).toBeCloseTo(200e6, 6);
  });

  it('von Mises nel taglio puro vale √3·τ', () => {
    expect(vonMises(0, 100e6)).toBeCloseTo(Math.sqrt(3) * 100e6, 6);
  });

  it('Tresca nel taglio puro vale 2·τ', () => {
    expect(tresca(0, 100e6)).toBeCloseTo(200e6, 6);
  });

  it('Tresca è sempre ≥ von Mises, e al massimo 2/√3 volte', () => {
    for (const s of [0, 50e6, 150e6, -220e6]) {
      for (const t of [0, 20e6, 90e6]) {
        const vm = vonMises(s, t);
        const tr = tresca(s, t);
        expect(tr).toBeGreaterThanOrEqual(vm - 1e-6);
        if (vm > 0) expect(tr / vm).toBeLessThanOrEqual(2 / Math.sqrt(3) + 1e-9);
      }
    }
  });

  it('le tensioni principali seguono il cerchio di Mohr', () => {
    const s = 120e6, t = 50e6;
    const p = principali(s, t);
    // somma degli invarianti
    expect(p.sigma1 + p.sigma2).toBeCloseTo(s, 6);
    // prodotto = determinante = σ·0 − τ². Il valore è dell'ordine di 1e15:
    // va confrontato in termini RELATIVI, non con una tolleranza assoluta.
    expect(Math.abs((p.sigma1 * p.sigma2 + t * t) / (t * t))).toBeLessThan(1e-12);
    expect(p.tauMax).toBeCloseTo((p.sigma1 - p.sigma2) / 2, 6);
    // e Tresca coincide con σ1 − σ2
    expect(tresca(s, t)).toBeCloseTo(p.sigma1 - p.sigma2, 6);
  });

  it('nel taglio puro le principali sono ±τ a 45°', () => {
    const p = principali(0, 80e6);
    expect(p.sigma1).toBeCloseTo(80e6, 6);
    expect(p.sigma2).toBeCloseTo(-80e6, 6);
    expect(p.thetaP).toBeCloseTo(Math.PI / 4, 9);
  });
});

describe('distribuzione su sezione rettangolare', () => {
  const par = { famiglia: 'rettangolarePiena', B: 0.2, H: 0.4 } as const;
  const q = proprietaDa(par);

  it('flessione pura: σ lineare, massima alla fibra estrema, τ nulla', () => {
    const M = 100e3;
    const d = distribuzioneTensioni({ N: 0, T: 0, M }, par, q);
    // σ = M/W alla fibra estrema
    expect(Math.abs(d.fibraEstrema.sigma)).toBeCloseTo(M / q.W, 3);
    expect(d.fibraEstrema.tau).toBeCloseTo(0, 9);
    // con τ = 0 ovunque, von Mises coincide con |σ|
    expect(d.vonMisesMax).toBeCloseTo(M / q.W, 3);
    // il critico è la fibra estrema
    expect(Math.abs(d.critico.y)).toBeCloseTo(0.2, 9);
  });

  it('il segno segue la convenzione: M > 0 tende le fibre a −y', () => {
    const d = distribuzioneTensioni({ N: 0, T: 0, M: 100e3 }, par, q);
    const sotto = d.punti.find((p) => Math.abs(p.y + 0.2) < 1e-9)!;
    const sopra = d.punti.find((p) => Math.abs(p.y - 0.2) < 1e-9)!;
    expect(sotto.sigma).toBeGreaterThan(0);   // trazione sotto
    expect(sopra.sigma).toBeLessThan(0);      // compressione sopra
  });

  it('taglio puro: τ parabolica, massima al baricentro, von Mises = √3·τ', () => {
    const T = 200e3;
    const d = distribuzioneTensioni({ N: 0, T, M: 0 }, par, q);
    expect(d.taglioMassimo.y).toBeCloseTo(0, 9);
    expect(d.taglioMassimo.tau).toBeCloseTo((1.5 * T) / q.A, 3);
    expect(d.vonMisesMax).toBeCloseTo(Math.sqrt(3) * (1.5 * T) / q.A, 3);
  });

  it('sforzo normale puro: σ uniforme, von Mises = |N|/A', () => {
    const N = 500e3;
    const d = distribuzioneTensioni({ N, T: 0, M: 0 }, par, q);
    for (const p of d.punti) expect(p.sigma).toBeCloseTo(N / q.A, 4);
    expect(d.vonMisesMax).toBeCloseTo(N / q.A, 4);
  });

  it('N + M: la fibra estrema critica è quella dalla parte di N', () => {
    const N = 200e3, M = 60e3;
    const d = distribuzioneTensioni({ N, T: 0, M }, par, q);
    const atteso = N / q.A + M / q.W;
    expect(d.vonMisesMax).toBeCloseTo(atteso, 3);
  });
});

describe('il punto critico non è sempre dove ci si aspetta', () => {
  /**
   * Doppio T con momento e taglio entrambi elevati. La verifica classica
   * guarderebbe la fibra estrema (σ massima, τ nulla) o il baricentro
   * (τ massima, σ nulla): il massimo vero della tensione ideale sta invece nella
   * ZONA DI PASSAGGIO ANIMA-ALA, dove σ è ancora quasi massima e τ si impenna
   * perché la larghezza crolla da 150 mm a 7.1 mm.
   */
  const nominale = { famiglia: 'doppioT', H: 0.3, B: 0.15, s1: 0.0071, s2: 0.0107, r: 0 } as const;
  const qn = proprietaDa(nominale);
  const c = 0.15 - 0.0107;      // faccia interna dell'ala

  it('geometria nominale: il critico è esattamente allo spigolo anima-ala', () => {
    const d = distribuzioneTensioni({ N: 0, T: 300e3, M: 150e3 }, nominale, qn);
    expect(Math.abs(d.critico.y)).toBeCloseTo(c, 6);

    const estrema = d.punti.find((pt) => Math.abs(pt.y - 0.15) < 1e-6)!;
    const baricentro = d.punti.find((pt) => Math.abs(pt.y) < 1e-9)!;
    expect(d.critico.vonMises).toBeGreaterThan(estrema.vonMises);
    expect(d.critico.vonMises).toBeGreaterThan(baricentro.vonMises);
  });

  it('geometria nominale: i valori allo spigolo tornano con il calcolo a mano', () => {
    const M = 150e3, T = 300e3;
    const critico = distribuzioneTensioni({ N: 0, T, M }, nominale, qn).critico;
    // σ = M·y/I
    expect(Math.abs(critico.sigma) / ((M * c) / qn.I)).toBeCloseTo(1, 6);
    // τ = T·S/(I·s1), con S = momento statico della sola ala
    const S = 0.15 * 0.0107 * ((0.3 - 0.0107) / 2);
    expect(Math.abs(critico.tau) / ((T * S) / (qn.I * 0.0071))).toBeCloseTo(1, 6);
    expect(critico.vonMises).toBeCloseTo(
      Math.sqrt(critico.sigma ** 2 + 3 * critico.tau ** 2), 3,
    );
  });

  it('col raccordo reale il picco scende sotto la gola e τ allo spigolo cala', () => {
    // Nel profilo vero la larghezza non crolla di colpo: i raccordi la portano
    // da B a s1 + 2r e poi a s1 lungo una fascia alta r. Il massimo di τ nella
    // zona di transizione si sposta quindi al piede del raccordo.
    const par = preset('IPE 300') as typeof nominale & { r: number };
    const q = proprietaDa(par);
    const piede = c - par.r;
    const d = distribuzioneTensioni({ N: 0, T: 300e3, M: 150e3 }, par, q);

    expect(Math.abs(d.critico.y)).toBeGreaterThan(piede - 2e-3);
    expect(Math.abs(d.critico.y)).toBeLessThan(c);

    // allo spigolo la larghezza è s1 + 2r, quindi τ è molto minore del valore
    // che darebbe la geometria nominale
    const spigolo = (T: number) =>
      (T * momentoStaticoA(par, c - 1e-9)) / (q.I * larghezzaA(par, c - 1e-9));
    const nominaleSpigolo = (300e3 * momentoStaticoA(nominale, c - 1e-9))
      / (qn.I * larghezzaA(nominale, c - 1e-9));
    expect(spigolo(300e3)).toBeLessThan(0.5 * nominaleSpigolo);

    const estrema = d.punti.find((pt) => Math.abs(pt.y - 0.15) < 1e-6)!;
    const baricentro = d.punti.find((pt) => Math.abs(pt.y) < 1e-9)!;
    expect(d.critico.vonMises).toBeGreaterThan(estrema.vonMises);
    expect(d.critico.vonMises).toBeGreaterThan(baricentro.vonMises);
  });

  it('S(y) è continuo attraverso la fascia dei raccordi', () => {
    // se lo fosse solo l'area (e non la sua distribuzione) τ avrebbe un salto
    // artificiale proprio nel punto che si vuole verificare
    const par = preset('IPE 300') as typeof nominale & { r: number };
    const eps = 1e-9;
    for (const y of [c, c - par.r]) {
      const sopra = momentoStaticoA(par, y + eps);
      const sotto = momentoStaticoA(par, y - eps);
      expect(Math.abs(sopra - sotto) / sotto).toBeLessThan(1e-6);
    }
  });

  it('con taglio trascurabile il critico torna a essere la fibra estrema', () => {
    const par = preset('IPE 300');
    const d = distribuzioneTensioni({ N: 0, T: 1e3, M: 150e3 }, par, proprietaDa(par));
    expect(Math.abs(d.critico.y)).toBeCloseTo(0.15, 3);
  });

  it('con momento trascurabile il critico è il baricentro', () => {
    const par = preset('IPE 300');
    const d = distribuzioneTensioni({ N: 0, T: 300e3, M: 1e3 }, par, proprietaDa(par));
    expect(Math.abs(d.critico.y)).toBeLessThan(1e-3);
  });
});

describe('τ è nulla sulle superfici libere di ogni sezione', () => {
  const casi = [
    { famiglia: 'rettangolarePiena', B: 0.2, H: 0.4 },
    { famiglia: 'rettangolareCava', B: 0.2, H: 0.3, s: 0.01 },
    { famiglia: 'circolarePiena', D: 0.2 },
    { famiglia: 'circolareCava', D: 0.2, s: 0.008 },
    preset('IPE 300'),
  ] as const;

  for (const par of casi) {
    it(`${par.famiglia}`, () => {
      const q = proprietaDa(par);
      const d = distribuzioneTensioni({ N: 0, T: 200e3, M: 0 }, par, q);
      const { yInf, ySup } = estremiY(par);
      const bordi = d.punti.filter(
        (p) => Math.abs(p.y - ySup) < 1e-9 || Math.abs(p.y + yInf) < 1e-9,
      );
      expect(bordi.length).toBeGreaterThan(0);
      for (const p of bordi) expect(Math.abs(p.tau)).toBeLessThan(1e-6);
    });
  }
});

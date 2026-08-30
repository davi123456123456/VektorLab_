/**
 * Dualità statico-cinematica e capacità di rilevare gli errori.
 *
 * Il secondo gruppo è il più importante: un'autoverifica che non fallisce mai
 * non serve a nulla. Qui si introducono errori deliberati e si controlla che
 * vengano intercettati.
 */

import { describe, it, expect } from 'vitest';
import { progetto } from '../../src/core/builder.js';
import { preset } from '../../src/core/materials/sezioniParametriche.js';
import { analizzaCaso, analizzaStatica, espandi } from '../../src/core/index.js';
import { costruisciIndice } from '../../src/core/model/queries.js';
import { decomponi } from '../../src/core/kinematics/bodies.js';
import { costruisciMatriceCinematica } from '../../src/core/kinematics/matrix.js';
import { risolviLU, trasposta } from '../../src/core/linalg/lu.js';
import { eseguiAutoverifiche } from '../../src/core/statica/autoverifiche.js';
import { calcolaReazioni } from '../../src/core/statica/reazioni.js';
import { MATERIALI } from '../../src/core/materials/materials.js';
import { SEZIONI } from '../../src/core/materials/sections.js';
import type { LoadCaseId, Progetto } from '../../src/core/model/types.js';

const CASO = 'principale' as LoadCaseId;
const EB = { teoria: 'eulero-bernoulli' as const };

function gerber(): Progetto {
  const p = progetto('gerber');
  const sez = p.sezioneParametrica('s', preset('IPE 300'));
  const A = p.nodo(0, 0, 'A');
  const G = p.nodo(6, 0, 'G');
  const B = p.nodo(8, 0, 'B');
  const C = p.nodo(12, 0, 'C');
  const a1 = p.asta(A, G, 'S275', sez, EB);
  const a2 = p.asta(G, B, 'S275', sez, { ...EB, svincoloIniziale: { M: true } });
  const a3 = p.asta(B, C, 'S275', sez, EB);
  p.vincolo(A, 'cerniera');
  p.vincolo(B, 'carrello');
  p.vincolo(C, 'carrello');
  for (const x of [a1, a2, a3]) p.distribuito(x, -15e3);
  return p.costruisci();
}

const indice = (p: Progetto) =>
  costruisciIndice(p, MATERIALI, [...SEZIONI, ...p.sezioniPersonalizzate]);

describe('dualità statico-cinematica', () => {
  it('la matrice non scalata differisce solo per le colonne di rotazione', () => {
    const p = gerber();
    const calcolo = espandi(p).progetto;
    const idx = indice(calcolo);
    const dec = decomponi(calcolo, idx);
    const mc = costruisciMatriceCinematica(calcolo, idx, dec);

    expect(mc.A.length).toBe(mc.ANonScalata.length);
    for (let i = 0; i < mc.A.length; i++) {
      for (let j = 0; j < mc.A[i].length; j++) {
        const rotazionale = j % 3 === 2;
        const atteso = rotazionale ? mc.A[i][j] * mc.Lc : mc.A[i][j];
        expect(mc.ANonScalata[i][j]).toBeCloseTo(atteso, 9);
      }
    }
  });

  it('le due matrici hanno lo stesso rango: la scalatura non altera la fisica', () => {
    const p = gerber();
    const calcolo = espandi(p).progetto;
    const idx = indice(calcolo);
    const dec = decomponi(calcolo, idx);
    const mc = costruisciMatriceCinematica(calcolo, idx, dec);

    const zero = (A: number[][]) => A.map(() => 0);
    const rA = risolviLU(trasposta(mc.A), zero(trasposta(mc.A))).rango;
    const rB = risolviLU(trasposta(mc.ANonScalata), zero(trasposta(mc.ANonScalata))).rango;
    expect(rA).toBe(rB);
  });

  it('il numero di incognite statiche coincide con i gradi di vincolo cinematici', () => {
    const p = gerber();
    const calcolo = espandi(p).progetto;
    const idx = indice(calcolo);
    const dec = decomponi(calcolo, idx);
    const mc = costruisciMatriceCinematica(calcolo, idx, dec);
    const e = calcolaReazioni(calcolo, idx, calcolo.carichi);
    expect(e.numeroIncognite).toBe(mc.righe.length);
    expect(e.numeroEquazioni).toBe(3 * dec.corpi.length);
  });
});

describe('le autoverifiche sanno fallire', () => {
  /**
   * Un controllo che non fallisce mai è indistinguibile da un controllo
   * assente. Qui si perturbano i risultati e si verifica che venga rilevato.
   */
  function conRisultatoPerturbato(perturba: (r: ReturnType<typeof analizzaCaso>) => void) {
    const p = gerber();
    const espansione = espandi(p);
    const idx = indice(espansione.progetto);
    const fem = analizzaCaso(p, CASO, { sezioniExtra: p.sezioniPersonalizzate });
    perturba(fem);
    const eq = calcolaReazioni(espansione.progetto, idx, espansione.progetto.carichi);
    return eseguiAutoverifiche(p, espansione, idx, fem, eq);
  }

  it('rileva un momento non nullo nella cerniera interna', () => {
    const a = conRisultatoPerturbato((r) => { r.aste[1].M[0] = 50e3; });
    const v = a.verifiche.find((x) => x.codice === 'M_NULLO_IN_CERNIERA')!;
    expect(v.superata).toBe(false);
    expect(a.tutteSuperate).toBe(false);
  });

  it('rileva una reazione di carrello non parallela al suo asse', () => {
    const a = conRisultatoPerturbato((r) => {
      const carrello = r.reazioni.find((x) => (x.nodoId as string) === 'B')!;
      carrello.fx = 20e3;      // un carrello orizzontale non può reagire in x
    });
    const v = a.verifiche.find((x) => x.codice === 'CARRELLO_PARALLELO')!;
    expect(v.superata).toBe(false);
  });

  it('rileva un momento reattivo in una cerniera esterna', () => {
    const a = conRisultatoPerturbato((r) => {
      const cerniera = r.reazioni.find((x) => (x.nodoId as string) === 'A')!;
      cerniera.mz = 30e3;
    });
    const v = a.verifiche.find((x) => x.codice === 'CERNIERA_SENZA_MOMENTO')!;
    expect(v.superata).toBe(false);
  });

  it('rileva la divergenza fra i due metodi', () => {
    const a = conRisultatoPerturbato((r) => {
      const reazione = r.reazioni.find((x) => (x.nodoId as string) === 'B')!;
      reazione.fy *= 1.02;     // 2 % di scarto: ben oltre 1e-6
    });
    const v = a.verifiche.find((x) => x.codice === 'CONFRONTO_METODI')!;
    expect(v.superata).toBe(false);
    expect(v.scarto).toBeGreaterThan(1e-6);
  });

  it('rileva un equilibrio globale non soddisfatto', () => {
    const a = conRisultatoPerturbato((r) => {
      r.equilibrio = { ...r.equilibrio, soddisfatto: false, residuoRelativo: 1e-3 };
    });
    const v = a.verifiche.find((x) => x.codice === 'EQUILIBRIO_GLOBALE')!;
    expect(v.superata).toBe(false);
  });

  it('sul modello intatto passano tutte, avendo esaminato qualcosa', () => {
    const a = conRisultatoPerturbato(() => { /* nessuna perturbazione */ });
    expect(a.tutteSuperate).toBe(true);
    const confronto = a.verifiche.find((x) => x.codice === 'CONFRONTO_METODI')!;
    expect(confronto.esaminati).toBeGreaterThan(0);
  });
});

describe('iperstatica e labile', () => {
  it('l\'iperstatica non viene risolta per equilibrio, e lo dichiara', () => {
    const p = progetto('incastro doppio');
    const sez = p.sezioneParametrica('s', preset('IPE 300'));
    const a = p.nodo(0, 0, 'A');
    const b = p.nodo(6, 0, 'B');
    const el = p.asta(a, b, 'S275', sez, EB);
    p.vincolo(a, 'incastro');
    p.vincolo(b, 'incastro');
    p.distribuito(el, -10e3);
    const prog = p.costruisci();
    const e = analizzaStatica(prog, { tipo: 'caso', id: CASO },
                              { sezioniExtra: prog.sezioniPersonalizzate });

    expect(e.equilibrio.classificazione).toBe('iperstatica');
    expect(e.equilibrio.iperstaticita).toBe(3);
    expect(e.equilibrio.risolto).toBe(false);
    expect(e.equilibrio.perNodo.length).toBe(0);
    // ma il FEM la risolve, e le autoverifiche pertinenti passano lo stesso
    expect(e.fem.equilibrio.soddisfatto).toBe(true);
    expect(e.autoverifiche.tutteSuperate).toBe(true);
    const confronto = e.autoverifiche.verifiche.find((x) => x.codice === 'CONFRONTO_METODI')!;
    expect(confronto.dettaglio).toContain('iperstatica');
  });

  it('la labile non produce reazioni e spiega perché', () => {
    const p = progetto('labile');
    const sez = p.sezioneParametrica('s', preset('IPE 300'));
    const a = p.nodo(0, 0, 'A');
    const b = p.nodo(4, 0, 'B');
    const el = p.asta(a, b, 'S275', sez, EB);
    p.vincolo(a, 'carrello', 0);
    p.vincolo(b, 'carrello', 0);
    p.distribuito(el, -10e3);
    p.forza(b, 5e3, 0);     // una forza orizzontale che nessuno può equilibrare
    const prog = p.costruisci();
    const e = analizzaStatica(prog, { tipo: 'caso', id: CASO },
                              { sezioniExtra: prog.sezioniPersonalizzate });

    expect(e.equilibrio.classificazione).toBe('labile');
    expect(e.equilibrio.risolto).toBe(false);
    expect(e.equilibrio.messaggio.toLowerCase()).toContain('labil');
  });
});

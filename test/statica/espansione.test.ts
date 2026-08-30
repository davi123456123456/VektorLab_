/**
 * Vincolo intermedio contro sconnessione interna: la distinzione che decide
 * se una trave è continua e iperstatica oppure Gerber e isostatica.
 */

import { describe, it, expect } from 'vitest';
import { progetto } from '../../src/core/builder.js';
import { preset } from '../../src/core/materials/sezioniParametriche.js';
import { espandi } from '../../src/core/model/espansione.js';
import { analizzaCaso, analizzaCinematica } from '../../src/core/index.js';
import type { LoadCaseId, Progetto } from '../../src/core/model/types.js';

const CASO = 'principale' as LoadCaseId;
const opz = (p: Progetto) => ({ sezioniExtra: p.sezioniPersonalizzate });

/** Trave unica di luce `L`, appoggiata agli estremi, con carico uniforme. */
function traveUnica(L: number, q: number) {
  const p = progetto('trave');
  const sez = p.sezioneParametrica('s', preset('IPE 300'));
  const a = p.nodo(0, 0);
  const b = p.nodo(L, 0);
  const el = p.asta(a, b, 'S275', sez, { teoria: 'eulero-bernoulli' });
  p.distribuito(el, -q);
  return { p, a, b, el };
}

describe('espansione', () => {
  it('senza vincoli intermedi il modello di calcolo coincide con l\'originale', () => {
    const { p, a, b } = traveUnica(6, 10e3);
    p.vincolo(a, 'cerniera'); p.vincolo(b, 'carrello');
    const e = espandi(p.costruisci());
    expect(e.progetto.aste.length).toBe(1);
    expect(e.nodiInterni.size).toBe(0);
  });

  it('un vincolo intermedio suddivide in due tronchi CONTINUI', () => {
    const { p, a, b, el } = traveUnica(10, 10e3);
    p.vincolo(a, 'cerniera'); p.vincolo(b, 'carrello');
    p.vincoloSuAsta(el, 0.5, 'carrello');
    const e = espandi(p.costruisci());

    expect(e.progetto.aste.length).toBe(2);
    expect(e.nodiInterni.size).toBe(1);
    // NESSUN rilascio: la continuità è completa
    for (const asta of e.progetto.aste) {
      expect(asta.svincolo.iniziale).toEqual({ N: false, T: false, M: false });
      expect(asta.svincolo.finale).toEqual({ N: false, T: false, M: false });
    }
    // il vincolo è finito sul nodo creato
    const nodoNuovo = e.progetto.nodi.find((n) => e.nodiInterni.has(n.id))!;
    expect(nodoNuovo.vincolo?.tipo).toBe('carrello');
    expect(nodoNuovo.x).toBeCloseTo(5, 9);
  });

  it('una sconnessione suddivide e RILASCIA', () => {
    const { p, a, b, el } = traveUnica(10, 10e3);
    p.vincolo(a, 'cerniera'); p.vincolo(b, 'carrello');
    p.sconnessione(el, 0.6, 'cerniera');
    const e = espandi(p.costruisci());

    expect(e.progetto.aste.length).toBe(2);
    // il primo tronco resta rigido, il secondo ha il momento rilasciato
    expect(e.progetto.aste[0].svincolo.finale.M).toBe(false);
    expect(e.progetto.aste[1].svincolo.iniziale.M).toBe(true);
    expect(e.nodiSconnessione.size).toBe(1);
  });

  it('il carico distribuito si ridistribuisce sui tronchi conservando la risultante', () => {
    const q = 10e3, L = 10;
    const { p, a, b, el } = traveUnica(L, q);
    p.vincolo(a, 'cerniera'); p.vincolo(b, 'carrello');
    p.vincoloSuAsta(el, 0.3, 'carrello');
    const e = espandi(p.costruisci());

    expect(e.progetto.carichi.length).toBe(2);
    // ogni tronco porta la sua quota, e la somma torna
    let risultante = 0;
    for (const c of e.progetto.carichi) {
      if (c.tipo !== 'distribuito') continue;
      const tratto = e.tratti.get(c.astaId)!;
      const lunghezzaTronco = (tratto.s1 - tratto.s0) * L;
      const coperta = (c.sFinale - c.sIniziale) * lunghezzaTronco;
      risultante += ((c.q1 + c.q2) / 2) * coperta;
    }
    expect(risultante).toBeCloseTo(-q * L, 6);
  });

  it('una forza in campata finisce sul tronco giusto con l\'ascissa riscalata', () => {
    const { p, a, b, el } = traveUnica(10, 0);
    p.vincolo(a, 'cerniera'); p.vincolo(b, 'carrello');
    p.forzaInCampata(el, 0.8, 0, -5e3);
    p.vincoloSuAsta(el, 0.5, 'carrello');
    const e = espandi(p.costruisci());

    const forza = e.progetto.carichi.find((c) => c.tipo === 'forzaInCampata')!;
    if (forza.tipo !== 'forzaInCampata') throw new Error('tipo inatteso');
    const tratto = e.tratti.get(forza.astaId)!;
    expect(tratto.s0).toBeCloseTo(0.5, 9);
    // 0.8 sull'originale = 0.6 sul secondo tronco, che va da 0.5 a 1
    expect(forza.s).toBeCloseTo(0.6, 9);
  });
});

describe('vincolo intermedio: la trave resta un corpo solo', () => {
  it('trave continua su tre appoggi: 1 corpo, 4 vincoli, 1 volta iperstatica', () => {
    const { p, a, b, el } = traveUnica(10, 10e3);
    p.vincolo(a, 'cerniera'); p.vincolo(b, 'carrello');
    p.vincoloSuAsta(el, 0.5, 'carrello');
    const prog = p.costruisci();

    const k = analizzaCinematica(prog);
    expect(k.numeroCorpi).toBe(1);
    expect(k.gradiVincolo).toBe(4);     // 2 + 1 + 1
    expect(k.labilita).toBe(0);
    expect(k.iperstaticita).toBe(1);
    expect(k.classificazione).toBe('iperstatica');
  });

  it('dà gli stessi risultati della trave modellata a mano con due elementi', () => {
    const q = 10e3, L = 10;

    // (a) una sola asta con vincolo intermedio
    const { p: pa, a, b, el } = traveUnica(L, q);
    pa.vincolo(a, 'cerniera'); pa.vincolo(b, 'carrello');
    pa.vincoloSuAsta(el, 0.5, 'carrello');
    const progA = pa.costruisci();

    // (b) due aste disegnate a mano
    const pb = progetto('due');
    const sez = pb.sezioneParametrica('s', preset('IPE 300'));
    const n0 = pb.nodo(0, 0), n1 = pb.nodo(L / 2, 0), n2 = pb.nodo(L, 0);
    const e1 = pb.asta(n0, n1, 'S275', sez, { teoria: 'eulero-bernoulli' });
    const e2 = pb.asta(n1, n2, 'S275', sez, { teoria: 'eulero-bernoulli' });
    pb.vincolo(n0, 'cerniera'); pb.vincolo(n1, 'carrello'); pb.vincolo(n2, 'carrello');
    pb.distribuito(e1, -q); pb.distribuito(e2, -q);
    const progB = pb.costruisci();

    const rA = analizzaCaso(progA, CASO, opz(progA));
    const rB = analizzaCaso(progB, CASO, opz(progB));

    const reazioniOrdinate = (r: typeof rA) =>
      r.reazioni.map((x) => x.fy).sort((p1, p2) => p1 - p2);
    const a1 = reazioniOrdinate(rA);
    const b1 = reazioniOrdinate(rB);
    expect(a1.length).toBe(b1.length);
    for (let i = 0; i < a1.length; i++) expect(a1[i]).toBeCloseTo(b1[i], 4);
  });

  it('trave continua a due campate: momento sull\'appoggio = −qL²/8', () => {
    // con L luce di ciascuna campata: è il caso classico di Clapeyron
    const q = 12e3, campata = 5;
    const { p, a, b, el } = traveUnica(2 * campata, q);
    p.vincolo(a, 'cerniera'); p.vincolo(b, 'carrello');
    p.vincoloSuAsta(el, 0.5, 'carrello');
    const prog = p.costruisci();
    const r = analizzaCaso(prog, CASO, opz(prog));

    const tuttiM = r.aste.flatMap((x) => x.puntiNotevoli.map((y) => y.M));
    expect(Math.min(...tuttiM)).toBeCloseTo(-(q * campata ** 2) / 8, 3);
    expect(Math.max(...tuttiM)).toBeCloseTo((9 / 128) * q * campata ** 2, 3);
  });
});

describe('sconnessione: la trave si divide in due corpi', () => {
  it('cerniera interna in mezzeria rende la trave labile', () => {
    // due appoggi soltanto non bastano più: due corpi, 3 gradi di vincolo
    // esterni + 2 di continuità = 5, contro 6 gradi di libertà
    const { p, a, b, el } = traveUnica(10, 10e3);
    p.vincolo(a, 'cerniera'); p.vincolo(b, 'carrello');
    p.sconnessione(el, 0.5, 'cerniera');
    const k = analizzaCinematica(p.costruisci());
    expect(k.numeroCorpi).toBe(2);
    expect(k.labilita).toBeGreaterThan(0);
  });

  it('con un terzo appoggio diventa una Gerber isostatica, e M = 0 nella cerniera', () => {
    const q = 15e3;
    const p = progetto('gerber');
    const sez = p.sezioneParametrica('s', preset('IPE 400'));
    const a = p.nodo(0, 0);
    const b = p.nodo(12, 0);
    const el = p.asta(a, b, 'S275', sez, { teoria: 'eulero-bernoulli' });
    p.distribuito(el, -q);
    p.vincolo(a, 'cerniera');
    p.vincoloSuAsta(el, 8 / 12, 'carrello');
    p.vincolo(b, 'carrello');
    p.sconnessione(el, 6 / 12, 'cerniera');
    const prog = p.costruisci();

    const k = analizzaCinematica(prog);
    expect(k.classificazione).toBe('isostatica');

    const r = analizzaCaso(prog, CASO, opz(prog));
    // la reazione in A è quella del tronco isostatico A–G, di luce 6 m
    const RA = r.reazioni.find((x) => x.nodoId === a)!;
    expect(RA.fy).toBeCloseTo((q * 6) / 2, 3);

    // e nella cerniera il momento è nullo
    const tronco = r.aste.find((x) => (x.astaId as string).endsWith('#1'))!;
    expect(Math.abs(tronco.M[0])).toBeLessThan(1e-6);
  });

  it('vincolo intermedio e sconnessione nello stesso punto danno risultati diversi', () => {
    const q = 10e3;
    const costruisci = (conSconnessione: boolean) => {
      const { p, a, b, el } = traveUnica(10, q);
      p.vincolo(a, 'cerniera'); p.vincolo(b, 'carrello');
      if (conSconnessione) p.sconnessione(el, 0.5, 'cerniera');
      else p.vincoloSuAsta(el, 0.5, 'carrello');
      return p.costruisci();
    };
    const continua = analizzaCinematica(costruisci(false));
    const spezzata = analizzaCinematica(costruisci(true));
    expect(continua.numeroCorpi).toBe(1);
    expect(spezzata.numeroCorpi).toBe(2);
    expect(continua.classificazione).toBe('iperstatica');
    expect(spezzata.classificazione).not.toBe('iperstatica');
  });
});

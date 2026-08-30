/**
 * Fisica delle molle e progressioni.
 */

import { describe, it, expect } from 'vitest';
import { Molla, MOLLE, Progressione } from '../../src/anim/molla.js';

/** Fa avanzare una molla per `secondi` a passi di 1/60. */
function simula(m: Molla, secondi: number): number[] {
  const storia: number[] = [];
  for (let t = 0; t < secondi; t += 1 / 60) storia.push(m.aggiorna(1 / 60));
  return storia;
}

describe('molla', () => {
  it('raggiunge il bersaglio e ci resta', () => {
    const m = new Molla(0, 1, MOLLE.precisa);
    simula(m, 2);
    expect(m.valore).toBeCloseTo(1, 6);
    expect(m.inMovimento).toBe(false);
  });

  it('smorzamento critico: non oltrepassa mai il bersaglio', () => {
    const m = new Molla(0, 1, { rigidezza: 170, smorzamento: 1 });
    const storia = simula(m, 2);
    expect(Math.max(...storia)).toBeLessThanOrEqual(1.001);
  });

  it('smorzamento ridotto: oltrepassa e torna', () => {
    const m = new Molla(0, 1, MOLLE.elastica);
    const storia = simula(m, 2);
    expect(Math.max(...storia)).toBeGreaterThan(1.05);
    expect(m.valore).toBeCloseTo(1, 4);
  });

  it('cambiare bersaglio a metà corsa non produce discontinuità', () => {
    // è la proprietà per cui si usa una molla e non un easing a durata fissa
    const m = new Molla(0, 10, MOLLE.morbida);
    simula(m, 0.15);
    const primaDelCambio = m.valore;
    m.vaiA(-5);
    const dopo = m.aggiorna(1 / 60);
    // il valore prosegue da dov'era: nessun salto
    expect(Math.abs(dopo - primaDelCambio)).toBeLessThan(0.5);
  });

  it('conserva la velocità quando il bersaglio cambia', () => {
    const m = new Molla(0, 10, MOLLE.morbida);
    simula(m, 0.2);
    const v = m.valore;
    m.vaiA(10.0001);            // bersaglio quasi identico
    const dopo = m.aggiorna(1 / 60);
    expect(dopo).toBeGreaterThan(v);   // stava salendo, continua a salire
  });

  it('imposta salta senza animare', () => {
    const m = new Molla(0, 10, MOLLE.morbida);
    simula(m, 0.1);
    m.imposta(3);
    expect(m.valore).toBe(3);
    expect(m.inMovimento).toBe(false);
  });

  it('resta stabile anche con un fotogramma molto lungo', () => {
    // un passo grande con l'Euler esplicito farebbe divergere l'oscillatore
    const m = new Molla(0, 1, { rigidezza: 400, smorzamento: 0.5 });
    for (let i = 0; i < 50; i++) m.aggiorna(0.5);
    expect(Number.isFinite(m.valore)).toBe(true);
    expect(Math.abs(m.valore)).toBeLessThan(10);
  });

  it('parte già a destinazione se creata sul bersaglio', () => {
    const m = new Molla(5);
    expect(m.valore).toBe(5);
    expect(m.inMovimento).toBe(false);
  });
});

describe('progressione', () => {
  it('va da 0 a 1 nella durata dichiarata e si ferma', () => {
    const p = new Progressione(0.5);
    p.avvia();
    expect(p.lineare).toBe(0);
    for (let t = 0; t < 0.5; t += 1 / 60) p.aggiorna(1 / 60);
    p.aggiorna(0.1);
    expect(p.lineare).toBe(1);
    expect(p.inCorso).toBe(false);
  });

  it('è monotona: un tracciamento non torna indietro', () => {
    const p = new Progressione(0.6);
    p.avvia();
    let precedente = -1;
    for (let t = 0; t < 0.7; t += 1 / 60) {
      const v = p.aggiorna(1 / 60);
      expect(v).toBeGreaterThanOrEqual(precedente);
      precedente = v;
    }
  });

  it('l\'addolcimento parte e finisce piano ma passa per 0.5 a metà', () => {
    const p = new Progressione(1);
    p.avvia();
    p.aggiorna(0.5);
    expect(p.valore).toBeCloseTo(0.5, 6);
  });

  it('completa porta subito alla fine', () => {
    const p = new Progressione(10);
    p.avvia();
    p.completa();
    expect(p.valore).toBe(1);
    expect(p.inCorso).toBe(false);
  });
});

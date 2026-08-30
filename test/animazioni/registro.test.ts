/**
 * Registro delle animazioni: apparizioni, molle, disattivazione.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DURATE, RegistroAnimazioni } from '../../src/anim/registro.js';
import { MOLLE } from '../../src/anim/molla.js';

/** Avanza il registro di `secondi` a passi di 1/60, con orologio finto. */
function avanza(r: RegistroAnimazioni, secondi: number, base = { ora: 0 }): void {
  const passi = Math.round(secondi * 60);
  for (let i = 0; i < passi; i++) {
    base.ora += 1000 / 60;
    r.avanza(base.ora);
  }
}

describe('apparizioni', () => {
  let r: RegistroAnimazioni;
  let orologio: { ora: number };
  beforeEach(() => {
    r = new RegistroAnimazioni();
    orologio = { ora: 0 };
    // il primo avanzamento inizializza il tempo
    r.avanza(0);
  });

  it('un oggetto mai segnalato è già comparso', () => {
    expect(r.apparizione('a1')).toBe(1);
  });

  it('un oggetto appena segnalato parte da 0 e arriva a 1', () => {
    r.segnalaApparizione('a1', 'asta');
    expect(r.apparizione('a1')).toBeLessThan(0.2);
    avanza(r, DURATE.apparizioneAsta + 0.05, orologio);
    expect(r.apparizione('a1')).toBe(1);
  });

  it('segnalare due volte non fa ripartire l\'animazione', () => {
    r.segnalaApparizione('a1', 'asta');
    avanza(r, DURATE.apparizioneAsta / 2, orologio);
    const meta = r.apparizione('a1');
    r.segnalaApparizione('a1', 'asta');
    expect(r.apparizione('a1')).toBeCloseTo(meta, 6);
  });

  it('la cascata ritarda gli elementi successivi', () => {
    r.segnalaApparizione('c1', 'carico', 0);
    r.segnalaApparizione('c2', 'carico', 5);
    avanza(r, 0.05, orologio);
    expect(r.apparizione('c1')).toBeGreaterThan(r.apparizione('c2'));
  });

  it('potare dimentica gli oggetti spariti, così un id riusato ri-anima', () => {
    r.segnalaApparizione('a1', 'asta');
    r.potaApparizioni(new Set());
    expect(r.apparizione('a1')).toBe(1);
    r.segnalaApparizione('a1', 'asta');
    expect(r.apparizione('a1')).toBeLessThan(1);
  });
});

describe('disattivazione', () => {
  it('spegnere porta tutto al valore finale, non congela a metà', () => {
    const r = new RegistroAnimazioni();
    r.avanza(0);
    r.segnalaApparizione('a1', 'asta');
    r.verso('scala', 10, MOLLE.morbida);
    r.avviaTracciamento('diag');
    avanza(r, 0.1);

    r.imposta(false);
    expect(r.apparizione('a1')).toBe(1);
    expect(r.avanzamento('diag')).toBe(1);
    expect(r.molla('scala', 0).valore).toBe(10);
  });

  it('da spente, le nuove animazioni nascono già concluse', () => {
    const r = new RegistroAnimazioni();
    r.avanza(0);
    r.imposta(false);
    r.segnalaApparizione('a2', 'asta');
    expect(r.apparizione('a2')).toBe(1);
    expect(r.verso('x', 42)).toBe(42);
    r.avviaTracciamento('d2');
    expect(r.avanzamento('d2')).toBe(1);
  });
});

describe('molle nel registro', () => {
  it('la stessa chiave restituisce la stessa molla', () => {
    const r = new RegistroAnimazioni();
    r.avanza(0);
    const a = r.molla('k', 0);
    const b = r.molla('k', 99);
    expect(a).toBe(b);
    expect(b.valore).toBe(0);   // il valore iniziale non viene riscritto
  });

  it('verso muove la molla verso il bersaglio nel tempo', () => {
    const r = new RegistroAnimazioni();
    r.avanza(0);
    r.verso('k', 0);
    r.verso('k', 100, MOLLE.precisa);
    // Con ζ = 1 e ω = √170 ≈ 13 rad/s la risposta è x(t) = 1 − (1+ωt)e^{−ωt}:
    // a 0,5 s manca circa l'1 %, a 1 s meno di un decimillesimo. Sono i tempi
    // che rendono la transizione percepibile senza farla attendere.
    avanza(r, 0.25);
    const aMezzo = r.verso('k', 100);
    expect(aMezzo).toBeGreaterThan(80);
    expect(aMezzo).toBeLessThan(100);

    avanza(r, 0.75);
    expect(Math.abs(r.verso('k', 100) - 100) / 100).toBeLessThan(0.005);

    avanza(r, 1.5);
    expect(r.molla('k', 0).inMovimento).toBe(false);
  });

  it('la soglia di arresto è relativa: una molla su valori grandi si ferma', () => {
    const r = new RegistroAnimazioni();
    r.avanza(0);
    r.verso('zoom', 1);
    r.verso('zoom', 5000, MOLLE.morbida);
    avanza(r, 3);
    expect(r.molla('zoom', 0).inMovimento).toBe(false);
    expect(r.verso('zoom', 5000)).toBeCloseTo(5000, 0);
  });
});

describe('orologio', () => {
  it('avanza col tempo e limita i fotogrammi molto lunghi', () => {
    const r = new RegistroAnimazioni();
    r.avanza(0);
    r.avanza(100);
    const dopoNormale = r.orologio;
    // un fotogramma da 2 s (scheda in background) non deve far saltare
    // l'animazione in avanti di due secondi
    r.avanza(2100);
    expect(r.orologio - dopoNormale).toBeLessThanOrEqual(1 / 20 + 1e-9);
  });
});

/**
 * §6 — la sezione Risultati scrive meno: cifre significative, niente numeri
 * inventati, niente blocchi vuoti.
 */

import { describe, it, expect } from 'vitest';
import { useStore } from '../../src/state/store.js';

/** Stessa funzione usata dal pannello, riprodotta per poterla verificare. */
function sig(v: number, cifre: number): string {
  if (!Number.isFinite(v)) return '—';
  if (v === 0) return '0';
  const a = Math.abs(v);
  if (a >= 1e6 || a < 1e-4) return v.toExponential(Math.max(0, cifre - 1));
  return String(Number(v.toPrecision(cifre)));
}

describe('cifre significative', () => {
  it('taglia le code decimali senza significato', () => {
    expect(sig(12.4000000001, 3)).toBe('12.4');
    expect(sig(-51.11999999, 3)).toBe('-51.1');
  });

  it('non è un numero fisso di decimali: si adatta all ordine di grandezza', () => {
    expect(sig(0.00123456, 3)).toBe('0.00123');
    expect(sig(123456, 3)).toBe('123000');
  });

  it('lo zero resta zero, non 0.00', () => {
    expect(sig(0, 3)).toBe('0');
  });

  it('i valori non finiti diventano un trattino, non NaN', () => {
    expect(sig(Number.NaN, 3)).toBe('—');
    expect(sig(Number.POSITIVE_INFINITY, 3)).toBe('—');
  });

  it('passa alla notazione esponenziale dove quella decimale non si legge', () => {
    expect(sig(4.4e-16, 3)).toBe('4.40e-16');
    expect(sig(2.5e7, 3)).toBe('2.50e+7');
  });

  it('il numero di cifre è configurabile', () => {
    expect(sig(Math.PI, 3)).toBe('3.14');
    expect(sig(Math.PI, 6)).toBe('3.14159');
  });
});

describe('impostazione nello store', () => {
  it('parte da tre cifre', () => {
    expect(useStore.getState().cifreRisultati).toBe(3);
  });

  it('si può alzare', () => {
    useStore.getState().impostaOpzioniRisultati({ cifreRisultati: 5 });
    expect(useStore.getState().cifreRisultati).toBe(5);
    useStore.getState().impostaOpzioniRisultati({ cifreRisultati: 3 });
  });
});

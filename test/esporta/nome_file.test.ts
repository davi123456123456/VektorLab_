/**
 * §5 — IL NOME DEL FILE.
 *
 * `VektorLab_<titolo>_<AAAA-MM-GG>.pdf`. Il titolo va ripulito perché è
 * scritto dall'utente e finisce in un nome di file: una barra dentro
 * impedisce il salvataggio su Windows e crea una cartella altrove.
 */

import { describe, it, expect } from 'vitest';
import { nomeFile } from '../../src/ui/EsportaRelazione.js';

const g = new Date(2026, 8, 5);   // 5 settembre 2026

describe('§5 — nome del file', () => {
  it('la forma è quella chiesta', () => {
    expect(nomeFile('Portale', g)).toBe('VektorLab_Portale_2026-09-05.pdf');
  });

  it('gli spazi diventano trattini bassi, non spariscono', () => {
    expect(nomeFile('Relazione di calcolo', g))
      .toBe('VektorLab_Relazione_di_calcolo_2026-09-05.pdf');
  });

  it('i caratteri vietati vengono tolti', () => {
    expect(nomeFile('trave 1/2 : prova?', g))
      .toBe('VektorLab_trave_12_prova_2026-09-05.pdf');
  });

  it('gli accenti restano: sono legittimi in un nome di file', () => {
    expect(nomeFile('Città', g)).toBe('VektorLab_Città_2026-09-05.pdf');
  });

  it('un titolo vuoto non produce un nome monco', () => {
    expect(nomeFile('   ', g)).toBe('VektorLab_relazione_2026-09-05.pdf');
    expect(nomeFile('///', g)).toBe('VektorLab_relazione_2026-09-05.pdf');
  });

  it('un titolo lunghissimo viene troncato', () => {
    const n = nomeFile('x'.repeat(300), g);
    expect(n.length).toBeLessThan(120);
    expect(n.endsWith('_2026-09-05.pdf')).toBe(true);
  });

  it('il mese e il giorno hanno sempre due cifre', () => {
    expect(nomeFile('a', new Date(2026, 0, 3)))
      .toBe('VektorLab_a_2026-01-03.pdf');
  });
});

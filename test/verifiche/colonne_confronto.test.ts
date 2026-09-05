/**
 * §3 (iterazione 11-bis) — LE COLONNE DEL CONFRONTO.
 *
 * Le tre regole del §3.1 sono proprietà dell'elenco delle colonne, e qui si
 * verificano sull'elenco: una sola colonna per concetto, unità
 * nell'intestazione, e niente proprietà costanti del materiale fra i
 * risultati — densità e modulo elastico sono dati d'ingresso, non effetti
 * sulla struttura in esame.
 */

import { describe, it, expect } from 'vitest';
import { COLONNE } from '../../src/ui/colonneConfronto.js';

describe('§3.2 — le colonne proposte, tutte e nove', () => {
  it('ci sono, in quest ordine', () => {
    expect(COLONNE.map((c) => c.id)).toEqual([
      'nome', 'massa', 'sigma', 'resistenza', 'utilizzo',
      'cs', 'spostamento', 'esito', 'costo',
    ]);
  });

  it('con i nomi comprensibili chiesti dal §3.2', () => {
    const per = (id: string) => COLONNE.find((c) => c.id === id)!;
    expect(per('spostamento').testo).toBe('Spostamento max');
    expect(per('utilizzo').testo).toBe('Utilizzo');
    expect(per('resistenza').testo).toBe('Snervamento');
    expect(per('esito').testo).toBe('Esito');
  });

  it('e le unità nell intestazione', () => {
    const unita = Object.fromEntries(COLONNE.map((c) => [c.id, c.unita]));
    expect(unita.massa).toBe('kg');
    expect(unita.sigma).toBe('MPa');
    expect(unita.resistenza).toBe('MPa');
    expect(unita.utilizzo).toBe('%');
    expect(unita.spostamento).toBe('mm');
    expect(unita.costo).toBe('€');
    // adimensionali: un'unità inventata sarebbe peggio di nessuna
    expect(unita.cs).toBeUndefined();
    expect(unita.esito).toBeUndefined();
    expect(unita.nome).toBeUndefined();
  });
});

describe('§3.1 — le tre regole', () => {
  it('una sola colonna per concetto: nessun id e nessun nome ripetuto', () => {
    expect(new Set(COLONNE.map((c) => c.id)).size).toBe(COLONNE.length);
    expect(new Set(COLONNE.map((c) => c.testo)).size).toBe(COLONNE.length);
  });

  it('nessuna proprietà costante del materiale fra i risultati', () => {
    // densità e modulo elastico non dipendono dalla struttura in esame:
    // stanno nella scheda del materiale, non in un confronto di effetti
    const vietate = /densit|ρ|rho|modulo elastic|\bE\b|GPa|kg\/m/i;
    for (const c of COLONNE) {
      expect(vietate.test(c.testo), `intestazione «${c.testo}»`).toBe(false);
      expect(c.unita === undefined || !/kg\/m|GPa/.test(c.unita)).toBe(true);
    }
  });

  it('ogni colonna spiega sé stessa nel suggerimento', () => {
    for (const c of COLONNE) expect(c.spiega.length).toBeGreaterThan(10);
  });

  it('e il termine tecnico resta, nel suggerimento', () => {
    const per = (id: string) => COLONNE.find((c) => c.id === id)!;
    expect(per('spostamento').spiega).toMatch(/freccia/i);
    expect(per('utilizzo').spiega).toMatch(/sfruttamento/i);
    expect(per('resistenza').spiega).toMatch(/S_y/);
  });
});

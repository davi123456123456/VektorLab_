/**
 * §2.2 — LA TABELLA DEVE STARE NELLA LARGHEZZA DEL PANNELLO.
 *
 * È il requisito che prima mancava, ed è una regola verificabile: date le
 * colonne scelte e la larghezza disponibile, quante ne entrano e che cosa si
 * mostra. Una tabella che sborda si scopre guardandola; la decisione di non
 * farla sbordare si mette alla prova qui.
 */

import { describe, it, expect } from 'vitest';
import {
  GRANDEZZE, impaginazione, larghezzaColonna,
  LARGHEZZA_NOME, SOGLIA_SCHEDE,
} from '../../src/ui/TabellaMateriali.js';

const per = (...id: string[]) => id.map((x) => GRANDEZZE.find((g) => g.id === x)!);

describe('§2.2 — le colonne entrano, o si avvisa', () => {
  it('le tre predefinite stanno in un pannello da 288 px', () => {
    const r = impaginazione(per('E', 'fy', 'rho'), 288);
    expect(r.modo).toBe('tabella');
    expect(r.entrano).toBe(3);
    expect(r.traboccano).toBe(0);
  });

  it('e lasciano al nome più dello spazio minimo', () => {
    const usata = per('E', 'fy', 'rho').reduce((a, g) => a + larghezzaColonna(g), 0);
    expect(288 - usata).toBeGreaterThanOrEqual(LARGHEZZA_NOME);
  });

  it('accendendole tutte, in 288 px non entrano e il numero è dichiarato', () => {
    const r = impaginazione(GRANDEZZE, 288);
    expect(r.modo).toBe('tabella');
    expect(r.traboccano).toBeGreaterThan(0);
    expect(r.entrano + r.traboccano).toBe(GRANDEZZE.length);
  });

  it('allargando il pannello ne entrano di più, mai di meno', () => {
    let precedente = 0;
    for (const w of [220, 288, 360, 460, 600, 900]) {
      const r = impaginazione(GRANDEZZE, w);
      expect(r.entrano).toBeGreaterThanOrEqual(precedente);
      precedente = r.entrano;
    }
    // a 900 px ci stanno tutte
    expect(impaginazione(GRANDEZZE, 900).traboccano).toBe(0);
  });

  it('le colonne che entrano non superano mai la larghezza disponibile', () => {
    for (const w of [220, 288, 340, 420, 520, 700]) {
      const r = impaginazione(GRANDEZZE, w);
      const usata = GRANDEZZE.slice(0, r.entrano)
        .reduce((a, g) => a + larghezzaColonna(g), LARGHEZZA_NOME);
      expect(usata, `a ${w}px`).toBeLessThanOrEqual(w);
    }
  });
});

describe('§2.2 punto 6 — a pannello molto stretto si passa a schede', () => {
  it(`sotto ${SOGLIA_SCHEDE} px`, () => {
    expect(impaginazione(per('E', 'fy'), SOGLIA_SCHEDE - 1).modo).toBe('schede');
    expect(impaginazione(per('E', 'fy'), SOGLIA_SCHEDE + 1).modo).toBe('tabella');
  });

  it('e a schede non si parla di colonne che traboccano', () => {
    const r = impaginazione(GRANDEZZE, 150);
    expect(r.modo).toBe('schede');
    expect(r.traboccano).toBe(0);
  });
});

describe('§2.2 punto 5 — le larghezze seguono il contenuto', () => {
  it('una colonna a due decimali è più stretta di una a quattro cifre', () => {
    const nu = GRANDEZZE.find((g) => g.id === 'nu')!;
    const rho = GRANDEZZE.find((g) => g.id === 'rho')!;
    expect(larghezzaColonna(nu)).toBeLessThanOrEqual(larghezzaColonna(rho));
  });

  it('nessuna colonna scende sotto la larghezza della propria sigla', () => {
    for (const g of GRANDEZZE) {
      expect(larghezzaColonna(g)).toBeGreaterThanOrEqual(g.sigla.length * 7 + 10);
    }
  });
});

describe('§2.1 — le grandezze offerte', () => {
  it('sono proprietà del MATERIALE, non risultati sulla struttura', () => {
    // se qui comparisse «peso della struttura» o «freccia», sarebbe la tabella
    // sbagliata: quella è il confronto, e vive in un altro pannello
    const vietate = /peso|freccia|spostamento|sfruttamento|utilizzo|C\.S\./i;
    for (const g of GRANDEZZE) expect(vietate.test(g.nome)).toBe(false);
  });

  it('ognuna ha sigla, nome esteso e un colore', () => {
    for (const g of GRANDEZZE) {
      expect(g.sigla.length).toBeGreaterThan(0);
      expect(g.sigla.length).toBeLessThanOrEqual(4);
      expect(g.nome.length).toBeGreaterThan(g.sigla.length);
      expect(g.colore({ accento: '#000' })).toMatch(/var\(--|#/);
    }
  });

  it('le sigle sono tutte diverse: due colonne uguali non si distinguono', () => {
    expect(new Set(GRANDEZZE.map((g) => g.sigla)).size).toBe(GRANDEZZE.length);
  });
});

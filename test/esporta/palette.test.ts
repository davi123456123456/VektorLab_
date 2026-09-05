/**
 * §4.1 — LA PALETTE CHIARA.
 *
 * Due proprietà, e sono quelle che contano: ogni colore è leggibile sul
 * foglio bianco, e le quattro tinte dei diagrammi restano LE STESSE dello
 * schermo. La seconda è il motivo per cui la palette è derivata e non
 * riscritta: un colore ricopiato a mano diverge alla prima modifica.
 */

import { describe, it, expect } from 'vitest';
import {
  paletteDocumento, leggiColore, suBianco, aHsl, scurisciFinoA,
  CONTRASTO_TESTO, CONTRASTO_GRAFICA,
  CONTRASTO_TENUE_MIN, CONTRASTO_TENUE_MAX, type PaletteDocumento,
} from '../../src/esporta/palette.js';
import { leggiTema } from '../../src/render/tema.js';

const tema = leggiTema();          // fuori dal browser cade sulla riserva
const p = paletteDocumento(tema);

const rgb = (c: string) => leggiColore(c)!;

describe('§4.1 — contrasto sul foglio bianco', () => {
  const testuali: (keyof PaletteDocumento)[] = [
    'testo', 'testoAttenuato', 'quota', 'ok', 'errore', 'avviso', 'accento',
    'vincolo', 'carico', 'nodo', 'asta',
  ];
  for (const k of testuali) {
    it(`${k} regge il criterio del testo (${CONTRASTO_TESTO})`, () => {
      const c = suBianco(rgb(p[k]));
      expect(c, `${p[k]} → ${c.toFixed(2)}`).toBeGreaterThanOrEqual(CONTRASTO_TESTO);
    });
  }

  const grafici: (keyof PaletteDocumento)[] = [
    'sforzoNormale', 'taglio', 'momento', 'deformata', 'reazione', 'linea',
  ];
  for (const k of grafici) {
    it(`${k} regge il criterio della grafica (${CONTRASTO_GRAFICA})`, () => {
      const c = suBianco(rgb(p[k]));
      expect(c, `${p[k]} → ${c.toFixed(2)}`).toBeGreaterThanOrEqual(CONTRASTO_GRAFICA);
    });
  }

  /*
   * I tratti subordinati si verificano DA DUE LATI. Chiedere loro il contrasto
   * della grafica li porterebbe al livello di ciò che accompagnano, e la
   * struttura di riferimento sotto un diagramma finirebbe per competere col
   * diagramma: sarebbe leggibile e sbagliata.
   */
  const tenui: (keyof PaletteDocumento)[] = [
    'strutturaTenue', 'tratteggiata', 'lineaTenue',
  ];
  for (const k of tenui) {
    it(`${k} si vede in stampa ma resta subordinato`, () => {
      const c = suBianco(rgb(p[k]));
      expect(c, `${p[k]} → ${c.toFixed(2)}`).toBeGreaterThanOrEqual(CONTRASTO_TENUE_MIN);
      expect(c, `${p[k]} → ${c.toFixed(2)}`).toBeLessThan(CONTRASTO_TENUE_MAX);
    });
  }

  it('e i tratti subordinati sono più tenui di ciò che accompagnano', () => {
    expect(suBianco(rgb(p.strutturaTenue))).toBeLessThan(suBianco(rgb(p.momento)));
    expect(suBianco(rgb(p.lineaTenue))).toBeLessThan(suBianco(rgb(p.linea)));
  });

  it('il fondo è bianco e il testo ci sta sopra con il massimo contrasto', () => {
    expect(p.foglio).toBe('#ffffff');
    expect(suBianco(rgb(p.testo))).toBeGreaterThan(12);
  });
});

describe('§4.1 — le tinte dei diagrammi non cambiano identità', () => {
  const coppie = [
    ['sforzoNormale', tema.sforzoNormale],
    ['taglio', tema.taglio],
    ['momento', tema.momento],
    ['deformata', tema.deformata],
  ] as const;

  for (const [chiave, schermo] of coppie) {
    it(`${chiave} conserva la tinta dello schermo`, () => {
      const a = aHsl(rgb(schermo)), b = aHsl(rgb(p[chiave]));
      const d = Math.abs(a.h - b.h);
      const scarto = Math.min(d, 1 - d) * 360;
      expect(scarto, `${schermo} → ${p[chiave]}: ${scarto.toFixed(1)}°`)
        .toBeLessThan(2);
    });
  }

  it('le quattro tinte restano distinguibili fra loro', () => {
    const tinte = coppie.map(([k]) => aHsl(rgb(p[k])).h * 360);
    for (let i = 0; i < tinte.length; i++) {
      for (let j = i + 1; j < tinte.length; j++) {
        const d = Math.abs(tinte[i] - tinte[j]);
        expect(Math.min(d, 360 - d)).toBeGreaterThan(25);
      }
    }
  });

  it('un colore già leggibile non viene toccato', () => {
    expect(scurisciFinoA('#14171c', CONTRASTO_TESTO)).toBe('#14171c');
  });

  it('e uno illeggibile viene scurito quel tanto che basta, non di più', () => {
    const prima = suBianco(rgb(tema.reazione));
    expect(prima).toBeLessThan(CONTRASTO_GRAFICA);
    const dopo = suBianco(rgb(scurisciFinoA(tema.reazione, CONTRASTO_GRAFICA)));
    expect(dopo).toBeGreaterThanOrEqual(CONTRASTO_GRAFICA);
    expect(dopo).toBeLessThan(CONTRASTO_GRAFICA + 0.3);
  });
});

describe('§4.1 — la palette è DERIVATA, non ricopiata', () => {
  it('cambiando il tema cambia la palette del documento', () => {
    const alterato = { ...tema, momento: '#00a2ff' };
    const q = paletteDocumento(alterato);
    expect(q.momento).not.toBe(p.momento);
    expect(Math.abs(aHsl(rgb(q.momento)).h - aHsl(rgb('#00a2ff')).h) * 360)
      .toBeLessThan(2);
  });
});

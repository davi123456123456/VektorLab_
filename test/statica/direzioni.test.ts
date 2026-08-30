/**
 * Direzione, verso e modalità di misura dei carichi distribuiti.
 *
 * Sono i casi in cui un carico "implicitamente verticale" sbaglia: aste
 * verticali, aste inclinate, carichi in proiezione, carichi verso l'alto.
 */

import { describe, it, expect } from 'vitest';
import {
  componentiGlobali, componentiLocali, fattoreProiezione,
  risultanteDistribuito, versoreGlobale,
} from '../../src/core/model/direzioni.js';
import { progetto } from '../../src/core/builder.js';
import { preset } from '../../src/core/materials/sezioniParametriche.js';
import { analizzaCaso } from '../../src/core/index.js';
import type { DirezioneCarico, LoadCaseId, Progetto } from '../../src/core/model/types.js';

const CASO = 'principale' as LoadCaseId;

/** Confronto di versori componente per componente: −0 e +0 sono lo stesso. */
const versoreVale = (v: readonly [number, number], x: number, y: number) => {
  expect(v[0]).toBeCloseTo(x, 12);
  expect(v[1]).toBeCloseTo(y, 12);
};
const orizzontale = { c: 1, s: 0 };
const verticale = { c: 0, s: 1 };
const a45 = { c: Math.SQRT1_2, s: Math.SQRT1_2 };

describe('versore della direzione', () => {
  it('locale ortogonale ruota con l\'asta', () => {
    versoreVale(versoreGlobale({ modo: 'localeOrtogonale' }, orizzontale), 0, 1);
    // su un'asta verticale l'ortogonale è ORIZZONTALE: è il caso del vento
    versoreVale(versoreGlobale({ modo: 'localeOrtogonale' }, verticale), -1, 0);
  });

  it('locale assiale segue l\'asse dell\'asta', () => {
    versoreVale(versoreGlobale({ modo: 'localeAssiale' }, verticale), 0, 1);
  });

  it('i modi globali non dipendono dall\'asta', () => {
    for (const asse of [orizzontale, verticale, a45]) {
      versoreVale(versoreGlobale({ modo: 'globaleX' }, asse), 1, 0);
      versoreVale(versoreGlobale({ modo: 'globaleY' }, asse), 0, 1);
    }
  });

  it('l\'angolo arbitrario dà il versore corrispondente', () => {
    const v = versoreGlobale({ modo: 'angolo', alpha: (Math.PI / 3) as never }, orizzontale);
    expect(v[0]).toBeCloseTo(0.5, 12);
    expect(v[1]).toBeCloseTo(Math.sqrt(3) / 2, 12);
  });
});

describe('fattore di proiezione', () => {
  it('vale 1 quando l\'intensità è per unità di lunghezza dell\'asta', () => {
    expect(fattoreProiezione({ modo: 'globaleY' }, a45)).toBe(1);
  });

  it('carico verticale in proiezione: fattore |cos θ|', () => {
    const d: DirezioneCarico = { modo: 'globaleY', perProiezione: true };
    expect(fattoreProiezione(d, orizzontale)).toBeCloseTo(1, 12);
    expect(fattoreProiezione(d, a45)).toBeCloseTo(Math.SQRT1_2, 12);
    // su un'asta verticale la proiezione orizzontale è nulla: nessun carico
    expect(fattoreProiezione(d, verticale)).toBeCloseTo(0, 12);
  });

  it('carico orizzontale in proiezione: fattore |sin θ|', () => {
    const d: DirezioneCarico = { modo: 'globaleX', perProiezione: true };
    expect(fattoreProiezione(d, orizzontale)).toBeCloseTo(0, 12);
    expect(fattoreProiezione(d, verticale)).toBeCloseTo(1, 12);
  });

  it('sui riferimenti locali la proiezione non si applica', () => {
    const d: DirezioneCarico = { modo: 'localeOrtogonale', perProiezione: true };
    expect(fattoreProiezione(d, a45)).toBe(1);
  });

  it('su falda a 30° la differenza fra i due modi è del 13 %', () => {
    // è la differenza fra misurare la neve in pianta e lungo la falda
    const falda = { c: Math.cos(Math.PI / 6), s: Math.sin(Math.PI / 6) };
    const f = fattoreProiezione({ modo: 'globaleY', perProiezione: true }, falda);
    expect(f).toBeCloseTo(Math.cos(Math.PI / 6), 12);
    expect(1 - f).toBeCloseTo(0.134, 3);
  });
});

describe('componenti locali', () => {
  it('carico verticale su asta orizzontale: tutto ortogonale', () => {
    const r = componentiLocali(-10e3, { modo: 'globaleY' }, orizzontale);
    expect(r.qx).toBeCloseTo(0, 9);
    expect(r.qy).toBeCloseTo(-10e3, 9);
  });

  it('carico verticale su asta VERTICALE: tutto assiale', () => {
    const r = componentiLocali(-10e3, { modo: 'globaleY' }, verticale);
    expect(r.qx).toBeCloseTo(-10e3, 9);
    expect(r.qy).toBeCloseTo(0, 9);
  });

  it('carico verticale su asta a 45°: metà e metà', () => {
    const r = componentiLocali(-10e3, { modo: 'globaleY' }, a45);
    expect(r.qx).toBeCloseTo(-10e3 * Math.SQRT1_2, 9);
    expect(r.qy).toBeCloseTo(-10e3 * Math.SQRT1_2, 9);
  });

  it('il segno inverte il verso senza cambiare la direzione', () => {
    const giu = componentiLocali(-5e3, { modo: 'globaleY' }, a45);
    const su = componentiLocali(5e3, { modo: 'globaleY' }, a45);
    expect(su.qx).toBeCloseTo(-giu.qx, 9);
    expect(su.qy).toBeCloseTo(-giu.qy, 9);
  });

  it('locale e globale coincidono solo sull\'asta orizzontale', () => {
    const loc = componentiLocali(-8e3, { modo: 'localeOrtogonale' }, orizzontale);
    const glo = componentiLocali(-8e3, { modo: 'globaleY' }, orizzontale);
    expect(loc.qy).toBeCloseTo(glo.qy, 9);

    const locV = componentiLocali(-8e3, { modo: 'localeOrtogonale' }, verticale);
    const gloV = componentiLocali(-8e3, { modo: 'globaleY' }, verticale);
    expect(Math.abs(locV.qy - gloV.qy)).toBeGreaterThan(1e3);
  });
});

describe('risultante e punto di applicazione', () => {
  const g = { x1: 0, y1: 0, x2: 6, y2: 0, L: 6, c: 1, s: 0 };

  it('carico uniforme: R = q·L applicata in mezzeria', () => {
    const r = risultanteDistribuito(-10e3, -10e3, 0, 1, { modo: 'globaleY' }, g);
    expect(r.Fy).toBeCloseTo(-60e3, 6);
    expect(r.Fx).toBeCloseTo(0, 9);
    expect(r.x).toBeCloseTo(3, 9);
    expect(r.sApplicazione).toBeCloseTo(0.5, 9);
  });

  it('carico triangolare: R = q·L/2 a due terzi', () => {
    const r = risultanteDistribuito(0, -12e3, 0, 1, { modo: 'globaleY' }, g);
    expect(r.Fy).toBeCloseTo(-36e3, 6);
    expect(r.sApplicazione).toBeCloseTo(2 / 3, 9);
  });

  it('carico su un tratto parziale', () => {
    const r = risultanteDistribuito(-10e3, -10e3, 0.25, 0.75, { modo: 'globaleY' }, g);
    expect(r.lunghezzaCaricata).toBeCloseTo(3, 9);
    expect(r.Fy).toBeCloseTo(-30e3, 6);
    expect(r.x).toBeCloseTo(3, 9);
  });

  it('su falda inclinata, la proiezione riduce la risultante', () => {
    const falda = { x1: 0, y1: 0, x2: 4, y2: 4, L: Math.hypot(4, 4), c: Math.SQRT1_2, s: Math.SQRT1_2 };
    const perLunghezza = risultanteDistribuito(-10e3, -10e3, 0, 1, { modo: 'globaleY' }, falda);
    const perPianta = risultanteDistribuito(
      -10e3, -10e3, 0, 1, { modo: 'globaleY', perProiezione: true }, falda);
    expect(perLunghezza.Fy).toBeCloseTo(-10e3 * falda.L, 6);
    // in pianta la risultante è q per la proiezione orizzontale, cioè 4 m
    expect(perPianta.Fy).toBeCloseTo(-10e3 * 4, 6);
  });
});

describe('effetto sul calcolo', () => {
  function mensolaVerticale(d: { modo: 'localeOrtogonale' | 'globaleY' }): Progetto {
    const p = progetto('colonna');
    const sez = p.sezioneParametrica('s', preset('IPE 300'));
    const a = p.nodo(0, 0);
    const b = p.nodo(0, 4);
    const el = p.asta(a, b, 'S275', sez, { teoria: 'eulero-bernoulli' });
    p.vincolo(a, 'incastro');
    p.distribuito(el, 8e3, { modo: d.modo });
    return p.costruisci();
  }

  it('su asta verticale, ortogonale flette e verticale comprime', () => {
    const opz = (p: Progetto) => ({ sezioniExtra: p.sezioniPersonalizzate });
    const vento = mensolaVerticale({ modo: 'localeOrtogonale' });
    const peso = mensolaVerticale({ modo: 'globaleY' });

    const rv = analizzaCaso(vento, CASO, opz(vento));
    const rp = analizzaCaso(peso, CASO, opz(peso));

    // vento: reazione orizzontale qH e momento qH²/2
    const Rv = rv.reazioni[0];
    expect(Math.abs(Rv.fx)).toBeCloseTo(8e3 * 4, 3);
    expect(Math.abs(Rv.mz)).toBeCloseTo((8e3 * 16) / 2, 3);

    // carico verticale su colonna: solo sforzo normale, nessun momento
    const Rp = rp.reazioni[0];
    expect(Math.abs(Rp.fx)).toBeLessThan(1e-6);
    expect(Rp.fy).toBeCloseTo(-8e3 * 4, 3);
    expect(Math.abs(Rp.mz)).toBeLessThan(1e-6);
  });

  it('carico ad angolo arbitrario: componenti coerenti col versore', () => {
    const p = progetto('obliquo');
    const sez = p.sezioneParametrica('s', preset('IPE 300'));
    const a = p.nodo(0, 0);
    const b = p.nodo(5, 0);
    const el = p.asta(a, b, 'S275', sez, { teoria: 'eulero-bernoulli' });
    p.vincolo(a, 'incastro');
    const alpha = Math.PI / 3;
    p.distribuito(el, 6e3, { modo: 'angolo', alpha });
    const prog = p.costruisci();
    const r = analizzaCaso(prog, CASO, { sezioniExtra: prog.sezioniPersonalizzate });
    const R = r.reazioni[0];
    // la risultante è 6 kN/m × 5 m diretta a 60°
    expect(R.fx).toBeCloseTo(-30e3 * Math.cos(alpha), 3);
    expect(R.fy).toBeCloseTo(-30e3 * Math.sin(alpha), 3);
  });
});

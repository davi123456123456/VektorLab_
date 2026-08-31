/**
 * §5 — i modi locali dei carichi distribuiti spariscono dal selettore e
 * vengono convertiti, non scartati.
 */

import { describe, it, expect } from 'vitest';
import { progetto } from '../../src/core/builder.js';
import { preset } from '../../src/core/materials/sezioniParametriche.js';
import { migra } from '../../src/core/index.js';
import { MODI_RIFERIMENTO, versoreGlobale } from '../../src/core/model/direzioni.js';
import { analizzaCaso } from '../../src/core/index.js';
import type { LoadCaseId, Progetto } from '../../src/core/model/types.js';

const CASO = 'principale' as LoadCaseId;

/** Mensola inclinata di 30°, con un carico perpendicolare al suo asse. */
function inclinata(modo: 'localeOrtogonale' | 'localeAssiale'): Progetto {
  const p = progetto('inclinata');
  const sez = p.sezioneParametrica('s', preset('IPE 200'));
  const a = p.nodo(0, 0);
  const L = 4;
  const b = p.nodo(L * Math.cos(Math.PI / 6), L * Math.sin(Math.PI / 6));
  const asta = p.asta(a, b, 'S275', sez);
  p.vincolo(a, 'incastro');
  p.distribuito(asta, -8e3, { modo });
  return p.costruisci();
}

describe('selettore', () => {
  it('non offre più i modi locali', () => {
    const modi = MODI_RIFERIMENTO.map((m) => m.modo);
    expect(modi).not.toContain('localeOrtogonale');
    expect(modi).not.toContain('localeAssiale');
  });

  it('offre esattamente globale X, globale Y e angolo libero', () => {
    expect(MODI_RIFERIMENTO.map((m) => m.modo)).toEqual(['globaleX', 'globaleY', 'angolo']);
  });
});

describe('migrazione dei modelli già salvati', () => {
  it('localeOrtogonale diventa l angolo assoluto equivalente', () => {
    const m = migra(inclinata('localeOrtogonale'));
    const c = m.carichi[0];
    expect(c.tipo).toBe('distribuito');
    if (c.tipo !== 'distribuito') return;
    expect(c.direzione.modo).toBe('angolo');
    // asta a 30°, perpendicolare a 120°
    expect(((c.direzione.alpha ?? 0) * 180) / Math.PI).toBeCloseTo(120, 9);
  });

  it('localeAssiale diventa la direzione dell asse', () => {
    const m = migra(inclinata('localeAssiale'));
    const c = m.carichi[0];
    if (c.tipo !== 'distribuito') return;
    expect(c.direzione.modo).toBe('angolo');
    expect(((c.direzione.alpha ?? 0) * 180) / Math.PI).toBeCloseTo(30, 9);
  });

  it('il versore risultante è IDENTICO a quello di prima', () => {
    for (const modo of ['localeOrtogonale', 'localeAssiale'] as const) {
      const p = inclinata(modo);
      const m = migra(p);
      const asse = { c: Math.cos(Math.PI / 6), s: Math.sin(Math.PI / 6) };
      const prima = versoreGlobale({ modo }, asse);
      const c = m.carichi[0];
      if (c.tipo !== 'distribuito') continue;
      const dopo = versoreGlobale(c.direzione, asse);
      expect(dopo[0]).toBeCloseTo(prima[0], 12);
      expect(dopo[1]).toBeCloseTo(prima[1], 12);
    }
  });

  it('e l analisi dà gli stessi identici risultati', () => {
    // è la verifica che conta: convertire non deve cambiare la struttura
    const p = inclinata('localeOrtogonale');
    const r = analizzaCaso(p, CASO);
    const rm = analizzaCaso(migra(p), CASO);
    expect(rm.aste[0].estremi.Mmax).toBeCloseTo(r.aste[0].estremi.Mmax, 9);
    expect(rm.aste[0].estremi.Mmin).toBeCloseTo(r.aste[0].estremi.Mmin, 9);
    expect(rm.reazioni[0].fx).toBeCloseTo(r.reazioni[0].fx, 9);
    expect(rm.reazioni[0].fy).toBeCloseTo(r.reazioni[0].fy, 9);
  });

  it('è idempotente: una seconda migrazione non cambia nulla', () => {
    const una = migra(inclinata('localeOrtogonale'));
    expect(migra(una)).toBe(una);
  });
});

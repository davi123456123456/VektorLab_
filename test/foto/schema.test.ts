import { describe, it, expect } from 'vitest';
import { schemaInProgetto, type SchemaGenerato } from '../../src/foto/schema.js';
import { confronta } from '../../src/foto/confronto.js';
import { atteso20 } from './attesi.js';

/** l'es. 20 scritto come lo scriverebbe il generatore */
const es20: SchemaGenerato = {
  famiglia: 'portale',
  nodi: [[0, 0], [0, 1], [0, 2], [1, 2], [2, 2], [2, 0]],
  aste: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [1, 5]],
  vincoli: [{ nodo: 0, tipo: 'cerniera', angolo: 0 }, { nodo: 5, tipo: 'carrello', angolo: 0 }],
  sconnessioni: [
    { nodo: 1, tipo: 'cerniera', svincolate: [5] },
    { nodo: 3, tipo: 'cerniera', svincolate: null },
    { nodo: 5, tipo: 'cerniera', svincolate: null },
  ],
  carichi: [{ tipo: 'distribuito', asta: 3, s1: 0, s2: 1, direzione: -90, coefficiente: 1 }],
};

const trave = (carichi: SchemaGenerato['carichi']): SchemaGenerato => ({
  famiglia: 'trave', nodi: [[0, 0], [2, 0]], aste: [[0, 1]],
  vincoli: [{ nodo: 0, tipo: 'incastro', angolo: 270 }], sconnessioni: [], carichi,
});

describe('dallo schema del generatore al Progetto', () => {
  it('l\'es. 20 diventa esattamente il modello atteso', () => {
    const c = confronta(schemaInProgetto(es20), atteso20());
    expect(c.differenze).toEqual([]);
  });

  it('la sconnessione parziale svincola solo l\'asta elencata', () => {
    const p = schemaInProgetto(es20);
    const b = p.vincoliInterni.find((v) => v.asteSvincolate);
    expect(b?.asteSvincolate).toEqual([p.aste[5].id]);
    expect(b?.astaMaster).toBe(p.aste[0].id);
  });

  it('distribuito a −90° di coefficiente 2: −2000 N/m in verticale', () => {
    const p = schemaInProgetto(trave([
      { tipo: 'distribuito', asta: 0, s1: 0, s2: 1, direzione: -90, coefficiente: 2 },
    ]));
    expect(p.carichi[0]).toMatchObject({ tipo: 'distribuito', q1: -2000, direzione: { modo: 'globaleY' } });
  });

  it('forza in campata a 180°: −1000 N in assi globali', () => {
    const p = schemaInProgetto(trave([{ tipo: 'forza', asta: 0, s: 0.5, direzione: 180, coefficiente: 1 }]));
    expect(p.carichi[0]).toMatchObject({ tipo: 'forzaInCampata', fx: -1000, fy: 0, riferimento: 'globale' });
  });
});

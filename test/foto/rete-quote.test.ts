import { describe, expect, it } from 'vitest';
import { confronta } from '../../src/foto/confronto.js';
import { leggi } from '../../src/foto/index.js';
import { decodifica } from '../../src/foto/rete/decodifica.js';
import { agganciaQuote } from '../../src/foto/rete/quote.js';
import { schemaInProgetto } from '../../src/foto/schema.js';
import type { Primitive, Punto } from '../../src/foto/tipi.js';
import { caricaIdeale, nomiIdeali } from './aiuti-rete.js';

/** Gli estremi di ogni quota spostati verso l'interno di `px`, come li regredisce la rete. */
function stringi(p: Primitive, px: number): Primitive {
  return {
    ...p,
    scritte: p.scritte.map((s) => {
      if (!s.estremi) return s;
      const [a, b] = s.estremi;
      const l = Math.hypot(b.x - a.x, b.y - a.y);
      const u = { x: (b.x - a.x) / l, y: (b.y - a.y) / l };
      const e: [Punto, Punto] = [{ x: a.x + u.x * px, y: a.y + u.y * px }, { x: b.x - u.x * px, y: b.y - u.y * px }];
      return { ...s, estremi: e };
    }),
  };
}

describe('aggancio degli estremi delle quote', () => {
  const ritagli = nomiIdeali().filter((n) => n.startsWith('ideale-20000'));

  it('con estremi spostati di 12 px la lettura torna esatta', () => {
    let senza = 0, con = 0;
    for (const nome of ritagli) {
      const f = caricaIdeale(nome);
      const atteso = schemaInProgetto(f.schema);
      const p = stringi(decodifica(f.uscite, { larghezza: f.larghezza, altezza: f.altezza }), 12);
      senza += +confronta(leggi(p).progetto, atteso).perfetto;
      con += +confronta(leggi(agganciaQuote(p)).progetto, atteso).perfetto;
    }
    expect(senza).toBeLessThan(9); // il caso è vero: senza aggancio si sbaglia
    expect(con).toBeGreaterThanOrEqual(9);
  });

  it('i due estremi non finiscono sullo stesso punto', () => {
    const p: Primitive = {
      larghezza: 300, altezza: 200, pallini: [], corpi: [], frecce: [], momenti: [], nodi: [],
      aste: [{ a: { x: 100, y: 100 }, b: { x: 200, y: 100 }, spessore: 3, confidenza: 1 }],
      scritte: [{ centro: { x: 150, y: 60 }, valore: { famiglia: 'L', valore: 1 }, confidenza: 1,
        estremi: [{ x: 196, y: 70 }, { x: 205, y: 70 }] }],
    };
    const [a, b] = agganciaQuote(p).scritte[0].estremi!;
    expect(a.x).not.toBe(b.x);
  });
});

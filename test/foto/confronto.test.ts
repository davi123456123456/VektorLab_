import { describe, it, expect } from 'vitest';
import { progetto } from '../../src/core/builder.js';
import type { Progetto } from '../../src/core/model/types.js';
import { confronta } from '../../src/foto/confronto.js';

const MAT = 'S275';
const SEZ = 'IPE 300';

interface Varianti {
  dx?: number; dy?: number;
  senzaCarrello?: boolean;
  cernieraAlPosto?: boolean;
  carrelloGirato?: boolean;
  versoInvertito?: boolean;
  cernieraInterna?: boolean;
}

/** trave 0–4 con cerniera in A, carrello in mezzeria (su asta), carrello in B, q verso il basso */
function trave(v: Varianti = {}): Progetto {
  const [dx, dy] = [v.dx ?? 0, v.dy ?? 0];
  const p = progetto('trave');
  const a = p.nodo(dx, dy);
  const b = p.nodo(4 + dx, dy);
  const asta = p.asta(a, b, MAT, SEZ);
  p.vincolo(a, 'cerniera');
  if (!v.senzaCarrello) p.vincoloSuAsta(asta, 0.5, v.cernieraAlPosto ? 'cerniera' : 'carrello');
  p.vincolo(b, 'carrello', v.carrelloGirato ? Math.PI / 2 : 0);
  p.distribuito(asta, v.versoInvertito ? 1000 : -1000);
  if (v.cernieraInterna) p.sconnessione(asta, 0.25, 'cerniera');
  return p.costruisci();
}

describe('confronto fra il modello letto e quello atteso', () => {
  it('modello identico: nessuna correzione', () => {
    const c = confronta(trave(), trave());
    expect(c.correzioni).toBe(0);
    expect(c.perfetto).toBe(true);
  });

  it('copia traslata: nessuna correzione', () => {
    expect(confronta(trave({ dx: 5, dy: 3 }), trave()).correzioni).toBe(0);
  });

  it('carrello mancante: una correzione', () => {
    const c = confronta(trave({ senzaCarrello: true }), trave());
    expect(c.correzioni).toBe(1);
    expect(c.perCategoria.vincoli).toEqual({ attesi: 3, trovati: 2, giusti: 2 });
  });

  it('cerniera al posto del carrello: una correzione', () => {
    expect(confronta(trave({ cernieraAlPosto: true }), trave()).correzioni).toBe(1);
  });

  it('carrello girato di 90°: una correzione di orientamento', () => {
    const c = confronta(trave({ carrelloGirato: true }), trave());
    expect(c.correzioni).toBe(1);
    expect(c.perCategoria.orientamenti.giusti).toBe(c.perCategoria.orientamenti.attesi - 1);
  });

  it('vincolo su asta e asta spezzata con il vincolo sul nodo sono lo stesso modello', () => {
    const p = progetto('spezzata');
    const a = p.nodo(0, 0);
    const m = p.nodo(2, 0);
    const b = p.nodo(4, 0);
    const a1 = p.asta(a, m, MAT, SEZ);
    const a2 = p.asta(m, b, MAT, SEZ);
    p.vincolo(a, 'cerniera');
    p.vincolo(m, 'carrello');
    p.vincolo(b, 'carrello');
    p.distribuito(a1, -1000);
    p.distribuito(a2, -1000);
    expect(confronta(p.costruisci(), trave()).correzioni).toBe(0);
  });

  it('distribuito col verso invertito: una correzione', () => {
    expect(confronta(trave({ versoInvertito: true }), trave()).correzioni).toBe(1);
  });

  it('cerniera interna in più: una correzione', () => {
    const c = confronta(trave({ cernieraInterna: true }), trave());
    expect(c.correzioni).toBe(1);
    expect(c.differenze.join(' ')).toMatch(/cerniera/);
  });
});

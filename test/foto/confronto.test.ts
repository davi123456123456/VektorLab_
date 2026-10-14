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

  it('cerniera parziale che svincola l\'asta sbagliata: una correzione', () => {
    const telaio = (svincolata: 'colonna' | 'diagonale'): Progetto => {
      const p = progetto('b');
      const a = p.nodo(0, 0);
      const b = p.nodo(0, 1);
      const c = p.nodo(0, 2);
      const g = p.nodo(2, 0);
      const ab = p.asta(a, b, MAT, SEZ);
      const bc = p.asta(b, c, MAT, SEZ);
      const bg = p.asta(b, g, MAT, SEZ);
      p.vincolo(a, 'cerniera');
      p.vincolo(g, 'carrello');
      p.sconnessioneNodale(b, 'cerniera', {
        astaMaster: ab, asteSvincolate: [svincolata === 'colonna' ? bc : bg],
      });
      return p.costruisci();
    };
    expect(confronta(telaio('colonna'), telaio('diagonale')).correzioni).toBe(1);
  });

  it('colonna che tocca la trave senza esserle collegata non è un incrocio a T', () => {
    const collegata = progetto('T');
    const a = collegata.nodo(0, 1);
    const t = collegata.nodo(1, 1);
    const b = collegata.nodo(2, 1);
    const piede = collegata.nodo(1, 0);
    collegata.asta(a, t, MAT, SEZ);
    collegata.asta(t, b, MAT, SEZ);
    collegata.asta(piede, t, MAT, SEZ);
    const staccata = progetto('staccata');
    const a2 = staccata.nodo(0, 1);
    const b2 = staccata.nodo(2, 1);
    const t2 = staccata.nodo(1, 1);
    const piede2 = staccata.nodo(1, 0);
    staccata.asta(a2, b2, MAT, SEZ);
    staccata.asta(piede2, t2, MAT, SEZ);
    expect(confronta(staccata.costruisci(), collegata.costruisci()).correzioni).toBeGreaterThan(0);
  });

  it('distribuiti su aste orientate testa a testa sono lo stesso carico', () => {
    const versi = (testaATesta: boolean): Progetto => {
      const p = progetto('v');
      const a = p.nodo(0, 0);
      const b = p.nodo(1, 0);
      const c = p.nodo(2, 0);
      const ab = testaATesta ? p.asta(b, a, MAT, SEZ) : p.asta(a, b, MAT, SEZ);
      const bc = p.asta(b, c, MAT, SEZ);
      p.vincolo(a, 'incastro');
      p.distribuito(ab, -1000);
      p.distribuito(bc, -1000);
      return p.costruisci();
    };
    expect(confronta(versi(true), versi(false)).correzioni).toBe(0);
  });

  it('cerniera interna in più: una correzione', () => {
    const c = confronta(trave({ cernieraInterna: true }), trave());
    expect(c.correzioni).toBe(1);
    expect(c.differenze.join(' ')).toMatch(/cerniera/);
  });
});

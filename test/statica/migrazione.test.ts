/**
 * Lettura dei file salvati con il formato precedente.
 *
 * Il modello dei carichi è cambiato — da due componenti (qx, qy) a intensità
 * più direzione — e i file scritti prima devono continuare ad aprirsi dando
 * ESATTAMENTE gli stessi risultati. È l'unico modo per poter cambiare un
 * formato senza tradire chi ha già salvato qualcosa.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { migra, VERSIONE_FORMATO, analizzaCaso } from '../../src/core/index.js';
import type { LoadCaseId, Progetto } from '../../src/core/model/types.js';
import { versoreGlobale } from '../../src/core/model/direzioni.js';

const CASO = 'principale' as LoadCaseId;

function fixture(nome: string): Progetto {
  return JSON.parse(readFileSync(`fixtures/${nome}`, 'utf-8')) as Progetto;
}

describe('formato 1 → 2', () => {
  it('il distribuito con componenti diventa intensità più direzione', () => {
    const p = migra(fixture('gerber.strut'));
    expect(p.versioneFormato).toBe(VERSIONE_FORMATO);
    for (const c of p.carichi) {
      if (c.tipo !== 'distribuito') continue;
      expect(c.direzione, 'carico senza direzione').toBeDefined();
      // Erano qy = −15 kN/m in riferimento locale. §5 ha tolto i modi locali:
      // la migrazione li converte nell'angolo assoluto EQUIVALENTE, quindi il
      // modo cambia ma la direzione risultante no.
      expect(c.direzione.modo).toBe('angolo');
      expect(c.q1).toBeCloseTo(-15e3, 6);
      expect(c.q2).toBeCloseTo(-15e3, 6);

      // la verifica che conta: stesso versore di prima della conversione
      const a = p.aste.find((x) => x.id === c.astaId)!;
      const i = p.nodi.find((n) => n.id === a.nodoIniziale)!;
      const j = p.nodi.find((n) => n.id === a.nodoFinale)!;
      const L = Math.hypot(j.x - i.x, j.y - i.y);
      const asse = { c: (j.x - i.x) / L, s: (j.y - i.y) / L };
      const atteso = versoreGlobale({ modo: 'localeOrtogonale' }, asse);
      const ottenuto = versoreGlobale(c.direzione, asse);
      expect(ottenuto[0]).toBeCloseTo(atteso[0], 12);
      expect(ottenuto[1]).toBeCloseTo(atteso[1], 12);
    }
  });

  it('è idempotente: rileggerla non cambia più nulla', () => {
    const una = migra(fixture('gerber.strut'));
    const due = migra(una);
    expect(due).toBe(una);          // stessa identità: nessuna copia inutile
  });

  it('i risultati del file vecchio sono quelli attesi', () => {
    // Gerber A(0)–G(6)–B(8)–C(12) con q = 15 kN/m: valori noti a mano
    const r = analizzaCaso(fixture('gerber.strut'), CASO);
    const reaz = (n: string) => r.reazioni.find((x) => (x.nodoId as unknown as string) === n)!;
    expect(reaz('A').fy).toBeCloseTo(45e3, 2);
    expect(reaz('B').fy).toBeCloseTo(135e3, 2);
    expect(reaz('C').fy).toBeCloseTo(0, 2);
  });

  it('un carico obliquo viene spezzato in due, senza approssimare', () => {
    const base = fixture('gerber.strut');
    const p: Progetto = {
      ...base,
      carichi: [{
        tipo: 'distribuito', id: 'c9', casoId: CASO, astaId: 'a1',
        riferimento: 'globale',
        sIniziale: 0, sFinale: 1,
        qxIniziale: 3000, qxFinale: 3000,
        qyIniziale: -4000, qyFinale: -4000,
      } as never],
    };
    const m = migra(p);
    expect(m.carichi.length).toBe(2);
    const modi = m.carichi.map((c) => (c.tipo === 'distribuito' ? c.direzione.modo : ''));
    expect(modi).toContain('globaleY');
    expect(modi).toContain('globaleX');
    const y = m.carichi.find(
      (c) => c.tipo === 'distribuito' && c.direzione.modo === 'globaleY')!;
    const x = m.carichi.find(
      (c) => c.tipo === 'distribuito' && c.direzione.modo === 'globaleX')!;
    expect((y as { q1: number }).q1).toBeCloseTo(-4000, 9);
    expect((x as { q1: number }).q1).toBeCloseTo(3000, 9);
    // e gli id restano distinti, altrimenti selezionarli sarebbe ambiguo
    expect(m.carichi[0].id).not.toBe(m.carichi[1].id);
  });

  it('un file già nel formato nuovo non viene toccato', () => {
    const p = migra(fixture('gerber.strut'));
    expect(migra(p).carichi).toBe(p.carichi);
  });
});

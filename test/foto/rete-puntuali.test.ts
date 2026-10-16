import { describe, expect, it } from 'vitest';
import { decodificaPuntuali } from '../../src/foto/rete/puntuali.js';
import { VERSO_INCERTO } from '../../src/foto/tipi.js';
import type { Uscite } from '../../src/foto/rete/tensori.js';
import * as V from '../../src/foto/rete/vocabolario.js';
import type { Punto } from '../../src/foto/tipi.js';
import { caricaIdeale, nomiIdeali } from './aiuti-rete.js';

const GRADI = Math.PI / 180;
const dist = (a: Punto, b: Punto) => Math.hypot(a.x - b.x, a.y - b.y);
const diffAngolo = (a: number, b: number) => Math.abs(((a - b + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
const diffAsse = (a: number, b: number) => Math.min(diffAngolo(a, b), diffAngolo(a, b + Math.PI));

function indiceScritta(v: { famiglia: string; valore?: number; coefficiente?: number }): number {
  return V.SCRITTE.findIndex((s) => s.famiglia === v.famiglia && s.valore === (v.valore ?? v.coefficiente));
}

describe('decodifica dei punti sulle uscite ideali', () => {
  for (const nome of nomiIdeali()) {
    it(nome, () => {
      const f = caricaIdeale(nome);
      const giu = (q: Punto): Punto => ({ x: q.x, y: f.altezza - q.y });
      const d = decodificaPuntuali(f.uscite);
      const p = f.primitive;

      for (const q of p.pallini) {
        const t = d.pallini.find((x) => dist(x.c, giu(q.c)) <= 4);
        expect(t, `pallino ${JSON.stringify(q.c)}`).toBeDefined();
        expect(Math.abs(t!.r - q.r)).toBeLessThan(1);
      }
      for (const k of p.corpi) {
        const t = d.corpi.find((x) => x.tipo === k.tipo && dist(x.attacco, giu(k.attacco)) <= 4);
        expect(t, `corpo ${k.tipo}`).toBeDefined();
        const interno = k.tipo === 'doppioPendoloInterno' || k.tipo === 'pattinoInterno';
        expect((interno ? diffAsse : diffAngolo)(t!.angolo, k.angolo)).toBeLessThan(3 * GRADI);
      }
      for (const fr of p.frecce) {
        const t = d.frecce.find((x) => dist(x.punta, giu(fr.punta)) <= 4);
        expect(t, `freccia ${JSON.stringify(fr.punta)}`).toBeDefined();
        expect(diffAngolo(t!.direzione, fr.direzione)).toBeLessThan(3 * GRADI);
        expect(Math.abs(t!.lunghezza - fr.lunghezza)).toBeLessThan(3);
      }
      // le punte degli archi dei momenti non diventano frecce
      expect(d.frecce).toHaveLength(p.frecce.length);
      for (const m of p.momenti) {
        const t = d.momenti.find((x) => dist(x.centro, giu(m.centro)) <= 4);
        expect(t, `momento ${JSON.stringify(m.centro)}`).toBeDefined();
        expect(t!.verso).toBe(m.verso);
        expect(t!.raggio).toBeGreaterThan(0);
      }
      for (const s of p.scritte) {
        const k = indiceScritta(s.valore as never);
        if (k < 0) continue;
        const t = d.scritte.find((x) => dist(x.centro, giu(s.centro)) <= 4);
        expect(t, `scritta ${JSON.stringify(s.valore)}`).toBeDefined();
        expect(indiceScritta(t!.valore as never)).toBe(k);
        if (s.estremi) {
          const [a, b] = s.estremi.map(giu);
          const [x, y] = t!.estremi!;
          const diretti = Math.max(dist(x, a), dist(y, b));
          const scambiati = Math.max(dist(x, b), dist(y, a));
          expect(Math.min(diretti, scambiati)).toBeLessThan(4);
        }
      }
    });
  }
});

describe('punta del momento accanto a una forza', () => {
  it('il momento prende la punta più vicina, la forza resta', () => {
    const h4 = 40, w4 = 40, n = h4 * w4;
    const u: Uscite = { seg: new Uint8Array(80 * 80), h2: 80, w2: 80, testa: new Float32Array(V.CANALI * n), h4, w4 };
    const metti = (k: number, i: number, j: number, v: number) => { u.testa[k * n + i * w4 + j] = v; };
    // centro del momento nella cella (20, 20): (81.5, 81.5) px
    metti(V.MOMENTO0, 20, 20, 0.9);
    metti(V.MOMENTO0 + 1, 20, 20, 0.8);
    // punta dell'arco 20 px a destra del centro, diretta verso l'alto (y su): antiorario
    metti(V.FRECCIA, 20, 25, 0.9);
    metti(V.COS_FRECCIA, 20, 25, 0);
    metti(V.SIN_FRECCIA, 20, 25, 1);
    // punta di una forza 28 px sotto il centro, diretta verso il basso
    metti(V.FRECCIA, 27, 20, 0.95);
    metti(V.COS_FRECCIA, 27, 20, 0);
    metti(V.SIN_FRECCIA, 27, 20, -1);
    metti(V.LUNG_FRECCIA, 27, 20, 0.6);
    const d = decodificaPuntuali(u);
    expect(d.momenti).toHaveLength(1);
    expect(d.momenti[0].verso).toBe('antiorario');
    expect(d.momenti[0].raggio).toBeCloseTo(20, 5);
    expect(d.frecce).toHaveLength(1);
    expect(d.frecce[0].punta).toEqual({ x: 81.5, y: 109.5 });
    expect(d.frecce[0].lunghezza).toBeCloseTo(60, 4);
  });
});

describe('momento e forza sullo stesso nodo', () => {
  const vuote = (): Uscite => ({ seg: new Uint8Array(80 * 80), h2: 80, w2: 80, testa: new Float32Array(V.CANALI * 1600), h4: 40, w4: 40 });
  const metti = (u: Uscite, k: number, i: number, j: number, v: number) => { u.testa[k * 1600 + i * 40 + j] = v; };

  it('una punta radiale (la forza) non diventa la punta dell\'arco', () => {
    const u = vuote();
    metti(u, V.MOMENTO0, 20, 20, 0.9);
    // forza che punta verso il basso sul nodo: punta 8 px sotto il centro, direzione radiale
    metti(u, V.FRECCIA, 22, 20, 0.95);
    metti(u, V.SIN_FRECCIA, 22, 20, -1);
    metti(u, V.LUNG_FRECCIA, 22, 20, 0.5);
    // punta dell'arco 20 px a destra, tangente (verso l'alto): antiorario
    metti(u, V.FRECCIA, 20, 25, 0.9);
    metti(u, V.SIN_FRECCIA, 20, 25, 1);
    const d = decodificaPuntuali(u);
    expect(d.momenti).toHaveLength(1);
    expect(d.momenti[0].verso).toBe('antiorario');
    expect(d.momenti[0].raggio).toBeCloseTo(20, 5);
    expect(d.frecce).toHaveLength(1);
    expect(d.frecce[0].punta).toEqual({ x: 81.5, y: 89.5 });
  });

  it('un momento senza punta resta, con il verso incerto', () => {
    const u = vuote();
    metti(u, V.MOMENTO0 + 1, 20, 20, 0.8);
    const d = decodificaPuntuali(u);
    expect(d.momenti).toHaveLength(1);
    expect(d.momenti[0].confidenza).toBeLessThan(VERSO_INCERTO);
  });
});

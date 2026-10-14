import { describe, it, expect } from 'vitest';
import { costruisciGrafo } from '../../src/foto/letture/grafo.js';
import { leggiCarichi } from '../../src/foto/letture/carichi.js';
import { associaQuote, misura } from '../../src/foto/metrica.js';
import { tolleranze } from '../../src/foto/parametri.js';
import type { Grafo, Punto } from '../../src/foto/tipi.js';
import { disegno, RAGGIO, type Disegno } from './aiuti.js';

const misurato = (d: Disegno): Grafo => {
  const p = d.primitive();
  const tol = tolleranze(p);
  const g = costruisciGrafo(p, tol);
  leggiCarichi(g, p, tol);
  associaQuote(g, p, tol);
  misura(g, tol);
  return g;
};
/** posizioni in L, ordinate per x e poi per y */
const posizioni = (g: Grafo): Punto[] => g.punti.map((p) => p.pos!)
  .sort((a, b) => a.x - b.x || a.y - b.y);
const codici = (g: Grafo) => g.avvisi.map((a) => a.codice);
const vicine = (ottenute: Punto[], attese: [number, number][]) => {
  expect(ottenute).toHaveLength(attese.length);
  ottenute.forEach((p, i) => {
    expect(p.x).toBeCloseTo(attese[i][0], 9);
    expect(p.y).toBeCloseTo(attese[i][1], 9);
  });
};

describe('le quote misurano tratti', () => {
  it('es. 19: trave disegnata storta, quote L L L → appoggi a 0, 1, 2, 3', () => {
    const g = misurato(disegno().asta(0, 0, 3.1, 0)
      .appoggio('triangoloRulli', 1.2, 0, 0).appoggio('triangolo', 1.9, 0, 0)
      .appoggio('triangoloRulli', 3.1, 0, 0)
      .quota(1, 0, -0.5, 1.2, -0.5).quota(1, 1.2, -0.5, 1.9, -0.5).quota(1, 1.9, -0.5, 3.1, -0.5));
    vicine(posizioni(g), [[0, 0], [1, 0], [2, 0], [3, 0]]);
    expect(codici(g)).not.toContain('quoteIncoerenti');
  });

  it('schema tipo 18: quote L/2 in verticale e L/2, L/2, L in orizzontale', () => {
    const g = misurato(disegno()
      .asta(0, 0.6, 0, 0).asta(0, 0, 0.45, 0).asta(0.45, 0, 0.45, 1.1)
      .asta(0.45, 1.1, 1.0, 1.1).asta(1.0, 1.1, 2.1, 1.1).cerniera(1.0, 1.1)
      .asta(2.1, 1.1, 2.1, 2.0)
      .quota(0.5, -0.5, 0, -0.5, 0.6).quota(0.5, -0.5, 0.6, -0.5, 1.1)
      .quota(0.5, 0, -0.5, 0.45, -0.5).quota(0.5, 0.45, -0.5, 1.0, -0.5)
      .quota(1, 1.0, -0.5, 2.1, -0.5).quota(1, 2.6, 1.1, 2.6, 2.0));
    vicine(posizioni(g), [[0, 0], [0, 0.5], [0.5, 0], [0.5, 1], [1, 1], [2, 1], [2, 2]]);
  });

  it('es. 20: la diagonale senza quota discende dalla geometria', () => {
    const k = 1.3; // disegno stirato in orizzontale
    const g = misurato(disegno()
      .asta(0, 0, 0, 2).asta(0, 2, 1 * k, 2).asta(1 * k, 2, 2 * k, 2).cerniera(1 * k, 2)
      .asta(2 * k, 2, 2 * k, 0).asta(RAGGIO, 1, 2 * k, 0).cerniera(RAGGIO, 1)
      .quota(1, -0.3, 0, -0.3, 1).quota(1, -0.3, 1, -0.3, 2)
      .quota(1, 0, 2.3, 1 * k, 2.3).quota(1, 1 * k, 2.3, 2 * k, 2.3));
    const pos = posizioni(g);
    expect(pos).toContainEqual({ x: 0, y: 1 });
    expect(pos).toContainEqual({ x: 2, y: 0 });
  });

  it('un totale sopra due parziali coerenti non dà avvisi; incoerente sì', () => {
    const base = () => disegno().asta(0, 0, 2, 0).appoggio('triangoloRulli', 1, 0, 0)
      .quota(1, 0, -0.5, 1, -0.5).quota(1, 1, -0.5, 2, -0.5);
    expect(codici(misurato(base().quota(2, 0, -1, 2, -1)))).not.toContain('quoteIncoerenti');
    expect(codici(misurato(base().quota(3, 0, -1, 2, -1)))).toContain('quoteIncoerenti');
  });

  it('un tratto non quotato si misura in proporzione, arrotondato a L/2', () => {
    const g = misurato(disegno().asta(0, 0, 2.5, 0).appoggio('triangoloRulli', 1, 0, 0)
      .quota(1, 0, -0.5, 1, -0.5));
    vicine(posizioni(g), [[0, 0], [1, 0], [2.5, 0]]);
  });

  it('una quota L/3 rende il passo un sesto', () => {
    const g = misurato(disegno().asta(0, 0, 1, 0).appoggio('triangoloRulli', 0.33, 0, 0)
      .quota(1 / 3, 0, -0.5, 0.33, -0.5).quota(1, 0, -1, 1, -1));
    vicine(posizioni(g), [[0, 0], [1 / 3, 0], [1, 0]]);
  });

  it('quota lungo un\'asta inclinata: la lunghezza è quella dell\'asta', () => {
    const g = misurato(disegno().asta(0, 0, 1, 1).quota(1, 0, 0, 1, 1));
    const [a, b] = posizioni(g);
    expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeCloseTo(1, 9);
    expect(b.x - a.x).toBeCloseTo(b.y - a.y, 9);
  });
});

describe('senza quote, e casi difficili', () => {
  it('nessuna quota: la campata tipica vale L, con un avviso', () => {
    const g = misurato(disegno().asta(0, 0, 0, 1).asta(0, 1, 2, 1));
    vicine(posizioni(g), [[0, 0], [0, 1], [2, 1]]);
    expect(codici(g)).toContain('nessunaQuota');
  });

  it('una trave lunga fotografata storta di 5° resta orizzontale', () => {
    const g = misurato(disegno().asta(0, 0, 3, 0)
      .appoggio('triangolo', 0, 0, 0).appoggio('triangoloRulli', 3, 0, 0)
      .quota(3, 0, -0.5, 3, -0.5).ruota(5));
    vicine(posizioni(g), [[0, 0], [3, 0]]);
  });

  it('dopo un\'asta inclinata quotata lungo di sé, la successiva conserva la sua quota', () => {
    const c = Math.cos(Math.PI / 6);
    const s = Math.sin(Math.PI / 6);
    const g = misurato(disegno().asta(0, 0, c, s).asta(c, s, c + 1, s)
      .quota(1, 0, 0, c, s).quota(1, c, s + 0.5, c + 1, s + 0.5));
    const [, b, d] = posizioni(g);
    expect(d.x - b.x).toBeCloseTo(1, 9);
    expect(Math.hypot(b.x, b.y)).toBeCloseTo(1, 9);
  });

  it('un\'asta a quasi 45° si aggancia a 45°', () => {
    const g = misurato(disegno().asta(0, 0, 1, 1.26).quota(1, 0, -0.5, 1, -0.5));
    const [a, b] = posizioni(g);
    expect(b.x - a.x).toBeCloseTo(1, 9);
    expect(b.y - a.y).toBeCloseTo(1, 9);
  });

  it('un punto in campata su un\'asta inclinata resta sulla sua retta', () => {
    const g = misurato(disegno().asta(0, 0, 2, 1).freccia(0.6, 0.3, -90)
      .quota(2, 0, -0.5, 2, -0.5).quota(1, 2.5, 0, 2.5, 1));
    const [a, m, b] = posizioni(g);
    const t = (m.x - a.x) / (b.x - a.x);
    expect(m.y - a.y).toBeCloseTo(t * (b.y - a.y), 9);
  });

  it('una quota che non tocca nessun punto si scarta con un avviso', () => {
    const g = misurato(disegno().asta(0, 0, 1, 0).quota(1, 5, -0.5, 6, -0.5));
    expect(codici(g)).toContain('quotaNonLetta');
    expect(g.quote).toEqual([]);
  });
});

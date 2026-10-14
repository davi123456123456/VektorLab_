import { describe, it, expect } from 'vitest';
import { costruisciGrafo, inserisciPunto } from '../../src/foto/letture/grafo.js';
import { tolleranze } from '../../src/foto/parametri.js';
import type { Grafo } from '../../src/foto/tipi.js';
import { disegno, RAGGIO, type Disegno } from './aiuti.js';

const grafo = (d: Disegno): Grafo => {
  const p = d.primitive();
  return costruisciGrafo(p, tolleranze(p));
};
const grado = (g: Grafo, id: string): number =>
  g.tratti.filter((t) => t.i === id || t.j === id).length;
const conGrado = (g: Grafo, n: number): string[] =>
  g.punti.filter((p) => grado(g, p.id) === n).map((p) => p.id);

describe('tracciamento delle aste', () => {
  it('portale a L: uno spigolo, due tratti, nessun giunto', () => {
    const g = grafo(disegno().asta(0, 0, 0, 1).asta(0, 1, 1, 1));
    expect(g.punti).toHaveLength(3);
    expect(g.tratti).toHaveLength(2);
    expect(g.giunti).toEqual([]);
    expect(conGrado(g, 2)).toHaveLength(1);
  });

  it('incrocio a T: l\'asta passante si spezza nel punto d\'arrivo', () => {
    const g = grafo(disegno().asta(0, 1, 2, 1).asta(1, 1, 1, 0));
    expect(g.punti).toHaveLength(4);
    expect(g.tratti).toHaveLength(3);
    expect(conGrado(g, 3)).toHaveLength(1);
  });

  it('tratto a mano con un buco e nessun simbolo: il buco si richiude', () => {
    const g = grafo(disegno().asta(0, 0, 0.91, 0).asta(1.09, 0, 2, 0));
    expect(g.punti).toHaveLength(3);
    expect(g.tratti).toHaveLength(2);
    expect(g.giunti).toEqual([]);
  });

  it('tratto ripassato due volte: un tratto solo', () => {
    const g = grafo(disegno().asta(0, 0, 2, 0).asta(0.01, 0.02, 1.98, 0.01));
    expect(g.tratti).toHaveLength(1);
    expect(g.punti).toHaveLength(2);
  });
});

describe('regole del pallino nel grafo', () => {
  it('buco su una cerniera: giunto con un gruppo per tratto', () => {
    const g = grafo(disegno().asta(0, 0, 1, 0).asta(1, 0, 2, 0).cerniera(1, 0));
    expect(g.punti).toHaveLength(3);
    expect(g.giunti).toHaveLength(1);
    expect(g.giunti[0].tipo).toBe('cerniera');
    expect(g.giunti[0].gruppi.map((x) => x.length)).toEqual([1, 1]);
  });

  it('es. 20 in B: la colonna resta saldata, solo la diagonale è incernierata', () => {
    const g = grafo(disegno().asta(0, 0, 0, 2).asta(RAGGIO, 1, 2, 0).cerniera(RAGGIO, 1));
    expect(g.punti).toHaveLength(4);
    expect(g.tratti).toHaveLength(3);
    expect(g.giunti).toHaveLength(1);
    const gruppi = [...g.giunti[0].gruppi].sort((a, b) => a.length - b.length);
    expect(gruppi.map((x) => x.length)).toEqual([1, 2]);
    const px = (id: string) => g.punti.find((p) => p.id === id)!.px;
    for (const id of gruppi[1]) {
      const t = g.tratti.find((x) => x.id === id)!;
      expect(px(t.i).x).toBeCloseTo(px(t.j).x, 0); // i due pezzi di colonna sono verticali
    }
  });

  it('carrello appoggiato in mezzeria: vincolo sul punto intermedio, nessun giunto', () => {
    const g = grafo(disegno().asta(0, 0, 2, 0).appoggio('triangoloRulli', 1, 0, 0));
    expect(g.tratti).toHaveLength(2);
    expect(g.giunti).toEqual([]);
    expect(g.vincoli).toHaveLength(1);
    expect(g.vincoli[0]).toMatchObject({ tipo: 'carrello', angolo: 0 });
    expect(grado(g, g.vincoli[0].punto)).toBe(2);
  });

  it('cerniera a terra che interrompe la linea: giunto e vincolo nello stesso punto', () => {
    const g = grafo(disegno().asta(0, 0, 1, 0).asta(1, 0, 2, 0)
      .appoggio('triangolo', 1, 0, 0, { interrompe: true }));
    expect(g.giunti).toHaveLength(1);
    expect(g.vincoli).toHaveLength(1);
    expect(g.vincoli[0].tipo).toBe('cerniera');
    expect(g.vincoli[0].punto).toBe(g.giunti[0].punto);
  });

  it('spigolo posato sul pallino: vincolo sullo spigolo e avviso di ambiguità', () => {
    const g = grafo(disegno().asta(0, 0, 1, 0).asta(1, 0, 1, 1).appoggio('triangolo', 1, 0, 0));
    expect(g.punti).toHaveLength(3);
    expect(g.giunti).toEqual([]);
    expect(g.vincoli).toHaveLength(1);
    expect(grado(g, g.vincoli[0].punto)).toBe(2);
    expect(g.avvisi.map((a) => a.codice)).toContain('cernieraAmbigua');
  });

  it('asta a T sopra l\'appoggio: incrocio rigido con il vincolo sotto', () => {
    const g = grafo(disegno().asta(0, 0, 2, 0).asta(1, 1, 1, 0).appoggio('triangolo', 1, 0, 0));
    expect(g.punti).toHaveLength(4);
    expect(g.tratti).toHaveLength(3);
    expect(g.giunti).toEqual([]);
    expect(grado(g, g.vincoli[0].punto)).toBe(3);
  });
});

describe('vincoli senza pallino', () => {
  it('incastro all\'estremo', () => {
    const g = grafo(disegno().asta(0, 0, 1, 0).appoggio('incastro', 0, 0, 270, { pallino: false }));
    expect(g.vincoli).toHaveLength(1);
    expect(g.vincoli[0].tipo).toBe('incastro');
    expect(g.vincoli[0].angolo).toBeCloseTo(1.5 * Math.PI, 9);
    expect(grado(g, g.vincoli[0].punto)).toBe(1);
  });

  it('doppio pendolo interno: divide l\'asta con un giunto', () => {
    const g = grafo(disegno().asta(0, 0, 0.95, 0).asta(1.05, 0, 2, 0)
      .corpo('doppioPendoloInterno', 1, 0, 0));
    expect(g.punti).toHaveLength(3);
    expect(g.giunti).toHaveLength(1);
    expect(g.giunti[0].tipo).toBe('bipendolo');
    expect(g.giunti[0].gruppi).toHaveLength(2);
  });

  it('un carrello disegnato a 92° si legge a 90°', () => {
    const g = grafo(disegno().asta(0, 0, 0, 1)
      .appoggio('triangoloRulli', 0, 0, 92, { pallino: false }));
    expect(g.vincoli[0].angolo).toBeCloseTo(Math.PI / 2, 9);
  });

  it('un simbolo lontano dalla struttura non si aggancia: avviso', () => {
    const g = grafo(disegno().asta(0, 0, 1, 0).appoggio('incastro', 3, 3, 0, { pallino: false }));
    expect(g.vincoli).toEqual([]);
    expect(g.avvisi.map((a) => a.codice)).toContain('simboloIsolato');
  });
});

describe('inserisciPunto', () => {
  it('spezza il tratto, e vicino a un estremo restituisce quello', () => {
    const p = disegno().asta(0, 0, 2, 0).primitive();
    const tol = tolleranze(p);
    const g = costruisciGrafo(p, tol);
    const [a, b] = g.punti.map((x) => x.px);
    const medio = inserisciPunto(g, g.tratti[0].id, { x: (a.x + b.x) / 2, y: a.y + 2 }, tol.tau);
    expect(g.punti).toHaveLength(3);
    expect(g.tratti).toHaveLength(2);
    expect(grado(g, medio)).toBe(2);
    const vicino = inserisciPunto(g, g.tratti[0].id, { x: a.x + 1, y: a.y }, tol.tau);
    expect([g.tratti[0].i, g.tratti[0].j]).toContain(vicino);
    expect(g.punti).toHaveLength(3);
  });

  it('i gruppi dei giunti continuano a citare il pezzo che tocca il giunto', () => {
    const p = disegno().asta(0, 0, 1, 0).asta(1, 0, 2, 0).cerniera(1, 0).primitive();
    const tol = tolleranze(p);
    const g = costruisciGrafo(p, tol);
    for (const t of [...g.tratti]) {
      const pi = g.punti.find((x) => x.id === t.i)!.px;
      const pj = g.punti.find((x) => x.id === t.j)!.px;
      inserisciPunto(g, t.id, { x: (pi.x + pj.x) / 2, y: pi.y }, tol.tau);
    }
    const giunto = g.giunti[0];
    for (const gruppo of giunto.gruppi) {
      for (const id of gruppo) {
        const t = g.tratti.find((x) => x.id === id)!;
        expect([t.i, t.j]).toContain(giunto.punto);
      }
    }
  });
});

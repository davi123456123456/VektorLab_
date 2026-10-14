import { describe, it, expect } from 'vitest';
import { costruisciGrafo } from '../../src/foto/letture/grafo.js';
import { leggiCarichi } from '../../src/foto/letture/carichi.js';
import { tolleranze } from '../../src/foto/parametri.js';
import type { CaricoGrafo, Grafo } from '../../src/foto/tipi.js';
import { disegno, type Disegno } from './aiuti.js';

const letto = (d: Disegno): Grafo => {
  const p = d.primitive();
  const tol = tolleranze(p);
  const g = costruisciGrafo(p, tol);
  leggiCarichi(g, p, tol);
  return g;
};
const px = (g: Grafo, id: string) => g.punti.find((x) => x.id === id)!.px;
const distribuiti = (g: Grafo) =>
  g.carichi.filter((c): c is Extract<CaricoGrafo, { tipo: 'distribuito' }> => c.tipo === 'distribuito');
const codici = (g: Grafo) => g.avvisi.map((a) => a.codice);

/** trave 0–2 su cerniera e carrello */
const trave = () => disegno().asta(0, 0, 2, 0)
  .appoggio('triangolo', 0, 0, 0).appoggio('triangoloRulli', 2, 0, 0);

describe('carichi distribuiti', () => {
  it('cinque frecce in giù con le punte sulla trave: un distribuito verso il basso', () => {
    const g = letto(trave().distribuito(0, 0, 2, 0, -90));
    const [q] = distribuiti(g);
    expect(g.carichi).toHaveLength(1);
    expect(q.direzione).toBeCloseTo(-Math.PI / 2, 9);
    expect(g.punti).toHaveLength(2);
    expect(Math.abs(px(g, q.da).x - px(g, q.a).x)).toBeCloseTo(200, 0);
  });

  it('blocco con le code sull\'asta e frecce verso destra (es. 6): verso destra', () => {
    const g = letto(disegno().asta(0, 0, 0, 2).appoggio('incastro', 0, 0, 0, { pallino: false })
      .distribuito(0, 0, 0, 2, 0, { punte: false }));
    expect(distribuiti(g)).toHaveLength(1);
    expect(distribuiti(g)[0].direzione).toBeCloseTo(0, 9);
  });

  it('due gruppi affiancati giù e su (es. 16): due carichi distinti', () => {
    const g = letto(trave().appoggio('triangoloRulli', 1, 0, 0)
      .distribuito(0, 0, 0.95, 0, -90).distribuito(1.05, 0, 2, 0, 90, { punte: false }));
    const qs = distribuiti(g).sort((a, b) => a.direzione - b.direzione);
    expect(qs).toHaveLength(2);
    expect(qs[0].direzione).toBeCloseTo(-Math.PI / 2, 9);
    expect(qs[1].direzione).toBeCloseTo(Math.PI / 2, 9);
    expect(g.punti).toHaveLength(3); // gli estremi si agganciano al carrello in mezzo
    const comuni = [qs[0].da, qs[0].a].filter((id) => [qs[1].da, qs[1].a].includes(id));
    expect(comuni).toHaveLength(1);
  });

  it('la freccia sullo spigolo va sull\'asta trasversale, non sulla colonna parallela', () => {
    const g = letto(disegno().asta(0, 0, 0, 1).asta(0, 1, 2, 1).asta(2, 1, 2, 0)
      .distribuito(0, 1, 2, 1, -90));
    expect(g.carichi).toHaveLength(1);
    expect(distribuiti(g)).toHaveLength(1);
  });

  it('la prima freccia su un nodo condiviso va con le sue vicine (zigzag dell\'es. 23)', () => {
    const g = letto(disegno().asta(1, 3, 0, 2).asta(0, 2, 1, 1).distribuito(0, 2, 1, 1, -90));
    expect(g.carichi).toHaveLength(1);
    expect(distribuiti(g)).toHaveLength(1);
  });

  it('una freccia contraria isolata dentro un distribuito si scarta con un avviso', () => {
    const g = letto(trave().distribuito(0, 0, 2, 0, -90).freccia(1.1, 0, 90));
    expect(g.carichi).toHaveLength(1);
    expect(codici(g)).toContain('versoIncerto');
  });
});

describe('forze e momenti', () => {
  it('freccia singola su un estremo: forza in quel punto', () => {
    const g = letto(disegno().asta(0, 0, 1, 0).appoggio('incastro', 1, 0, 90, { pallino: false })
      .freccia(0, 0, -90));
    expect(g.carichi).toEqual([expect.objectContaining({ tipo: 'forza' })]);
    expect(g.punti).toHaveLength(2);
    const f = g.carichi[0] as Extract<CaricoGrafo, { tipo: 'forza' }>;
    expect(f.direzione).toBeCloseTo(-Math.PI / 2, 9);
  });

  it('freccia singola a metà trave: forza con un punto nuovo', () => {
    const g = letto(trave().freccia(1, 0, -90));
    expect(g.punti).toHaveLength(3);
    expect(g.carichi[0].tipo).toBe('forza');
  });

  it('momento antiorario su un nodo', () => {
    const g = letto(disegno().asta(0, 0, 1, 0).appoggio('incastro', 0, 0, 270, { pallino: false })
      .momento(1, 0, 'antiorario'));
    expect(g.carichi).toEqual([expect.objectContaining({ tipo: 'momento', verso: 1 })]);
    expect(g.punti).toHaveLength(2);
  });

  it('momento in campata: un punto nuovo sull\'asta', () => {
    const g = letto(trave().momento(1, 0.1, 'orario'));
    expect(g.carichi).toEqual([expect.objectContaining({ tipo: 'momento', verso: -1 })]);
    expect(g.punti).toHaveLength(3);
  });
});

describe('coefficienti', () => {
  it('la scritta 2q vicina al blocco dà coefficiente 2', () => {
    const g = letto(trave().distribuito(0, 0, 2, 0, -90).scritta('q', 2, 1, 0.6));
    expect(g.carichi[0].coefficiente).toBe(2);
    expect(codici(g)).not.toContain('coefficienteNonLetto');
  });

  it('senza scritta il coefficiente è 1, con un avviso', () => {
    const g = letto(trave().distribuito(0, 0, 2, 0, -90));
    expect(g.carichi[0].coefficiente).toBe(1);
    expect(codici(g)).toContain('coefficienteNonLetto');
  });

  it('ogni scritta va a un carico solo, il più vicino', () => {
    const g = letto(trave().freccia(0.5, 0, -90).freccia(1.5, 0, -90)
      .scritta('F', 2, 1.6, 0.3));
    const forze = g.carichi.filter((c): c is Extract<CaricoGrafo, { tipo: 'forza' }> => c.tipo === 'forza')
      .sort((a, b) => px(g, a.punto).x - px(g, b.punto).x);
    const [lontano, vicino] = forze;
    expect(vicino.coefficiente).toBe(2);
    expect(lontano.coefficiente).toBe(1);
  });
});

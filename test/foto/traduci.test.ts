import { describe, it, expect } from 'vitest';
import { leggi } from '../../src/foto/index.js';
import type { Primitive } from '../../src/foto/tipi.js';
import { disegno, RAGGIO } from './aiuti.js';

/** trave 0–3 su cerniera in A, carrelli in 1, 2 (su asta) e 3, quote L L L */
const trave = () => disegno().asta(0, 0, 3, 0)
  .appoggio('triangolo', 0, 0, 0).appoggio('triangoloRulli', 1, 0, 0)
  .appoggio('triangoloRulli', 2, 0, 0).appoggio('triangoloRulli', 3, 0, 0)
  .quota(1, 0, -0.6, 1, -0.6).quota(1, 1, -0.6, 2, -0.6).quota(1, 2, -0.6, 3, -0.6);

describe('dal grafo al Progetto', () => {
  it('trave continua: una sola asta, gli appoggi intermedi sono vincoli su asta', () => {
    const { progetto } = leggi(trave().primitive());
    expect(progetto.aste).toHaveLength(1);
    const s = (progetto.vincoliSuAsta ?? []).map((v) => v.s).sort();
    expect(s).toHaveLength(2);
    expect(s[0]).toBeCloseTo(1 / 3, 9);
    expect(s[1]).toBeCloseTo(2 / 3, 9);
    expect(progetto.nodi.filter((n) => n.vincolo)).toHaveLength(2);
  });

  it('es. 20 in B: solo la diagonale è svincolata, la colonna resta la master', () => {
    const { progetto } = leggi(disegno().asta(0, 0, 0, 2).asta(RAGGIO, 1, 2, 0).cerniera(RAGGIO, 1)
      .quota(1, -0.4, 0, -0.4, 1).quota(1, -0.4, 1, -0.4, 2).quota(2, 0, -0.5, 2, -0.5).primitive());
    expect(progetto.vincoliInterni).toHaveLength(1);
    const vi = progetto.vincoliInterni[0];
    expect(vi.asteSvincolate).toHaveLength(1);
    const diagonale = progetto.aste.find((a) => a.id === vi.asteSvincolate![0])!;
    const nodo = (id: string) => progetto.nodi.find((n) => n.id === id)!;
    expect(nodo(diagonale.nodoIniziale).x).not.toBe(nodo(diagonale.nodoFinale).x);
    const master = progetto.aste.find((a) => a.id === vi.astaMaster)!;
    expect(nodo(master.nodoIniziale).x).toBe(nodo(master.nodoFinale).x);
  });

  it('un distribuito che scavalca un appoggio intermedio resta un carico solo', () => {
    const { progetto } = leggi(trave().distribuito(0, 0, 2, 0, -90).scritta('q', 1, 1, 0.6).primitive());
    const q = progetto.carichi.filter((c) => c.tipo === 'distribuito');
    expect(q).toHaveLength(1);
    expect(q[0]).toMatchObject({ sIniziale: 0, q1: -1000, direzione: { modo: 'globaleY' } });
    expect((q[0] as { sFinale: number }).sFinale).toBeCloseTo(2 / 3, 9);
  });

  it('2F verso sinistra: fx = −2000 N', () => {
    const { progetto } = leggi(trave().freccia(3, 0, 180).scritta('F', 2, 3.3, 0.15).primitive());
    expect(progetto.carichi).toEqual([expect.objectContaining({ tipo: 'forzaNodale', fx: -2000, fy: 0 })]);
  });

  it('momento orario di coefficiente 1: mz = −1000 N·m', () => {
    const { progetto } = leggi(trave().momento(3, 0, 'orario').scritta('M', 1, 3.4, 0.3).primitive());
    expect(progetto.carichi).toEqual([expect.objectContaining({ tipo: 'momentoNodale', mz: -1000 })]);
  });

  it('primitive vuote: modello vuoto con un avviso, nessuna eccezione', () => {
    const vuote: Primitive = {
      larghezza: 100, altezza: 100, aste: [], pallini: [], corpi: [],
      frecce: [], momenti: [], nodi: [], scritte: [],
    };
    const esito = leggi(vuote);
    expect(esito.progetto.aste).toEqual([]);
    expect(esito.avvisi.map((a) => a.codice)).toContain('nessunaAsta');
  });

  it('materiale e sezione predefiniti dell\'app, e nessuna anomalia di integrità', () => {
    const { progetto, avvisi } = leggi(trave().primitive());
    expect(progetto.aste[0]).toMatchObject({ materialeId: 'S275', sezioneId: 'IPE 300' });
    expect(progetto.nome).toBe('Da foto');
    expect(avvisi.map((a) => a.codice)).not.toContain('integrita');
  });
});

describe('avvisi legati agli elementi del progetto', () => {
  it('un punto del grafo porta al suo nodo, uno a metà asta alla sua asta', () => {
    const p = disegno().asta(0, 0, 2, 0)
      .appoggio('triangolo', 0, 0, 0).appoggio('triangoloRulli', 2, 0, 0)
      .momento(1, 0, 'antiorario').momento(2, 0, 'orario').primitive();
    p.momenti.forEach((m) => { m.confidenza = 0.1; });
    const e = leggi(p);
    const incerti = e.avvisi.filter((a) => a.codice === 'versoIncerto');
    expect(incerti).toHaveLength(2);
    const nodi = new Set(e.progetto.nodi.map((n) => n.id));
    const aste = new Set(e.progetto.aste.map((a) => a.id));
    const legati = incerti.map((a) => e.elementiDaPunti[a.punti![0]]);
    // il momento in mezzo alla trave sta su un'asta, quello all'estremo su un nodo
    expect(legati.some((x) => x.aste.length === 1 && aste.has(x.aste[0]) && x.nodi.length === 0)).toBe(true);
    expect(legati.some((x) => x.nodi.length === 1 && nodi.has(x.nodi[0]))).toBe(true);
  });
});

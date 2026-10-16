import { describe, expect, it } from 'vitest';
import { confronta } from '../../src/foto/confronto.js';
import { leggi } from '../../src/foto/index.js';
import { trovaFigure, type Riquadro } from '../../src/foto/rete/figura.js';
import { grigioDaRGBA, riduci, ritaglia, tensore, type Grigio } from '../../src/foto/rete/ingresso.js';
import { raddrizza } from '../../src/foto/rete/raddrizza.js';
import * as V from '../../src/foto/rete/vocabolario.js';
import { schemaInProgetto } from '../../src/foto/schema.js';
import type { Primitive, Punto } from '../../src/foto/tipi.js';
import { caricaIdeale, nomiIdeali } from './aiuti-rete.js';

const GRADI = Math.PI / 180;

function bianca(larghezza: number, altezza: number): Grigio {
  return { dati: new Uint8Array(larghezza * altezza).fill(255), larghezza, altezza };
}

function iou(a: Riquadro, b: [number, number, number, number]): number {
  const ix = Math.max(0, Math.min(a.x1, b[2]) - Math.max(a.x0, b[0]));
  const iy = Math.max(0, Math.min(a.y1, b[3]) - Math.max(a.y0, b[1]));
  const area = (w: number, h: number) => Math.max(0, w) * Math.max(0, h);
  const i = ix * iy;
  return i / (area(a.x1 - a.x0, a.y1 - a.y0) + area(b[2] - b[0], b[3] - b[1]) - i);
}

describe('ingresso della rete', () => {
  it('riduce una foto grande senza perdere una riga sottile', () => {
    const g = bianca(4000, 3000);
    g.dati.fill(0, 1500 * 4000, 1505 * 4000);
    const { grigio, scala } = riduci(g, 768);
    expect([grigio.larghezza, grigio.altezza]).toEqual([768, 576]);
    expect(scala).toBeCloseTo(0.192, 6);
    let piuScura = 255;
    for (let y = 280; y < 296; y++) piuScura = Math.min(piuScura, grigio.dati[y * 768 + 400]);
    expect(piuScura).toBeLessThan(128);
  });

  it('ingrandisce uno screenshot piccolo', () => {
    const { grigio } = riduci(bianca(300, 200), 768);
    expect([grigio.larghezza, grigio.altezza]).toEqual([768, 512]);
    expect(grigio.dati.every((v) => v === 255)).toBe(true);
  });

  it('il tensore ha lati multipli di 32, bianco nel riempimento', () => {
    const g = bianca(100, 50);
    g.dati[0] = 0;
    const t = tensore(g);
    expect([t.W, t.H]).toEqual([128, 64]);
    expect(t.dati[0]).toBe(0);
    expect(t.dati[1]).toBe(1);
    expect(t.dati[63 * 128 + 127]).toBe(1);
  });

  it('ritaglia oltre il bordo riempiendo di bianco', () => {
    const g = bianca(100, 100);
    g.dati.fill(0);
    const { grigio, origine } = ritaglia(g, { x0: 80, y0: 10, x1: 100, y1: 30 }, 0.5);
    expect(origine).toEqual({ x: 70, y: 0 });
    expect([grigio.larghezza, grigio.altezza]).toEqual([40, 40]);
    expect(grigio.dati[5 * 40 + 5]).toBe(0);
    expect(grigio.dati[5 * 40 + 35]).toBe(255);
  });

  it('i pixel trasparenti sono carta bianca', () => {
    const rgba = new Uint8ClampedArray([0, 0, 0, 0, 0, 0, 0, 128, 0, 0, 0, 255]);
    expect(Array.from(grigioDaRGBA(rgba, 3, 1).dati)).toEqual([255, 127, 0]);
  });

  it('grigio come PIL (ITU-R 601)', () => {
    const rgba = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 200, 100, 50, 255]);
    expect(Array.from(grigioDaRGBA(rgba, 4, 1).dati)).toEqual([76, 150, 29, 124]);
  });
});

describe('figure nella pagina', () => {
  const pagine = nomiIdeali().filter((n) => n.startsWith('ideale-20001'));

  it('la prima figura è lo schema', () => {
    expect(pagine).toHaveLength(3);
    for (const nome of pagine) {
      const f = caricaIdeale(nome);
      const figure = trovaFigure(f.uscite);
      expect(figure.length).toBeGreaterThan(0);
      expect(iou(figure[0].riquadro, f.riquadro), nome).toBeGreaterThanOrEqual(0.6);
    }
  });

  it('una sezione più grande dello schema non gli passa davanti', () => {
    const f = caricaIdeale(pagine[0]);
    const { seg, w2, h2 } = f.uscite;
    // un riquadro di linee d'asta (più celle d'asta dello schema, ma nessun vincolo)
    // con l'interno «altro», nell'angolo opposto alla figura: una sezione
    const destra = f.riquadro[0] < f.larghezza / 2;
    const j0 = destra ? w2 - 120 : 5, i0 = h2 - 160;
    for (let i = i0; i < i0 + 150; i++) {
      for (let j = j0; j < j0 + 110; j++) {
        const bordo = i === i0 || i === i0 + 149 || j === j0 || j === j0 + 109;
        seg[i * w2 + j] = bordo ? V.CLASSE.asta : V.CLASSE.altro;
      }
    }
    const figure = trovaFigure(f.uscite);
    expect(figure.length).toBeGreaterThanOrEqual(2);
    expect(figure.some((x) => x.vincoli === 0 && x.aste > figure[0].aste)).toBe(true);
    expect(iou(figure[0].riquadro, f.riquadro)).toBeGreaterThanOrEqual(0.6);
  });
});

function ruota(p: Primitive, gradi: number): Primitive {
  const a = gradi * GRADI, cx = p.larghezza / 2, cy = p.altezza / 2;
  const r = (q: Punto): Punto => ({
    x: cx + (q.x - cx) * Math.cos(a) - (q.y - cy) * Math.sin(a),
    y: cy + (q.x - cx) * Math.sin(a) + (q.y - cy) * Math.cos(a),
  });
  return {
    ...p,
    aste: p.aste.map((s) => ({ ...s, a: r(s.a), b: r(s.b) })),
    pallini: p.pallini.map((c) => ({ ...c, c: r(c.c) })),
    corpi: p.corpi.map((k) => ({ ...k, attacco: r(k.attacco), angolo: k.angolo + a })),
    frecce: p.frecce.map((f) => ({ ...f, punta: r(f.punta), direzione: f.direzione + a })),
    momenti: p.momenti.map((m) => ({ ...m, centro: r(m.centro) })),
    nodi: p.nodi.map(r),
    scritte: p.scritte.map((s) => ({ ...s, centro: r(s.centro), ...(s.estremi ? { estremi: [r(s.estremi[0]), r(s.estremi[1])] as [Punto, Punto] } : {}) })),
  };
}

describe('raddrizzamento', () => {
  it('trova la rotazione della foto e la toglie', () => {
    const nomi = nomiIdeali().filter((n) => n.startsWith('ideale-20000')).slice(0, 5);
    for (const nome of nomi) {
      const f = caricaIdeale(nome);
      const atteso = schemaInProgetto(f.schema);
      // le fixture vengono da foto già storte di qualche grado: si confronta
      // con la stessa fixture raddrizzata
      const { primitive: dritta, angolo: propria } = raddrizza(f.primitive);
      const prima = confronta(leggi(dritta).progetto, atteso).perfetto;
      for (const gradi of [4, -3]) {
        const { primitive, angolo } = raddrizza(ruota(f.primitive, gradi));
        expect(Math.abs(angolo - propria - gradi * GRADI), `${nome} ${gradi}°`).toBeLessThan(0.3 * GRADI);
        expect(confronta(leggi(primitive).progetto, atteso).perfetto, `${nome} ${gradi}°`).toBe(prima);
      }
    }
  });

  it('sotto 0.3° non tocca niente', () => {
    const f = caricaIdeale(nomiIdeali()[0]);
    const p = ruota(raddrizza(f.primitive).primitive, 0.1);
    expect(raddrizza(p).primitive).toEqual(p);
  });
});

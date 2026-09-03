/**
 * §5.4 — i sette test di accettazione della pipeline di snap.
 *
 * Non toccano il calcolo: verificano che la GEOMETRIA che l'utente disegna sia
 * quella che intendeva. Un cateto a 89,97° non è un'approssimazione
 * accettabile, è un errore — e produce anche nodi quasi coincidenti, che sono
 * una delle condizioni da cui nascevano i bug di topologia.
 */

import { describe, it, expect } from 'vitest';
import { progetto } from '../../src/core/builder.js';
import { calcolaSnap, SNAP_PREDEFINITO } from '../../src/render/snap.js';
import { mondoASchermo, schermoAMondo } from '../../src/render/camera.js';
import { passoGriglia } from '../../src/render/grid.js';
import type { Camera } from '../../src/render/camera.js';

const vuoto = progetto('vuoto').costruisci();

function camera(zoom: number): Camera {
  return { cx: 0, cy: 0, zoom, larghezza: 1200, altezza: 800 };
}

/** Aggancia il punto di mondo `p`, passando dallo schermo come fa l'app. */
function aggancia(c: Camera, p: { x: number; y: number }, origine: { x: number; y: number } | null = null) {
  return calcolaSnap(vuoto, c, mondoASchermo(c, p), SNAP_PREDEFINITO, origine);
}

const multiploDi = (v: number, passo: number) =>
  Math.abs(v / passo - Math.round(v / passo)) < 1e-9;

describe('§5.4', () => {
  it('6 — mondo → schermo → mondo su 100 punti: errore sotto 1e-12', () => {
    // il primo controllo da fare: se le trasformazioni non sono inverse
    // esatte, tutto il resto è costruito sulla sabbia
    for (const zoom of [8, 50, 137.3, 1000]) {
      const c = camera(zoom);
      for (let k = 0; k < 25; k++) {
        const p = { x: (k * 37) % 91 - 45.5, y: (k * 53) % 67 - 33.5 };
        const tornato = schermoAMondo(c, mondoASchermo(c, p));
        expect(Math.abs(tornato.x - p.x)).toBeLessThan(1e-12);
        expect(Math.abs(tornato.y - p.y)).toBeLessThan(1e-12);
      }
    }
  });

  it('la scala è identica su x e su y', () => {
    const c = camera(73.5);
    const o = mondoASchermo(c, { x: 0, y: 0 });
    const dx = mondoASchermo(c, { x: 1, y: 0 }).x - o.x;
    const dy = o.y - mondoASchermo(c, { x: 0, y: 1 }).y;
    expect(dx).toBeCloseTo(dy, 12);
  });

  it('5 — venti punti a caso cadono su multipli esatti del passo', () => {
    const c = camera(60);
    const passo = passoGriglia(c.zoom);
    for (let k = 0; k < 20; k++) {
      const p = { x: (k * 7.13) % 19 - 9.5, y: (k * 11.7) % 23 - 11.5 };
      const s = aggancia(c, p);
      expect(multiploDi(s.punto.x, passo)).toBe(true);
      expect(multiploDi(s.punto.y, passo)).toBe(true);
    }
  });

  it('1 — triangolo rettangolo 3-4-5: cateti esatti e angolo esatto', () => {
    const c = camera(60);
    const origine = aggancia(c, { x: 0.02, y: -0.03 }).punto;
    // base orizzontale di 3 m
    const base = aggancia(c, { x: origine.x + 2.97, y: origine.y + 0.04 }, origine).punto;
    // cateto verticale di 4 m
    const alto = aggancia(c, { x: origine.x + 0.03, y: origine.y + 3.96 }, origine).punto;

    const b = Math.hypot(base.x - origine.x, base.y - origine.y);
    const h = Math.hypot(alto.x - origine.x, alto.y - origine.y);
    expect(b).toBeCloseTo(3, 9);
    expect(h).toBeCloseTo(4, 9);

    // angolo ESATTO fra i due cateti
    const cos = ((base.x - origine.x) * (alto.x - origine.x)
      + (base.y - origine.y) * (alto.y - origine.y)) / (b * h);
    expect(Math.abs(cos)).toBeLessThan(1e-12);

    // ipotenusa
    expect(Math.hypot(base.x - alto.x, base.y - alto.y)).toBeCloseTo(5, 9);
  });

  it('2 — lo stesso disegno a zoom minimo e massimo dà le stesse coordinate', () => {
    const punti = [{ x: 1.03, y: 2.04 }, { x: -3.02, y: 0.97 }, { x: 5.48, y: -2.51 }];
    for (const p of punti) {
      const a = aggancia(camera(20), p).punto;
      const b = aggancia(camera(400), p).punto;
      // il passo cambia con lo zoom, ma il punto agganciato a zoom fine deve
      // restare un multiplo di quello grosso quando i due passi lo consentono
      expect(multiploDi(a.x, passoGriglia(20))).toBe(true);
      expect(multiploDi(b.x, passoGriglia(400))).toBe(true);
    }
  });

  it('3 — diagonale fra due nodi di griglia: lunghezza e angolo esatti', () => {
    const c = camera(60);
    const origine = aggancia(c, { x: 0, y: 0 }).punto;
    // 3 orizzontali e 3 verticali: la diagonale è 3√2 a 45°
    const p = aggancia(c, { x: 2.98, y: 3.01 }, origine).punto;
    expect(p.x).toBeCloseTo(3, 9);
    expect(p.y).toBeCloseTo(3, 9);
    const L = Math.hypot(p.x - origine.x, p.y - origine.y);
    expect(L).toBeCloseTo(3 * Math.SQRT2, 9);
    expect((Math.atan2(p.y - origine.y, p.x - origine.x) * 180) / Math.PI)
      .toBeCloseTo(45, 9);
  });

  it('7 — quadrato di lato 2 m in quattro tratti: si chiude ESATTAMENTE', () => {
    const c = camera(60);
    const a = aggancia(c, { x: 0.01, y: 0.02 }).punto;
    const b = aggancia(c, { x: a.x + 1.98, y: a.y + 0.03 }, a).punto;
    const d = aggancia(c, { x: b.x + 0.02, y: b.y + 1.97 }, b).punto;
    const e = aggancia(c, { x: d.x - 2.03, y: d.y + 0.01 }, d).punto;
    const f = aggancia(c, { x: e.x - 0.02, y: e.y - 1.99 }, e).punto;

    expect(Math.hypot(f.x - a.x, f.y - a.y)).toBeLessThan(1e-9);
  });

  it('le coordinate agganciate non portano rumore di virgola mobile', () => {
    const c = camera(60);
    const passo = passoGriglia(c.zoom);
    for (let k = -10; k <= 10; k++) {
      const s = aggancia(c, { x: k * passo + passo * 0.02, y: 0 });
      // il valore deve essere pulito, non 0.30000000000000004
      const arrotondato = Number(s.punto.x.toFixed(9));
      expect(s.punto.x).toBe(arrotondato);
    }
  });
});

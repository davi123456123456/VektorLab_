import { describe, it, expect } from 'vitest';
import {
  cameraIniziale, inquadra, mondoASchermo, schermoAMondo, trasla, vistaMondo,
  zoomVersoPuntatore, ZOOM_MAX, ZOOM_MIN,
} from '../../src/render/camera.js';
import { indicatoreScala, passoGriglia } from '../../src/render/grid.js';

const cam = { ...cameraIniziale(1000, 600), cx: 0, cy: 0, zoom: 50 };

describe('camera', () => {
  it('mondo → schermo → mondo è l\'identità', () => {
    for (const p of [{ x: 0, y: 0 }, { x: 3.7, y: -2.1 }, { x: -100, y: 50 }]) {
      const q = schermoAMondo(cam, mondoASchermo(cam, p));
      expect(q.x).toBeCloseTo(p.x, 10);
      expect(q.y).toBeCloseTo(p.y, 10);
    }
  });

  it('l\'asse y è ribaltato: salendo nel mondo si sale sullo schermo', () => {
    const basso = mondoASchermo(cam, { x: 0, y: 0 });
    const alto = mondoASchermo(cam, { x: 0, y: 1 });
    expect(alto.y).toBeLessThan(basso.y);
  });

  it('il centro della vista cade al centro del canvas', () => {
    const p = mondoASchermo(cam, { x: cam.cx, y: cam.cy });
    expect(p.x).toBeCloseTo(cam.larghezza / 2, 10);
    expect(p.y).toBeCloseTo(cam.altezza / 2, 10);
  });

  it('lo zoom tiene fermo il punto sotto il cursore', () => {
    const puntatore = { x: 300, y: 200 };
    const prima = schermoAMondo(cam, puntatore);
    const c2 = zoomVersoPuntatore(cam, puntatore, 2.5);
    const dopo = schermoAMondo(c2, puntatore);
    expect(dopo.x).toBeCloseTo(prima.x, 10);
    expect(dopo.y).toBeCloseTo(prima.y, 10);
    expect(c2.zoom).toBeCloseTo(cam.zoom * 2.5, 10);
  });

  it('lo zoom resta nei limiti', () => {
    expect(zoomVersoPuntatore(cam, { x: 0, y: 0 }, 1e9).zoom).toBe(ZOOM_MAX);
    expect(zoomVersoPuntatore(cam, { x: 0, y: 0 }, 1e-9).zoom).toBe(ZOOM_MIN);
  });

  it('lo spostamento della vista segue il trascinamento', () => {
    const c2 = trasla(cam, 100, 0);     // trascino a destra
    expect(c2.cx).toBeCloseTo(cam.cx - 100 / cam.zoom, 10);
  });

  it('inquadra non fa nulla se la viewport non è ancora misurata', () => {
    // È il caso reale: il modello viene caricato prima che il canvas abbia
    // dimensioni. Calcolare uno zoom qui darebbe un valore assurdo, poi
    // bloccato dal limite inferiore, e il modello resterebbe invisibile.
    const nonMisurata = { ...cam, larghezza: 0, altezza: 0 };
    expect(inquadra(nonMisurata, -2, -1, 8, 5)).toEqual(nonMisurata);
  });

  it('inquadra centra il contenuto e lo fa stare dentro', () => {
    const c2 = inquadra(cam, -2, -1, 8, 5);
    expect(c2.cx).toBeCloseTo(3, 10);
    expect(c2.cy).toBeCloseTo(2, 10);
    const v = vistaMondo(c2);
    expect(v.xmin).toBeLessThan(-2);
    expect(v.xmax).toBeGreaterThan(8);
    expect(v.ymin).toBeLessThan(-1);
    expect(v.ymax).toBeGreaterThan(5);
  });
});

describe('griglia adattiva', () => {
  it('sceglie il passo nella successione 1-2-5', () => {
    const ammessi = [1, 2, 5];
    for (const zoom of [0.7, 3, 12, 50, 200, 900, 4000]) {
      const p = passoGriglia(zoom);
      const mantissa = p / Math.pow(10, Math.floor(Math.log10(p)));
      expect(ammessi.some((a) => Math.abs(mantissa - a) < 1e-9)).toBe(true);
    }
  });

  it('mantiene la spaziatura a schermo in una fascia leggibile', () => {
    for (let zoom = 1; zoom < 5000; zoom *= 1.3) {
      const pixel = passoGriglia(zoom) * zoom;
      expect(pixel).toBeGreaterThanOrEqual(9);
      expect(pixel).toBeLessThan(90);
    }
  });

  it('l\'indicatore di scala passa a centimetri sotto il metro', () => {
    expect(indicatoreScala({ ...cam, zoom: 5 }).etichetta).toMatch(/m$/);
    expect(indicatoreScala({ ...cam, zoom: 800 }).etichetta).toMatch(/cm$/);
  });
});

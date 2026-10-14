/**
 * Navigazione a due dita: il punto del disegno che sta sotto un dito deve
 * restare sotto quel dito, qualunque cosa facciano le dita insieme —
 * scorrere, allargarsi, stringersi. È la sensazione di «tenere» il foglio:
 * se il disegno scivolasse rispetto ai polpastrelli, il gesto sembrerebbe
 * di gomma.
 */

import { describe, it, expect } from 'vitest';
import {
  applicaPizzico, cameraIniziale, schermoAMondo, ZOOM_MAX,
} from '../../src/render/camera.js';

const cam = { ...cameraIniziale(400, 700), cx: 2, cy: 1, zoom: 50 };

function restaSottoIlDito(
  a0: { x: number; y: number }, b0: { x: number; y: number },
  a1: { x: number; y: number }, b1: { x: number; y: number },
) {
  const dopo = applicaPizzico(cam, a0, b0, a1, b1);
  for (const [prima, ora] of [[a0, a1], [b0, b1]] as const) {
    const m0 = schermoAMondo(cam, prima);
    const m1 = schermoAMondo(dopo, ora);
    expect(m1.x).toBeCloseTo(m0.x, 9);
    expect(m1.y).toBeCloseTo(m0.y, 9);
  }
  return dopo;
}

describe('pizzico a due dita', () => {
  it('trascinare le due dita insieme sposta la vista senza zoom', () => {
    const dopo = restaSottoIlDito(
      { x: 100, y: 300 }, { x: 250, y: 300 },
      { x: 130, y: 260 }, { x: 280, y: 260 },
    );
    expect(dopo.zoom).toBeCloseTo(cam.zoom, 12);
  });

  it('allargare le dita ingrandisce attorno al punto fra le due', () => {
    const dopo = restaSottoIlDito(
      { x: 150, y: 300 }, { x: 250, y: 300 },
      { x: 100, y: 300 }, { x: 300, y: 300 },
    );
    expect(dopo.zoom).toBeCloseTo(cam.zoom * 2, 9);
  });

  it('stringere le dita rimpicciolisce', () => {
    const dopo = restaSottoIlDito(
      { x: 100, y: 200 }, { x: 300, y: 400 },
      { x: 150, y: 250 }, { x: 250, y: 350 },
    );
    expect(dopo.zoom).toBeCloseTo(cam.zoom / 2, 9);
  });

  it('spostare e allargare insieme tiene entrambi i punti sotto le dita', () => {
    restaSottoIlDito(
      { x: 120, y: 410 }, { x: 260, y: 330 },
      { x: 60, y: 380 }, { x: 340, y: 220 },
    );
  });

  it('dita sovrapposte non producono uno zoom infinito', () => {
    const dopo = applicaPizzico(
      cam, { x: 200, y: 300 }, { x: 200, y: 300 },
      { x: 150, y: 300 }, { x: 250, y: 300 },
    );
    expect(Number.isFinite(dopo.zoom)).toBe(true);
    expect(dopo.zoom).toBeLessThanOrEqual(ZOOM_MAX);
  });
});

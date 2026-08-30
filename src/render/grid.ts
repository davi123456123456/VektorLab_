/**
 * Griglia adattiva.
 *
 * Il passo si sceglie nella successione 1-2-5 (…0.1, 0.2, 0.5, 1, 2, 5, 10…)
 * in modo che la spaziatura a schermo resti in una fascia leggibile: sotto i
 * ~8 px la griglia diventa rumore, sopra i ~200 px smette di essere un
 * riferimento utile. Si disegnano due livelli — fine e maggiore ogni 5 passi —
 * così l'occhio conta senza dover leggere le quote.
 */

import type { Camera } from './camera.js';
import { mondoASchermo, vistaMondo } from './camera.js';

const PIXEL_MINIMI = 9;

/** Passo della griglia in metri, dalla successione 1-2-5. */
export function passoGriglia(zoom: number): number {
  const grezzo = PIXEL_MINIMI / zoom;
  const esponente = Math.floor(Math.log10(grezzo));
  const base = Math.pow(10, esponente);
  const mantissa = grezzo / base;
  const scelta = mantissa <= 1 ? 1 : mantissa <= 2 ? 2 : mantissa <= 5 ? 5 : 10;
  return scelta * base;
}

export function disegnaGriglia(ctx: CanvasRenderingContext2D, c: Camera, stile: {
  fine: string; media: string; asse: string;
}): void {
  const passo = passoGriglia(c.zoom);
  const v = vistaMondo(c);

  ctx.save();
  ctx.lineWidth = 1;

  // livello fine
  disegnaLinee(ctx, c, v, passo, stile.fine);
  // livello maggiore: ogni 5 passi
  disegnaLinee(ctx, c, v, passo * 5, stile.media);

  // assi x = 0 e y = 0
  ctx.strokeStyle = stile.asse;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  if (v.xmin <= 0 && 0 <= v.xmax) {
    const p = mondoASchermo(c, { x: 0, y: 0 });
    ctx.moveTo(Math.round(p.x) + 0.5, 0);
    ctx.lineTo(Math.round(p.x) + 0.5, c.altezza);
  }
  if (v.ymin <= 0 && 0 <= v.ymax) {
    const p = mondoASchermo(c, { x: 0, y: 0 });
    ctx.moveTo(0, Math.round(p.y) + 0.5);
    ctx.lineTo(c.larghezza, Math.round(p.y) + 0.5);
  }
  ctx.stroke();
  ctx.restore();
}

function disegnaLinee(
  ctx: CanvasRenderingContext2D, c: Camera,
  v: ReturnType<typeof vistaMondo>, passo: number, colore: string,
): void {
  if (passo * c.zoom < 4) return;   // troppo fitta: sarebbe solo rumore
  ctx.strokeStyle = colore;
  ctx.beginPath();
  const i0 = Math.floor(v.xmin / passo);
  const i1 = Math.ceil(v.xmax / passo);
  for (let i = i0; i <= i1; i++) {
    const p = mondoASchermo(c, { x: i * passo, y: 0 });
    const x = Math.round(p.x) + 0.5;
    ctx.moveTo(x, 0); ctx.lineTo(x, c.altezza);
  }
  const j0 = Math.floor(v.ymin / passo);
  const j1 = Math.ceil(v.ymax / passo);
  for (let j = j0; j <= j1; j++) {
    const p = mondoASchermo(c, { x: 0, y: j * passo });
    const y = Math.round(p.y) + 0.5;
    ctx.moveTo(0, y); ctx.lineTo(c.larghezza, y);
  }
  ctx.stroke();
}

/** Testo dell'indicatore di scala: una barra lunga `passo·5`. */
export function indicatoreScala(c: Camera): { pixel: number; etichetta: string } {
  const passo = passoGriglia(c.zoom) * 5;
  const etichetta = passo >= 1
    ? `${passo.toFixed(passo % 1 === 0 ? 0 : 1)} m`
    : `${(passo * 100).toFixed(passo * 100 % 1 === 0 ? 0 : 1)} cm`;
  return { pixel: passo * c.zoom, etichetta };
}

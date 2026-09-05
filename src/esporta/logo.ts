/**
 * §4.3 — IL MARCHIO, in forma vettoriale.
 *
 * È la stessa V-vettore di `public/favicon.svg`: l'asta che scende e risale, e
 * la punta di freccia in cima al secondo braccio. Ridisegnata con gli stessi
 * punti del file SVG, riscalati, così le due immagini non possono divergere.
 *
 * Nel piè di pagina il marchio sta accanto al nome: il segno da solo, a dieci
 * punti d'altezza, non si riconosce.
 */

import { NOME } from '../ui/Logo.js';
import type { ContestoPdf } from './contesto.js';
import type { PaletteDocumento } from './palette.js';

/** Larghezza complessiva del marchio a un'altezza di 10 punti. */
export const LARGHEZZA_LOGO = 58;

/**
 * Disegna il marchio con l'angolo in alto a sinistra in (x, y).
 *
 * `altezza` è quella del solo segno; il nome gli sta accanto, allineato al
 * centro verticale.
 */
export function disegnaLogo(
  c: ContestoPdf, p: PaletteDocumento, x: number, y: number, altezza = 10,
): void {
  // il disegno originale sta in un riquadro di 64 unità
  const k = altezza / 34;          // la V occupa da y=16 a y=46 nel viewBox
  const px = (u: number) => x + (u - 16) * k;
  const py = (v: number) => y + (v - 14) * k;

  c.save();
  c.strokeStyle = p.accento;
  c.fillStyle = p.accento;
  c.lineWidth = Math.max(0.9, 6 * k);
  c.lineJoin = 'round';
  c.lineCap = 'round';
  c.setLineDash([]);
  c.globalAlpha = 1;

  c.beginPath();
  c.moveTo(px(16), py(16));
  c.lineTo(px(32), py(46));
  c.lineTo(px(48), py(16));
  c.stroke();

  c.beginPath();
  c.moveTo(px(48), py(16));
  c.lineTo(px(41), py(20));
  c.lineTo(px(47), py(24));
  c.closePath();
  c.fill();
  c.beginPath();

  c.grassetto = true;
  c.dimensione = altezza * 0.82;
  c.fillStyle = p.accento;
  c.allineamento = 'left';
  c.base = 'middle';
  c.fillText(NOME, px(48) + altezza * 0.42, y + altezza / 2);
  c.grassetto = false;
  c.restore();
}

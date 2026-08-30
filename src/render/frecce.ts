/**
 * Primitive di disegno per forze e coppie.
 *
 * Stanno qui e non nei singoli moduli perché la stessa freccia compare nei
 * carichi, nelle reazioni e nel corpo libero: se avessero tre disegni diversi
 * l'utente dovrebbe imparare tre linguaggi grafici per la stessa grandezza.
 */

import type { Punto } from './camera.js';

/** Freccia piena con la PUNTA in `punta` e la coda a distanza (dx, dy). */
export function frecciaPiena(
  ctx: CanvasRenderingContext2D, punta: Punto, dx: number, dy: number,
  colore: string, spessore = 2.2,
): void {
  const L = Math.hypot(dx, dy);
  if (L < 1e-6) return;
  const ux = dx / L, uy = dy / L;
  ctx.save();
  ctx.strokeStyle = colore;
  ctx.fillStyle = colore;
  ctx.lineWidth = spessore;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(punta.x - ux * L, punta.y - uy * L);
  ctx.lineTo(punta.x, punta.y);
  ctx.stroke();
  const a = 4 * spessore, b = 1.7 * spessore;
  ctx.beginPath();
  ctx.moveTo(punta.x, punta.y);
  ctx.lineTo(punta.x - ux * a - uy * b, punta.y - uy * a + ux * b);
  ctx.lineTo(punta.x - ux * a + uy * b, punta.y - uy * a - ux * b);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/**
 * Arco con punta di freccia: il verso disegnato è quello che l'utente vede,
 * non quello del segno interno. `antiorario` vale nel senso della vista.
 */
export function arcoMomento(
  ctx: CanvasRenderingContext2D, centro: Punto, raggio: number,
  antiorario: boolean, colore: string, spessore = 2.2,
): void {
  ctx.save();
  ctx.strokeStyle = colore;
  ctx.fillStyle = colore;
  ctx.lineWidth = spessore;
  const da = -Math.PI * 0.8, a = Math.PI * 0.5;
  ctx.beginPath();
  ctx.arc(centro.x, centro.y, raggio, da, a, false);
  ctx.stroke();
  const fine = antiorario ? da : a;
  const px = centro.x + raggio * Math.cos(fine);
  const py = centro.y + raggio * Math.sin(fine);
  const t = antiorario ? 1 : -1;
  const tx = t * Math.sin(fine), ty = -t * Math.cos(fine);
  ctx.beginPath();
  ctx.moveTo(px, py);
  ctx.lineTo(px - tx * 8 - ty * 3.6, py - ty * 8 + tx * 3.6);
  ctx.lineTo(px - tx * 8 + ty * 3.6, py - ty * 8 - tx * 3.6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** Testo su una targhetta opaca, leggibile sopra qualunque cosa. */
export function etichettaSuSfondo(
  ctx: CanvasRenderingContext2D, testo: string, x: number, y: number,
  colore: string, sfondo: string, grassetto = false,
): void {
  ctx.save();
  ctx.font = `${grassetto ? '600 ' : ''}10px ui-monospace, SF Mono, Menlo, monospace`;
  ctx.textBaseline = 'middle';
  const w = ctx.measureText(testo).width;
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = sfondo;
  ctx.fillRect(x - 3, y - 7, w + 6, 14);
  ctx.globalAlpha = 1;
  ctx.fillStyle = colore;
  ctx.fillText(testo, x, y);
  ctx.restore();
}

/** Numero in kN o kNm, con il segno già assorbito dal verso della freccia. */
export function inKilo(valore: number, unita: 'kN' | 'kNm'): string {
  const v = Math.abs(valore) / 1e3;
  const cifre = v >= 100 ? 0 : v >= 10 ? 1 : 2;
  return `${v.toFixed(cifre)} ${unita}`;
}

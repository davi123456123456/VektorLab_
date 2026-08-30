/**
 * Disegno della sezione trasversale con i diagrammi di σ e τ sull'altezza.
 *
 * È la figura che spiega il risultato della verifica: si vede la sezione vera
 * (con il suo vuoto, se cava), la tensione normale che varia linearmente, la
 * tangenziale che salta dove la larghezza cambia, e il punto in cui la
 * tensione ideale è massima — che spesso non è dove uno guarderebbe.
 *
 * Dimensioni in pixel: il disegno è schematico, non in scala col modello.
 */

import type { DistribuzioneTensioni, PuntoTensione } from '../core/checks/index.js';
import {
  contornoInterno, contornoSezione, type ParametriSezione,
} from '../core/materials/sezioniParametriche.js';

export interface OpzioniSezione {
  parametri: ParametriSezione;
  distribuzione: DistribuzioneTensioni | null;
  larghezza: number;
  altezza: number;
  colori: {
    sfondo: string; contorno: string; riempimento: string;
    sigma: string; tau: string; ideale: string; critico: string;
    testo: string; griglia: string;
  };
}

interface Riquadro { x: number; y: number; w: number; h: number }

export function disegnaSezione(
  ctx: CanvasRenderingContext2D, o: OpzioniSezione,
): void {
  const { larghezza: W, altezza: H, colori } = o;
  ctx.save();
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = colori.sfondo;
  ctx.fillRect(0, 0, W, H);

  const margine = 26;
  const utile = H - 2 * margine;
  // tre riquadri affiancati: sezione, σ, τ
  const wSezione = Math.min(W * 0.3, utile * 0.9);
  const wDiagramma = (W - wSezione - margine * 2 - 24) / 2;

  const rSezione: Riquadro = { x: margine, y: margine, w: wSezione, h: utile };
  const rSigma: Riquadro = { x: margine + wSezione + 12, y: margine, w: wDiagramma, h: utile };
  const rTau: Riquadro = { x: rSigma.x + wDiagramma + 12, y: margine, w: wDiagramma, h: utile };

  disegnaProfilo(ctx, o, rSezione);
  if (o.distribuzione) {
    disegnaAndamento(ctx, o, rSigma, (p) => p.sigma, colori.sigma, 'σ  MPa');
    disegnaAndamento(ctx, o, rTau, (p) => p.tau, colori.tau, 'τ  MPa');
    evidenziaCritico(ctx, o, rSezione, rSigma, rTau);
  }
  ctx.restore();
}

/** Fattore di scala che fa entrare la sezione nel riquadro. */
function scalaProfilo(punti: { y: number; z: number }[], r: Riquadro): {
  k: number; cx: number; cy: number;
} {
  const zs = punti.map((p) => p.z);
  const ys = punti.map((p) => p.y);
  const dz = Math.max(...zs) - Math.min(...zs) || 1;
  const dy = Math.max(...ys) - Math.min(...ys) || 1;
  const k = Math.min((r.w * 0.85) / dz, (r.h * 0.9) / dy);
  return { k, cx: r.x + r.w / 2, cy: r.y + r.h / 2 };
}

function disegnaProfilo(
  ctx: CanvasRenderingContext2D, o: OpzioniSezione, r: Riquadro,
): void {
  const esterno = contornoSezione(o.parametri);
  const interno = contornoInterno(o.parametri);
  const { k, cx, cy } = scalaProfilo(esterno, r);

  const percorso = (punti: { y: number; z: number }[]) => {
    ctx.beginPath();
    punti.forEach((p, i) => {
      // z orizzontale, y verticale ribaltata (il canvas ha y verso il basso)
      const x = cx + p.z * k;
      const y = cy - p.y * k;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.closePath();
  };

  ctx.save();
  // il vuoto delle sezioni cave si ottiene con la regola evenodd
  percorso(esterno);
  if (interno.length > 0) percorso(interno);
  ctx.fillStyle = o.colori.riempimento;
  ctx.fill('evenodd');
  ctx.strokeStyle = o.colori.contorno;
  ctx.lineWidth = 1.4;
  percorso(esterno);
  ctx.stroke();
  if (interno.length > 0) { percorso(interno); ctx.stroke(); }

  // asse baricentrico
  ctx.strokeStyle = o.colori.griglia;
  ctx.setLineDash([4, 3]);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(r.x, cy); ctx.lineTo(r.x + r.w, cy);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

function disegnaAndamento(
  ctx: CanvasRenderingContext2D, o: OpzioniSezione, r: Riquadro,
  valore: (p: PuntoTensione) => number, colore: string, titolo: string,
): void {
  const punti = o.distribuzione!.punti;
  const massimo = Math.max(...punti.map((p) => Math.abs(valore(p)))) || 1;
  const ys = punti.map((p) => p.y);
  const yMin = Math.min(...ys), yMax = Math.max(...ys);
  const k = r.h / ((yMax - yMin) || 1);
  const asseX = r.x + r.w / 2;
  const scalaX = (r.w / 2) * 0.9 / massimo;

  const schermo = (p: PuntoTensione) => ({
    x: asseX + valore(p) * scalaX,
    y: r.y + r.h - (p.y - yMin) * k,
  });

  ctx.save();
  // asse zero
  ctx.strokeStyle = o.colori.griglia;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(asseX, r.y); ctx.lineTo(asseX, r.y + r.h);
  ctx.stroke();

  // riempimento e contorno dell'andamento
  ctx.globalAlpha = 0.2;
  ctx.fillStyle = colore;
  ctx.beginPath();
  ctx.moveTo(asseX, schermo(punti[0]).y);
  for (const p of punti) { const s = schermo(p); ctx.lineTo(s.x, s.y); }
  ctx.lineTo(asseX, schermo(punti[punti.length - 1]).y);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.strokeStyle = colore;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  punti.forEach((p, i) => {
    const s = schermo(p);
    if (i === 0) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y);
  });
  ctx.stroke();

  // titolo e valore di picco
  ctx.font = '10px ui-monospace, SF Mono, Menlo, monospace';
  ctx.fillStyle = o.colori.testo;
  ctx.textAlign = 'center';
  ctx.fillText(titolo, r.x + r.w / 2, r.y - 10);
  ctx.fillStyle = colore;
  ctx.fillText((massimo / 1e6).toFixed(1), r.x + r.w / 2, r.y + r.h + 14);
  ctx.restore();
}

/** Marca il punto critico su tutti e tre i riquadri, alla stessa quota. */
function evidenziaCritico(
  ctx: CanvasRenderingContext2D, o: OpzioniSezione,
  rSezione: Riquadro, rSigma: Riquadro, rTau: Riquadro,
): void {
  const d = o.distribuzione!;
  const ys = d.punti.map((p) => p.y);
  const yMin = Math.min(...ys), yMax = Math.max(...ys);
  const k = rSigma.h / ((yMax - yMin) || 1);
  const ySchermo = rSigma.y + rSigma.h - (d.critico.y - yMin) * k;

  ctx.save();
  ctx.strokeStyle = o.colori.critico;
  ctx.setLineDash([3, 3]);
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(rSezione.x, ySchermo);
  ctx.lineTo(rTau.x + rTau.w, ySchermo);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = o.colori.critico;
  ctx.beginPath();
  ctx.arc(rSezione.x + rSezione.w / 2, ySchermo, 3.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.font = 'bold 10px ui-monospace, SF Mono, Menlo, monospace';
  ctx.textAlign = 'left';
  ctx.fillText(
    `σid ${(d.critico.vonMises / 1e6).toFixed(1)} MPa`,
    rSezione.x, ySchermo - 6,
  );
  ctx.restore();
}

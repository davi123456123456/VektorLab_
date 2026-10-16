/**
 * INGRESSO DELLA RETE — dalla foto in grigio al tensore.
 *
 * Solo array in memoria: la foto non si scrive da nessuna parte (R2).
 * Il grigio è quello di PIL `L` (ITU-R 601, stessa aritmetica intera), la
 * riduzione fa la media d'area (una linea sottile resta scura invece di
 * sparire fra un campione e l'altro), l'ingrandimento è bilineare.
 */

import type { Riquadro } from './figura.js';

export interface Grigio { dati: Uint8Array; larghezza: number; altezza: number }

export const LATO = 768;

export function grigioDaRGBA(rgba: Uint8ClampedArray | Uint8Array, larghezza: number, altezza: number): Grigio {
  const dati = new Uint8Array(larghezza * altezza);
  for (let p = 0; p < dati.length; p++) {
    dati[p] = (rgba[4 * p] * 19595 + rgba[4 * p + 1] * 38470 + rgba[4 * p + 2] * 7471 + 0x8000) >> 16;
  }
  return { dati, larghezza, altezza };
}

/** Pesi della media d'area lungo un asse: per ogni uscita, (inizio, pesi) sulla sorgente. */
function pesiArea(da: number, a: number): { inizio: number; pesi: number[] }[] {
  const passo = da / a;
  return Array.from({ length: a }, (_, k) => {
    const s0 = k * passo, s1 = (k + 1) * passo;
    const inizio = Math.floor(s0);
    const pesi: number[] = [];
    for (let s = inizio; s < Math.min(da, Math.ceil(s1)); s++) pesi.push((Math.min(s + 1, s1) - Math.max(s, s0)) / passo);
    return { inizio, pesi };
  });
}

function riduciArea(g: Grigio, w: number, h: number): Grigio {
  const px = pesiArea(g.larghezza, w), py = pesiArea(g.altezza, h);
  const righe = new Float32Array(g.altezza * w);
  for (let y = 0; y < g.altezza; y++) {
    for (let x = 0; x < w; x++) {
      const { inizio, pesi } = px[x];
      let s = 0;
      for (let k = 0; k < pesi.length; k++) s += pesi[k] * g.dati[y * g.larghezza + inizio + k];
      righe[y * w + x] = s;
    }
  }
  const dati = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const { inizio, pesi } = py[y];
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let k = 0; k < pesi.length; k++) s += pesi[k] * righe[(inizio + k) * w + x];
      dati[y * w + x] = Math.round(s);
    }
  }
  return { dati, larghezza: w, altezza: h };
}

function ingrandisci(g: Grigio, w: number, h: number): Grigio {
  const sx = g.larghezza / w, sy = g.altezza / h;
  const dati = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const fy = Math.min(Math.max((y + 0.5) * sy - 0.5, 0), g.altezza - 1);
    const y0 = Math.floor(fy), y1 = Math.min(y0 + 1, g.altezza - 1), ty = fy - y0;
    for (let x = 0; x < w; x++) {
      const fx = Math.min(Math.max((x + 0.5) * sx - 0.5, 0), g.larghezza - 1);
      const x0 = Math.floor(fx), x1 = Math.min(x0 + 1, g.larghezza - 1), tx = fx - x0;
      const a = g.dati[y0 * g.larghezza + x0] * (1 - tx) + g.dati[y0 * g.larghezza + x1] * tx;
      const b = g.dati[y1 * g.larghezza + x0] * (1 - tx) + g.dati[y1 * g.larghezza + x1] * tx;
      dati[y * w + x] = Math.round(a * (1 - ty) + b * ty);
    }
  }
  return { dati, larghezza: w, altezza: h };
}

/** Lato lungo a `lato` px, proporzioni conservate. */
export function riduci(g: Grigio, lato = LATO): { grigio: Grigio; scala: number } {
  const scala = lato / Math.max(g.larghezza, g.altezza);
  const w = Math.max(1, Math.round(g.larghezza * scala)), h = Math.max(1, Math.round(g.altezza * scala));
  return { grigio: scala < 1 ? riduciArea(g, w, h) : ingrandisci(g, w, h), scala };
}

/** Valori in [0, 1] (1 = bianco), completato di bianco a destra e in basso fino a multipli di 32. */
export function tensore(g: Grigio): { dati: Float32Array; H: number; W: number } {
  const W = Math.ceil(g.larghezza / 32) * 32, H = Math.ceil(g.altezza / 32) * 32;
  const dati = new Float32Array(W * H).fill(1);
  for (let y = 0; y < g.altezza; y++) {
    for (let x = 0; x < g.larghezza; x++) dati[y * W + x] = g.dati[y * g.larghezza + x] / 255;
  }
  return { dati, H, W };
}

/** Il riquadro allargato del `margine` (frazione del suo lato lungo); fuori dalla foto, bianco. */
export function ritaglia(g: Grigio, r: Riquadro, margine = 0.15): { grigio: Grigio; origine: { x: number; y: number } } {
  const m = margine * Math.max(r.x1 - r.x0, r.y1 - r.y0);
  const x0 = Math.round(r.x0 - m), y0 = Math.round(r.y0 - m);
  const w = Math.max(1, Math.round(r.x1 + m) - x0), h = Math.max(1, Math.round(r.y1 + m) - y0);
  const dati = new Uint8Array(w * h).fill(255);
  for (let y = Math.max(0, -y0); y < Math.min(h, g.altezza - y0); y++) {
    for (let x = Math.max(0, -x0); x < Math.min(w, g.larghezza - x0); x++) {
      dati[y * w + x] = g.dati[(y + y0) * g.larghezza + x + x0];
    }
  }
  return { grigio: { dati, larghezza: w, altezza: h }, origine: { x: x0, y: y0 } };
}

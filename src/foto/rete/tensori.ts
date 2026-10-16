/**
 * TENSORI — le uscite della rete come array, e le operazioni elementari.
 *
 * Le celle sono in pixel d'ingresso con y verso il basso: la cella
 * (riga i, colonna j) a passo s copre i pixel s·j … s·j + s − 1, quindi il
 * suo centro è a s·j + (s − 1)/2 (centri dei pixel sugli interi).
 */

import { CLASSI, PASSO_TESTA, SOGLIA } from './vocabolario.js';

export interface Uscite {
  /** classe per cella, h2 × w2 (passo 2) */
  seg: Uint8Array;
  h2: number;
  w2: number;
  /** 43 × h4 × w4 (passo 4): probabilità sulle mappe, valori sulle regressioni */
  testa: Float32Array;
  h4: number;
  w4: number;
}

export interface Picco { i: number; j: number; v: number }

export function canale(u: Uscite, k: number): Float32Array {
  const n = u.h4 * u.w4;
  return u.testa.subarray(k * n, (k + 1) * n);
}

export function massimoCanali(u: Uscite, canali: number[]): Float32Array {
  const m = new Float32Array(u.h4 * u.w4);
  for (const k of canali) {
    const c = canale(u, k);
    for (let n = 0; n < m.length; n++) if (c[n] > m[n]) m[n] = c[n];
  }
  return m;
}

/** Massimi locali 3×3 sopra la soglia. */
export function picchi(m: Float32Array, h: number, w: number, soglia = SOGLIA): Picco[] {
  const out: Picco[] = [];
  for (let i = 0; i < h; i++) {
    for (let j = 0; j < w; j++) {
      const v = m[i * w + j];
      if (v <= soglia) continue;
      let massimo = true;
      for (let di = -1; di <= 1 && massimo; di++) {
        for (let dj = -1; dj <= 1; dj++) {
          if ((di || dj) && i + di >= 0 && i + di < h && j + dj >= 0 && j + dj < w
              && m[(i + di) * w + j + dj] > v) {
            massimo = false;
            break;
          }
        }
      }
      if (massimo) out.push({ i, j, v });
    }
  }
  return out;
}

export function centroCella(i: number, j: number, passo = PASSO_TESTA): { x: number; y: number } {
  return { x: j * passo + (passo - 1) / 2, y: i * passo + (passo - 1) / 2 };
}

/** Classe col logit maggiore, cella per cella (logit: 7 × h2 × w2). */
export function segDaLogit(logit: Float32Array, h2: number, w2: number): Uint8Array {
  const n = h2 * w2;
  const seg = new Uint8Array(n);
  for (let p = 0; p < n; p++) {
    let migliore = 0;
    for (let c = 1; c < CLASSI; c++) if (logit[c * n + p] > logit[migliore * n + p]) migliore = c;
    seg[p] = migliore;
  }
  return seg;
}

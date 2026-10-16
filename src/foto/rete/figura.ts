/**
 * FIGURE NELLA PAGINA — dalla segmentazione della prima passata ai riquadri.
 *
 * Le celle di disegno (asta, simbolo, carico, ausiliaria) vicine fra loro
 * (entro 3 celle) formano una figura. Prima vengono le figure che sono
 * uno SCHEMA (celle d'asta e almeno un vincolo, cioè un picco dei canali
 * dei corpi), poi le altre per quantità d'asta: una sezione trasversale o
 * un grafico, anche se più grandi, non passano davanti. Il riquadro si
 * allarga al testo e alle quote che gli stanno attorno (entro 4 celle).
 * Riquadri in pixel d'ingresso, y giù.
 */

import { massimoCanali, picchi, centroCella, type Uscite } from './tensori.js';
import { CLASSE, CORPO0, PASSO_SEG, TIPI_CORPO } from './vocabolario.js';

export interface Riquadro { x0: number; y0: number; x1: number; y1: number }
export interface Figura { riquadro: Riquadro; aste: number; simboli: number; vincoli: number }

export const FIGURE = { vicinanza: 3, contorno: 4 };

export function trovaFigure(u: Uscite): Figura[] {
  const { seg, h2, w2 } = u;
  const disegno = (c: number) => c === CLASSE.asta || c === CLASSE.simbolo || c === CLASSE.carico || c === CLASSE.ausiliaria;
  // dilatazione: una cella appartiene alla zona se c'è disegno entro `vicinanza` celle
  const r = FIGURE.vicinanza;
  const somme = new Int32Array((h2 + 1) * (w2 + 1));
  for (let i = 0; i < h2; i++) {
    for (let j = 0; j < w2; j++) {
      somme[(i + 1) * (w2 + 1) + j + 1] = (disegno(seg[i * w2 + j]) ? 1 : 0)
        + somme[i * (w2 + 1) + j + 1] + somme[(i + 1) * (w2 + 1) + j] - somme[i * (w2 + 1) + j];
    }
  }
  const zona = (i: number, j: number) => {
    const a = Math.max(0, i - r), b = Math.min(h2, i + r + 1), c = Math.max(0, j - r), d = Math.min(w2, j + r + 1);
    return somme[b * (w2 + 1) + d] - somme[a * (w2 + 1) + d] - somme[b * (w2 + 1) + c] + somme[a * (w2 + 1) + c] > 0;
  };
  const etichetta = new Int32Array(h2 * w2).fill(-1);
  const figure: { i0: number; i1: number; j0: number; j1: number; aste: number; simboli: number; vincoli: number }[] = [];
  const coda = new Int32Array(h2 * w2);
  for (let p0 = 0; p0 < h2 * w2; p0++) {
    if (etichetta[p0] >= 0 || !disegno(seg[p0])) continue;
    const f = { i0: h2, i1: -1, j0: w2, j1: -1, aste: 0, simboli: 0, vincoli: 0 };
    const n = figure.length;
    let testa = 0, fondo = 0;
    coda[fondo++] = p0;
    etichetta[p0] = n;
    while (testa < fondo) {
      const p = coda[testa++];
      const i = Math.floor(p / w2), j = p % w2;
      if (disegno(seg[p])) {
        f.i0 = Math.min(f.i0, i); f.i1 = Math.max(f.i1, i); f.j0 = Math.min(f.j0, j); f.j1 = Math.max(f.j1, j);
        if (seg[p] === CLASSE.asta) f.aste++;
        if (seg[p] === CLASSE.simbolo) f.simboli++;
      }
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const a = i + di, b = j + dj;
        if (a < 0 || a >= h2 || b < 0 || b >= w2 || etichetta[a * w2 + b] >= 0 || !zona(a, b)) continue;
        etichetta[a * w2 + b] = n;
        coda[fondo++] = a * w2 + b;
      }
    }
    figure.push(f);
  }
  // vincoli: picchi dei canali dei corpi dentro la zona della figura
  const corpi = picchi(massimoCanali(u, TIPI_CORPO.map((_, k) => CORPO0 + k)), u.h4, u.w4);
  for (const p of corpi) {
    const c = centroCella(p.i, p.j);
    const i = Math.min(h2 - 1, Math.floor(c.y / PASSO_SEG)), j = Math.min(w2 - 1, Math.floor(c.x / PASSO_SEG));
    const n = etichetta[i * w2 + j];
    if (n >= 0) figure[n].vincoli++;
  }
  // contorno: testo e quote vicini al riquadro
  const k = FIGURE.contorno;
  for (const f of figure) {
    let { i0, i1, j0, j1 } = f;
    for (let i = Math.max(0, f.i0 - k); i <= Math.min(h2 - 1, f.i1 + k); i++) {
      for (let j = Math.max(0, f.j0 - k); j <= Math.min(w2 - 1, f.j1 + k); j++) {
        const c = seg[i * w2 + j];
        if (c === CLASSE.testo || c === CLASSE.ausiliaria) {
          i0 = Math.min(i0, i); i1 = Math.max(i1, i); j0 = Math.min(j0, j); j1 = Math.max(j1, j);
        }
      }
    }
    Object.assign(f, { i0, i1, j0, j1 });
  }
  const schema = (f: { aste: number; vincoli: number }) => f.aste > 0 && f.vincoli > 0;
  return figure
    .sort((a, b) => Number(schema(b)) - Number(schema(a)) || b.aste - a.aste)
    .map((f) => ({
      riquadro: { x0: f.j0 * PASSO_SEG, y0: f.i0 * PASSO_SEG, x1: (f.j1 + 1) * PASSO_SEG, y1: (f.i1 + 1) * PASSO_SEG },
      aste: f.aste, simboli: f.simboli, vincoli: f.vincoli,
    }));
}

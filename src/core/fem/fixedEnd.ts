/**
 * Carichi nodali equivalenti (vettore dei termini noti dell'elemento).
 *
 * CONVENZIONE — qui si calcola  f_eq = ∫ Nᵀ q dx , cioè le forze da SOMMARE al
 * vettore dei carichi globale. Le classiche "forze di incastro perfetto" sono
 * il suo opposto: −f_eq. Le forze d'estremità dell'elemento si ricavano poi
 * come  s = k·d − f_eq .
 *
 * Con questa convenzione, per carico uniforme q_y su tutta l'asta:
 *     f_eq = [0, q_y L/2, q_y L²/12, 0, q_y L/2, −q_y L²/12]
 * e su trave incastrata-incastrata si ottiene M(0) = q_y L²/12, cioè −qL²/12
 * per carico verso il basso: il classico momento di incastro perfetto.
 *
 * I carichi distribuiti trapezoidali su tratto PARZIALE sono integrati con
 * quadratura di Gauss a 3 punti: le funzioni di forma sono cubiche e il carico
 * è lineare, quindi il prodotto è di grado 4 e la quadratura è ESATTA.
 */

import type { Vec6 } from './stiffness.js';

/** Funzioni di forma di Hermite per lo spostamento trasversale. */
export function hermite(xi: number, L: number): [number, number, number, number] {
  const x2 = xi * xi;
  const x3 = x2 * xi;
  return [
    1 - 3 * x2 + 2 * x3,
    L * (xi - 2 * x2 + x3),
    3 * x2 - 2 * x3,
    L * (-x2 + x3),
  ];
}

/** Derivate rispetto a x (non a ξ) delle funzioni di Hermite. */
export function hermiteDerivate(xi: number, L: number): [number, number, number, number] {
  const x2 = xi * xi;
  return [
    (-6 * xi + 6 * x2) / L,
    1 - 4 * xi + 3 * x2,
    (6 * xi - 6 * x2) / L,
    -2 * xi + 3 * x2,
  ];
}

// nodi e pesi della quadratura di Gauss a 3 punti su [-1, 1]
const GAUSS_X = [-Math.sqrt(3 / 5), 0, Math.sqrt(3 / 5)];
const GAUSS_W = [5 / 9, 8 / 9, 5 / 9];

export interface DistribuitoLocale {
  /** ascisse relative del tratto caricato */
  sIniziale: number;
  sFinale: number;
  /** intensità nel riferimento LOCALE dell'asta [N/m] */
  qxIniziale: number;
  qxFinale: number;
  qyIniziale: number;
  qyFinale: number;
}

/**
 * Carico distribuito trapezoidale su un tratto [s₁, s₂] ⊂ [0,1].
 * Le intensità agli estremi si riferiscono agli estremi DEL TRATTO.
 */
export function feqDistribuito(d: DistribuitoLocale, L: number): Vec6 {
  const f = new Float64Array(6);
  const s1 = Math.max(0, Math.min(1, d.sIniziale));
  const s2 = Math.max(0, Math.min(1, d.sFinale));
  if (s2 <= s1) return f;

  const meta = (s2 - s1) / 2;
  const centro = (s2 + s1) / 2;

  for (let g = 0; g < 3; g++) {
    const xi = centro + meta * GAUSS_X[g];
    // peso: dx = L·dξ, e dξ = meta·d(gauss)
    const w = GAUSS_W[g] * meta * L;
    // interpolazione lineare del carico sul tratto
    const t = (xi - s1) / (s2 - s1);
    const qx = d.qxIniziale + (d.qxFinale - d.qxIniziale) * t;
    const qy = d.qyIniziale + (d.qyFinale - d.qyIniziale) * t;

    const [H1, H2, H3, H4] = hermite(xi, L);
    f[0] += w * (1 - xi) * qx;
    f[3] += w * xi * qx;
    f[1] += w * H1 * qy;
    f[2] += w * H2 * qy;
    f[4] += w * H3 * qy;
    f[5] += w * H4 * qy;
  }
  return f;
}

/**
 * Forza concentrata in campata all'ascissa relativa s, componenti LOCALI.
 * Con i carichi consistenti l'elemento di Hermite fornisce spostamenti nodali
 * ESATTI anche per carichi concentrati in campata: non serve infittire.
 */
export function feqForzaInCampata(s: number, fx: number, fy: number, L: number): Vec6 {
  const f = new Float64Array(6);
  const xi = Math.max(0, Math.min(1, s));
  const [H1, H2, H3, H4] = hermite(xi, L);
  f[0] = (1 - xi) * fx;
  f[3] = xi * fx;
  f[1] = H1 * fy;
  f[2] = H2 * fy;
  f[4] = H3 * fy;
  f[5] = H4 * fy;
  return f;
}

/**
 * Momento concentrato in campata. Il lavoro virtuale è M·θ = M·v′, quindi il
 * carico consistente è M moltiplicato per le DERIVATE delle funzioni di forma.
 */
export function feqMomentoInCampata(s: number, mz: number, L: number): Vec6 {
  const f = new Float64Array(6);
  const xi = Math.max(0, Math.min(1, s));
  const [d1, d2, d3, d4] = hermiteDerivate(xi, L);
  f[1] = d1 * mz;
  f[2] = d2 * mz;
  f[4] = d3 * mz;
  f[5] = d4 * mz;
  return f;
}

/**
 * Variazione termica.
 *
 * UNIFORME — la dilatazione libera è ε = α·ΔT. Bloccata, produce
 * N = −E·A·α·ΔT (riscaldare una barra vincolata la mette in COMPRESSIONE).
 *
 * GRADIENTE — ΔT_grad = T(fibra +y_loc) − T(fibra −y_loc). La curvatura libera
 * è v″ = −α·ΔT_grad/h. Su trave a estremi bloccati nasce il momento costante
 * M = +E·I·α·ΔT_grad/h: se la fibra superiore è più calda e non può allungarsi,
 * va in compressione, cioè momento positivo (fibre inferiori tese).
 */
export function feqTermico(
  E: number, A: number, I: number, alpha: number, h: number,
  deltaTUniforme: number, deltaTGradiente: number,
): Vec6 {
  const f = new Float64Array(6);
  const Nt = E * A * alpha * deltaTUniforme;
  f[0] = -Nt;
  f[3] = Nt;
  if (h > 0 && deltaTGradiente !== 0) {
    const Mt = (E * I * alpha * deltaTGradiente) / h;
    f[2] = Mt;
    f[5] = -Mt;
  }
  return f;
}

/** Peso proprio: carico uniforme verticale verso il basso, in assi GLOBALI. */
export function pesoProprioGlobale(rho: number, A: number, g: number): { qx: number; qy: number } {
  return { qx: 0, qy: -rho * A * g };
}

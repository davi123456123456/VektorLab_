/**
 * Matrice simmetrica sparsa a profilo (skyline) e fattorizzazione LDLᵀ.
 *
 * FORMULAZIONE — cerchiamo A = L·D·Lᵀ con L unitaria triangolare inferiore.
 * Dalla definizione, per i ≤ j:
 *
 *     A[i][j] = Σ_{k≤i} L[i][k]·D[k]·L[j][k] = Σ_{k<i} L[i][k]·D[k]·L[j][k] + D[i]·L[j][i]
 *
 * Posto W[i][j] := D[i]·L[j][i] si ottengono le due ricorrenze usate sotto:
 *
 *     W[i][j] = A[i][j] − Σ_{k<i} L[i][k]·W[k][j]            (i < j)
 *     D[j]    = A[j][j] − Σ_{k<j} L[j][k]·W[k][j]
 *
 * MEMORIZZAZIONE — del triangolo superiore si tiene, per ogni colonna j, il
 * tratto A[h[j]..j][j] in ordine crescente di riga. Al termine la stessa
 * memoria contiene L (fuori diagonale) e D (sulla diagonale).
 *
 * LDLᵀ e non Cholesky: non richiede radici quadrate e resta definita anche
 * quando la matrice è solo semidefinita, cosa che qui accade regolarmente
 * (struttura labile ⇒ pivot nullo ⇒ meccanismo, vedi `nucleoDaFattorizzazione`).
 */

import { cuthillMcKeeInverso, invertiPermutazione } from './ordering.js';

export interface Terna { i: number; j: number; v: number }

/** Accumulatore per l'assemblaggio: somma contributi sullo stesso (i,j). */
export class CostruttoreSparso {
  private readonly mappa = new Map<number, number>();
  constructor(public readonly n: number) {}

  /**
   * Accumula il contributo sull'elemento K[i][j].
   *
   * ATTENZIONE AL CONTRATTO: la matrice è simmetrica e se ne memorizza solo il
   * triangolo superiore, quindi (i,j) e (j,i) sono LA STESSA cella. I
   * contributi con i > j vengono ignorati: chi assembla scorre l'intera
   * matrice di elemento (6×6) e fornisce entrambi i termini simmetrici;
   * sommarli tutti e due raddoppierebbe i termini fuori diagonale.
   */
  aggiungi(i: number, j: number, v: number): void {
    if (v === 0 || i > j) return;
    const chiave = i * this.n + j;
    this.mappa.set(chiave, (this.mappa.get(chiave) ?? 0) + v);
  }

  terne(): Terna[] {
    const out: Terna[] = [];
    for (const [chiave, v] of this.mappa) {
      out.push({ i: Math.floor(chiave / this.n), j: chiave % this.n, v });
    }
    return out;
  }

  /** adiacenza del grafo dei DOF, per il riordinamento */
  adiacenza(): number[][] {
    const adj: Set<number>[] = Array.from({ length: this.n }, () => new Set<number>());
    for (const { i, j } of this.terne()) {
      if (i !== j) { adj[i].add(j); adj[j].add(i); }
    }
    return adj.map((s) => [...s]);
  }
}

export class MatriceSkyline {
  readonly n: number;
  /** h[j] = indice della prima riga memorizzata nella colonna j */
  readonly h: Int32Array;
  /** offset in `val` dell'elemento A[h[j]][j] */
  readonly colStart: Int32Array;
  readonly val: Float64Array;

  private constructor(n: number, h: Int32Array, colStart: Int32Array, val: Float64Array) {
    this.n = n; this.h = h; this.colStart = colStart; this.val = val;
  }

  static daTerne(n: number, terne: Terna[]): MatriceSkyline {
    const h = new Int32Array(n);
    for (let j = 0; j < n; j++) h[j] = j;
    for (const { i, j } of terne) if (i < h[j]) h[j] = i;

    const colStart = new Int32Array(n + 1);
    let off = 0;
    for (let j = 0; j < n; j++) { colStart[j] = off; off += j - h[j] + 1; }
    colStart[n] = off;

    const val = new Float64Array(off);
    const M = new MatriceSkyline(n, h, colStart, val);
    for (const { i, j, v } of terne) M.set(i, j, M.get(i, j) + v);
    return M;
  }

  get(i: number, j: number): number {
    if (i > j) { const t = i; i = j; j = t; }
    if (i < this.h[j]) return 0;
    return this.val[this.colStart[j] + (i - this.h[j])];
  }

  set(i: number, j: number, v: number): void {
    if (i > j) { const t = i; i = j; j = t; }
    if (i < this.h[j]) throw new Error(`Fuori profilo: (${i},${j})`);
    this.val[this.colStart[j] + (i - this.h[j])] = v;
  }

  /** numero di termini memorizzati (misura del profilo) */
  get dimensioneProfilo(): number { return this.val.length; }
}

export interface Fattorizzazione {
  M: MatriceSkyline;
  /** D[j] della decomposizione; ≈0 ⇒ direzione labile */
  D: Float64Array;
  dofSingolari: number[];
  pivotMinimo: number;
}

/**
 * Fattorizza IN PLACE. I pivot nulli non fanno fallire: vengono registrati e
 * sostituiti con 1, così la sostituzione produce comunque una soluzione
 * particolare (con quei DOF bloccati a zero) e il chiamante può estrarre i
 * modi di meccanismo. Fallire silenziosamente su una struttura labile sarebbe
 * il peggior comportamento possibile per un software didattico.
 */
export function fattorizzaLDLT(M: MatriceSkyline, tolRel = 1e-12): Fattorizzazione {
  const n = M.n;
  const D = new Float64Array(n);
  const w = new Float64Array(n);
  const dofSingolari: number[] = [];

  // scala di riferimento per la tolleranza: massimo termine diagonale iniziale
  let scala = 0;
  for (let j = 0; j < n; j++) scala = Math.max(scala, Math.abs(M.get(j, j)));
  if (scala === 0) scala = 1;
  const soglia = tolRel * scala;

  let pivotMinimo = Infinity;

  for (let j = 0; j < n; j++) {
    const hj = M.h[j];

    // W[i][j] per i = hj .. j-1
    for (let i = hj; i < j; i++) {
      const hi = M.h[i];
      const k0 = hi > hj ? hi : hj;
      let s = M.get(i, j);
      for (let k = k0; k < i; k++) s -= M.get(k, i) * w[k];
      w[i] = s;
    }

    // diagonale e conversione W → L
    let d = M.get(j, j);
    for (let k = hj; k < j; k++) {
      const Lkj = w[k] / D[k];
      d -= Lkj * w[k];
      M.set(k, j, Lkj);
    }

    if (Math.abs(d) < soglia) {
      dofSingolari.push(j);
      pivotMinimo = Math.min(pivotMinimo, Math.abs(d));
      d = 1; // regolarizzazione: vedi commento sopra
    } else {
      pivotMinimo = Math.min(pivotMinimo, Math.abs(d));
    }
    D[j] = d;
    M.set(j, j, d);
  }

  return { M, D, dofSingolari, pivotMinimo: Number.isFinite(pivotMinimo) ? pivotMinimo : 0 };
}

/** Risolve A·x = b usando una fattorizzazione già calcolata. */
export function sostituisci(f: Fattorizzazione, b: Float64Array): Float64Array {
  const { M, D } = f;
  const n = M.n;
  const x = new Float64Array(n);
  for (let i = 0; i < n; i++) x[i] = b[i];

  // avanti: L·y = b
  for (let i = 0; i < n; i++) {
    const hi = M.h[i];
    let s = x[i];
    for (let k = hi; k < i; k++) s -= M.get(k, i) * x[k];
    x[i] = s;
  }
  // diagonale: D·z = y
  const singolari = new Set(f.dofSingolari);
  for (let i = 0; i < n; i++) x[i] = singolari.has(i) ? 0 : x[i] / D[i];
  // indietro: Lᵀ·x = z
  for (let j = n - 1; j >= 0; j--) {
    const xj = x[j];
    if (xj === 0) continue;
    const hj = M.h[j];
    for (let k = hj; k < j; k++) x[k] -= M.get(k, j) * xj;
  }
  return x;
}

/**
 * Modi di meccanismo dal nucleo della fattorizzazione.
 * Se D[j₀] = 0, il vettore v che risolve Lᵀ·v = e_{j₀} soddisfa
 *     A·v = L·D·Lᵀ·v = L·D·e_{j₀} = D[j₀]·L·e_{j₀} = 0 .
 */
export function nucleoDaFattorizzazione(f: Fattorizzazione): Float64Array[] {
  const { M } = f;
  const n = M.n;
  const out: Float64Array[] = [];
  for (const j0 of f.dofSingolari) {
    const v = new Float64Array(n);
    v[j0] = 1;
    for (let j = n - 1; j >= 0; j--) {
      const vj = v[j];
      if (vj === 0) continue;
      const hj = M.h[j];
      for (let k = hj; k < j; k++) v[k] -= M.get(k, j) * vj;
    }
    let norma = 0;
    for (let i = 0; i < n; i++) norma += v[i] * v[i];
    norma = Math.sqrt(norma);
    if (norma > 0) for (let i = 0; i < n; i++) v[i] /= norma;
    out.push(v);
  }
  return out;
}

// ────────────────────────────────────────────────────────────────────────────
// Interfaccia di alto livello: riordina, fattorizza, risolve, de-riordina.
// ────────────────────────────────────────────────────────────────────────────

export interface SolutoreSPD {
  risolvi(b: Float64Array): Float64Array;
  dofSingolari: number[];
  pivotMinimo: number;
  nucleo(): Float64Array[];
  dimensioneProfilo: number;
}

export function preparaSolutore(
  costruttore: CostruttoreSparso,
  riordina = true,
): SolutoreSPD {
  const n = costruttore.n;
  const perm = riordina && n > 1
    ? cuthillMcKeeInverso(costruttore.adiacenza())
    : Int32Array.from({ length: n }, (_, k) => k);
  const inv = invertiPermutazione(perm);

  const terne = costruttore.terne().map(({ i, j, v }) => {
    const a = inv[i], b = inv[j];
    return a <= b ? { i: a, j: b, v } : { i: b, j: a, v };
  });

  const M = MatriceSkyline.daTerne(n, terne);
  const f = fattorizzaLDLT(M);

  return {
    dofSingolari: f.dofSingolari.map((j) => perm[j]),
    pivotMinimo: f.pivotMinimo,
    dimensioneProfilo: M.dimensioneProfilo,
    risolvi(b: Float64Array): Float64Array {
      const bp = new Float64Array(n);
      for (let k = 0; k < n; k++) bp[k] = b[perm[k]];
      const xp = sostituisci(f, bp);
      const x = new Float64Array(n);
      for (let k = 0; k < n; k++) x[perm[k]] = xp[k];
      return x;
    },
    nucleo(): Float64Array[] {
      return nucleoDaFattorizzazione(f).map((vp) => {
        const v = new Float64Array(n);
        for (let k = 0; k < n; k++) v[perm[k]] = vp[k];
        return v;
      });
    },
  };
}

/**
 * Svincoli di estremità mediante CONDENSAZIONE STATICA.
 *
 * Uno svincolo dichiara che una componente della sollecitazione NON è
 * trasmessa fra asta e nodo. In termini di gradi di libertà: la forza
 * dell'elemento su quel DOF è nulla, e il corrispondente spostamento diventa
 * una variabile interna all'elemento. Partizionando in DOF conservati (c) e
 * rilasciati (r):
 *
 *     ⎡k_cc  k_cr⎤ ⎧d_c⎫   ⎧f_c⎫
 *     ⎣k_rc  k_rr⎦ ⎩d_r⎭ = ⎩f_r⎭      con la riga r che impone forza nulla
 *
 *     d_r      = k_rr⁻¹ (f_r − k_rc·d_c)
 *     k_ridotta = k_cc − k_cr·k_rr⁻¹·k_rc
 *     f_ridotto = f_c  − k_cr·k_rr⁻¹·f_r
 *
 * Rispetto ai nodi master/slave con equazioni di uguaglianza, la condensazione
 * non introduce DOF aggiuntivi né moltiplicatori, e permette di recuperare
 * esattamente d_r a posteriori per ricostruire le azioni interne.
 *
 * Corrispondenza svincolo → DOF locale:
 *     N iniziale → 0 (u₁)   T iniziale → 1 (v₁)   M iniziale → 2 (θ₁)
 *     N finale   → 3 (u₂)   T finale   → 4 (v₂)   M finale   → 5 (θ₂)
 */

import { idx6, mat6, type Mat6, type Vec6 } from './stiffness.js';
import type { SvincoloEstremita } from '../model/types.js';

export function dofRilasciati(
  iniziale: SvincoloEstremita,
  finale: SvincoloEstremita,
): number[] {
  const r: number[] = [];
  if (iniziale.N) r.push(0);
  if (iniziale.T) r.push(1);
  if (iniziale.M) r.push(2);
  if (finale.N) r.push(3);
  if (finale.T) r.push(4);
  if (finale.M) r.push(5);
  return r;
}

export interface ElementoCondensato {
  /** rigidezza 6×6 con i DOF rilasciati condensati (righe/colonne nulle su r) */
  k: Mat6;
  /** carichi equivalenti corrispondenti */
  f: Vec6;
  rilasciati: number[];
  /** ricostruisce i 6 spostamenti locali completi da quelli conservati */
  recuperaSpostamenti(dCondensati: Vec6): Vec6;
  /** true se k_rr è singolare: svincoli incompatibili (asta scollegata) */
  degenere: boolean;
}

/** Inversione di una matrice piccola con Gauss-Jordan e pivoting parziale. */
function invertiPiccola(A: number[][], tol: number): number[][] | null {
  const n = A.length;
  const M = A.map((r, i) => [...r, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    if (Math.abs(M[piv][col]) < tol) return null;
    [M[col], M[piv]] = [M[piv], M[col]];
    const d = M[col][col];
    for (let j = 0; j < 2 * n; j++) M[col][j] /= d;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col];
      if (f === 0) continue;
      for (let j = 0; j < 2 * n; j++) M[r][j] -= f * M[col][j];
    }
  }
  return M.map((r) => r.slice(n));
}

export function condensa(
  kPiena: Mat6,
  fPiena: Vec6,
  rilasciati: number[],
): ElementoCondensato {
  if (rilasciati.length === 0) {
    const k = kPiena.slice() as Mat6;
    const f = fPiena.slice() as Vec6;
    return {
      k, f, rilasciati: [], degenere: false,
      recuperaSpostamenti: (d) => d.slice() as Vec6,
    };
  }

  const rSet = new Set(rilasciati);
  const conservati = [0, 1, 2, 3, 4, 5].filter((i) => !rSet.has(i));

  // scala di riferimento per la tolleranza di singolarità
  let scala = 0;
  for (let i = 0; i < 6; i++) scala = Math.max(scala, Math.abs(kPiena[idx6(i, i)]));
  const tol = 1e-12 * (scala || 1);

  const krr = rilasciati.map((a) => rilasciati.map((b) => kPiena[idx6(a, b)]));
  const krrInv = invertiPiccola(krr, tol);

  if (!krrInv) {
    // k_rr singolare: p.es. sforzo normale rilasciato a ENTRAMBE le estremità.
    // L'asta risulta scollegata in quella direzione. Si restituisce la
    // rigidezza con le righe/colonne rilasciate azzerate e si segnala.
    const k = mat6();
    const f = new Float64Array(6);
    for (const a of conservati) {
      f[a] = fPiena[a];
      for (const b of conservati) k[idx6(a, b)] = kPiena[idx6(a, b)];
    }
    return {
      k, f, rilasciati, degenere: true,
      recuperaSpostamenti: (d) => d.slice() as Vec6,
    };
  }

  const nr = rilasciati.length;
  // W = k_rr⁻¹ · k_rc   (nr × 6, colonne sui DOF conservati)
  const W: number[][] = Array.from({ length: nr }, () => new Array(6).fill(0));
  for (let a = 0; a < nr; a++) {
    for (const cIdx of conservati) {
      let s = 0;
      for (let b = 0; b < nr; b++) s += krrInv[a][b] * kPiena[idx6(rilasciati[b], cIdx)];
      W[a][cIdx] = s;
    }
  }
  // z = k_rr⁻¹ · f_r
  const z = new Float64Array(nr);
  for (let a = 0; a < nr; a++) {
    let s = 0;
    for (let b = 0; b < nr; b++) s += krrInv[a][b] * fPiena[rilasciati[b]];
    z[a] = s;
  }

  const k = mat6();
  const f = new Float64Array(6);
  for (const a of conservati) {
    let fa = fPiena[a];
    for (let p = 0; p < nr; p++) fa -= kPiena[idx6(a, rilasciati[p])] * z[p];
    f[a] = fa;
    for (const b of conservati) {
      let v = kPiena[idx6(a, b)];
      for (let p = 0; p < nr; p++) v -= kPiena[idx6(a, rilasciati[p])] * W[p][b];
      k[idx6(a, b)] = v;
    }
  }

  const recuperaSpostamenti = (dCond: Vec6): Vec6 => {
    const d = dCond.slice() as Vec6;
    for (let a = 0; a < nr; a++) {
      let s = z[a];
      for (const cIdx of conservati) s -= W[a][cIdx] * dCond[cIdx];
      d[rilasciati[a]] = s;
    }
    return d;
  };

  return { k, f, rilasciati, degenere: false, recuperaSpostamenti };
}

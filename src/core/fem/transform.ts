/**
 * Trasformazioni fra riferimento locale dell'asta, globale e "di nodo".
 *
 * Il riferimento di nodo serve per i VINCOLI OBLIQUI (carrello su piano
 * inclinato, biella comunque orientata): invece di introdurre moltiplicatori
 * di Lagrange, si ruotano i gradi di libertà del nodo in modo che il vincolo
 * risulti allineato a un asse, e lo si impone bloccando quella componente.
 * È la tecnica standard (nodal coordinate transformation) ed è esatta.
 */

import { idx6, mat6, type Mat6, type Vec6 } from './stiffness.js';

/** Matrice di rotazione 6×6: d_loc = T · d_glob, con c,s dell'asse locale x. */
export function matriceRotazione(c: number, s: number): Mat6 {
  const T = mat6();
  T[idx6(0, 0)] = c;  T[idx6(0, 1)] = s;
  T[idx6(1, 0)] = -s; T[idx6(1, 1)] = c;
  T[idx6(2, 2)] = 1;
  T[idx6(3, 3)] = c;  T[idx6(3, 4)] = s;
  T[idx6(4, 3)] = -s; T[idx6(4, 4)] = c;
  T[idx6(5, 5)] = 1;
  return T;
}

/** Rotazione a blocchi per i due nodi dell'asta (per i vincoli obliqui). */
export function matriceRotazioneNodi(angoloI: number, angoloJ: number): Mat6 {
  const R = mat6();
  const ci = Math.cos(angoloI), si = Math.sin(angoloI);
  const cj = Math.cos(angoloJ), sj = Math.sin(angoloJ);
  R[idx6(0, 0)] = ci;  R[idx6(0, 1)] = -si;
  R[idx6(1, 0)] = si;  R[idx6(1, 1)] = ci;
  R[idx6(2, 2)] = 1;
  R[idx6(3, 3)] = cj;  R[idx6(3, 4)] = -sj;
  R[idx6(4, 3)] = sj;  R[idx6(4, 4)] = cj;
  R[idx6(5, 5)] = 1;
  return R;
}

/** C = Aᵀ · B · A */
export function congruenza(A: Mat6, B: Mat6): Mat6 {
  const tmp = mat6();  // tmp = B · A
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < 6; j++) {
      let s = 0;
      for (let k = 0; k < 6; k++) s += B[idx6(i, k)] * A[idx6(k, j)];
      tmp[idx6(i, j)] = s;
    }
  }
  const C = mat6();  // C = Aᵀ · tmp
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < 6; j++) {
      let s = 0;
      for (let k = 0; k < 6; k++) s += A[idx6(k, i)] * tmp[idx6(k, j)];
      C[idx6(i, j)] = s;
    }
  }
  return C;
}

/** y = A · x */
export function moltiplica(A: Mat6, x: Vec6): Vec6 {
  const y = new Float64Array(6);
  for (let i = 0; i < 6; i++) {
    let s = 0;
    for (let k = 0; k < 6; k++) s += A[idx6(i, k)] * x[k];
    y[i] = s;
  }
  return y;
}

/** y = Aᵀ · x */
export function moltiplicaTrasposta(A: Mat6, x: Vec6): Vec6 {
  const y = new Float64Array(6);
  for (let i = 0; i < 6; i++) {
    let s = 0;
    for (let k = 0; k < 6; k++) s += A[idx6(k, i)] * x[k];
    y[i] = s;
  }
  return y;
}

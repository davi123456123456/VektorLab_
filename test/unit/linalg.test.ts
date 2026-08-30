import { describe, it, expect } from 'vitest';
import { CostruttoreSparso, preparaSolutore } from '../../src/core/linalg/skyline.js';
import { svd, rangoNumerico, nucleo } from '../../src/core/linalg/svd.js';

function risolviDenso(A: number[][], b: number[]): Float64Array {
  const n = A.length;
  const c = new CostruttoreSparso(n);
  for (let i = 0; i < n; i++) for (let j = i; j < n; j++) c.aggiungi(i, j, A[i][j]);
  const s = preparaSolutore(c);
  return s.risolvi(Float64Array.from(b));
}

describe('solutore LDLᵀ skyline', () => {
  it('risolve un sistema 3x3 definito positivo', () => {
    const A = [[4, 1, 0], [1, 3, 1], [0, 1, 2]];
    const b = [1, 2, 3];
    const x = risolviDenso(A, b);
    // verifica A·x = b
    for (let i = 0; i < 3; i++) {
      let s = 0;
      for (let j = 0; j < 3; j++) s += A[i][j] * x[j];
      expect(s).toBeCloseTo(b[i], 12);
    }
  });

  it('risolve un sistema più grande a banda', () => {
    const n = 60;
    const A = Array.from({ length: n }, () => new Array(n).fill(0));
    for (let i = 0; i < n; i++) {
      A[i][i] = 4;
      if (i > 0) { A[i][i - 1] = -1; A[i - 1][i] = -1; }
      if (i > 2) { A[i][i - 3] = -0.5; A[i - 3][i] = -0.5; }
    }
    const b = Array.from({ length: n }, (_, i) => Math.sin(i));
    const x = risolviDenso(A, b);
    let errMax = 0;
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let j = 0; j < n; j++) s += A[i][j] * x[j];
      errMax = Math.max(errMax, Math.abs(s - b[i]));
    }
    expect(errMax).toBeLessThan(1e-10);
  });

  it('rileva la singolarità e ne estrae il nucleo', () => {
    // matrice semidefinita: riga 2 = riga 0 + riga 1
    const A = [[2, -1, -1], [-1, 2, -1], [-1, -1, 2]];  // nucleo = (1,1,1)
    const n = 3;
    const c = new CostruttoreSparso(n);
    for (let i = 0; i < n; i++) for (let j = i; j < n; j++) c.aggiungi(i, j, A[i][j]);
    const s = preparaSolutore(c);
    expect(s.dofSingolari.length).toBe(1);
    const ns = s.nucleo();
    expect(ns.length).toBe(1);
    const v = ns[0];
    // A·v deve essere ~0
    for (let i = 0; i < n; i++) {
      let acc = 0;
      for (let j = 0; j < n; j++) acc += A[i][j] * v[j];
      expect(Math.abs(acc)).toBeLessThan(1e-10);
    }
    // e v deve essere proporzionale a (1,1,1)
    expect(Math.abs(Math.abs(v[0]) - Math.abs(v[1]))).toBeLessThan(1e-10);
    expect(Math.abs(Math.abs(v[1]) - Math.abs(v[2]))).toBeLessThan(1e-10);
  });
});

describe('SVD di Jacobi', () => {
  it('calcola i valori singolari di una matrice nota', () => {
    // diag(3,2) con rotazione: i valori singolari restano 3 e 2
    const th = 0.7;
    const c = Math.cos(th), s = Math.sin(th);
    const A = [[3 * c, -2 * s], [3 * s, 2 * c]];
    const r = svd(A);
    expect(r.sigma[0]).toBeCloseTo(3, 10);
    expect(r.sigma[1]).toBeCloseTo(2, 10);
    expect(rangoNumerico(r)).toBe(2);
  });

  it('individua il rango e il nucleo di una matrice deficiente', () => {
    // 3 righe, 3 colonne, rango 2: la terza riga è somma delle prime due
    const A = [[1, 2, 3], [4, 5, 6], [5, 7, 9]];
    const r = svd(A);
    expect(rangoNumerico(r)).toBe(2);
    const ns = nucleo(r);
    expect(ns.length).toBe(1);
    const v = ns[0];
    for (const riga of A) {
      let acc = 0;
      for (let j = 0; j < 3; j++) acc += riga[j] * v[j];
      expect(Math.abs(acc)).toBeLessThan(1e-9);
    }
  });

  it('gestisce una matrice con più colonne che righe', () => {
    const A = [[1, 0, 2], [0, 1, 1]];
    const r = svd(A);
    expect(rangoNumerico(r)).toBe(2);
    expect(nucleo(r).length).toBe(1);
  });
});

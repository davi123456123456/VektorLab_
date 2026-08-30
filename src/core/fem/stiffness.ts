/**
 * Matrice di rigidezza dell'elemento trave 2D a 6 gradi di libertà.
 *
 * Ordine dei DOF locali:  [u₁, v₁, θ₁, u₂, v₂, θ₂]
 * Assi locali: x da nodo iniziale a nodo finale, y ruotato di +90° antiorario.
 */

/** Matrice 6×6 come array di 36 elementi in ordine di riga. */
export type Mat6 = Float64Array;
export type Vec6 = Float64Array;

export const idx6 = (i: number, j: number): number => i * 6 + j;

export function mat6(): Mat6 {
  return new Float64Array(36);
}

export interface ProprietaAsta {
  E: number;
  G: number;
  A: number;
  I: number;
  /** area resistente a taglio; se assente si assume Timoshenko non applicabile */
  Av?: number;
  L: number;
}

/**
 * Eulero-Bernoulli: sezioni piane E ORTOGONALI all'asse deformato.
 * La deformabilità a taglio è trascurata: valida per travi snelle (L/h ≳ 10).
 *
 *   assiale     EA/L
 *   flessione   12EI/L³, 6EI/L², 4EI/L, 2EI/L
 */
export function rigidezzaEuleroBernoulli(p: ProprietaAsta): Mat6 {
  const { E, A, I, L } = p;
  const k = mat6();
  const ea = (E * A) / L;
  const L2 = L * L;
  const L3 = L2 * L;

  k[idx6(0, 0)] = ea;  k[idx6(0, 3)] = -ea;
  k[idx6(3, 0)] = -ea; k[idx6(3, 3)] = ea;

  const a = (12 * E * I) / L3;
  const b = (6 * E * I) / L2;
  const c = (4 * E * I) / L;
  const d = (2 * E * I) / L;

  k[idx6(1, 1)] = a;  k[idx6(1, 2)] = b;  k[idx6(1, 4)] = -a; k[idx6(1, 5)] = b;
  k[idx6(2, 1)] = b;  k[idx6(2, 2)] = c;  k[idx6(2, 4)] = -b; k[idx6(2, 5)] = d;
  k[idx6(4, 1)] = -a; k[idx6(4, 2)] = -b; k[idx6(4, 4)] = a;  k[idx6(4, 5)] = -b;
  k[idx6(5, 1)] = b;  k[idx6(5, 2)] = d;  k[idx6(5, 4)] = -b; k[idx6(5, 5)] = c;

  return k;
}

/**
 * Timoshenko: le sezioni restano piane ma NON ortogonali all'asse deformato.
 * L'aggiunta della deformabilità a taglio rende la trave più cedevole; il
 * parametro adimensionale è
 *
 *      Φ = 12·E·I / (G·A_v·L²)
 *
 * che pesa la deformabilità a taglio rispetto a quella flessionale. Per Φ→0 si
 * riottiene Eulero-Bernoulli. Diventa rilevante per travi tozze (L/h < 10),
 * dove trascurarlo sottostima la freccia anche del 15–20 %.
 */
export function rigidezzaTimoshenko(p: ProprietaAsta): Mat6 {
  const { E, G, A, I, L } = p;
  const Av = p.Av && p.Av > 0 ? p.Av : A * (5 / 6);
  const L2 = L * L;
  const L3 = L2 * L;
  const phi = (12 * E * I) / (G * Av * L2);

  const k = mat6();
  const ea = (E * A) / L;
  k[idx6(0, 0)] = ea;  k[idx6(0, 3)] = -ea;
  k[idx6(3, 0)] = -ea; k[idx6(3, 3)] = ea;

  const f = (E * I) / (L3 * (1 + phi));
  const a = 12 * f;
  const b = 6 * L * f;
  const c = (4 + phi) * L2 * f;
  const d = (2 - phi) * L2 * f;

  k[idx6(1, 1)] = a;  k[idx6(1, 2)] = b;  k[idx6(1, 4)] = -a; k[idx6(1, 5)] = b;
  k[idx6(2, 1)] = b;  k[idx6(2, 2)] = c;  k[idx6(2, 4)] = -b; k[idx6(2, 5)] = d;
  k[idx6(4, 1)] = -a; k[idx6(4, 2)] = -b; k[idx6(4, 4)] = a;  k[idx6(4, 5)] = -b;
  k[idx6(5, 1)] = b;  k[idx6(5, 2)] = d;  k[idx6(5, 4)] = -b; k[idx6(5, 5)] = c;

  return k;
}

export function rigidezzaLocale(p: ProprietaAsta, timoshenko: boolean): Mat6 {
  return timoshenko ? rigidezzaTimoshenko(p) : rigidezzaEuleroBernoulli(p);
}

export function fattorePhi(p: ProprietaAsta): number {
  const Av = p.Av && p.Av > 0 ? p.Av : p.A * (5 / 6);
  return (12 * p.E * p.I) / (p.G * Av * p.L * p.L);
}

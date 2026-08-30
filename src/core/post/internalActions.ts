/**
 * Ricostruzione ANALITICA delle azioni interne lungo l'asta.
 *
 * Note le forze d'estremità s = k·d − f_eq (assi locali) e i carichi di
 * campata, l'equilibrio del tratto [0, x] fornisce
 *
 *     N(x) = −s₀ − ∫₀ˣ q_x dt − Σ F_x,k                (x_k < x)
 *     T(x) =  s₁ + ∫₀ˣ q_y dt + Σ F_y,k
 *     M(x) = −s₂ + s₁·x + ∫₀ˣ (x−t)·q_y dt + Σ F_y,k·(x−x_k) − Σ M_k
 *
 * che soddisfano identicamente dM/dx = T e dT/dx = q_y. Queste espressioni
 * sono ESATTE dentro l'elemento per carichi trapezoidali, concentrati e
 * momenti applicati: non serve infittire la mesh per avere diagrammi corretti,
 * a differenza di quanto accade campionando le funzioni di forma.
 *
 * SEGNI (convenzione italiana)
 *   N > 0  trazione
 *   T > 0  il taglio fa ruotare il concio in senso ORARIO
 *   M > 0  tende le fibre dal lato −y locale (concavità verso l'alto)
 */

import type { CarichiCampata } from '../fem/loads.js';
import type { PuntoNotevole } from '../model/results.js';

/** Intensità del distribuito all'ascissa relativa xi (0 fuori dal tratto). */
function intensita(d: { s1: number; s2: number; a: number; b: number }, xi: number): number {
  if (xi <= d.s1 || d.s2 <= d.s1) return 0;
  const t = Math.min(1, (xi - d.s1) / (d.s2 - d.s1));
  return d.a + (d.b - d.a) * t;
}

/**
 * Integrali del carico trapezoidale sul tratto [s1,s2] fino a x (ascissa
 * metrica). Restituisce ∫q dt e ∫(x−t)q dt, calcolati in forma chiusa.
 */
function integraliTrapezio(
  s1: number, s2: number, a: number, b: number, L: number, x: number,
): { I0: number; I1: number } {
  const x1 = s1 * L;
  const x2 = s2 * L;
  if (x <= x1 || x2 <= x1) return { I0: 0, I1: 0 };
  const xf = Math.min(x, x2);
  const len = x2 - x1;
  // q(t) = a + (b−a)·(t−x1)/len
  const m = (b - a) / len;
  const u = xf - x1;
  // ∫ q dt = a·u + m·u²/2
  const I0 = a * u + (m * u * u) / 2;
  // ∫ (x−t) q dt  con t = x1+τ  →  (x−x1−τ)
  const dx = x - x1;
  // ∫₀ᵘ (dx−τ)(a+mτ) dτ = a·dx·u − a·u²/2 + m·dx·u²/2 − m·u³/3
  const I1 = a * dx * u - (a * u * u) / 2 + (m * dx * u * u) / 2 - (m * u * u * u) / 3;
  return { I0, I1 };
}

export interface AzioniInterne {
  N: number;
  T: number;
  M: number;
}

export function azioniInterne(
  s: ArrayLike<number>,
  carichi: CarichiCampata,
  L: number,
  x: number,
  /** lato del campionamento sulle discontinuità: -1 subito prima, +1 subito dopo */
  lato: -1 | 0 | 1 = 0,
): AzioniInterne {
  let N = -s[0];
  let T = s[1];
  let M = -s[2] + s[1] * x;

  for (const d of carichi.distribuiti) {
    const ix = integraliTrapezio(d.s1, d.s2, d.qx1, d.qx2, L, x);
    N -= ix.I0;
    const iy = integraliTrapezio(d.s1, d.s2, d.qy1, d.qy2, L, x);
    T += iy.I0;
    M += iy.I1;
  }

  for (const f of carichi.forze) {
    const xk = f.s * L;
    const attivo = lato === 0 ? xk < x : (lato > 0 ? xk <= x : xk < x);
    if (attivo) {
      N -= f.fx;
      T += f.fy;
      M += f.fy * (x - xk);
    }
  }

  for (const mm of carichi.momenti) {
    const xk = mm.s * L;
    const attivo = lato === 0 ? xk < x : (lato > 0 ? xk <= x : xk < x);
    if (attivo) M -= mm.mz;
  }

  return { N, T, M };
}

/**
 * Ascisse di campionamento: griglia regolare arricchita con i punti dove il
 * diagramma ha spigoli, salti o estremi. Le discontinuità sono campionate due
 * volte (prima e dopo) con uno scarto infinitesimo, così il tracciamento
 * grafico mostra il salto verticale invece di una rampa.
 */
export function ascisseCampionamento(
  carichi: CarichiCampata, L: number, minimo: number,
): number[] {
  const eps = Math.max(L * 1e-9, 1e-12);
  const punti = new Set<number>([0, L]);
  const n = Math.max(3, minimo);
  for (let i = 0; i <= n; i++) punti.add((i / n) * L);

  const aggiungiSalto = (x: number) => {
    if (x > eps) punti.add(x - eps);
    if (x < L - eps) punti.add(x + eps);
    punti.add(x);
  };
  for (const f of carichi.forze) aggiungiSalto(f.s * L);
  for (const m of carichi.momenti) aggiungiSalto(m.s * L);
  for (const d of carichi.distribuiti) {
    // estremi del tratto caricato: spigoli nel diagramma del taglio
    punti.add(Math.max(0, d.s1 * L));
    punti.add(Math.min(L, d.s2 * L));
  }
  return [...punti].filter((x) => x >= -eps && x <= L + eps).sort((a, b) => a - b);
}

/**
 * Punti notevoli. Il momento massimo si trova dove T = 0: si individua il
 * cambio di segno del taglio e si raffina con bisezione, così il valore
 * riportato è quello vero e non il massimo del campionamento.
 */
export function puntiNotevoli(
  s: ArrayLike<number>,
  carichi: CarichiCampata,
  L: number,
  ascisse: number[],
): PuntoNotevole[] {
  const out: PuntoNotevole[] = [];
  const val = (x: number, lato: -1 | 0 | 1 = 0) => azioniInterne(s, carichi, L, x, lato);

  const push = (x: number, tipo: PuntoNotevole['tipo'], lato: -1 | 0 | 1 = 0) => {
    const a = val(x, lato);
    out.push({ s: L > 0 ? x / L : 0, x, tipo, N: a.N, T: a.T, M: a.M });
  };

  push(0, 'estremo', 1);
  push(L, 'estremo', -1);

  // zeri del taglio → estremi del momento
  for (let i = 0; i + 1 < ascisse.length; i++) {
    const xa = ascisse[i], xb = ascisse[i + 1];
    const Ta = val(xa, 1).T;
    const Tb = val(xb, -1).T;
    if (Ta === 0 || Tb === 0 || Ta * Tb >= 0) continue;
    let lo = xa, hi = xb;
    for (let k = 0; k < 60; k++) {
      const mid = (lo + hi) / 2;
      const Tm = val(mid).T;
      if (Tm === 0) { lo = hi = mid; break; }
      if (Ta * Tm < 0) hi = mid; else lo = mid;
    }
    const x = (lo + hi) / 2;
    const a = val(x);
    out.push({ s: x / L, x, tipo: a.M >= 0 ? 'M_max' : 'M_min', N: a.N, T: a.T, M: a.M });
  }

  // discontinuità sotto forze e momenti concentrati
  for (const f of carichi.forze) {
    if (f.s > 0 && f.s < 1) push(f.s * L, 'discontinuita');
  }
  for (const m of carichi.momenti) {
    if (m.s > 0 && m.s < 1) push(m.s * L, 'discontinuita');
  }

  return out.sort((p, q) => p.x - q.x);
}

/**
 * Decomposizione ai valori singolari con il metodo di Jacobi a un lato.
 *
 * PERCHÉ SERVE — l'analisi cinematica ha bisogno del RANGO NUMERICO della
 * matrice cinematica A e di una base del suo NUCLEO. Il conteggio ingenuo
 * `3n − Σv` non distingue una struttura isostatica da una labile per vincoli
 * mal disposti (tre carrelli paralleli, tre cerniere allineate, reazioni
 * concorrenti): la differenza sta tutta nel rango, e il rango va calcolato
 * con una tolleranza relativa sui valori singolari, non con l'eliminazione
 * di Gauss e un confronto con zero.
 *
 * METODO — si ortogonalizzano a coppie le COLONNE di A con rotazioni di
 * Givens finché non sono mutuamente ortogonali. A quel punto
 *     A·V = U·Σ ,  σ_j = ‖colonna j‖ ,  U = colonne normalizzate.
 * Le colonne di V con σ ≈ 0 sono una base ortonormale del nucleo di A.
 *
 * La matrice cinematica è piccola (poche decine/centinaia di righe), quindi
 * un metodo O(n³) per sweep è ampiamente sufficiente ed è molto più robusto
 * di una fattorizzazione QR scritta a mano.
 */

export interface RisultatoSVD {
  /** valori singolari in ordine DECRESCENTE */
  sigma: number[];
  /** V come array di colonne: V[j] è il j-esimo vettore singolare destro */
  V: Float64Array[];
  /** U come array di colonne (solo per σ > 0; colonne nulle altrimenti) */
  U: Float64Array[];
  m: number;
  n: number;
}

/**
 * @param A matrice m×n come array di righe
 */
export function svd(A: number[][] | Float64Array[], maxSweeps = 60): RisultatoSVD {
  const m = A.length;
  const n = m > 0 ? A[0].length : 0;
  if (m === 0 || n === 0) {
    return { sigma: [], V: [], U: [], m, n };
  }

  // copia di lavoro, per colonne: W[j][i]
  const W: Float64Array[] = [];
  for (let j = 0; j < n; j++) {
    const col = new Float64Array(m);
    for (let i = 0; i < m; i++) col[i] = A[i][j];
    W.push(col);
  }
  // V = identità (per colonne)
  const V: Float64Array[] = [];
  for (let j = 0; j < n; j++) {
    const col = new Float64Array(n);
    col[j] = 1;
    V.push(col);
  }

  const EPS = 2.220446049250313e-16;
  const tol = 10 * m * EPS;

  for (let sweep = 0; sweep < maxSweeps; sweep++) {
    let off = 0;
    for (let p = 0; p < n - 1; p++) {
      for (let q = p + 1; q < n; q++) {
        const wp = W[p];
        const wq = W[q];
        let alpha = 0, beta = 0, gamma = 0;
        for (let i = 0; i < m; i++) {
          alpha += wp[i] * wp[i];
          beta += wq[i] * wq[i];
          gamma += wp[i] * wq[i];
        }
        if (gamma === 0) continue;
        const denom = Math.sqrt(alpha * beta);
        if (denom === 0) continue;
        const ortogonalita = Math.abs(gamma) / denom;
        if (ortogonalita < tol) continue;
        off = Math.max(off, ortogonalita);

        // rotazione di Jacobi che annulla il prodotto scalare colonna_p·colonna_q
        const zeta = (beta - alpha) / (2 * gamma);
        const t = Math.sign(zeta || 1) / (Math.abs(zeta) + Math.sqrt(1 + zeta * zeta));
        const c = 1 / Math.sqrt(1 + t * t);
        const s = c * t;

        for (let i = 0; i < m; i++) {
          const a = wp[i], b = wq[i];
          wp[i] = c * a - s * b;
          wq[i] = s * a + c * b;
        }
        const vp = V[p], vq = V[q];
        for (let i = 0; i < n; i++) {
          const a = vp[i], b = vq[i];
          vp[i] = c * a - s * b;
          vq[i] = s * a + c * b;
        }
      }
    }
    if (off < tol) break;
  }

  // valori singolari = norme delle colonne
  const idx = Array.from({ length: n }, (_, j) => j);
  const norme = idx.map((j) => {
    let s = 0;
    for (let i = 0; i < m; i++) s += W[j][i] * W[j][i];
    return Math.sqrt(s);
  });
  idx.sort((a, b) => norme[b] - norme[a]);

  const sigma: number[] = [];
  const Vs: Float64Array[] = [];
  const Us: Float64Array[] = [];
  for (const j of idx) {
    const sg = norme[j];
    sigma.push(sg);
    Vs.push(V[j]);
    const u = new Float64Array(m);
    if (sg > 0) for (let i = 0; i < m; i++) u[i] = W[j][i] / sg;
    Us.push(u);
  }

  return { sigma, V: Vs, U: Us, m, n };
}

/**
 * Rango numerico con tolleranza RELATIVA:  σ_i > tolRel · max(m,n) · σ_max.
 * È la definizione standard (come `numpy.linalg.matrix_rank`): usare uno zero
 * assoluto darebbe risultati dipendenti dalle unità di misura.
 */
export function rangoNumerico(r: RisultatoSVD, tolRel = 1e-9): number {
  if (r.sigma.length === 0) return 0;
  const smax = r.sigma[0];
  if (smax === 0) return 0;
  const soglia = tolRel * Math.max(r.m, r.n) * smax;
  let rk = 0;
  for (const s of r.sigma) if (s > soglia) rk++;
  return rk;
}

/** Base ortonormale del nucleo di A: le colonne di V oltre il rango. */
export function nucleo(r: RisultatoSVD, tolRel = 1e-9): Float64Array[] {
  const rk = rangoNumerico(r, tolRel);
  return r.V.slice(rk);
}

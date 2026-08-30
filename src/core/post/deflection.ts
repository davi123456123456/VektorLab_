/**
 * Deformata dell'asta in assi locali.
 *
 * SCELTA DI METODO — invece di interpolare i soli spostamenti nodali con le
 * cubiche di Hermite (esatte solo in assenza di carichi in campata), si
 * INTEGRA LA CURVATURA REALE:
 *
 *     v(x) = v₁ + θ₁·x + ∫₀ˣ∫₀ᵗ χ(τ) dτ dt        con  χ = M/(E·I)
 *     u(x) = u₁ + ∫₀ˣ N(t)/(E·A) dt
 *
 * Poiché M(x) e N(x) sono ricostruiti in forma esatta (vedi internalActions),
 * la deformata risulta esatta per qualunque combinazione di carichi, anche
 * concentrati o distribuiti su tratti parziali. È anche più onesto dal punto
 * di vista didattico: l'asta si inflette secondo la sua curvatura vera.
 *
 * Il controllo v(L) ≈ v₂ è una verifica indipendente della coerenza fra
 * soluzione nodale e ricostruzione interna: lo scarto viene restituito.
 */

import type { CarichiCampata } from '../fem/loads.js';
import { azioniInterne } from './internalActions.js';

export interface Deformata {
  x: Float64Array;
  u: Float64Array;
  v: Float64Array;
  /** scarto |v(L) − v₂|: deve essere trascurabile rispetto a max|v| */
  residuo: number;
  /**
   * Freccia massima misurata rispetto alla CORDA che unisce gli estremi
   * deformati, cercata sulla griglia fine di integrazione e non sulle ascisse
   * di campionamento: il massimo di una curva quasi piatta cade quasi mai su
   * un campione, e su una trave appoggiata con 41 campioni si sbaglierebbe
   * dello 0,07 %. Poco, ma è un numero che finisce in una verifica.
   */
  frecciaMassima: number;
  /** ascissa in cui si verifica [m] */
  xFreccia: number;
}

export function deformataLocale(
  s: ArrayLike<number>,
  dLocale: ArrayLike<number>,
  carichi: CarichiCampata,
  L: number,
  EI: number,
  EA: number,
  /** Timoshenko: rigidezza a taglio G·A_v; 0 o assente ⇒ taglio indeformabile */
  GAv: number,
  ascisse: number[],
): Deformata {
  const [u1, v1, th1, , v2] = [dLocale[0], dLocale[1], dLocale[2], dLocale[3], dLocale[4]];

  // griglia fine per l'integrazione (Simpson composito a passo costante)
  const nInt = 400;
  const h = L / nInt;
  const chi = new Float64Array(nInt + 1);
  const eps = new Float64Array(nInt + 1);
  const gamma = new Float64Array(nInt + 1);
  for (let i = 0; i <= nInt; i++) {
    const x = i * h;
    const a = azioniInterne(s, carichi, L, Math.min(x, L));
    chi[i] = EI !== 0 ? a.M / EI : 0;
    eps[i] = EA !== 0 ? a.N / EA : 0;
    gamma[i] = GAv > 0 ? a.T / GAv : 0;
  }

  /**
   * Integrazione cumulativa con la formula di Adams-Moulton a QUATTRO punti
   *
   *     ∫_{x_i}^{x_{i+1}} f dx ≈ h/24 · (9·f_i + 19·f_{i+1} − 5·f_{i+2} + f_{i+3})
   *
   * esatta per i polinomi fino al TERZO grado. Il grado conta esattamente qui:
   * sotto carico uniforme la curvatura χ = M/EI è quadratica, la rotazione è
   * cubica e la freccia quartica. Integrando due volte, la seconda passata
   * lavora su una cubica: una formula esatta solo fino al secondo grado — come
   * quella a tre punti — lascerebbe un errore che scala con h³, cioè ~5·10⁻⁸
   * in termini relativi. Con quattro punti la freccia sotto carico uniforme
   * risulta esatta alla precisione di macchina, e il confronto con lo
   * spostamento nodale del solutore diventa una verifica di coerenza vera.
   */
  const cumul = (f: Float64Array): Float64Array => {
    const F = new Float64Array(nInt + 1);
    for (let i = 0; i < nInt; i++) {
      let passo: number;
      if (i + 3 <= nInt) {
        // guardando avanti
        passo = (h / 24) * (9 * f[i] + 19 * f[i + 1] - 5 * f[i + 2] + f[i + 3]);
      } else if (i >= 2) {
        // vicino alla fine si guarda indietro: stessa formula, ordine invertito
        passo = (h / 24) * (9 * f[i + 1] + 19 * f[i] - 5 * f[i - 1] + f[i - 2]);
      } else {
        // caso di scuola con pochissimi intervalli: si ripiega sui trapezi
        passo = ((f[i] + f[i + 1]) / 2) * h;
      }
      F[i + 1] = F[i] + passo;
    }
    return F;
  };
  const theta = cumul(chi);        // θ(x) − θ₁
  const vFlex = cumul(theta);      // ∫θ
  const uAss = cumul(eps);
  const vTaglio = cumul(gamma);    // contributo di scorrimento (Timoshenko)

  const vGrid = new Float64Array(nInt + 1);
  for (let i = 0; i <= nInt; i++) {
    vGrid[i] = v1 + th1 * (i * h) + vFlex[i] + vTaglio[i];
  }
  const residuo = Math.abs(vGrid[nInt] - v2);

  // freccia rispetto alla corda fra gli estremi deformati
  let frecciaMassima = 0;
  let xFreccia = 0;
  for (let i = 0; i <= nInt; i++) {
    const xi = i * h;
    const corda = v1 + ((vGrid[nInt] - v1) * xi) / (L || 1);
    const f = Math.abs(vGrid[i] - corda);
    if (f > frecciaMassima) { frecciaMassima = f; xFreccia = xi; }
  }

  // campionamento sulle ascisse richieste (interpolazione lineare sulla griglia fine)
  const x = Float64Array.from(ascisse);
  const u = new Float64Array(x.length);
  const v = new Float64Array(x.length);
  for (let k = 0; k < x.length; k++) {
    const xi = Math.max(0, Math.min(L, x[k]));
    const p = (xi / L) * nInt;
    const i0 = Math.min(nInt - 1, Math.max(0, Math.floor(p)));
    const t = p - i0;
    u[k] = u1 + (uAss[i0] + (uAss[i0 + 1] - uAss[i0]) * t);
    v[k] = vGrid[i0] + (vGrid[i0 + 1] - vGrid[i0]) * t;
  }

  return { x, u, v, residuo, frecciaMassima, xFreccia };
}

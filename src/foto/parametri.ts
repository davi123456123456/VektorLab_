/**
 * TOLLERANZE DELLE REGOLE DI LETTURA, ricavate dal disegno stesso.
 *
 * Nessuna soglia è in pixel assoluti: la stessa trave fotografata da vicino
 * o da lontano deve dare lo stesso modello. Si parte dalle misure che il
 * disegno porta con sé — lo spessore delle aste, il raggio dei pallini — e
 * dalla diagonale dell'immagine come ultima risorsa.
 *
 * I coefficienti sono valori di PARTENZA: si tarano sulla metà di sviluppo
 * del banco di prova, mai su quella di prova.
 */

import { mediana } from './geometria.js';
import type { Primitive } from './tipi.js';

export interface Tolleranze {
  /** distanza sotto la quale due cose disegnate sono "lo stesso punto" [px] */
  tau: number;
  /** distanza sotto la quale due punti stanno sulla stessa verticale/orizzontale [px] */
  tauColonne: number;
  raggioTipico: number;
  spessoreTipico: number;
}

export function tolleranze(p: Primitive): Tolleranze {
  const diag = Math.hypot(p.larghezza, p.altezza);
  const spessoreTipico = p.aste.length > 0
    ? mediana(p.aste.map((s) => s.spessore))
    : 0.004 * diag;
  const raggioTipico = p.pallini.length > 0
    ? mediana(p.pallini.map((c) => c.r))
    : 2 * spessoreTipico;
  const tau = Math.max(3 * spessoreTipico, 0.75 * raggioTipico, 0.008 * diag);
  const tauColonne = Math.max(tau, 0.012 * diag);
  return { tau, tauColonne, raggioTipico, spessoreTipico };
}

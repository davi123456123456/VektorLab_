/**
 * Stato tensionale su una sezione di trave, a partire da N, T, M.
 *
 * PERCHÉ NON BASTA LA FIBRA ESTREMA — la verifica «σ = N/A ± M/W ≤ f» controlla
 * il punto in cui la tensione NORMALE è massima, dove però τ = 0. E controlla
 * «τ_max = T·S/(I·b) ≤ f/√3» al baricentro, dove σ vale solo N/A. Il punto
 * peggiore in termini di tensione IDEALE non è quasi mai nessuno dei due:
 * su un profilo a doppio T è il raccordo anima-ala, dove σ è ancora quasi
 * massima e τ si impenna perché la larghezza crolla da b a tw.
 *
 * Per questo qui si percorre tutta l'altezza della sezione, si calcola
 *
 *     σ(y) = N/A − M·y/I                 (positiva in trazione)
 *     τ(y) = T·S(y) / ( I·b(y) )
 *
 * e si cerca il massimo di σ_id(y). Il segno di σ_M discende dalla convenzione
 * del progetto: M > 0 tende le fibre dal lato −y, quindi a y > 0 comprime.
 *
 * Lo stato è PIANO e monoassiale nella tensione normale: le uniche componenti
 * non nulle sono σ_x e τ_xy. Tutte le formule che seguono discendono da qui.
 */

import {
  estremiY, larghezzaA, momentoStaticoA, quoteNotevoli, type ParametriSezione,
} from '../materials/sezioniParametriche.js';

export interface PuntoTensione {
  /** quota dal baricentro [m] */
  y: number;
  /** tensione normale [Pa], positiva in trazione */
  sigma: number;
  /** tensione tangenziale [Pa] */
  tau: number;
  /** tensione ideale di von Mises [Pa] */
  vonMises: number;
  /** tensione ideale di Tresca [Pa] */
  tresca: number;
  /** tensioni principali [Pa], sigma1 ≥ sigma2 */
  sigma1: number;
  sigma2: number;
  /** massima tensione tangenziale (raggio del cerchio di Mohr) [Pa] */
  tauMax: number;
  /** inclinazione delle direzioni principali [rad] */
  thetaP: number;
}

// ══════════════════ FORMULE DELLO STATO PIANO ══════════════════

/**
 * Von Mises per lo stato piano con sole σ_x e τ_xy.
 *
 *     σ_id = √( σ² + 3τ² )
 *
 * È il caso particolare della forma generale
 * σ_id = √(σx² + σy² − σxσy + 3τxy²) con σy = 0.
 */
export const vonMises = (sigma: number, tau: number): number =>
  Math.sqrt(sigma * sigma + 3 * tau * tau);

/**
 * Tresca nello stesso stato: σ_id = σ1 − σ2 = √(σ² + 4τ²).
 * È sempre ≥ von Mises, quindi più cautelativo; il rapporto massimo fra i due
 * è 2/√3 ≈ 1.155, che si raggiunge nel taglio puro.
 */
export const tresca = (sigma: number, tau: number): number =>
  Math.sqrt(sigma * sigma + 4 * tau * tau);

/** Tensioni principali e loro orientazione (cerchio di Mohr). */
export function principali(sigma: number, tau: number): {
  sigma1: number; sigma2: number; tauMax: number; thetaP: number;
} {
  const media = sigma / 2;
  const raggio = Math.sqrt(media * media + tau * tau);
  return {
    sigma1: media + raggio,
    sigma2: media - raggio,
    tauMax: raggio,
    thetaP: 0.5 * Math.atan2(2 * tau, sigma),
  };
}

export function statoIn(sigma: number, tau: number, y: number): PuntoTensione {
  const p = principali(sigma, tau);
  return {
    y, sigma, tau,
    vonMises: vonMises(sigma, tau),
    tresca: tresca(sigma, tau),
    sigma1: p.sigma1, sigma2: p.sigma2, tauMax: p.tauMax, thetaP: p.thetaP,
  };
}

// ══════════════════ DISTRIBUZIONE SULLA SEZIONE ══════════════════

export interface Sollecitazione {
  N: number;
  T: number;
  M: number;
}

export interface ProprietaMinime {
  A: number;
  I: number;
}

export interface DistribuzioneTensioni {
  punti: PuntoTensione[];
  /** punto con la massima tensione ideale di von Mises */
  critico: PuntoTensione;
  /** punto con la massima |σ| — la fibra estrema della verifica classica */
  fibraEstrema: PuntoTensione;
  /** punto con la massima |τ| */
  taglioMassimo: PuntoTensione;
  /** σ_id massima secondo von Mises [Pa] */
  vonMisesMax: number;
  /** σ_id massima secondo Tresca [Pa] */
  trescaMax: number;
}

/**
 * Percorre l'altezza della sezione e restituisce l'intera distribuzione.
 * Il campionamento è regolare MA arricchito con le quote in cui b(y) salta
 * (raccordi, pareti di una sezione cava): sono discontinuità di τ, e cadono
 * spesso proprio dove σ_id è massima.
 */
export function distribuzioneTensioni(
  s: Sollecitazione,
  parametri: ParametriSezione,
  prop: ProprietaMinime,
  campioni = 81,
): DistribuzioneTensioni {
  // Le sezioni a T e a L non sono simmetriche: il campionamento va da −y_inf
  // a +y_sup, non da −h/2 a +h/2, altrimenti si guarderebbe fuori dal profilo
  // da un lato e si perderebbe la fibra estrema dall'altro.
  const { yInf, ySup } = estremiY(parametri);
  const altezza = yInf + ySup;
  const quote = new Set<number>();
  for (let i = 0; i < campioni; i++) {
    quote.add(-yInf + (altezza * i) / (campioni - 1));
  }
  for (const y of quoteNotevoli(parametri)) quote.add(y);

  const punti: PuntoTensione[] = [];
  for (const y of [...quote].sort((a, b) => a - b)) {
    const sigma = s.N / prop.A - (s.M * y) / prop.I;
    const b = larghezzaA(parametri, y);
    const S = momentoStaticoA(parametri, y);
    // ai bordi b(y) → 0 e τ è nulla: il rapporto S/b è indeterminato ma il
    // taglio non può fluire attraverso una superficie libera
    const tau = b > 1e-12 ? (s.T * S) / (prop.I * b) : 0;
    punti.push(statoIn(sigma, tau, y));
  }

  const massimo = (f: (p: PuntoTensione) => number) =>
    punti.reduce((best, p) => (f(p) > f(best) ? p : best), punti[0]);

  const critico = massimo((p) => p.vonMises);
  return {
    punti,
    critico,
    fibraEstrema: massimo((p) => Math.abs(p.sigma)),
    taglioMassimo: massimo((p) => Math.abs(p.tau)),
    vonMisesMax: critico.vonMises,
    trescaMax: massimo((p) => p.tresca).tresca,
  };
}

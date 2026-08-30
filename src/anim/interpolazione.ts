/**
 * Interpolazione fra due risultati di analisi.
 *
 * PERCHÉ SERVE — modificando un carico, i diagrammi passerebbero di scatto dal
 * vecchio al nuovo valore. Lo scatto nasconde proprio l'informazione che
 * interessa: se il momento è aumentato o diminuito, e dove. Vedendo il
 * diagramma MUOVERSI da una forma all'altra, la relazione fra la modifica e il
 * suo effetto si legge senza doverla ricostruire a memoria.
 *
 * IL PROBLEMA TECNICO — i due risultati possono avere campionamenti diversi,
 * perché le ascisse includono le discontinuità dei carichi e quelle cambiano
 * col carico. Non si possono quindi mescolare array indice per indice. Si
 * ricampionano invece entrambi sulle ASCISSE RELATIVE del nuovo risultato,
 * interpolando linearmente: l'operazione è esatta agli estremi e visivamente
 * corretta in mezzo, che è tutto ciò che serve a una transizione di 0,45 s.
 */

import type { RisultatoAnalisi, RisultatoAsta } from '../core/model/results.js';

/** Valore di una serie campionata all'ascissa relativa `s`. */
function campionaA(ascisse: Float64Array, valori: Float64Array, L: number, s: number): number {
  if (ascisse.length === 0) return 0;
  const x = s * L;
  if (x <= ascisse[0]) return valori[0];
  const ultimo = ascisse.length - 1;
  if (x >= ascisse[ultimo]) return valori[ultimo];
  // ricerca binaria dell'intervallo
  let lo = 0, hi = ultimo;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (ascisse[mid] <= x) lo = mid; else hi = mid;
  }
  const dx = ascisse[hi] - ascisse[lo];
  const t = dx > 0 ? (x - ascisse[lo]) / dx : 0;
  return valori[lo] + (valori[hi] - valori[lo]) * t;
}

const mescolaSerie = (
  vecchio: RisultatoAsta, nuovo: RisultatoAsta,
  chiave: 'N' | 'T' | 'M' | 'uLocale' | 'vLocale', t: number,
): Float64Array => {
  const out = new Float64Array(nuovo.ascisse.length);
  for (let i = 0; i < out.length; i++) {
    const s = nuovo.lunghezza > 0 ? nuovo.ascisse[i] / nuovo.lunghezza : 0;
    const a = campionaA(vecchio.ascisse, vecchio[chiave], vecchio.lunghezza, s);
    out[i] = a + (nuovo[chiave][i] - a) * t;
  }
  return out;
};

/**
 * Risultato intermedio fra `vecchio` e `nuovo` al parametro t ∈ [0,1].
 * Le aste presenti solo nel nuovo risultato compaiono già al valore finale:
 * interpolare da un valore che non esiste non significherebbe nulla.
 */
export function mescolaRisultati(
  vecchio: RisultatoAnalisi | null, nuovo: RisultatoAnalisi, t: number,
): RisultatoAnalisi {
  if (!vecchio || t >= 1) return nuovo;
  if (t <= 0) return { ...nuovo, ...soloDisegno(vecchio, nuovo, 0) };
  return { ...nuovo, ...soloDisegno(vecchio, nuovo, t) };
}

/** Mescola le sole grandezze che si disegnano; il resto viene dal nuovo. */
function soloDisegno(
  vecchio: RisultatoAnalisi, nuovo: RisultatoAnalisi, t: number,
): Pick<RisultatoAnalisi, 'aste' | 'spostamenti' | 'reazioni' | 'spostamentoMassimo'> {
  const perId = new Map(vecchio.aste.map((a) => [a.astaId as string, a]));

  const aste = nuovo.aste.map((n) => {
    const v = perId.get(n.astaId as string);
    if (!v) return n;
    return {
      ...n,
      N: mescolaSerie(v, n, 'N', t),
      T: mescolaSerie(v, n, 'T', t),
      M: mescolaSerie(v, n, 'M', t),
      uLocale: mescolaSerie(v, n, 'uLocale', t),
      vLocale: mescolaSerie(v, n, 'vLocale', t),
    };
  });

  // gli spostamenti nodali si mescolano solo se il numero di nodi non è cambiato
  const spostamenti = vecchio.spostamenti.length === nuovo.spostamenti.length
    ? Float64Array.from(nuovo.spostamenti, (x, i) =>
        vecchio.spostamenti[i] + (x - vecchio.spostamenti[i]) * t)
    : nuovo.spostamenti;

  const reazioniVecchie = new Map(vecchio.reazioni.map((r) => [r.nodoId as string, r]));
  const reazioni = nuovo.reazioni.map((r) => {
    const v = reazioniVecchie.get(r.nodoId as string);
    if (!v) return r;
    return {
      ...r,
      fx: v.fx + (r.fx - v.fx) * t,
      fy: v.fy + (r.fy - v.fy) * t,
      mz: v.mz + (r.mz - v.mz) * t,
    };
  });

  return {
    aste, spostamenti, reazioni,
    spostamentoMassimo: vecchio.spostamentoMassimo
      + (nuovo.spostamentoMassimo - vecchio.spostamentoMassimo) * t,
  };
}

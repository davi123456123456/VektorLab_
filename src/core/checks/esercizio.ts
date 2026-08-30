/**
 * Verifica di deformabilità (stato limite di esercizio).
 *
 * Non è una verifica di sicurezza: una trave che rispetta la resistenza può
 * essere inservibile perché flette troppo — pavimenti che vibrano, tramezzi
 * che si fessurano, infissi che non chiudono. Si confronta la freccia massima
 * con una frazione della luce, tipicamente L/250 per i solai e L/500 per gli
 * elementi che sorreggono elementi fragili.
 */

import type { RisultatoAsta } from '../model/results.js';

export interface EsitoEsercizio {
  astaId: string;
  lunghezza: number;
  /** freccia massima misurata perpendicolarmente alla corda [m] */
  frecciaMassima: number;
  /** ascissa in cui si verifica [m] */
  xFreccia: number;
  /** denominatore del limite: L/limite */
  limite: number;
  frecciaAmmessa: number;
  rapporto: number;
  sfruttamento: number;
  verificato: boolean;
}

/**
 * La freccia si misura rispetto alla CORDA che unisce gli estremi deformati,
 * non rispetto alla posizione iniziale: è ciò che conta per l'esercizio, e
 * scarta lo spostamento rigido dell'asta dovuto al resto della struttura.
 * Su una mensola la corda coincide con l'asse e le due definizioni tornano a
 * coincidere.
 */
export function verificaEsercizio(
  astaId: string, a: RisultatoAsta, limite = 250,
): EsitoEsercizio {
  const L = a.lunghezza;
  // la freccia arriva già calcolata sulla griglia fine dell'integrazione
  // dell'elastica: cercarla qui fra i campioni la sottostimerebbe
  const frecciaMassima = a.frecciaMassima;
  const xFreccia = a.xFreccia;

  const frecciaAmmessa = L / limite;
  return {
    astaId, lunghezza: L, frecciaMassima, xFreccia, limite, frecciaAmmessa,
    rapporto: frecciaMassima > 0 ? L / frecciaMassima : Infinity,
    sfruttamento: frecciaAmmessa > 0 ? frecciaMassima / frecciaAmmessa : 0,
    verificato: frecciaMassima <= frecciaAmmessa,
  };
}

export const LIMITI_FRECCIA = [
  { limite: 200, descrizione: 'L/200 — coperture non praticabili' },
  { limite: 250, descrizione: 'L/250 — solai correnti (limite usuale)' },
  { limite: 300, descrizione: 'L/300 — solai con tramezzi' },
  { limite: 500, descrizione: 'L/500 — elementi fragili sorretti' },
];

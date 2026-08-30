/**
 * Protocollo di scambio con il worker di calcolo.
 *
 * I messaggi viaggiano per structured clone: il modello e i risultati sono
 * fatti solo di oggetti semplici e Float64Array, quindi passano senza
 * serializzazione manuale. È una delle ragioni per cui `core/` non usa classi
 * con metodi nei dati di risultato.
 */

import type { CombinationId, LoadCaseId, Progetto } from '../core/model/types.js';
import type { RisultatoAnalisi, RisultatoCinematico } from '../core/model/results.js';

export type Richiesta =
  | { id: number; tipo: 'analizza'; progetto: Progetto;
      sorgente: { tipo: 'caso'; id: LoadCaseId } | { tipo: 'combinazione'; id: CombinationId } }
  | { id: number; tipo: 'cinematica'; progetto: Progetto };

export type Risposta =
  | { id: number; tipo: 'analizza'; risultato: RisultatoAnalisi; avvisi: string[]; ms: number }
  | { id: number; tipo: 'cinematica'; risultato: RisultatoCinematico; ms: number }
  | { id: number; tipo: 'errore'; messaggio: string };

/**
 * Messaggi fra l'app e il worker del riconoscimento. La foto viaggia come
 * byte di grigio TRASFERITI (non copiati) e resta solo nel worker, fino
 * alla lettura o all'annullamento.
 */

import type { Progetto } from '../../core/model/types.js';
import type { Figura, Riquadro } from '../rete/figura.js';
import type { Avviso } from '../tipi.js';
import type { ElementiDaPunti } from '../traduci.js';

export type Richiesta =
  | { tipo: 'foto'; dati: Uint8Array; larghezza: number; altezza: number }
  | { tipo: 'leggi'; riquadro: Riquadro }
  | { tipo: 'dimentica' };

export type Risposta =
  | { tipo: 'avanzamento'; fase: 'scarico' | 'cerco' | 'leggo'; fatto?: number; totale?: number }
  | { tipo: 'figure'; figure: Figura[]; scelta: number }
  | { tipo: 'nessunoSchema' }
  | { tipo: 'letto'; progetto: Progetto; avvisi: Avviso[]; elementiDaPunti: ElementiDaPunti }
  | { tipo: 'errore'; messaggio: string };

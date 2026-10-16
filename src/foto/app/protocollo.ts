/**
 * Messaggi fra l'app e il worker del riconoscimento. La foto viaggia come
 * byte di grigio TRASFERITI (non copiati) e resta solo nel worker, fino
 * alla lettura o all'annullamento.
 *
 * Ogni richiesta ha un `id` e ogni risposta lo riporta: il pannello ascolta
 * solo le risposte della SUA richiesta. Senza, una lettura chiusa a metà
 * poteva arrivare al pannello riaperto e disegnare una struttura che
 * nessuno aveva chiesto.
 */

import type { Progetto } from '../../core/model/types.js';
import type { Figura, Riquadro } from '../rete/figura.js';
import type { Avviso } from '../tipi.js';
import type { ElementiDaPunti } from '../traduci.js';

export type Richiesta =
  | { tipo: 'foto'; id: number; dati: Uint8Array; larghezza: number; altezza: number }
  | { tipo: 'leggi'; id: number; riquadro: Riquadro }
  | { tipo: 'dimentica' };

export type Risposta = { id: number } & (
  | { tipo: 'avanzamento'; fase: 'scarico' | 'cerco' | 'leggo'; fatto?: number; totale?: number }
  | { tipo: 'figure'; figure: Figura[]; scelta: number }
  | { tipo: 'nessunoSchema' }
  | { tipo: 'letto'; progetto: Progetto; avvisi: Avviso[]; elementiDaPunti: ElementiDaPunti }
  | { tipo: 'errore'; messaggio: string }
);

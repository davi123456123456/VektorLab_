/**
 * Struttura da foto — lettura deterministica delle primitive.
 *
 *   primitive ─► grafo (tracciamento + pallini) ─► carichi ─► quote
 *             ─► metrica (posizioni in L) ─► Progetto
 *
 * La rete che produce le primitive dalla foto è un'altra fase: qui non si
 * guarda nessuna immagine.
 */

import type { Progetto } from '../core/model/types.js';
import { leggiCarichi } from './letture/carichi.js';
import { costruisciGrafo } from './letture/grafo.js';
import { associaQuote, misura } from './metrica.js';
import { tolleranze } from './parametri.js';
import type { Avviso, Grafo, Primitive } from './tipi.js';
import { traduci } from './traduci.js';

export interface EsitoLettura { progetto: Progetto; avvisi: Avviso[]; grafo: Grafo }

export function leggi(p: Primitive): EsitoLettura {
  const tol = tolleranze(p);
  const grafo = costruisciGrafo(p, tol);
  leggiCarichi(grafo, p, tol);
  associaQuote(grafo, p, tol);
  misura(grafo, tol);
  const { progetto, avvisi } = traduci(grafo);
  return { progetto, avvisi, grafo };
}

export type { Avviso, Grafo, Primitive } from './tipi.js';

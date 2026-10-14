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
import { pulisci } from './pulizia.js';
import type { Avviso, Grafo, Primitive } from './tipi.js';
import { traduci } from './traduci.js';

export interface EsitoLettura { progetto: Progetto; avvisi: Avviso[]; grafo: Grafo }

export function leggi(ingresso: Primitive): EsitoLettura {
  try {
    const { primitive: p, avvisi: scarti } = pulisci(ingresso);
    const tol = tolleranze(p);
    const grafo = costruisciGrafo(p, tol);
    leggiCarichi(grafo, p, tol);
    associaQuote(grafo, p, tol);
    misura(grafo, tol);
    const { progetto, avvisi } = traduci(grafo);
    return { progetto, avvisi: [...scarti, ...avvisi], grafo };
  } catch (e) {
    // la lettura non deve mai far cadere l'app: un modello vuoto e il motivo
    const grafo: Grafo = { punti: [], tratti: [], giunti: [], vincoli: [], carichi: [], quote: [], avvisi: [] };
    return {
      progetto: traduci(grafo).progetto, grafo,
      avvisi: [{ codice: 'erroreLettura', messaggio: `Lettura non riuscita: ${(e as Error).message}` }],
    };
  }
}

export type { Avviso, Grafo, Primitive } from './tipi.js';

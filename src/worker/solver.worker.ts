/**
 * Worker di calcolo.
 *
 * Il solutore gira qui e non nel thread principale perché una fattorizzazione
 * su un modello grande può superare abbondantemente i 16 ms di un fotogramma:
 * eseguirla nell'interfaccia bloccherebbe pan, zoom e animazioni proprio nel
 * momento in cui l'utente si aspetta una risposta. Con il worker l'interfaccia
 * continua a mostrare l'ultimo risultato valido mentre il nuovo si calcola.
 */

import { analizzaCaso, analizzaCombinazione, analizzaCinematica } from '../core/index.js';
import type { Richiesta, Risposta } from './protocol.js';

self.onmessage = (e: MessageEvent<Richiesta>) => {
  const msg = e.data;
  const t0 = performance.now();
  try {
    if (msg.tipo === 'analizza') {
      const risultato = msg.sorgente.tipo === 'caso'
        ? analizzaCaso(msg.progetto, msg.sorgente.id)
        : analizzaCombinazione(msg.progetto, msg.sorgente.id);
      const risposta: Risposta = {
        id: msg.id, tipo: 'analizza', risultato, avvisi: [],
        ms: performance.now() - t0,
      };
      self.postMessage(risposta);
      return;
    }
    const risultato = analizzaCinematica(msg.progetto);
    const risposta: Risposta = {
      id: msg.id, tipo: 'cinematica', risultato, ms: performance.now() - t0,
    };
    self.postMessage(risposta);
  } catch (err) {
    const risposta: Risposta = {
      id: msg.id, tipo: 'errore', messaggio: (err as Error).message ?? String(err),
    };
    self.postMessage(risposta);
  }
};

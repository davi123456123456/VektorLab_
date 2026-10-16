/**
 * Ponte verso il worker del riconoscimento: lo crea alla prima foto, così
 * chi non usa la funzione non scarica né il worker né la rete.
 *
 * Se il worker non parte — al primo uso senza connessione è il suo stesso
 * file a non arrivare — lo si butta: alla foto dopo se ne crea uno nuovo,
 * invece di restare appesi a uno morto fino al ricaricamento della pagina.
 */

import type { Richiesta, Risposta } from './protocollo.js';
import { MESSAGGI } from './servizio.js';

export class PonteFoto {
  private worker: Worker | null = null;
  private ascoltatori = new Set<(x: Risposta) => void>();
  private ultimoId = 0;

  invia(r: Richiesta, trasferisci: Transferable[] = []): void {
    if (r.tipo === 'dimentica') {
      this.worker?.postMessage(r);
      return;
    }
    this.ultimoId = r.id;
    if (!this.worker) {
      const w = new Worker(new URL('../../worker/foto.worker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (e: MessageEvent<Risposta>) => this.ascoltatori.forEach((f) => f(e.data));
      w.onerror = () => {
        w.terminate();
        if (this.worker === w) this.worker = null;
        const errore: Risposta = { id: this.ultimoId, tipo: 'errore', messaggio: MESSAGGI.senzaRete };
        this.ascoltatori.forEach((f) => f(errore));
      };
      this.worker = w;
    }
    this.worker.postMessage(r, trasferisci);
  }

  ascolta(f: (x: Risposta) => void): () => void {
    this.ascoltatori.add(f);
    return () => this.ascoltatori.delete(f);
  }

  chiudi(): void {
    this.worker?.terminate();
    this.worker = null;
  }
}

/**
 * Ponte verso il worker del riconoscimento: lo crea al primo messaggio,
 * così chi non usa la foto non scarica né il worker né la rete.
 */

import type { Richiesta, Risposta } from './protocollo.js';

export class PonteFoto {
  private worker: Worker | null = null;
  private ascoltatori = new Set<(x: Risposta) => void>();

  invia(r: Richiesta, trasferisci: Transferable[] = []): void {
    if (!this.worker) {
      this.worker = new Worker(new URL('../../worker/foto.worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (e: MessageEvent<Risposta>) => this.ascoltatori.forEach((f) => f(e.data));
      this.worker.onerror = () => this.ascoltatori.forEach((f) => f({
        tipo: 'errore', messaggio: 'Il riconoscitore non è partito: riprova',
      }));
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

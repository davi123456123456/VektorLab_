/**
 * Ponte verso il worker di calcolo.
 *
 * OBSOLESCENZA DELLE RISPOSTE — ogni richiesta ha un numero progressivo e si
 * accetta solo la risposta più recente. Senza questo, modificando rapidamente
 * un carico si vedrebbero comparire risultati di modelli già superati, in
 * ordine casuale: il classico problema delle richieste che si sorpassano.
 *
 * RIPIEGO SINCRONO — se i Worker non sono disponibili (ambiente di test, o
 * blocco della piattaforma), si calcola nel thread principale. È lo stesso
 * codice: `core/` non sa dove sta girando.
 */

import { analizzaCaso, analizzaCombinazione, analizzaCinematica } from '../core/index.js';
import type { CombinationId, LoadCaseId, Progetto } from '../core/model/types.js';
import type { RisultatoAnalisi, RisultatoCinematico } from '../core/model/results.js';
import type { Richiesta, Risposta } from './protocol.js';

type Sorgente =
  | { tipo: 'caso'; id: LoadCaseId }
  | { tipo: 'combinazione'; id: CombinationId };

export interface EsitoCalcolo {
  risultato: RisultatoAnalisi;
  ms: number;
}

class PonteSolutore {
  private worker: Worker | null = null;
  private prossimoId = 1;
  private inAttesa = new Map<number, {
    risolvi: (r: Risposta) => void; rifiuta: (e: Error) => void;
  }>();
  /** id dell'ultima richiesta di ciascun tipo: le più vecchie si scartano */
  private ultima = new Map<string, number>();

  private assicuraWorker(): Worker | null {
    if (this.worker) return this.worker;
    if (typeof Worker === 'undefined') return null;
    try {
      this.worker = new Worker(new URL('./solver.worker.ts', import.meta.url), {
        type: 'module',
      });
      this.worker.onmessage = (e: MessageEvent<Risposta>) => {
        const attesa = this.inAttesa.get(e.data.id);
        if (!attesa) return;
        this.inAttesa.delete(e.data.id);
        attesa.risolvi(e.data);
      };
      this.worker.onerror = () => {
        // il worker non è utilizzabile: si ripiega sul calcolo sincrono
        this.worker?.terminate();
        this.worker = null;
      };
      return this.worker;
    } catch {
      return null;
    }
  }

  private async invia(richiesta: Richiesta, chiave: string): Promise<Risposta | null> {
    const w = this.assicuraWorker();
    if (!w) return null;
    this.ultima.set(chiave, richiesta.id);
    const risposta = await new Promise<Risposta>((risolvi, rifiuta) => {
      this.inAttesa.set(richiesta.id, { risolvi, rifiuta });
      w.postMessage(richiesta);
    });
    // risposta sorpassata da una richiesta più recente: si scarta
    if (this.ultima.get(chiave) !== richiesta.id) return null;
    return risposta;
  }

  async analizza(progetto: Progetto, sorgente: Sorgente): Promise<EsitoCalcolo | null> {
    const id = this.prossimoId++;
    const risposta = await this.invia(
      { id, tipo: 'analizza', progetto, sorgente }, 'analizza',
    );
    if (risposta === null) {
      // nessun worker: calcolo sincrono con la stessa API
      const t0 = performance.now();
      const risultato = sorgente.tipo === 'caso'
        ? analizzaCaso(progetto, sorgente.id)
        : analizzaCombinazione(progetto, sorgente.id);
      return { risultato, ms: performance.now() - t0 };
    }
    if (risposta.tipo === 'errore') throw new Error(risposta.messaggio);
    if (risposta.tipo !== 'analizza') return null;
    return { risultato: risposta.risultato, ms: risposta.ms };
  }

  async cinematica(progetto: Progetto): Promise<RisultatoCinematico | null> {
    const id = this.prossimoId++;
    const risposta = await this.invia({ id, tipo: 'cinematica', progetto }, 'cinematica');
    if (risposta === null) return analizzaCinematica(progetto);
    if (risposta.tipo === 'errore') throw new Error(risposta.messaggio);
    if (risposta.tipo !== 'cinematica') return null;
    return risposta.risultato;
  }
}

export const ponte = new PonteSolutore();

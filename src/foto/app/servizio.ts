/**
 * IL SERVIZIO DEL RICONOSCIMENTO — ciò che fa il worker, senza il worker.
 *
 * La rete si scarica e si prepara alla prima foto, una volta sola. La foto
 * (il grigio) resta in memoria fra la prima passata, che trova lo schema,
 * e la seconda, che lo legge nel riquadro scelto o ritoccato dallo
 * studente; poi si dimentica. Si dimentica anche quando lo schema non c'è,
 * quando lo studente annulla e quando qualcosa va storto (R2).
 */

import { leggi } from '../index.js';
import type { Grigio } from '../rete/ingresso.js';
import type { Esegui } from '../rete/onnx.js';
import { leggiRiquadro, trovaSchemi } from '../rete/riconosci.js';
import type { Richiesta, Risposta } from './protocollo.js';

export const MESSAGGI = {
  senzaRete: 'Non riesco a scaricare il riconoscitore: serve la connessione la prima volta',
  senzaFoto: 'Non c\'è nessuna foto da leggere: rifalla',
  errore: 'Qualcosa è andato storto nel riconoscimento: riprova',
};

export interface Dipendenze {
  scaricaModello: (avanza: (fatto: number, totale?: number) => void) => Promise<Uint8Array>;
  creaEsegui: (modello: Uint8Array) => Promise<Esegui>;
}

class SenzaRete extends Error {}

export function creaServizio(dip: Dipendenze) {
  let esegui: Promise<Esegui> | null = null;
  let grigio: Grigio | null = null;

  async function rete(rispondi: (x: Risposta) => void): Promise<Esegui> {
    if (!esegui) {
      esegui = (async () => {
        let modello: Uint8Array;
        try {
          modello = await dip.scaricaModello((fatto, totale) => rispondi({ tipo: 'avanzamento', fase: 'scarico', fatto, totale }));
        } catch {
          throw new SenzaRete();
        }
        return dip.creaEsegui(modello);
      })();
      // un tentativo fallito non resta in memoria: la prossima foto riprova
      esegui.catch(() => { esegui = null; });
    }
    return esegui;
  }

  async function gestisci(r: Richiesta, rispondi: (x: Risposta) => void): Promise<void> {
    try {
      if (r.tipo === 'dimentica') {
        grigio = null;
        return;
      }
      if (r.tipo === 'foto') {
        grigio = { dati: r.dati, larghezza: r.larghezza, altezza: r.altezza };
        const e = await rete(rispondi);
        rispondi({ tipo: 'avanzamento', fase: 'cerco' });
        const { figure, scelta } = await trovaSchemi(grigio, e);
        if (scelta < 0) {
          grigio = null;
          rispondi({ tipo: 'nessunoSchema' });
          return;
        }
        rispondi({ tipo: 'figure', figure, scelta });
        return;
      }
      if (!grigio) {
        rispondi({ tipo: 'errore', messaggio: MESSAGGI.senzaFoto });
        return;
      }
      rispondi({ tipo: 'avanzamento', fase: 'leggo' });
      const { primitive } = await leggiRiquadro(grigio, r.riquadro, await rete(rispondi));
      grigio = null;
      const l = leggi(primitive);
      rispondi({ tipo: 'letto', progetto: l.progetto, avvisi: l.avvisi, elementiDaPunti: l.elementiDaPunti });
    } catch (e) {
      grigio = null;
      rispondi({ tipo: 'errore', messaggio: e instanceof SenzaRete ? MESSAGGI.senzaRete : MESSAGGI.errore });
    }
  }

  return { gestisci, haFoto: () => grigio !== null };
}

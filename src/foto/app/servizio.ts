/**
 * IL SERVIZIO DEL RICONOSCIMENTO — ciò che fa il worker, senza il worker.
 *
 * La rete si scarica e si prepara alla prima foto, una volta sola. La foto
 * (il grigio) resta in memoria fra la prima passata, che trova lo schema,
 * e la seconda, che lo legge nel riquadro scelto o ritoccato dallo
 * studente; poi si dimentica. Si dimentica anche quando lo schema non c'è,
 * quando lo studente annulla e quando qualcosa va storto (R2).
 *
 * Una richiesta annullata (`dimentica`, o una foto nuova) si ferma in
 * silenzio al primo punto d'attesa: niente figure né errori per lei. Una
 * lettura che non trova aste risponde `nessunoSchema`: il disegno dello
 * studente non si sostituisce con un progetto vuoto.
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
  /** la richiesta viva: le altre, finita l'attesa, si fermano */
  let viva: number | null = null;

  async function rete(id: number, rispondi: (x: Risposta) => void): Promise<Esegui> {
    if (!esegui) {
      esegui = (async () => {
        let modello: Uint8Array;
        try {
          modello = await dip.scaricaModello((fatto, totale) => {
            if (viva === id) rispondi({ id, tipo: 'avanzamento', fase: 'scarico', fatto, totale });
          });
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
    if (r.tipo === 'dimentica') {
      grigio = null;
      viva = null;
      return;
    }
    const id = r.id;
    const annullata = () => viva !== id;
    try {
      if (r.tipo === 'foto') {
        viva = id;
        const g: Grigio = { dati: r.dati, larghezza: r.larghezza, altezza: r.altezza };
        grigio = g;
        const e = await rete(id, rispondi);
        if (annullata()) return;
        rispondi({ id, tipo: 'avanzamento', fase: 'cerco' });
        const { figure, scelta } = await trovaSchemi(g, e);
        if (annullata()) return;
        if (scelta < 0) {
          grigio = null;
          rispondi({ id, tipo: 'nessunoSchema' });
          return;
        }
        rispondi({ id, tipo: 'figure', figure, scelta });
        return;
      }
      const g = grigio;
      if (!g) {
        rispondi({ id, tipo: 'errore', messaggio: MESSAGGI.senzaFoto });
        return;
      }
      viva = id;
      grigio = null; // una lettura sola per foto: un secondo tocco non rilegge
      rispondi({ id, tipo: 'avanzamento', fase: 'leggo' });
      const { primitive } = await leggiRiquadro(g, r.riquadro, await rete(id, rispondi));
      if (annullata()) return;
      const l = leggi(primitive);
      if (l.progetto.aste.length === 0) {
        rispondi({ id, tipo: 'nessunoSchema' });
        return;
      }
      rispondi({ id, tipo: 'letto', progetto: l.progetto, avvisi: l.avvisi, elementiDaPunti: l.elementiDaPunti });
    } catch (e) {
      if (annullata()) return;
      grigio = null;
      rispondi({ id, tipo: 'errore', messaggio: e instanceof SenzaRete ? MESSAGGI.senzaRete : MESSAGGI.errore });
    }
  }

  return { gestisci, haFoto: () => grigio !== null };
}

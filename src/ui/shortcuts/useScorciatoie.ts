/**
 * Scorciatoie da tastiera in stile Blender.
 *
 * PRINCIPIO — la mano sinistra non lascia mai la tastiera. Le operazioni si
 * avviano con un tasto singolo (G/R/S/E/D/X), si raffinano con i modificatori
 * (X/Y per l'asse) e si concludono con Invio o click. Digitare cifre durante
 * un'operazione inserisce il valore esatto: `G` `X` `2.5` `Invio`.
 *
 * Le scorciatoie sono disattivate mentre si scrive in un campo di testo,
 * altrimenti digitare "3" nel nome del progetto cambierebbe modalità.
 */

import { useEffect } from 'react';
import { useStore, MODALITA, type Modalita } from '../../state/store.js';
import {
  aggiornaDigitato, annullaOperazione, avviaTrasformazione, confermaOperazione,
  duplicaSelezione, eliminaSelezione, estrudiSelezione, vincolaAsse,
} from '../../state/azioni.js';
import { accumulaDigitato } from '../../state/operazioni.js';
import { ribaltaVincolo } from '../../state/commands.js';
import { normalizzaAngolo } from '../../core/model/orientamento.js';

export interface Scorciatoia {
  tasti: string;
  descrizione: string;
  categoria: string;
}

/** Elenco leggibile, mostrato nel pannello di aiuto. */
export const SCORCIATOIE: Scorciatoia[] = [
  { tasti: 'G', descrizione: 'sposta la selezione', categoria: 'Trasformazioni' },
  { tasti: 'R', descrizione: 'ruota la selezione', categoria: 'Trasformazioni' },
  { tasti: 'S', descrizione: 'scala la selezione', categoria: 'Trasformazioni' },
  { tasti: 'X / Y', descrizione: 'vincola la trasformazione a un asse', categoria: 'Trasformazioni' },
  { tasti: '0–9 . −', descrizione: 'valore esatto durante una trasformazione', categoria: 'Trasformazioni' },
  { tasti: 'Invio / click', descrizione: 'conferma', categoria: 'Trasformazioni' },
  { tasti: 'Esc / destro', descrizione: 'annulla', categoria: 'Trasformazioni' },

  { tasti: 'E', descrizione: 'estrudi una nuova asta dai nodi selezionati', categoria: 'Modellazione' },
  { tasti: 'D', descrizione: 'duplica e sposta', categoria: 'Modellazione' },
  { tasti: 'X / Canc', descrizione: 'elimina la selezione', categoria: 'Modellazione' },
  { tasti: 'N', descrizione: 'strumento nodo', categoria: 'Modellazione' },
  { tasti: 'L', descrizione: 'strumento asta', categoria: 'Modellazione' },
  { tasti: 'Invio', descrizione: 'termina il tracciamento a catena', categoria: 'Modellazione' },
  { tasti: 'Backspace', descrizione: 'torna indietro di un segmento', categoria: 'Modellazione' },
  { tasti: 'Q', descrizione: 'strumento selezione', categoria: 'Modellazione' },

  { tasti: '[ ]', descrizione: 'ruota il piano del vincolo di ∓15° (modalità Vincoli)', categoria: 'Vincoli e carichi' },
  { tasti: 'F', descrizione: 'ribalta il vincolo selezionato di 180° (modalità Vincoli)', categoria: 'Vincoli e carichi' },
  { tasti: 'pressione lunga', descrizione: 'ruota il vincolo trascinando, snap 15°, Ctrl libero', categoria: 'Vincoli e carichi' },
  { tasti: 'M', descrizione: 'cinematismo successivo (modalità Analisi)', categoria: 'Vincoli e carichi' },
  { tasti: 'Invio', descrizione: 'ricalcola (modalità Analisi e Risultati)', categoria: 'Vincoli e carichi' },
  { tasti: 'click su un\'asta', descrizione: 'corpo libero del tronco (modalità Reazioni)', categoria: 'Reazioni' },
  { tasti: 'Esc', descrizione: 'chiude corpo libero ed esploso (modalità Reazioni)', categoria: 'Reazioni' },
  { tasti: 'V', descrizione: 'valori accanto alle frecce (modalità Reazioni)', categoria: 'Reazioni' },
  { tasti: 'Invio', descrizione: 'ricalcola (modalità Reazioni)', categoria: 'Reazioni' },
  { tasti: 'click su una cerniera', descrizione: 'vista esplosa della sconnessione (modalità Reazioni)', categoria: 'Reazioni' },
  { tasti: 'N T M', descrizione: 'mostra o nasconde il diagramma (modalità Risultati)', categoria: 'Risultati' },
  { tasti: 'D', descrizione: 'mostra o nasconde la deformata (modalità Risultati)', categoria: 'Risultati' },
  { tasti: 'R', descrizione: 'mostra o nasconde le reazioni (modalità Risultati)', categoria: 'Risultati' },
  { tasti: 'V', descrizione: 'mostra o nasconde i valori sul disegno (modalità Risultati)', categoria: 'Risultati' },
  { tasti: 'Spazio', descrizione: 'applica e rimuove il carico ciclicamente (modalità Risultati)', categoria: 'Risultati' },
  { tasti: 'Ctrl+M', descrizione: 'attiva o disattiva tutte le animazioni', categoria: 'Risultati' },

  { tasti: 'A', descrizione: 'seleziona tutto', categoria: 'Selezione' },
  { tasti: 'Alt+A', descrizione: 'deseleziona tutto', categoria: 'Selezione' },
  { tasti: 'I', descrizione: 'inverti la selezione', categoria: 'Selezione' },
  { tasti: 'B', descrizione: 'selezione a riquadro', categoria: 'Selezione' },
  { tasti: 'Alt+click', descrizione: 'seleziona la catena di aste collineari', categoria: 'Selezione' },
  { tasti: 'Shift+click', descrizione: 'aggiungi o togli dalla selezione', categoria: 'Selezione' },

  { tasti: 'Ctrl+Z', descrizione: 'annulla', categoria: 'Cronologia' },
  { tasti: 'Ctrl+Shift+Z', descrizione: 'ripeti', categoria: 'Cronologia' },

  { tasti: 'rotella', descrizione: 'zoom verso il cursore', categoria: 'Vista' },
  { tasti: 'centrale / Spazio', descrizione: 'sposta la vista', categoria: 'Vista' },
  { tasti: 'F', descrizione: 'inquadra tutto', categoria: 'Vista' },
  { tasti: 'Ctrl (tenuto)', descrizione: 'inverti temporaneamente l\'aggancio', categoria: 'Vista' },
  { tasti: 'Ctrl+B', descrizione: 'mostra o nascondi la struttura (sinistra)', categoria: 'Vista' },
  { tasti: 'Ctrl+I', descrizione: 'mostra o nascondi le proprietà (destra)', categoria: 'Vista' },
  { tasti: 'doppio clic sul vuoto', descrizione: 'inquadra tutto, con transizione', categoria: 'Vista' },
  { tasti: 'Ctrl+T / Ctrl+W', descrizione: 'nuovo foglio / chiudi foglio', categoria: 'Vista' },
  { tasti: 'Tab', descrizione: 'modalità successiva', categoria: 'Vista' },
  { tasti: '1–7', descrizione: 'vai alla modalità', categoria: 'Vista' },
  { tasti: '?', descrizione: 'mostra o nascondi questo elenco', categoria: 'Vista' },
];

interface Opzioni {
  alternaAiuto: () => void;
  alternaIspettore: () => void;
  alternaOutliner: () => void;
}

function inCampoDiTesto(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  const tag = t.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable;
}

export function useScorciatoie(o: Opzioni): void {
  useEffect(() => {
    const gestore = (e: KeyboardEvent) => {
      if (inCampoDiTesto(e)) return;
      const st = useStore.getState();
      const op = st.operazione;
      const inTrasformazione =
        op.tipo === 'sposta' || op.tipo === 'ruota' || op.tipo === 'scala';

      // ── durante una trasformazione la tastiera ha significati diversi ──
      if (inTrasformazione) {
        if (e.key === 'Enter') { e.preventDefault(); confermaOperazione(); return; }
        if (e.key === 'Escape') { e.preventDefault(); annullaOperazione(); return; }
        if (e.key === 'x' || e.key === 'X') { e.preventDefault(); vincolaAsse('x'); return; }
        if (e.key === 'y' || e.key === 'Y') { e.preventDefault(); vincolaAsse('y'); return; }
        const nuovo = accumulaDigitato(op.digitato, e.key);
        if (nuovo !== null) { e.preventDefault(); aggiornaDigitato(nuovo); return; }
        return;
      }

      // ── rotazione interattiva di un vincolo ──
      if (st.rotazioneVincolo && e.key === 'Escape') {
        e.preventDefault();
        st.concludiRotazioneVincolo(false);
        st.messaggia('rotazione annullata');
        return;
      }

      // ── tracciamento di un'asta a catena ──
      if (op.tipo === 'disegnaAsta') {
        if (e.key === 'Enter') {
          e.preventDefault();
          st.impostaOperazione({ tipo: 'nessuna' });
          st.messaggia('tracciamento terminato');
          return;
        }
        if (e.key === 'Backspace') {
          // torna indietro di un segmento: si annulla il comando che l'ha
          // creato e si riprende dal punto precedente, senza uscire dallo
          // strumento — è la correzione che serve mentre si sta disegnando
          e.preventDefault();
          const catena = op.catena ?? [];
          const ultimo = catena[catena.length - 1];
          if (!ultimo) { st.impostaOperazione({ tipo: 'nessuna' }); return; }
          st.annulla();
          st.impostaOperazione({
            tipo: 'disegnaAsta',
            daNodo: ultimo.nodo,
            daPunto: ultimo.punto,
            direzionePrecedente: ultimo.direzione,
            catena: catena.slice(0, -1),
          });
          st.messaggia('segmento annullato');
          return;
        }
      }

      // ── cronologia ──
      const meta = e.ctrlKey || e.metaKey;
      if (meta && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        if (e.shiftKey) st.rifai(); else st.annulla();
        return;
      }
      if (meta && (e.key === 'y' || e.key === 'Y')) { e.preventDefault(); st.rifai(); return; }
      // §8 — Ctrl/Cmd + I apre e chiude il pannello delle proprietà. È la
      // scorciatoia che il pannello si aspetta di avere; «inverti selezione»
      // si sposta su I nudo, dove sta già il resto della famiglia (A, B).
      if (meta && (e.key === 'i' || e.key === 'I')) {
        e.preventDefault(); o.alternaIspettore(); return;
      }
      if (meta && (e.key === 'm' || e.key === 'M')) {
        e.preventDefault(); st.alternaAnimazioni(); return;
      }
      if (meta) return;   // le altre combinazioni con Ctrl restano al browser

      // ── tasti specifici della modalità corrente ──
      if (st.modalita === 'vincoli' && (e.key === '[' || e.key === ']')) {
        e.preventDefault();
        const passo = (Math.PI / 12) * (e.key === ']' ? 1 : -1);
        const nuovo = normalizzaAngolo(st.angoloVincolo + passo);
        st.impostaAngoloVincolo(nuovo);
        st.messaggia(`orientamento del vincolo: ${((nuovo * 180) / Math.PI).toFixed(0)}°`);
        return;
      }
      if (st.modalita === 'analisi') {
        if (e.key === 'm' || e.key === 'M') {
          e.preventDefault();
          const n = st.cinematica?.meccanismi.length ?? 0;
          if (n > 1) st.impostaModoMeccanismo((st.modoMeccanismo + 1) % n);
          return;
        }
        if (e.key === 'Enter') { e.preventDefault(); st.aggiornaCinematica(); return; }
      }
      if (st.modalita === 'reazioni') {
        if (e.key === 'Enter') { e.preventDefault(); void st.calcolaRisultati(); return; }
        if (e.key === 'v' || e.key === 'V') {
          e.preventDefault(); st.alternaValoriReazioni(); return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          st.scegliTronco(null);
          st.esplodiSconnessione(null);
          return;
        }
      }
      // In Risultati la geometria non si modifica, quindi i tasti possono
      // servire ciò che conta lì: quali diagrammi vedere.
      if (st.modalita === 'risultati') {
        const diagramma = { n: 'N', t: 'T', m: 'M' } as const;
        const c = diagramma[e.key.toLowerCase() as 'n' | 't' | 'm'];
        if (c) { e.preventDefault(); st.alternaDiagramma(c); return; }
        if (e.key === 'd' || e.key === 'D') {
          e.preventDefault();
          st.impostaOpzioniRisultati({ mostraDeformata: !st.mostraDeformata });
          return;
        }
        if (e.key === 'r' || e.key === 'R') {
          e.preventDefault();
          st.impostaOpzioniRisultati({ mostraReazioni: !st.mostraReazioni });
          return;
        }
        if (e.key === 'v' || e.key === 'V') {
          e.preventDefault();
          st.impostaOpzioniRisultati({ mostraValoriRisultati: !st.mostraValoriRisultati });
          return;
        }
        if (e.key === 'Enter') { e.preventDefault(); void st.calcolaRisultati(); return; }
        if (e.code === 'Space') {
          // in Risultati lo spazio non serve al pan: la vista non si sposta
          // mentre si guarda un diagramma
          e.preventDefault(); st.alternaRiproduzione(); return;
        }
      }

      switch (e.key) {
        // trasformazioni
        case 'g': case 'G': e.preventDefault(); avviaTrasformazione('sposta'); break;
        case 'r': case 'R': e.preventDefault(); avviaTrasformazione('ruota'); break;
        case 's': case 'S': e.preventDefault(); avviaTrasformazione('scala'); break;

        // modellazione
        case 'e': case 'E': e.preventDefault(); estrudiSelezione(); break;
        case 'd': case 'D': e.preventDefault(); duplicaSelezione(); break;
        case 'x': case 'X': case 'Delete': case 'Backspace':
          e.preventDefault(); eliminaSelezione(); break;

        // strumenti
        case 'q': case 'Q': e.preventDefault(); st.impostaStrumento('seleziona'); break;
        case 'n': case 'N': e.preventDefault(); st.impostaStrumento('nodo'); break;
        case 'l': case 'L': e.preventDefault(); st.impostaStrumento('asta'); break;

        // selezione
        case 'a': case 'A':
          e.preventDefault();
          if (e.altKey) st.svuotaSelezione(); else st.selezionaTutto();
          break;
        case 'b': case 'B':
          e.preventDefault();
          st.messaggia('Selezione a riquadro: trascina col tasto sinistro.');
          break;
        case 'i': case 'I':
          e.preventDefault();
          st.invertiSelezione();
          break;

        // vista
        case 'f': case 'F': {
          e.preventDefault();
          // in modalità Vincoli, con qualcosa di selezionato, F ribalta il
          // simbolo dall'altra parte dell'asta; altrove inquadra
          const nodiConVincolo = [...st.selezione.nodi].filter(
            (id) => st.progetto.nodi.find((n) => n.id === id)?.vincolo,
          );
          const suAsta = st.suAstaSelezionato ? [st.suAstaSelezionato] : [];
          if (st.modalita === 'vincoli' && (nodiConVincolo.length > 0 || suAsta.length > 0)) {
            st.esegui(ribaltaVincolo(nodiConVincolo, suAsta));
            st.messaggia('vincolo ribaltato');
          } else {
            st.inquadraTutto();
          }
          break;
        }
        case 'Escape': e.preventDefault(); annullaOperazione(); break;
        case 'Tab': {
          e.preventDefault();
          const i = MODALITA.findIndex((m) => m.id === st.modalita);
          st.impostaModalita(MODALITA[(i + 1) % MODALITA.length].id as Modalita);
          break;
        }
        case '?': e.preventDefault(); o.alternaAiuto(); break;
        case 'p': case 'P': e.preventDefault(); o.alternaIspettore(); break;
        case 't': case 'T': e.preventDefault(); o.alternaOutliner(); break;

        default: {
          const m = MODALITA.find((x) => x.tasto === e.key);
          if (m) { e.preventDefault(); st.impostaModalita(m.id); }
        }
      }
    };

    window.addEventListener('keydown', gestore);
    return () => window.removeEventListener('keydown', gestore);
  }, [o]);
}

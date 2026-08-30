/**
 * Azioni composte, condivise fra canvas e scorciatoie da tastiera.
 *
 * Stanno qui e non nel componente perché la stessa operazione si avvia sia col
 * mouse sia con la tastiera: duplicarla in due punti significherebbe vederla
 * divergere alla prima modifica.
 */

import { schermoAMondo } from '../render/camera.js';
import { calcolaAnteprima, istantaneaNodi } from './operazioni.js';
import { leggiPuntatore } from './puntatore.js';
import {
  baricentroSelezione, contaSelezione, nodiCoinvolti, useStore,
  type Operazione,
} from './store.js';
import {
  aggiungiCarico, aggiungiSconnessione, aggiungiSconnessioneNodale,
  aggiungiVincoloSuAsta, duplica, elimina, eliminaCarichi,
  eliminaSconnessioneNodale, eliminaSuAsta, estrudi, impostaVincolo,
  trasformaNodi,
} from './commands.js';
import {
  deduciAzioneSuNodo, type AzioneSuNodo,
} from '../core/model/deduzione.js';
import { normalizzaVincolo } from '../core/model/orientamento.js';
import type {
  CaricoDati, ElementId, NodeId, TipoVincolo,
} from '../core/model/types.js';

type TipoTrasformazione = 'sposta' | 'ruota' | 'scala';

/** Avvia un'operazione modale sulla selezione corrente. */
export function avviaTrasformazione(tipo: TipoTrasformazione, conDuplicato = false): void {
  const st = useStore.getState();
  if (contaSelezione(st.selezione) === 0) {
    st.messaggia('Niente di selezionato: seleziona nodi o aste prima di trasformarli.');
    return;
  }
  const ids = nodiCoinvolti(st.progetto, st.selezione);
  if (ids.size === 0) return;

  const origine = schermoAMondo(st.camera, leggiPuntatore());
  const operazione: Operazione = {
    tipo,
    inizialiNodi: istantaneaNodi(st.progetto, ids),
    origine,
    centro: baricentroSelezione(st.progetto, st.selezione),
    asse: null,
    digitato: '',
    valore: 0,
    duplica: conDuplicato,
  };
  st.impostaOperazione(operazione);
}

export function confermaOperazione(): void {
  const st = useStore.getState();
  const op = st.operazione;
  if (op.tipo !== 'sposta' && op.tipo !== 'ruota' && op.tipo !== 'scala') {
    st.impostaOperazione({ tipo: 'nessuna' });
    return;
  }
  const mondo = schermoAMondo(st.camera, leggiPuntatore());
  const a = calcolaAnteprima(op, mondo);
  if (a) {
    const etichetta = op.tipo === 'sposta' ? 'sposta' : op.tipo === 'ruota' ? 'ruota' : 'scala';
    st.esegui(trasformaNodi([...a.posizioni.keys()], a.posizioni, etichetta, op.inizialiNodi));
    st.messaggia(a.descrizione);
  }
  st.impostaOperazione({ tipo: 'nessuna' });
}

export function annullaOperazione(): void {
  const st = useStore.getState();
  if (st.operazione.tipo !== 'nessuna') {
    st.impostaOperazione({ tipo: 'nessuna' });
    st.messaggia('operazione annullata');
  } else {
    st.svuotaSelezione();
  }
}

export function eliminaSelezione(): void {
  const st = useStore.getState();
  if (contaSelezione(st.selezione) === 0) return;
  st.esegui(elimina([...st.selezione.nodi], [...st.selezione.aste]));
  st.svuotaSelezione();
}

/**
 * Duplica e avvia subito lo spostamento del duplicato: è il comportamento
 * atteso da chi usa Blender, e risparmia il passaggio "duplica, poi sposta".
 */
export function duplicaSelezione(): void {
  const st = useStore.getState();
  if (contaSelezione(st.selezione) === 0) return;
  const nodi = [...nodiCoinvolti(st.progetto, st.selezione)];
  const aste = [...st.selezione.aste];
  const cmd = duplica(nodi, aste, 0, 0);
  st.esegui(cmd);

  const nuoviNodi = new Set([...cmd.mappaNodi.values()]);
  const nuoveAste = new Set(cmd.nuoveAste);
  st.seleziona({ nodi: nuoviNodi, aste: nuoveAste });
  avviaTrasformazione('sposta');
}

/** Estrude una nuova asta da ciascun nodo selezionato e avvia lo spostamento. */
export function estrudiSelezione(): void {
  const st = useStore.getState();
  const nodi = [...st.selezione.nodi];
  if (nodi.length === 0) {
    st.messaggia('Seleziona almeno un nodo da cui estrudere.');
    return;
  }
  const nuovi: string[] = [];
  for (const n of nodi) {
    const nodo = st.progetto.nodi.find((x) => x.id === n);
    if (!nodo) continue;
    const cmd = estrudi(n, nodo.x, nodo.y, st.materialeCorrente, st.sezioneCorrente);
    useStore.getState().esegui(cmd);
    if (cmd.idNodo) nuovi.push(cmd.idNodo as string);
  }
  if (nuovi.length === 0) return;
  useStore.getState().seleziona({ nodi: new Set(nuovi as never[]), aste: new Set() });
  avviaTrasformazione('sposta');
}

export function vincolaAsse(asse: 'x' | 'y'): void {
  const st = useStore.getState();
  const op = st.operazione;
  if (op.tipo !== 'sposta' && op.tipo !== 'ruota' && op.tipo !== 'scala') return;
  st.impostaOperazione({ ...op, asse: op.asse === asse ? null : asse, digitato: '' });
}

export function aggiornaDigitato(nuovo: string): void {
  const st = useStore.getState();
  const op = st.operazione;
  if (op.tipo !== 'sposta' && op.tipo !== 'ruota' && op.tipo !== 'scala') return;
  st.impostaOperazione({ ...op, digitato: nuovo });
}

// ══════════════════════════ VINCOLI E CARICHI ══════════════════════════


/**
 * Applica il vincolo corrente ai nodi indicati.
 * Cliccare su un nodo che ha già QUELLO STESSO vincolo lo rimuove: è il
 * comportamento che ci si aspetta da un interruttore, ed evita di dover
 * cercare un comando "elimina vincolo" separato.
 */
/**
 * Che cosa fa il clic su un nodo: lo decide `deduciAzioneSuNodo`, che è nel
 * nucleo ed è testabile senza interfaccia. Qui si esegue soltanto.
 */
export function anteprimaSuNodo(nodoId: NodeId): AzioneSuNodo {
  const st = useStore.getState();
  return deduciAzioneSuNodo(
    st.progetto, nodoId, st.vincoloCorrente, st.modoCerniera, st.angoloVincolo,
  );
}

export function applicaVincolo(nodi: readonly NodeId[]): void {
  const st = useStore.getState();
  if (nodi.length === 0) return;
  const tipo: TipoVincolo = st.vincoloCorrente;

  // su selezione multipla si applica sempre il vincolo esterno: la
  // sconnessione interna riguarda un nodo per volta, ed è una decisione da
  // prendere guardandola
  if (nodi.length > 1) {
    applicaVincoloEsterno(nodi, tipo);
    return;
  }

  const esito = anteprimaSuNodo(nodi[0]);
  switch (esito.azione) {
    case 'rimuoviSconnessioneInterna':
      st.esegui(eliminaSconnessioneNodale(esito.id));
      st.messaggia('sconnessione interna rimossa');
      return;
    case 'rimuoviVincoloEsterno':
      st.esegui(impostaVincolo(nodi, undefined));
      st.messaggia('vincolo rimosso');
      return;
    case 'sconnessioneInterna': {
      const cmd = aggiungiSconnessioneNodale(nodi[0], esito.tipo);
      st.esegui(cmd);
      st.messaggia(`${esito.tipo} interna: ${esito.motivo}`);
      return;
    }
    case 'impossibile':
      st.messaggia(esito.motivo);
      return;
    default:
      applicaVincoloEsterno(nodi, tipo);
  }
}

function applicaVincoloEsterno(nodi: readonly NodeId[], tipo: TipoVincolo): void {
  const st = useStore.getState();
  const tuttiUguali = nodi.every((id) => {
    const n = st.progetto.nodi.find((x) => x.id === id);
    return n?.vincolo?.tipo === tipo && n.vincolo.angolo === st.angoloVincolo;
  });

  if (tuttiUguali) {
    st.esegui(impostaVincolo(nodi, undefined));
    st.messaggia('vincolo rimosso');
    return;
  }

  const vincolo = normalizzaVincolo({
    tipo,
    angolo: st.angoloVincolo as never,
    ...(tipo === 'molla'
      ? { rigidezza: { kx: 1e7, ky: 1e7, krz: null } }
      : {}),
  });
  st.esegui(impostaVincolo(nodi, vincolo));
  st.messaggia(`${tipo} applicato a ${nodi.length} nodo/i`);
}

/** Applica il carico corrente al nodo indicato. */
export function applicaCaricoNodale(nodoId: NodeId): void {
  const st = useStore.getState();
  let dati: CaricoDati;
  switch (st.caricoCorrente) {
    case 'forza':
      dati = {
        tipo: 'forzaNodale', nodoId,
        fx: (st.valoreForza * Math.cos(st.direzioneForza)) as never,
        fy: (st.valoreForza * Math.sin(st.direzioneForza)) as never,
      };
      break;
    case 'momento':
      // internamente il momento positivo è ANTIORARIO; all'utente si chiede il
      // verso, non il segno, perché è ciò che vede disegnato
      dati = {
        tipo: 'momentoNodale', nodoId,
        mz: (st.versoMomento === 'orario'
          ? -Math.abs(st.valoreMomento)
          : Math.abs(st.valoreMomento)) as never,
      };
      break;
    case 'cedimento':
      dati = {
        tipo: 'cedimento', nodoId,
        ux: 0 as never, uy: -0.01 as never, rz: 0 as never,
      };
      break;
    default:
      st.messaggia('Questo tipo di carico si applica a un\'asta, non a un nodo.');
      return;
  }
  const cmd = aggiungiCarico(dati, st.casoCorrente);
  st.esegui(cmd);
  st.messaggia(`${dati.tipo} applicato`);
}

/** Applica il carico corrente all'asta indicata. */
export function applicaCaricoAsta(astaId: ElementId): void {
  const st = useStore.getState();
  let dati: CaricoDati;
  switch (st.caricoCorrente) {
    case 'distribuito':
      dati = {
        tipo: 'distribuito', astaId,
        direzione: {
          modo: st.modoCarico,
          ...(st.modoCarico === 'angolo' ? { alpha: st.angoloCarico as never } : {}),
          ...(st.perProiezione ? { perProiezione: true } : {}),
        },
        sIniziale: st.sInizialeCarico, sFinale: st.sFinaleCarico,
        // il segno del valore È il verso: q < 0 significa opposto alla
        // direzione di riferimento scelta
        q1: st.valoreDistribuito as never,
        q2: (st.trapezoidale ? st.valoreDistribuito2 : st.valoreDistribuito) as never,
      };
      break;
    case 'termico':
      dati = {
        tipo: 'termico', astaId,
        deltaTUniforme: 30 as never, deltaTGradiente: 0 as never,
      };
      break;
    default:
      st.messaggia('Questo tipo di carico si applica a un nodo, non a un\'asta.');
      return;
  }
  const cmd = aggiungiCarico(dati, st.casoCorrente);
  st.esegui(cmd);
  st.messaggia(`${dati.tipo} applicato`);
}

export function eliminaCaricoSelezionato(): void {
  const st = useStore.getState();
  if (!st.caricoSelezionato) return;
  st.esegui(eliminaCarichi([st.caricoSelezionato]));
  st.selezionaCarico(null);
}


/**
 * Posa sull'asta ciò che la tavolozza ha selezionato: un vincolo esterno
 * intermedio o una sconnessione interna.
 *
 * La distinzione è deliberatamente esplicita nell'interfaccia. Le due cose si
 * disegnano nello stesso punto e si somigliano, ma una lascia la trave un
 * corpo solo e l'altra la divide in due: sbagliare quale si sta posando
 * trasforma una continua iperstatica in una Gerber isostatica.
 */
export function posaSuAsta(astaId: ElementId, s: number): void {
  const st = useStore.getState();
  if (st.posaSuAsta === 'sconnessione') {
    const cmd = aggiungiSconnessione(astaId, s, st.sconnessioneCorrente, st.angoloVincolo);
    st.esegui(cmd);
    st.selezionaSuAsta(cmd.id ?? null);
    st.messaggia(`${st.sconnessioneCorrente} interna su ${astaId as unknown as string}`);
    return;
  }
  // NESSUN orientamento dedotto dall'asta: l'angolo è assoluto, e il valore
  // predefinito è 0° su qualunque asta, anche verticale o inclinata. Dedurlo
  // dalla geometria significava che lo stesso numero voleva dire cose diverse
  // in punti diversi del disegno.
  const vincolo = normalizzaVincolo({
    tipo: st.vincoloCorrente,
    angolo: st.angoloVincolo as never,
    ...(st.vincoloCorrente === 'molla'
      ? { rigidezza: { kx: 1e7, ky: 1e7, krz: null } }
      : {}),
  });
  const cmd = aggiungiVincoloSuAsta(astaId, s, vincolo);
  st.esegui(cmd);
  st.selezionaSuAsta(cmd.id ?? null);
  st.messaggia(`${st.vincoloCorrente} su ${astaId as unknown as string}`);
}

/** Rimuove il vincolo o la sconnessione selezionati sull'asta. */
export function eliminaSuAstaSelezionato(): void {
  const st = useStore.getState();
  if (!st.suAstaSelezionato) return;
  st.esegui(eliminaSuAsta(st.suAstaSelezionato));
  st.selezionaSuAsta(null);
}

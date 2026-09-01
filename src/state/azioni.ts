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
  componi, eliminaSconnessioneNodale, eliminaSuAsta, estrudi, impostaVincolo,
  spostaSuAsta, svuotaModello, trasformaNodi,
} from './commands.js';
import {
  asteNelNodo, deduciAzioneSuNodo, type AzioneSuNodo,
} from '../core/model/deduzione.js';
import { normalizzaVincolo } from '../core/model/orientamento.js';
import { nomeVincolo } from '../render/simboli.js';
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

  // §4.2 — un VINCOLO selezionato ha la precedenza sulla selezione di nodi e
  // aste: chi ha appena cliccato un carrello nell'elenco e preme Canc vuole
  // togliere quel carrello, non la geometria che gli sta sotto.
  if (st.suAstaSelezionato) {
    const p = st.progetto;
    const v = (p.vincoliSuAsta ?? []).find((x) => x.id === st.suAstaSelezionato);
    const c = (p.sconnessioni ?? []).find((x) => x.id === st.suAstaSelezionato);
    const nome = v ? nomeVincolo(v.vincolo.tipo, 'esterno')
      : c ? nomeVincolo(c.tipo, 'interno') : 'vincolo';
    const dove = (v?.astaId ?? c?.astaId) as unknown as string | undefined;
    st.esegui({
      ...eliminaSuAsta(st.suAstaSelezionato),
      etichetta: `eliminato ${nome}${dove ? ` su ${dove}` : ''}`,
    });
    st.selezionaSuAsta(null);
    return;
  }
  if (st.sconnessioneNodaleSelezionata) {
    const v = (st.progetto.vincoliInterni ?? [])
      .find((x) => x.id === st.sconnessioneNodaleSelezionata);
    const nodo = st.progetto.nodi.find((n) => n.id === v?.nodoId);
    st.esegui({
      ...eliminaSconnessioneNodale(st.sconnessioneNodaleSelezionata),
      etichetta: `eliminata ${v ? nomeVincolo(v.tipo, 'interno') : 'sconnessione'}`
        + `${nodo ? ` in ${nodo.etichetta ?? (nodo.id as unknown as string)}` : ''}`,
    });
    st.selezionaSconnessioneNodale(null);
    return;
  }

  if (contaSelezione(st.selezione) === 0) return;

  // §4.2 — conferma solo oltre i cinque elementi: sotto quella soglia c'è
  // l'undo, e una finestra a ogni cancellazione stanca più di quanto protegga
  const quanti = contaSelezione(st.selezione);
  if (quanti > 5) {
    const ok = globalThis.confirm?.(`Eliminare ${quanti} elementi?`);
    if (ok === false) return;
  }

  // §1.3d — se la selezione copre TUTTO, non si itera sulle entità: si
  // sostituisce il modello con uno vuoto. Iterando basterebbe una collezione
  // dimenticata perché qualcosa sopravvivesse, e non c'è modo di accorgersene
  // guardando lo schermo: ciò che resta è invisibile proprio perché ha perso
  // il nodo o l'asta che lo portava.
  const p = st.progetto;
  const tuttiNodi = p.nodi.every((n) => st.selezione.nodi.has(n.id));
  const tutteAste = p.aste.every((a) => st.selezione.aste.has(a.id)
    || st.selezione.nodi.has(a.nodoIniziale) || st.selezione.nodi.has(a.nodoFinale));
  if (p.nodi.length > 0 && tuttiNodi && tutteAste) {
    st.esegui(svuotaModello());
  } else {
    st.esegui(elimina([...st.selezione.nodi], [...st.selezione.aste]));
  }
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
      // §3.0.1 — la «Cerniera» degli interni è le due cose insieme: appoggio a
      // terra CHE SCONNETTE. Non serve un tipo nuovo nel modello, perché è
      // esattamente la somma di quelli che ci sono già — ed è anche il conto
      // dei gradi di vincolo che la specifica dà: 2 esterni + 2(m−1) interni
      // = 2m. Un tipo nuovo avrebbe duplicato solutore, cinematica e disegno
      // per rappresentare una somma.
      if (st.vincoloSceltoId === 'cernieraSconnessa') {
        st.esegui(componi(
          'cerniera a terra sconnessa',
          impostaVincolo(nodi, {
            tipo: 'cerniera', angolo: st.angoloVincolo as never,
          }),
          aggiungiSconnessioneNodale(nodi[0], 'cerniera', {
            gruppi: esito.aste.map((a) => [a]),
          }),
        ));
        st.messaggia('cerniera: due reazioni e rotazione relativa libera');
        return;
      }
      // posata SUL NODO: svincola tutte le aste fra loro, un gruppo ciascuna
      const cmd = aggiungiSconnessioneNodale(nodi[0], esito.tipo, {
        gruppi: esito.aste.map((a) => [a]),
      });
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
    // §3.0.1 in campata: appoggio a terra E sconnessione nello stesso punto,
    // in un solo passo di undo. È la stessa somma che al nodo.
    if (st.vincoloSceltoId === 'cernieraSconnessa') {
      const vincolo = normalizzaVincolo({
        tipo: 'cerniera', angolo: st.angoloVincolo as never,
      });
      const esterno = aggiungiVincoloSuAsta(astaId, s, vincolo);
      const interna = aggiungiSconnessione(astaId, s, 'cerniera', st.angoloVincolo);
      st.esegui(componi('cerniera a terra sconnessa in campata', esterno, interna));
      st.selezionaSuAsta(esterno.id ?? null);
      st.messaggia('cerniera in campata: due reazioni, rotazione libera');
      return;
    }
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

/**
 * §3.2 — fine del trascinamento di un elemento posato sull'asta.
 *
 * Se una SCONNESSIONE arriva sul nodo d'estremità, non resta una sconnessione
 * in campata a un millimetro dal nodo: diventa una sconnessione NODALE, e
 * per il modo in cui ci è arrivata — trascinandola da un'asta — svincola solo
 * quell'asta rispetto alle altre, che restano saldate fra loro.
 *
 * È la distinzione del §3.2 fra cerniera completa e cerniera parziale, e la
 * si esprime col gesto invece che con un'opzione: chi la posa sul nodo le
 * svincola tutte, chi ce la trascina ne imperna una.
 */
export function concludiTrascinamentoSuAsta(id: string, s: number): void {
  const st = useStore.getState();
  const p = st.progetto;
  const sconnessione = (p.sconnessioni ?? []).find((x) => x.id === id);

  const AGGANCIO = 0.03;
  if (!sconnessione || (s > AGGANCIO && s < 1 - AGGANCIO)) {
    st.esegui(spostaSuAsta(id, s));
    return;
  }

  const asta = p.aste.find((a) => a.id === sconnessione.astaId);
  if (!asta) { st.esegui(spostaSuAsta(id, s)); return; }
  const nodoId = s <= AGGANCIO ? asta.nodoIniziale : asta.nodoFinale;
  const convergenti = asteNelNodo(p, nodoId);
  if (convergenti.length < 2) { st.esegui(spostaSuAsta(id, s)); return; }

  const altre = convergenti.filter((x) => x !== asta.id);
  st.esegui(componi(
    `${sconnessione.tipo} parziale in ${nodoId as unknown as string}`,
    eliminaSuAsta(id),
    aggiungiSconnessioneNodale(nodoId, sconnessione.tipo, {
      gruppi: [[asta.id], altre],
    }),
  ));
  st.messaggia(
    `${sconnessione.tipo} parziale: ${asta.id as unknown as string} imperniata, `
    + `${altre.length === 1 ? "l'altra asta resta saldata" : 'le altre restano saldate'}`,
  );
}

/** Rimuove il vincolo o la sconnessione selezionati sull'asta. */
export function eliminaSuAstaSelezionato(): void {
  const st = useStore.getState();
  if (!st.suAstaSelezionato) return;
  st.esegui(eliminaSuAsta(st.suAstaSelezionato));
  st.selezionaSuAsta(null);
}

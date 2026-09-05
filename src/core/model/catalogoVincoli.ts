/**
 * CATALOGO DEI VINCOLI — l'unica fonte di verità della tavolozza.
 *
 * Nome, icona, gradi di vincolo e comportamento stanno nello STESSO oggetto.
 * Prima erano array paralleli percorsi in parallelo, ed è la struttura che
 * rende possibile l'errore più insidioso di un'interfaccia: le icone che
 * scorrono di una posizione rispetto ai nomi. Nessuno se ne accorge leggendo
 * il codice, perché entrambi gli elenchi sono giusti — è l'accoppiamento a
 * essere sbagliato. Da qui non può più succedere: non ci sono due elenchi.
 *
 * DUE DISTINZIONI, INDIPENDENTI FRA LORO, che vanno tenute separate:
 *
 *   · la NATURA — «a telaio» collega al terreno e produce reazioni, non
 *     separa mai i corpi rigidi; «sconnessione interna» interrompe la
 *     continuità fra aste e non collega niente a terra;
 *   · la POSIZIONE — all'estremo di un'asta oppure in campata.
 *
 * Sono ortogonali: un carrello a metà trave resta un vincolo a telaio e non
 * separa nulla. Confonderle è il motivo per cui la tavolozza sembrava avere
 * voci duplicate.
 */

import type { TipoSconnessione, TipoVincolo } from './types.js';

export type { TipoSconnessione } from './types.js';

/** Come disegnare l'icona, e quindi anche il simbolo sul canvas. */
export type IconaVincolo =
  /** simbolo a telaio completo: triangolo, eventuali rulli, tratteggiatura */
  | { genere: 'telaio'; tipo: TipoVincolo }
  /** pallino sul nodo, senza terra */
  | { genere: 'sconnessione'; tipo: TipoSconnessione }
  /**
   * Cerniera a terra CHE SCONNETTE: simbolo a telaio, aste che si fermano sul
   * perno. Con `rulli` è il carrello interno: §2.1 chiede che sia lo stesso
   * simbolo con l'aggiunta di due cerchietti, e passare per lo stesso genere
   * è ciò che impedisce ai due disegni di divergere.
   */
  | { genere: 'cernieraSconnessa'; rulli?: boolean };

export interface DefinizioneVincolo {
  /** chiave stabile: è quella che finisce nello stato dell'interfaccia */
  id: string;
  categoria: 'telaio' | 'interno';
  nome: string;
  /**
   * Gradi di vincolo, scritti come vanno letti. Non è sempre un numero:
   * dipende da quante aste convergono e da come sono raggruppate.
   */
  gdv: string;
  /** true se introduce una discontinuità che divide i corpi rigidi */
  separa: boolean;
  /** true se l'angolo orienta il simbolo (e talvolta anche le reazioni) */
  orientabile: boolean;
  /**
   * true dove l'angolo cambia il DISEGNO ma non le reazioni: la cerniera
   * blocca due traslazioni comunque sia girata, l'incastro le blocca tutte.
   */
  soloDisegno: boolean;
  icona: IconaVincolo;
  /**
   * Per le voci interne: il tipo che finisce nel modello.
   *
   * «Cerniera interna» e «Cerniera» sono due voci di tavolozza diverse che
   * producono la stessa sconnessione — cambia che cosa altro si posa insieme
   * a essa — e questo campo è ciò che le riporta entrambe al modello senza
   * bisogno di un secondo elenco che le traduca.
   */
  sconnessione?: TipoSconnessione;
  descrizione: string;
}

/**
 * L'ORDINE È QUELLO DELLA SPECIFICA e non va riordinato: la tavolozza si
 * impara a memoria per posizione, e cambiare l'ordine costa più di quanto
 * qualunque nuovo criterio possa rendere.
 */
export const CATALOGO_VINCOLI: readonly DefinizioneVincolo[] = [
  // ── a telaio ──
  {
    id: 'cerniera', categoria: 'telaio', nome: 'Cerniera a telaio',
    gdv: '2', separa: false, orientabile: true, soloDisegno: true,
    icona: { genere: 'telaio', tipo: 'cerniera' },
    descrizione: 'Blocca le due traslazioni, lascia libera la rotazione. '
      + "L'asta passa continua: non separa i corpi rigidi.",
  },
  {
    id: 'carrello', categoria: 'telaio', nome: 'Carrello',
    gdv: '1', separa: false, orientabile: true, soloDisegno: false,
    icona: { genere: 'telaio', tipo: 'carrello' },
    descrizione: "L'angolo è la direzione verso cui punta il vincolo: blocca "
      + 'la traslazione lungo quella, lascia scorrere lungo il piano.',
  },
  {
    id: 'incastro', categoria: 'telaio', nome: 'Incastro',
    gdv: '3', separa: false, orientabile: true, soloDisegno: true,
    icona: { genere: 'telaio', tipo: 'incastro' },
    descrizione: 'Blocca due traslazioni e la rotazione.',
  },
  {
    id: 'bipendolo', categoria: 'telaio', nome: 'Doppio pendolo a telaio',
    gdv: '2', separa: false, orientabile: true, soloDisegno: false,
    icona: { genere: 'telaio', tipo: 'bipendolo' },
    descrizione: 'Blocca la traslazione normale al piano e la rotazione.',
  },
  {
    id: 'pattino', categoria: 'telaio', nome: 'Pattino a telaio',
    gdv: '2', separa: false, orientabile: true, soloDisegno: false,
    icona: { genere: 'telaio', tipo: 'pattino' },
    descrizione: 'Blocca la traslazione normale alla guida e la rotazione. '
      + 'Nella cinematica è identico al doppio pendolo.',
  },
  {
    id: 'biella', categoria: 'telaio', nome: 'Biella',
    gdv: '1', separa: false, orientabile: true, soloDisegno: false,
    icona: { genere: 'telaio', tipo: 'biella' },
    descrizione: "L'angolo è la direzione dell'asse: blocca la traslazione "
      + 'lungo di esso.',
  },
  {
    id: 'molla', categoria: 'telaio', nome: 'Molla',
    gdv: 'elastico', separa: false, orientabile: true, soloDisegno: false,
    icona: { genere: 'telaio', tipo: 'molla' },
    descrizione: 'Vincolo elastico: irrigidisce la struttura senza entrare '
      + 'nel conteggio dei gradi di vincolo.',
  },

  // ── interni ──
  {
    id: 'cernieraInterna', categoria: 'interno', nome: 'Cerniera interna',
    gdv: '2(g−1)', separa: true, orientabile: false, soloDisegno: false,
    icona: { genere: 'sconnessione', tipo: 'cerniera' },
    sconnessione: 'cerniera',
    descrizione: 'Libera la rotazione relativa fra le aste convergenti, senza '
      + 'collegare niente a terra. Con g gruppi rigidi vale 2(g−1).',
  },
  {
    id: 'cernieraSconnessa', categoria: 'interno', nome: 'Cerniera',
    gdv: '2m', separa: true, orientabile: true, soloDisegno: true,
    icona: { genere: 'cernieraSconnessa' },
    sconnessione: 'cerniera',
    descrizione: 'Il carrello senza le ruote: due reazioni a terra E rotazione '
      + 'relativa libera fra le aste. Le aste si fermano sul perno invece di '
      + 'attraversarlo. Con m aste convergenti vale 2m.',
  },
  {
    id: 'carrelloInterno', categoria: 'interno', nome: 'Carrello interno',
    gdv: '1', separa: true, orientabile: true, soloDisegno: false,
    icona: { genere: 'cernieraSconnessa', rulli: true },
    sconnessione: 'carrelloInterno',
    descrizione: 'Libera la rotazione relativa E lo scorrimento nel piano: '
      + "trasmette la sola forza perpendicolare al piano. È l'unico vincolo "
      + "interno da un grado. L'angolo definisce il piano di scorrimento.",
  },
  {
    id: 'bipendoloInterno', categoria: 'interno', nome: 'Doppio pendolo interno',
    gdv: '2', separa: true, orientabile: false, soloDisegno: false,
    icona: { genere: 'sconnessione', tipo: 'bipendolo' },
    sconnessione: 'bipendolo',
    descrizione: 'Trasmette lo sforzo normale e il momento, non il taglio.',
  },
  {
    id: 'pattinoInterno', categoria: 'interno', nome: 'Pattino interno',
    gdv: '2', separa: true, orientabile: false, soloDisegno: false,
    icona: { genere: 'sconnessione', tipo: 'pattino' },
    sconnessione: 'pattino',
    descrizione: 'Trasmette il taglio e il momento, non lo sforzo normale.',
  },
];

export function definizioneVincolo(id: string): DefinizioneVincolo | undefined {
  return CATALOGO_VINCOLI.find((v) => v.id === id);
}

export function vincoliDi(categoria: 'telaio' | 'interno'): DefinizioneVincolo[] {
  return CATALOGO_VINCOLI.filter((v) => v.categoria === categoria);
}

/**
 * Che cosa succede cliccando su un nodo con lo strumento vincolo.
 *
 * Cerniera, bipendolo e pattino esistono in DUE forme che si disegnano nello
 * stesso punto e si chiamano allo stesso modo, ma fanno cose opposte: quella
 * esterna lega la struttura a terra, quella interna la divide in due corpi.
 * Sceglierla è la decisione più delicata dell'intera modellazione, e va decisa
 * PRIMA del clic, mostrandola in anteprima — non scoperta dopo, guardando un
 * conteggio che è cambiato.
 *
 * La regola automatica è quella che sbaglia meno spesso:
 *
 *   · un nodo dove converge UNA SOLA asta è un estremo: non c'è nulla da
 *     sconnettere, quindi il vincolo è esterno;
 *   · un nodo dove ne convergono due o più è un collegamento fra parti di
 *     struttura, e sconnetterlo è la cosa che si vuole fare quasi sempre: i
 *     vincoli esterni in mezzeria si posano sull'ASTA, non sul nodo.
 *
 * Resta comunque un'euristica, e per questo è sempre scavalcabile: il modo
 * 'esterno' e il modo 'interno' la ignorano.
 */

import type { ElementId, NodeId, Progetto, TipoVincolo } from './types.js';

export type ModoCerniera = 'auto' | 'esterno' | 'interno';

export type AzioneSuNodo =
  | { azione: 'vincoloEsterno'; tipo: TipoVincolo; motivo: string }
  | { azione: 'rimuoviVincoloEsterno'; motivo: string }
  | {
      azione: 'sconnessioneInterna';
      tipo: 'cerniera' | 'bipendolo' | 'pattino';
      /** aste che convergono nel nodo, tutte coinvolte per default */
      aste: ElementId[];
      motivo: string;
    }
  | { azione: 'rimuoviSconnessioneInterna'; id: string; motivo: string }
  | { azione: 'impossibile'; motivo: string };

/** I tipi che hanno una controparte interna. */
const SCONNETTIBILI = new Set<TipoVincolo>(['cerniera', 'bipendolo', 'pattino']);

export function asteNelNodo(p: Progetto, nodoId: NodeId): ElementId[] {
  return p.aste
    .filter((a) => a.nodoIniziale === nodoId || a.nodoFinale === nodoId)
    .map((a) => a.id);
}

export function deduciAzioneSuNodo(
  p: Progetto,
  nodoId: NodeId,
  tipo: TipoVincolo,
  modo: ModoCerniera = 'auto',
  angolo = 0,
): AzioneSuNodo {
  const nodo = p.nodi.find((n) => n.id === nodoId);
  if (!nodo) return { azione: 'impossibile', motivo: 'nodo non trovato' };

  const aste = asteNelNodo(p, nodoId);
  const interna = (p.vincoliInterni ?? []).find((v) => v.nodoId === nodoId);

  // ── toglie ciò che è già lì, se è la stessa cosa che si sta applicando ──
  if (interna && SCONNETTIBILI.has(tipo) && interna.tipo === tipo && modo !== 'esterno') {
    return {
      azione: 'rimuoviSconnessioneInterna', id: interna.id,
      motivo: `in questo nodo c'è già una ${tipo} interna: il clic la toglie`,
    };
  }
  if (nodo.vincolo?.tipo === tipo && nodo.vincolo.angolo === angolo && modo !== 'interno') {
    return {
      azione: 'rimuoviVincoloEsterno',
      motivo: `in questo nodo c'è già un ${tipo}: il clic lo toglie`,
    };
  }

  // ── scelta fra esterno e interno ──
  const puoEssereInterna = SCONNETTIBILI.has(tipo) && aste.length >= 2;

  if (modo === 'interno') {
    if (!SCONNETTIBILI.has(tipo)) {
      return {
        azione: 'impossibile',
        motivo: `un ${tipo} non ha una versione interna: sconnettono solo ` +
          'cerniera, bipendolo e pattino',
      };
    }
    if (aste.length < 2) {
      return {
        azione: 'impossibile',
        motivo: 'in questo nodo converge una sola asta: non c\'è nulla da sconnettere',
      };
    }
  }

  const interne = modo === 'interno' || (modo === 'auto' && puoEssereInterna);
  if (interne) {
    return {
      azione: 'sconnessioneInterna',
      tipo: tipo as 'cerniera' | 'bipendolo' | 'pattino',
      aste,
      motivo: `${aste.length} aste convergono qui: la ${tipo} le sconnette, ` +
        'i corpi rigidi diventano di più',
    };
  }

  return {
    azione: 'vincoloEsterno', tipo,
    motivo: aste.length <= 1
      ? 'nodo di estremità: il vincolo lo lega a terra'
      : 'vincolo esterno applicato al nodo, che resta rigido',
  };
}

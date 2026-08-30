/**
 * TOPOLOGIA: quanti corpi rigidi ci sono, e quali.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │ NULLA SEPARA UN CORPO RIGIDO, TRANNE UNA SCONNESSIONE INTERNA        │
 * │ ESPLICITA.                                                           │
 * │                                                                      │
 * │ Non lo fa un nodo. Non lo fa un vincolo esterno. Non lo fa il tasto  │
 * │ Esc premuto durante il disegno. Solo una cerniera interna, un        │
 * │ bipendolo interno o un pattino interno separano due corpi rigidi.    │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * Conseguenze, tutte verificate dai test:
 *
 *   · un carrello, una cerniera esterna, un incastro o una molla applicati in
 *     un punto qualunque di un'asta creano un nodo di mesh e NULLA PIÙ: la
 *     trave resta continua e la rotazione passa;
 *   · due segmenti tracciati in momenti diversi ma che CONDIVIDONO un punto
 *     sono rigidamente connessi. Il numero di tratti disegnati non è un dato
 *     meccanico;
 *   · n non è mai inserito né dedotto dal disegno: si calcola qui, e si
 *     ricalcola a ogni modifica.
 *
 * ANELLI CHIUSI — l'union-find li gestisce da solo (in un circuito una
 * cerniera non aumenta il numero di corpi, perché la connessione persiste
 * attraverso l'altro ramo), ma ogni anello che resta chiuso dentro un corpo
 * introduce 3 iperstaticità INTERNE che le equazioni cardinali non vedono: il
 * bilancio 3n contro v continua a dare «isostatica» mentre le caratteristiche
 * di sollecitazione non discendono dal solo equilibrio. Vanno contate a parte
 * e dichiarate — è ciò che fa `iperstaticitaInterna`.
 */

import type {
  Asta, ElementId, NodeId, Progetto, SvincoloEstremita,
} from '../model/types.js';
import type { IndiceModello } from '../model/queries.js';

export interface EstremitaAlNodo {
  astaId: ElementId;
  estremo: 'iniziale' | 'finale';
  svincolo: SvincoloEstremita;
}

export interface NodoTopologico {
  nodoId: NodeId;
  /** tutte le estremità che convergono nel nodo */
  estremita: EstremitaAlNodo[];
  /** estremità rigidamente connesse fra loro: formano un unico corpo */
  gruppoRigido: EstremitaAlNodo[];
  /** estremità sconnesse rispetto al gruppo rigido */
  svincolate: EstremitaAlNodo[];
  /**
   * Gradi di vincolo introdotti dalle sconnessioni di questo nodo: per ogni
   * estremità svincolata, le componenti che comunque trasmette. Una cerniera
   * fra due aste dà 2; m aste incernierate danno 2(m−1), perché una resta
   * rigida e le altre m−1 sono svincolate rispetto a essa.
   */
  gradiVincolo: number;
}

export interface Topologia {
  /** numero di corpi rigidi */
  n: number;
  corpoDiAsta: Map<ElementId, number>;
  asteDelCorpo: ElementId[][];
  nodiDelCorpo: NodeId[][];
  nodi: NodoTopologico[];
  /** cicli indipendenti rimasti dentro ciascun corpo */
  anelliPerCorpo: number[];
  anelliTotali: number;
  /** 3 per ogni anello chiuso: non compare nel bilancio 3n − v */
  iperstaticitaInterna: number;
  /** somma dei gradi di vincolo interni sui nodi */
  gradiVincoloInterni: number;
}

export class UnionFind {
  private padre: number[];
  constructor(n: number) { this.padre = Array.from({ length: n }, (_, i) => i); }
  trova(a: number): number {
    while (this.padre[a] !== a) { this.padre[a] = this.padre[this.padre[a]]; a = this.padre[a]; }
    return a;
  }
  unisci(a: number, b: number): void {
    const ra = this.trova(a), rb = this.trova(b);
    if (ra !== rb) this.padre[rb] = ra;
  }
}

/** Quante delle tre componenti sono rilasciate su questa estremità. */
export const numeroSvincoli = (s: SvincoloEstremita): number =>
  (s.N ? 1 : 0) + (s.T ? 1 : 0) + (s.M ? 1 : 0);

/** Estremità che convergono in un nodo, comprese le aste chiuse su sé stesse. */
function estremitaDelNodo(
  nodoId: NodeId, idx: IndiceModello,
): EstremitaAlNodo[] {
  const out: EstremitaAlNodo[] = [];
  for (const aid of idx.asteDelNodo.get(nodoId) ?? []) {
    const a: Asta | undefined = idx.aste.get(aid);
    if (!a) continue;
    if (a.nodoIniziale === nodoId) {
      out.push({ astaId: aid, estremo: 'iniziale', svincolo: a.svincolo.iniziale });
    }
    if (a.nodoFinale === nodoId) {
      out.push({ astaId: aid, estremo: 'finale', svincolo: a.svincolo.finale });
    }
  }
  return out;
}

/**
 * Partizione in corpi rigidi.
 *
 * Il gruppo rigido di un nodo è l'insieme delle estremità NON svincolate: si
 * uniscono tutte in un corpo solo. Se nessuna è rigida — m aste tutte
 * incernierate nello stesso punto — se ne elegge una master, altrimenti il
 * grado di libertà rotazionale del nodo resterebbe indeterminato nel FEM e il
 * conteggio dei gradi di vincolo non darebbe il classico 2(m−1).
 */
export function analizzaTopologia(progetto: Progetto, idx: IndiceModello): Topologia {
  const aste = progetto.aste;
  const posizione = new Map<ElementId, number>();
  aste.forEach((a, i) => posizione.set(a.id, i));

  const uf = new UnionFind(aste.length);
  const nodi: NodoTopologico[] = [];
  let gradiVincoloInterni = 0;

  for (const nodo of progetto.nodi) {
    const estremita = estremitaDelNodo(nodo.id, idx);
    if (estremita.length === 0) {
      nodi.push({
        nodoId: nodo.id, estremita: [], gruppoRigido: [], svincolate: [],
        gradiVincolo: 0,
      });
      continue;
    }

    let gruppoRigido = estremita.filter((e) => numeroSvincoli(e.svincolo) === 0);
    if (gruppoRigido.length === 0) {
      const scelta = [...estremita].sort(
        (a, b) => numeroSvincoli(a.svincolo) - numeroSvincoli(b.svincolo)
          || (a.astaId as unknown as string).localeCompare(b.astaId as unknown as string),
      )[0];
      gruppoRigido = [scelta];
    }
    const svincolate = estremita.filter((e) => !gruppoRigido.includes(e));

    for (let i = 1; i < gruppoRigido.length; i++) {
      uf.unisci(
        posizione.get(gruppoRigido[0].astaId)!,
        posizione.get(gruppoRigido[i].astaId)!,
      );
    }

    const gradiVincolo = svincolate.reduce(
      (acc, e) => acc + (3 - numeroSvincoli(e.svincolo)), 0,
    );
    gradiVincoloInterni += gradiVincolo;
    nodi.push({ nodoId: nodo.id, estremita, gruppoRigido, svincolate, gradiVincolo });
  }

  // numerazione compatta
  const radiceACorpo = new Map<number, number>();
  const corpoDiAsta = new Map<ElementId, number>();
  aste.forEach((a, i) => {
    const r = uf.trova(i);
    if (!radiceACorpo.has(r)) radiceACorpo.set(r, radiceACorpo.size);
    corpoDiAsta.set(a.id, radiceACorpo.get(r)!);
  });

  const n = radiceACorpo.size;
  const asteDelCorpo: ElementId[][] = Array.from({ length: n }, () => []);
  const nodiSet: Set<NodeId>[] = Array.from({ length: n }, () => new Set<NodeId>());
  for (const a of aste) {
    const b = corpoDiAsta.get(a.id)!;
    asteDelCorpo[b].push(a.id);
    nodiSet[b].add(a.nodoIniziale);
    nodiSet[b].add(a.nodoFinale);
  }

  // numero ciclomatico del sottografo di ciascun corpo: archi − vertici + 1.
  // È connesso per costruzione, quindi la formula vale senza correzioni.
  const anelliPerCorpo = asteDelCorpo.map(
    (lista, b) => Math.max(0, lista.length - nodiSet[b].size + 1),
  );
  const anelliTotali = anelliPerCorpo.reduce((a, b) => a + b, 0);

  return {
    n, corpoDiAsta, asteDelCorpo,
    nodiDelCorpo: nodiSet.map((s) => [...s]),
    nodi, anelliPerCorpo, anelliTotali,
    iperstaticitaInterna: 3 * anelliTotali,
    gradiVincoloInterni,
  };
}


/** Un pezzo di asta d'autore che appartiene a un corpo rigido. */
export interface SegmentoCorpo {
  /** asta del modello d'AUTORE */
  astaId: ElementId;
  /** intervallo di ascissa relativa */
  s0: number;
  s1: number;
  corpo: number;
}

/**
 * Partizione riportata sul modello d'autore, per poterla disegnare.
 *
 * Un'asta con una sconnessione in mezzeria appartiene a DUE corpi, uno per
 * tratto: colorarla tutta di una tinta sola mentirebbe proprio nel caso che il
 * colore serve a spiegare.
 */
export function partizionePerDisegno(
  espansione: { progetto: Progetto; tratti: Map<ElementId, { originale: ElementId; s0: number; s1: number }> },
  idx: IndiceModello,
): { segmenti: SegmentoCorpo[]; topologia: Topologia } {
  const topologia = analizzaTopologia(espansione.progetto, idx);
  const segmenti: SegmentoCorpo[] = [];
  for (const a of espansione.progetto.aste) {
    const corpo = topologia.corpoDiAsta.get(a.id);
    if (corpo === undefined) continue;
    const t = espansione.tratti.get(a.id);
    segmenti.push({
      astaId: t?.originale ?? a.id,
      s0: t?.s0 ?? 0,
      s1: t?.s1 ?? 1,
      corpo,
    });
  }
  return { segmenti, topologia };
}

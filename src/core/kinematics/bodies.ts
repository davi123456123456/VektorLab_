/**
 * Decomposizione della struttura in CORPI RIGIDI.
 *
 * La partizione vera e propria sta in `topologia.ts`, che è la sede della
 * regola («nulla separa un corpo rigido tranne una sconnessione interna
 * esplicita»). Qui si aggiunge solo ciò che serve alla matrice cinematica: il
 * baricentro di ogni corpo e, per ciascun nodo, quale gruppo di estremità è
 * rigido e quali sono svincolate rispetto a esso.
 *
 * Due implementazioni della stessa partizione divergerebbero alla prima
 * modifica, quindi questa NON ne ha una propria: chiama l'altra.
 */

import type { ElementId, NodeId, Progetto } from '../model/types.js';
import type { IndiceModello } from '../model/queries.js';
import type { CorpoRigido } from '../model/results.js';
import {
  analizzaTopologia, type EstremitaAlNodo, type Topologia,
} from './topologia.js';

export type EstremitaAsta = EstremitaAlNodo;

export interface NodoDecomposto {
  nodoId: NodeId;
  /** estremità che formano il gruppo rigido del nodo (stesso corpo) */
  master: EstremitaAsta[];
  /** estremità collegate al gruppo master tramite equazioni */
  svincolate: EstremitaAsta[];
}

export interface Decomposizione {
  corpi: CorpoRigido[];
  /** astaId → indice del corpo */
  corpoDiAsta: Map<ElementId, number>;
  nodi: NodoDecomposto[];
  /** nodoId → indice del corpo del gruppo master */
  corpoMasterDelNodo: Map<NodeId, number>;
  /** conteggio topologico completo: anelli chiusi, gradi di vincolo interni */
  topologia: Topologia;
}

export function decomponi(progetto: Progetto, idx: IndiceModello): Decomposizione {
  const t = analizzaTopologia(progetto, idx);

  const corpi: CorpoRigido[] = [];
  for (let b = 0; b < t.n; b++) {
    const ids = t.nodiDelCorpo[b];
    let sx = 0, sy = 0;
    for (const nid of ids) {
      const n = idx.nodi.get(nid)!;
      sx += n.x; sy += n.y;
    }
    corpi.push({
      indice: b, asteIds: t.asteDelCorpo[b], nodiIds: ids,
      xG: ids.length ? sx / ids.length : 0,
      yG: ids.length ? sy / ids.length : 0,
    });
  }

  const nodi: NodoDecomposto[] = t.nodi.map((x) => ({
    nodoId: x.nodoId, master: x.gruppoRigido, svincolate: x.svincolate,
  }));

  const corpoMasterDelNodo = new Map<NodeId, number>();
  for (const nd of nodi) {
    if (nd.master.length > 0) {
      corpoMasterDelNodo.set(nd.nodoId, t.corpoDiAsta.get(nd.master[0].astaId)!);
    }
  }

  return {
    corpi, corpoDiAsta: t.corpoDiAsta, nodi, corpoMasterDelNodo, topologia: t,
  };
}

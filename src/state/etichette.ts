/**
 * ETICHETTE VISIBILI — separate dagli identificatori interni.
 *
 * Sono due cose diverse che finora erano la stessa, e la confusione si vedeva:
 * dopo aver cancellato una struttura e ridisegnata, i nodi ripartivano da `n7`
 * invece che da `n1`.
 *
 *   · l'`id` serve a REFERENZIARE: vincoli, carichi, sconnessioni, segmenti e
 *     cronologia di undo ci puntano. Deve essere univoco e non va MAI
 *     riutilizzato — è la regola dell'iterazione 8 §1.3b, quella che ha chiuso
 *     il bug dei vincoli fantasma, e resta intatta;
 *   · l'`etichetta` serve a LEGGERE. Non è un dato memorizzato: è una funzione
 *     dello stato corrente, ricalcolata a ogni modifica, e per questo resta
 *     sempre compatta e senza buchi.
 *
 * Con questa separazione il comportamento richiesto viene da sé: modello
 * svuotato → nessun nodo → il primo nodo nuovo si chiama `n1`, mentre il suo
 * id interno prosegue da dove il contatore era arrivato. Nessun riferimento
 * passa per l'etichetta, quindi rinumerare non può rompere niente.
 *
 * Le etichette D'AUTORE — `piede-sx`, `testa-dx` degli esempi — vincono sul
 * numero: chi ha dato un nome a un nodo lo ha fatto perché quel nome dice più
 * di `n3`.
 */

import type { ElementId, NodeId, Progetto } from '../core/model/types.js';

export interface Etichette {
  nodo: (id: NodeId) => string;
  asta: (id: ElementId) => string;
}

/**
 * Costruisce le etichette del progetto.
 *
 * La numerazione segue l'ORDINE DELL'ARRAY, che è l'ordine di creazione:
 * eliminando un nodo intermedio le etichette si compattano da sole, senza
 * buchi, ed è precisamente quello che ci si aspetta guardando un elenco.
 */
export function etichette(p: Progetto): Etichette {
  const nodi = new Map<string, string>();
  p.nodi.forEach((n, i) => {
    const chiave = n.id as unknown as string;
    nodi.set(chiave, n.etichetta ?? `n${i + 1}`);
  });

  const aste = new Map<string, string>();
  p.aste.forEach((a, i) => {
    aste.set(a.id as unknown as string, `a${i + 1}`);
  });

  return {
    // il ripiego sull'id non è decorativo: un riferimento pendente va mostrato
    // per quello che è, non nascosto dietro un numero che non gli appartiene
    nodo: (id) => nodi.get(id as unknown as string) ?? (id as unknown as string),
    asta: (id) => aste.get(id as unknown as string) ?? (id as unknown as string),
  };
}

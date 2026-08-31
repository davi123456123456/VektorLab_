/**
 * Generazione degli identificatori.
 *
 * Gli id sono stringhe leggibili (`n1`, `a3`) perché finiscono nei messaggi
 * diagnostici, nei report e nel file `.vektor`: «asta a7 instabile» si legge,
 * «asta 3f2a91c4-…» no.
 *
 * L'unicità è garantita da un CONTATORE PER PREFISSO conservato nel modello, e
 * non dal massimo suffisso presente. La differenza non è di stile: cercando il
 * massimo presente, un modello svuotato riparte da `n1`, e qualunque entità
 * rimasta indietro — un vincolo posato su un'asta, una sconnessione — si
 * riaggancia alla prima geometria ridisegnata. Il contatore non torna indietro
 * mai, nemmeno quando il modello resta senza nodi.
 *
 * Il massimo presente resta come RETE DI SICUREZZA: su un file vecchio, o su
 * un modello arrivato da un import, il contatore può mancare o essere
 * indietro, e in quel caso non deve comunque uscire un id già in uso.
 */

import type { ElementId, LoadId, NodeId, Progetto } from '../core/model/types.js';

/** Collezione da cui leggere gli id già assegnati, per ciascun prefisso. */
function idEsistenti(p: Progetto, prefisso: string): readonly string[] {
  switch (prefisso) {
    case 'n': return p.nodi.map((x) => x.id as string);
    case 'a': return p.aste.map((x) => x.id as string);
    case 'c': return p.carichi.map((x) => x.id as string);
    case 'va': return (p.vincoliSuAsta ?? []).map((x) => x.id);
    case 'sc': return (p.sconnessioni ?? []).map((x) => x.id);
    case 'vi': return (p.vincoliInterni ?? []).map((x) => x.id);
    default: return [];
  }
}

function massimoPresente(p: Progetto, prefisso: string): number {
  let massimo = 0;
  const re = new RegExp(`^${prefisso}(\\d+)$`);
  for (const id of idEsistenti(p, prefisso)) {
    const m = re.exec(id);
    if (m) massimo = Math.max(massimo, Number.parseInt(m[1], 10));
  }
  return massimo;
}

/** Ultimo numero già speso per questo prefisso. */
function contatore(p: Progetto, prefisso: string): number {
  return Math.max(p.contatoriId?.[prefisso] ?? 0, massimoPresente(p, prefisso));
}

function coniato(p: Progetto, prefisso: string, offset: number): string {
  return `${prefisso}${contatore(p, prefisso) + 1 + offset}`;
}

/** Prefisso e numero di un id coniato da qui; null per gli id d'autore. */
function scomponi(id: string): { prefisso: string; numero: number } | null {
  const m = /^([a-z]+)(\d+)$/.exec(id);
  return m ? { prefisso: m[1], numero: Number.parseInt(m[2], 10) } : null;
}

/**
 * Segna gli id come spesi, così non escono una seconda volta.
 *
 * Va chiamata dal comando che li usa, sul progetto che restituisce. È
 * idempotente: rieseguire lo stesso comando dopo un annulla non fa avanzare
 * il contatore due volte, perché prende il massimo e non incrementa.
 */
export function registraId<T extends Progetto>(p: T, ...ids: readonly string[]): T {
  let contatori: Record<string, number> | null = null;
  for (const id of ids) {
    const s = scomponi(id);
    if (!s) continue;   // id d'autore («piede-sx»): non consuma nessun numero
    const attuale = (contatori ?? p.contatoriId)?.[s.prefisso] ?? 0;
    if (s.numero <= attuale) continue;
    contatori ??= { ...(p.contatoriId ?? {}) };
    contatori[s.prefisso] = s.numero;
  }
  return contatori ? { ...p, contatoriId: contatori } : p;
}

/** Il contatore di `sorgente`, portato dentro `destinazione`. Mai all'indietro. */
export function ereditaContatori<T extends Progetto>(destinazione: T, sorgente: Progetto): T {
  const uniti: Record<string, number> = { ...(destinazione.contatoriId ?? {}) };
  for (const [k, v] of Object.entries(sorgente.contatoriId ?? {})) {
    uniti[k] = Math.max(uniti[k] ?? 0, v);
  }
  // anche gli id presenti nel modello di partenza contano come spesi
  for (const k of ['n', 'a', 'c', 'va', 'sc', 'vi']) {
    uniti[k] = Math.max(uniti[k] ?? 0, massimoPresente(sorgente, k));
  }
  return { ...destinazione, contatoriId: uniti };
}

export function nuovoIdNodo(p: Progetto, offset = 0): NodeId {
  return coniato(p, 'n', offset) as NodeId;
}

export function nuovoIdAsta(p: Progetto, offset = 0): ElementId {
  return coniato(p, 'a', offset) as ElementId;
}

export function nuovoIdCarico(p: Progetto, offset = 0): LoadId {
  return coniato(p, 'c', offset) as LoadId;
}

export function nuovoIdVincoloSuAsta(p: Progetto, offset = 0): string {
  return coniato(p, 'va', offset);
}

export function nuovoIdSconnessione(p: Progetto, offset = 0): string {
  return coniato(p, 'sc', offset);
}

export function nuovoIdVincoloInterno(p: Progetto, offset = 0): string {
  return coniato(p, 'vi', offset);
}

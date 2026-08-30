/**
 * Generazione degli identificatori.
 *
 * Gli id sono stringhe leggibili (`n1`, `a3`) perché finiscono nei messaggi
 * diagnostici, nei report e nel file `.vektor`: «asta a7 instabile» si legge,
 * «asta 3f2a91c4-…» no. L'unicità si garantisce cercando il massimo suffisso
 * già usato, così restano stabili anche dopo undo, import e copia-incolla.
 */

import type { ElementId, LoadId, NodeId, Progetto } from '../core/model/types.js';

function prossimoSuffisso(esistenti: readonly string[], prefisso: string): number {
  let massimo = 0;
  const re = new RegExp(`^${prefisso}(\\d+)$`);
  for (const id of esistenti) {
    const m = re.exec(id);
    if (m) massimo = Math.max(massimo, Number.parseInt(m[1], 10));
  }
  return massimo + 1;
}

export function nuovoIdNodo(p: Progetto, offset = 0): NodeId {
  const n = prossimoSuffisso(p.nodi.map((x) => x.id as string), 'n') + offset;
  return `n${n}` as NodeId;
}

export function nuovoIdAsta(p: Progetto, offset = 0): ElementId {
  const n = prossimoSuffisso(p.aste.map((x) => x.id as string), 'a') + offset;
  return `a${n}` as ElementId;
}

export function nuovoIdCarico(p: Progetto, offset = 0): LoadId {
  const n = prossimoSuffisso(p.carichi.map((x) => x.id as string), 'c') + offset;
  return `c${n}` as LoadId;
}

export function nuovoIdVincoloSuAsta(p: Progetto, offset = 0): string {
  const n = prossimoSuffisso((p.vincoliSuAsta ?? []).map((x) => x.id), 'va') + offset;
  return `va${n}`;
}

export function nuovoIdSconnessione(p: Progetto, offset = 0): string {
  const n = prossimoSuffisso((p.sconnessioni ?? []).map((x) => x.id), 'sc') + offset;
  return `sc${n}`;
}

export function nuovoIdVincoloInterno(p: Progetto, offset = 0): string {
  const n = prossimoSuffisso((p.vincoliInterni ?? []).map((x) => x.id), 'vi') + offset;
  return `vi${n}`;
}

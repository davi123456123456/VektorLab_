/**
 * FILE `.vektor` — il progetto salvato su disco.
 *
 * Il formato è il `Progetto` stesso in JSON: niente involucri, così un file
 * si legge anche a occhio. In lettura passa da `migra` e da
 * `verificaIntegrita`, come ogni progetto che entra nell'app: un file scritto
 * da una versione vecchia, o ritoccato a mano, non deve poter introdurre
 * entità orfane.
 */

import { verificaIntegrita } from '../core/model/integrita.js';
import { migra } from '../core/model/migrazione.js';
import type { Progetto } from '../core/model/types.js';

const NON_E_UN_PROGETTO = 'Il file non è un progetto VektorLab';

export function serializza(p: Progetto): string {
  return JSON.stringify(p, null, 2);
}

export function deserializza(testo: string): { progetto: Progetto } | { errore: string } {
  let dati: unknown;
  try {
    dati = JSON.parse(testo);
  } catch {
    return { errore: NON_E_UN_PROGETTO };
  }
  const p = dati as Partial<Progetto> | null;
  if (!p || typeof p !== 'object' || !Array.isArray(p.nodi) || !Array.isArray(p.aste)) {
    return { errore: NON_E_UN_PROGETTO };
  }
  const completo: Progetto = {
    ...p,
    vincoliInterni: p.vincoliInterni ?? [],
    carichi: p.carichi ?? [],
    casi: p.casi ?? [],
    combinazioni: p.combinazioni ?? [],
    materialiPersonalizzati: p.materialiPersonalizzati ?? [],
    sezioniPersonalizzate: p.sezioniPersonalizzate ?? [],
  } as Progetto;
  return { progetto: verificaIntegrita(migra(completo)).progetto };
}

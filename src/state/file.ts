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
  if (!formaDiProgetto(dati)) return { errore: NON_E_UN_PROGETTO };
  const p = dati as Partial<Progetto>;
  const completo: Progetto = {
    ...p,
    vincoliInterni: p.vincoliInterni ?? [],
    carichi: p.carichi ?? [],
    casi: p.casi ?? [],
    combinazioni: p.combinazioni ?? [],
    materialiPersonalizzati: p.materialiPersonalizzati ?? [],
    sezioniPersonalizzate: p.sezioniPersonalizzate ?? [],
  } as Progetto;
  // un file scritto a mano può superare il controllo di forma e rompersi
  // dopo: dentro l'app un file sbagliato deve dare un messaggio, mai un errore
  try {
    return { progetto: verificaIntegrita(migra(completo)).progetto };
  } catch {
    return { errore: NON_E_UN_PROGETTO };
  }
}

/** Controllo di forma: nodi con id e coordinate, aste con id e due nodi, elenchi dove servono elenchi. */
function formaDiProgetto(d: unknown): boolean {
  if (!d || typeof d !== 'object') return false;
  const p = d as Record<string, unknown>;
  if (!Array.isArray(p.nodi) || !Array.isArray(p.aste)) return false;
  const elenchi = ['vincoliInterni', 'carichi', 'casi', 'combinazioni', 'vincoliSuAsta',
    'sconnessioni', 'materialiPersonalizzati', 'sezioniPersonalizzate'];
  if (elenchi.some((k) => p[k] !== undefined && !Array.isArray(p[k]))) return false;
  const nodoValido = (n: unknown): boolean => {
    const x = n as Record<string, unknown> | null;
    return !!x && typeof x.id === 'string' && Number.isFinite(x.x) && Number.isFinite(x.y);
  };
  const astaValida = (a: unknown): boolean => {
    const x = a as Record<string, unknown> | null;
    return !!x && typeof x.id === 'string'
      && typeof x.nodoIniziale === 'string' && typeof x.nodoFinale === 'string';
  };
  return p.nodi.every(nodoValido) && p.aste.every(astaValida);
}

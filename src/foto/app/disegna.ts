/**
 * DISEGNA DALLA FOTO — la struttura letta entra nel foglio corrente.
 *
 * Come voleva Davide: niente foglio nuovo, la foto si disegna nel piano di
 * lavoro, come se le aste, i vincoli e i carichi li avesse messi lo
 * studente. Se c'era già un disegno lo sostituisce, ma con UN solo comando:
 * Annulla rimette tutto com'era (materiali, sezioni e casi compresi).
 */

import type { StoreApi, UseBoundStore } from 'zustand';
import type { Progetto } from '../../core/model/types.js';
import type { Comando } from '../../state/commands.js';
import type { Stato } from '../../state/store.js';

export const ETICHETTA = 'Struttura da foto';

export function comandoDaFoto(nuovo: Progetto): Comando {
  let prima: Progetto | null = null;
  return {
    etichetta: ETICHETTA,
    esegui(p) {
      prima = p;
      return nuovo;
    },
    annulla(p) {
      return prima ?? p;
    },
  };
}

export function disegnaDaFoto(store: UseBoundStore<StoreApi<Stato>>, nuovo: Progetto): void {
  const s = store.getState();
  s.esegui(comandoDaFoto(nuovo));
  const caso = store.getState().progetto.casi[0]?.id;
  if (caso) s.impostaCasoCorrente(caso);
  s.inquadraTutto();
}

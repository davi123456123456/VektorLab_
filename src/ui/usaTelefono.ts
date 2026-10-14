/**
 * È un telefono?
 *
 * La soglia è la stessa del CSS (`max-width: 720px` in `stile.css`): da qui in
 * giù l'interfaccia è quella da telefono, e le due regole devono scattare
 * insieme, o per qualche pixel si vedrebbe mezza barra di una e mezza
 * dell'altra.
 *
 * Serve anche in React, e non solo nel CSS, perché sul telefono alcune parti
 * non vanno nascoste ma TOLTE: un pannello nascosto con `display: none` resta
 * montato, ascolta lo store e ricalcola a ogni modifica per non mostrare
 * niente.
 */

import { useSyncExternalStore } from 'react';

export const QUERY_TELEFONO = '(max-width: 720px)';

function iscrivi(avvisa: () => void): () => void {
  const mq = window.matchMedia(QUERY_TELEFONO);
  mq.addEventListener('change', avvisa);
  return () => mq.removeEventListener('change', avvisa);
}

const leggi = (): boolean => window.matchMedia(QUERY_TELEFONO).matches;

export function usaTelefono(): boolean {
  return useSyncExternalStore(iscrivi, leggi, () => false);
}

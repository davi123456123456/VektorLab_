/**
 * COM'È FATTO IL PUNTATORE, e perché al programma interessa.
 *
 * Un mouse punta con la precisione di un pixel; un dito copre un cerchio di
 * una quarantina. Le tolleranze di selezione scritte per il mouse — dieci
 * pixel su un nodo, sette su un'asta — su un telefono rendono la selezione
 * semplicemente impossibile: si tocca l'asta e non succede niente, e sembra
 * che il programma sia rotto.
 *
 * Qui si risponde a una domanda sola, e il resto del programma la interroga
 * invece di indovinare dalla larghezza della finestra: un tablet largo ha le
 * dita, un portatile stretto ha il trackpad.
 */

/** Il puntatore principale è grosso (dito o pennino)? */
export function puntatoreGrosso(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(pointer: coarse)').matches;
}

/**
 * Fattore per cui moltiplicare una tolleranza pensata per il mouse.
 *
 * 2,4 non è scelto a caso: porta i dieci pixel del nodo a ventiquattro e i
 * sette dell'asta a diciassette, che è l'ordine di grandezza del contatto di
 * un polpastrello su uno schermo a densità doppia. Oltre, le aste vicine
 * comincerebbero a rubarsi i tocchi.
 */
export const FATTORE_TOCCO = 2.4;

/** Una tolleranza in pixel, adattata al puntatore in uso. */
export function tolleranza(perMouse: number): number {
  return puntatoreGrosso() ? perMouse * FATTORE_TOCCO : perMouse;
}

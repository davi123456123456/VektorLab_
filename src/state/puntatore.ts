/**
 * Posizione corrente del puntatore, in coordinate schermo.
 *
 * Vive fuori da React e fuori dallo store: viene aggiornata a ogni movimento
 * del mouse, e metterla nello stato reattivo scatenerebbe un render dell'intero
 * albero decine di volte al secondo. Chi la legge lo fa dentro il ciclo di
 * disegno o in un gestore di eventi, mai in fase di render.
 */

import type { Punto } from '../render/camera.js';

let posizione: Punto = { x: 0, y: 0 };

export const leggiPuntatore = (): Punto => posizione;
export const scriviPuntatore = (p: Punto): void => { posizione = p; };

/*
 * IL PUNTATORE È SULLO SCHERMO?
 *
 * Il mouse sì, sempre: anche fermo indica un punto, ed è giusto che
 * l'anteprima dell'asta e il segnalino d'aggancio lo seguano. Il dito no:
 * alzato, la posizione che resta qui è solo quella dell'ultimo tocco. Senza
 * questa distinzione, dopo un «annulla» l'asta elastica ripartiva dal nodo
 * precedente verso quel punto vecchio, e una linea tratteggiata restava a
 * terra senza che nessuno stesse toccando niente.
 */
let presente = true;

export const puntatorePresente = (): boolean => presente;
export const segnaPuntatorePresente = (v: boolean): void => { presente = v; };

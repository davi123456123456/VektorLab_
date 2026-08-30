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

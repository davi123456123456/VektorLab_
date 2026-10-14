/**
 * CIÒ CHE SUL TELEFONO NON SI MOSTRA.
 *
 * Avvolge le parti dei pannelli che a dito non servono: la verifica di
 * resistenza, le tabelle dei materiali, i cinematismi, le autoverifiche, i
 * controlli dei diagrammi. Il codice resta intero e al computer non cambia
 * niente; sul telefono quelle parti non vengono montate, quindi non occupano
 * schermo e non calcolano niente per nessuno.
 *
 * Per rimettere qualcosa sul telefono basta togliere l'involucro.
 */

import type { ReactNode } from 'react';
import { usaTelefono } from './usaTelefono.js';

export function SoloComputer({ children }: { children: ReactNode }) {
  return usaTelefono() ? null : <>{children}</>;
}

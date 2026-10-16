/**
 * Il lato della tratteggiata di ogni elemento del modello di calcolo, per i
 * pannelli che scrivono T e M: devono dire lo stesso segno dei diagrammi.
 * Vedi `latiDelCalcolo` e `vistaDallaTratteggiata`.
 */

import { useMemo } from 'react';
import { latiDelCalcolo } from '../core/model/tratteggiata.js';
import { useStore } from '../state/store.js';

export function usaLatiTratteggiata() {
  const progetto = useStore((s) => s.progetto);
  const calcolo = useStore((s) => s.modelloDiCalcolo);
  return useMemo(() => latiDelCalcolo(progetto, calcolo ?? progetto), [progetto, calcolo]);
}

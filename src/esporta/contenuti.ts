/**
 * §2.2 — che cosa mettere nella relazione.
 *
 * Sta in un modulo suo, minuscolo, perché lo importa la finestra di scelta
 * mentre il modulo che compone davvero il documento — con dentro i font, i
 * diagrammi e lo scrittore PDF — deve restare a caricamento differito: chi
 * non esporta mai non deve scaricarlo.
 */

export type Orientamento = 'verticale' | 'orizzontale';

export interface ContenutiScelti {
  schema: boolean;
  dati: boolean;
  cinematica: boolean;
  reazioni: boolean;
  diagrammi: boolean;
  sezione: boolean;
  coefficiente: boolean;
  diagnostica: boolean;
  /** «sulla struttura», «per asta», o entrambi */
  modoDiagrammi: 'struttura' | 'asta' | 'entrambi';
  orientamento: Orientamento;
}

/** Tutto acceso tranne la diagnostica, come chiede la tabella del §2.2. */
export const CONTENUTI_PREDEFINITI: ContenutiScelti = {
  schema: true, dati: true, cinematica: true, reazioni: true,
  diagrammi: true, sezione: true, coefficiente: true,
  diagnostica: false,
  modoDiagrammi: 'struttura', orientamento: 'verticale',
};

/** Tipi dei risultati prodotti da `core/`. */

import type { ElementId, NodeId, LoadCaseId, CombinationId } from './types.js';

// ═══════════════════════ ANALISI CINEMATICA ═══════════════════════

export interface CorpoRigido {
  /** indice progressivo 0..n-1 */
  indice: number;
  asteIds: ElementId[];
  nodiIds: NodeId[];
  /** punto di riferimento del corpo (baricentro dei suoi nodi) */
  xG: number;
  yG: number;
}

/** Centro di istantanea rotazione di un corpo in un modo labile. */
export type CIR =
  | { tipo: 'proprio'; x: number; y: number }
  /** rotazione nulla: traslazione rigida, CIR all'infinito nella direzione ⊥ */
  | { tipo: 'improprio'; direzione: number }
  /** il corpo è fermo in questo modo */
  | { tipo: 'fermo' };

export interface ModoLabile {
  /** ampiezza normalizzata (‖modo‖ = 1) */
  motoPerCorpo: { corpoIndice: number; ux: number; uy: number; phi: number }[];
  cir: CIR[];
}

export type Classificazione =
  | 'isostatica'
  | 'iperstatica'
  | 'labile'
  | 'labile e iperstatica';

export interface Diagnosi {
  gravita: 'errore' | 'avviso' | 'info';
  codice: string;
  messaggio: string;
  evidenza?:
    | { tipo: 'punto'; x: number; y: number }
    | { tipo: 'retta'; x: number; y: number; direzione: number }
    | { tipo: 'nodi'; ids: NodeId[] }
    | { tipo: 'aste'; ids: ElementId[] };
}

export interface RisultatoCinematico {
  corpi: CorpoRigido[];
  /** n = numero di corpi rigidi */
  numeroCorpi: number;
  /** 3n */
  gradiLiberta: number;
  /** v = numero di equazioni di vincolo (righe della matrice cinematica) */
  gradiVincolo: number;
  /** rango numerico della matrice cinematica (via SVD) */
  rango: number;
  /** 3n − rango */
  labilita: number;
  /** v − rango */
  iperstaticita: number;
  classificazione: Classificazione;
  /** base ortonormale del nucleo: i modi di meccanismo */
  meccanismi: ModoLabile[];
  /** valori singolari, per mostrare "quanto" la struttura è quasi labile */
  valoriSingolari: number[];
  /**
   * Anelli chiusi rimasti dentro i corpi rigidi, e le iperstaticità INTERNE
   * che ne discendono (3 per anello).
   *
   * Non compaiono nel bilancio 3n − v, perché quel bilancio guarda i corpi
   * dall'esterno: un telaio chiuso è un corpo solo, e sembra isostatico anche
   * quando le sue caratteristiche di sollecitazione non discendono
   * dall'equilibrio. Vanno dichiarate a parte.
   */
  anelliChiusi: number;
  iperstaticitaInterna: number;
  /** gradi di vincolo dovuti alle sconnessioni interne */
  gradiVincoloInterni: number;
  /** gradi di vincolo dovuti ai vincoli esterni */
  gradiVincoloEsterni: number;
  diagnosi: Diagnosi[];
}

// ═══════════════════════ ANALISI STATICA ═══════════════════════

export interface Reazione {
  nodoId: NodeId;
  fx: number;
  fy: number;
  mz: number;
}

export type TipoPuntoNotevole =
  | 'M_max' | 'M_min' | 'T_zero' | 'estremo' | 'discontinuita';

export interface PuntoNotevole {
  /** ascissa relativa lungo l'asta, in [0,1] */
  s: number;
  /** ascissa metrica [m] */
  x: number;
  tipo: TipoPuntoNotevole;
  N: number;
  T: number;
  M: number;
}

export interface RisultatoAsta {
  astaId: ElementId;
  lunghezza: number;
  /** forze d'estremità in assi LOCALI: [Fx_i, Fy_i, Mz_i, Fx_j, Fy_j, Mz_j].
   *  Sono le forze che i nodi esercitano SULL'ELEMENTO. */
  forzeEstremita: readonly [number, number, number, number, number, number];
  /** ascisse metriche di campionamento (includono sempre i punti notevoli) */
  ascisse: Float64Array;
  N: Float64Array;
  T: Float64Array;
  M: Float64Array;
  /** spostamenti in assi locali lungo l'asta (per la deformata) */
  uLocale: Float64Array;
  vLocale: Float64Array;
  puntiNotevoli: PuntoNotevole[];
  /** freccia massima rispetto alla corda fra gli estremi deformati [m] */
  frecciaMassima: number;
  /** ascissa della freccia massima [m] */
  xFreccia: number;
  /** valori estremi, comodi per la scala dei diagrammi */
  estremi: { Nmin: number; Nmax: number; Tmin: number; Tmax: number; Mmin: number; Mmax: number };
}

export interface VerificaEquilibrio {
  sommaFx: number;
  sommaFy: number;
  sommaMz: number;
  /** norma del residuo rapportata alla norma dei carichi applicati */
  residuoRelativo: number;
  soddisfatto: boolean;
}

export interface DiagnosticaSolutore {
  /** pivot minimo in valore assoluto della fattorizzazione LDLᵀ */
  pivotMinimo: number;
  /** DOF con pivot ~nullo: la struttura è labile in queste direzioni */
  dofSingolari: number[];
  /** modi di meccanismo estratti dal nucleo di K_ff (vettori sui DOF globali) */
  nucleo: Float64Array[];
  numeroDof: number;
  numeroDofLiberi: number;
  tempoMs: number;
}

export interface RisultatoAnalisi {
  sorgente:
    | { tipo: 'caso'; id: LoadCaseId }
    | { tipo: 'combinazione'; id: CombinationId };
  /** spostamenti sui DOF globali */
  spostamenti: Float64Array;
  reazioni: Reazione[];
  aste: RisultatoAsta[];
  equilibrio: VerificaEquilibrio;
  diagnostica: DiagnosticaSolutore;
  /**
   * Spostamento traslazionale massimo della struttura [m], nodi E punti
   * interni alle aste. Contare i soli nodi darebbe zero su una trave
   * appoggiata modellata con un solo elemento.
   */
  spostamentoMassimo: number;
}

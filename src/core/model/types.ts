/**
 * Tipi del modello strutturale. Tutto serializzabile in JSON (formato `.vektor`).
 *
 * CONVENZIONI GEOMETRICHE (vedi anche docs/convenzioni.md)
 * --------------------------------------------------------
 * Assi globali: x verso destra, y verso l'ALTO, z uscente dal piano.
 * Rotazioni θz positive ANTIORARIE.
 * Il canvas ha y verso il basso: il ribaltamento avviene solo in `render/`,
 * `core/` non sa che esiste uno schermo.
 *
 * Assi locali dell'asta: x_loc dal nodo iniziale al nodo finale;
 * y_loc = x_loc ruotato di +90° (antiorario).
 */

import type {
  Metri, Newton, NewtonM, NewtonSuM, Radianti, DeltaT,
} from '../units.js';

// riesportati: chi costruisce un modello ha bisogno di questi tipi e non deve
// risalire a `units.js` per trovarli
export type { Metri, Newton, NewtonM, NewtonSuM, Radianti, DeltaT };

// ── identificatori branded (impediscono di scambiare un id di nodo con uno di asta) ──
declare const ID: unique symbol;
type Id<T extends string> = string & { readonly [ID]: T };

export type NodeId = Id<'Node'>;
export type ElementId = Id<'Element'>;
export type MaterialId = Id<'Material'>;
export type SectionId = Id<'Section'>;
export type LoadId = Id<'Load'>;
export type LoadCaseId = Id<'LoadCase'>;
export type CombinationId = Id<'Combination'>;

export const nodeId = (s: string): NodeId => s as NodeId;
export const elementId = (s: string): ElementId => s as ElementId;
export const materialId = (s: string): MaterialId => s as MaterialId;
export const sectionId = (s: string): SectionId => s as SectionId;
export const loadId = (s: string): LoadId => s as LoadId;
export const loadCaseId = (s: string): LoadCaseId => s as LoadCaseId;
export const combinationId = (s: string): CombinationId => s as CombinationId;

// ═══════════════════════════════ GEOMETRIA ═══════════════════════════════

export interface Nodo {
  id: NodeId;
  x: Metri;
  y: Metri;
  vincolo?: Vincolo;
  etichetta?: string;
}

export type TipoVincolo =
  | 'incastro'
  | 'cerniera'
  | 'carrello'
  | 'bipendolo'
  | 'pattino'
  | 'biella'
  | 'molla';

/**
 * Vincolo esterno. Il significato di `angolo` DIPENDE dal tipo — è la sola
 * ambiguità pericolosa di tutta l'interfaccia, quindi è documentata qui e
 * ripetuta nei tooltip:
 *
 *   carrello   angolo = inclinazione del PIANO DI SCORRIMENTO.
 *              Blocca la traslazione NORMALE al piano.           [1 grado]
 *   biella     angolo = direzione dell'ASSE DELLA BIELLA.
 *              Blocca la traslazione LUNGO l'asse.               [1 grado]
 *   bipendolo  angolo = inclinazione del piano di scorrimento.
 *   pattino    Bloccano traslazione normale al piano + rotazione. [2 gradi]
 *              (bipendolo e pattino sono cinematicamente identici:
 *               cambia solo il simbolo grafico e la tradizione d'uso)
 *   cerniera   angolo ignorato. Blocca entrambe le traslazioni.  [2 gradi]
 *   incastro   angolo ignorato. Blocca tutto.                    [3 gradi]
 *   molla      angolo = rotazione del riferimento delle rigidezze.
 *              Vincolo ELASTICO: non compare nella matrice cinematica
 *              (non è un vincolo rigido) ma irrigidisce la matrice K.
 */
export interface Vincolo {
  tipo: TipoVincolo;
  /**
   * Direzione di PUNTAMENTO, in [0, 2π): dove guarda il vertice del simbolo.
   * Il corpo del simbolo sta dalla parte opposta, e la reazione dei vincoli
   * direzionali è lungo û = (−sin α, cos α). Vedi `model/orientamento.ts`:
   * è l'unico posto dove quella formula è scritta.
   */
  angolo: Radianti;
  /** solo tipo='molla': rigidezze nel riferimento ruotato di `angolo`.
   *  null su una componente = quella direzione resta libera.
   *  kx, ky in [N/m]; krz in [N·m/rad]. */
  rigidezza?: {
    kx: number | null;
    ky: number | null;
    krz: number | null;
  };
}

/** Svincolo di estremità: `true` = la componente NON è trasmessa. */
export interface SvincoloEstremita {
  /** sforzo normale rilasciato (scorrimento assiale libero) */
  N: boolean;
  /** taglio rilasciato (scorrimento trasversale libero) */
  T: boolean;
  /** momento rilasciato (rotazione relativa libera = cerniera) */
  M: boolean;
}

export const NESSUNO_SVINCOLO: SvincoloEstremita = { N: false, T: false, M: false };
export const CERNIERA_SVINCOLO: SvincoloEstremita = { N: false, T: false, M: true };

export interface Asta {
  id: ElementId;
  nodoIniziale: NodeId;
  nodoFinale: NodeId;
  materialeId: MaterialId;
  sezioneId: SectionId;
  /** UNICA fonte di verità per cerniere e svincoli interni. */
  svincolo: { iniziale: SvincoloEstremita; finale: SvincoloEstremita };
  /**
   * Assegnazione SPECIFICA: quest'asta non segue la sezione (o il materiale)
   * predefinito del modello, perché gliene è stato assegnato uno suo.
   *
   * Il caso normale è l'opposto — un profilo solo per tutta la struttura — e
   * deve funzionare senza selezionare niente: cambiando il predefinito si
   * aggiornano tutte le aste tranne queste.
   */
  sezioneSpecifica?: boolean;
  materialeSpecifico?: boolean;
  /**
   * Asta d'origine, quando questo segmento nasce dalla suddivisione di
   * un'altra. È solo una traccia per l'interfaccia — l'outliner mostra una
   * riga sola dove l'utente ha tracciato una linea sola — e non ha alcun
   * effetto sul calcolo: i segmenti sono a tutti gli effetti aste distinte,
   * rigidamente connesse nel nodo che condividono.
   */
  gruppo?: ElementId;
  /** angolo della fibratura rispetto a x_loc (legno, compositi ortotropi) */
  angoloFibratura?: Radianti;
  /** override della lunghezza libera di inflessione: L0 = beta · L */
  betaInstabilita?: number;
  pesoProprio?: boolean;
  /** default: 'auto' → Timoshenko se L/h < 10, altrimenti Eulero-Bernoulli */
  teoria?: 'eulero-bernoulli' | 'timoshenko' | 'auto';
}

/**
 * VINCOLO ESTERNO IN POSIZIONE INTERMEDIA — non interrompe l'asta.
 *
 * È il caso della trave continua su tre appoggi: l'appoggio centrale sta in
 * mezzo alla trave, ma la trave resta UN SOLO corpo rigido e la rotazione è
 * continua attraverso quel punto. Ai fini del calcolo l'asta viene suddivisa
 * in due elementi con continuità completa dei gradi di libertà, ma nel modello
 * e nell'outliner resta una sola entità: chi ha disegnato una trave non deve
 * vederne due.
 *
 * Da NON confondere con `SconnessioneSuAsta`, che invece divide il corpo.
 */
export interface VincoloSuAsta {
  id: string;
  astaId: ElementId;
  /** posizione lungo l'asta, ascissa relativa in (0,1) */
  s: number;
  vincolo: Vincolo;
}

/**
 * SCONNESSIONE INTERNA in posizione qualsiasi — divide il corpo rigido.
 *
 * La cerniera interna consente la rotazione relativa fra i due tronchi e per
 * definizione NON trasmette momento: in quel punto M = 0 esattamente, ed è la
 * proprietà usata sia come equazione ausiliaria sia come autoverifica.
 *
 *   cerniera  trasmette N e T, non M   → rotazione relativa libera
 *   bipendolo trasmette N e M, non T   → traslazione relativa perpendicolare
 *   pattino   trasmette T e M, non N   → scorrimento relativo assiale
 */
export interface SconnessioneSuAsta {
  id: string;
  astaId: ElementId;
  /** posizione lungo l'asta, ascissa relativa in (0,1) */
  s: number;
  tipo: 'cerniera' | 'bipendolo' | 'pattino';
  /** orientazione, per bipendolo e pattino */
  angolo?: Radianti;
}

/**
 * Oggetto di AUTHORING e di disegno. Non è la fonte di verità della fisica:
 * quando l'utente piazza una cerniera interna, l'editor scrive gli svincoli
 * sulle estremità delle aste elencate in `asteSvincolate`. `astaMaster` resta
 * rigidamente connessa al nodo — indispensabile sia nel FEM (altrimenti il DOF
 * rotazionale del nodo resterebbe libero) sia nel conteggio dei gradi di
 * vincolo, dove m aste incernierate danno 2(m−1) gradi.
 */
export interface VincoloInterno {
  id: string;
  tipo: 'cerniera' | 'bipendolo' | 'pattino' | 'biella';
  nodoId: NodeId;
  /**
   * Asta che resta rigidamente connessa al nodo. Se assente la sceglie
   * l'espansione: serve un lato rigido, altrimenti il grado di libertà
   * rotazionale del nodo resta indeterminato.
   */
  astaMaster?: ElementId;
  /**
   * Aste sconnesse rispetto alla master. Se assente sono TUTTE le altre che
   * convergono nel nodo — è il caso normale, la cerniera che riguarda l'intero
   * nodo. Elencarne solo alcune realizza la sconnessione PARZIALE: in un nodo
   * con tre o più aste, la cerniera può riguardarne soltanto due.
   */
  asteSvincolate?: ElementId[];
  angolo?: Radianti;
}

// ═══════════════════════════════ CARICHI ═══════════════════════════════

/**
 * Riferimento di un carico distribuito: la direzione lungo cui agisce.
 *
 * NON È UN DETTAGLIO — un carico su un'asta verticale può essere ortogonale al
 * suo asse (vento su una parete) oppure verticale (peso proprio); su una falda
 * inclinata la neve si misura per unità di proiezione orizzontale mentre il
 * peso proprio per unità di lunghezza effettiva. Lasciare la direzione
 * implicita significa sbagliare tutti questi casi in silenzio, e sono i più
 * comuni.
 */
export type ModoRiferimento =
  /** perpendicolare all'asse dell'asta: ruota con essa */
  | 'localeOrtogonale'
  /** parallelo all'asse dell'asta */
  | 'localeAssiale'
  /** orizzontale, indipendente dall'orientamento dell'asta */
  | 'globaleX'
  /** verticale, indipendente dall'orientamento dell'asta */
  | 'globaleY'
  /** direzione arbitraria, definita dall'angolo `alpha` rispetto a x globale */
  | 'angolo';

export interface DirezioneCarico {
  modo: ModoRiferimento;
  /** solo per modo 'angolo': direzione rispetto all'asse x globale */
  alpha?: Radianti;
  /**
   * Solo per i modi in assi globali, e solo su aste inclinate.
   *
   * false (predefinito) — q è per unità di lunghezza DELL'ASTA.
   *                        Risultante = q · L.  È il caso del peso proprio.
   * true                — q è per unità di PROIEZIONE sul piano ortogonale
   *                        alla direzione del carico.
   *                        Risultante = q · L · |sin(asta, direzione)|.
   *                        È il caso della neve, misurata in pianta.
   *
   * Su un'asta orizzontale con carico verticale i due coincidono; su una
   * falda a 30° differiscono del 13 %, che è esattamente il tipo di errore
   * che nessuno nota rileggendo i numeri.
   */
  perProiezione?: boolean;
}

/** Riferimento delle FORZE concentrate: assi globali o locali dell'asta. */
export type Riferimento = 'globale' | 'locale';

/** Verso di un momento. La convenzione interna è antiorario positivo. */
export type VersoMomento = 'antiorario' | 'orario';

export type Carico = { id: LoadId; casoId: LoadCaseId } & CaricoDati;

export type CaricoDati =
  | { tipo: 'forzaNodale'; nodoId: NodeId; fx: Newton; fy: Newton }
  | { tipo: 'momentoNodale'; nodoId: NodeId; mz: NewtonM }
  | {
      tipo: 'distribuito';
      astaId: ElementId;
      /** direzione e convenzione di misura dell'intensità */
      direzione: DirezioneCarico;
      /** ascisse relative del tratto caricato, in [0,1] */
      sIniziale: number;
      sFinale: number;
      /** intensità all'inizio del tratto caricato [N/m]; il segno dà il verso */
      q1: NewtonSuM;
      /** intensità alla fine del tratto caricato [N/m] */
      q2: NewtonSuM;
    }
  | {
      tipo: 'forzaInCampata';
      astaId: ElementId;
      /** ascissa relativa in [0,1] */
      s: number;
      fx: Newton;
      fy: Newton;
      riferimento: Riferimento;
    }
  | { tipo: 'momentoInCampata'; astaId: ElementId; s: number; mz: NewtonM }
  | {
      tipo: 'termico';
      astaId: ElementId;
      /** variazione uniforme sull'asse: allunga/accorcia */
      deltaTUniforme: DeltaT;
      /** gradiente sull'altezza: T(fibra +y_loc) − T(fibra −y_loc). Incurva. */
      deltaTGradiente: DeltaT;
    }
  | { tipo: 'cedimento'; nodoId: NodeId; ux: Metri; uy: Metri; rz: Radianti };

// ═══════════════════════ CASI E COMBINAZIONI ═══════════════════════

export type NaturaCarico =
  | 'G1' | 'G2' | 'Q' | 'neve' | 'vento' | 'sisma' | 'termico' | 'cedimenti';

export interface CasoDiCarico {
  id: LoadCaseId;
  nome: string;
  natura: NaturaCarico;
}

export type TipoCombinazione =
  | 'SLU' | 'SLE_rara' | 'SLE_frequente' | 'SLE_quasiPermanente';

export interface Combinazione {
  id: CombinationId;
  nome: string;
  tipo: TipoCombinazione;
  /** coefficiente = γ · ψ già moltiplicati */
  termini: { casoId: LoadCaseId; coefficiente: number }[];
}

// ═══════════════════════ MATERIALI E SEZIONI ═══════════════════════

export type ComportamentoMateriale = 'duttile' | 'fragile' | 'ortotropo';

export interface Materiale {
  id: MaterialId;
  nome: string;
  famiglia: string;
  comportamento: ComportamentoMateriale;
  /** modulo di Young [Pa]. Per ortotropi: modulo longitudinale E1. */
  E: number;
  /** modulo di taglio [Pa] */
  G: number;
  nu: number;
  /** densità [kg/m³] */
  rho: number;
  /** dilatazione termica [1/K] */
  alpha: number;
  /** ortotropi: modulo trasversale E2 [Pa] */
  E2?: number;
  resistenze: {
    /** snervamento o f0.2 [Pa] — materiali duttili */
    fy?: number;
    /** rottura [Pa] */
    fu?: number;
    /** resistenza a trazione [Pa] — materiali fragili/ortotropi */
    ft?: number;
    /** resistenza a compressione [Pa] (valore POSITIVO) */
    fc?: number;
    /** resistenza a flessione [Pa] — legno */
    fm?: number;
  };
  /** coefficiente parziale di sicurezza sul materiale */
  gammaM: number;
  /** curva di instabilità EC3: 'a0'|'a'|'b'|'c'|'d'; assente = non applicabile */
  curvaInstabilita?: 'a0' | 'a' | 'b' | 'c' | 'd';
  costoEuroKg?: number;
  riferimentoNormativo?: string;
}

export interface Sezione {
  id: SectionId;
  nome: string;
  famiglia: 'rettangolare' | 'circolare' | 'tuboCircolare' | 'tuboRettangolare'
          | 'IPE' | 'HEA' | 'HEB' | 'UPN' | 'L' | 'generica';
  /** area [m²] */
  A: number;
  /** momento d'inerzia attorno all'asse forte nel piano [m⁴] */
  I: number;
  /** modulo di resistenza elastico [m³] */
  W: number;
  /** altezza della sezione [m] — serve per il gradiente termico e per L/h */
  h: number;
  /** larghezza [m] */
  b?: number;
  /** area resistente a taglio [m²] (Timoshenko, τ = T/Av) */
  Av?: number;
  /** momento statico massimo [m³] per τ = T·S/(I·b) */
  Smax?: number;
  /** raggio d'inerzia [m] = √(I/A) */
  i?: number;
  /** contorno per il disegno della sezione, coordinate locali [m] */
  contorno?: { y: number; z: number }[];
  /**
   * Misure che definiscono la sezione. Quando presenti sono la FONTE DI
   * VERITÀ: A, I, W qui sopra ne discendono e vanno ricalcolate a ogni
   * modifica. Servono anche alla verifica tensionale, che ha bisogno di b(y)
   * e S(y) e non può ricavarli dalle sole proprietà globali.
   */
  parametri?: import('../materials/sezioniParametriche.js').ParametriSezione;
}

// ═══════════════════════════ IMPOSTAZIONI ═══════════════════════════

export interface ImpostazioniAnalisi {
  /** convenzione di disegno del momento */
  momentoDallaParteDelleFibreTese: boolean;
  /** numero minimo di campioni per asta nei diagrammi */
  campioniPerAsta: number;
  /** tolleranza relativa per il rango numerico della matrice cinematica */
  tolleranzaRango: number;
  /** limite di freccia per la verifica SLE: L/limiteFreccia */
  limiteFreccia: number;
  includiPesoProprio: boolean;
}

export const IMPOSTAZIONI_DEFAULT: ImpostazioniAnalisi = {
  momentoDallaParteDelleFibreTese: true,
  campioniPerAsta: 41,
  tolleranzaRango: 1e-9,
  limiteFreccia: 250,
  includiPesoProprio: false,
};

// ═══════════════════════════════ PROGETTO ═══════════════════════════════

export interface Progetto {
  /**
   * Versione del formato di file. 1 = carichi distribuiti con componenti
   * (qx, qy); 2 = intensità più direzione dichiarata. `migra()` porta i
   * vecchi file al formato corrente in lettura.
   */
  versioneFormato: 1 | 2;
  nome: string;
  /**
   * CONTATORE DEGLI ID, per prefisso. Monotòno: non torna mai indietro, e
   * soprattutto NON si azzera quando il modello si svuota.
   *
   * Senza di lui gli id si ricavavano dal massimo suffisso presente, e a
   * modello vuoto il prossimo nodo tornava a chiamarsi `n1`. Bastava una
   * singola entità orfana rimasta indietro perché si riagganciasse alla
   * geometria nuova: l'utente si ritrovava vincoli che non aveva messo.
   *
   * Assente sui file salvati prima della versione 3: `migra()` lo ricostruisce
   * dal massimo id trovato, che è esatto perché quei file non hanno buchi.
   */
  contatoriId?: Record<string, number>;
  nodi: Nodo[];
  aste: Asta[];
  vincoliInterni: VincoloInterno[];
  /**
   * Sezione e materiale predefiniti del modello: quelli che seguono tutte le
   * aste senza assegnazione specifica. Assenti su un modello vecchio, dove si
   * ricavano dalla prima asta.
   */
  sezionePredefinita?: SectionId;
  materialePredefinito?: MaterialId;
  /** vincoli esterni posti lungo un'asta: non la interrompono */
  vincoliSuAsta?: VincoloSuAsta[];
  /** sconnessioni interne poste lungo un'asta: la dividono in due corpi */
  sconnessioni?: SconnessioneSuAsta[];
  carichi: Carico[];
  casi: CasoDiCarico[];
  combinazioni: Combinazione[];
  materialiPersonalizzati: Materiale[];
  sezioniPersonalizzate: Sezione[];
  impostazioni: ImpostazioniAnalisi;
}

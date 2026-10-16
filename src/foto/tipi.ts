/**
 * CONTRATTI DEL RICONOSCIMENTO DA FOTO.
 *
 * Il riconoscimento è diviso in stadi che si passano due soli tipi di dato:
 *
 *   · `Primitive` — COSA È DISEGNATO, in pixel: segmenti di linea spessa,
 *     pallini, corpi di vincolo, frecce, archi, scritte. È ciò che produce la
 *     rete (o, nei test, il disegno di prova). Non contiene interpretazione.
 *   · `Grafo` — COSA SIGNIFICA: punti notevoli, tratti fra punti consecutivi,
 *     giunti, vincoli, carichi, quote. Le regole di lettura lo costruiscono
 *     dalle primitive; la metrica gli assegna le posizioni in unità di L.
 *
 * Tenere separate le due cose è ciò che permette di correggere una regola
 * senza riaddestrare la rete, e di provare le regole senza la rete.
 *
 * CONVENZIONI
 * -----------
 * Coordinate in pixel con y verso l'ALTO: la decodifica dell'immagine
 * ribalta l'asse una volta sola, e da lì in poi vale la stessa convenzione
 * del nucleo (`core/model/types.ts`). Angoli in radianti, antiorari.
 * L'angolo dei vincoli è la DIREZIONE DI PUNTAMENTO di VektorLab,
 * û(α) = (−sin α, cos α): vedi `core/model/orientamento.ts`.
 */

export interface Punto { x: number; y: number }

// ═══════════════════════════════ PRIMITIVE ═══════════════════════════════

/** Pezzo rettilineo della linea d'asta, la linea nera spessa. */
export interface SegmentoAsta { a: Punto; b: Punto; spessore: number; confidenza: number }

export interface Pallino { c: Punto; r: number; confidenza: number }

/**
 * Il corpo del simbolo, SENZA il pallino: il pallino è una primitiva a sé,
 * perché è dalla sua posizione rispetto alla linea che si capisce se l'asta
 * si divide o prosegue.
 */
export type TipoCorpo =
  | 'triangolo' | 'triangoloRulli' | 'incastro' | 'doppioPendolo'
  | 'pattino' | 'biella' | 'doppioPendoloInterno' | 'pattinoInterno';

/**
 * `attacco` è il punto dove il simbolo tocca la struttura (il vertice del
 * triangolo, il bordo dell'incastro); per i corpi interni è il centro del
 * simbolo sull'asse dell'asta.
 */
export interface CorpoVincolo {
  tipo: TipoCorpo; attacco: Punto; angolo: number; confidenza: number;
  /** quanto la rete crede a ciascun tipo: il revisore sceglie da qui l'alternativa più probabile */
  punteggi?: Partial<Record<TipoCorpo, number>>;
}

/** Freccia singola: `direzione` è il verso della punta. */
export interface Freccia { punta: Punto; direzione: number; lunghezza: number; confidenza: number }

/**
 * Sotto questa confidenza il verso di un momento è incerto: la decodifica
 * non ha trovato la punta del suo arco, la lettura lo segnala.
 */
export const VERSO_INCERTO = 0.25;

/** Verso come lo vede chi guarda il foglio. */
export interface ArcoMomento {
  centro: Punto; raggio: number; verso: 'orario' | 'antiorario'; confidenza: number;
}

export type ValoreScritta =
  | { famiglia: 'L'; valore: number }
  | { famiglia: 'q' | 'F' | 'M'; coefficiente: number }
  | { famiglia: 'altro' };

/**
 * Per le quote, `estremi` sono i due capi del TRATTO misurato: la stessa
 * informazione sia per la scritta su una linea di quota con le frecce, sia
 * per la scritta posata accanto all'asta.
 */
export interface Scritta {
  centro: Punto; valore: ValoreScritta; estremi?: [Punto, Punto]; confidenza: number;
}

export interface Primitive {
  larghezza: number;
  altezza: number;
  aste: SegmentoAsta[];
  pallini: Pallino[];
  corpi: CorpoVincolo[];
  frecce: Freccia[];
  momenti: ArcoMomento[];
  nodi: Punto[];
  scritte: Scritta[];
}

// ═══════════════════════════════ AVVISI ═══════════════════════════════

export type CodiceAvviso =
  | 'nessunaAsta' | 'simboloIsolato' | 'cernieraAmbigua'
  | 'partizioneNonRappresentabile' | 'versoIncerto' | 'coefficienteNonLetto'
  | 'caricoNonAgganciato' | 'quotaNonLetta' | 'quoteIncoerenti' | 'nessunaQuota'
  | 'integrita' | 'primitiveScartate' | 'nessunVincolo' | 'erroreLettura' | 'puntiFusi'
  | 'revisione';

/** Ciò che lo studente deve controllare: il motore non tira a indovinare in silenzio. */
export interface Avviso { codice: CodiceAvviso; messaggio: string; punti?: string[] }

// ═══════════════════════════════ GRAFO ═══════════════════════════════

/** `pos` in unità di L, y verso l'alto: la assegna la metrica. */
export interface PuntoGrafo { id: string; px: Punto; pos?: Punto }

/**
 * TRATTO: pezzo rettilineo fra due punti notevoli consecutivi. Non è ancora
 * un'asta di VektorLab: le aste (i MEMBRI) nascono in `traduci`, unendo i
 * tratti allineati che nessuna sconnessione separa.
 */
export interface TrattoGrafo { id: string; i: string; j: string }

/** Sconnessione in un punto: `gruppi` sono insiemi di tratti saldati fra loro. */
export interface GiuntoGrafo {
  punto: string; tipo: 'cerniera' | 'bipendolo' | 'pattino'; gruppi: string[][];
}

export interface VincoloGrafo {
  punto: string;
  tipo: 'incastro' | 'cerniera' | 'carrello' | 'bipendolo' | 'pattino' | 'biella';
  angolo: number;
}

/** Valori come coefficienti di q, F, M: le unità le mette `traduci`. */
export type CaricoGrafo =
  | { tipo: 'distribuito'; da: string; a: string; direzione: number; coefficiente: number }
  | { tipo: 'forza'; punto: string; direzione: number; coefficiente: number }
  | { tipo: 'momento'; punto: string; verso: 1 | -1; coefficiente: number };

/** Il tratto fra `da` e `a`, misurato lungo `direzione`, vale `valore`·L. */
export interface QuotaGrafo { da: string; a: string; valore: number; direzione: 'x' | 'y' | 'asta' }

export interface Grafo {
  punti: PuntoGrafo[];
  tratti: TrattoGrafo[];
  giunti: GiuntoGrafo[];
  vincoli: VincoloGrafo[];
  carichi: CaricoGrafo[];
  quote: QuotaGrafo[];
  avvisi: Avviso[];
}

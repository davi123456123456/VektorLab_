/**
 * Stato dell'applicazione (Zustand).
 *
 * DIVISIONE — il MODELLO passa esclusivamente per i comandi (annullabile);
 * camera, selezione e stato degli strumenti sono effimeri e non entrano nella
 * cronologia. Annullare non deve riportare indietro l'inquadratura: è la
 * differenza fra un undo che aiuta e uno che disorienta.
 */

import { create, useStore as usaStore } from 'zustand';
import type { StoreApi, UseBoundStore } from 'zustand';
import { type TipoSconnessione,
  IMPOSTAZIONI_DEFAULT, type CombinationId, type ElementId, type LoadCaseId,
  type LoadId,
  type ModoRiferimento, type NodeId, type Progetto, type TipoVincolo,
  type VersoMomento,
} from '../core/model/types.js';
import type { RisultatoAnalisi, RisultatoCinematico } from '../core/model/results.js';
import type { AzioneSuNodo, ModoCerniera } from '../core/model/deduzione.js';
import { definizioneVincolo, vincoliDi } from '../core/model/catalogoVincoli.js';

/** I tipi che esistono anche in versione interna: il selettore appare solo qui. */
export const HA_VARIANTE_INTERNA = new Set<TipoVincolo>(
  ['cerniera', 'bipendolo', 'pattino']);
import {
  analizzaCinematica, analizzaStatica, espandi, migra, troncoInSezione,
  verificaStruttura, VERSIONE_FORMATO, type EsitoStatico, type Tronco,
} from '../core/index.js';
import {
  partizionePerDisegno, type SegmentoCorpo, type Topologia,
} from '../core/kinematics/topologia.js';
import {
  normalizzaModello, type EsitoNormalizzazione,
} from '../core/model/normalizza.js';
import { costruisciIndice } from '../core/model/queries.js';
import { MATERIALI } from '../core/materials/materials.js';
import { SEZIONI } from '../core/materials/sections.js';
import type { EsitoVerifiche } from '../core/checks/index.js';
import { creaPonte } from '../worker/bridge.js';
import { preferisceMenoMovimento, registro } from '../anim/registro.js';
import type { Componente } from '../render/diagrammi.js';
import { verificaIntegrita, type Anomalia } from '../core/model/integrita.js';
import type { ModoTaglio } from '../core/checks/coefficiente.js';
import {
  type Camera, cameraIniziale, inquadra, trasla, zoomVersoPuntatore, type Punto,
} from '../render/camera.js';
import { SNAP_PREDEFINITO, type OpzioniSnap, type RisultatoSnap } from '../render/snap.js';
import type { Comando } from './commands.js';
import { ruotaVincolo } from './commands.js';

export type Modalita =
  | 'modellazione' | 'vincoli' | 'carichi' | 'materiali' | 'analisi'
  | 'reazioni' | 'risultati';

export const MODALITA: { id: Modalita; nome: string; tasto: string }[] = [
  { id: 'modellazione', nome: 'Modellazione', tasto: '1' },
  { id: 'vincoli', nome: 'Vincoli', tasto: '2' },
  { id: 'carichi', nome: 'Carichi', tasto: '3' },
  { id: 'materiali', nome: 'Materiali', tasto: '4' },
  { id: 'analisi', nome: 'Analisi', tasto: '5' },
  { id: 'reazioni', nome: 'Reazioni', tasto: '6' },
  { id: 'risultati', nome: 'Risultati', tasto: '7' },
];

export type Strumento = 'seleziona' | 'nodo' | 'asta';

/**
 * Operazione modale in corso, nello stile di Blender: si avvia con un tasto,
 * segue il movimento del mouse, si può vincolare a un asse e digitare il
 * valore esatto, si conferma con click/Invio e si annulla con Esc.
 */
export type Operazione =
  | { tipo: 'nessuna' }
  | {
      tipo: 'sposta' | 'ruota' | 'scala';
      /** posizioni dei nodi al momento dell'avvio */
      inizialiNodi: Map<NodeId, Punto>;
      /** punto del mondo sotto il cursore all'avvio */
      origine: Punto;
      /** centro per rotazione e scala (baricentro della selezione) */
      centro: Punto;
      asse: 'x' | 'y' | null;
      /** valore digitato da tastiera; stringa vuota = segui il mouse */
      digitato: string;
      /** anteprima corrente */
      valore: number;
      duplica: boolean;
    }
  | {
      tipo: 'disegnaAsta';
      daNodo: NodeId | null;
      daPunto: Punto | null;
      /**
       * Direzione del segmento appena tracciato, per l'aggancio angolare
       * RELATIVO: è quella che permette una piega di 45° su un tratto già
       * inclinato di 20°, che nessun aggancio assoluto potrebbe dare.
       */
      direzionePrecedente?: number | null;
      /**
       * Punti già posati nella catena corrente, per tornare indietro di un
       * segmento con Backspace senza perdere il filo del tracciamento.
       */
      catena?: { punto: Punto; nodo: NodeId | null; direzione: number | null }[];
    }
  | { tipo: 'riquadro'; da: Punto; a: Punto };

export interface Selezione {
  nodi: ReadonlySet<NodeId>;
  aste: ReadonlySet<ElementId>;
}

const SELEZIONE_VUOTA: Selezione = { nodi: new Set(), aste: new Set() };

export function progettoVuoto(nome = 'Nuovo modello'): Progetto {
  return {
    versioneFormato: VERSIONE_FORMATO, nome,
    nodi: [], aste: [], vincoliInterni: [],
    carichi: [],
    casi: [{ id: 'principale' as never, nome: 'Caso principale', natura: 'Q' }],
    combinazioni: [],
    materialiPersonalizzati: [], sezioniPersonalizzate: [],
    impostazioni: { ...IMPOSTAZIONI_DEFAULT },
  };
}

export interface Stato {
  // ── modello (annullabile) ──
  progetto: Progetto;
  passato: Comando[];
  futuro: Comando[];

  // ── stato effimero ──
  camera: Camera;
  /** true dopo la prima misura reale della viewport */
  viewportMisurata: boolean;
  /**
   * Anomalie rilevate dall'ultimo controllo di integrità. Vuoto è il caso
   * normale; quando non lo è, l'utente deve vederle: qualcosa è stato tolto
   * dal suo modello, e correggere in silenzio gli toglierebbe l'unica
   * occasione di accorgersene.
   */
  anomalieIntegrita: Anomalia[];

  /** transizione d'inquadratura in corso, se ce n'è una */
  transizioneCamera: {
    da: Camera; a: Camera; inizio: number; durata: number;
  } | null;
  selezione: Selezione;
  modalita: Modalita;
  strumento: Strumento;
  operazione: Operazione;
  evidenziato: { tipo: 'nodo' | 'asta'; id: string } | null;
  /**
   * Aste messe in risalto da un pannello — per esempio passando sopra una voce
   * dell'elenco delle sezioni. È un'EVIDENZIAZIONE, non una selezione: non
   * tocca ciò che l'utente ha scelto, e sparisce quando il cursore se ne va.
   */
  asteEvidenziate: ReadonlySet<ElementId>;
  snap: OpzioniSnap;
  /** Ctrl tenuto premuto: inverte temporaneamente l'aggancio */
  snapInvertito: boolean;
  ultimoSnap: RisultatoSnap | null;
  /** materiale e sezione usati per le nuove aste */
  materialeCorrente: string;
  sezioneCorrente: string;
  messaggio: string | null;

  // ── modalità vincoli ──
  /** vincolo che si applica cliccando su un nodo */
  vincoloCorrente: TipoVincolo;
  /** voce del catalogo attualmente scelta (§3.0) */
  vincoloSceltoId: string;
  /** categoria mostrata dalla tavolozza (§3.3) */
  filtroVincoli: 'telaio' | 'interno';
  angoloVincolo: number;
  /**
   * Cerniera esterna o interna cliccando su un nodo. 'auto' lascia decidere
   * all'euristica di `deduciAzioneSuNodo`, mostrandone l'esito in anteprima.
   */
  modoCerniera: ModoCerniera;
  /**
   * Che cosa comparirebbe cliccando il nodo sotto il cursore. Serve a
   * mostrarlo PRIMA del clic: la differenza fra cerniera esterna e interna si
   * deve vedere quando si può ancora cambiare idea.
   */
  anteprimaVincolo: { nodoId: NodeId; azione: AzioneSuNodo } | null;
  /**
   * Che cosa si posa cliccando su un'ASTA: un vincolo esterno intermedio
   * (che non la interrompe) o una sconnessione (che la divide in due corpi).
   * Sono due concetti opposti e la scelta va fatta esplicitamente.
   */
  posaSuAsta: 'vincolo' | 'sconnessione';
  sconnessioneCorrente: TipoSconnessione;
  /**
   * Rotazione interattiva in corso: quale vincolo, da che angolo si è partiti
   * e a quale si è adesso. Vive fuori dal modello finché non si rilascia —
   * trascinare non deve riempire la cronologia di un comando per fotogramma.
   */
  rotazioneVincolo: {
    bersaglio: { tipo: 'nodo'; id: NodeId } | { tipo: 'suAsta'; id: string };
    tipoVincolo: string;
    /** centro della ghiera, in coordinate mondo */
    x: number;
    y: number;
    angoloIniziale: number;
    angolo: number;
    agganciato: boolean;
  } | null;
  /** vincolo o sconnessione su asta selezionato */
  suAstaSelezionato: string | null;
  suAstaEvidenziato: string | null;
  /** trascinamento in corso lungo l'asta: ascissa provvisoria */
  anteprimaSuAsta: { id: string; s: number } | null;

  // ── modalità carichi ──
  casoCorrente: LoadCaseId;
  /** tipo di carico che si applica cliccando */
  caricoCorrente: 'forza' | 'momento' | 'distribuito' | 'termico' | 'cedimento';
  /** valori predefiniti del carico da applicare */
  valoreForza: number;
  direzioneForza: number;
  valoreMomento: number;
  valoreDistribuito: number;
  /** direzione dei nuovi carichi distribuiti */
  modoCarico: ModoRiferimento;
  angoloCarico: number;
  perProiezione: boolean;
  /** verso dei nuovi momenti concentrati */
  versoMomento: VersoMomento;
  /** intensità al secondo estremo, per i carichi trapezoidali */
  valoreDistribuito2: number;
  trapezoidale: boolean;
  /** tratto caricato dell'asta, in ascissa relativa */
  sInizialeCarico: number;
  sFinaleCarico: number;
  caricoSelezionato: LoadId | null;
  caricoEvidenziato: LoadId | null;

  // ── conteggio sempre visibile ──
  /**
   * Riga del conteggio evidenziata dal cursore: il canvas mette in risalto gli
   * elementi che vi contribuiscono. È il modo più diretto di rispondere alla
   * domanda «questi 6 gradi di vincolo, da dove vengono?».
   */
  evidenziaConteggio: 'corpi' | 'esterni' | 'interni' | null;
  /** colora ogni corpo rigido con una tinta distinta */
  coloraCorpi: boolean;
  /** partizione in corpi riportata sulle aste d'autore, per il disegno */
  partizioneCorpi: SegmentoCorpo[];
  /** topologia del modello di calcolo, per il pannello diagnostico */
  topologia: Topologia | null;
  /** esito della normalizzazione: nodi fusi, riferimenti rotti, nodi sospesi */
  normalizzazione: EsitoNormalizzazione | null;
  /** corpo rigido evidenziato dal pannello diagnostico */
  corpoEvidenziato: number | null;

  // ── modalità analisi ──
  cinematica: RisultatoCinematico | null;
  modoMeccanismo: number;
  animaMeccanismo: boolean;

  // ── modalità reazioni ──
  /**
   * Esito statico: reazioni per equazioni cardinali, autoverifiche e diagrammi
   * ricostruiti per equilibrio. È nullo finché non si entra nella modalità.
   */
  statico: EsitoStatico | null;
  /** sconnessione interna aperta nella vista esplosa; null = tutte chiuse */
  sconnessioneEsplosa: string | null;
  /** sezione di cui si mostra il corpo libero */
  troncoScelto: { astaId: string; s: number; lato: 'monte' | 'valle' } | null;
  /**
   * Corpo libero già calcolato. Sta nello stato e non dietro una funzione
   * perché React confronta i valori per identità: un selettore che ricalcola
   * l'oggetto a ogni lettura fa credere a ogni render che qualcosa sia
   * cambiato, e il render successivo non finisce mai.
   */
  tronco: Tronco | null;
  /** valori delle reazioni scritti accanto alle frecce */
  mostraValoriReazioni: boolean;

  // ── modalità risultati ──
  risultato: RisultatoAnalisi | null;
  /** caso o combinazione di cui si mostrano i risultati */
  sorgenteRisultati:
    | { tipo: 'caso'; id: LoadCaseId }
    | { tipo: 'combinazione'; id: CombinationId };
  calcoloInCorso: boolean;
  tempoCalcolo: number;
  erroreCalcolo: string | null;
  /** diagrammi visibili contemporaneamente */
  diagrammiVisibili: Set<Componente>;
  /** moltiplicatore utente della scala automatica dei diagrammi */
  scalaDiagrammi: number;
  mostraDeformata: boolean;
  /** amplificazione della deformata; 0 = automatica */
  fattoreDeformata: number;
  /** parametro di carico λ per l'interpolazione indeformata → deformata */
  lambdaDeformata: number;
  mostraReazioni: boolean;
  mostraValoriRisultati: boolean;
  /**
   * Vincoli, carichi e reazioni restano visibili mentre si leggono i
   * diagrammi. Spegnerli lascia sul foglio soltanto le curve: serve quando si
   * confrontano due componenti sovrapposte e il modello fa rumore.
   */
  mostraModelloNeiDiagrammi: boolean;
  /** τ = T/A (media) oppure τ = T·S/(I·b) (massima) nel blocco C.S. */
  modoTaglio: ModoTaglio;
  /**
   * Cifre significative nelle tabelle dei risultati. Tre per default: un
   * momento scritto `12.4000000001` non è più preciso, è solo più difficile
   * da leggere, e nasconde le cifre che contano dietro quelle che non contano.
   */
  cifreRisultati: number;

  // ── animazioni ──
  animazioni: boolean;
  /** riproduzione ciclica della deformata */
  riproduciDeformata: boolean;
  /** risultato precedente, per la transizione morbida */
  risultatoPrecedente: RisultatoAnalisi | null;

  // ── verifiche ──
  verifiche: EsitoVerifiche | null;
  criterioPreferito: 'vonMises' | 'tresca';
  /** sezione selezionata nell'editor delle sezioni */
  sezioneInModifica: string | null;

  // ── azioni sul modello ──
  esegui: (c: Comando) => void;
  annulla: () => void;
  rifai: () => void;
  caricaProgetto: (p: Progetto) => void;

  // ── azioni effimere ──
  impostaCamera: (c: Camera) => void;
  ridimensiona: (larghezza: number, altezza: number) => void;
  panning: (dx: number, dy: number) => void;
  zoomPuntatore: (p: Punto, fattore: number) => void;
  /**
   * §8 — pannello di destra, per foglio.
   *
   * Sta nello store del foglio e non in un hook globale perché la larghezza
   * giusta dipende da che cosa c'è nel foglio: una struttura con venti aste
   * e una tabella di reazioni lunga chiede più spazio di una mensola. Aperto
   * di default: le tavolozze sono il modo normale di lavorare, e trovarle
   * chiuse al primo avvio significa doverle cercare.
   */
  pannelloDestro: { aperto: boolean; larghezza: number };
  alternaPannelloDestro: () => void;
  apriPannelloDestro: () => void;
  impostaLarghezzaPannelloDestro: (v: number) => void;

  /** Spegne il worker del foglio: si chiama alla chiusura della scheda. */
  terminaWorker: () => void;

  inquadraTutto: () => void;
  /**
   * Come `inquadraTutto`, ma percorrendo la strada invece di saltarci sopra.
   * Vedere l'inquadratura muoversi dice DOVE si era rispetto al modello; un
   * salto istantaneo costringe a ricostruirlo da capo ogni volta.
   */
  inquadraTuttoAnimato: () => void;
  /** un fotogramma della transizione in corso; la chiama il ciclo di disegno */
  avanzaTransizioneCamera: (ora: number) => void;
  seleziona: (s: Partial<Selezione>, aggiungi?: boolean) => void;
  svuotaSelezione: () => void;
  selezionaTutto: () => void;
  invertiSelezione: () => void;
  impostaModalita: (m: Modalita) => void;
  impostaStrumento: (s: Strumento) => void;
  impostaOperazione: (o: Operazione) => void;
  impostaEvidenziato: (e: Stato['evidenziato']) => void;
  evidenziaAste: (ids: readonly ElementId[]) => void;
  impostaSnap: (p: Partial<OpzioniSnap>) => void;
  impostaSnapInvertito: (v: boolean) => void;
  impostaUltimoSnap: (s: RisultatoSnap | null) => void;
  impostaMateriale: (id: string) => void;
  impostaSezione: (id: string) => void;
  messaggia: (m: string | null) => void;

  impostaVincoloCorrente: (t: TipoVincolo) => void;
  impostaAngoloVincolo: (a: number) => void;
  impostaModoCerniera: (m: ModoCerniera) => void;
  /** §3 — esterno (a telaio) oppure interno (sconnessione) */
  impostaAmbitoVincolo: (a: 'esterno' | 'interno') => void;
  /**
   * §3.3 — filtro della tavolozza: mostra i vincoli a telaio oppure gli
   * interni. Non è un attributo del vincolo scelto, è quali icone si vedono.
   * Sta nello store del foglio, quindi è ricordato per foglio di lavoro.
   */
  impostaFiltroVincoli: (f: 'telaio' | 'interno') => void;
  /** sceglie una voce del catalogo per id, tenendo coerente il resto */
  scegliVincolo: (id: string) => void;
  impostaAnteprimaVincolo: (a: Stato['anteprimaVincolo']) => void;
  impostaPosaSuAsta: (p: Stato['posaSuAsta']) => void;
  impostaSconnessioneCorrente: (t: Stato['sconnessioneCorrente']) => void;
  selezionaSuAsta: (id: string | null) => void;
  /** §4 — sconnessione nodale selezionata nell'elenco o sul canvas */
  sconnessioneNodaleSelezionata: string | null;
  selezionaSconnessioneNodale: (id: string | null) => void;
  avviaRotazioneVincolo: (r: Stato['rotazioneVincolo']) => void;
  aggiornaRotazioneVincolo: (angolo: number, agganciato: boolean) => void;
  concludiRotazioneVincolo: (conferma: boolean) => void;
  evidenziaSuAsta: (id: string | null) => void;
  impostaAnteprimaSuAsta: (a: Stato['anteprimaSuAsta']) => void;
  impostaCasoCorrente: (id: LoadCaseId) => void;
  impostaCaricoCorrente: (t: Stato['caricoCorrente']) => void;
  impostaValoriCarico: (p: Partial<Pick<Stato,
    'valoreForza' | 'direzioneForza' | 'valoreMomento' | 'valoreDistribuito'
    | 'valoreDistribuito2' | 'trapezoidale' | 'sInizialeCarico' | 'sFinaleCarico'
    | 'modoCarico' | 'angoloCarico' | 'perProiezione' | 'versoMomento'>>) => void;
  selezionaCarico: (id: LoadId | null) => void;
  evidenziaCarico: (id: LoadId | null) => void;
  aggiornaCinematica: () => void;
  ricalcolaConteggio: () => void;
  impostaEvidenziaConteggio: (r: Stato['evidenziaConteggio']) => void;
  evidenziaCorpo: (i: number | null) => void;
  alternaColoraCorpi: () => void;
  impostaModoMeccanismo: (i: number) => void;
  alternaAnimazione: () => void;

  calcolaRisultati: (sorgente?: Stato['sorgenteRisultati']) => Promise<void>;
  aggiornaStatica: () => void;
  esplodiSconnessione: (nodoId: string | null) => void;
  scegliTronco: (t: Stato['troncoScelto']) => void;
  alternaLatoTronco: () => void;
  alternaValoriReazioni: () => void;
  impostaSorgenteRisultati: (s: Stato['sorgenteRisultati']) => void;
  alternaDiagramma: (c: Componente) => void;
  impostaScalaDiagrammi: (v: number) => void;
  impostaOpzioniRisultati: (p: Partial<Pick<Stato,
    'mostraDeformata' | 'fattoreDeformata' | 'lambdaDeformata'
    | 'mostraReazioni' | 'mostraValoriRisultati'
    | 'mostraModelloNeiDiagrammi' | 'modoTaglio' | 'cifreRisultati'>>) => void;

  impostaCriterio: (c: 'vonMises' | 'tresca') => void;
  selezionaSezioneInModifica: (id: string | null) => void;
  alternaAnimazioni: () => void;
  alternaRiproduzione: () => void;
}

/**
 * Azzeramento della statica: si applica a ogni modifica del modello.
 * Reazioni, corpo libero ed esploso si riferiscono alla struttura di PRIMA;
 * lasciarli sullo schermo dopo una modifica mostrerebbe le forze di un modello
 * che non esiste più.
 */
const STATICA_AZZERATA = {
  statico: null, tronco: null, troncoScelto: null, sconnessioneEsplosa: null,
} as const;

/** Corpo libero della sezione scelta; null se non c'è o se non è calcolabile. */
function calcolaTronco(
  stato: { statico: EsitoStatico | null },
  scelto: { astaId: string; s: number; lato: 'monte' | 'valle' } | null,
): Tronco | null {
  if (!stato.statico || !scelto) return null;
  try {
    return troncoInSezione(
      stato.statico, scelto.astaId as never, scelto.s, { lato: scelto.lato },
    );
  } catch {
    return null;
  }
}

/**
 * FABBRICA DELLO STORE, non singleton.
 *
 * Ogni foglio di lavoro ha il proprio store: modello, cronologia di undo,
 * inquadratura, selezione e risultati sono suoi e di nessun altro. Due fogli
 * che condividessero anche solo la cronologia produrrebbero l'errore peggiore
 * possibile — annullare in un foglio e vedere cambiare l'altro.
 */
export function creaStore(): UseBoundStore<StoreApi<Stato>> {
  // §4.2 — un ponte, e quindi un worker, PER FOGLIO. Condividerne uno solo
  // farebbe scartare come «sorpassata» la risposta del foglio che ha chiesto
  // per primo, e quel foglio resterebbe in attesa per sempre.
  const ponte = creaPonte();
  return create<Stato>((set, get) => ({
    progetto: progettoVuoto(),
    passato: [],
    futuro: [],

    camera: cameraIniziale(),
    viewportMisurata: false,
    transizioneCamera: null,
    anomalieIntegrita: [],
    pannelloDestro: pannelloDestroIniziale(),
    selezione: SELEZIONE_VUOTA,
    modalita: 'modellazione',
    strumento: 'seleziona',
    operazione: { tipo: 'nessuna' },
    evidenziato: null,
    asteEvidenziate: new Set<ElementId>(),
    snap: { ...SNAP_PREDEFINITO },
    snapInvertito: false,
    ultimoSnap: null,
    materialeCorrente: 'S275',
    sezioneCorrente: 'IPE 300',
    messaggio: null,

    vincoloCorrente: 'cerniera',
    vincoloSceltoId: 'cerniera',
    filtroVincoli: 'telaio',
    angoloVincolo: 0,
    modoCerniera: 'esterno',
    anteprimaVincolo: null,
    posaSuAsta: 'vincolo',
    sconnessioneCorrente: 'cerniera',
    rotazioneVincolo: null,
    suAstaSelezionato: null,
    sconnessioneNodaleSelezionata: null,
    suAstaEvidenziato: null,
    anteprimaSuAsta: null,

    casoCorrente: 'principale' as LoadCaseId,
    caricoCorrente: 'forza',
    valoreForza: 10000,
    direzioneForza: -Math.PI / 2,
    valoreMomento: 10000,
    valoreDistribuito: -10000,
    valoreDistribuito2: -10000,
    trapezoidale: false,
    sInizialeCarico: 0,
    sFinaleCarico: 1,
    modoCarico: 'globaleY',
    angoloCarico: -Math.PI / 2,
    perProiezione: false,
    versoMomento: 'antiorario',

    statico: null,
    sconnessioneEsplosa: null,
    troncoScelto: null,
    tronco: null,
    mostraValoriReazioni: true,
    caricoSelezionato: null,
    caricoEvidenziato: null,

    evidenziaConteggio: null,
    coloraCorpi: false,
    partizioneCorpi: [],
    topologia: null,
    normalizzazione: null,
    corpoEvidenziato: null,
    cinematica: null,
    modoMeccanismo: 0,
    animaMeccanismo: true,

    risultato: null,
    sorgenteRisultati: { tipo: 'caso', id: 'principale' as LoadCaseId },
    calcoloInCorso: false,
    tempoCalcolo: 0,
    erroreCalcolo: null,
    diagrammiVisibili: new Set<Componente>(['M']),
    scalaDiagrammi: 1,
    mostraDeformata: true,
    fattoreDeformata: 0,
    lambdaDeformata: 1,
    mostraReazioni: true,
    mostraValoriRisultati: true,
    mostraModelloNeiDiagrammi: true,
    modoTaglio: 'media',
    cifreRisultati: 3,

    animazioni: !preferisceMenoMovimento(),
    riproduciDeformata: false,
    risultatoPrecedente: null,

    verifiche: null,
    criterioPreferito: 'vonMises',
    sezioneInModifica: null,

    esegui(c) {
      const { progetto, passato } = get();
      // §1.3c — il controllo gira DOPO ogni operazione, non solo prima
      // dell'analisi: un riferimento pendente va visto quando nasce, non
      // mezz'ora dopo quando ha già inquinato un risultato
      const esito = verificaIntegrita(c.esegui(progetto));
      set({
        anomalieIntegrita: esito.anomalie,
        progetto: esito.progetto, passato: [...passato, c], futuro: [],
        // I risultati si riferiscono al modello PRECEDENTE: tenerli visibili
        // dopo una modifica è il modo più efficace di far sbagliare una verifica.
        risultato: null, cinematica: null, verifiche: null,
        ...STATICA_AZZERATA,
      });
      get().ricalcolaConteggio();
      if (get().modalita === 'reazioni') void get().calcolaRisultati();
    },

    annulla() {
      const { progetto, passato, futuro } = get();
      const c = passato[passato.length - 1];
      if (!c) return;
      const esito = verificaIntegrita(c.annulla(progetto));
      set({
        anomalieIntegrita: esito.anomalie,
        progetto: esito.progetto,
        passato: passato.slice(0, -1),
        futuro: [c, ...futuro],
        messaggio: `annullato: ${c.etichetta}`,
        risultato: null, cinematica: null, verifiche: null,
        ...STATICA_AZZERATA,
      });
      if (get().modalita === 'reazioni') void get().calcolaRisultati();
      ripulisciSelezione(set, get);
    },

    rifai() {
      const { progetto, passato, futuro } = get();
      const c = futuro[0];
      if (!c) return;
      const esito = verificaIntegrita(c.esegui(progetto));
      set({
        anomalieIntegrita: esito.anomalie,
        progetto: esito.progetto,
        passato: [...passato, c],
        futuro: futuro.slice(1),
        messaggio: `ripetuto: ${c.etichetta}`,
        risultato: null, cinematica: null, verifiche: null,
        ...STATICA_AZZERATA,
      });
      ripulisciSelezione(set, get);
      get().ricalcolaConteggio();
      if (get().modalita === 'reazioni') void get().calcolaRisultati();
    },

    caricaProgetto(progettoDaCaricare) {
      // un file salvato con una versione precedente si converte QUI, una volta
      // sola: il resto del programma vede un solo formato
      // §4.4 — un modello che arriva da un file o da localStorage può portare
      // riferimenti pendenti: si controlla PRIMA di metterlo nello store, non
      // dopo che l'utente ci ha già lavorato sopra
      const esito = verificaIntegrita(migra(progettoDaCaricare));
      const p = esito.progetto;
      set({
        anomalieIntegrita: esito.anomalie,
        progetto: p, passato: [], futuro: [],
        selezione: SELEZIONE_VUOTA, operazione: { tipo: 'nessuna' },
        casoCorrente: p.casi[0]?.id ?? ('principale' as LoadCaseId),
        cinematica: null, caricoSelezionato: null,
        risultato: null, erroreCalcolo: null, verifiche: null,
        sezioneInModifica: null,
        ...STATICA_AZZERATA,
        sorgenteRisultati: {
          tipo: 'caso', id: p.casi[0]?.id ?? ('principale' as LoadCaseId),
        },
      });
      get().inquadraTutto();
      get().ricalcolaConteggio();
      // caricando un modello mentre si guardano le reazioni, quelle a schermo
      // sono di un'altra struttura: vanno rifatte subito, non lasciate lì
      if (get().modalita === 'reazioni') void get().calcolaRisultati();
    },

    impostaCamera: (camera) => set({ camera }),

    /**
     * Alla PRIMA misura reale della viewport si re-inquadra: il modello può
     * essere stato caricato prima che il canvas avesse dimensioni, e in quel
     * caso l'inquadratura iniziale era stata saltata.
     */
    ridimensiona(larghezza, altezza) {
      const primaVolta = !get().viewportMisurata && larghezza > 1 && altezza > 1;
      set((s) => ({
        camera: { ...s.camera, larghezza, altezza },
        viewportMisurata: s.viewportMisurata || (larghezza > 1 && altezza > 1),
      }));
      if (primaVolta && get().progetto.nodi.length > 0) get().inquadraTutto();
    },
    panning: (dx, dy) => set((s) => ({ camera: trasla(s.camera, dx, dy) })),
    zoomPuntatore: (p, f) => set((s) => ({ camera: zoomVersoPuntatore(s.camera, p, f) })),

    /**
     * §2 — inquadratura animata.
     *
     * Lo zoom si interpola in scala LOGARITMICA: da ×10 a ×1000 il punto di
     * mezzo percepito è ×100, non ×505. Interpolando linearmente la prima
     * metà dell'animazione sembrerebbe ferma e la seconda una caduta.
     */
    inquadraTuttoAnimato() {
      const { camera, animazioni } = get();
      const bersaglio = inquadraturaCompleta(get());
      if (!bersaglio) return;
      const fermo = Math.abs(Math.log(bersaglio.zoom / camera.zoom)) < 1e-3
        && Math.hypot(bersaglio.cx - camera.cx, bersaglio.cy - camera.cy)
           < 1e-3 / camera.zoom;
      if (fermo) return;
      if (!animazioni) { set({ camera: bersaglio, transizioneCamera: null }); return; }
      set({
        transizioneCamera: {
          da: camera, a: bersaglio, inizio: performance.now(), durata: 300,
        },
      });
    },

    avanzaTransizioneCamera(ora) {
      const t = get().transizioneCamera;
      if (!t) return;
      const u = Math.min(1, (ora - t.inizio) / t.durata);
      // accelera e decelera: partire e fermarsi di colpo si legge come uno
      // scatto, non come uno spostamento
      const e = u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2;
      const camera: Camera = {
        ...get().camera,
        zoom: t.da.zoom * (t.a.zoom / t.da.zoom) ** e,
        cx: t.da.cx + (t.a.cx - t.da.cx) * e,
        cy: t.da.cy + (t.a.cy - t.da.cy) * e,
      };
      set(u >= 1
        ? { camera: { ...camera, ...t.a, larghezza: camera.larghezza, altezza: camera.altezza },
            transizioneCamera: null }
        : { camera });
    },

    alternaPannelloDestro() {
      const p = { ...get().pannelloDestro, aperto: !get().pannelloDestro.aperto };
      set({ pannelloDestro: p });
      ricordaPannelloDestro(p);
    },

    apriPannelloDestro() {
      if (get().pannelloDestro.aperto) return;
      const p = { ...get().pannelloDestro, aperto: true };
      set({ pannelloDestro: p });
      ricordaPannelloDestro(p);
    },

    impostaLarghezzaPannelloDestro(v) {
      const p = {
        ...get().pannelloDestro,
        larghezza: Math.min(480, Math.max(220, Math.round(v))),
      };
      set({ pannelloDestro: p });
      ricordaPannelloDestro(p);
    },

    terminaWorker() { ponte.termina(); },

    inquadraTutto() {
      const { progetto, camera } = get();
      if (progetto.nodi.length === 0) {
        set({ camera: { ...cameraIniziale(camera.larghezza, camera.altezza) } });
        return;
      }
      // stessa inquadratura della versione animata, e per forza: due margini
      // diversi vorrebbero dire che «inquadra tutto» dà due risultati a
      // seconda di come lo si è chiesto
      const bersaglio = inquadraturaCompleta(get());
      if (bersaglio) set({ camera: bersaglio, transizioneCamera: null });
    },

    seleziona(s, aggiungi = false) {
      set((st) => ({
        selezione: {
          nodi: aggiungi
            ? new Set([...st.selezione.nodi, ...(s.nodi ?? [])])
            : new Set(s.nodi ?? []),
          aste: aggiungi
            ? new Set([...st.selezione.aste, ...(s.aste ?? [])])
            : new Set(s.aste ?? []),
        },
      }));
    },

    svuotaSelezione: () => set({ selezione: SELEZIONE_VUOTA }),

    selezionaTutto() {
      const { progetto } = get();
      set({
        selezione: {
          nodi: new Set(progetto.nodi.map((n) => n.id)),
          aste: new Set(progetto.aste.map((a) => a.id)),
        },
      });
    },

    invertiSelezione() {
      const { progetto, selezione } = get();
      set({
        selezione: {
          nodi: new Set(progetto.nodi.filter((n) => !selezione.nodi.has(n.id)).map((n) => n.id)),
          aste: new Set(progetto.aste.filter((a) => !selezione.aste.has(a.id)).map((a) => a.id)),
        },
      });
    },

    impostaModalita(modalita) {
      set({ modalita, operazione: { tipo: 'nessuna' } });
      // entrando in Analisi la diagnosi si aggiorna da sé: chiedere all'utente
      // di premere "calcola" per vedere qualcosa sarebbe un passaggio a vuoto
      if (modalita === 'analisi') get().aggiornaCinematica();
      if (modalita === 'reazioni') {
        set({ sconnessioneEsplosa: null, troncoScelto: null });
        if (get().risultato) get().aggiornaStatica();
        else void get().calcolaRisultati();
      }
      if ((modalita === 'risultati' || modalita === 'materiali') && !get().risultato) {
        void get().calcolaRisultati();
      }
    },
    impostaStrumento: (strumento) => set({ strumento, operazione: { tipo: 'nessuna' } }),
    impostaOperazione: (operazione) => set({ operazione }),
    impostaEvidenziato: (evidenziato) => set({ evidenziato }),
    evidenziaAste: (ids) => set({ asteEvidenziate: new Set(ids) }),
    impostaSnap: (p) => set((s) => ({ snap: { ...s.snap, ...p } })),
    impostaSnapInvertito: (snapInvertito) => set({ snapInvertito }),
    impostaUltimoSnap: (ultimoSnap) => set({ ultimoSnap }),
    impostaMateriale: (materialeCorrente) => set({ materialeCorrente }),
    impostaSezione: (sezioneCorrente) => set({ sezioneCorrente }),
    messaggia: (messaggio) => set({ messaggio }),

    /**
     * §3 — scegliere il TIPO è il primo livello; l'ambito esterno/interno è il
     * secondo. Cambiando tipo l'ambito va tenuto coerente: un carrello non ha
     * variante interna, e lasciare «interno» selezionato da un giro
     * precedente produrrebbe un clic che non fa quello che il pannello dice.
     */
    impostaVincoloCorrente(vincoloCorrente) {
      const haInterno = HA_VARIANTE_INTERNA.has(vincoloCorrente);
      set({
        vincoloCorrente,
        ...(haInterno
          ? { sconnessioneCorrente: vincoloCorrente as Stato['sconnessioneCorrente'] }
          : { modoCerniera: 'esterno', posaSuAsta: 'vincolo' }),
        anteprimaVincolo: null,
      });
    },

    /**
     * L'ambito governa insieme il clic sul NODO e il clic sull'ASTA: sono la
     * stessa scelta espressa in due punti, e tenerle separate era il motivo
     * per cui la tavolozza mostrava voci che sembravano duplicate.
     */
    impostaFiltroVincoli(filtro) {
      set({ filtroVincoli: filtro, anteprimaVincolo: null });
      // la scelta corrente può appartenere all'altra categoria: si passa alla
      // prima voce di quella mostrata, altrimenti la tavolozza resterebbe
      // senza nessuna icona accesa
      const scelto = definizioneVincolo(get().vincoloSceltoId);
      if (!scelto || scelto.categoria !== filtro) {
        const prima = vincoliDi(filtro)[0];
        if (prima) get().scegliVincolo(prima.id);
      }
    },

    /**
     * Traduce la voce di catalogo nello stato che il resto del programma
     * legge già. Il catalogo è la fonte di verità della TAVOLOZZA; il modello
     * continua a parlare di tipi di vincolo e di sconnessioni.
     */
    scegliVincolo(id) {
      const d = definizioneVincolo(id);
      if (!d) return;
      if (d.categoria === 'telaio' && d.icona.genere === 'telaio') {
        set({
          vincoloSceltoId: id,
          vincoloCorrente: d.icona.tipo,
          modoCerniera: 'esterno',
          posaSuAsta: 'vincolo',
          anteprimaVincolo: null,
        });
        return;
      }
      if (d.icona.genere === 'sconnessione') {
        set({
          vincoloSceltoId: id,
          vincoloCorrente: d.icona.tipo as TipoVincolo,
          sconnessioneCorrente: d.icona.tipo,
          modoCerniera: 'interno',
          posaSuAsta: 'sconnessione',
          anteprimaVincolo: null,
        });
        return;
      }
      // cernieraSconnessa: appoggio a terra E sconnessione. Lo stato è quello
      // della sconnessione interna — il clic passa da lì — più l'angolo, che
      // qui serve perché il simbolo a terra c'è e va orientato.
      set({
        vincoloSceltoId: id,
        vincoloCorrente: 'cerniera',
        sconnessioneCorrente: 'cerniera',
        modoCerniera: 'interno',
        posaSuAsta: 'sconnessione',
        anteprimaVincolo: null,
      });
    },

    impostaAmbitoVincolo(ambito) {
      set({
        modoCerniera: ambito,
        posaSuAsta: ambito === 'interno' ? 'sconnessione' : 'vincolo',
        anteprimaVincolo: null,
      });
    },

    impostaAngoloVincolo: (angoloVincolo) => set({ angoloVincolo }),
    impostaModoCerniera: (modoCerniera) => set({ modoCerniera, anteprimaVincolo: null }),
    impostaAnteprimaVincolo: (anteprimaVincolo) => set({ anteprimaVincolo }),
    impostaPosaSuAsta: (posaSuAsta) => set({ posaSuAsta }),
    impostaSconnessioneCorrente: (sconnessioneCorrente) => set({ sconnessioneCorrente }),
    selezionaSuAsta: (suAstaSelezionato) => set({
      suAstaSelezionato, sconnessioneNodaleSelezionata: null,
    }),
    selezionaSconnessioneNodale: (sconnessioneNodaleSelezionata) => set({
      sconnessioneNodaleSelezionata, suAstaSelezionato: null,
    }),

    avviaRotazioneVincolo: (rotazioneVincolo) => set({ rotazioneVincolo }),
    aggiornaRotazioneVincolo(angolo, agganciato) {
      const r = get().rotazioneVincolo;
      if (!r) return;
      set({ rotazioneVincolo: { ...r, angolo, agganciato } });
    },
    concludiRotazioneVincolo(conferma) {
      const r = get().rotazioneVincolo;
      set({ rotazioneVincolo: null });
      if (!r || !conferma) return;
      if (Math.abs(r.angolo - r.angoloIniziale) < 1e-9) return;
      get().esegui(ruotaVincolo(r.bersaglio, r.angolo, r.tipoVincolo));
      // i risultati già calcolati si riferiscono all'orientamento di prima
      if (get().risultato) void get().calcolaRisultati();
    },
    evidenziaSuAsta: (suAstaEvidenziato) => set({ suAstaEvidenziato }),
    impostaAnteprimaSuAsta: (anteprimaSuAsta) => set({ anteprimaSuAsta }),
    impostaCasoCorrente: (casoCorrente) => set({ casoCorrente, caricoSelezionato: null }),
    impostaCaricoCorrente: (caricoCorrente) => set({ caricoCorrente }),
    impostaValoriCarico: (p) => set(p),
    selezionaCarico: (caricoSelezionato) => set({ caricoSelezionato }),
    evidenziaCarico: (caricoEvidenziato) => set({ caricoEvidenziato }),

    /**
     * L'analisi cinematica è pura e veloce (SVD di una matrice piccola), quindi
     * si ricalcola su richiesta invece di tenerla sincronizzata a ogni modifica:
     * meno stato da invalidare, nessun rischio di mostrare una diagnosi vecchia.
     */
    /**
     * Conteggio silenzioso: ricalcola la cinematica senza toccare messaggi né
     * selezione del meccanismo. Serve al pannello sempre visibile, che deve
     * aggiornarsi a ogni modifica senza dire nulla.
     */
    ricalcolaConteggio() {
      const { progetto } = get();
      if (progetto.aste.length === 0) {
        set({
          cinematica: null, partizioneCorpi: [], topologia: null,
          normalizzazione: null,
        });
        return;
      }
      // su modelli molto grandi la SVD costa: il conteggio continuo si spegne e
      // resta il calcolo su richiesta della modalità Analisi
      if (progetto.aste.length > 300) return;
      try {
        const normalizzazione = normalizzaModello(migra(progetto));
        const espansione = espandi(normalizzazione.progetto);
        const idx = costruisciIndice(
          espansione.progetto,
          [...MATERIALI, ...progetto.materialiPersonalizzati],
          [...SEZIONI, ...progetto.sezioniPersonalizzate],
        );
        const p = partizionePerDisegno(espansione, idx);
        set({
          cinematica: analizzaCinematica(progetto),
          partizioneCorpi: p.segmenti,
          topologia: p.topologia,
          normalizzazione,
        });
      } catch {
        set({
          cinematica: null, partizioneCorpi: [], topologia: null,
          normalizzazione: null,
        });
      }
    },

    aggiornaCinematica() {
      const { progetto } = get();
      if (progetto.aste.length === 0) {
        set({ cinematica: null, messaggio: 'Nessuna asta da analizzare.' });
        return;
      }
      try {
        const c = analizzaCinematica(progetto);
        set({
          cinematica: c,
          modoMeccanismo: 0,
          messaggio: `struttura ${c.classificazione}`,
        });
      } catch (e) {
        set({ cinematica: null, messaggio: `analisi non riuscita: ${(e as Error).message}` });
      }
    },

    impostaEvidenziaConteggio: (evidenziaConteggio) => set({ evidenziaConteggio }),
    evidenziaCorpo: (corpoEvidenziato) => set({ corpoEvidenziato }),
    alternaColoraCorpi: () => set((s) => ({ coloraCorpi: !s.coloraCorpi })),
    impostaModoMeccanismo: (modoMeccanismo) => set({ modoMeccanismo }),
    alternaAnimazione: () => set((s) => ({ animaMeccanismo: !s.animaMeccanismo })),

    /**
     * Il calcolo passa dal worker e può essere sorpassato da una richiesta più
     * recente (il ponte restituisce `null` in quel caso). Nel frattempo lo stato
     * conserva l'ULTIMO RISULTATO VALIDO: l'interfaccia continua a mostrare
     * qualcosa di sensato invece di svuotarsi a ogni modifica.
     */
    async calcolaRisultati(sorgente) {
      const st = get();
      const s = sorgente ?? st.sorgenteRisultati;
      if (st.progetto.aste.length === 0) {
        set({ risultato: null, erroreCalcolo: 'Il modello non contiene aste.' });
        return;
      }
      set({ calcoloInCorso: true, erroreCalcolo: null, sorgenteRisultati: s });
      try {
        const esito = await ponte.analizza(get().progetto, s);
        if (!esito) return;          // sorpassata: arriverà la risposta più recente
        // le verifiche discendono dai risultati e costano poco: calcolarle
        // insieme evita uno stato in cui i due sono disallineati
        const p = get().progetto;
        const verifiche = verificaStruttura(p, esito.risultato, {
          criterioPreferito: get().criterioPreferito,
          sezioniExtra: p.sezioniPersonalizzate,
          materialiExtra: p.materialiPersonalizzati,
        });
        // il risultato precedente serve alla transizione: vedere il diagramma
        // MUOVERSI dice se il momento è cresciuto e dove, cosa che uno scatto
        // nasconde
        set({
          risultatoPrecedente: get().risultato,
          risultato: esito.risultato,
          verifiche,
          tempoCalcolo: esito.ms,
          calcoloInCorso: false,
          messaggio: `calcolo completato in ${esito.ms.toFixed(1)} ms`,
        });
        if (get().modalita === 'reazioni') get().aggiornaStatica();
      } catch (e) {
        set({
          calcoloInCorso: false,
          erroreCalcolo: (e as Error).message,
          messaggio: `calcolo non riuscito: ${(e as Error).message}`,
        });
      }
    },

    /**
     * Statica per equilibrio. Riusa il risultato FEM già calcolato dal worker:
     * la parte cara dell'analisi è la fattorizzazione, e rifarla solo per avere
     * un termine di confronto sarebbe uno spreco. Ciò che resta — equazioni
     * cardinali su una matrice piccola, elementino, autoverifiche — è
     * abbastanza leggero da stare nel thread dell'interfaccia.
     */
    aggiornaStatica() {
      const { progetto, risultato, sorgenteRisultati } = get();
      if (!risultato || progetto.aste.length === 0) { set({ statico: null }); return; }
      try {
        const statico = analizzaStatica(progetto, sorgenteRisultati, {
          sezioniExtra: progetto.sezioniPersonalizzate,
          materialiExtra: progetto.materialiPersonalizzati,
        }, risultato);
        set({ statico, tronco: calcolaTronco({ ...get(), statico }, get().troncoScelto) });
      } catch (e) {
        set({ statico: null, messaggio: `statica non riuscita: ${(e as Error).message}` });
      }
    },

    esplodiSconnessione(sconnessioneEsplosa) {
      set({ sconnessioneEsplosa, troncoScelto: null, tronco: null });
    },

    scegliTronco(troncoScelto) {
      set({ troncoScelto, sconnessioneEsplosa: null, tronco: calcolaTronco(get(), troncoScelto) });
    },

    alternaLatoTronco() {
      const t = get().troncoScelto;
      if (!t) return;
      const scelto = { ...t, lato: t.lato === 'monte' ? 'valle' as const : 'monte' as const };
      set({ troncoScelto: scelto, tronco: calcolaTronco(get(), scelto) });
    },

    alternaValoriReazioni() {
      set((s) => ({ mostraValoriReazioni: !s.mostraValoriReazioni }));
    },

    impostaSorgenteRisultati(sorgenteRisultati) {
      set({ sorgenteRisultati });
      void get().calcolaRisultati(sorgenteRisultati);
    },

    alternaDiagramma(c) {
      set((s) => {
        const v = new Set(s.diagrammiVisibili);
        if (v.has(c)) v.delete(c); else v.add(c);
        return { diagrammiVisibili: v };
      });
    },

    impostaScalaDiagrammi: (scalaDiagrammi) => set({ scalaDiagrammi }),
    impostaOpzioniRisultati: (p) => set(p),

    impostaCriterio(criterioPreferito) {
      set({ criterioPreferito });
      // il criterio cambia il risultato della verifica, non del calcolo:
      // basta rifare le verifiche sui risultati già disponibili
      const { progetto, risultato } = get();
      if (risultato) {
        set({
          verifiche: verificaStruttura(progetto, risultato, {
            criterioPreferito,
            sezioniExtra: progetto.sezioniPersonalizzate,
            materialiExtra: progetto.materialiPersonalizzati,
          }),
        });
      }
    },

    selezionaSezioneInModifica: (sezioneInModifica) => set({ sezioneInModifica }),

    alternaAnimazioni() {
      const attive = !get().animazioni;
      set({ animazioni: attive, riproduciDeformata: attive && get().riproduciDeformata });
      registro.imposta(attive);
    },

    alternaRiproduzione: () => set((s) => ({ riproduciDeformata: !s.riproduciDeformata })),
  }));
}

/**
 * L'ultima misura scelta fa da predefinita per i fogli successivi: la
 * larghezza è per foglio, ma chi ne apre uno nuovo si aspetta di ritrovare
 * l'abitudine, non il valore di fabbrica.
 *
 * localStorage è protetto: in navigazione privata alcuni browser lanciano
 * un'eccezione alla sola lettura, e una schermata bianca per una preferenza
 * di larghezza sarebbe un pessimo scambio.
 */
const CHIAVE_PANNELLO = 'vektorlab.proprieta';

/**
 * L'ultima misura scelta, in memoria. È questa a fare da predefinita per i
 * fogli nuovi: localStorage serve solo a farla sopravvivere alla chiusura
 * della finestra, e dove non è disponibile — navigazione privata, test — la
 * preferenza deve comunque valere dentro la sessione.
 */
let ultimoPannello = { aperto: true, larghezza: 288 };

function pannelloDestroIniziale(): { aperto: boolean; larghezza: number } {
  return { ...ultimoPannello };
}

function ricordaPannelloDestro(p: { aperto: boolean; larghezza: number }): void {
  ultimoPannello = { ...p };
  try {
    globalThis.localStorage?.setItem(CHIAVE_PANNELLO, JSON.stringify(p));
  } catch {
    // preferenza non memorizzabile: l'applicazione funziona uguale
  }
}

/** Legge la preferenza salvata all'avvio, una volta sola. */
function ripristinaPannelloDestro(): void {
  try {
    const g = globalThis.localStorage?.getItem(CHIAVE_PANNELLO);
    if (!g) return;
    const v = JSON.parse(g) as Partial<typeof ultimoPannello>;
    ultimoPannello = {
      // l'apertura NON si eredita fra fogli, ma fra sessioni sì: chi ha
      // chiuso il pannello e riapre l'applicazione lo ritrova chiuso
      aperto: typeof v.aperto === 'boolean' ? v.aperto : true,
      larghezza: typeof v.larghezza === 'number'
        ? Math.min(480, Math.max(220, v.larghezza)) : 288,
    };
  } catch {
    // preferenza illeggibile: si parte dai valori di fabbrica
  }
}

ripristinaPannelloDestro();

/**
 * Inquadratura che contiene tutto il modello, con il 10% di margine.
 * Null quando non c'è niente da inquadrare o la viewport non è ancora
 * misurata: in quei casi muovere la camera peggiorerebbe soltanto.
 */
function inquadraturaCompleta(st: Stato): Camera | null {
  const { progetto, camera } = st;
  if (progetto.nodi.length === 0) return null;
  if (camera.larghezza <= 1 || camera.altezza <= 1) return null;
  const xs = progetto.nodi.map((n) => n.x);
  const ys = progetto.nodi.map((n) => n.y);
  return inquadra(
    camera, Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys), 0.1,
  );
}

// ── foglio attivo ─────────────────────────────────────────────────────

let _attivo: UseBoundStore<StoreApi<Stato>> | null = null;

/** Lo store del foglio in primo piano; il primo accesso lo crea. */
export function storeAttivo(): UseBoundStore<StoreApi<Stato>> {
  return (_attivo ??= creaStore());
}

/**
 * Cambia il foglio in primo piano.
 *
 * Chi chiama DEVE rimontare l'albero React che legge lo store — in pratica
 * una `key` sull'area di lavoro. Senza rimontaggio i componenti resterebbero
 * abbonati allo store precedente: leggerebbero il vecchio foglio pur
 * mostrando il nome del nuovo, che è il modo più insidioso di sbagliare.
 */
export function impostaStoreAttivo(s: UseBoundStore<StoreApi<Stato>>): void {
  _attivo = s;
}

/**
 * L'hook di sempre, che però punta al foglio attivo invece che a un
 * singleton. La firma non cambia: nessuno dei componenti sa che esistono
 * più fogli, ed è giusto così — un foglio per volta è tutto il contesto che
 * serve a un pannello.
 */
export const useStore = (<T,>(
  selettore?: (s: Stato) => T,
) => usaStore(storeAttivo(), selettore as (s: Stato) => T)
) as UseBoundStore<StoreApi<Stato>>;

useStore.getState = () => storeAttivo().getState();
useStore.getInitialState = () => storeAttivo().getInitialState();
useStore.setState = ((partial: never, replace?: never) =>
  storeAttivo().setState(partial, replace)) as StoreApi<Stato>['setState'];
useStore.subscribe = ((ascoltatore: never) =>
  storeAttivo().subscribe(ascoltatore)) as StoreApi<Stato>['subscribe'];

// In sviluppo lo store è raggiungibile dalla console del browser: serve per
// ispezionare lo stato e per i test di interazione automatici. In produzione
// il blocco viene eliminato dal tree-shaking.
if (import.meta.env?.DEV) {
  (globalThis as Record<string, unknown>).vektorlab = { useStore, registro };
}

/** Dopo undo/redo la selezione può puntare a oggetti non più esistenti. */
function ripulisciSelezione(
  set: (partial: Partial<Stato>) => void,
  get: () => Stato,
): void {
  const { progetto, selezione } = get();
  const nodi = new Set(progetto.nodi.map((n) => n.id as string));
  const aste = new Set(progetto.aste.map((a) => a.id as string));
  set({
    selezione: {
      nodi: new Set([...selezione.nodi].filter((id) => nodi.has(id as string))),
      aste: new Set([...selezione.aste].filter((id) => aste.has(id as string))),
    },
  });
}

// ── selettori derivati ────────────────────────────────────────────────

export const contaSelezione = (s: Selezione): number => s.nodi.size + s.aste.size;

export function baricentroSelezione(p: Progetto, s: Selezione): Punto {
  const ids = nodiCoinvolti(p, s);
  if (ids.size === 0) return { x: 0, y: 0 };
  let sx = 0, sy = 0;
  for (const n of p.nodi) if (ids.has(n.id)) { sx += n.x; sy += n.y; }
  return { x: sx / ids.size, y: sy / ids.size };
}

/**
 * Nodi effettivamente mossi da una trasformazione: quelli selezionati più
 * gli estremi delle aste selezionate. Selezionare un'asta e premere G deve
 * spostare l'asta, non lasciarla ferma perché "i nodi non erano selezionati".
 */
export function nodiCoinvolti(p: Progetto, s: Selezione): Set<NodeId> {
  const out = new Set<NodeId>(s.nodi);
  for (const a of p.aste) {
    if (s.aste.has(a.id)) { out.add(a.nodoIniziale); out.add(a.nodoFinale); }
  }
  return out;
}

/**
 * API pubblica del nucleo di calcolo.
 *
 * REGOLA ARCHITETTURALE: questo modulo e tutto ciò che sta sotto `core/` non
 * importano nulla da `ui/`, `render/`, React o DOM. Un'analisi completa deve
 * poter girare da riga di comando con un JSON in ingresso — vedi `cli/analyze.ts`.
 */

import { assembla } from './fem/assemble.js';
import { risolvi } from './fem/solve.js';
import { costruisciIndice } from './model/queries.js';
import { espandi } from './model/espansione.js';
import { migra } from './model/migrazione.js';
import { verificaIntegrita } from './model/integrita.js';
import { normalizzaModello } from './model/normalizza.js';
import { MATERIALI } from './materials/materials.js';
import { SEZIONI } from './materials/sections.js';
import type {
  Carico, CombinationId, LoadCaseId, Materiale, Progetto, Sezione,
} from './model/types.js';
import type { RisultatoAnalisi, RisultatoCinematico } from './model/results.js';
import { analisiCinematica } from './kinematics/analyze.js';
import {
  calcolaReazioni, proiettaSuRighe,
  type ComponenteReazione, type EsitoReazioni,
} from './statica/reazioni.js';
import { eseguiAutoverifiche, type EsitoAutoverifiche } from './statica/autoverifiche.js';
import {
  diagrammiPerEquilibrio, preparaTronco, valutaTronco,
  reazioniDaEquilibrio, reazioniDaFem,
  type DiagrammaEquilibrio, type ReazioneEsterna, type SorgenteReazioni,
  type Tronco,
} from './statica/elementino.js';
import type { Espansione } from './model/espansione.js';
import type { IndiceModello } from './model/queries.js';
import type { ElementId } from './model/types.js';

export interface OpzioniAnalisi {
  materialiExtra?: Materiale[];
  sezioniExtra?: Sezione[];
}

export interface EsitoCompleto {
  cinematica: RisultatoCinematico;
  perCaso: Map<LoadCaseId, RisultatoAnalisi>;
  perCombinazione: Map<CombinationId, RisultatoAnalisi>;
  avvisi: string[];
}

/**
 * Analisi cinematica: livello DIAGNOSTICO ed EDUCATIVO, indipendente dal
 * calcolo delle sollecitazioni. Il metodo degli spostamenti risolve isostatiche
 * e iperstatiche senza distinguerle, ma sapere se e perché una struttura è
 * labile è ciò che permette di capire un risultato invece di subirlo.
 */
/**
 * Modello pronto per il calcolo: formato aggiornato e grafo normalizzato.
 *
 * La normalizzazione viene PRIMA di tutto perché l'analisi lavora sugli id, e
 * un grafo con nodi coincidenti non fusi darebbe corpi rigidi separati dove la
 * struttura è continua. Nessun passo successivo guarda più le coordinate per
 * dedurre collegamenti.
 */
export function preparaPerAnalisi(p: Progetto): Progetto {
  // §1.3c — l'integrità si controlla PRIMA di ogni analisi, non solo durante
  // l'editing: un modello può arrivare qui da un file, da localStorage o dalla
  // riga di comando, senza essere mai passato dallo store.
  return normalizzaModello(verificaIntegrita(migra(p)).progetto).progetto;
}

export function analizzaCinematica(
  p: Progetto, opzioni: OpzioniAnalisi = {},
): RisultatoCinematico {
  const calcolo = espandi(preparaPerAnalisi(p)).progetto;
  const idx = costruisciIndice(
    calcolo,
    [...MATERIALI, ...(opzioni.materialiExtra ?? [])],
    [...SEZIONI, ...(opzioni.sezioniExtra ?? [])],
  );
  return analisiCinematica(calcolo, idx, calcolo.impostazioni.tolleranzaRango);
}

/** Analizza un singolo insieme di carichi già scalati. */
function analizzaCarichi(
  p: Progetto,
  carichi: Carico[],
  sorgente: RisultatoAnalisi['sorgente'],
  opzioni: OpzioniAnalisi,
): { risultato: RisultatoAnalisi; avvisi: string[] } {
  // Il solutore lavora sul modello ESPANSO: vincoli e sconnessioni posti lungo
  // un'asta diventano nodi e suddivisioni. Il modello d'autore resta intatto.
  const espansione = espandi(preparaPerAnalisi({ ...p, carichi }));
  const calcolo = espansione.progetto;

  const idx = costruisciIndice(
    calcolo,
    [...MATERIALI, ...(opzioni.materialiExtra ?? [])],
    [...SEZIONI, ...(opzioni.sezioniExtra ?? [])],
  );
  const sistema = assembla(calcolo, idx, calcolo.carichi, {
    includiPesoProprio: calcolo.impostazioni.includiPesoProprio,
  });
  const esito = risolvi(sistema, calcolo, calcolo.impostazioni.campioniPerAsta);
  return {
    risultato: { sorgente, ...esito },
    avvisi: sistema.avvisi,
  };
}

export function analizzaCaso(
  p: Progetto, casoId: LoadCaseId, opzioni: OpzioniAnalisi = {},
): RisultatoAnalisi {
  const carichi = p.carichi.filter((c) => c.casoId === casoId);
  return analizzaCarichi(p, carichi, { tipo: 'caso', id: casoId }, opzioni).risultato;
}

/**
 * Combinazione: essendo l'analisi lineare, i carichi dei casi componenti
 * vengono scalati e sommati prima della risoluzione. Superporre i RISULTATI
 * darebbe lo stesso esito per spostamenti e sollecitazioni, ma NON per le
 * verifiche (von Mises, instabilità), che sono non lineari nei risultati e
 * vanno sempre valutate sulla combinazione. Risolvere sui carichi combinati
 * evita di introdurre quella trappola nel resto del codice.
 */
export function analizzaCombinazione(
  p: Progetto, combinazioneId: CombinationId, opzioni: OpzioniAnalisi = {},
): RisultatoAnalisi {
  const comb = p.combinazioni.find((c) => c.id === combinazioneId);
  if (!comb) throw new Error(`Combinazione '${combinazioneId}' non trovata.`);

  const carichi: Carico[] = [];
  for (const t of comb.termini) {
    for (const c of p.carichi) {
      if (c.casoId !== t.casoId) continue;
      carichi.push(scala(c, t.coefficiente));
    }
  }
  return analizzaCarichi(p, carichi, { tipo: 'combinazione', id: combinazioneId }, opzioni).risultato;
}

function scala(c: Carico, k: number): Carico {
  switch (c.tipo) {
    case 'forzaNodale': return { ...c, fx: (c.fx * k) as never, fy: (c.fy * k) as never };
    case 'momentoNodale': return { ...c, mz: (c.mz * k) as never };
    case 'distribuito': return {
      ...c, q1: (c.q1 * k) as never, q2: (c.q2 * k) as never,
    };
    case 'forzaInCampata': return { ...c, fx: (c.fx * k) as never, fy: (c.fy * k) as never };
    case 'momentoInCampata': return { ...c, mz: (c.mz * k) as never };
    case 'termico': return {
      ...c,
      deltaTUniforme: (c.deltaTUniforme * k) as never,
      deltaTGradiente: (c.deltaTGradiente * k) as never,
    };
    case 'cedimento': return {
      ...c, ux: (c.ux * k) as never, uy: (c.uy * k) as never, rz: (c.rz * k) as never,
    };
  }
}

/** Analizza tutti i casi e tutte le combinazioni del progetto. */
export function analizza(p: Progetto, opzioni: OpzioniAnalisi = {}): EsitoCompleto {
  const perCaso = new Map<LoadCaseId, RisultatoAnalisi>();
  const perCombinazione = new Map<CombinationId, RisultatoAnalisi>();
  const avvisi = new Set<string>();

  for (const caso of p.casi) {
    const carichi = p.carichi.filter((c) => c.casoId === caso.id);
    const r = analizzaCarichi(p, carichi, { tipo: 'caso', id: caso.id }, opzioni);
    perCaso.set(caso.id, r.risultato);
    r.avvisi.forEach((a) => avvisi.add(a));
  }
  for (const comb of p.combinazioni) {
    perCombinazione.set(comb.id, analizzaCombinazione(p, comb.id, opzioni));
  }
  return {
    cinematica: analizzaCinematica(p, opzioni),
    perCaso, perCombinazione, avvisi: [...avvisi],
  };
}

// ── riesportazioni comode ──────────────────────────────────────────────
export * from './model/types.js';
export type * from './model/results.js';
export { progetto, CostruttoreProgetto } from './builder.js';
export { espandi, type Espansione, type TrattoDiAsta } from './model/espansione.js';
export { migra, VERSIONE_FORMATO } from './model/migrazione.js';
export {
  normalizzaModello, nodiAppoggiatiSuAsta, dimensioneCaratteristica,
  type EsitoNormalizzazione, type NodoSospetto,
} from './model/normalizza.js';
export {
  componentiLocali, componentiGlobali, versoreGlobale, fattoreProiezione,
  risultanteDistribuito, MODI_RIFERIMENTO,
  type AssiAsta, type Risultante,
} from './model/direzioni.js';
export { MATERIALI, materialePerId } from './materials/materials.js';
export {
  SEZIONI, sezionePerId, rettangolare, circolare, tuboCircolare,
  tuboRettangolare, doppioT, sezioneGenerica, IPE, HEA, HEB, UPN,
} from './materials/sections.js';
export {
  FAMIGLIE, PRESET, preset, parametriPredefiniti, proprietaDa, larghezzaA,
  momentoStaticoA, quoteNotevoli, estremiY, sezioneDaParametri, nomePredefinito,
  contornoSezione, contornoInterno, pesoAlMetro,
  type ParametriSezione, type FamigliaParametrica, type ProprietaSezione,
  type Preset, type DescrizioneFamiglia,
} from './materials/sezioniParametriche.js';
export {
  verificaStruttura, verificaAsta, distribuzioneTensioni, vonMises, tresca,
  principali, NOME_CRITERIO, indiceMomentoMassimo,
  type EsitoVerifiche, type EsitoVerifica, type PuntoTensione,
  type DistribuzioneTensioni, type Criterio,
} from './checks/index.js';


// ══════════════════════ STATICA PER EQUILIBRIO ══════════════════════

/**
 * Diagrammi ricostruiti dalle reazioni con il metodo dell'elementino.
 *
 * Per una struttura isostatica le reazioni vengono dalle equazioni cardinali e
 * il risultato è indipendente dal FEM: due strade separate che devono portare
 * agli stessi diagrammi. Per una iperstatica le reazioni possono venire solo
 * dal FEM, ma il passaggio reazioni → N,T,M resta di puro equilibrio ed è
 * comunque quello che si mostra all'utente quando chiede «perché».
 */
export interface EsitoElementino {
  sorgente: SorgenteReazioni;
  reazioni: ReazioneEsterna[];
  diagrammi: Map<ElementId, DiagrammaEquilibrio>;
  /** false se qualche asta sta in una maglia chiusa: lì il taglio non separa */
  applicabile: boolean;
  /** perché non è applicabile, quando non lo è */
  motivo?: string;
}

export interface EsitoStatico {
  /** reazioni ottenute dalle equazioni cardinali sui corpi rigidi */
  equilibrio: EsitoReazioni;
  /** risultato del metodo degli spostamenti, sempre disponibile */
  fem: RisultatoAnalisi;
  autoverifiche: EsitoAutoverifiche;
  /** N, T, M ricostruiti per equilibrio dei tronchi */
  elementino: EsitoElementino;
  /**
   * Componenti di reazione da mostrare, decomposte secondo ciò che ciascun
   * vincolo può esplicare. Vengono dalle equazioni cardinali se la struttura è
   * isostatica, dal FEM altrimenti: `elementino.sorgente` dice quale.
   */
  componentiEsterne: ComponenteReazione[];
  /** modello di calcolo e indice: servono per interrogare un taglio qualunque */
  modello: { calcolo: Progetto; indice: IndiceModello; espansione: Espansione };
}

/**
 * Calcola le reazioni con ENTRAMBI i metodi e le confronta.
 *
 * Per una struttura isostatica le equazioni cardinali bastano e danno la
 * risposta esatta; il FEM la ricalcola per via completamente diversa. Il
 * confronto fra i due è l'autoverifica più forte che il programma possa fare
 * su sé stesso.
 *
 * Per una struttura iperstatica l'equilibrio non basta: il calcolo per corpi
 * rigidi si dichiara non applicabile e le reazioni restano quelle del FEM, che
 * usa le equazioni di congruenza. La distinzione è dichiarata, non nascosta.
 */
export function analizzaStatica(
  p: Progetto,
  sorgente: { tipo: 'caso'; id: LoadCaseId } | { tipo: 'combinazione'; id: CombinationId },
  opzioni: OpzioniAnalisi = {},
  /**
   * Risultato del metodo degli spostamenti già disponibile. L'interfaccia lo
   * riceve dal worker: ricalcolarlo qui raddoppierebbe il lavoro più costoso
   * dell'intera analisi per ottenere lo stesso numero.
   */
  femPrecalcolato?: RisultatoAnalisi,
): EsitoStatico {
  const fem = femPrecalcolato ?? (sorgente.tipo === 'caso'
    ? analizzaCaso(p, sorgente.id, opzioni)
    : analizzaCombinazione(p, sorgente.id, opzioni));

  const carichi = sorgente.tipo === 'caso'
    ? p.carichi.filter((c) => c.casoId === sorgente.id)
    : carichiDiCombinazione(p, sorgente.id);

  const espansione = espandi(preparaPerAnalisi({ ...p, carichi }));
  const calcolo = espansione.progetto;
  const idx = costruisciIndice(
    calcolo,
    [...MATERIALI, ...(opzioni.materialiExtra ?? [])],
    [...SEZIONI, ...(opzioni.sezioniExtra ?? [])],
  );

  const equilibrio = calcolaReazioni(calcolo, idx, calcolo.carichi);

  // Le reazioni per equilibrio valgono solo se la struttura è isostatica; sulle
  // iperstatiche il passaggio reazioni → N,T,M resta valido, ma le reazioni
  // devono venire dalla congruenza, cioè dal FEM. La sorgente è dichiarata.
  //
  // Su una struttura LABILE non si produce alcun numero. Il metodo degli
  // spostamenti restituisce comunque qualcosa — la fattorizzazione di una
  // matrice singolare dà valori, non un errore — ma quei valori dipendono da
  // come è stato risolto il nucleo, non dalla fisica. Mostrarli sarebbe
  // peggio che non mostrare niente: sembrerebbero un risultato.
  const labile = equilibrio.classificazione === 'labile';
  const daDove: SorgenteReazioni = equilibrio.risolto ? 'equilibrio' : 'fem';
  const reazioniEsterne = labile ? []
    : daDove === 'equilibrio'
      ? reazioniDaEquilibrio(equilibrio)
      : reazioniDaFem(fem, idx);
  const diagrammi = labile
    ? new Map<ElementId, DiagrammaEquilibrio>()
    : diagrammiPerEquilibrio(calcolo, idx, reazioniEsterne, {
        campioni: calcolo.impostazioni.campioniPerAsta,
      });
  const elementino: EsitoElementino = {
    sorgente: daDove, reazioni: reazioniEsterne, diagrammi,
    applicabile: !labile && [...diagrammi.values()].every((d) => d.applicabile),
    ...(labile ? {
      motivo: 'Struttura labile: le azioni interne non discendono ' +
        'dall\'equilibrio, perché l\'equilibrio non è possibile.',
    } : {}),
  };

  const autoverifiche = eseguiAutoverifiche(
    p, espansione, idx, fem, equilibrio, elementino,
  );

  const componentiEsterne = labile ? [] : daDove === 'equilibrio'
    ? equilibrio.componenti.filter((c) => c.esterno)
    : proiettaSuRighe(equilibrio.righe, fem.reazioni.map((r) => ({
        nodoId: r.nodoId as unknown as string, fx: r.fx, fy: r.fy, mz: r.mz,
      })));

  return {
    equilibrio, fem, autoverifiche, elementino, componentiEsterne,
    modello: { calcolo, indice: idx, espansione },
  };
}

/**
 * Corpo libero del tronco che compete a una sezione dell'asta DISEGNATA
 * dall'utente: l'ascissa relativa viene tradotta sul sotto-elemento che la
 * contiene, così l'interfaccia continua a ragionare sul modello d'autore.
 */
export function troncoInSezione(
  esito: EsitoStatico,
  astaOriginale: ElementId,
  sRelativa: number,
  opzioni: { lato?: 'monte' | 'valle'; lettura?: -1 | 0 | 1 } = {},
): Tronco {
  const tratti = esito.modello.espansione.perOriginale.get(astaOriginale);
  if (!tratti || tratti.length === 0) {
    throw new Error(`Asta '${astaOriginale as unknown as string}' non nel modello.`);
  }
  const s = Math.min(Math.max(sRelativa, 0), 1);
  const t = tratti.find((x) => s >= x.s0 && s <= x.s1) ?? tratti[tratti.length - 1];
  const locale = t.s1 > t.s0 ? (s - t.s0) / (t.s1 - t.s0) : 0;
  const ctx = preparaTronco(
    esito.modello.calcolo, esito.modello.indice, esito.elementino.reazioni,
    t.id, opzioni.lato ?? 'monte',
  );
  return valutaTronco(ctx, locale * ctx.geometria.L, opzioni.lettura ?? 0);
}

function carichiDiCombinazione(p: Progetto, id: CombinationId): Carico[] {
  const comb = p.combinazioni.find((c) => c.id === id);
  if (!comb) return [];
  const out: Carico[] = [];
  for (const t of comb.termini) {
    for (const c of p.carichi) {
      if (c.casoId === t.casoId) out.push(scala(c, t.coefficiente));
    }
  }
  return out;
}

export {
  calcolaReazioni, eseguiAutoverifiche,
  type EsitoReazioni, type EsitoAutoverifiche,
};
export type {
  ComponenteReazione, ReazioneNodale, ForzaDiSconnessione,
  ClassificazioneStatica,
} from './statica/reazioni.js';
export { proiettaSuRighe } from './statica/reazioni.js';
export type { Autoverifica } from './statica/autoverifiche.js';
export {
  troncoAlTaglio, preparaTronco, valutaTronco, diagrammaPerEquilibrio,
  diagrammiPerEquilibrio, reazioniDaEquilibrio, reazioniDaFem,
} from './statica/elementino.js';
export type {
  Tronco, TermineTronco, CategoriaTermine, ReazioneEsterna, SorgenteReazioni,
  DiagrammaEquilibrio, VerificaDifferenziale, ContestoTronco,
} from './statica/elementino.js';

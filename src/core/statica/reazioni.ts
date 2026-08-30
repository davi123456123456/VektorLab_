/**
 * Reazioni vincolari per EQUAZIONI CARDINALI sui corpi rigidi.
 *
 * È il procedimento che si insegna a Scienza delle Costruzioni, ed è
 * volutamente indipendente dal metodo degli spostamenti: due strade diverse
 * che portano allo stesso numero sono una verifica reciproca molto più forte
 * di qualunque tolleranza scelta a tavolino.
 *
 * PERCHÉ NON BASTA L'EQUILIBRIO GLOBALE — su una struttura con sconnessioni le
 * tre equazioni cardinali dell'intero corpo sono meno delle incognite: una
 * trave Gerber ha quattro reazioni esterne e solo tre equazioni globali.
 * L'equazione mancante viene dall'equilibrio del SINGOLO TRONCO, ed è
 * esattamente ciò che dice «nella cerniera il momento è nullo».
 *
 * DUALITÀ STATICO-CINEMATICA — la matrice del sistema è la trasposta della
 * matrice cinematica già costruita per l'analisi di labilità. Discende dal
 * principio dei lavori virtuali: per ogni moto rigido virtuale q, il lavoro
 * delle reazioni x vale xᵀ(A q) e quello dei carichi Fᵀq, quindi l'equilibrio
 * equivale a
 *
 *     F + Aᵀ x = 0        per ogni q
 *
 * Costruire una sola geometria per entrambe garantisce che le due analisi non
 * possano divergere: se cambia la definizione di un vincolo, cambia in tutte e
 * due allo stesso tempo.
 */

import { risolviLU, trasposta } from '../linalg/lu.js';
import { componentiGlobali } from '../model/direzioni.js';
import { geometriaAsta, type IndiceModello } from '../model/queries.js';
import type { Carico, ElementId, NodeId, Progetto } from '../model/types.js';
import type { CorpoRigido } from '../model/results.js';
import { decomponi, type Decomposizione } from '../kinematics/bodies.js';
import {
  costruisciMatriceCinematica, type MatriceCinematica, type RigaVincolo,
} from '../kinematics/matrix.js';
import { risultanteDistribuito } from '../model/direzioni.js';

export type ClassificazioneStatica =
  | 'isostatica' | 'iperstatica' | 'labile' | 'impossibile';

export interface ComponenteReazione {
  /** indice della riga di vincolo che l'ha generata */
  indice: number;
  /** nodo su cui agisce */
  nodoId: string;
  /** tipo di vincolo, o 'sconnessione' per le forze interne */
  tipo: string;
  esterno: boolean;
  /** componente descritta */
  componente: RigaVincolo['componente'];
  /** valore con segno [N] o [N·m] */
  valore: number;
  /** direzione della forza in assi globali; assente per i momenti */
  direzione?: { dx: number; dy: number };
  /** punto di applicazione */
  x?: number;
  y?: number;
  descrizione: string;
}

export interface ReazioneNodale {
  nodoId: string;
  tipo: string;
  fx: number;
  fy: number;
  mz: number;
  /** componenti che la compongono, per la tabella */
  componenti: ComponenteReazione[];
}

export interface ForzaDiSconnessione {
  nodoId: string;
  /** corpi collegati: la forza agisce sul primo, l'opposta sul secondo */
  corpi: [number, number];
  fx: number;
  fy: number;
  mz: number;
  x: number;
  y: number;
}

export interface EsitoReazioni {
  classificazione: ClassificazioneStatica;
  /** true se il calcolo per equilibrio è applicabile e riuscito */
  risolto: boolean;
  corpi: CorpoRigido[];
  /** numero di equazioni: 3 per corpo */
  numeroEquazioni: number;
  /** numero di incognite */
  numeroIncognite: number;
  rango: number;
  /** grado di iperstaticità: incognite − rango */
  iperstaticita: number;
  /** gradi di labilità: equazioni − rango */
  labilita: number;
  componenti: ComponenteReazione[];
  /**
   * Righe di vincolo, anche quando il sistema non è risolubile: descrivono
   * QUALI componenti ciascun vincolo può esplicare, indipendentemente dal loro
   * valore. Servono a mostrare le reazioni di una iperstatica — che vengono
   * dal FEM — con la stessa decomposizione (un carrello resta una freccia
   * sola) invece che come coppie H, V indistinte.
   */
  righe: RigaVincolo[];
  perNodo: ReazioneNodale[];
  sconnessioni: ForzaDiSconnessione[];
  /** residui dell'equilibrio globale ricalcolato con le reazioni trovate */
  residui: { fx: number; fy: number; mz: number; relativo: number };
  messaggio: string;
}

/** Contributo di un carico all'equilibrio di un corpo: forza e momento. */
interface Contributo { fx: number; fy: number; x: number; y: number; mz: number }

/**
 * Riduce i carichi alle loro risultanti, associandole al corpo su cui agiscono.
 * I carichi termici non compaiono: sono autoequilibrati e non alterano
 * l'equilibrio esterno. I cedimenti non sono forze.
 */
function contributiPerCorpo(
  progetto: Progetto, idx: IndiceModello, dec: Decomposizione, carichi: Carico[],
): Map<number, Contributo[]> {
  const perCorpo = new Map<number, Contributo[]>();
  const aggiungi = (corpo: number, c: Contributo) => {
    const lista = perCorpo.get(corpo) ?? [];
    lista.push(c);
    perCorpo.set(corpo, lista);
  };

  const corpoDelNodo = new Map<NodeId, number>();
  for (const c of dec.corpi) for (const n of c.nodiIds) corpoDelNodo.set(n, c.indice);

  for (const carico of carichi) {
    if (carico.tipo === 'termico' || carico.tipo === 'cedimento') continue;

    if (carico.tipo === 'forzaNodale' || carico.tipo === 'momentoNodale') {
      // Un carico nodale su un nodo dove convergono più corpi va attribuito al
      // corpo "master" del nodo, cioè quello rigidamente connesso: è lì che la
      // forza viene effettivamente applicata.
      const corpo = dec.corpoMasterDelNodo.get(carico.nodoId)
        ?? corpoDelNodo.get(carico.nodoId);
      if (corpo === undefined) continue;
      const nodo = idx.nodi.get(carico.nodoId);
      if (!nodo) continue;
      if (carico.tipo === 'forzaNodale') {
        aggiungi(corpo, { fx: carico.fx, fy: carico.fy, x: nodo.x, y: nodo.y, mz: 0 });
      } else {
        aggiungi(corpo, { fx: 0, fy: 0, x: nodo.x, y: nodo.y, mz: carico.mz });
      }
      continue;
    }

    const asta = idx.aste.get(carico.astaId as ElementId);
    if (!asta) continue;
    const corpo = dec.corpoDiAsta.get(asta.id);
    if (corpo === undefined) continue;
    const g = geometriaAsta(asta, idx);

    if (carico.tipo === 'distribuito') {
      const r = risultanteDistribuito(
        carico.q1, carico.q2, carico.sIniziale, carico.sFinale, carico.direzione,
        { x1: g.x1, y1: g.y1, x2: g.x2, y2: g.y2, L: g.L, c: g.c, s: g.s },
      );
      aggiungi(corpo, { fx: r.Fx, fy: r.Fy, x: r.x, y: r.y, mz: 0 });
    } else if (carico.tipo === 'forzaInCampata') {
      const x = g.x1 + (g.x2 - g.x1) * carico.s;
      const y = g.y1 + (g.y2 - g.y1) * carico.s;
      const [fx, fy] = carico.riferimento === 'locale'
        ? [g.c * carico.fx - g.s * carico.fy, g.s * carico.fx + g.c * carico.fy]
        : [carico.fx, carico.fy];
      aggiungi(corpo, { fx, fy, x, y, mz: 0 });
    } else if (carico.tipo === 'momentoInCampata') {
      const x = g.x1 + (g.x2 - g.x1) * carico.s;
      const y = g.y1 + (g.y2 - g.y1) * carico.s;
      aggiungi(corpo, { fx: 0, fy: 0, x, y, mz: carico.mz });
    }
  }
  return perCorpo;
}

/**
 * Carichi generalizzati per corpo: (ΣFx, ΣFy, ΣM rispetto al baricentro G_b).
 * Il polo è il baricentro perché è lo stesso punto rispetto a cui la matrice
 * cinematica esprime la rotazione: usare poli diversi romperebbe la dualità.
 */
function caricoGeneralizzato(
  dec: Decomposizione, contributi: Map<number, Contributo[]>,
): Float64Array {
  const F = new Float64Array(3 * dec.corpi.length);
  for (const corpo of dec.corpi) {
    for (const c of contributi.get(corpo.indice) ?? []) {
      F[3 * corpo.indice] += c.fx;
      F[3 * corpo.indice + 1] += c.fy;
      F[3 * corpo.indice + 2] +=
        c.mz + (c.x - corpo.xG) * c.fy - (c.y - corpo.yG) * c.fx;
    }
  }
  return F;
}

export interface OpzioniReazioni {
  tolleranza?: number;
}

export function calcolaReazioni(
  progetto: Progetto,
  idx: IndiceModello,
  carichi: Carico[],
  opzioni: OpzioniReazioni = {},
): EsitoReazioni {
  const dec = decomponi(progetto, idx);
  const mc: MatriceCinematica = costruisciMatriceCinematica(progetto, idx, dec);

  const numeroEquazioni = 3 * dec.corpi.length;
  const numeroIncognite = mc.righe.length;

  const contributi = contributiPerCorpo(progetto, idx, dec, carichi);
  const F = caricoGeneralizzato(dec, contributi);

  // A_statica = A_cinematicaᵀ  (non scalata: le variabili sono quelle fisiche)
  const Astatica = trasposta(mc.ANonScalata);
  const b = Array.from(F, (v) => -v);

  const esito = risolviLU(Astatica, b, opzioni.tolleranza ?? 1e-10);

  const iperstaticita = numeroIncognite - esito.rango;
  const labilita = numeroEquazioni - esito.rango;

  let classificazione: ClassificazioneStatica;
  let messaggio: string;
  if (esito.incompatibile) {
    classificazione = 'labile';
    messaggio =
      'La struttura è labile: i carichi applicati non possono essere equilibrati. ' +
      'Le equazioni cardinali non ammettono soluzione.';
  } else if (labilita > 0) {
    classificazione = 'labile';
    messaggio =
      `La struttura ha ${labilita} ${labilita === 1 ? 'grado' : 'gradi'} di labilità: ` +
      'i vincoli non impediscono tutti i moti rigidi. Il calcolo per equilibrio ' +
      'non è applicabile.';
  } else if (iperstaticita > 0) {
    classificazione = 'iperstatica';
    messaggio =
      `Struttura ${iperstaticita} ${iperstaticita === 1 ? 'volta' : 'volte'} ` +
      'iperstatica: le equazioni cardinali sono ' +
      'in numero insufficiente. Le reazioni dipendono dalle rigidezze degli ' +
      'elementi e vanno calcolate per congruenza con il metodo degli spostamenti.';
  } else {
    classificazione = 'isostatica';
    messaggio =
      `Struttura isostatica: ${numeroEquazioni} equazioni cardinali su ` +
      `${dec.corpi.length} ${dec.corpi.length === 1 ? 'corpo' : 'corpi'}, ` +
      `${numeroIncognite} incognite. Soluzione unica per solo equilibrio.`;
  }

  if (!esito.determinato || !esito.x) {
    return {
      classificazione, risolto: false, corpi: dec.corpi,
      numeroEquazioni, numeroIncognite, rango: esito.rango,
      iperstaticita, labilita,
      componenti: [], righe: mc.righe, perNodo: [], sconnessioni: [],
      residui: { fx: 0, fy: 0, mz: 0, relativo: 0 },
      messaggio,
    };
  }

  const componenti = descriviComponenti(mc.righe, esito.x);
  const perNodo = raggruppaPerNodo(componenti);
  const sconnessioni = estraiSconnessioni(mc.righe, esito.x, dec);
  const residui = verificaEquilibrioGlobale(dec, contributi, perNodo);

  return {
    classificazione, risolto: true, corpi: dec.corpi,
    numeroEquazioni, numeroIncognite, rango: esito.rango,
    iperstaticita, labilita,
    componenti, righe: mc.righe, perNodo, sconnessioni, residui, messaggio,
  };
}

function descriviComponenti(righe: RigaVincolo[], x: Float64Array): ComponenteReazione[] {
  return righe.map((r, i) => ({
    indice: i,
    nodoId: r.nodoId,
    tipo: r.origine === 'esterno' ? (r.tipoVincolo ?? 'vincolo') : 'sconnessione',
    esterno: r.origine === 'esterno',
    componente: r.componente,
    valore: x[i],
    ...(r.reazione ? {
      direzione: { dx: r.reazione.dx, dy: r.reazione.dy },
      x: r.reazione.x, y: r.reazione.y,
    } : r.punto ? { x: r.punto.x, y: r.punto.y } : {}),
    descrizione: r.descrizione,
  }));
}

/** Somma le componenti di ciascun vincolo esterno in una reazione risultante. */
function raggruppaPerNodo(componenti: ComponenteReazione[]): ReazioneNodale[] {
  const mappa = new Map<string, ReazioneNodale>();
  for (const c of componenti) {
    if (!c.esterno) continue;
    let r = mappa.get(c.nodoId);
    if (!r) {
      r = { nodoId: c.nodoId, tipo: c.tipo, fx: 0, fy: 0, mz: 0, componenti: [] };
      mappa.set(c.nodoId, r);
    }
    r.componenti.push(c);
    if (c.componente === 'rotazione') {
      r.mz += c.valore;
    } else if (c.direzione) {
      r.fx += c.valore * c.direzione.dx;
      r.fy += c.valore * c.direzione.dy;
    }
  }
  return [...mappa.values()];
}

function estraiSconnessioni(
  righe: RigaVincolo[], x: Float64Array, dec: Decomposizione,
): ForzaDiSconnessione[] {
  const mappa = new Map<string, ForzaDiSconnessione>();
  righe.forEach((r, i) => {
    if (r.origine !== 'interno' || r.corpi.length < 2) return;
    const chiave = `${r.nodoId}|${r.corpi[0]}|${r.corpi[1]}`;
    let f = mappa.get(chiave);
    if (!f) {
      f = {
        nodoId: r.nodoId, corpi: [r.corpi[0], r.corpi[1]],
        fx: 0, fy: 0, mz: 0,
        x: r.reazione?.x ?? dec.corpi[r.corpi[0]]?.xG ?? 0,
        y: r.reazione?.y ?? dec.corpi[r.corpi[0]]?.yG ?? 0,
      };
      mappa.set(chiave, f);
    }
    if (r.componente === 'rotazione') f.mz += x[i];
    else if (r.reazione) {
      f.fx += x[i] * r.reazione.dx;
      f.fy += x[i] * r.reazione.dy;
    }
  });
  return [...mappa.values()];
}

/**
 * Equilibrio globale ricalcolato: è un controllo INDIPENDENTE dal sistema
 * risolto, perché usa le reazioni come dati e le somma di nuovo. Se il sistema
 * fosse stato assemblato male, questo residuo non tornerebbe.
 */
function verificaEquilibrioGlobale(
  dec: Decomposizione, contributi: Map<number, Contributo[]>, perNodo: ReazioneNodale[],
): { fx: number; fy: number; mz: number; relativo: number } {
  let fx = 0, fy = 0, mz = 0, scala = 0;
  for (const corpo of dec.corpi) {
    for (const c of contributi.get(corpo.indice) ?? []) {
      fx += c.fx; fy += c.fy;
      mz += c.mz + c.x * c.fy - c.y * c.fx;
      scala += Math.abs(c.fx) + Math.abs(c.fy);
    }
  }
  for (const r of perNodo) {
    fx += r.fx; fy += r.fy;
    const p = r.componenti.find((c) => c.x !== undefined);
    const px = p?.x ?? 0, py = p?.y ?? 0;
    mz += r.mz + px * r.fy - py * r.fx;
    scala += Math.abs(r.fx) + Math.abs(r.fy);
  }
  const norma = Math.hypot(fx, fy);
  return { fx, fy, mz, relativo: scala > 0 ? norma / scala : norma };
}


/**
 * Decompone reazioni nodali (fx, fy, mz) sulle componenti che ciascun vincolo
 * può davvero esplicare. Per un carrello inclinato la reazione ha due
 * componenti cartesiane ma UNA sola componente vincolare, lungo il proprio
 * asse: è quella che va disegnata e messa in tabella.
 */
export function proiettaSuRighe(
  righe: RigaVincolo[],
  nodali: { nodoId: string; fx: number; fy: number; mz: number }[],
): ComponenteReazione[] {
  const perNodo = new Map(nodali.map((r) => [r.nodoId, r]));
  const out: ComponenteReazione[] = [];
  righe.forEach((r, i) => {
    if (r.origine !== 'esterno') return;
    const n = perNodo.get(r.nodoId);
    if (!n) return;
    const valore = r.componente === 'rotazione'
      ? n.mz
      : r.reazione ? n.fx * r.reazione.dx + n.fy * r.reazione.dy : 0;
    out.push({
      indice: i,
      nodoId: r.nodoId,
      tipo: r.tipoVincolo ?? 'vincolo',
      esterno: true,
      componente: r.componente,
      valore,
      ...(r.reazione ? {
        direzione: { dx: r.reazione.dx, dy: r.reazione.dy },
        x: r.reazione.x, y: r.reazione.y,
      } : r.punto ? { x: r.punto.x, y: r.punto.y } : {}),
      descrizione: r.descrizione,
    });
  });
  return out;
}

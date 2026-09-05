/**
 * §0 — L'ISTANTANEA DEI RISULTATI, E IL SUO CONFRONTO.
 *
 * Fotografa tutto ciò che il motore produce per un modello, con la PRECISIONE
 * PIENA dei double: nessun arrotondamento di visualizzazione, perché il
 * confronto dev'essere esatto. Un'iterazione che tocca solo l'interfaccia deve
 * lasciare ogni cifra dove sta, e questo file è ciò che lo dimostra.
 *
 * La serializzazione è deterministica per costruzione: le chiavi sono scritte
 * nell'ordine in cui compaiono qui, e ogni elenco eredita l'ordine del modello,
 * mai quello di una Map o di un Set.
 */

import {
  analizzaCinematica, analizzaStatica, verificaStruttura,
} from '../../src/core/index.js';
import type {
  ElementId, LoadCaseId, Progetto, RisultatoAsta,
} from '../../src/core/index.js';

const CASO = 'principale' as LoadCaseId;

/** Campioni per asta della griglia fissa del §0.1. */
export const CAMPIONI = 101;

// ═══════════════════════ FORMA DELL'ISTANTANEA ═══════════════════════

export interface CampionatoAsta {
  astaId: string;
  lunghezza: number;
  /** N, T, M su CAMPIONI ascisse equispaziate in [0, L] */
  griglia: { x: number[]; N: number[]; T: number[]; M: number[] };
  /**
   * Valori a sinistra e a destra di ogni discontinuità.
   *
   * La griglia equispaziata non le vede: una forza concentrata fa saltare T fra
   * due campioni, e interpolando si legge un valore che in quel punto non
   * esiste. Il salto è proprio ciò che va congelato.
   */
  discontinuita: { x: number; sinistra: [number, number, number]; destra: [number, number, number] }[];
  puntiNotevoli: { s: number; x: number; tipo: string; N: number; T: number; M: number }[];
  estremi: { Nmin: number; Nmax: number; Tmin: number; Tmax: number; Mmin: number; Mmax: number };
  forzeEstremita: number[];
  frecciaMassima: number;
  xFreccia: number;
  /** deformata: u e v locali sulla stessa griglia fissa */
  deformata: { u: number[]; v: number[] };
}

export interface Istantanea {
  nome: string;
  cinematica: {
    numeroCorpi: number; gradiLiberta: number; gradiVincolo: number;
    gradiVincoloEsterni: number; gradiVincoloInterni: number;
    rango: number; labilita: number; iperstaticita: number;
    classificazione: string; anelliChiusi: number; iperstaticitaInterna: number;
    valoriSingolari: number[];
  };
  /** reazioni nodali del FEM, nell'ordine dei nodi del modello di calcolo */
  reazioni: { nodoId: string; fx: number; fy: number; mz: number }[];
  /** componenti decomposte secondo ciò che ciascun vincolo può esplicare */
  componenti: { nodoId: string; tipo: string; componente: string; valore: number }[];
  sorgenteReazioni: string;
  /** spostamenti nodali globali: ux, uy, θ per ogni nodo del modello di calcolo */
  spostamentiNodali: { nodoId: string; ux: number; uy: number; theta: number }[];
  spostamentoMassimo: number;
  aste: CampionatoAsta[];
  equilibrio: { sommaFx: number; sommaFy: number; sommaMz: number; residuoRelativo: number; soddisfatto: boolean };
  autoverifiche: { codice: string; superata: boolean; scarto: number; tolleranza: number; esaminati: number }[];
  coefficiente: {
    astaId: string; x: number; s: number;
    N: number; T: number; M: number;
    y: number; sigma: number; tau: number; vonMises: number;
    sigmaIdeale: number; resistenza: number; coefficienteSicurezza: number;
    sfruttamento: number; verificato: boolean;
  } | null;
  tutteVerificate: boolean;
}

// ═══════════════════════ CAMPIONAMENTO ═══════════════════════

/**
 * Valore di `q` all'ascissa `x`, avvicinandosi dal lato indicato.
 *
 * Le ascisse dei risultati sono non decrescenti e RIPETUTE in corrispondenza
 * di una discontinuità: lo stesso x compare due volte, con il valore prima e
 * quello dopo il salto. Il lato sceglie quale dei due leggere.
 */
function leggi(a: RisultatoAsta, q: 'N' | 'T' | 'M', x: number, lato: 'sx' | 'dx'): number {
  const xs = a.ascisse, v = a[q], n = xs.length;
  if (x <= xs[0]) return v[0];
  if (x >= xs[n - 1]) return v[n - 1];
  if (lato === 'sx') {
    for (let i = n - 2; i >= 0; i--) {
      if (xs[i] > x) continue;
      const d = xs[i + 1] - xs[i];
      if (d <= 0) return v[i];
      return v[i] + ((v[i + 1] - v[i]) * (x - xs[i])) / d;
    }
    return v[0];
  }
  for (let i = 0; i < n - 1; i++) {
    if (xs[i + 1] < x) continue;
    const d = xs[i + 1] - xs[i];
    if (d <= 0) continue;
    return v[i] + ((v[i + 1] - v[i]) * (x - xs[i])) / d;
  }
  return v[n - 1];
}

function leggiSerie(a: RisultatoAsta, s: Float64Array, x: number): number {
  const xs = a.ascisse, n = xs.length;
  if (x <= xs[0]) return s[0];
  if (x >= xs[n - 1]) return s[n - 1];
  for (let i = 0; i < n - 1; i++) {
    if (xs[i + 1] < x) continue;
    const d = xs[i + 1] - xs[i];
    if (d <= 0) continue;
    return s[i] + ((s[i + 1] - s[i]) * (x - xs[i])) / d;
  }
  return s[n - 1];
}

function campiona(a: RisultatoAsta): CampionatoAsta {
  const L = a.lunghezza;
  const x: number[] = [], N: number[] = [], T: number[] = [], M: number[] = [];
  const u: number[] = [], v: number[] = [];
  for (let k = 0; k < CAMPIONI; k++) {
    // L·k/(CAMPIONI−1), non un accumulo di passi: l'accumulo introduce una
    // deriva che dipende da come è scritto il ciclo, e la griglia dev'essere
    // la stessa oggi e alla prossima esecuzione.
    const xi = (L * k) / (CAMPIONI - 1);
    x.push(xi);
    N.push(leggi(a, 'N', xi, 'dx'));
    T.push(leggi(a, 'T', xi, 'dx'));
    M.push(leggi(a, 'M', xi, 'dx'));
    u.push(leggiSerie(a, a.uLocale, xi));
    v.push(leggiSerie(a, a.vLocale, xi));
  }

  const disc: CampionatoAsta['discontinuita'] = [];
  for (let i = 0; i < a.ascisse.length - 1; i++) {
    if (a.ascisse[i + 1] !== a.ascisse[i]) continue;
    disc.push({
      x: a.ascisse[i],
      sinistra: [a.N[i], a.T[i], a.M[i]],
      destra: [a.N[i + 1], a.T[i + 1], a.M[i + 1]],
    });
  }

  return {
    astaId: a.astaId as unknown as string,
    lunghezza: L,
    griglia: { x, N, T, M },
    discontinuita: disc,
    puntiNotevoli: a.puntiNotevoli.map((p) => ({
      s: p.s, x: p.x, tipo: p.tipo, N: p.N, T: p.T, M: p.M,
    })),
    estremi: { ...a.estremi },
    forzeEstremita: [...a.forzeEstremita],
    frecciaMassima: a.frecciaMassima,
    xFreccia: a.xFreccia,
    deformata: { u, v },
  };
}

// ═══════════════════════ COSTRUZIONE ═══════════════════════

export function istantanea(nome: string, p: Progetto): Istantanea {
  const cin = analizzaCinematica(p);
  const st = analizzaStatica(p, { tipo: 'caso', id: CASO });
  const fem = st.fem;
  const nodi = st.modello.calcolo.nodi;

  const spostamentiNodali = nodi.map((n, k) => ({
    nodoId: n.id as unknown as string,
    ux: fem.spostamenti[3 * k],
    uy: fem.spostamenti[3 * k + 1],
    theta: fem.spostamenti[3 * k + 2],
  }));

  const ver = verificaStruttura(p, fem);
  const peggiore = ver.peggiore;

  return {
    nome,
    cinematica: {
      numeroCorpi: cin.numeroCorpi,
      gradiLiberta: cin.gradiLiberta,
      gradiVincolo: cin.gradiVincolo,
      gradiVincoloEsterni: cin.gradiVincoloEsterni,
      gradiVincoloInterni: cin.gradiVincoloInterni,
      rango: cin.rango,
      labilita: cin.labilita,
      iperstaticita: cin.iperstaticita,
      classificazione: cin.classificazione,
      anelliChiusi: cin.anelliChiusi,
      iperstaticitaInterna: cin.iperstaticitaInterna,
      valoriSingolari: [...cin.valoriSingolari],
    },
    reazioni: fem.reazioni.map((r) => ({
      nodoId: r.nodoId as unknown as string, fx: r.fx, fy: r.fy, mz: r.mz,
    })),
    componenti: st.componentiEsterne.map((c) => ({
      nodoId: c.nodoId, tipo: c.tipo, componente: String(c.componente), valore: c.valore,
    })),
    sorgenteReazioni: st.elementino.sorgente,
    spostamentiNodali,
    spostamentoMassimo: fem.spostamentoMassimo,
    aste: fem.aste.map(campiona),
    equilibrio: {
      sommaFx: fem.equilibrio.sommaFx,
      sommaFy: fem.equilibrio.sommaFy,
      sommaMz: fem.equilibrio.sommaMz,
      residuoRelativo: fem.equilibrio.residuoRelativo,
      soddisfatto: fem.equilibrio.soddisfatto,
    },
    autoverifiche: st.autoverifiche.verifiche.map((a) => ({
      codice: a.codice, superata: a.superata,
      scarto: a.scarto, tolleranza: a.tolleranza,
      esaminati: (a as { esaminati?: number }).esaminati ?? -1,
    })),
    coefficiente: peggiore ? {
      astaId: peggiore.astaId,
      x: peggiore.sezione.x, s: peggiore.sezione.s,
      N: peggiore.sezione.N, T: peggiore.sezione.T, M: peggiore.sezione.M,
      y: peggiore.critico.y,
      sigma: peggiore.critico.sigma,
      tau: peggiore.critico.tau,
      vonMises: peggiore.critico.vonMises,
      sigmaIdeale: peggiore.sigmaIdeale,
      resistenza: peggiore.resistenza,
      coefficienteSicurezza: peggiore.coefficienteSicurezza,
      sfruttamento: peggiore.sfruttamento,
      verificato: peggiore.verificato,
    } : null,
    tutteVerificate: ver.tutteVerificate,
  };
}

// ═══════════════════════ CONFRONTO ═══════════════════════

export interface Scostamento {
  /** percorso completo dentro l'istantanea: dice quale grandezza e dove */
  dove: string;
  atteso: unknown;
  trovato: unknown;
  /** scarto relativo, quando entrambi sono numeri */
  relativo?: number;
}

/**
 * Tolleranza del §0.2: 1e-12 RELATIVO.
 *
 * Su un numero che vale zero il relativo non è definito, e dividere per la
 * grandezza attesa darebbe infinito su ogni residuo di equilibrio — è
 * esattamente l'errore di normalizzazione che ha prodotto quattro bug nelle
 * iterazioni precedenti. Sotto la soglia assoluta il confronto è assoluto.
 */
const TOLL_RELATIVA = 1e-12;
const QUASI_ZERO = 1e-30;

function confrontaNumeri(a: number, b: number): number | null {
  if (Object.is(a, b)) return null;
  if (Number.isNaN(a) && Number.isNaN(b)) return null;
  const scala = Math.max(Math.abs(a), Math.abs(b));
  if (scala <= QUASI_ZERO) return null;
  const rel = Math.abs(a - b) / scala;
  return rel <= TOLL_RELATIVA ? null : rel;
}

/** Percorre due istantanee in parallelo e riporta ogni differenza. */
export function confronta(atteso: unknown, trovato: unknown, dove = ''): Scostamento[] {
  const out: Scostamento[] = [];
  const visita = (a: unknown, b: unknown, p: string): void => {
    if (typeof a === 'number' && typeof b === 'number') {
      const rel = confrontaNumeri(a, b);
      if (rel !== null) out.push({ dove: p, atteso: a, trovato: b, relativo: rel });
      return;
    }
    if (Array.isArray(a) || Array.isArray(b)) {
      if (!Array.isArray(a) || !Array.isArray(b)) {
        out.push({ dove: p, atteso: a, trovato: b });
        return;
      }
      if (a.length !== b.length) {
        out.push({ dove: `${p}.length`, atteso: a.length, trovato: b.length });
        return;
      }
      for (let i = 0; i < a.length; i++) visita(a[i], b[i], `${p}[${i}]`);
      return;
    }
    if (a && b && typeof a === 'object' && typeof b === 'object') {
      const ka = Object.keys(a as object), kb = Object.keys(b as object);
      if (ka.length !== kb.length || ka.some((k) => !kb.includes(k))) {
        out.push({ dove: `${p} (chiavi)`, atteso: ka.join(','), trovato: kb.join(',') });
        return;
      }
      for (const k of ka) {
        visita(
          (a as Record<string, unknown>)[k],
          (b as Record<string, unknown>)[k],
          p ? `${p}.${k}` : k,
        );
      }
      return;
    }
    if (a !== b) out.push({ dove: p, atteso: a, trovato: b });
  };
  visita(atteso, trovato, dove);
  return out;
}

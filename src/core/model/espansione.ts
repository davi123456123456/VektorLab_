/**
 * Espansione del modello di AUTHORING nel modello di CALCOLO.
 *
 * L'utente disegna una trave sola e ci appoggia un carrello in mezzeria; il
 * solutore ha bisogno di due elementi che condividono un nodo. Sono due
 * rappresentazioni diverse della stessa cosa, e tenerle separate è ciò che
 * permette all'outliner di mostrare una trave dove l'utente ne ha disegnata
 * una, mentre il calcolo lavora sulla suddivisione che gli serve.
 *
 * LA DISTINZIONE CHE CONTA — un vincolo esterno intermedio produce una
 * suddivisione con CONTINUITÀ COMPLETA: i due tronchi condividono u, v e θ,
 * quindi restano un unico corpo rigido. Una sconnessione produce invece un
 * RILASCIO su quel nodo, e i due tronchi diventano corpi distinti. Confondere
 * le due cose significa trasformare una trave continua iperstatica in una
 * Gerber isostatica senza accorgersene.
 *
 * L'espansione restituisce anche la corrispondenza inversa, perché i risultati
 * calcolati sui sotto-elementi vanno riportati sull'asta originale.
 */

import { gruppiSconnessione, rilasciDa } from './partizione.js';
import type { TipoSconnessione,
  Asta, Carico, ElementId, NodeId, Nodo, Progetto, SvincoloEstremita,
  VincoloInterno,
} from './types.js';

export interface TrattoDiAsta {
  /** id del sotto-elemento nel modello di calcolo */
  id: ElementId;
  /** asta dell'autore da cui deriva */
  originale: ElementId;
  /** intervallo di ascissa relativa dell'originale coperto da questo tratto */
  s0: number;
  s1: number;
}

/**
 * L'asta dell'autore da cui viene un sotto-elemento del modello di calcolo.
 * I tratti si chiamano `asta#k` (vedi più sotto, dove nascono); un'asta che
 * non è stata spezzata conserva il proprio id.
 */
export function astaDiOrigine(id: ElementId): ElementId {
  const testo = id as unknown as string;
  const k = testo.indexOf('#');
  return (k < 0 ? testo : testo.slice(0, k)) as unknown as ElementId;
}

export interface Espansione {
  progetto: Progetto;
  /** sotto-elemento → tratto dell'asta originale */
  tratti: Map<ElementId, TrattoDiAsta>;
  /** asta originale → sotto-elementi, in ordine di ascissa */
  perOriginale: Map<ElementId, TrattoDiAsta[]>;
  /** nodi creati dall'espansione, che non esistono nel modello dell'autore */
  nodiInterni: Set<NodeId>;
  /** nodi che ospitano una sconnessione: lì il momento deve essere nullo */
  nodiSconnessione: Map<NodeId, { astaId: ElementId; tipo: string; s: number }>;
  /**
   * Nodi nati da un vincolo esterno intermedio, con l'asta e l'ascissa da cui
   * vengono. Servono all'interfaccia: «reazione in _n1» non dice niente,
   * «reazione a metà di a3» sì.
   */
  nodiVincolo: Map<NodeId, { astaId: ElementId; s: number; vincoloId: string }>;
}

const NESSUNO: SvincoloEstremita = { N: false, T: false, M: false };

/**
 * Rilasci corrispondenti a ciascun tipo di sconnessione: si applicano al
 * tronco SEGUENTE, lasciando il precedente rigidamente connesso al nodo.
 * Serve un lato rigido, altrimenti il grado di libertà del nodo resterebbe
 * indeterminato — è la stessa regola del "master" già usata sui nodi.
 */
function rilascioDa(tipo: TipoSconnessione): SvincoloEstremita {
  switch (tipo) {
    // la cerniera non trasmette momento
    case 'cerniera': return { N: false, T: false, M: true };
    // il bipendolo non trasmette taglio
    case 'bipendolo': return { N: false, T: true, M: false };
    // il pattino non trasmette sforzo normale
    case 'pattino': return { N: true, T: false, M: false };
    // §1 — il carrello interno libera DUE cose: la rotazione relativa e lo
    // scorrimento lungo il piano. Resta trasmessa la sola componente
    // perpendicolare, che nel riferimento locale è il taglio.
    case 'carrelloInterno': return { N: true, T: false, M: true };
  }
}

export function espandi(p: Progetto): Espansione {
  const vincoliSuAsta = p.vincoliSuAsta ?? [];
  const sconnessioni = p.sconnessioni ?? [];

  if (vincoliSuAsta.length === 0 && sconnessioni.length === 0) {
    // nessuna suddivisione: il modello di calcolo coincide con quello d'autore
    const tratti = new Map<ElementId, TrattoDiAsta>();
    const perOriginale = new Map<ElementId, TrattoDiAsta[]>();
    for (const a of p.aste) {
      const t: TrattoDiAsta = { id: a.id, originale: a.id, s0: 0, s1: 1 };
      tratti.set(a.id, t);
      perOriginale.set(a.id, [t]);
    }
    const aste = applicaSconnessioniNodali(p.aste, p.vincoliInterni, perOriginale);
    return {
      progetto: aste === p.aste ? p : { ...p, aste, vincoliInterni: [] },
      tratti, perOriginale,
      nodiInterni: new Set(), nodiSconnessione: new Map(), nodiVincolo: new Map(),
    };
  }

  const nodi: Nodo[] = [...p.nodi];
  const aste: Asta[] = [];
  const carichi: Carico[] = [];
  const tratti = new Map<ElementId, TrattoDiAsta>();
  const perOriginale = new Map<ElementId, TrattoDiAsta[]>();
  const nodiInterni = new Set<NodeId>();
  const nodiSconnessione = new Map<NodeId, { astaId: ElementId; tipo: string; s: number }>();
  const nodiVincolo = new Map<NodeId, { astaId: ElementId; s: number; vincoloId: string }>();

  const coordinate = new Map(p.nodi.map((n) => [n.id, n]));
  let contatore = 0;
  const nuovoNodo = (x: number, y: number): NodeId => {
    const id = `_n${++contatore}` as NodeId;
    nodi.push({ id, x: x as never, y: y as never });
    nodiInterni.add(id);
    return id;
  };

  // punti di suddivisione per asta
  interface Punto { s: number; vincolo?: VincoloSuAstaLocale; sconnessione?: SconnessioneLocale }
  type VincoloSuAstaLocale = (typeof vincoliSuAsta)[number];
  type SconnessioneLocale = (typeof sconnessioni)[number];

  const puntiPerAsta = new Map<ElementId, Punto[]>();
  for (const v of vincoliSuAsta) {
    if (v.s <= 0 || v.s >= 1) continue;   // agli estremi è un vincolo di nodo
    const lista = puntiPerAsta.get(v.astaId) ?? [];
    lista.push({ s: v.s, vincolo: v });
    puntiPerAsta.set(v.astaId, lista);
  }
  for (const c of sconnessioni) {
    if (c.s <= 0 || c.s >= 1) continue;
    const lista = puntiPerAsta.get(c.astaId) ?? [];
    lista.push({ s: c.s, sconnessione: c });
    puntiPerAsta.set(c.astaId, lista);
  }

  for (const asta of p.aste) {
    const punti = (puntiPerAsta.get(asta.id) ?? []).sort((a, b) => a.s - b.s);
    if (punti.length === 0) {
      aste.push(asta);
      const t: TrattoDiAsta = { id: asta.id, originale: asta.id, s0: 0, s1: 1 };
      tratti.set(asta.id, t);
      perOriginale.set(asta.id, [t]);
      continue;
    }

    const ni = coordinate.get(asta.nodoIniziale);
    const nj = coordinate.get(asta.nodoFinale);
    if (!ni || !nj) { aste.push(asta); continue; }

    // catena di nodi: estremo iniziale, punti intermedi, estremo finale
    const catena: { id: NodeId; s: number; punto?: Punto }[] = [
      { id: asta.nodoIniziale, s: 0 },
    ];
    for (const punto of punti) {
      const x = ni.x + (nj.x - ni.x) * punto.s;
      const y = ni.y + (nj.y - ni.y) * punto.s;
      const id = nuovoNodo(x, y);
      if (punto.vincolo) {
        // il vincolo esterno viaggia col nodo, ma NON introduce rilasci
        const nodo = nodi.find((n) => n.id === id)!;
        nodo.vincolo = punto.vincolo.vincolo;
        nodiVincolo.set(id, {
          astaId: asta.id, s: punto.s, vincoloId: punto.vincolo.id,
        });
      }
      if (punto.sconnessione) {
        nodiSconnessione.set(id, {
          astaId: asta.id, tipo: punto.sconnessione.tipo, s: punto.s,
        });
      }
      catena.push({ id, s: punto.s, punto });
    }
    catena.push({ id: asta.nodoFinale, s: 1 });

    const lista: TrattoDiAsta[] = [];
    for (let k = 0; k < catena.length - 1; k++) {
      const da = catena[k];
      const a = catena[k + 1];
      const id = `${asta.id}#${k}` as ElementId;

      // Il rilascio si applica all'ESTREMO INIZIALE del tronco che segue la
      // sconnessione: il tronco precedente resta rigidamente connesso al nodo.
      const sconnessioneQui = da.punto?.sconnessione;
      const svincoloIniziale: SvincoloEstremita = sconnessioneQui
        ? rilascioDa(sconnessioneQui.tipo)
        : (k === 0 ? asta.svincolo.iniziale : NESSUNO);
      const svincoloFinale: SvincoloEstremita =
        k === catena.length - 2 ? asta.svincolo.finale : NESSUNO;

      aste.push({
        ...asta, id,
        nodoIniziale: da.id, nodoFinale: a.id,
        svincolo: { iniziale: svincoloIniziale, finale: svincoloFinale },
      });
      const t: TrattoDiAsta = { id, originale: asta.id, s0: da.s, s1: a.s };
      tratti.set(id, t);
      lista.push(t);
    }
    perOriginale.set(asta.id, lista);
  }

  // ── ridistribuzione dei carichi sui tronchi ──
  for (const c of p.carichi) {
    if (!('astaId' in c)) { carichi.push(c); continue; }
    const lista = perOriginale.get(c.astaId);
    if (!lista || lista.length === 1) { carichi.push(c); continue; }
    carichi.push(...ridistribuisci(c, lista));
  }

  return {
    progetto: {
      ...p, nodi, carichi,
      aste: applicaSconnessioniNodali(aste, p.vincoliInterni, perOriginale),
      // i vincoli e le sconnessioni sono stati assorbiti nella suddivisione
      vincoliSuAsta: [], sconnessioni: [], vincoliInterni: [],
    },
    tratti, perOriginale, nodiInterni, nodiSconnessione, nodiVincolo,
  };
}

/**
 * Traduce le sconnessioni poste su un NODO in rilasci sulle estremità delle
 * aste che vi convergono.
 *
 * È il ponte fra come l'utente ragiona («in A c'è una cerniera») e come il
 * solutore ha bisogno di leggerlo («l'estremo iniziale dell'asta A–B non
 * trasmette momento»). Il modello d'autore resta quello dell'utente: qui si
 * costruisce solo la vista di calcolo.
 *
 * Una delle aste resta MASTER, rigidamente connessa al nodo. Senza un lato
 * rigido il grado di libertà rotazionale del nodo resterebbe indeterminato nel
 * FEM, e il conteggio non darebbe il classico 2(m−1) per m aste incernierate.
 */
function applicaSconnessioniNodali(
  aste: Asta[],
  vincoliInterni: VincoloInterno[] | undefined,
  perOriginale: Map<ElementId, TrattoDiAsta[]>,
): Asta[] {
  const elenco = (vincoliInterni ?? []).filter((v) => v.tipo !== 'biella');
  if (elenco.length === 0) return aste;

  const perId = new Map(aste.map((a) => [a.id, a]));
  // rilasci accumulati per (asta, estremo): più sconnessioni possono insistere
  // sullo stesso tronco, agli estremi opposti
  const rilasci = new Map<string, SvincoloEstremita>();

  /** Tronco dell'asta d'autore che tocca il nodo, e da quale estremo. */
  const troncoAlNodo = (
    astaOriginale: ElementId, nodoId: NodeId,
  ): { asta: Asta; estremo: 'iniziale' | 'finale' } | null => {
    const tratti = perOriginale.get(astaOriginale);
    const candidati = tratti ? tratti.map((t) => perId.get(t.id)) : [perId.get(astaOriginale)];
    for (const a of candidati) {
      if (!a) continue;
      if (a.nodoIniziale === nodoId) return { asta: a, estremo: 'iniziale' };
      if (a.nodoFinale === nodoId) return { asta: a, estremo: 'finale' };
    }
    return null;
  };

  for (const v of elenco) {
    // aste d'autore che convergono nel nodo
    const convergenti = [...perOriginale.keys()].filter(
      (id) => troncoAlNodo(id, v.nodoId) !== null,
    );
    if (convergenti.length < 2) continue;

    // §3.2 — la partizione è un dato del modello, non una deduzione. Il
    // gruppo più numeroso conserva il nodo; le aste degli altri gruppi
    // vengono rilasciate, e ciascuna ruota per conto proprio.
    const gruppi = gruppiSconnessione(v, convergenti);
    const { rilasciate: svincolate } = rilasciDa(gruppi);

    for (const id of svincolate) {
      const t = troncoAlNodo(id, v.nodoId);
      if (!t) continue;
      const chiave = `${t.asta.id as unknown as string}|${t.estremo}`;
      const attuale = rilasci.get(chiave)
        ?? (t.estremo === 'iniziale' ? t.asta.svincolo.iniziale : t.asta.svincolo.finale);
      const nuovo = rilascioDa(v.tipo as TipoSconnessione);
      rilasci.set(chiave, {
        N: attuale.N || nuovo.N, T: attuale.T || nuovo.T, M: attuale.M || nuovo.M,
      });
    }
  }

  if (rilasci.size === 0) return aste;
  return aste.map((a) => {
    const i = rilasci.get(`${a.id as unknown as string}|iniziale`);
    const f = rilasci.get(`${a.id as unknown as string}|finale`);
    if (!i && !f) return a;
    return {
      ...a,
      svincolo: {
        iniziale: i ?? a.svincolo.iniziale,
        finale: f ?? a.svincolo.finale,
      },
    };
  });
}

/**
 * Riporta un carico definito sull'asta d'autore sui tronchi che la compongono,
 * riscalando le ascisse relative. Un distribuito che copre più tronchi viene
 * spezzato, conservando l'andamento trapezoidale su ciascun pezzo.
 */
export function ridistribuisci(c: Carico, tratti: TrattoDiAsta[]): Carico[] {
  const out: Carico[] = [];

  if (c.tipo === 'distribuito') {
    for (const t of tratti) {
      const inizio = Math.max(c.sIniziale, t.s0);
      const fine = Math.min(c.sFinale, t.s1);
      if (fine <= inizio) continue;
      const ampiezza = c.sFinale - c.sIniziale;
      // intensità agli estremi della porzione, interpolando il trapezio
      const frazione = (s: number) => (ampiezza > 0 ? (s - c.sIniziale) / ampiezza : 0);
      const qA = c.q1 + (c.q2 - c.q1) * frazione(inizio);
      const qB = c.q1 + (c.q2 - c.q1) * frazione(fine);
      const lunghezzaTratto = t.s1 - t.s0;
      out.push({
        ...c,
        id: `${c.id}@${t.id}` as never,
        astaId: t.id,
        sIniziale: (inizio - t.s0) / lunghezzaTratto,
        sFinale: (fine - t.s0) / lunghezzaTratto,
        q1: qA as never, q2: qB as never,
      });
    }
    return out;
  }

  if (c.tipo === 'forzaInCampata' || c.tipo === 'momentoInCampata') {
    const t = tratti.find((x) => c.s >= x.s0 && c.s <= x.s1) ?? tratti[tratti.length - 1];
    const lunghezzaTratto = t.s1 - t.s0;
    out.push({
      ...c,
      id: `${c.id}@${t.id}` as never,
      astaId: t.id,
      s: lunghezzaTratto > 0 ? (c.s - t.s0) / lunghezzaTratto : 0,
    });
    return out;
  }

  if (c.tipo === 'termico') {
    // la variazione termica agisce su tutta l'asta: si replica su ogni tronco
    for (const t of tratti) {
      out.push({ ...c, id: `${c.id}@${t.id}` as never, astaId: t.id });
    }
    return out;
  }

  return [c];
}

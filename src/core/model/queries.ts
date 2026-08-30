/**
 * Selettori puri sul modello. Nessuno stato, nessun effetto collaterale.
 * Costruiscono anche l'indice di accesso rapido usato dal solutore.
 */

import type {
  Asta, ElementId, Materiale, Nodo, NodeId, Progetto, Sezione,
  MaterialId, SectionId, Carico, LoadCaseId,
} from './types.js';

export interface IndiceModello {
  nodi: Map<NodeId, Nodo>;
  aste: Map<ElementId, Asta>;
  materiali: Map<MaterialId, Materiale>;
  sezioni: Map<SectionId, Sezione>;
  /** aste che convergono in ciascun nodo */
  asteDelNodo: Map<NodeId, ElementId[]>;
  carichiDelCaso: Map<LoadCaseId, Carico[]>;
  /** ordine stabile dei nodi: è quello che definisce la numerazione dei DOF */
  ordineNodi: NodeId[];
  ordineAste: ElementId[];
}

export function costruisciIndice(
  p: Progetto,
  materialiLibreria: Materiale[],
  sezioniLibreria: Sezione[],
): IndiceModello {
  const nodi = new Map<NodeId, Nodo>();
  for (const n of p.nodi) nodi.set(n.id, n);

  const aste = new Map<ElementId, Asta>();
  for (const a of p.aste) aste.set(a.id, a);

  const materiali = new Map<MaterialId, Materiale>();
  for (const mt of [...materialiLibreria, ...p.materialiPersonalizzati]) materiali.set(mt.id, mt);

  const sezioni = new Map<SectionId, Sezione>();
  for (const s of [...sezioniLibreria, ...p.sezioniPersonalizzate]) sezioni.set(s.id, s);

  const asteDelNodo = new Map<NodeId, ElementId[]>();
  for (const n of p.nodi) asteDelNodo.set(n.id, []);
  for (const a of p.aste) {
    asteDelNodo.get(a.nodoIniziale)?.push(a.id);
    asteDelNodo.get(a.nodoFinale)?.push(a.id);
  }

  const carichiDelCaso = new Map<LoadCaseId, Carico[]>();
  for (const c of p.casi) carichiDelCaso.set(c.id, []);
  for (const l of p.carichi) {
    if (!carichiDelCaso.has(l.casoId)) carichiDelCaso.set(l.casoId, []);
    carichiDelCaso.get(l.casoId)!.push(l);
  }

  return {
    nodi, aste, materiali, sezioni, asteDelNodo, carichiDelCaso,
    ordineNodi: p.nodi.map((n) => n.id),
    ordineAste: p.aste.map((a) => a.id),
  };
}

export interface GeometriaAsta {
  L: number;
  /** coseno e seno dell'angolo dell'asse locale x rispetto a x globale */
  c: number;
  s: number;
  angolo: number;
  x1: number; y1: number; x2: number; y2: number;
}

export function geometriaAsta(a: Asta, idx: IndiceModello): GeometriaAsta {
  const ni = idx.nodi.get(a.nodoIniziale);
  const nj = idx.nodi.get(a.nodoFinale);
  if (!ni || !nj) throw new Error(`Asta ${a.id}: nodo non trovato.`);
  const dx = nj.x - ni.x;
  const dy = nj.y - ni.y;
  const L = Math.hypot(dx, dy);
  if (L === 0) throw new Error(`Asta ${a.id}: i due nodi coincidono (lunghezza nulla).`);
  return {
    L, c: dx / L, s: dy / L, angolo: Math.atan2(dy, dx),
    x1: ni.x, y1: ni.y, x2: nj.x, y2: nj.y,
  };
}

export function materialeDi(a: Asta, idx: IndiceModello): Materiale {
  const mt = idx.materiali.get(a.materialeId);
  if (!mt) throw new Error(`Asta ${a.id}: materiale '${a.materialeId}' non trovato.`);
  return mt;
}

export function sezioneDi(a: Asta, idx: IndiceModello): Sezione {
  const s = idx.sezioni.get(a.sezioneId);
  if (!s) throw new Error(`Asta ${a.id}: sezione '${a.sezioneId}' non trovata.`);
  return s;
}

/** Punto sull'asta all'ascissa relativa s ∈ [0,1], in coordinate globali. */
export function puntoSuAsta(g: GeometriaAsta, s: number): { x: number; y: number } {
  return { x: g.x1 + (g.x2 - g.x1) * s, y: g.y1 + (g.y2 - g.y1) * s };
}

/** Ruota un vettore dal riferimento globale a quello locale dell'asta. */
export function globaleALocale(g: GeometriaAsta, vx: number, vy: number): [number, number] {
  return [g.c * vx + g.s * vy, -g.s * vx + g.c * vy];
}

/** Ruota un vettore dal riferimento locale dell'asta a quello globale. */
export function localeAGlobale(g: GeometriaAsta, vx: number, vy: number): [number, number] {
  return [g.c * vx - g.s * vy, g.s * vx + g.c * vy];
}

/** Snellezza L/h: sotto 10 l'ipotesi di Eulero-Bernoulli non è appropriata. */
export function rapportoLuceAltezza(a: Asta, idx: IndiceModello): number {
  const g = geometriaAsta(a, idx);
  const sez = sezioneDi(a, idx);
  return sez.h > 0 ? g.L / sez.h : Infinity;
}

export function usaTimoshenko(a: Asta, idx: IndiceModello): boolean {
  const teoria = a.teoria ?? 'auto';
  if (teoria === 'timoshenko') return true;
  if (teoria === 'eulero-bernoulli') return false;
  return rapportoLuceAltezza(a, idx) < 10;
}

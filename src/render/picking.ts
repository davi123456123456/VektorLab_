/**
 * Selezione per prossimità (picking).
 *
 * Le tolleranze sono in PIXEL: un'asta sottile deve restare afferrabile a
 * qualunque zoom. I nodi hanno priorità sulle aste — a parità di distanza si
 * afferra quasi sempre il nodo, e l'utente che voleva l'asta può cliccare
 * lontano dall'estremità.
 */

import type { ElementId, NodeId, Progetto } from '../core/model/types.js';
import { type Camera, type Punto, mondoASchermo, schermoAMondo } from './camera.js';
import { tolleranza } from './tocco.js';

export type Bersaglio =
  | { tipo: 'nodo'; id: NodeId }
  | { tipo: 'asta'; id: ElementId }
  | null;

/*
 * Tolleranze pensate per il MOUSE. Con un dito vengono moltiplicate — vedi
 * `tolleranza()` — perché dieci pixel sono la metà del raggio di un
 * polpastrello, e senza l'adattamento su un telefono non si seleziona niente.
 */
const TOLL_NODO = 10;
const TOLL_ASTA = 7;

export function colpisci(
  progetto: Progetto, camera: Camera, puntatore: Punto,
): Bersaglio {
  // nodi per primi
  let migliorNodo: { id: NodeId; d: number } | null = null;
  for (const n of progetto.nodi) {
    const s = mondoASchermo(camera, { x: n.x, y: n.y });
    const d = Math.hypot(s.x - puntatore.x, s.y - puntatore.y);
    if (d <= tolleranza(TOLL_NODO) && (!migliorNodo || d < migliorNodo.d)) {
      migliorNodo = { id: n.id, d };
    }
  }
  if (migliorNodo) return { tipo: 'nodo', id: migliorNodo.id };

  const mappa = new Map(progetto.nodi.map((n) => [n.id, n]));
  let migliorAsta: { id: ElementId; d: number } | null = null;
  for (const a of progetto.aste) {
    const ni = mappa.get(a.nodoIniziale);
    const nj = mappa.get(a.nodoFinale);
    if (!ni || !nj) continue;
    const p1 = mondoASchermo(camera, { x: ni.x, y: ni.y });
    const p2 = mondoASchermo(camera, { x: nj.x, y: nj.y });
    const d = distanzaPuntoSegmento(puntatore, p1, p2);
    if (d <= tolleranza(TOLL_ASTA) && (!migliorAsta || d < migliorAsta.d)) {
      migliorAsta = { id: a.id, d };
    }
  }
  if (migliorAsta) return { tipo: 'asta', id: migliorAsta.id };

  return null;
}

/** Selezione a riquadro: tutto ciò che ricade nel rettangolo schermo. */
export function dentroRiquadro(
  progetto: Progetto, camera: Camera, a: Punto, b: Punto,
): { nodi: NodeId[]; aste: ElementId[] } {
  const xmin = Math.min(a.x, b.x), xmax = Math.max(a.x, b.x);
  const ymin = Math.min(a.y, b.y), ymax = Math.max(a.y, b.y);
  const dentro = (p: Punto) => p.x >= xmin && p.x <= xmax && p.y >= ymin && p.y <= ymax;

  const nodi: NodeId[] = [];
  const posizioni = new Map<NodeId, Punto>();
  for (const n of progetto.nodi) {
    const s = mondoASchermo(camera, { x: n.x, y: n.y });
    posizioni.set(n.id, s);
    if (dentro(s)) nodi.push(n.id);
  }
  // un'asta è selezionata quando ENTRAMBI i suoi nodi sono nel riquadro:
  // selezionarla per intersezione parziale renderebbe imprevedibile il
  // trascinamento successivo
  const insieme = new Set(nodi);
  const aste: ElementId[] = [];
  for (const el of progetto.aste) {
    if (insieme.has(el.nodoIniziale) && insieme.has(el.nodoFinale)) aste.push(el.id);
  }
  return { nodi, aste };
}

/**
 * Catena di aste collineari a partire da una data (Alt+click).
 * Si propaga attraverso i nodi in cui convergono esattamente due aste e
 * l'angolo fra le due è entro la tolleranza: è il modo naturale di selezionare
 * "tutto il traverso" o "tutta la colonna" di un telaio discretizzato.
 */
export function catenaCollineare(
  progetto: Progetto, partenza: ElementId, tolleranzaGradi = 1,
): ElementId[] {
  const nodi = new Map(progetto.nodi.map((n) => [n.id, n]));
  const aste = new Map(progetto.aste.map((a) => [a.id, a]));
  const asteDelNodo = new Map<NodeId, ElementId[]>();
  for (const a of progetto.aste) {
    for (const n of [a.nodoIniziale, a.nodoFinale]) {
      if (!asteDelNodo.has(n)) asteDelNodo.set(n, []);
      asteDelNodo.get(n)!.push(a.id);
    }
  }

  const direzione = (id: ElementId): Punto | null => {
    const a = aste.get(id);
    if (!a) return null;
    const ni = nodi.get(a.nodoIniziale), nj = nodi.get(a.nodoFinale);
    if (!ni || !nj) return null;
    const dx = nj.x - ni.x, dy = nj.y - ni.y;
    const L = Math.hypot(dx, dy);
    return L > 0 ? { x: dx / L, y: dy / L } : null;
  };

  const tol = Math.sin((tolleranzaGradi * Math.PI) / 180);
  const risultato = new Set<ElementId>([partenza]);
  const daVisitare: ElementId[] = [partenza];

  while (daVisitare.length > 0) {
    const corrente = daVisitare.pop()!;
    const dCorr = direzione(corrente);
    const a = aste.get(corrente);
    if (!dCorr || !a) continue;

    for (const nodoId of [a.nodoIniziale, a.nodoFinale]) {
      const vicine = asteDelNodo.get(nodoId) ?? [];
      // la catena si interrompe dove il nodo è un incrocio: lì "proseguire
      // dritto" non è più univoco
      if (vicine.length !== 2) continue;
      for (const altra of vicine) {
        if (risultato.has(altra)) continue;
        const dAltra = direzione(altra);
        if (!dAltra) continue;
        const cross = Math.abs(dCorr.x * dAltra.y - dCorr.y * dAltra.x);
        if (cross <= tol) {
          risultato.add(altra);
          daVisitare.push(altra);
        }
      }
    }
  }
  return [...risultato];
}

export function distanzaPuntoSegmento(p: Punto, a: Punto, b: Punto): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}


/**
 * Vincolo o sconnessione posato lungo un'asta più vicino al punto schermo.
 *
 * Ha priorità sulle aste nel raccogliere i click: il simbolo sta SOPRA la
 * linea, e chi ci clicca sopra intende prendere quello, non l'asta sotto.
 */
export function colpisciSuAsta(
  p: Progetto, camera: Camera, punto: Punto, raggio = tolleranza(12),
): { id: string; tipo: 'vincolo' | 'sconnessione'; astaId: ElementId } | null {
  const nodi = new Map(p.nodi.map((n) => [n.id, n]));
  const aste = new Map(p.aste.map((a) => [a.id, a]));
  let migliore: {
    id: string; tipo: 'vincolo' | 'sconnessione'; astaId: ElementId; d: number;
  } | null = null;

  const prova = (
    id: string, tipo: 'vincolo' | 'sconnessione', astaId: ElementId, s: number,
  ) => {
    const a = aste.get(astaId);
    if (!a) return;
    const ni = nodi.get(a.nodoIniziale), nj = nodi.get(a.nodoFinale);
    if (!ni || !nj) return;
    const q = mondoASchermo(camera, {
      x: ni.x + (nj.x - ni.x) * s, y: ni.y + (nj.y - ni.y) * s,
    });
    const d = Math.hypot(q.x - punto.x, q.y - punto.y);
    if (d <= raggio && (!migliore || d < migliore.d)) {
      migliore = { id, tipo, astaId, d };
    }
  };

  for (const v of p.vincoliSuAsta ?? []) prova(v.id, 'vincolo', v.astaId, v.s);
  for (const c of p.sconnessioni ?? []) prova(c.id, 'sconnessione', c.astaId, c.s);
  if (!migliore) return null;
  const m = migliore as { id: string; tipo: 'vincolo' | 'sconnessione'; astaId: ElementId };
  return { id: m.id, tipo: m.tipo, astaId: m.astaId };
}

/** Ascissa relativa del punto schermo proiettato sull'asta. */
export function ascissaSuAsta(
  p: Progetto, camera: Camera, astaId: ElementId, punto: Punto,
): number {
  const a = p.aste.find((x) => x.id === astaId);
  if (!a) return 0;
  const ni = p.nodi.find((n) => n.id === a.nodoIniziale);
  const nj = p.nodi.find((n) => n.id === a.nodoFinale);
  if (!ni || !nj) return 0;
  const mondo = schermoAMondo(camera, punto);
  const dx = nj.x - ni.x, dy = nj.y - ni.y;
  const L2 = dx * dx + dy * dy;
  if (L2 === 0) return 0;
  const t = ((mondo.x - ni.x) * dx + (mondo.y - ni.y) * dy) / L2;
  return Math.min(Math.max(t, 0), 1);
}

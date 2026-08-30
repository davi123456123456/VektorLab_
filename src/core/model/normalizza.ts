/**
 * Normalizzazione del modello: un grafo, non un disegno.
 *
 * IL BUG CHE QUESTO MODULO ESISTE PER IMPEDIRE — due segmenti possono
 * apparire collegati sullo schermo e non esserlo nel modello: stesso punto,
 * due nodi con id diversi, nessuno dei due referenziato da entrambe le aste.
 * L'union-find, che lavora sugli ID, li vede giustamente separati e dichiara
 * due corpi rigidi dove ce n'è uno. Il conteggio non è sbagliato: è sbagliato
 * ciò che gli si dà da contare.
 *
 * Qui si mette in ordine il grafo PRIMA di ogni analisi:
 *
 *   1. i nodi coincidenti entro tolleranza si fondono in uno solo, e tutti i
 *      riferimenti vengono aggiornati;
 *   2. si scartano le aste che referenziano nodi inesistenti o che degenerano
 *      in un punto, segnalandole;
 *   3. si segnalano — senza toccarli — i nodi che GIACCIONO su un'asta senza
 *      esserne un estremo: sono la firma del bug, e vanno mostrati nel
 *      pannello diagnostico. Non si collegano d'ufficio, perché due aste che
 *      si incrociano possono legittimamente passare l'una sopra l'altra.
 *
 * La tolleranza è RELATIVA alla dimensione della struttura: su un modello da
 * 100 m un millimetro è un errore di arrotondamento, su uno da 10 cm no.
 */

import type { Carico, ElementId, NodeId, Progetto } from './types.js';

export interface NodoSospetto {
  nodoId: NodeId;
  astaId: ElementId;
  /** ascissa relativa lungo l'asta */
  s: number;
  distanza: number;
}

export interface EsitoNormalizzazione {
  progetto: Progetto;
  /** nodo eliminato → nodo che lo ha assorbito */
  fusioni: Map<NodeId, NodeId>;
  /** aste rimosse perché degeneri o con riferimenti rotti */
  asteScartate: { astaId: ElementId; motivo: string }[];
  /** nodi appoggiati su un'asta che non li referenzia: il bug, se ce ne sono */
  nodiSuAsta: NodoSospetto[];
  /** true se qualcosa è stato modificato */
  modificato: boolean;
}

/** Dimensione caratteristica: la diagonale del rettangolo che contiene tutto. */
export function dimensioneCaratteristica(p: Progetto): number {
  if (p.nodi.length === 0) return 1;
  let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
  for (const n of p.nodi) {
    xmin = Math.min(xmin, n.x); xmax = Math.max(xmax, n.x);
    ymin = Math.min(ymin, n.y); ymax = Math.max(ymax, n.y);
  }
  const d = Math.hypot(xmax - xmin, ymax - ymin);
  return d > 0 ? d : 1;
}

export function normalizzaModello(
  p: Progetto, tolleranzaRelativa = 1e-6,
): EsitoNormalizzazione {
  const scala = dimensioneCaratteristica(p);
  const toll = scala * tolleranzaRelativa;

  // ── 1. fusione dei nodi coincidenti ──────────────────────────────────
  // Confronto a coppie su una griglia grossolana: senza, su modelli grandi
  // sarebbe O(n²) a ogni modifica.
  const cella = Math.max(toll * 4, scala * 1e-9);
  const secchi = new Map<string, NodeId[]>();
  const chiave = (x: number, y: number) =>
    `${Math.floor(x / cella)}|${Math.floor(y / cella)}`;

  const fusioni = new Map<NodeId, NodeId>();
  const posizione = new Map<NodeId, { x: number; y: number }>();
  for (const n of p.nodi) posizione.set(n.id, { x: n.x, y: n.y });

  for (const n of p.nodi) {
    if (fusioni.has(n.id)) continue;
    let assorbente: NodeId | null = null;
    // si guarda nelle nove celle attorno, perché due punti vicinissimi possono
    // cadere in celle diverse
    for (let dx = -1; dx <= 1 && !assorbente; dx++) {
      for (let dy = -1; dy <= 1 && !assorbente; dy++) {
        const k = chiave(n.x + dx * cella, n.y + dy * cella);
        for (const altro of secchi.get(k) ?? []) {
          const q = posizione.get(altro)!;
          if (Math.hypot(q.x - n.x, q.y - n.y) <= toll) { assorbente = altro; break; }
        }
      }
    }
    if (assorbente) {
      fusioni.set(n.id, assorbente);
    } else {
      const k = chiave(n.x, n.y);
      secchi.set(k, [...(secchi.get(k) ?? []), n.id]);
    }
  }

  const risolvi = (id: NodeId): NodeId => {
    let x = id;
    let guardia = 0;
    while (fusioni.has(x) && guardia++ < 1000) x = fusioni.get(x)!;
    return x;
  };

  // ── 2. aste: riferimenti risolti, degeneri scartate ──────────────────
  const esistenti = new Set<NodeId>(
    p.nodi.filter((n) => !fusioni.has(n.id)).map((n) => n.id),
  );
  const asteScartate: { astaId: ElementId; motivo: string }[] = [];
  const aste = [];
  for (const a of p.aste) {
    const i = risolvi(a.nodoIniziale);
    const j = risolvi(a.nodoFinale);
    if (!esistenti.has(i) || !esistenti.has(j)) {
      asteScartate.push({ astaId: a.id, motivo: 'referenzia un nodo inesistente' });
      continue;
    }
    if (i === j) {
      asteScartate.push({ astaId: a.id, motivo: 'i due estremi coincidono' });
      continue;
    }
    aste.push(i === a.nodoIniziale && j === a.nodoFinale
      ? a : { ...a, nodoIniziale: i, nodoFinale: j });
  }

  const modificato = fusioni.size > 0 || asteScartate.length > 0;
  const nodi = modificato ? p.nodi.filter((n) => !fusioni.has(n.id)) : p.nodi;

  const progetto: Progetto = modificato
    ? {
        ...p, nodi, aste,
        carichi: p.carichi.map((c) => rimappaCarico(c, risolvi)),
        vincoliInterni: (p.vincoliInterni ?? []).map(
          (v) => ({ ...v, nodoId: risolvi(v.nodoId) })),
      }
    : p;

  return {
    progetto, fusioni, asteScartate,
    nodiSuAsta: nodiAppoggiatiSuAsta(progetto, toll),
    modificato,
  };
}

function rimappaCarico(c: Carico, risolvi: (id: NodeId) => NodeId): Carico {
  if (c.tipo === 'forzaNodale' || c.tipo === 'momentoNodale' || c.tipo === 'cedimento') {
    const id = risolvi(c.nodoId);
    return id === c.nodoId ? c : { ...c, nodoId: id };
  }
  return c;
}

/**
 * Nodi che stanno SOPRA un'asta senza esserne un estremo.
 *
 * Non è di per sé un errore — due aste possono incrociarsi passando l'una
 * sopra l'altra, ed è una situazione reale — ma è anche esattamente la forma
 * che assume il bug del collegamento mancato. Si segnala, non si corregge: la
 * differenza fra le due la sa solo chi ha disegnato.
 */
export function nodiAppoggiatiSuAsta(p: Progetto, toll: number): NodoSospetto[] {
  const out: NodoSospetto[] = [];
  const nodi = new Map(p.nodi.map((n) => [n.id, n]));
  for (const a of p.aste) {
    const ni = nodi.get(a.nodoIniziale), nj = nodi.get(a.nodoFinale);
    if (!ni || !nj) continue;
    const vx = nj.x - ni.x, vy = nj.y - ni.y;
    const L2 = vx * vx + vy * vy;
    if (L2 < 1e-18) continue;
    for (const n of p.nodi) {
      if (n.id === a.nodoIniziale || n.id === a.nodoFinale) continue;
      const t = ((n.x - ni.x) * vx + (n.y - ni.y) * vy) / L2;
      if (t <= 1e-9 || t >= 1 - 1e-9) continue;
      const px = ni.x + vx * t, py = ni.y + vy * t;
      const d = Math.hypot(n.x - px, n.y - py);
      if (d <= toll) out.push({ nodoId: n.id, astaId: a.id, s: t, distanza: d });
    }
  }
  return out;
}

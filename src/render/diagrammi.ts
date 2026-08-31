/**
 * Diagrammi delle caratteristiche della sollecitazione.
 *
 * Ogni diagramma si traccia PERPENDICOLARMENTE all'asse della propria asta:
 * su un telaio è l'unico modo per leggere le colonne senza girare la testa, ed
 * è come si disegna a mano.
 *
 * CONVENZIONE DEL MOMENTO — con M > 0 che tende le fibre dal lato −y locale
 * (vedi docs/convenzioni.md), disegnare "dalla parte delle fibre tese"
 * significa riportare M positivo dal lato −y. È la convenzione italiana:
 * il diagramma cade dalla parte che si allunga, quindi mostra a colpo d'occhio
 * dove andrebbe l'armatura in un elemento di calcestruzzo.
 * Il segno è commutabile per chi preferisce la convenzione anglosassone.
 *
 * N e T seguono la convenzione opposta e più diffusa: positivi dal lato +y.
 */

import type { RisultatoAnalisi, RisultatoAsta } from '../core/model/results.js';
import type { ElementId, Progetto } from '../core/model/types.js';
import { type Camera, type Punto, mondoASchermo } from './camera.js';

export type Componente = 'N' | 'T' | 'M';

export interface OpzioniDiagramma {
  progetto: Progetto;
  camera: Camera;
  risultato: RisultatoAnalisi;
  componente: Componente;
  /** metri di ordinata del diagramma per unità di sollecitazione */
  scala: number;
  /** true = M positivo dalla parte delle fibre tese (convenzione italiana) */
  fibreTese: boolean;
  colore: string;
  sfondo: string;
  testo: string;
  mostraValori: boolean;
  /** frazione dell'animazione di tracciamento, in [0,1] */
  avanzamento: number;
}

export function valoriComponente(a: RisultatoAsta, c: Componente): Float64Array {
  return c === 'N' ? a.N : c === 'T' ? a.T : a.M;
}

/** Massimo assoluto della componente su tutta la struttura. */
export function massimoAssoluto(r: RisultatoAnalisi, c: Componente): number {
  let m = 0;
  for (const a of r.aste) {
    const v = valoriComponente(a, c);
    for (let i = 0; i < v.length; i++) m = Math.max(m, Math.abs(v[i]));
  }
  return m;
}

/**
 * Scala automatica: il picco del diagramma occupa una frazione fissa della
 * dimensione del modello, così cambiando struttura o carichi il disegno resta
 * della stessa taglia invece di esplodere o sparire.
 */
export function scalaAutomatica(
  progetto: Progetto, r: RisultatoAnalisi, c: Componente, frazione = 0.13,
): number {
  const massimo = massimoAssoluto(r, c);
  if (massimo === 0) return 0;
  const xs = progetto.nodi.map((n) => n.x);
  const ys = progetto.nodi.map((n) => n.y);
  const diagonale = Math.hypot(
    Math.max(...xs) - Math.min(...xs),
    Math.max(...ys) - Math.min(...ys),
  ) || 1;
  return (frazione * diagonale) / massimo;
}

interface GeometriaAsta { x1: number; y1: number; c: number; s: number }

export function disegnaDiagrammi(
  ctx: CanvasRenderingContext2D, o: OpzioniDiagramma,
): void {
  const nodi = new Map(o.progetto.nodi.map((n) => [n.id, n]));
  const aste = new Map(o.progetto.aste.map((a) => [a.id, a]));
  const massimo = massimoAssoluto(o.risultato, o.componente);
  if (massimo === 0 || o.scala === 0) return;

  // Il momento si riporta dalla parte delle fibre tese: con M>0 che tende le
  // fibre dal lato −y locale, il diagramma va disegnato con il segno invertito
  // rispetto a N e T.
  const verso = o.componente === 'M' && o.fibreTese ? -1 : 1;

  // registro delle quote già scritte, valido per tutta la struttura
  const scritte: { x: number; y: number; testo: string }[] = [];

  for (const risAsta of o.risultato.aste) {
    const g = geometria(risAsta.astaId, aste, nodi);
    if (!g) continue;
    const valori = valoriComponente(risAsta, o.componente);
    const ascisse = risAsta.ascisse;
    const n = Math.max(2, Math.floor(ascisse.length * clamp01(o.avanzamento)));

    const ex = { x: g.c, y: g.s };
    const ey = { x: -g.s, y: g.c };

    const base: Punto[] = [];
    const cima: Punto[] = [];
    for (let i = 0; i < n; i++) {
      const x = ascisse[i];
      const w = { x: g.x1 + ex.x * x, y: g.y1 + ex.y * x };
      const d = verso * valori[i] * o.scala;
      base.push(mondoASchermo(o.camera, w));
      cima.push(mondoASchermo(o.camera, { x: w.x + ey.x * d, y: w.y + ey.y * d }));
    }
    if (base.length < 2) continue;

    // riempimento
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = o.colore;
    ctx.beginPath();
    ctx.moveTo(base[0].x, base[0].y);
    for (const p of cima) ctx.lineTo(p.x, p.y);
    for (let i = base.length - 1; i >= 0; i--) ctx.lineTo(base[i].x, base[i].y);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // contorno
    ctx.save();
    ctx.strokeStyle = o.colore;
    ctx.lineWidth = 1.6;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    cima.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.stroke();
    // chiusure alle estremità
    ctx.beginPath();
    ctx.moveTo(base[0].x, base[0].y); ctx.lineTo(cima[0].x, cima[0].y);
    ctx.moveTo(base[n - 1].x, base[n - 1].y);
    ctx.lineTo(cima[n - 1].x, cima[n - 1].y);
    ctx.stroke();
    ctx.restore();

    if (o.mostraValori && o.avanzamento >= 0.999) {
      etichetteNotevoli(ctx, o, risAsta, g, verso, massimo, scritte);
    }
  }
}

/**
 * Etichette solo sui punti che contano: estremi dell'asta e valori estremi del
 * diagramma. Quotare ogni campione renderebbe illeggibile ciò che si voleva
 * mostrare.
 */
function etichetteNotevoli(
  ctx: CanvasRenderingContext2D, o: OpzioniDiagramma,
  a: RisultatoAsta, g: GeometriaAsta, verso: number, massimo: number,
  /**
   * Etichette già scritte su TUTTA la struttura, in coordinate schermo.
   *
   * La deduplica per ascissa vale dentro una singola asta e non basta: dove
   * due aste si toccano, il valore di fine della prima e quello di inizio
   * della seconda sono lo stesso numero nello stesso punto, e finivano scritti
   * due volte uno sopra l'altro. Da fuori si vedeva un'etichetta sporca, non
   * due etichette.
   */
  scritte: { x: number; y: number; testo: string }[],
): void {
  const ex = { x: g.c, y: g.s };
  const ey = { x: -g.s, y: g.c };
  const soglia = 0.04 * massimo;

  const gia: number[] = [];
  for (const p of a.puntiNotevoli) {
    const valore = o.componente === 'N' ? p.N : o.componente === 'T' ? p.T : p.M;
    if (Math.abs(valore) < soglia) continue;
    // evita di quotare due volte lo stesso punto
    if (gia.some((x) => Math.abs(x - p.x) < a.lunghezza * 0.02)) continue;
    gia.push(p.x);

    const w = { x: g.x1 + ex.x * p.x, y: g.y1 + ex.y * p.x };
    const d = verso * valore * o.scala;
    const q = mondoASchermo(o.camera, { x: w.x + ey.x * d, y: w.y + ey.y * d });

    const unita = o.componente === 'M' ? 'kNm' : 'kN';
    const testo = `${(valore / 1e3).toFixed(1)} ${unita}`;
    // Si confronta il PUNTO DI ANCORAGGIO sull'asse dell'asta, non la
    // posizione dell'etichetta: due aste che si incontrano in un nodo
    // scostano la quota ognuna lungo la propria normale, e le due scritte
    // finiscono a settanta pixel l'una dall'altra pur essendo lo stesso
    // valore nello stesso punto della struttura.
    const ancora = mondoASchermo(o.camera, w);
    if (scritte.some(
      (e) => e.testo === testo && Math.hypot(e.x - ancora.x, e.y - ancora.y) < 12)) {
      continue;
    }
    scritte.push({ x: ancora.x, y: ancora.y, testo });
    ctx.save();
    ctx.font = '10px ui-monospace, SF Mono, Menlo, monospace';
    ctx.textBaseline = 'middle';
    const larghezza = ctx.measureText(testo).width;
    // l'etichetta si sposta dalla parte del diagramma, non sopra l'asta
    const dx = ey.x * Math.sign(d) * 4;
    const dy = -ey.y * Math.sign(d) * 4;
    ctx.globalAlpha = 0.88;
    ctx.fillStyle = o.sfondo;
    ctx.fillRect(q.x + dx - 3, q.y + dy - 7, larghezza + 6, 14);
    ctx.globalAlpha = 1;
    ctx.fillStyle = o.colore;
    ctx.fillText(testo, q.x + dx, q.y + dy);
    ctx.restore();
  }
}

function geometria(
  astaId: ElementId,
  aste: Map<ElementId, { nodoIniziale: string; nodoFinale: string }>,
  nodi: Map<string, { x: number; y: number }>,
): GeometriaAsta | null {
  const a = aste.get(astaId) as { nodoIniziale: string; nodoFinale: string } | undefined;
  if (!a) return null;
  const ni = nodi.get(a.nodoIniziale);
  const nj = nodi.get(a.nodoFinale);
  if (!ni || !nj) return null;
  const dx = nj.x - ni.x, dy = nj.y - ni.y;
  const L = Math.hypot(dx, dy) || 1;
  return { x1: ni.x, y1: ni.y, c: dx / L, s: dy / L };
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

export const ETICHETTA_COMPONENTE: Record<Componente, string> = {
  N: 'Sforzo normale N',
  T: 'Taglio T',
  M: 'Momento flettente M',
};

export const UNITA_COMPONENTE: Record<Componente, string> = {
  N: 'kN', T: 'kN', M: 'kNm',
};

/**
 * Disegno dei carichi.
 *
 * SCALATURA — le frecce hanno lunghezza proporzionale all'intensità, ma
 * normalizzata sul carico MASSIMO del caso corrente: senza normalizzazione una
 * forza da 1000 kN accanto a una da 1 kN renderebbe la seconda invisibile,
 * oppure la prima uscirebbe dallo schermo. La lunghezza è in pixel e non
 * cambia con lo zoom, come le quote di un disegno tecnico.
 *
 * CONVENZIONE DELLA FRECCIA — la punta tocca il punto di applicazione e la
 * coda sta a monte: la freccia "arriva" sul nodo. È la convenzione dei manuali
 * italiani e rende immediato leggere il verso.
 */

import type { Carico, ElementId, NodeId, Progetto } from '../core/model/types.js';
import { type Camera, type Punto, mondoASchermo } from './camera.js';
import { componentiGlobali } from '../core/model/direzioni.js';

export const LUNGHEZZA_FRECCIA = 46;
const LUNGHEZZA_MINIMA = 14;

export interface ScalaCarichi {
  forzaMax: number;
  momentoMax: number;
  distribuitoMax: number;
}

export function calcolaScala(carichi: Carico[]): ScalaCarichi {
  let forzaMax = 0, momentoMax = 0, distribuitoMax = 0;
  for (const c of carichi) {
    switch (c.tipo) {
      case 'forzaNodale':
      case 'forzaInCampata':
        forzaMax = Math.max(forzaMax, Math.hypot(c.fx, c.fy));
        break;
      case 'momentoNodale':
      case 'momentoInCampata':
        momentoMax = Math.max(momentoMax, Math.abs(c.mz));
        break;
      case 'distribuito':
        distribuitoMax = Math.max(distribuitoMax, Math.abs(c.q1), Math.abs(c.q2));
        break;
      default: break;
    }
  }
  return { forzaMax: forzaMax || 1, momentoMax: momentoMax || 1, distribuitoMax: distribuitoMax || 1 };
}

/** Lunghezza in pixel proporzionale all'intensità, con un minimo visibile. */
function lunghezza(valore: number, massimo: number): number {
  const f = Math.abs(valore) / massimo;
  return LUNGHEZZA_MINIMA + (LUNGHEZZA_FRECCIA - LUNGHEZZA_MINIMA) * Math.sqrt(f);
}

function freccia(
  ctx: CanvasRenderingContext2D, punta: Punto, dx: number, dy: number,
  colore: string, spessore = 2,
): void {
  const L = Math.hypot(dx, dy);
  if (L < 1e-6) return;
  const ux = dx / L, uy = dy / L;
  const coda = { x: punta.x - ux * L, y: punta.y - uy * L };

  ctx.save();
  ctx.strokeStyle = colore;
  ctx.fillStyle = colore;
  ctx.lineWidth = spessore;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(coda.x, coda.y);
  ctx.lineTo(punta.x, punta.y);
  ctx.stroke();

  const a = 8, b = 3.4;
  ctx.beginPath();
  ctx.moveTo(punta.x, punta.y);
  ctx.lineTo(punta.x - ux * a - uy * b, punta.y - uy * a + ux * b);
  ctx.lineTo(punta.x - ux * a + uy * b, punta.y - uy * a - ux * b);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** Arco con punta: momento concentrato. Il verso segue il segno (antiorario +). */
function frecciaMomento(
  ctx: CanvasRenderingContext2D, centro: Punto, raggio: number,
  antiorario: boolean, colore: string,
): void {
  ctx.save();
  ctx.strokeStyle = colore;
  ctx.fillStyle = colore;
  ctx.lineWidth = 2;
  const da = -Math.PI * 0.75, a = Math.PI * 0.55;
  ctx.beginPath();
  ctx.arc(centro.x, centro.y, raggio, da, a, false);
  ctx.stroke();

  // punta tangente all'arco all'estremità
  const fine = antiorario ? da : a;
  const px = centro.x + raggio * Math.cos(fine);
  const py = centro.y + raggio * Math.sin(fine);
  // nel canvas y cresce verso il basso: il verso antiorario del mondo
  // corrisponde a quello orario sullo schermo
  const t = antiorario ? 1 : -1;
  const tx = t * Math.sin(fine), ty = -t * Math.cos(fine);
  const A = 8, B = 3.4;
  ctx.beginPath();
  ctx.moveTo(px, py);
  ctx.lineTo(px - tx * A - ty * B, py - ty * A + tx * B);
  ctx.lineTo(px - tx * A + ty * B, py - ty * A - tx * B);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export interface OpzioniCarichi {
  progetto: Progetto;
  camera: Camera;
  carichi: Carico[];
  scala: ScalaCarichi;
  colore: string;
  sfondo: string;
  testo: string;
  /** carico evidenziato dal puntatore */
  evidenziato: string | null;
  mostraValori: boolean;
  /** avanzamento dell'apparizione di ciascun carico, 1 = già presente */
  apparizione?: (id: string) => number;
}

export function disegnaCarichi(ctx: CanvasRenderingContext2D, o: OpzioniCarichi): void {
  const nodi = new Map(o.progetto.nodi.map((n) => [n.id, n]));
  const aste = new Map(o.progetto.aste.map((a) => [a.id, a]));

  for (const c of o.carichi) {
    const acceso = o.evidenziato === (c.id as string);
    const colore = acceso ? '#ffffff' : o.colore;
    // la freccia cresce dalla punta verso la coda: sembra "arrivare" sul nodo
    const nascita = o.apparizione?.(`c:${c.id as string}`) ?? 1;
    if (nascita <= 0) continue;
    ctx.save();
    ctx.globalAlpha *= Math.min(1, nascita * 1.6);
    switch (c.tipo) {
      case 'forzaNodale': {
        const n = nodi.get(c.nodoId);
        if (!n) break;
        disegnaForza(ctx, o, mondoASchermo(o.camera, { x: n.x, y: n.y }),
                     c.fx, c.fy, colore, nascita);
        break;
      }
      case 'momentoNodale': {
        const n = nodi.get(c.nodoId);
        if (!n) break;
        const p = mondoASchermo(o.camera, { x: n.x, y: n.y });
        frecciaMomento(ctx, p, 15 + 7 * Math.sqrt(Math.abs(c.mz) / o.scala.momentoMax),
                       c.mz > 0, colore);
        if (o.mostraValori) {
          etichettaCarico(ctx, o, `${(c.mz / 1e3).toFixed(1)} kNm`, p.x + 20, p.y - 18, colore);
        }
        break;
      }
      case 'forzaInCampata': {
        const g = geometria(c.astaId, aste, nodi);
        if (!g) break;
        const w = { x: g.x1 + (g.x2 - g.x1) * c.s, y: g.y1 + (g.y2 - g.y1) * c.s };
        const [fx, fy] = c.riferimento === 'locale'
          ? ruotaInGlobale(g, c.fx, c.fy) : [c.fx, c.fy];
        disegnaForza(ctx, o, mondoASchermo(o.camera, w), fx, fy, colore, nascita);
        break;
      }
      case 'momentoInCampata': {
        const g = geometria(c.astaId, aste, nodi);
        if (!g) break;
        const w = { x: g.x1 + (g.x2 - g.x1) * c.s, y: g.y1 + (g.y2 - g.y1) * c.s };
        frecciaMomento(ctx, mondoASchermo(o.camera, w), 15, c.mz > 0, colore);
        break;
      }
      case 'distribuito': {
        const g = geometria(c.astaId, aste, nodi);
        if (!g) break;
        disegnaDistribuito(ctx, o, g, c, colore);
        break;
      }
      case 'termico': {
        const g = geometria(c.astaId, aste, nodi);
        if (!g) break;
        const mid = mondoASchermo(o.camera, {
          x: (g.x1 + g.x2) / 2, y: (g.y1 + g.y2) / 2,
        });
        const testo = c.deltaTGradiente !== 0
          ? `ΔT ${c.deltaTUniforme}K  ∇${c.deltaTGradiente}K`
          : `ΔT ${c.deltaTUniforme}K`;
        etichettaCarico(ctx, o, testo, mid.x + 10, mid.y - 14, colore);
        break;
      }
      case 'cedimento': {
        const n = nodi.get(c.nodoId);
        if (!n) break;
        const p = mondoASchermo(o.camera, { x: n.x, y: n.y });
        disegnaCedimento(ctx, o, p, c.ux, c.uy, c.rz, colore);
        break;
      }
    }
    ctx.restore();
  }
}

function disegnaForza(
  ctx: CanvasRenderingContext2D, o: OpzioniCarichi,
  punta: Punto, fx: number, fy: number, colore: string, nascita = 1,
): void {
  const modulo = Math.hypot(fx, fy);
  if (modulo === 0) return;
  const L = lunghezza(modulo, o.scala.forzaMax) * nascita;
  // il canvas ha y verso il basso: una forza verso il basso nel mondo (fy<0)
  // deve puntare verso il basso sullo schermo
  const dx = (fx / modulo) * L;
  const dy = (-fy / modulo) * L;
  freccia(ctx, punta, dx, dy, colore);
  if (o.mostraValori) {
    etichettaCarico(ctx, o, `${(modulo / 1e3).toFixed(1)} kN`,
                    punta.x - dx + 6, punta.y - dy - 6, colore);
  }
}

function disegnaDistribuito(
  ctx: CanvasRenderingContext2D, o: OpzioniCarichi,
  g: Geometria, c: Extract<Carico, { tipo: 'distribuito' }>, colore: string,
): void {
  const n = 9;
  const punti: { base: Punto; cima: Punto }[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const s = c.sIniziale + (c.sFinale - c.sIniziale) * t;
    const w = { x: g.x1 + (g.x2 - g.x1) * s, y: g.y1 + (g.y2 - g.y1) * s };
    const base = mondoASchermo(o.camera, w);
    // le frecce puntano fisicamente nel verso in cui il carico agisce, quindi
    // si lavora in componenti GLOBALI: ruotando l'asta, un carico locale ruota
    // con essa e uno globale no, e il disegno lo deve mostrare
    const q = c.q1 + (c.q2 - c.q1) * t;
    const { qx: gx, qy: gy } = componentiGlobali(q, c.direzione, { c: g.c, s: g.s });
    const modulo = Math.hypot(gx, gy);
    const L = modulo === 0 ? 0 : lunghezza(modulo, o.scala.distribuitoMax);
    const cima = modulo === 0 ? base : {
      x: base.x - (gx / modulo) * L,
      y: base.y + (gy / modulo) * L,
    };
    punti.push({ base, cima });
  }

  // contorno del diagramma di carico
  ctx.save();
  ctx.strokeStyle = colore;
  ctx.globalAlpha = 0.9;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  punti.forEach((p, i) => (i === 0 ? ctx.moveTo(p.cima.x, p.cima.y) : ctx.lineTo(p.cima.x, p.cima.y)));
  ctx.stroke();
  ctx.globalAlpha = 0.12;
  ctx.beginPath();
  ctx.moveTo(punti[0].base.x, punti[0].base.y);
  for (const p of punti) ctx.lineTo(p.cima.x, p.cima.y);
  ctx.lineTo(punti[punti.length - 1].base.x, punti[punti.length - 1].base.y);
  ctx.closePath();
  ctx.fillStyle = colore;
  ctx.fill();
  ctx.restore();

  // frecce a intervalli regolari
  for (let i = 0; i <= n; i += 2) {
    const p = punti[i];
    freccia(ctx, p.base, p.base.x - p.cima.x, p.base.y - p.cima.y, colore, 1.3);
  }

  if (o.mostraValori) {
    const qMax = Math.max(Math.abs(c.q1), Math.abs(c.q2));
    const mid = punti[Math.floor(n / 2)];
    etichettaCarico(ctx, o, `${(qMax / 1e3).toFixed(1)} kN/m`,
                    mid.cima.x + 6, mid.cima.y - 8, colore);
  }
}

/** Il cedimento è uno spostamento IMPOSTO, non una forza: freccia tratteggiata. */
function disegnaCedimento(
  ctx: CanvasRenderingContext2D, o: OpzioniCarichi,
  p: Punto, ux: number, uy: number, rz: number, colore: string,
): void {
  const modulo = Math.hypot(ux, uy);
  ctx.save();
  ctx.setLineDash([4, 3]);
  if (modulo > 0) {
    const L = 34;
    const dx = (ux / modulo) * L;
    const dy = (-uy / modulo) * L;
    freccia(ctx, { x: p.x + dx, y: p.y + dy }, dx, dy, colore, 1.8);
  }
  ctx.restore();
  if (o.mostraValori) {
    const parti: string[] = [];
    if (ux) parti.push(`${(ux * 1000).toFixed(1)}`);
    if (uy) parti.push(`${(uy * 1000).toFixed(1)}`);
    const testo = parti.length ? `δ ${parti.join(', ')} mm` : `θ ${rz.toExponential(1)} rad`;
    etichettaCarico(ctx, o, testo, p.x + 12, p.y + 18, colore);
  }
}

function etichettaCarico(
  ctx: CanvasRenderingContext2D, o: OpzioniCarichi,
  testo: string, x: number, y: number, colore: string,
): void {
  ctx.save();
  ctx.font = '10px ui-monospace, SF Mono, Menlo, monospace';
  ctx.textBaseline = 'middle';
  const w = ctx.measureText(testo).width;
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = o.sfondo;
  ctx.fillRect(x - 2, y - 7, w + 4, 14);
  ctx.globalAlpha = 1;
  ctx.fillStyle = colore;
  ctx.fillText(testo, x, y);
  ctx.restore();
}

// ── geometria di supporto ──────────────────────────────────────────────

interface Geometria { x1: number; y1: number; x2: number; y2: number; c: number; s: number }

function geometria(
  astaId: ElementId,
  aste: Map<ElementId, { nodoIniziale: NodeId; nodoFinale: NodeId }>,
  nodi: Map<NodeId, { x: number; y: number }>,
): Geometria | null {
  const a = aste.get(astaId);
  if (!a) return null;
  const ni = nodi.get(a.nodoIniziale);
  const nj = nodi.get(a.nodoFinale);
  if (!ni || !nj) return null;
  const dx = nj.x - ni.x, dy = nj.y - ni.y;
  const L = Math.hypot(dx, dy) || 1;
  return { x1: ni.x, y1: ni.y, x2: nj.x, y2: nj.y, c: dx / L, s: dy / L };
}

const ruotaInGlobale = (g: Geometria, vx: number, vy: number): [number, number] =>
  [g.c * vx - g.s * vy, g.s * vx + g.c * vy];

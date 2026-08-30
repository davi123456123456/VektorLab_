/**
 * Deformata e reazioni vincolari.
 *
 * La deformata NON è un'interpolazione grafica: `core/post/deflection` ha
 * integrato due volte la curvatura reale χ = M/EI lungo ogni asta, quindi la
 * linea che si disegna qui è la vera elastica, compresi gli effetti dei
 * carichi in campata. L'unica libertà è il fattore di amplificazione, che va
 * sempre dichiarato: una deformata senza il suo «×250» è una figura muta.
 */

import type { RisultatoAnalisi, RisultatoAsta } from '../core/model/results.js';
import type { ElementId, NodeId, Progetto } from '../core/model/types.js';
import { type Camera, type Punto, mondoASchermo } from './camera.js';
import { arcoMomento, etichettaSuSfondo, frecciaPiena } from './frecce.js';

export interface OpzioniDeformata {
  progetto: Progetto;
  camera: Camera;
  risultato: RisultatoAnalisi;
  /** fattore di amplificazione */
  fattore: number;
  /** parametro di carico λ ∈ [0,1]: 0 = indeformata, 1 = deformata piena */
  lambda: number;
  colore: string;
  coloreIndeformata: string;
  mostraIndeformata: boolean;
}

/**
 * Amplificazione automatica: la freccia massima diventa una frazione fissa
 * della dimensione del modello. Su strutture reali gli spostamenti sono
 * millimetrici su luci di metri, quindi senza amplificazione la deformata
 * coinciderebbe con l'indeformata.
 */
export function fattoreAutomatico(
  progetto: Progetto, r: RisultatoAnalisi, frazione = 0.08,
): number {
  if (r.spostamentoMassimo <= 0) return 1;
  const xs = progetto.nodi.map((n) => n.x);
  const ys = progetto.nodi.map((n) => n.y);
  const diagonale = Math.hypot(
    Math.max(...xs) - Math.min(...xs),
    Math.max(...ys) - Math.min(...ys),
  ) || 1;
  const f = (frazione * diagonale) / r.spostamentoMassimo;
  // si arrotonda a un valore "tondo": «×250» si comunica, «×237.4» no
  return arrotondaTondo(f);
}

function arrotondaTondo(v: number): number {
  if (!Number.isFinite(v) || v <= 0) return 1;
  const esponente = Math.floor(Math.log10(v));
  const base = Math.pow(10, esponente);
  const m = v / base;
  const scelta = m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10;
  return scelta * base;
}

interface Geo { x1: number; y1: number; c: number; s: number }

/** Punti dell'asse deformato di un'asta, in coordinate mondo. */
export function asseDeformato(
  a: RisultatoAsta, g: Geo, fattore: number,
): Punto[] {
  const ex = { x: g.c, y: g.s };
  const ey = { x: -g.s, y: g.c };
  const punti: Punto[] = [];
  for (let i = 0; i < a.ascisse.length; i++) {
    const x = a.ascisse[i];
    const u = a.uLocale[i] * fattore;
    const v = a.vLocale[i] * fattore;
    punti.push({
      x: g.x1 + ex.x * (x + u) + ey.x * v,
      y: g.y1 + ex.y * (x + u) + ey.y * v,
    });
  }
  return punti;
}

export function disegnaDeformata(
  ctx: CanvasRenderingContext2D, o: OpzioniDeformata,
): void {
  const nodi = new Map(o.progetto.nodi.map((n) => [n.id, n]));
  const aste = new Map(o.progetto.aste.map((a) => [a.id, a]));
  const fattore = o.fattore * o.lambda;

  if (o.mostraIndeformata) {
    ctx.save();
    ctx.strokeStyle = o.coloreIndeformata;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    for (const a of o.progetto.aste) {
      const ni = nodi.get(a.nodoIniziale), nj = nodi.get(a.nodoFinale);
      if (!ni || !nj) continue;
      const p = mondoASchermo(o.camera, { x: ni.x, y: ni.y });
      const q = mondoASchermo(o.camera, { x: nj.x, y: nj.y });
      ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y);
    }
    ctx.stroke();
    ctx.restore();
  }

  ctx.save();
  ctx.strokeStyle = o.colore;
  ctx.lineWidth = 2.4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const risAsta of o.risultato.aste) {
    const g = geometria(risAsta.astaId, aste, nodi);
    if (!g) continue;
    const punti = asseDeformato(risAsta, g, fattore);
    if (punti.length < 2) continue;
    ctx.beginPath();
    punti.forEach((w, i) => {
      const p = mondoASchermo(o.camera, w);
      if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
    });
    ctx.stroke();
  }

  // nodi spostati
  ctx.fillStyle = o.colore;
  const sp = o.risultato.spostamenti;
  o.progetto.nodi.forEach((n, k) => {
    const p = mondoASchermo(o.camera, {
      x: n.x + sp[3 * k] * fattore,
      y: n.y + sp[3 * k + 1] * fattore,
    });
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
}

// ══════════════════════════════ REAZIONI ══════════════════════════════

export interface OpzioniReazioni {
  progetto: Progetto;
  camera: Camera;
  risultato: RisultatoAnalisi;
  colore: string;
  sfondo: string;
  mostraValori: boolean;
}

export function disegnaReazioni(
  ctx: CanvasRenderingContext2D, o: OpzioniReazioni,
): void {
  const nodi = new Map(o.progetto.nodi.map((n) => [n.id, n]));
  let forzaMax = 0, momentoMax = 0;
  for (const r of o.risultato.reazioni) {
    forzaMax = Math.max(forzaMax, Math.hypot(r.fx, r.fy));
    momentoMax = Math.max(momentoMax, Math.abs(r.mz));
  }
  forzaMax = forzaMax || 1;
  momentoMax = momentoMax || 1;

  for (const r of o.risultato.reazioni) {
    const n = nodi.get(r.nodoId as NodeId);
    if (!n) continue;
    const p = mondoASchermo(o.camera, { x: n.x, y: n.y });
    const modulo = Math.hypot(r.fx, r.fy);

    if (modulo > 1e-9) {
      const L = 18 + 34 * Math.sqrt(modulo / forzaMax);
      // la reazione ESCE dal vincolo verso il nodo: la coda sta sul terreno
      const dx = (r.fx / modulo) * L;
      const dy = (-r.fy / modulo) * L;
      frecciaPiena(ctx, { x: p.x, y: p.y }, dx, dy, o.colore);
      if (o.mostraValori) {
        etichettaSuSfondo(ctx, `${(modulo / 1e3).toFixed(1)} kN`,
                          p.x - dx * 1.15, p.y - dy * 1.15, o.colore, o.sfondo);
      }
    }

    if (Math.abs(r.mz) > 1e-9) {
      const raggio = 13 + 6 * Math.sqrt(Math.abs(r.mz) / momentoMax);
      arcoMomento(ctx, p, raggio, r.mz > 0, o.colore);
      if (o.mostraValori) {
        etichettaSuSfondo(ctx, `${(r.mz / 1e3).toFixed(1)} kNm`,
                          p.x + raggio + 4, p.y + 14, o.colore, o.sfondo);
      }
    }
  }
}

function geometria(
  astaId: ElementId,
  aste: Map<ElementId, { nodoIniziale: NodeId; nodoFinale: NodeId }>,
  nodi: Map<NodeId, { x: number; y: number }>,
): Geo | null {
  const a = aste.get(astaId);
  if (!a) return null;
  const ni = nodi.get(a.nodoIniziale), nj = nodi.get(a.nodoFinale);
  if (!ni || !nj) return null;
  const dx = nj.x - ni.x, dy = nj.y - ni.y;
  const L = Math.hypot(dx, dy) || 1;
  return { x1: ni.x, y1: ni.y, c: dx / L, s: dy / L };
}

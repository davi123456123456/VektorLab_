/**
 * Resa grafica dell'analisi cinematica.
 *
 * PERCHÉ ESISTE — dire a uno studente «la struttura è labile con 1 grado di
 * labilità» è una diagnosi; MOSTRARGLI il cinematismo che si muove e il centro
 * attorno a cui ruota è una spiegazione. Questo modulo disegna esattamente ciò
 * che l'analisi ha calcolato in `core/kinematics`: nessun risultato viene
 * ricalcolato o approssimato qui, si disegna solo.
 *
 * Il moto rigido è INFINITESIMO. Per renderlo visibile lo si amplifica, ma
 * l'ampiezza dell'animazione non ha significato fisico: l'unica informazione
 * esatta è la DIREZIONE del moto e la posizione dei centri.
 */

import type {
  CorpoRigido, Diagnosi, ModoLabile, RisultatoCinematico,
} from '../core/model/results.js';
import type { Progetto } from '../core/model/types.js';
import { type Camera, type Punto, mondoASchermo, vistaMondo } from './camera.js';

export interface OpzioniCinematica {
  progetto: Progetto;
  camera: Camera;
  cinematica: RisultatoCinematico;
  /** indice del meccanismo da mostrare */
  modo: number;
  /** ampiezza dell'animazione, in [-1, 1] */
  fase: number;
  colori: {
    meccanismo: string; centro: string; retta: string; testo: string; sfondo: string;
  };
}

/**
 * Posizione dei nodi nella configurazione spostata dal cinematismo.
 * Ogni nodo segue il corpo rigido a cui appartiene:
 *     u = u_b − φ_b·(y − y_G)      v = v_b + φ_b·(x − x_G)
 */
export function configurazioneMeccanismo(
  progetto: Progetto, cinematica: RisultatoCinematico,
  modo: number, ampiezza: number,
): Map<string, Punto> {
  const out = new Map<string, Punto>();
  const m = cinematica.meccanismi[modo];
  if (!m) return out;

  const corpoDelNodo = new Map<string, CorpoRigido>();
  for (const c of cinematica.corpi) {
    for (const n of c.nodiIds) corpoDelNodo.set(n as string, c);
  }

  for (const nodo of progetto.nodi) {
    const corpo = corpoDelNodo.get(nodo.id as string);
    if (!corpo) { out.set(nodo.id as string, { x: nodo.x, y: nodo.y }); continue; }
    const moto = m.motoPerCorpo[corpo.indice];
    if (!moto) { out.set(nodo.id as string, { x: nodo.x, y: nodo.y }); continue; }
    const dx = moto.ux - moto.phi * (nodo.y - corpo.yG);
    const dy = moto.uy + moto.phi * (nodo.x - corpo.xG);
    out.set(nodo.id as string, { x: nodo.x + ampiezza * dx, y: nodo.y + ampiezza * dy });
  }
  return out;
}

/**
 * Ampiezza che rende il moto visibile ma non deformante: si sceglie in modo
 * che lo spostamento massimo valga una frazione della dimensione del modello.
 */
export function ampiezzaVisibile(
  progetto: Progetto, cinematica: RisultatoCinematico, modo: number,
): number {
  const prova = configurazioneMeccanismo(progetto, cinematica, modo, 1);
  let massimo = 0;
  for (const n of progetto.nodi) {
    const p = prova.get(n.id as string);
    if (!p) continue;
    massimo = Math.max(massimo, Math.hypot(p.x - n.x, p.y - n.y));
  }
  if (massimo === 0) return 0;

  const xs = progetto.nodi.map((n) => n.x);
  const ys = progetto.nodi.map((n) => n.y);
  const diagonale = Math.hypot(
    Math.max(...xs) - Math.min(...xs),
    Math.max(...ys) - Math.min(...ys),
  ) || 1;
  return (0.12 * diagonale) / massimo;
}

export function disegnaCinematica(
  ctx: CanvasRenderingContext2D, o: OpzioniCinematica,
): void {
  const { cinematica, camera, colori } = o;
  if (cinematica.labilita === 0) return;

  const m = cinematica.meccanismi[o.modo];
  if (!m) return;

  const ampiezza = ampiezzaVisibile(o.progetto, cinematica, o.modo) * o.fase;
  const pos = configurazioneMeccanismo(o.progetto, cinematica, o.modo, ampiezza);

  // ── la struttura nella configurazione spostata ──
  ctx.save();
  ctx.strokeStyle = colori.meccanismo;
  ctx.lineWidth = 2.4;
  ctx.lineCap = 'round';
  ctx.globalAlpha = 0.95;
  ctx.beginPath();
  for (const a of o.progetto.aste) {
    const pi = pos.get(a.nodoIniziale as string);
    const pj = pos.get(a.nodoFinale as string);
    if (!pi || !pj) continue;
    const si = mondoASchermo(camera, pi);
    const sj = mondoASchermo(camera, pj);
    ctx.moveTo(si.x, si.y);
    ctx.lineTo(sj.x, sj.y);
  }
  ctx.stroke();
  ctx.restore();

  // ── centri di istantanea rotazione ──
  m.cir.forEach((c, indiceCorpo) => {
    if (c.tipo === 'proprio') {
      disegnaCentro(ctx, o, { x: c.x, y: c.y }, indiceCorpo);
    } else if (c.tipo === 'improprio') {
      disegnaCentroImproprio(ctx, o, cinematica.corpi[indiceCorpo], c.direzione);
    }
  });

  // ── evidenze geometriche della diagnosi ──
  for (const d of cinematica.diagnosi) disegnaEvidenza(ctx, o, d);
}

function disegnaCentro(
  ctx: CanvasRenderingContext2D, o: OpzioniCinematica, w: Punto, indice: number,
): void {
  const p = mondoASchermo(o.camera, w);
  const v = vistaMondo(o.camera);
  const dentro = w.x >= v.xmin && w.x <= v.xmax && w.y >= v.ymin && w.y <= v.ymax;
  if (!dentro) return;   // fuori vista: lo indica il pannello, non il canvas

  ctx.save();
  ctx.strokeStyle = o.colori.centro;
  ctx.fillStyle = o.colori.centro;
  ctx.lineWidth = 1.8;

  // simbolo del centro: cerchio con croce interna
  ctx.beginPath();
  ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(p.x - 12, p.y); ctx.lineTo(p.x + 12, p.y);
  ctx.moveTo(p.x, p.y - 12); ctx.lineTo(p.x, p.y + 12);
  ctx.stroke();

  const etichetta = o.cinematica.corpi.length > 1 ? `C${indice + 1}` : 'C';
  ctx.font = 'bold 11px ui-monospace, monospace';
  ctx.fillStyle = o.colori.sfondo;
  ctx.fillRect(p.x + 11, p.y - 17, ctx.measureText(etichetta).width + 5, 14);
  ctx.fillStyle = o.colori.centro;
  ctx.fillText(etichetta, p.x + 13, p.y - 6);
  ctx.restore();
}

/**
 * Centro improprio: il corpo trasla. Si disegna un fascio di frecce parallele
 * alla direzione del moto, che è perpendicolare alla direzione del centro.
 */
function disegnaCentroImproprio(
  ctx: CanvasRenderingContext2D, o: OpzioniCinematica,
  corpo: CorpoRigido | undefined, direzioneCentro: number,
): void {
  if (!corpo) return;
  const direzioneMoto = direzioneCentro - Math.PI / 2;
  const p = mondoASchermo(o.camera, { x: corpo.xG, y: corpo.yG });
  const dx = Math.cos(direzioneMoto) * 34;
  const dy = -Math.sin(direzioneMoto) * 34;

  ctx.save();
  ctx.strokeStyle = o.colori.centro;
  ctx.fillStyle = o.colori.centro;
  ctx.lineWidth = 1.6;
  ctx.setLineDash([5, 3]);
  for (const off of [-14, 0, 14]) {
    const ox = -dy / 34 * off;
    const oy = dx / 34 * off;
    ctx.beginPath();
    ctx.moveTo(p.x + ox, p.y + oy);
    ctx.lineTo(p.x + ox + dx, p.y + oy + dy);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  const L = Math.hypot(dx, dy);
  const ux = dx / L, uy = dy / L;
  const punta = { x: p.x + dx, y: p.y + dy };
  ctx.beginPath();
  ctx.moveTo(punta.x, punta.y);
  ctx.lineTo(punta.x - ux * 9 - uy * 4, punta.y - uy * 9 + ux * 4);
  ctx.lineTo(punta.x - ux * 9 + uy * 4, punta.y - uy * 9 - ux * 4);
  ctx.closePath();
  ctx.fill();

  ctx.font = 'bold 10px ui-monospace, monospace';
  ctx.fillText('C∞', punta.x + 6, punta.y - 4);
  ctx.restore();
}

/**
 * Evidenze della diagnosi: il punto di concorso delle reazioni, o la direzione
 * comune quando sono parallele. È l'informazione che trasforma «è labile» in
 * «è labile PER QUESTO MOTIVO».
 */
function disegnaEvidenza(
  ctx: CanvasRenderingContext2D, o: OpzioniCinematica, d: Diagnosi,
): void {
  if (!d.evidenza) return;
  ctx.save();
  ctx.strokeStyle = o.colori.retta;
  ctx.fillStyle = o.colori.retta;
  ctx.lineWidth = 1.6;

  if (d.evidenza.tipo === 'punto' && d.codice === 'REAZIONI_CONCORRENTI') {
    const p = mondoASchermo(o.camera, { x: d.evidenza.x, y: d.evidenza.y });
    // le rette d'azione dei vincoli, prolungate fino al punto di concorso
    ctx.setLineDash([6, 4]);
    ctx.globalAlpha = 0.75;
    for (const nodo of o.progetto.nodi) {
      if (!nodo.vincolo || nodo.vincolo.tipo === 'molla') continue;
      const q = mondoASchermo(o.camera, { x: nodo.x, y: nodo.y });
      ctx.beginPath();
      ctx.moveTo(q.x, q.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    ctx.beginPath();
    ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = 'bold 11px ui-monospace, monospace';
    ctx.fillText('P', p.x + 9, p.y - 8);
  }

  if (d.evidenza.tipo === 'retta' && d.codice === 'REAZIONI_PARALLELE') {
    // le rette d'azione parallele, tracciate su tutta la vista
    const v = vistaMondo(o.camera);
    const lung = Math.hypot(v.xmax - v.xmin, v.ymax - v.ymin);
    const dir = d.evidenza.direzione - Math.PI / 2;   // direzione delle reazioni
    ctx.setLineDash([6, 4]);
    ctx.globalAlpha = 0.6;
    for (const nodo of o.progetto.nodi) {
      if (!nodo.vincolo || nodo.vincolo.tipo === 'molla') continue;
      const a = mondoASchermo(o.camera, {
        x: nodo.x - Math.cos(dir) * lung, y: nodo.y - Math.sin(dir) * lung,
      });
      const b = mondoASchermo(o.camera, {
        x: nodo.x + Math.cos(dir) * lung, y: nodo.y + Math.sin(dir) * lung,
      });
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}

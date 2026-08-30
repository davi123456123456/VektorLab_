/**
 * Raccolta dei carichi di un caso e conversione nel riferimento locale
 * dell'asta. Il risultato serve due scopi: il vettore dei termini noti per il
 * solutore, e la descrizione dei carichi di campata per il post-processing,
 * che ricostruisce N(x), T(x), M(x) in forma ANALITICA (non discretizzata).
 */

import type { Carico, ElementId, NodeId } from '../model/types.js';
import type { GeometriaAsta } from '../model/queries.js';
import { globaleALocale } from '../model/queries.js';
import { componentiLocali } from '../model/direzioni.js';
import {
  feqDistribuito, feqForzaInCampata, feqMomentoInCampata, feqTermico,
} from './fixedEnd.js';
import type { Vec6 } from './stiffness.js';

export interface DistribuitoCampata {
  s1: number; s2: number;
  qx1: number; qx2: number;
  qy1: number; qy2: number;
}
export interface ForzaCampata { s: number; fx: number; fy: number }
export interface MomentoCampata { s: number; mz: number }

export interface CarichiCampata {
  distribuiti: DistribuitoCampata[];
  forze: ForzaCampata[];
  momenti: MomentoCampata[];
}

export interface CarichiNodali {
  /** per nodo: [fx, fy, mz] in assi GLOBALI */
  perNodo: Map<NodeId, [number, number, number]>;
  /** cedimenti imposti, in assi GLOBALI */
  cedimenti: Map<NodeId, [number, number, number]>;
}

export interface RaccoltaCarichi {
  campata: Map<ElementId, CarichiCampata>;
  /** f_eq locale già sommato per ciascuna asta (senza il contributo termico
   *  che dipende dalle proprietà, aggiunto in assemblaggio) */
  feqLocale: Map<ElementId, Vec6>;
  termici: Map<ElementId, { uniforme: number; gradiente: number }>;
  nodali: CarichiNodali;
}

export function raccogliCarichi(
  carichi: Carico[],
  geometrie: Map<ElementId, GeometriaAsta>,
): RaccoltaCarichi {
  const campata = new Map<ElementId, CarichiCampata>();
  const feqLocale = new Map<ElementId, Vec6>();
  const termici = new Map<ElementId, { uniforme: number; gradiente: number }>();
  const perNodo = new Map<NodeId, [number, number, number]>();
  const cedimenti = new Map<NodeId, [number, number, number]>();

  const campataDi = (id: ElementId): CarichiCampata => {
    let c = campata.get(id);
    if (!c) { c = { distribuiti: [], forze: [], momenti: [] }; campata.set(id, c); }
    return c;
  };
  const feqDi = (id: ElementId): Vec6 => {
    let f = feqLocale.get(id);
    if (!f) { f = new Float64Array(6); feqLocale.set(id, f); }
    return f;
  };
  const nodoDi = (id: NodeId): [number, number, number] => {
    let v = perNodo.get(id);
    if (!v) { v = [0, 0, 0]; perNodo.set(id, v); }
    return v;
  };

  for (const c of carichi) {
    switch (c.tipo) {
      case 'forzaNodale': {
        const v = nodoDi(c.nodoId);
        v[0] += c.fx; v[1] += c.fy;
        break;
      }
      case 'momentoNodale': {
        const v = nodoDi(c.nodoId);
        v[2] += c.mz;
        break;
      }
      case 'distribuito': {
        const g = geometrie.get(c.astaId);
        if (!g) break;
        // la direzione dichiarata dall'utente diventa componenti locali qui,
        // una volta sola: il resto del nucleo lavora sempre in assi locali
        const a1 = componentiLocali(c.q1, c.direzione, g);
        const a2 = componentiLocali(c.q2, c.direzione, g);
        const qx1 = a1.qx, qy1 = a1.qy, qx2 = a2.qx, qy2 = a2.qy;
        const d: DistribuitoCampata = { s1: c.sIniziale, s2: c.sFinale, qx1, qx2, qy1, qy2 };
        campataDi(c.astaId).distribuiti.push(d);
        const f = feqDistribuito(
          { sIniziale: d.s1, sFinale: d.s2, qxIniziale: qx1, qxFinale: qx2,
            qyIniziale: qy1, qyFinale: qy2 }, g.L);
        const acc = feqDi(c.astaId);
        for (let i = 0; i < 6; i++) acc[i] += f[i];
        break;
      }
      case 'forzaInCampata': {
        const g = geometrie.get(c.astaId);
        if (!g) break;
        const [fx, fy] = c.riferimento === 'locale'
          ? [c.fx, c.fy]
          : globaleALocale(g, c.fx, c.fy);
        campataDi(c.astaId).forze.push({ s: c.s, fx, fy });
        const f = feqForzaInCampata(c.s, fx, fy, g.L);
        const acc = feqDi(c.astaId);
        for (let i = 0; i < 6; i++) acc[i] += f[i];
        break;
      }
      case 'momentoInCampata': {
        const g = geometrie.get(c.astaId);
        if (!g) break;
        campataDi(c.astaId).momenti.push({ s: c.s, mz: c.mz });
        const f = feqMomentoInCampata(c.s, c.mz, g.L);
        const acc = feqDi(c.astaId);
        for (let i = 0; i < 6; i++) acc[i] += f[i];
        break;
      }
      case 'termico': {
        const t = termici.get(c.astaId) ?? { uniforme: 0, gradiente: 0 };
        t.uniforme += c.deltaTUniforme;
        t.gradiente += c.deltaTGradiente;
        termici.set(c.astaId, t);
        break;
      }
      case 'cedimento': {
        const v = cedimenti.get(c.nodoId) ?? [0, 0, 0];
        v[0] += c.ux; v[1] += c.uy; v[2] += c.rz;
        cedimenti.set(c.nodoId, v);
        break;
      }
    }
  }

  return { campata, feqLocale, termici, nodali: { perNodo, cedimenti } };
}

/** Aggiunge il contributo termico, che richiede E, A, I, α, h dell'asta. */
export function aggiungiTermico(
  feq: Vec6,
  t: { uniforme: number; gradiente: number },
  E: number, A: number, I: number, alpha: number, h: number,
): void {
  const f = feqTermico(E, A, I, alpha, h, t.uniforme, t.gradiente);
  for (let i = 0; i < 6; i++) feq[i] += f[i];
}

/**
 * TRADUZIONE del grafo misurato in un `Progetto` di VektorLab.
 *
 * Qui nascono i MEMBRI. Il grafo ha tratti fra punti notevoli; un'asta di
 * VektorLab è un pezzo rettilineo fra due NODI, e un punto diventa nodo solo
 * se serve: un estremo, uno spigolo, un incrocio, una sconnessione. Un
 * appoggio a metà di una trave continua non è un nodo — l'asta resta una,
 * come l'ha disegnata l'autore dell'esercizio — e diventa un vincolo su asta.
 *
 * Unità: L = 1 m, q = 1 kN/m, F = 1 kN, M = 1 kN·m, moltiplicati per il
 * coefficiente letto.
 */

import { progetto as nuovoProgetto } from '../core/builder.js';
import { verificaIntegrita } from '../core/model/integrita.js';
import { migra } from '../core/model/migrazione.js';
import type { ElementId, NodeId, Progetto } from '../core/model/types.js';
import { angoloDi, differenzaAngoli, distanza } from './geometria.js';
import type { Avviso, Grafo, Punto, TrattoGrafo } from './tipi.js';

const MATERIALE = 'S275';
const SEZIONE = 'IPE 300';
const KILO = 1000;
const GRADI = Math.PI / 180;

export function traduci(g: Grafo): { progetto: Progetto; avvisi: Avviso[] } {
  const avvisi = [...g.avvisi];
  const b = nuovoProgetto('Da foto');
  if (g.tratti.length === 0) {
    avvisi.push({ codice: 'nessunaAsta', messaggio: 'Nella foto non ho trovato nessuna asta.' });
    return { progetto: migra(b.costruisci()), avvisi };
  }

  const pos = (id: string): Punto => {
    const q = g.punti.find((x) => x.id === id)!;
    return q.pos ?? q.px;
  };
  const incidenti = new Map<string, TrattoGrafo[]>();
  for (const t of g.tratti) {
    for (const id of [t.i, t.j]) incidenti.set(id, [...(incidenti.get(id) ?? []), t]);
  }
  const conGiunto = new Set(g.giunti.map((x) => x.punto));
  const altro = (t: TrattoGrafo, id: string): string => (t.i === id ? t.j : t.i);
  const eNodo = (id: string): boolean => {
    const att = incidenti.get(id) ?? [];
    if (att.length !== 2 || conGiunto.has(id)) return true;
    const c = pos(id);
    return differenzaAngoli(angoloDi(c, pos(altro(att[0], id))), angoloDi(c, pos(altro(att[1], id))))
      < 178 * GRADI;
  };

  // ── nodi ──
  const nodo = new Map<string, NodeId>();
  for (const q of g.punti) {
    if (!incidenti.has(q.id) || !eNodo(q.id)) continue;
    const p = pos(q.id);
    nodo.set(q.id, b.nodo(p.x, p.y));
  }

  // ── aste: catene di tratti fra due nodi; i punti di mezzo diventano ascisse ──
  const astaDiTratto = new Map<string, ElementId>();
  const suAsta = new Map<string, { asta: ElementId; s: number }>();
  const estremiAsta = new Map<ElementId, [Punto, Punto]>();
  const visitati = new Set<string>();
  for (const [inizio] of nodo) {
    for (const t0 of incidenti.get(inizio)!) {
      if (visitati.has(t0.id)) continue;
      const catena = [inizio];
      const tratti = [t0];
      visitati.add(t0.id);
      let corrente = altro(t0, inizio);
      while (!nodo.has(corrente)) {
        catena.push(corrente);
        const avanti = incidenti.get(corrente)!.find((t) => !visitati.has(t.id));
        if (!avanti) break;
        visitati.add(avanti.id);
        tratti.push(avanti);
        corrente = altro(avanti, corrente);
      }
      if (!nodo.has(corrente)) continue;
      const asta = b.asta(nodo.get(inizio)!, nodo.get(corrente)!, MATERIALE, SEZIONE);
      const [pi, pj] = [pos(inizio), pos(corrente)];
      estremiAsta.set(asta, [pi, pj]);
      const totale = distanza(pi, pj);
      for (const t of tratti) astaDiTratto.set(t.id, asta);
      for (const id of catena.slice(1)) suAsta.set(id, { asta, s: distanza(pi, pos(id)) / totale });
    }
  }

  // ── vincoli ──
  for (const v of g.vincoli) {
    const n = nodo.get(v.punto);
    if (n) { b.vincolo(n, v.tipo, v.angolo); continue; }
    const x = suAsta.get(v.punto);
    if (x) b.vincoloSuAsta(x.asta, x.s, v.tipo, v.angolo);
  }

  // ── sconnessioni ──
  for (const gj of g.giunti) {
    const n = nodo.get(gj.punto);
    if (!n) continue;
    const gruppi = gj.gruppi
      .map((gr) => [...new Set(gr.map((t) => astaDiTratto.get(t)).filter((a): a is ElementId => !!a))])
      .filter((gr) => gr.length > 0);
    if (gruppi.length < 2) continue;
    const grandi = gruppi.filter((gr) => gr.length >= 2);
    if (grandi.length === 0) {
      b.sconnessioneNodale(n, gj.tipo);
    } else if (grandi.length === 1) {
      b.sconnessioneNodale(n, gj.tipo, {
        astaMaster: grandi[0][0],
        asteSvincolate: gruppi.filter((gr) => gr.length === 1).flat(),
      });
    } else {
      avvisi.push({
        codice: 'partizioneNonRappresentabile', punti: [gj.punto],
        messaggio: 'Sconnessione fra gruppi di più aste: messa su tutte le aste del nodo.',
      });
      b.sconnessioneNodale(n, gj.tipo);
    }
  }

  // ── carichi ──
  for (const c of g.carichi) {
    if (c.tipo === 'distribuito') {
      const [da, a] = [pos(c.da), pos(c.a)];
      const { modo, alpha, q } = direzioneDistribuito(c.direzione, c.coefficiente * KILO);
      for (const [asta, [pi, pj]] of estremiAsta) {
        const tratto = intervalloSu(pi, pj, da, a);
        if (!tratto) continue;
        b.distribuito(asta, q, { s1: tratto[0], s2: tratto[1], modo, ...(alpha !== undefined ? { alpha } : {}) });
      }
      continue;
    }
    if (c.tipo === 'forza') {
      const fx = pulito(c.coefficiente * KILO * Math.cos(c.direzione));
      const fy = pulito(c.coefficiente * KILO * Math.sin(c.direzione));
      const n = nodo.get(c.punto);
      if (n) b.forza(n, fx, fy);
      else if (suAsta.has(c.punto)) {
        const x = suAsta.get(c.punto)!;
        b.forzaInCampata(x.asta, x.s, fx, fy, 'globale');
      }
      continue;
    }
    const mz = c.verso * c.coefficiente * KILO;
    const n = nodo.get(c.punto);
    if (n) b.momento(n, mz);
    else if (suAsta.has(c.punto)) {
      const x = suAsta.get(c.punto)!;
      b.momentoInCampata(x.asta, x.s, mz);
    }
  }

  const esito = verificaIntegrita(migra(b.costruisci()));
  for (const a of esito.anomalie) avvisi.push({ codice: 'integrita', messaggio: a.messaggio });
  return { progetto: esito.progetto, avvisi };
}

/** Assi globali quando la direzione è orizzontale o verticale, angolo assoluto altrimenti. */
function direzioneDistribuito(direzione: number, intensita: number): {
  modo: 'globaleX' | 'globaleY' | 'angolo'; alpha?: number; q: number;
} {
  const gradi = Math.round(direzione / GRADI);
  const norm = ((gradi % 360) + 360) % 360;
  const esatto = Math.abs(direzione / GRADI - gradi) < 1e-6;
  if (esatto && norm === 90) return { modo: 'globaleY', q: intensita };
  if (esatto && norm === 270) return { modo: 'globaleY', q: -intensita };
  if (esatto && norm === 0) return { modo: 'globaleX', q: intensita };
  if (esatto && norm === 180) return { modo: 'globaleX', q: -intensita };
  return { modo: 'angolo', alpha: direzione, q: intensita };
}

/**
 * Parte dell'asta pi–pj coperta dal tratto da–a, in ascisse relative, se
 * il tratto sta sulla sua retta e la copre per una lunghezza non nulla.
 */
function intervalloSu(pi: Punto, pj: Punto, da: Punto, a: Punto): [number, number] | null {
  const l = distanza(pi, pj);
  const sulla = (q: Punto): boolean =>
    Math.abs((q.x - pi.x) * (pj.y - pi.y) - (q.y - pi.y) * (pj.x - pi.x)) / l < 1e-6;
  if (!sulla(da) || !sulla(a)) return null;
  const s = (q: Punto): number => ((q.x - pi.x) * (pj.x - pi.x) + (q.y - pi.y) * (pj.y - pi.y)) / (l * l);
  const s1 = Math.max(0, Math.min(s(da), s(a)));
  const s2 = Math.min(1, Math.max(s(da), s(a)));
  return s2 - s1 > 1e-9 ? [s1, s2] : null;
}

function pulito(v: number): number {
  return Math.abs(v) < 1e-9 ? 0 : v;
}

/**
 * METRICA — dalle quote lette alle posizioni in unità di L.
 *
 * Le quote degli esercizi misurano TRATTI: la distanza fra due punti
 * notevoli consecutivi (un appoggio e il successivo, uno spigolo e una
 * cerniera), quasi mai la lunghezza di un membro. Le lunghezze dei membri si
 * ottengono dopo, sommando i tratti.
 *
 * Il problema si risolve per assi. I punti che stanno sulla stessa verticale
 * formano una COLONNA, quelli sulla stessa orizzontale una RIGA: una quota
 * orizzontale fissa la distanza fra due colonne, una verticale fra due
 * righe. Le colonne senza quota si misurano in proporzione, con la scala
 * stimata sulle quote lette. Tutto entra in un unico sistema ai minimi
 * quadrati, dove le quote pesano cento volte più delle proporzioni: così un
 * disegno storto cede alle quote, e le quote incoerenti si vedono dai
 * residui invece di produrre un modello assurdo in silenzio.
 */

import { risolviLU } from '../core/linalg/lu.js';
import {
  agganciaAngolo, angoloDi, differenzaAngoli, distanza, mediana, proiezione, raggruppa1D,
} from './geometria.js';
import type { Tolleranze } from './parametri.js';
import type { Grafo, Primitive, Punto, QuotaGrafo } from './tipi.js';

const GRADI = Math.PI / 180;
const PESO_QUOTA = 100;
const PESO_PROPORZIONE = 1;
const PESO_45 = 10;
const PESO_ASSE = 10;
const PESO_ANCORA = 1000;

/** Ogni quota letta diventa un tratto fra due punti del grafo. */
export function associaQuote(g: Grafo, p: Primitive, tol: Tolleranze): void {
  for (const s of p.scritte) {
    if (s.valore.famiglia !== 'L') continue;
    const valore = s.valore.valore;
    const scarta = (): void => {
      g.avvisi.push({ codice: 'quotaNonLetta', messaggio: `Quota ${formatta(valore)} non agganciata allo schema.` });
    };
    if (!s.estremi) { scarta(); continue; }
    const [e1, e2] = s.estremi;
    const dx = Math.abs(e2.x - e1.x);
    const dy = Math.abs(e2.y - e1.y);
    const direzione: QuotaGrafo['direzione'] = dx > 3 * dy ? 'x' : dy > 3 * dx ? 'y' : 'asta';
    const scegli = (e: Punto): string | null => {
      let migliore: string | null = null;
      let dMin = direzione === 'asta' ? 2 * tol.tauColonne : tol.tauColonne;
      for (const q of g.punti) {
        const d = direzione === 'x' ? Math.abs(q.px.x - e.x)
          : direzione === 'y' ? Math.abs(q.px.y - e.y) : distanza(q.px, e);
        if (d < dMin) { dMin = d; migliore = q.id; }
      }
      return migliore;
    };
    const da = scegli(e1);
    const a = scegli(e2);
    if (!da || !a || da === a) { scarta(); continue; }
    g.quote.push({ da, a, valore, direzione });
  }
}

interface Equazione { termini: [number, number][]; b: number; peso: number; quota?: QuotaGrafo }

/** Assegna `pos` (in L) a tutti i punti del grafo. */
export function misura(g: Grafo, tol: Tolleranze): void {
  if (g.punti.length === 0) return;
  const indice = new Map(g.punti.map((q, i) => [q.id, i]));
  const col = raggruppa1D(g.punti.map((q) => q.px.x), tol.tauColonne);
  const rig = raggruppa1D(g.punti.map((q) => q.px.y), tol.tauColonne);
  const nc = Math.max(...col) + 1;
  const nr = Math.max(...rig) + 1;
  const pxCol = medie(col, nc, g.punti.map((q) => q.px.x));
  const pxRig = medie(rig, nr, g.punti.map((q) => q.px.y));
  const X = (c: number): number => c;
  const Y = (r: number): number => nc + r;
  const pxDi = (id: string): Punto => g.punti[indice.get(id)!].px;

  // ── scala: pixel per L ──
  const lunghezzaPx = (q: QuotaGrafo): number => {
    const ia = indice.get(q.da)!;
    const ib = indice.get(q.a)!;
    if (q.direzione === 'x') return Math.abs(pxCol[col[ib]] - pxCol[col[ia]]);
    if (q.direzione === 'y') return Math.abs(pxRig[rig[ib]] - pxRig[rig[ia]]);
    return distanza(pxDi(q.da), pxDi(q.a));
  };
  // una quota i cui capi cadono nella stessa colonna (o riga) non misura
  // niente: in una foto storta capita a una quota corta. Si scarta
  for (const q of g.quote.filter((x) => lunghezzaPx(x) < tol.tau)) {
    g.avvisi.push({ codice: 'quotaNonLetta', messaggio: `Quota ${formatta(q.valore)} di lunghezza nulla: scartata.` });
  }
  g.quote = g.quote.filter((x) => lunghezzaPx(x) >= tol.tau);
  let scala: number;
  if (g.quote.length > 0) {
    scala = mediana(g.quote.map((q) => lunghezzaPx(q) / q.valore));
  } else {
    scala = medianaInferiore(campate(g));
    g.avvisi.push({
      codice: 'nessunaQuota',
      messaggio: 'Nessuna quota letta: la campata tipica vale L, le altre in proporzione.',
    });
  }

  if (!Number.isFinite(scala) || scala <= 0) scala = 1;

  const equazioni: Equazione[] = [];
  const esentiX = new Set<number>();
  const esentiY = new Set<number>();

  // ── quote ──
  for (const q of g.quote) {
    const ia = indice.get(q.da)!;
    const ib = indice.get(q.a)!;
    const [ca, cb, ra, rb] = [col[ia], col[ib], rig[ia], rig[ib]];
    if (q.direzione === 'x') {
      const segno = Math.sign(pxCol[cb] - pxCol[ca]) || 1;
      equazioni.push({ termini: [[X(cb), 1], [X(ca), -1]], b: segno * q.valore, peso: PESO_QUOTA, quota: q });
    } else if (q.direzione === 'y') {
      const segno = Math.sign(pxRig[rb] - pxRig[ra]) || 1;
      equazioni.push({ termini: [[Y(rb), 1], [Y(ra), -1]], b: segno * q.valore, peso: PESO_QUOTA, quota: q });
    } else {
      const theta = agganciaAngolo(angoloDi(pxDi(q.da), pxDi(q.a)), 45 * GRADI, 7 * GRADI);
      const [cx, sy] = [Math.cos(theta), Math.sin(theta)];
      if (ca !== cb) equazioni.push({ termini: [[X(cb), 1], [X(ca), -1]], b: q.valore * cx, peso: PESO_QUOTA, quota: q });
      if (ra !== rb) equazioni.push({ termini: [[Y(rb), 1], [Y(ra), -1]], b: q.valore * sy, peso: PESO_QUOTA, quota: q });
      // un'asta inclinata quotata lungo di sé non cade sulla griglia di L/2
      if (Math.abs(cx * sy) > 1e-9) { esentiX.add(ca); esentiX.add(cb); esentiY.add(ra); esentiY.add(rb); }
    }
  }

  // ── proporzioni fra colonne e fra righe consecutive ──
  for (let c = 0; c + 1 < nc; c++) {
    equazioni.push({ termini: [[X(c + 1), 1], [X(c), -1]], b: (pxCol[c + 1] - pxCol[c]) / scala, peso: PESO_PROPORZIONE });
  }
  for (let r = 0; r + 1 < nr; r++) {
    equazioni.push({ termini: [[Y(r + 1), 1], [Y(r), -1]], b: (pxRig[r + 1] - pxRig[r]) / scala, peso: PESO_PROPORZIONE });
  }

  // ── aste quasi orizzontali o verticali: lo sono davvero. Senza questa
  // equazione una trave lunga in una foto storta di qualche grado scavalca
  // mezza riga e si arrotonda inclinata ──
  for (const t of g.tratti) {
    const [ia, ib] = [indice.get(t.i)!, indice.get(t.j)!];
    const ang = angoloDi(g.punti[ia].px, g.punti[ib].px);
    const orizzontale = differenzaAngoli(ang * 2, 0) / 2 <= 7 * GRADI;
    const verticale = differenzaAngoli(ang * 2, Math.PI) / 2 <= 7 * GRADI;
    if (orizzontale && rig[ia] !== rig[ib]) {
      equazioni.push({ termini: [[Y(rig[ib]), 1], [Y(rig[ia]), -1]], b: 0, peso: PESO_ASSE });
    }
    if (verticale && col[ia] !== col[ib]) {
      equazioni.push({ termini: [[X(col[ib]), 1], [X(col[ia]), -1]], b: 0, peso: PESO_ASSE });
    }
  }

  // ── aste quasi a 45°: ΔX = ±ΔY ──
  for (const t of g.tratti) {
    const [ia, ib] = [indice.get(t.i)!, indice.get(t.j)!];
    const a = g.punti[ia].px;
    const b = g.punti[ib].px;
    const ang = angoloDi(a, b);
    const diagonale = [45, 135].some((v) => differenzaAngoli(ang * 2, v * 2 * GRADI) / 2 <= 7 * GRADI);
    if (!diagonale || col[ia] === col[ib] || rig[ia] === rig[ib]) continue;
    const segno = Math.sign((b.x - a.x) * (b.y - a.y));
    equazioni.push({
      termini: [[X(col[ib]), 1], [X(col[ia]), -1], [Y(rig[ib]), -segno], [Y(rig[ia]), segno]],
      b: 0, peso: PESO_45,
    });
  }

  // ── ancoraggio dell'origine ──
  equazioni.push({ termini: [[X(0), 1]], b: 0, peso: PESO_ANCORA });
  equazioni.push({ termini: [[Y(0), 1]], b: 0, peso: PESO_ANCORA });

  const soluzione = risolviMinimiQuadrati(equazioni, nc + nr);

  // ── griglia: L/2, o più fine se una quota lo chiede ──
  const passo = 1 / g.quote.reduce((m, q) => mcm(m, denominatore(q.valore)), 2);
  const Xr = arrotonda(soluzione.slice(0, nc), passo, esentiX);
  const Yr = arrotonda(soluzione.slice(nc), passo, esentiY);
  g.punti.forEach((q, i) => { q.pos = { x: Xr[col[i]], y: Yr[rig[i]] }; });

  riproietta(g);

  // ── quote incoerenti: si misurano sul risultato finale, arrotondamento
  // compreso, così si vede anche una quota che la griglia ha tradito ──
  const posDi = (id: string): Punto => g.punti[indice.get(id)!].pos!;
  for (const q of g.quote) {
    const a = posDi(q.da);
    const b = posDi(q.a);
    const misurata = q.direzione === 'x' ? Math.abs(b.x - a.x)
      : q.direzione === 'y' ? Math.abs(b.y - a.y) : distanza(a, b);
    if (Math.abs(misurata - q.valore) > 0.1 * q.valore) {
      g.avvisi.push({
        codice: 'quoteIncoerenti', punti: [q.da, q.a],
        messaggio: `La quota ${formatta(q.valore)} non torna con le altre.`,
      });
    }
  }

  fondiCoincidenti(g);
}

/**
 * Due punti che l'arrotondamento porta nello stesso posto sono lo stesso
 * punto: un carico rilevato poco lontano da un nodo, un estremo tremolante.
 * Si fondono, e il tratto di lunghezza zero che li univa sparisce — altrimenti
 * diventerebbe un'asta lunga zero e due nodi sovrapposti.
 */
function fondiCoincidenti(g: Grafo): void {
  const rappresentante = new Map<string, string>();
  for (let i = 0; i < g.punti.length; i++) {
    if (rappresentante.has(g.punti[i].id)) continue;
    for (let j = i + 1; j < g.punti.length; j++) {
      const [a, b] = [g.punti[i].pos!, g.punti[j].pos!];
      if (Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9) rappresentante.set(g.punti[j].id, g.punti[i].id);
    }
  }
  if (rappresentante.size === 0) return;
  const r = (id: string): string => rappresentante.get(id) ?? id;

  const sostituto = new Map<string, string>();
  const tratti: Grafo['tratti'] = [];
  for (const t of g.tratti) {
    const [i, j] = [r(t.i), r(t.j)];
    if (i === j) continue;
    const doppio = tratti.find((x) => (x.i === i && x.j === j) || (x.i === j && x.j === i));
    if (doppio) { sostituto.set(t.id, doppio.id); continue; }
    tratti.push({ ...t, i, j });
  }
  g.tratti = tratti;
  const vivi = new Set(tratti.map((t) => t.id));
  const tratto = (id: string): string | null => {
    const x = sostituto.get(id) ?? id;
    return vivi.has(x) ? x : null;
  };

  const giunti: Grafo['giunti'] = [];
  for (const gj of g.giunti) {
    const punto = r(gj.punto);
    if (giunti.some((x) => x.punto === punto)) continue;
    const gruppi = gj.gruppi
      .map((gr) => [...new Set(gr.map(tratto).filter((x): x is string => x !== null))])
      .filter((gr) => gr.length > 0);
    if (gruppi.length >= 2) giunti.push({ ...gj, punto, gruppi });
  }
  g.giunti = giunti;
  g.vincoli = g.vincoli.map((v) => ({ ...v, punto: r(v.punto) }))
    .filter((v, k, tutti) => tutti.findIndex((x) => x.punto === v.punto) === k);
  g.carichi = g.carichi
    .map((c) => (c.tipo === 'distribuito' ? { ...c, da: r(c.da), a: r(c.a) } : { ...c, punto: r(c.punto) }))
    .filter((c) => c.tipo !== 'distribuito' || c.da !== c.a);
  g.quote = g.quote.map((q) => ({ ...q, da: r(q.da), a: r(q.a) })).filter((q) => q.da !== q.a);
  g.punti = g.punti.filter((p) => !rappresentante.has(p.id));
}

// ──────────────────────────── aiuti ────────────────────────────

function risolviMinimiQuadrati(equazioni: readonly Equazione[], n: number): number[] {
  const N = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  const r = new Array<number>(n).fill(0);
  for (const e of equazioni) {
    for (const [i, ai] of e.termini) {
      r[i] += e.peso * ai * e.b;
      for (const [j, aj] of e.termini) N[i][j] += e.peso * ai * aj;
    }
  }
  const esito = risolviLU(N, r);
  if (!esito.x) throw new Error('Sistema delle posizioni singolare.');
  return Array.from(esito.x);
}

function medie(gruppo: readonly number[], n: number, valori: readonly number[]): number[] {
  const somma = new Array<number>(n).fill(0);
  const conta = new Array<number>(n).fill(0);
  gruppo.forEach((k, i) => { somma[k] += valori[i]; conta[k]++; });
  return somma.map((s, k) => s / conta[k]);
}

/**
 * Arrotonda al passo, tranne le coordinate esenti. Due colonne (o righe) che
 * finiscono sullo stesso valore sono la stessa: in una foto un po' storta la
 * verticale di un telaio si spezza in due colonne vicine, e l'arrotondamento
 * è proprio ciò che le riunisce.
 */
function arrotonda(v: readonly number[], passo: number, esenti: ReadonlySet<number>): number[] {
  // una coordinata esente (asta inclinata quotata lungo di sé) non sta sulla
  // griglia: le altre si arrotondano per DISTANZA dalla esente più vicina,
  // altrimenti l'asta che la segue erediterebbe il suo resto irrazionale
  const riferimenti = [...esenti];
  return v.map((x, i) => {
    if (esenti.has(i)) return x;
    if (riferimenti.length === 0) return Math.round(x / passo) * passo;
    const r = riferimenti.reduce((m, j) => (Math.abs(v[j] - x) < Math.abs(v[m] - x) ? j : m));
    return v[r] + Math.round((x - v[r]) / passo) * passo;
  });
}

/**
 * Lunghezze in pixel delle CAMPATE: tratti allineati uniti fino al primo
 * punto che porta qualcosa (vincolo, giunto, spigolo, incrocio). Senza
 * quote, una L è la luce tipica fra due appoggi.
 */
function campate(g: Grafo): number[] {
  const padre = g.tratti.map((_, i) => i);
  const trova = (i: number): number => (padre[i] === i ? i : (padre[i] = trova(padre[i])));
  const vincolati = new Set([...g.vincoli.map((v) => v.punto), ...g.giunti.map((x) => x.punto)]);
  for (const q of g.punti) {
    if (vincolati.has(q.id)) continue;
    const att = g.tratti.map((t, i) => ({ t, i })).filter(({ t }) => t.i === q.id || t.j === q.id);
    if (att.length !== 2 || !allineati(g, q.id, att[0].t, att[1].t)) continue;
    padre[trova(att[0].i)] = trova(att[1].i);
  }
  const lunghezze = new Map<number, number>();
  g.tratti.forEach((t, i) => {
    const l = distanza(pxDi(g, t.i), pxDi(g, t.j));
    lunghezze.set(trova(i), (lunghezze.get(trova(i)) ?? 0) + l);
  });
  return [...lunghezze.values()];
}

/** Riporta sulla propria retta i punti intermedi delle aste inclinate. */
function riproietta(g: Grafo): void {
  const incidenti = (id: string) => g.tratti.filter((t) => t.i === id || t.j === id);
  const intermedio = (id: string): boolean => {
    const att = incidenti(id);
    return att.length === 2 && allineati(g, id, att[0], att[1]);
  };
  const capo = (da: string, verso: { i: string; j: string }): string => {
    let prec = da;
    let corr = verso.i === da ? verso.j : verso.i;
    for (let passi = 0; passi < g.punti.length && intermedio(corr); passi++) {
      const avanti = incidenti(corr).find((t) => (t.i === corr ? t.j : t.i) !== prec);
      if (!avanti) break;
      prec = corr;
      corr = avanti.i === corr ? avanti.j : avanti.i;
    }
    return corr;
  };
  for (const q of g.punti) {
    if (!intermedio(q.id)) continue;
    const [t1, t2] = incidenti(q.id);
    const A = g.punti.find((x) => x.id === capo(q.id, t1))!;
    const B = g.punti.find((x) => x.id === capo(q.id, t2))!;
    const dX = B.pos!.x - A.pos!.x;
    const dY = B.pos!.y - A.pos!.y;
    if (Math.abs(dX) < 1e-9 || Math.abs(dY) < 1e-9) continue;
    // se l'arrotondamento l'ha già messo sulla retta, quella posizione è
    // esatta; ricavarla dai pixel porterebbe l'errore di qualche decimo di
    // pixel dei nodi vicini ai simboli
    const fuori = Math.abs((q.pos!.x - A.pos!.x) * dY - (q.pos!.y - A.pos!.y) * dX) / Math.hypot(dX, dY);
    if (fuori < 1e-9) continue;
    const { t } = proiezione(q.px, A.px, B.px);
    q.pos = { x: A.pos!.x + t * dX, y: A.pos!.y + t * dY };
  }
}

function allineati(g: Grafo, id: string, t1: { i: string; j: string }, t2: { i: string; j: string }): boolean {
  const c = pxDi(g, id);
  const a = pxDi(g, t1.i === id ? t1.j : t1.i);
  const b = pxDi(g, t2.i === id ? t2.j : t2.i);
  return differenzaAngoli(angoloDi(c, a), angoloDi(c, b)) > 170 * GRADI;
}

function pxDi(g: Grafo, id: string): Punto {
  return g.punti.find((x) => x.id === id)!.px;
}

function medianaInferiore(v: readonly number[]): number {
  const s = [...v].sort((a, b) => a - b);
  return s[(s.length - 1) >> 1];
}

/** Il più piccolo d ≤ 12 per cui v·d è intero (L/3 → 3, 3L/2 → 2, 2L → 1). */
function denominatore(v: number): number {
  for (let d = 1; d <= 12; d++) if (Math.abs(v * d - Math.round(v * d)) < 1e-6) return d;
  return 2;
}

function mcm(a: number, b: number): number {
  const mcd = (x: number, y: number): number => (y === 0 ? x : mcd(y, x % y));
  return (a * b) / mcd(a, b);
}

function formatta(v: number): string {
  const d = denominatore(v);
  const n = Math.round(v * d);
  if (d === 1) return n === 1 ? 'L' : `${n}L`;
  return `${n === 1 ? '' : n}L/${d}`;
}

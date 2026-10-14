/**
 * LETTURA DEI CARICHI — frecce, archi e le loro scritte.
 *
 *   · tre o più frecce parallele, affiancate, con lo stesso verso, sulla
 *     stessa asta → carico DISTRIBUITO. Il verso è quello delle punte: non
 *     conta da che parte dell'asta sia disegnato il blocco, perché un carico
 *     può spingere o tirare;
 *   · una freccia isolata → FORZA concentrata;
 *   · un arco → MOMENTO, con il verso che vede chi guarda il foglio.
 *
 * Il verso è la cosa da non sbagliare: una freccia contraria dentro un
 * blocco concorde non diventa un carico a sé, si segnala.
 */

import {
  agganciaAngolo, angoloDi, differenzaAngoli, distanza, distanzaSegmento, mediana, proiezione,
} from '../geometria.js';
import type { Tolleranze } from '../parametri.js';
import type { CaricoGrafo, Grafo, Primitive, Punto } from '../tipi.js';
import { inserisciPunto } from './grafo.js';

const GRADI = Math.PI / 180;

interface Aggancio {
  freccia: number;
  px: Punto;
  direzione: number;
  /** retta dell'asta su cui posa: un punto e la sua direzione */
  retta: { o: Punto; angolo: number };
}

interface Rappresentato {
  carico: CaricoGrafo;
  /** distanza dal carico di una scritta in quel punto */
  distanzaDa: (q: Punto) => number;
  famiglia: 'q' | 'F' | 'M';
}

export function leggiCarichi(g: Grafo, p: Primitive, tol: Tolleranze): void {
  const agganci: Aggancio[] = [];
  p.frecce.forEach((f, i) => {
    const a = aggancia(g, f, tol);
    if (a) agganci.push({ ...a, freccia: i });
    else g.avvisi.push({ codice: 'caricoNonAgganciato', messaggio: 'Freccia che non tocca nessuna asta.' });
  });

  const gruppi = raggruppa(agganci, tol.tau);
  const rappresentati: Rappresentato[] = [];
  const estensioni: { retta: Aggancio['retta']; da: number; a: number; direzione: number }[] = [];
  const segmentoFreccia = (i: number): [Punto, Punto] => {
    const f = p.frecce[i];
    return [f.punta, {
      x: f.punta.x - f.lunghezza * Math.cos(f.direzione),
      y: f.punta.y - f.lunghezza * Math.sin(f.direzione),
    }];
  };

  // ── distribuiti per primi: servono a riconoscere le frecce discordanti ──
  for (const gr of gruppi.filter((x) => x.length >= 3)) {
    const passo = mediana(passi(gr));
    const primo = gr[0];
    const ultimo = gr[gr.length - 1];
    const direzione = aggancioDirezione(mediaAngoli(gr.map((x) => x.direzione)));
    const da = puntoVicino(g, primo.px, 0.6 * passo) ?? inserisci(g, primo.px, tol.tau);
    const a = puntoVicino(g, ultimo.px, 0.6 * passo) ?? inserisci(g, ultimo.px, tol.tau);
    const carico: CaricoGrafo = { tipo: 'distribuito', da, a, direzione, coefficiente: 1 };
    g.carichi.push(carico);
    const t = gr.map((x) => ascissa(x.retta, x.px));
    estensioni.push({ retta: primo.retta, da: Math.min(...t), a: Math.max(...t), direzione });
    rappresentati.push({
      carico, famiglia: 'q',
      distanzaDa: (q) => Math.min(...gr.map((x) => distanzaSegmento(q, ...segmentoFreccia(x.freccia)))),
    });
  }

  // ── frecce isolate: forze, salvo quelle contrarie dentro un blocco ──
  for (const gr of gruppi.filter((x) => x.length < 3)) {
    for (const x of gr) {
      const discorde = estensioni.some((e) => stessaRetta(e.retta, x.retta, tol.tau)
        && differenzaAngoli(e.direzione, x.direzione) > 150 * GRADI
        && ascissa(e.retta, x.px) > e.da && ascissa(e.retta, x.px) < e.a);
      if (discorde) {
        g.avvisi.push({
          codice: 'versoIncerto',
          messaggio: 'Freccia di verso contrario dentro un carico distribuito: ignorata.',
        });
        continue;
      }
      const punto = puntoVicino(g, x.px, tol.tau) ?? inserisci(g, x.px, tol.tau);
      const carico: CaricoGrafo = {
        tipo: 'forza', punto, direzione: aggancioDirezione(x.direzione), coefficiente: 1,
      };
      g.carichi.push(carico);
      rappresentati.push({
        carico, famiglia: 'F',
        distanzaDa: (q) => distanzaSegmento(q, ...segmentoFreccia(x.freccia)),
      });
    }
  }

  // ── momenti ──
  for (const m of p.momenti) {
    // il raggio dell'arco è una scelta di disegno, non una distanza dal nodo:
    // un momento a metà campata non deve finire sull'appoggio vicino
    let punto = puntoVicino(g, m.centro, Math.max(tol.tau, 0.5 * m.raggio));
    if (!punto) {
      if (g.tratti.length === 0) {
        g.avvisi.push({ codice: 'caricoNonAgganciato', messaggio: 'Momento lontano da ogni asta.' });
        continue;
      }
      const tr = trattoSotto(g, m.centro);
      const pr = proiezione(m.centro, pxDi(g, tr.i), pxDi(g, tr.j));
      punto = inserisciPunto(g, tr.id, pr.punto, tol.tau);
    }
    const carico: CaricoGrafo = {
      tipo: 'momento', punto, verso: m.verso === 'antiorario' ? 1 : -1, coefficiente: 1,
    };
    g.carichi.push(carico);
    rappresentati.push({
      carico, famiglia: 'M', distanzaDa: (q) => Math.abs(distanza(q, m.centro) - m.raggio),
    });
  }

  assegnaCoefficienti(g, p, rappresentati, 6 * tol.tau);
}

// ──────────────────────────── aggancio delle frecce ────────────────────────────

function aggancia(
  g: Grafo, f: Primitive['frecce'][number], tol: Tolleranze,
): Omit<Aggancio, 'freccia'> | null {
  const d = { x: Math.cos(f.direzione), y: Math.sin(f.direzione) };
  const coda = { x: f.punta.x - f.lunghezza * d.x, y: f.punta.y - f.lunghezza * d.y };
  let migliore: { px: Punto; tr: string; dist: number } | null = null;

  // punta o coda posata su un'asta. A parità di distanza — la freccia che
  // cade sullo spigolo di un telaio — vince l'asta trasversale: un'asta
  // parallela alla freccia sarebbe caricata di punta, e non è quasi mai così.
  for (const tr of g.tratti) {
    const a = pxDi(g, tr.i);
    const b = pxDi(g, tr.j);
    const parallela = differenzaAngoli(2 * angoloDi(a, b), 2 * f.direzione) / 2 < 20 * GRADI;
    for (const q of [f.punta, coda]) {
      const dist = distanzaSegmento(q, a, b);
      const punteggio = dist + (parallela ? tol.tau : 0);
      if (dist < 1.5 * tol.tau && (!migliore || punteggio < migliore.dist)) {
        const pr = proiezione(q, a, b);
        const t = Math.min(1, Math.max(0, pr.t));
        migliore = { px: { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) }, tr: tr.id, dist: punteggio };
      }
    }
  }
  // altrimenti la prima asta incontrata lungo l'asse, entro una lunghezza
  if (!migliore) {
    const avanti = { x: f.punta.x + f.lunghezza * d.x, y: f.punta.y + f.lunghezza * d.y };
    const indietro = { x: coda.x - f.lunghezza * d.x, y: coda.y - f.lunghezza * d.y };
    for (const tr of g.tratti) {
      for (const [da, a] of [[f.punta, avanti], [coda, indietro]] as const) {
        const x = intersezione(da, a, pxDi(g, tr.i), pxDi(g, tr.j));
        if (!x) continue;
        const dist = distanza(da, x);
        if (!migliore || dist < migliore.dist) migliore = { px: x, tr: tr.id, dist };
      }
    }
  }
  if (!migliore) return null;
  const tr = g.tratti.find((x) => x.id === migliore!.tr)!;
  return {
    px: migliore.px, direzione: f.direzione,
    retta: { o: pxDi(g, tr.i), angolo: angoloDi(pxDi(g, tr.i), pxDi(g, tr.j)) },
  };
}

/**
 * Gruppi di frecce concordi sulla stessa retta, ordinati lungo di essa e
 * spezzati dove il passo si allarga troppo rispetto al proprio.
 */
function raggruppa(agganci: readonly Aggancio[], tau: number): Aggancio[][] {
  const insiemi: Aggancio[][] = [];
  for (const x of agganci) {
    const casa = insiemi.find((s) => differenzaAngoli(s[0].direzione, x.direzione) <= 15 * GRADI
      && stessaRetta(s[0].retta, x.retta, tau));
    if (casa) casa.push(x); else insiemi.push([x]);
  }
  const gruppi: Aggancio[][] = [];
  for (const s of insiemi) {
    const ordinati = [...s].sort((a, b) => ascissa(s[0].retta, a.px) - ascissa(s[0].retta, b.px));
    if (ordinati.length < 3) { gruppi.push(...ordinati.map((x) => [x])); continue; }
    const soglia = 2.5 * mediana(passi(ordinati));
    let corrente: Aggancio[] = [ordinati[0]];
    for (let i = 1; i < ordinati.length; i++) {
      const salto = ascissa(s[0].retta, ordinati[i].px) - ascissa(s[0].retta, ordinati[i - 1].px);
      if (salto > soglia) { gruppi.push(corrente); corrente = []; }
      corrente.push(ordinati[i]);
    }
    gruppi.push(corrente);
  }
  // un gruppo spezzato rimasto con meno di tre frecce torna a essere fatto di forze
  return gruppi.flatMap((gr) => (gr.length >= 3 ? [gr] : gr.map((x) => [x])));
}

function passi(gr: readonly Aggancio[]): number[] {
  const r = gr[0].retta;
  const t = gr.map((x) => ascissa(r, x.px)).sort((a, b) => a - b);
  return t.slice(1).map((v, i) => v - t[i]);
}

function ascissa(r: Aggancio['retta'], q: Punto): number {
  return (q.x - r.o.x) * Math.cos(r.angolo) + (q.y - r.o.y) * Math.sin(r.angolo);
}

function stessaRetta(r: Aggancio['retta'], s: Aggancio['retta'], tol: number): boolean {
  if (differenzaAngoli(r.angolo * 2, s.angolo * 2) / 2 > 5 * GRADI) return false;
  const fine = { x: r.o.x + Math.cos(r.angolo), y: r.o.y + Math.sin(r.angolo) };
  return proiezione(s.o, r.o, fine).distanza < tol;
}

// ──────────────────────────── punti e direzioni ────────────────────────────

function pxDi(g: Grafo, id: string): Punto {
  return g.punti.find((x) => x.id === id)!.px;
}

function puntoVicino(g: Grafo, q: Punto, raggio: number): string | null {
  let migliore: string | null = null;
  let dMin = raggio;
  for (const x of g.punti) {
    const d = distanza(x.px, q);
    if (d < dMin) { dMin = d; migliore = x.id; }
  }
  return migliore;
}

function trattoSotto(g: Grafo, q: Punto): Grafo['tratti'][number] {
  let migliore = g.tratti[0];
  let dMin = Infinity;
  for (const tr of g.tratti) {
    const d = distanzaSegmento(q, pxDi(g, tr.i), pxDi(g, tr.j));
    if (d < dMin) { dMin = d; migliore = tr; }
  }
  return migliore;
}

function inserisci(g: Grafo, q: Punto, tau: number): string {
  return inserisciPunto(g, trattoSotto(g, q).id, q, tau);
}

function aggancioDirezione(a: number): number {
  return agganciaAngolo(agganciaAngolo(a, 90 * GRADI, 10 * GRADI), 45 * GRADI, 7 * GRADI);
}

function mediaAngoli(angoli: readonly number[]): number {
  const x = angoli.reduce((t, a) => t + Math.cos(a), 0);
  const y = angoli.reduce((t, a) => t + Math.sin(a), 0);
  return Math.atan2(y, x);
}

function intersezione(p1: Punto, p2: Punto, q1: Punto, q2: Punto): Punto | null {
  const r = { x: p2.x - p1.x, y: p2.y - p1.y };
  const s = { x: q2.x - q1.x, y: q2.y - q1.y };
  const den = r.x * s.y - r.y * s.x;
  if (Math.abs(den) < 1e-12) return null;
  const t = ((q1.x - p1.x) * s.y - (q1.y - p1.y) * s.x) / den;
  const u = ((q1.x - p1.x) * r.y - (q1.y - p1.y) * r.x) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: p1.x + t * r.x, y: p1.y + t * r.y };
}

// ──────────────────────────── coefficienti ────────────────────────────

/** Abbinamento goloso per distanza crescente: ogni scritta va a un carico solo. */
function assegnaCoefficienti(
  g: Grafo, p: Primitive, carichi: readonly Rappresentato[], raggio: number,
): void {
  const coppie: { c: number; s: number; d: number }[] = [];
  carichi.forEach((c, ic) => p.scritte.forEach((s, is) => {
    if (s.valore.famiglia !== c.famiglia) return;
    const d = c.distanzaDa(s.centro);
    if (d <= raggio) coppie.push({ c: ic, s: is, d });
  }));
  coppie.sort((a, b) => a.d - b.d);
  const caricoFatto = new Set<number>();
  const scrittaUsata = new Set<number>();
  for (const { c, s } of coppie) {
    if (caricoFatto.has(c) || scrittaUsata.has(s)) continue;
    const v = p.scritte[s].valore;
    if (v.famiglia === 'q' || v.famiglia === 'F' || v.famiglia === 'M') {
      carichi[c].carico.coefficiente = v.coefficiente;
    }
    caricoFatto.add(c);
    scrittaUsata.add(s);
  }
  carichi.forEach((c, i) => {
    if (caricoFatto.has(i)) return;
    g.avvisi.push({
      codice: 'coefficienteNonLetto',
      messaggio: `Valore del carico non letto: messo ${c.famiglia} = 1.`,
    });
  });
}

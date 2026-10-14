/**
 * CONFRONTO fra il modello letto da una foto e quello atteso.
 *
 * La misura che conta è quante CORREZIONI deve fare lo studente: elementi da
 * aggiungere, togliere o cambiare. Due modelli che descrivono la stessa
 * struttura in modi diversi — una trave con un appoggio "su asta" contro la
 * stessa trave spezzata in due aste con l'appoggio sul nodo — non devono
 * costare correzioni. Per questo i due modelli passano prima per una FORMA
 * NORMALE che non dipende da come sono stati disegnati:
 *
 *   · geometria: tratti rettilinei massimali, fusi attraverso i punti dove
 *     l'asta prosegue diritta (le sconnessioni si contano a parte);
 *   · vincoli, sconnessioni, carichi: in coordinate assolute.
 *
 * I due modelli si allineano per traslazione: l'origine di una foto non ha
 * significato.
 */

import { migra } from '../core/model/migrazione.js';
import { gruppiSconnessione } from '../core/model/partizione.js';
import type { ElementId, Progetto, Vincolo } from '../core/model/types.js';

export type Categoria = 'aste' | 'vincoli' | 'orientamenti' | 'sconnessioni' | 'carichi';

export interface Confronto {
  correzioni: number;
  perfetto: boolean;
  perCategoria: Record<Categoria, { attesi: number; trovati: number; giusti: number }>;
  differenze: string[];
}

interface P { x: number; y: number }

interface FormaNormale {
  nodi: P[];
  pezzi: [P, P][];
  vincoli: { p: P; tipo: string; angolo: number }[];
  sconnessioni: { p: P; tipo: string; gruppi: number }[];
  carichi: Descrittore[];
}

type Descrittore =
  | { tipo: 'forza'; p: P; fx: number; fy: number }
  | { tipo: 'momento'; p: P; mz: number }
  | { tipo: 'distribuito'; da: P; a: P; angolo: number; q1: number; q2: number };

/** Vincoli il cui angolo cambia le reazioni (e per cui α e α+π si equivalgono). */
const ORIENTABILI = new Set(['carrello', 'biella', 'bipendolo', 'pattino']);
const EPS = 1e-6;

export function confronta(ottenuto: Progetto, atteso: Progetto): Confronto {
  const o = formaNormale(migra(ottenuto));
  const a = formaNormale(migra(atteso));
  let migliore: Confronto | null = null;
  const candidati = o.nodi.length > 0 && a.nodi.length > 0
    ? o.nodi.flatMap((n) => a.nodi.map((m) => ({ x: m.x - n.x, y: m.y - n.y })))
    : [{ x: 0, y: 0 }];
  for (const d of candidati) {
    const c = valuta(trasla(o, d), a);
    if (!migliore || c.correzioni < migliore.correzioni) migliore = c;
    if (migliore.correzioni === 0) break;
  }
  return migliore!;
}

// ──────────────────────────── forma normale ────────────────────────────

function formaNormale(p: Progetto): FormaNormale {
  const pos = new Map(p.nodi.map((n) => [n.id as string, { x: n.x as number, y: n.y as number }]));
  const asta = new Map(p.aste.map((x) => [x.id as string, x]));
  const lungo = (astaId: string, s: number): P => {
    const x = asta.get(astaId)!;
    const i = pos.get(x.nodoIniziale as string)!;
    const j = pos.get(x.nodoFinale as string)!;
    return { x: i.x + s * (j.x - i.x), y: i.y + s * (j.y - i.y) };
  };
  const angoloAsta = (astaId: string): number => {
    const x = asta.get(astaId)!;
    const i = pos.get(x.nodoIniziale as string)!;
    const j = pos.get(x.nodoFinale as string)!;
    return Math.atan2(j.y - i.y, j.x - i.x);
  };

  // ── geometria: ogni asta spezzata in tutti i punti che le cadono dentro ──
  const punti: P[] = [...pos.values()];
  for (const v of p.vincoliSuAsta ?? []) punti.push(lungo(v.astaId as string, v.s));
  for (const s of p.sconnessioni ?? []) punti.push(lungo(s.astaId as string, s.s));
  const pezzi: [P, P][] = [];
  for (const x of p.aste) {
    const i = pos.get(x.nodoIniziale as string)!;
    const j = pos.get(x.nodoFinale as string)!;
    const l2 = (j.x - i.x) ** 2 + (j.y - i.y) ** 2;
    const tagli = punti
      .map((q) => ({ q, t: ((q.x - i.x) * (j.x - i.x) + (q.y - i.y) * (j.y - i.y)) / l2 }))
      .filter(({ q, t }) => t > EPS && t < 1 - EPS
        && Math.abs((q.x - i.x) * (j.y - i.y) - (q.y - i.y) * (j.x - i.x)) / Math.sqrt(l2) < EPS)
      .sort((u, v) => u.t - v.t)
      .map(({ q }) => q);
    const seq = [i, ...tagli, j];
    for (let k = 1; k < seq.length; k++) pezzi.push([seq[k - 1], seq[k]]);
  }

  // ── vincoli ──
  const vincoli: FormaNormale['vincoli'] = [];
  const aggiungiVincolo = (q: P, v: Vincolo): void => {
    vincoli.push({ p: q, tipo: v.tipo, angolo: v.angolo as number });
  };
  for (const n of p.nodi) if (n.vincolo) aggiungiVincolo(pos.get(n.id as string)!, n.vincolo);
  for (const v of p.vincoliSuAsta ?? []) aggiungiVincolo(lungo(v.astaId as string, v.s), v.vincolo);

  // ── sconnessioni: sui nodi, su asta, e i rilasci d'estremità ──
  const sconnessioni: FormaNormale['sconnessioni'] = [];
  const convergenti = (nodo: string): ElementId[] =>
    p.aste.filter((x) => x.nodoIniziale === nodo || x.nodoFinale === nodo).map((x) => x.id);
  const conVincoloInterno = new Set<string>();
  for (const v of p.vincoliInterni) {
    conVincoloInterno.add(v.nodoId as string);
    if (v.tipo === 'biella') continue;
    const gruppi = gruppiSconnessione(v, convergenti(v.nodoId as string));
    if (gruppi.length >= 2) {
      sconnessioni.push({ p: pos.get(v.nodoId as string)!, tipo: v.tipo, gruppi: gruppi.length });
    }
  }
  for (const s of p.sconnessioni ?? []) {
    sconnessioni.push({ p: lungo(s.astaId as string, s.s), tipo: s.tipo, gruppi: 2 });
  }
  for (const n of p.nodi) {
    if (conVincoloInterno.has(n.id as string)) continue;
    const ast = p.aste.filter((x) => x.nodoIniziale === n.id || x.nodoFinale === n.id);
    const rilascio = (x: (typeof ast)[number]) =>
      (x.nodoIniziale === n.id ? x.svincolo.iniziale : x.svincolo.finale);
    const liberate = ast.filter((x) => rilascio(x).M || rilascio(x).T || rilascio(x).N);
    if (liberate.length === 0 || ast.length < 2) continue;
    const r = rilascio(liberate[0]);
    const tipo = r.M ? 'cerniera' : r.T ? 'bipendolo' : 'pattino';
    const gruppi = liberate.length + (ast.length > liberate.length ? 1 : 0);
    if (gruppi >= 2) sconnessioni.push({ p: pos.get(n.id as string)!, tipo, gruppi });
  }

  // ── carichi, in assi globali ──
  const carichi: Descrittore[] = [];
  for (const c of p.carichi) {
    switch (c.tipo) {
      case 'forzaNodale':
        carichi.push({ tipo: 'forza', p: pos.get(c.nodoId as string)!, fx: c.fx as number, fy: c.fy as number });
        break;
      case 'forzaInCampata': {
        let [fx, fy] = [c.fx as number, c.fy as number];
        if (c.riferimento === 'locale') {
          const t = angoloAsta(c.astaId as string);
          [fx, fy] = [fx * Math.cos(t) - fy * Math.sin(t), fx * Math.sin(t) + fy * Math.cos(t)];
        }
        carichi.push({ tipo: 'forza', p: lungo(c.astaId as string, c.s), fx, fy });
        break;
      }
      case 'momentoNodale':
        carichi.push({ tipo: 'momento', p: pos.get(c.nodoId as string)!, mz: c.mz as number });
        break;
      case 'momentoInCampata':
        carichi.push({ tipo: 'momento', p: lungo(c.astaId as string, c.s), mz: c.mz as number });
        break;
      case 'distribuito': {
        const t = angoloAsta(c.astaId as string);
        const base = c.direzione.modo === 'globaleX' ? 0
          : c.direzione.modo === 'globaleY' ? Math.PI / 2
            : c.direzione.modo === 'localeAssiale' ? t
              : c.direzione.modo === 'localeOrtogonale' ? t + Math.PI / 2
                : (c.direzione.alpha as number | undefined) ?? 0;
        // il verso sta nel segno: si porta nell'angolo e l'intensità resta positiva
        const segno = Math.sign((c.q1 as number) || (c.q2 as number)) || 1;
        carichi.push({
          tipo: 'distribuito',
          da: lungo(c.astaId as string, c.sIniziale), a: lungo(c.astaId as string, c.sFinale),
          angolo: normAngolo(base + (segno < 0 ? Math.PI : 0)),
          q1: Math.abs(c.q1 as number), q2: Math.abs(c.q2 as number),
        });
        break;
      }
      default:
        break;
    }
  }

  return {
    nodi: [...pos.values()],
    pezzi: fondiPezzi(pezzi),
    vincoli, sconnessioni,
    carichi: fondiDistribuiti(carichi),
  };
}

/** Fonde i pezzi allineati che si incontrano in un punto dove non arriva nient'altro. */
function fondiPezzi(pezzi: [P, P][]): [P, P][] {
  let lista = pezzi.map(([a, b]) => [a, b] as [P, P]);
  let fuso = true;
  while (fuso) {
    fuso = false;
    const grado = new Map<string, number>();
    for (const [a, b] of lista) for (const q of [a, b]) grado.set(k(q), (grado.get(k(q)) ?? 0) + 1);
    outer: for (let i = 0; i < lista.length; i++) {
      for (let j = i + 1; j < lista.length; j++) {
        const comune = [lista[i][0], lista[i][1]].find((q) => uguale(q, lista[j][0]) || uguale(q, lista[j][1]));
        if (!comune || grado.get(k(comune)) !== 2) continue;
        const u = altro(lista[i], comune);
        const v = altro(lista[j], comune);
        const cross = (u.x - comune.x) * (v.y - comune.y) - (u.y - comune.y) * (v.x - comune.x);
        const dot = (u.x - comune.x) * (v.x - comune.x) + (u.y - comune.y) * (v.y - comune.y);
        if (Math.abs(cross) > EPS || dot >= 0) continue;
        lista = lista.filter((_, x) => x !== i && x !== j);
        lista.push([u, v]);
        fuso = true;
        break outer;
      }
    }
  }
  return lista;
}

/** Due distribuiti contigui, allineati, con stessa direzione e intensità, sono uno solo. */
function fondiDistribuiti(carichi: Descrittore[]): Descrittore[] {
  const lista = [...carichi];
  let fuso = true;
  while (fuso) {
    fuso = false;
    for (let i = 0; i < lista.length && !fuso; i++) {
      for (let j = 0; j < lista.length && !fuso; j++) {
        const u = lista[i];
        const v = lista[j];
        if (i === j || u.tipo !== 'distribuito' || v.tipo !== 'distribuito') continue;
        if (!uguale(u.a, v.da) || Math.abs(u.angolo - v.angolo) > EPS) continue;
        if (Math.abs(u.q1 - u.q2) > EPS || Math.abs(v.q1 - v.q2) > EPS || Math.abs(u.q1 - v.q1) > EPS) continue;
        const cross = (u.a.x - u.da.x) * (v.a.y - v.da.y) - (u.a.y - u.da.y) * (v.a.x - v.da.x);
        if (Math.abs(cross) > EPS) continue;
        lista.splice(Math.max(i, j), 1);
        lista.splice(Math.min(i, j), 1, { ...u, a: v.a });
        fuso = true;
      }
    }
  }
  return lista;
}

// ──────────────────────────── confronto vero e proprio ────────────────────────────

function valuta(o: FormaNormale, a: FormaNormale): Confronto {
  const differenze: string[] = [];

  // aste: un pezzo sbagliato si corregge con una modifica, non con due
  const chiavePezzo = ([u, v]: [P, P]): string => [k(u), k(v)].sort().join('—');
  const pa = new Set(a.pezzi.map(chiavePezzo));
  const po = new Set(o.pezzi.map(chiavePezzo));
  const mancanti = [...pa].filter((x) => !po.has(x));
  const inPiu = [...po].filter((x) => !pa.has(x));
  mancanti.forEach((x) => differenze.push(`manca l'asta ${x}`));
  inPiu.forEach((x) => differenze.push(`asta in più ${x}`));
  const aste = { attesi: pa.size, trovati: po.size, giusti: pa.size - mancanti.length };
  let correzioni = Math.max(mancanti.length, inPiu.length);

  // vincoli e orientamenti
  const vincoli = { attesi: a.vincoli.length, trovati: o.vincoli.length, giusti: 0 };
  const orientamenti = {
    attesi: a.vincoli.filter((v) => ORIENTABILI.has(v.tipo)).length,
    trovati: o.vincoli.filter((v) => ORIENTABILI.has(v.tipo)).length,
    giusti: 0,
  };
  const vo = [...o.vincoli];
  for (const v of a.vincoli) {
    const i = vo.findIndex((x) => uguale(x.p, v.p));
    if (i < 0) { correzioni++; differenze.push(`manca il vincolo ${v.tipo} in ${k(v.p)}`); continue; }
    const x = vo.splice(i, 1)[0];
    if (x.tipo !== v.tipo) {
      correzioni++;
      differenze.push(`in ${k(v.p)} c'è ${x.tipo} invece di ${v.tipo}`);
      continue;
    }
    vincoli.giusti++;
    if (!ORIENTABILI.has(v.tipo)) continue;
    if (stessaRetta(x.angolo, v.angolo)) orientamenti.giusti++;
    else { correzioni++; differenze.push(`${v.tipo} in ${k(v.p)} orientato male`); }
  }
  for (const x of vo) { correzioni++; differenze.push(`vincolo ${x.tipo} in più in ${k(x.p)}`); }

  // sconnessioni
  const sconnessioni = { attesi: a.sconnessioni.length, trovati: o.sconnessioni.length, giusti: 0 };
  const so = [...o.sconnessioni];
  for (const s of a.sconnessioni) {
    const i = so.findIndex((x) => uguale(x.p, s.p));
    if (i < 0) { correzioni++; differenze.push(`manca la ${s.tipo} interna in ${k(s.p)}`); continue; }
    const x = so.splice(i, 1)[0];
    if (x.tipo === s.tipo && x.gruppi === s.gruppi) sconnessioni.giusti++;
    else { correzioni++; differenze.push(`sconnessione in ${k(s.p)} diversa`); }
  }
  for (const x of so) { correzioni++; differenze.push(`${x.tipo} interna in più in ${k(x.p)}`); }

  // carichi: uguali del tutto, o almeno nello stesso posto (una modifica)
  const carichi = { attesi: a.carichi.length, trovati: o.carichi.length, giusti: 0 };
  const co = [...o.carichi];
  const restanti: Descrittore[] = [];
  for (const c of a.carichi) {
    const i = co.findIndex((x) => caricoUguale(x, c));
    if (i >= 0) { co.splice(i, 1); carichi.giusti++; } else restanti.push(c);
  }
  for (const c of restanti) {
    const i = co.findIndex((x) => x.tipo === c.tipo && stessoPosto(x, c));
    if (i >= 0) co.splice(i, 1);
    correzioni++;
    differenze.push(i >= 0 ? `carico ${c.tipo} diverso in ${posto(c)}` : `manca il carico ${c.tipo} in ${posto(c)}`);
  }
  for (const x of co) { correzioni++; differenze.push(`carico ${x.tipo} in più in ${posto(x)}`); }

  return {
    correzioni, perfetto: correzioni === 0, differenze,
    perCategoria: { aste, vincoli, orientamenti, sconnessioni, carichi },
  };
}

// ──────────────────────────── aiuti ────────────────────────────

function trasla(f: FormaNormale, d: P): FormaNormale {
  const t = (q: P): P => ({ x: q.x + d.x, y: q.y + d.y });
  return {
    nodi: f.nodi.map(t),
    pezzi: f.pezzi.map(([u, v]) => [t(u), t(v)]),
    vincoli: f.vincoli.map((v) => ({ ...v, p: t(v.p) })),
    sconnessioni: f.sconnessioni.map((s) => ({ ...s, p: t(s.p) })),
    carichi: f.carichi.map((c) => (c.tipo === 'distribuito' ? { ...c, da: t(c.da), a: t(c.a) } : { ...c, p: t(c.p) })),
  };
}

function k(q: P): string {
  const r = (v: number): number => Math.round(v * 1e6) / 1e6 + 0;
  return `(${r(q.x)}, ${r(q.y)})`;
}

function uguale(u: P, v: P): boolean {
  return Math.abs(u.x - v.x) < EPS && Math.abs(u.y - v.y) < EPS;
}

function altro([a, b]: [P, P], q: P): P {
  return uguale(a, q) ? b : a;
}

function normAngolo(a: number): number {
  const d = 2 * Math.PI;
  return ((a % d) + d) % d;
}

/** α e α + π danno la stessa retta di reazione. */
function stessaRetta(u: number, v: number): boolean {
  const d = normAngolo(u - v) % Math.PI;
  return d < 1e-6 || Math.PI - d < 1e-6;
}

function caricoUguale(x: Descrittore, c: Descrittore): boolean {
  const vicino = (u: number, v: number): boolean => Math.abs(u - v) <= 1e-6 * Math.max(1, Math.abs(v));
  if (x.tipo === 'forza' && c.tipo === 'forza') return uguale(x.p, c.p) && vicino(x.fx, c.fx) && vicino(x.fy, c.fy);
  if (x.tipo === 'momento' && c.tipo === 'momento') return uguale(x.p, c.p) && vicino(x.mz, c.mz);
  if (x.tipo === 'distribuito' && c.tipo === 'distribuito') {
    const stessiEstremi = (uguale(x.da, c.da) && uguale(x.a, c.a)) || (uguale(x.da, c.a) && uguale(x.a, c.da));
    return stessiEstremi && Math.abs(normAngolo(x.angolo - c.angolo)) < 1e-6
      && vicino(x.q1, c.q1) && vicino(x.q2, c.q2);
  }
  return false;
}

function stessoPosto(x: Descrittore, c: Descrittore): boolean {
  if (x.tipo === 'distribuito' && c.tipo === 'distribuito') {
    return (uguale(x.da, c.da) && uguale(x.a, c.a)) || (uguale(x.da, c.a) && uguale(x.a, c.da));
  }
  if (x.tipo !== 'distribuito' && c.tipo !== 'distribuito') return uguale(x.p, c.p);
  return false;
}

function posto(c: Descrittore): string {
  return c.tipo === 'distribuito' ? `${k(c.da)}–${k(c.a)}` : k(c.p);
}

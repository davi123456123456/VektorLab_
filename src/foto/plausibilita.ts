/**
 * REVISORE DI PLAUSIBILITÀ — prima di disegnare, il buon senso dell'esame.
 *
 * La lettura (regole della Fase 1) è fedele a ciò che c'è nella foto; qui
 * si correggono le letture IMPOSSIBILI per un esercizio d'esame, con le
 * regole di Davide (2026-10-16):
 *
 *   1. pattino esterno e biella negli esami non ci sono (la molla la rete
 *      non la conosce): si disegna il tipo che la rete dava come più
 *      probabile dopo quello; i vincoli interni restano tutti;
 *   2. l'incastro sta dove un'asta finisce (un'asta sola, o lo spigolo di
 *      due aste non allineate), mai a metà asta, fra due aste allineate o
 *      in un nodo con tre aste: si prende il tipo successivo. Due incastri
 *      vicini fuori posto sono le due piastre di un doppio pendolo interno
 *      (la rete le scambia per incastri): diventano quello;
 *   3. due pezzi con niente in mezzo sono un pezzo dimenticato: si
 *      collegano dalle due estremità più vicine;
 *   4. gli esercizi non sono labili: se la struttura letta lo è, si cambia
 *      il vincolo di cui la rete era meno sicura (uno, poi due), solo fra
 *      alternative che la rete riteneva davvero possibili; altrimenti si
 *      avvisa e basta.
 *
 * Le correzioni toccano le PRIMITIVE (il tipo di un corpo, un segmento
 * d'asta in più) e si rilegge: così la lettura resta una sola, quella
 * della Fase 1. Ogni correzione diventa un avviso `revisione`.
 */

import { analizzaCinematica } from '../core/index.js';
import { leggi, type EsitoLettura } from './index.js';
import { distanza, mediana } from './geometria.js';
import type { Avviso, CorpoVincolo, Grafo, Primitive, Punto, TipoCorpo } from './tipi.js';

export const ESCLUSI: ReadonlySet<TipoCorpo> = new Set(['pattino', 'biella']);
const INTERNI: ReadonlySet<TipoCorpo> = new Set(['doppioPendoloInterno', 'pattinoInterno']);
const ESTERNI: TipoCorpo[] = ['triangolo', 'triangoloRulli', 'incastro', 'doppioPendolo'];
const RIPIEGO: Partial<Record<TipoCorpo, TipoCorpo>> = { pattino: 'doppioPendolo', biella: 'triangoloRulli', incastro: 'triangolo' };
const NOME: Record<TipoCorpo, string> = {
  triangolo: 'cerniera', triangoloRulli: 'carrello', incastro: 'incastro', doppioPendolo: 'doppio pendolo',
  pattino: 'pattino', biella: 'biella', doppioPendoloInterno: 'doppio pendolo interno', pattinoInterno: 'pattino interno',
};
/** un'alternativa conta se la rete le dava almeno questo, e almeno questa frazione del tipo letto */
export const ALTERNATIVA = { minimo: 0.2, frazione: 0.3 };
const GRADI = Math.PI / 180;
export const LABILE = 'La struttura letta è labile: controlla i vincoli.';
/** due incastri fuori posto più vicini di così (frazione della diagonale) sono un doppio pendolo interno */
export const COPPIA = 0.06;

interface Correzione { messaggio: string; dove: Punto | null }

const clona = (p: Primitive): Primitive => structuredClone(p);

/** Il tipo ammesso più probabile per la rete, o il ripiego se la rete non ha detto niente. */
function migliore(k: CorpoVincolo, ammessi: TipoCorpo[]): TipoCorpo {
  const s = k.punteggi ?? {};
  let scelto: TipoCorpo | null = null;
  for (const t of ammessi) if ((s[t] ?? 0) > 0 && (scelto === null || (s[t] ?? 0) > (s[scelto] ?? 0))) scelto = t;
  if (scelto) return scelto;
  const r = RIPIEGO[k.tipo];
  return r && ammessi.includes(r) ? r : ammessi[0];
}

function pxDi(g: Grafo, id: string): Punto {
  return g.punti.find((q) => q.id === id)!.px;
}

/** Direzioni (radianti) dei tratti che escono da un punto del grafo. */
function uscite(g: Grafo, id: string): number[] {
  const c = pxDi(g, id);
  return g.tratti.filter((t) => t.i === id || t.j === id).map((t) => {
    const q = pxDi(g, t.i === id ? t.j : t.i);
    return Math.atan2(q.y - c.y, q.x - c.x);
  });
}

/** Dove un incastro ha senso: un'asta sola, o lo spigolo di due aste non allineate. */
function postoDaIncastro(g: Grafo, id: string): boolean {
  const u = uscite(g, id);
  if (u.length <= 1) return true;
  if (u.length > 2) return false;
  // angolo fra le due direzioni, in [0, π]: π vuol dire aste allineate
  const fra = Math.abs(((u[0] - u[1] + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
  return fra < Math.PI - 10 * GRADI;
}

function corpoVicino(p: Primitive, q: Punto): CorpoVincolo | null {
  let migliore: CorpoVincolo | null = null;
  for (const k of p.corpi) {
    if (INTERNI.has(k.tipo)) continue;
    if (!migliore || distanza(k.attacco, q) < distanza(migliore.attacco, q)) migliore = k;
  }
  return migliore;
}

/** I pezzi della struttura: gruppi di punti uniti da tratti. */
function pezzi(g: Grafo): string[][] {
  const padre = new Map(g.punti.map((q) => [q.id, q.id]));
  const radice = (id: string): string => (padre.get(id) === id ? id : radice(padre.get(id)!));
  for (const t of g.tratti) padre.set(radice(t.i), radice(t.j));
  const gruppi = new Map<string, string[]>();
  for (const q of g.punti) {
    if (!g.tratti.some((t) => t.i === q.id || t.j === q.id)) continue;
    const r = radice(q.id);
    gruppi.set(r, [...(gruppi.get(r) ?? []), q.id]);
  }
  return [...gruppi.values()];
}

/** Il segmento che manca fra i due pezzi più vicini: da un estremo libero a un punto dell'altro. */
function ponte(g: Grafo, gruppi: string[][]): [Punto, Punto] | null {
  const grado = (id: string) => g.tratti.filter((t) => t.i === id || t.j === id).length;
  let scelta: { a: Punto; b: Punto; d: number } | null = null;
  for (let x = 0; x < gruppi.length; x++) {
    for (let y = 0; y < gruppi.length; y++) {
      if (x === y) continue;
      for (const ia of gruppi[x]) {
        if (grado(ia) !== 1) continue;
        for (const ib of gruppi[y]) {
          const a = pxDi(g, ia), b = pxDi(g, ib), d = distanza(a, b);
          if (!scelta || d < scelta.d) scelta = { a, b, d };
        }
      }
    }
  }
  return scelta ? [scelta.a, scelta.b] : null;
}

function labile(l: EsitoLettura): boolean {
  if (l.progetto.aste.length === 0) return false;
  try {
    return analizzaCinematica(l.progetto).labilita > 0;
  } catch {
    return false;
  }
}

function incastriAPosto(l: EsitoLettura): boolean {
  return l.grafo.vincoli.every((v) => v.tipo !== 'incastro' || postoDaIncastro(l.grafo, v.punto));
}

export function rivedi(ingresso: Primitive): { lettura: EsitoLettura; primitive: Primitive; correzioni: Avviso[] } {
  const p = clona(ingresso);
  const fatte: Correzione[] = [];

  // 1. tipi che negli esami non ci sono
  for (const k of p.corpi) {
    if (!ESCLUSI.has(k.tipo)) continue;
    const nuovo = migliore(k, ESTERNI);
    fatte.push({ messaggio: `Ho letto un vincolo come ${NOME[k.tipo]}, che negli esercizi non c'è: l'ho disegnato come ${NOME[nuovo]}.`, dove: k.attacco });
    k.tipo = nuovo;
  }

  // 2. e 3. incastri fuori posto e pezzi staccati, finché c'è qualcosa da correggere
  let l = leggi(p);
  for (let giro = 0; giro < 6; giro++) {
    let cambiato = false;
    // gli incastri disegnati il cui vincolo letto (il più vicino) è fuori posto:
    // si parte dai corpi perché la lettura fonde due incastri vicini in uno solo
    const vincoloDi = (k: CorpoVincolo) => l.grafo.vincoli.reduce<{ punto: string; d: number } | null>((m, v) => {
      const d = distanza(pxDi(l.grafo, v.punto), k.attacco);
      return !m || d < m.d ? { punto: v.punto, d } : m;
    }, null);
    const fuoriPosto = p.corpi.filter((k) => {
      if (k.tipo !== 'incastro') return false;
      const v = vincoloDi(k);
      return !!v && !postoDaIncastro(l.grafo, v.punto);
    });
    const vicinanza = COPPIA * Math.hypot(p.larghezza, p.altezza);
    const accoppiati = new Set<CorpoVincolo>();
    for (const a of fuoriPosto) {
      for (const b of fuoriPosto) {
        if (a === b || accoppiati.has(a) || accoppiati.has(b) || distanza(a.attacco, b.attacco) > vicinanza) continue;
        accoppiati.add(a);
        accoppiati.add(b);
        const m = { x: (a.attacco.x + b.attacco.x) / 2, y: (a.attacco.y + b.attacco.y) / 2 };
        p.corpi = p.corpi.filter((k) => k !== a && k !== b);
        p.corpi.push({ tipo: 'doppioPendoloInterno', attacco: m, angolo: 0, confidenza: Math.min(a.confidenza, b.confidenza) });
        // come per un pallino che interrompe, l'asta si ferma ai due lati del simbolo
        const meta = distanza(a.attacco, b.attacco) / 2;
        p.aste = p.aste.flatMap((sg) => {
          const l2 = distanza(sg.a, sg.b);
          const u = { x: (sg.b.x - sg.a.x) / l2, y: (sg.b.y - sg.a.y) / l2 };
          const t = (m.x - sg.a.x) * u.x + (m.y - sg.a.y) * u.y;
          const fuori = Math.abs((m.x - sg.a.x) * u.y - (m.y - sg.a.y) * u.x);
          if (fuori > meta || t <= meta || t >= l2 - meta) return [sg];
          return [{ ...sg, b: { x: sg.a.x + u.x * (t - meta), y: sg.a.y + u.y * (t - meta) } },
            { ...sg, a: { x: sg.a.x + u.x * (t + meta), y: sg.a.y + u.y * (t + meta) } }];
        });
        fatte.push({ messaggio: 'Due incastri vicini a metà asta sono le piastre di un doppio pendolo interno: l\'ho disegnato così.', dove: m });
        cambiato = true;
      }
    }
    if (cambiato) {
      l = leggi(p);
      continue;
    }
    for (const v of l.grafo.vincoli) {
      if (v.tipo !== 'incastro' || postoDaIncastro(l.grafo, v.punto)) continue;
      const k = corpoVicino(p, pxDi(l.grafo, v.punto));
      if (!k || k.tipo !== 'incastro') continue;
      const nuovo = migliore(k, ESTERNI.filter((t) => t !== 'incastro'));
      fatte.push({ messaggio: `Un incastro a metà asta o fra aste allineate negli esercizi non c'è: l'ho disegnato come ${NOME[nuovo]}.`, dove: k.attacco });
      k.tipo = nuovo;
      cambiato = true;
    }
    const gruppi = pezzi(l.grafo);
    if (gruppi.length > 1) {
      const segmento = ponte(l.grafo, gruppi);
      if (segmento) {
        const spessore = p.aste.length > 0 ? mediana(p.aste.map((s) => s.spessore)) : 2;
        p.aste.push({ a: segmento[0], b: segmento[1], spessore, confidenza: 0.1 });
        fatte.push({ messaggio: 'Ho aggiunto un tratto d\'asta che mancava fra due pezzi: controllalo.',
          dove: { x: (segmento[0].x + segmento[1].x) / 2, y: (segmento[0].y + segmento[1].y) / 2 } });
        cambiato = true;
      }
    }
    if (!cambiato) break;
    l = leggi(p);
  }

  // 4. gli esercizi non sono labili
  if (labile(l)) {
    const candidati: { k: number; tipo: TipoCorpo; costo: number }[] = [];
    p.corpi.forEach((k, i) => {
      if (INTERNI.has(k.tipo) || !k.punteggi) return;
      const attuale = k.punteggi[k.tipo] ?? 0;
      for (const t of ESTERNI) {
        const s = k.punteggi[t] ?? 0;
        if (t === k.tipo || s < ALTERNATIVA.minimo || s < ALTERNATIVA.frazione * attuale) continue;
        candidati.push({ k: i, tipo: t, costo: attuale - s });
      }
    });
    candidati.sort((a, b) => a.costo - b.costo);
    const prove: (typeof candidati)[] = candidati.slice(0, 16).map((c) => [c]);
    const migliori = candidati.slice(0, 6);
    const coppie: (typeof candidati)[] = [];
    for (let a = 0; a < migliori.length; a++) {
      for (let b = a + 1; b < migliori.length; b++) {
        if (migliori[a].k !== migliori[b].k) coppie.push([migliori[a], migliori[b]]);
      }
    }
    coppie.sort((x, y) => (x[0].costo + x[1].costo) - (y[0].costo + y[1].costo));
    let risolto = false;
    for (const prova of [...prove, ...coppie.slice(0, 15)]) {
      const q = clona(p);
      for (const c of prova) q.corpi[c.k].tipo = c.tipo;
      const lq = leggi(q);
      if (labile(lq) || !incastriAPosto(lq)) continue;
      for (const c of prova) {
        fatte.push({ messaggio: `La struttura letta era labile: ho preso un ${NOME[p.corpi[c.k].tipo]} per un ${NOME[c.tipo]}.`, dove: p.corpi[c.k].attacco });
        p.corpi[c.k].tipo = c.tipo;
      }
      l = lq;
      risolto = true;
      break;
    }
    if (!risolto) fatte.push({ messaggio: LABILE, dove: null });
  }

  // gli avvisi puntano al punto del grafo finale più vicino all'elemento corretto
  const correzioni: Avviso[] = fatte.map((c) => {
    if (!c.dove || l.grafo.punti.length === 0) return { codice: 'revisione', messaggio: c.messaggio };
    const vicino = l.grafo.punti.reduce((m, q) => (distanza(q.px, c.dove!) < distanza(m.px, c.dove!) ? q : m));
    return { codice: 'revisione', messaggio: c.messaggio, punti: [vicino.id] };
  });
  return { lettura: { ...l, avvisi: [...l.avvisi, ...correzioni] }, primitive: p, correzioni };
}

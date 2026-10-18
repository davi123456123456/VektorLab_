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
 *      vicini a metà di un'asta sono le due piastre di un doppio pendolo
 *      interno (la rete le scambia per incastri): diventano quello, se la
 *      rilettura lo trova davvero;
 *   3. due pezzi con niente in mezzo sono un pezzo dimenticato: si collega
 *      l'estremo libero di uno al punto più vicino dell'altro, mai da o
 *      verso un vincolo, mai attraverso un simbolo, e solo se il buco è
 *      piccolo rispetto alla struttura (una sezione accanto resta staccata);
 *   4. gli esercizi non sono labili: se la struttura letta lo è, si cambia
 *      il vincolo di cui la rete era meno sicura (uno, poi due), solo fra
 *      alternative che la rete riteneva davvero possibili. Se nella lettura
 *      ci sono cerniere interne (una può essere letta in più) o se manca
 *      troppo, si avvisa e basta.
 *
 * Nessuna correzione rende labile una struttura che non lo era. Le
 * correzioni toccano le PRIMITIVE (il tipo di un corpo, un segmento d'asta)
 * e si rilegge: la lettura resta una sola, quella della Fase 1. Ogni
 * correzione diventa un avviso `revisione`. Se qualcosa va storto si torna
 * alla lettura senza revisione: la revisione non deve mai far perdere la foto.
 */

import { analizzaCinematica } from '../core/index.js';
import { distanza, distanzaSegmento, mediana, proiezione } from './geometria.js';
import { leggi, type EsitoLettura } from './index.js';
import { tolleranze, type Tolleranze } from './parametri.js';
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
export const LABILE = 'La struttura letta è labile: controlla vincoli, cerniere interne e aste.';
/** due incastri fuori posto più vicini di così (frazione della diagonale) sono un doppio pendolo interno */
export const COPPIA = 0.06;
/** buco massimo da colmare, in frazione della diagonale dell'intera struttura */
export const BUCO = 0.35;
/** oltre questa labilità un cambio di tipo non basta: si avvisa e basta */
const LABILITA_MASSIMA = 4;
/** tempo massimo per la ricerca sulla labilità [ms] */
const TEMPO = 50;

interface Correzione { messaggio: string; dove: Punto[] }
type Revisione = { lettura: EsitoLettura; primitive: Primitive; correzioni: Avviso[] };

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

/** La posizione di un punto del grafo; null se la lettura l'ha tolto (un tratto troppo corto). */
function pxDi(g: Grafo, id: string): Punto | null {
  return g.punti.find((q) => q.id === id)?.px ?? null;
}

function grado(g: Grafo, id: string): number {
  return g.tratti.filter((t) => t.i === id || t.j === id).length;
}

/** Dove un incastro ha senso: un'asta sola, o lo spigolo di due aste non allineate. */
function postoDaIncastro(g: Grafo, id: string): boolean {
  const c = pxDi(g, id);
  if (!c) return true;
  const uscite: number[] = [];
  for (const t of g.tratti) {
    if (t.i !== id && t.j !== id) continue;
    const q = pxDi(g, t.i === id ? t.j : t.i);
    if (q) uscite.push(Math.atan2(q.y - c.y, q.x - c.x));
  }
  if (uscite.length <= 1) return true;
  if (uscite.length > 2) return false;
  // angolo fra le due direzioni, in [0, π]: π vuol dire aste allineate
  const fra = Math.abs(((uscite[0] - uscite[1] + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
  return fra < Math.PI - 10 * GRADI;
}

/** Fin dove un corpo disegnato e il vincolo letto si considerano la stessa cosa. */
const raggioCorpo = (tol: Tolleranze) => 3 * tol.tau + 2 * tol.raggioTipico;

/** L'indice del corpo esterno più vicino a un punto, entro il raggio del corpo. */
function corpoVicino(p: Primitive, q: Punto, tol: Tolleranze): number {
  let scelto = -1;
  p.corpi.forEach((k, i) => {
    if (INTERNI.has(k.tipo) || distanza(k.attacco, q) > raggioCorpo(tol)) return;
    if (scelto < 0 || distanza(k.attacco, q) < distanza(p.corpi[scelto].attacco, q)) scelto = i;
  });
  return scelto;
}

/** Il vincolo letto più vicino a un corpo disegnato, entro il raggio del corpo. */
function vincoloDi(l: EsitoLettura, k: CorpoVincolo, tol: Tolleranze): string | null {
  let scelto: { punto: string; d: number } | null = null;
  for (const v of l.grafo.vincoli) {
    const q = pxDi(l.grafo, v.punto);
    if (!q) continue;
    const d = distanza(q, k.attacco);
    if (d <= raggioCorpo(tol) && (!scelto || d < scelto.d)) scelto = { punto: v.punto, d };
  }
  return scelto?.punto ?? null;
}

/** I pezzi della struttura: gruppi di punti uniti da tratti. */
function pezzi(g: Grafo): string[][] {
  const padre = new Map(g.punti.map((q) => [q.id, q.id]));
  const radice = (id: string): string => (padre.get(id) === id ? id : radice(padre.get(id)!));
  for (const t of g.tratti) if (padre.has(t.i) && padre.has(t.j)) padre.set(radice(t.i), radice(t.j));
  const gruppi = new Map<string, string[]>();
  for (const q of g.punti) {
    if (grado(g, q.id) === 0) continue;
    const r = radice(q.id);
    gruppi.set(r, [...(gruppi.get(r) ?? []), q.id]);
  }
  return [...gruppi.values()];
}

function labilita(l: EsitoLettura): number {
  if (l.progetto.aste.length === 0) return 0;
  try {
    return analizzaCinematica(l.progetto).labilita;
  } catch {
    return 0;
  }
}

function incastriAPosto(l: EsitoLettura): boolean {
  return l.grafo.vincoli.every((v) => v.tipo !== 'incastro' || postoDaIncastro(l.grafo, v.punto));
}

/**
 * Il segmento che manca fra due pezzi: da un estremo libero (senza vincolo)
 * al punto più vicino di un tratto dell'altro pezzo, lontano dai vincoli,
 * senza attraversare simboli, e non più lungo di BUCO volte la diagonale
 * dell'intera struttura.
 */
function ponte(l: EsitoLettura, p: Primitive, tol: Tolleranze): [Punto, Punto] | null {
  const g = l.grafo;
  const gruppi = pezzi(g);
  if (gruppi.length < 2) return null;
  const vincolati = g.vincoli.map((v) => pxDi(g, v.punto)).filter((q): q is Punto => !!q);
  const vicinoAVincolo = (q: Punto) => vincolati.some((v) => distanza(v, q) < 2 * tol.tau);
  const diagonale = (ids: string[]) => {
    const pts = ids.map((id) => pxDi(g, id)).filter((q): q is Punto => !!q);
    const xs = pts.map((q) => q.x), ys = pts.map((q) => q.y);
    return Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  };
  const massimo = BUCO * diagonale(gruppi.flat());
  const simboli = [...p.pallini.map((c) => c.c), ...p.corpi.map((k) => k.attacco)];
  let scelto: { a: Punto; b: Punto; d: number } | null = null;
  gruppi.forEach((x, ix) => gruppi.forEach((y, iy) => {
    if (ix === iy) return;
    const trattiY = g.tratti.filter((t) => y.includes(t.i) && y.includes(t.j));
    for (const ia of x) {
      const a = pxDi(g, ia);
      if (!a || grado(g, ia) !== 1 || vicinoAVincolo(a)) continue;
      for (const t of trattiY) {
        const ti = pxDi(g, t.i), tj = pxDi(g, t.j);
        if (!ti || !tj) continue;
        const pr = proiezione(a, ti, tj);
        const b = pr.t <= 0 ? ti : pr.t >= 1 ? tj : pr.punto;
        const d = distanza(a, b);
        if (d > massimo || d < 1e-9 || vicinoAVincolo(b) || (scelto && d >= scelto.d)) continue;
        const attraversa = simboli.some((s) => distanza(s, a) > 2 * tol.tau && distanza(s, b) > 2 * tol.tau
          && distanzaSegmento(s, a, b) < tol.tau);
        if (!attraversa) scelto = { a, b, d };
      }
    }
  }));
  const fine = scelto as { a: Punto; b: Punto; d: number } | null;
  return fine ? [fine.a, fine.b] : null;
}

export function rivedi(ingresso: Primitive): Revisione {
  try {
    return rivediDentro(ingresso);
  } catch {
    // la revisione è un aiuto: se fallisce resta la lettura di sempre
    return { lettura: leggi(ingresso), primitive: ingresso, correzioni: [] };
  }
}

function rivediDentro(ingresso: Primitive): Revisione {
  let p = clona(ingresso);
  const tol = tolleranze(p);
  const fatte: Correzione[] = [];

  // 1. tipi che negli esami non ci sono
  for (const k of p.corpi) {
    if (!ESCLUSI.has(k.tipo)) continue;
    const nuovo = migliore(k, ESTERNI);
    fatte.push({ messaggio: `Ho letto un vincolo come ${NOME[k.tipo]}, che negli esercizi non c'è: l'ho disegnato come ${NOME[nuovo]}.`, dove: [k.attacco] });
    k.tipo = nuovo;
  }
  let l = leggi(p);

  // 2. incastri fuori posto, sulle aste lette davvero (prima di ogni collegamento)
  const nonAccoppiare = new Set<string>();
  const chiave = (k: CorpoVincolo) => `${Math.round(k.attacco.x)},${Math.round(k.attacco.y)}`;
  for (let giro = 0; giro < 8; giro++) {
    let cambiato = false;
    const fuoriPosto = p.corpi.map((k, i) => ({ k, i })).filter(({ k }) => {
      if (k.tipo !== 'incastro') return false;
      const v = vincoloDi(l, k, tol);
      return !!v && !postoDaIncastro(l.grafo, v);
    });

    // 2a. due piastre vicine a metà di un'asta: un doppio pendolo interno
    const vicinanza = COPPIA * Math.hypot(p.larghezza, p.altezza);
    for (const a of fuoriPosto) {
      for (const b of fuoriPosto) {
        if (cambiato || a.i >= b.i || nonAccoppiare.has(chiave(a.k)) || nonAccoppiare.has(chiave(b.k))) continue;
        if (distanza(a.k.attacco, b.k.attacco) > vicinanza) continue;
        const m = { x: (a.k.attacco.x + b.k.attacco.x) / 2, y: (a.k.attacco.y + b.k.attacco.y) / 2 };
        // a metà di un'asta, non sopra un nodo (a un nodo a T non c'è un doppio pendolo interno)
        const suAsta = p.aste.some((s) => distanzaSegmento(m, s.a, s.b) < tol.tau);
        const suNodo = p.aste.some((s) => distanza(s.a, m) < 2 * tol.tau || distanza(s.b, m) < 2 * tol.tau);
        const rifiuta = () => { nonAccoppiare.add(chiave(a.k)); nonAccoppiare.add(chiave(b.k)); };
        if (!suAsta || suNodo) { rifiuta(); continue; }
        const q = clona(p);
        q.corpi = q.corpi.filter((_, i) => i !== a.i && i !== b.i);
        q.corpi.push({ tipo: 'doppioPendoloInterno', attacco: m, angolo: 0, confidenza: Math.min(a.k.confidenza, b.k.confidenza) });
        // come per un pallino che interrompe: l'asta si ferma a un passo dal simbolo
        const meta = Math.min(distanza(a.k.attacco, b.k.attacco) / 2, tol.tau);
        q.aste = q.aste.flatMap((sg) => {
          const lung = distanza(sg.a, sg.b);
          if (lung < 1e-9) return [sg];
          const u = { x: (sg.b.x - sg.a.x) / lung, y: (sg.b.y - sg.a.y) / lung };
          const t = (m.x - sg.a.x) * u.x + (m.y - sg.a.y) * u.y;
          const fuori = Math.abs((m.x - sg.a.x) * u.y - (m.y - sg.a.y) * u.x);
          if (fuori > tol.tau || t <= meta || t >= lung - meta) return [sg];
          return [{ ...sg, b: { x: sg.a.x + u.x * (t - meta), y: sg.a.y + u.y * (t - meta) } },
            { ...sg, a: { x: sg.a.x + u.x * (t + meta), y: sg.a.y + u.y * (t + meta) } }];
        });
        const lq = leggi(q);
        const letto = lq.grafo.giunti.some((gj) => {
          const c = pxDi(lq.grafo, gj.punto);
          return gj.tipo === 'bipendolo' && !!c && distanza(c, m) < 3 * tol.tau;
        });
        if (!letto || (labilita(lq) > 0 && labilita(l) === 0)) { rifiuta(); continue; }
        fatte.push({ messaggio: 'Due incastri vicini a metà asta sono le piastre di un doppio pendolo interno: l\'ho disegnato così.', dove: [m] });
        p = q;
        l = lq;
        cambiato = true;
      }
    }
    if (cambiato) continue;

    // 2b. un incastro alla volta: il tipo successivo, se non rende labile la struttura
    for (const { k, i } of fuoriPosto) {
      const nuovo = migliore(k, ESTERNI.filter((t) => t !== 'incastro'));
      const q = clona(p);
      q.corpi[i].tipo = nuovo;
      const lq = leggi(q);
      if (labilita(lq) > 0 && labilita(l) === 0) continue; // meglio l'incastro di una struttura labile
      fatte.push({ messaggio: `Un incastro lì negli esercizi non c'è (sta dove un'asta finisce): l'ho disegnato come ${NOME[nuovo]}.`, dove: [k.attacco] });
      p = q;
      l = lq;
      cambiato = true;
      break;
    }
    if (!cambiato) break;
  }

  // 3. pezzi staccati: il tratto dimenticato fra i due più vicini
  for (let giro = 0; giro < 6; giro++) {
    const segmento = ponte(l, p, tol);
    if (!segmento) break;
    const q = clona(p);
    const spessore = q.aste.length > 0 ? mediana(q.aste.map((s) => s.spessore)) : 2;
    q.aste.push({ a: segmento[0], b: segmento[1], spessore, confidenza: 0.1 });
    const lq = leggi(q);
    if (labilita(lq) > 0 && labilita(l) === 0) break;
    fatte.push({ messaggio: 'Ho aggiunto un tratto d\'asta che mancava fra due pezzi: controllalo.', dove: segmento });
    p = q;
    l = lq;
  }

  // 4. gli esercizi non sono labili
  const lab = labilita(l);
  if (lab > 0) {
    let risolto = false;
    // una cerniera interna può essere letta in più, e allora l'appoggio giusto non va toccato
    if (l.grafo.giunti.length === 0 && lab <= LABILITA_MASSIMA) {
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
      const migliori = candidati.slice(0, 6);
      const coppie: (typeof candidati)[] = [];
      for (let a = 0; a < migliori.length; a++) {
        for (let b = a + 1; b < migliori.length; b++) {
          if (migliori[a].k !== migliori[b].k) coppie.push([migliori[a], migliori[b]]);
        }
      }
      coppie.sort((x, y) => (x[0].costo + x[1].costo) - (y[0].costo + y[1].costo));
      const inizio = performance.now();
      for (const prova of [...candidati.slice(0, 16).map((c) => [c]), ...coppie.slice(0, 15)]) {
        if (performance.now() - inizio > TEMPO) break;
        const q = clona(p);
        for (const c of prova) q.corpi[c.k].tipo = c.tipo;
        const lq = leggi(q);
        if (labilita(lq) > 0 || !incastriAPosto(lq)) continue;
        for (const c of prova) {
          fatte.push({ messaggio: `La struttura letta era labile: ho cambiato un vincolo da ${NOME[p.corpi[c.k].tipo]} a ${NOME[c.tipo]}. Se quel vincolo era giusto, controlla cerniere interne e aste.`, dove: [p.corpi[c.k].attacco] });
        }
        p = q;
        l = lq;
        risolto = true;
        break;
      }
    }
    if (!risolto) fatte.push({ messaggio: LABILE, dove: [] });
  }

  // gli avvisi puntano ai punti del grafo finale più vicini agli elementi corretti
  const vicino = (q: Punto) => l.grafo.punti.reduce((m, x) => (distanza(x.px, q) < distanza(m.px, q) ? x : m)).id;
  const correzioni: Avviso[] = fatte.map((c) => (c.dove.length === 0 || l.grafo.punti.length === 0
    ? { codice: 'revisione', messaggio: c.messaggio }
    : { codice: 'revisione', messaggio: c.messaggio, punti: [...new Set(c.dove.map(vicino))] }));
  return { lettura: { ...l, avvisi: [...l.avvisi, ...correzioni] }, primitive: p, correzioni };
}

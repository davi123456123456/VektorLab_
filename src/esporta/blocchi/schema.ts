/**
 * §3.1 — SCHEMA STRUTTURALE.
 *
 * È il disegno di riferimento di tutto il documento: chi legge il diagramma
 * del momento a pagina cinque torna qui per sapere dov'è l'asta a3. Deve
 * quindi essere leggibile senza ingrandire, e mostrare le stesse cose dello
 * schermo — aste, tratteggiata, vincoli con i loro simboli, carichi con
 * frecce e valori, quote, etichette.
 *
 * I SIMBOLI DEI VINCOLI sono disegnati dal codice del canvas, non ridisegnati
 * qui: `disegnaVincolo` e compagni ricevono il contesto PDF e non si accorgono
 * della differenza. È l'unico modo di garantire che il carrello sul foglio sia
 * lo stesso carrello dello schermo.
 */

import {
  disegnaVincolo, disegnaSconnessione, disegnaSconnessioneNodale,
} from '../../render/simboli.js';
import { calcolaTratteggiata, latoEffettivo } from '../../core/model/tratteggiata.js';
import { versoreGlobale } from '../../core/model/direzioni.js';
import type { Carico, Progetto, Vincolo } from '../../core/model/types.js';
import type { Etichette } from '../../state/etichette.js';
import type { ContestoPdf } from '../contesto.js';
import type { PaletteDocumento } from '../palette.js';
import {
  inquadra, puntiDelModello, quota, type Inquadratura, type Riquadro,
} from '../disegno.js';

export interface OpzioniSchema {
  progetto: Progetto;
  carichi: Carico[];
  etichette: Etichette;
  palette: PaletteDocumento;
  riquadro: Riquadro;
  /** quote delle lunghezze delle aste */
  conQuote?: boolean;
  /** etichette di nodi e aste */
  conEtichette?: boolean;
  /** simboli dei vincoli; spento nello schema delle reazioni */
  conVincoli?: boolean;
  conCarichi?: boolean;
  /** disegna la struttura in grigio tenue: è lo sfondo dei diagrammi */
  tenue?: boolean;
  /**
   * §3.3 — un colore per corpo rigido.
   *
   * Serve solo quando i corpi sono più di uno: è l'unico modo di far vedere
   * dove la struttura si divide, che è precisamente ciò che il conteggio
   * n = 2 sta dicendo a parole.
   */
  corpi?: { asteIds: readonly unknown[] }[];
}

/**
 * Tinte per i corpi rigidi.
 *
 * Distinte fra loro e distinte dai colori che hanno già un significato —
 * rosso per i vincoli, verde per i carichi, e le quattro dei diagrammi: un
 * corpo colorato di arancione si confonderebbe con un momento.
 */
const TINTE_CORPI = ['#2b6dbd', '#8a4fbf', '#0f7a6a', '#a3541f', '#5b6b8c', '#8c1f5b'];

const num = (v: number, c = 2): string => v.toFixed(c).replace('.', ',');

/**
 * Disegna lo schema e restituisce l'inquadratura, che i blocchi successivi
 * riusano per sovrapporre diagrammi e reazioni allo stesso disegno.
 */
export function disegnaSchema(c: ContestoPdf, o: OpzioniSchema): Inquadratura {
  const { progetto: pr, palette: p } = o;
  const q = inquadra(puntiDelModello(pr), o.riquadro, o.tenue ? 18 : 34);
  const nodi = new Map(pr.nodi.map((n) => [n.id, n]));
  const tratt = calcolaTratteggiata(pr);

  const coloreAsta = o.tenue ? p.strutturaTenue : p.asta;
  const spessore = o.tenue ? 0.8 : 1.6;

  // da asta a corpo, quando la partizione è stata chiesta
  const corpoDi = new Map<string, number>();
  if (o.corpi && o.corpi.length > 1) {
    o.corpi.forEach((corpo, k) => {
      for (const id of corpo.asteIds) corpoDi.set(String(id), k);
    });
  }

  // ── aste ──
  c.save();
  c.lineCap = 'round';
  for (const a of pr.aste) {
    const i = nodi.get(a.nodoIniziale), j = nodi.get(a.nodoFinale);
    if (!i || !j) continue;
    const A = q.p(i.x as unknown as number, i.y as unknown as number);
    const B = q.p(j.x as unknown as number, j.y as unknown as number);
    const k = corpoDi.get(String(a.id));
    c.strokeStyle = k === undefined ? coloreAsta : TINTE_CORPI[k % TINTE_CORPI.length];
    c.lineWidth = k === undefined ? spessore : spessore + 0.8;
    c.setLineDash([]);
    c.beginPath();
    c.moveTo(A.x, A.y); c.lineTo(B.x, B.y);
    c.stroke();

    if (o.tenue) continue;

    /*
     * LA TRATTEGGIATA. Corre parallela all'asta dal lato della fibra di
     * riferimento, e senza di lei il segno di T e M nel documento non è
     * interpretabile: è la convenzione dichiarata in testa al documento, resa
     * visibile su ogni asta.
     */
    const lato = latoEffettivo(tratt, a);
    const dx = B.x - A.x, dy = B.y - A.y;
    const L = Math.hypot(dx, dy) || 1;
    const nx = (-dy / L) * lato * 3.2, ny = (dx / L) * lato * 3.2;
    c.strokeStyle = p.tratteggiata;
    c.lineWidth = 0.6;
    c.setLineDash([2.4, 1.8]);
    c.beginPath();
    c.moveTo(A.x + nx, A.y + ny); c.lineTo(B.x + nx, B.y + ny);
    c.stroke();
    c.setLineDash([]);
  }
  c.restore();

  if (o.tenue) return q;

  // ── nodi ──
  c.save();
  c.fillStyle = p.nodo;
  for (const n of pr.nodi) {
    const P = q.p(n.x as unknown as number, n.y as unknown as number);
    c.beginPath();
    c.arc(P.x, P.y, 1.9, 0, Math.PI * 2);
    c.fill();
  }
  c.restore();

  // ── vincoli, con i simboli del canvas ──
  if (o.conVincoli !== false) {
    for (const n of pr.nodi) {
      if (!n.vincolo) continue;
      const P = q.p(n.x as unknown as number, n.y as unknown as number);
      disegnaVincolo(
        c as unknown as CanvasRenderingContext2D, P, n.vincolo as Vincolo,
        p.vincolo, p.foglio, false, 0.78,
      );
    }
    for (const v of pr.vincoliSuAsta ?? []) {
      const punto = suAsta(pr, v.astaId, v.s, q);
      if (!punto) continue;
      disegnaVincolo(
        c as unknown as CanvasRenderingContext2D, punto, v.vincolo as Vincolo,
        p.vincolo, p.foglio, false, 0.72,
      );
    }
    for (const s of pr.sconnessioni ?? []) {
      const punto = suAsta(pr, s.astaId, s.s, q);
      if (!punto) continue;
      disegnaSconnessione(
        c as unknown as CanvasRenderingContext2D, punto, s.tipo,
        angoloAsta(pr, s.astaId, q), p.vincolo, p.foglio, false, 0.8,
      );
    }
    for (const v of pr.vincoliInterni ?? []) {
      const n = nodi.get(v.nodoId);
      // la biella non è una sconnessione fra tronchi e non ha un simbolo
      // nodale: nello schema compare come vincolo, non qui
      if (!n || v.tipo === 'biella') continue;
      const P = q.p(n.x as unknown as number, n.y as unknown as number);
      disegnaSconnessioneNodale(
        c as unknown as CanvasRenderingContext2D, P, v.tipo,
        p.vincolo, p.foglio, false, 0.8,
      );
    }
  }

  // ── carichi ──
  if (o.conCarichi !== false) disegnaCarichi(c, o, q);

  // ── quote ──
  if (o.conQuote !== false) disegnaQuote(c, o, q);

  // ── etichette ──
  if (o.conEtichette !== false) {
    /*
     * Le etichette si scostano ALLONTANANDOSI dal centro della struttura, per
     * la stessa ragione delle quote: appoggiate sempre dallo stesso lato,
     * dentro un portale finiscono nel mezzo del telaio e sopra le quote.
     */
    const centro = baricentro(pr, q);
    c.dimensione = 7;
    c.base = 'middle';
    for (const n of pr.nodi) {
      const P = q.p(n.x as unknown as number, n.y as unknown as number);
      const dx = P.x - centro.x, dy = P.y - centro.y;
      const L = Math.hypot(dx, dy) || 1;
      c.fillStyle = p.testoAttenuato;
      c.allineamento = dx >= 0 ? 'left' : 'right';
      /*
       * Un nodo vincolato porta un simbolo che occupa lo spazio SOTTO di lui:
       * l'etichetta va quindi spinta di lato e verso l'alto, o si sovrappone
       * al tratteggio del terreno.
       */
      const vincolato = n.vincolo !== undefined;
      const ex = (dx / L) * (vincolato ? 11 : 7);
      const ey = vincolato ? -8 : (dy / L) * 7;
      c.fillText(o.etichette.nodo(n.id), P.x + ex, P.y + ey);
    }
    for (const a of pr.aste) {
      const i = nodi.get(a.nodoIniziale), j = nodi.get(a.nodoFinale);
      if (!i || !j) continue;
      const A = q.p(i.x as unknown as number, i.y as unknown as number);
      const B = q.p(j.x as unknown as number, j.y as unknown as number);
      /*
       * L'etichetta dell'asta sta a UN TERZO, non a metà.
       *
       * La quota della stessa asta è centrata sulla mezzeria, e mettere lì
       * anche l'etichetta le faceva incrociare: su un telaio a dieci aste si
       * leggeva «a5» sopra «3,50 m». Un terzo è abbastanza lontano da non
       * toccarla e abbastanza vicino da restare chiaramente di quell'asta.
       */
      const mx = A.x + (B.x - A.x) / 3, my = A.y + (B.y - A.y) / 3;
      let dx = mx - centro.x, dy = my - centro.y;
      let L = Math.hypot(dx, dy);
      if (L < 4) {
        /*
         * L'asta passa PER il centro — è il caso di una trave sola, dove il
         * baricentro cade sull'asta stessa. Lì la direzione «verso il centro»
         * non esiste, e l'etichetta finirebbe sopra la linea: si scosta
         * perpendicolarmente all'asta, dalla parte opposta alla quota.
         */
        const vx = B.x - A.x, vy = B.y - A.y;
        const M = Math.hypot(vx, vy) || 1;
        dx = vy / M; dy = -vx / M; L = 1;
      }
      c.fillStyle = p.accento;
      c.allineamento = 'center';
      c.fillText(o.etichette.asta(a.id), mx + (dx / L) * 9, my + (dy / L) * 9);
    }
  }
  return q;
}

export { TINTE_CORPI };

/** Centro del disegno sul foglio: serve a decidere che cosa è «fuori». */
function baricentro(pr: Progetto, q: Inquadratura): { x: number; y: number } {
  if (pr.nodi.length === 0) return { x: 0, y: 0 };
  let sx = 0, sy = 0;
  for (const n of pr.nodi) {
    const P = q.p(n.x as unknown as number, n.y as unknown as number);
    sx += P.x; sy += P.y;
  }
  return { x: sx / pr.nodi.length, y: sy / pr.nodi.length };
}

/**
 * Altezza consigliata del riquadro per una struttura, data la larghezza.
 *
 * Una trave in un riquadro quadrato lascia il foglio vuoto; un telaio alto in
 * un riquadro basso viene rimpicciolito fino a non leggersi. Il riquadro
 * segue le proporzioni del modello, entro un minimo che lascia spazio a
 * carichi e quote e un massimo che non manda il blocco a pagina nuova.
 */
export function altezzaSchema(
  pr: Progetto, larghezza: number,
  { minimo = 120, massimo = 430 }: { minimo?: number; massimo?: number } = {},
): number {
  if (pr.nodi.length === 0) return minimo;
  const xs = pr.nodi.map((n) => n.x as unknown as number);
  const ys = pr.nodi.map((n) => n.y as unknown as number);
  const dx = Math.max(...xs) - Math.min(...xs) || 1;
  const dy = Math.max(...ys) - Math.min(...ys);
  // 68 punti sono il doppio del margine dei simboli: è lo spazio che i
  // vincoli e le frecce dei carichi occupano oltre la geometria
  const utile = Math.max(1, larghezza - 68);
  return Math.min(massimo, Math.max(minimo, (dy / dx) * utile + 68));
}

function suAsta(
  pr: Progetto, astaId: unknown, s: number, q: Inquadratura,
): { x: number; y: number } | null {
  const a = pr.aste.find((x) => x.id === astaId);
  if (!a) return null;
  const i = pr.nodi.find((n) => n.id === a.nodoIniziale);
  const j = pr.nodi.find((n) => n.id === a.nodoFinale);
  if (!i || !j) return null;
  const x = (i.x as unknown as number) + ((j.x as unknown as number) - (i.x as unknown as number)) * s;
  const y = (i.y as unknown as number) + ((j.y as unknown as number) - (i.y as unknown as number)) * s;
  return q.p(x, y);
}

/** Coseno e seno dell'asse dell'asta, nel riferimento del modello. */
function assiAsta(pr: Progetto, astaId: unknown): { c: number; s: number } | null {
  const a = pr.aste.find((x) => x.id === astaId);
  if (!a) return null;
  const i = pr.nodi.find((n) => n.id === a.nodoIniziale);
  const j = pr.nodi.find((n) => n.id === a.nodoFinale);
  if (!i || !j) return null;
  const dx = (j.x as unknown as number) - (i.x as unknown as number);
  const dy = (j.y as unknown as number) - (i.y as unknown as number);
  const L = Math.hypot(dx, dy) || 1;
  return { c: dx / L, s: dy / L };
}

function angoloAsta(pr: Progetto, astaId: unknown, q: Inquadratura): number {
  const a = pr.aste.find((x) => x.id === astaId);
  if (!a) return 0;
  const i = pr.nodi.find((n) => n.id === a.nodoIniziale);
  const j = pr.nodi.find((n) => n.id === a.nodoFinale);
  if (!i || !j) return 0;
  const A = q.p(i.x as unknown as number, i.y as unknown as number);
  const B = q.p(j.x as unknown as number, j.y as unknown as number);
  return Math.atan2(B.y - A.y, B.x - A.x);
}

// ═══════════════════════ CARICHI ═══════════════════════

/**
 * Le frecce dei carichi, con il valore accanto.
 *
 * La lunghezza delle frecce è proporzionale al modulo, ma con un minimo e un
 * massimo: un carico dieci volte più piccolo di un altro deve vedersi che è
 * più piccolo, e non deve sparire.
 */
function disegnaCarichi(c: ContestoPdf, o: OpzioniSchema, q: Inquadratura): void {
  const { progetto: pr, palette: p } = o;
  const nodi = new Map(pr.nodi.map((n) => [n.id, n]));
  if (o.carichi.length === 0) return;

  let massimo = 0;
  for (const k of o.carichi) {
    if (k.tipo === 'forzaNodale' || k.tipo === 'forzaInCampata') {
      massimo = Math.max(massimo, Math.hypot(k.fx as unknown as number, k.fy as unknown as number));
    } else if (k.tipo === 'distribuito') {
      massimo = Math.max(massimo,
        Math.abs(k.q1 as unknown as number), Math.abs(k.q2 as unknown as number));
    }
  }
  if (massimo <= 0) massimo = 1;
  const lunghezza = (v: number) => 10 + 22 * Math.min(1, Math.abs(v) / massimo);

  c.save();
  c.dimensione = 6.6;
  c.base = 'middle';

  for (const k of o.carichi) {
    if (k.tipo === 'forzaNodale') {
      const n = nodi.get(k.nodoId);
      if (!n) continue;
      const P = q.p(n.x as unknown as number, n.y as unknown as number);
      freccia(c, p, P, k.fx as unknown as number, k.fy as unknown as number,
        lunghezza(Math.hypot(k.fx as unknown as number, k.fy as unknown as number)),
        `${num(Math.hypot(k.fx as unknown as number, k.fy as unknown as number) / 1e3, 1)} kN`);
      continue;
    }
    if (k.tipo === 'forzaInCampata') {
      const P = suAsta(pr, k.astaId, k.s, q);
      if (!P) continue;
      /*
       * Una forza in campata dichiarata in assi LOCALI va ruotata come l'asta
       * prima di disegnarla: altrimenti su una diagonale la freccia punta
       * dove il carico non agisce.
       */
      const fx0 = k.fx as unknown as number, fy0 = k.fy as unknown as number;
      const asse = assiAsta(pr, k.astaId);
      const g = k.riferimento === 'locale' && asse
        ? { fx: fx0 * asse.c - fy0 * asse.s, fy: fx0 * asse.s + fy0 * asse.c }
        : { fx: fx0, fy: fy0 };
      freccia(c, p, P, g.fx, g.fy, lunghezza(Math.hypot(g.fx, g.fy)),
        `${num(Math.hypot(g.fx, g.fy) / 1e3, 1)} kN`);
      continue;
    }
    if (k.tipo === 'momentoNodale') {
      const n = nodi.get(k.nodoId);
      if (!n) continue;
      const P = q.p(n.x as unknown as number, n.y as unknown as number);
      arcoMomento(c, p, P, (k.mz as unknown as number) >= 0,
        `${num(Math.abs(k.mz as unknown as number) / 1e3, 1)} kNm`);
      continue;
    }
    if (k.tipo === 'momentoInCampata') {
      const P = suAsta(pr, k.astaId, k.s, q);
      if (!P) continue;
      arcoMomento(c, p, P, (k.mz as unknown as number) >= 0,
        `${num(Math.abs(k.mz as unknown as number) / 1e3, 1)} kNm`);
      continue;
    }
    if (k.tipo === 'distribuito') distribuito(c, o, q, k, lunghezza);
  }
  c.restore();
}

function freccia(
  c: ContestoPdf, p: PaletteDocumento,
  punta: { x: number; y: number }, fx: number, fy: number,
  L: number, etichetta: string,
): void {
  const m = Math.hypot(fx, fy);
  if (m <= 0) return;
  // sullo schermo la y cresce verso il basso: una forza verso il basso
  // (fy < 0) va disegnata verso il basso
  const ux = fx / m, uy = -fy / m;
  const coda = { x: punta.x - ux * L, y: punta.y - uy * L };

  c.strokeStyle = p.carico;
  c.fillStyle = p.carico;
  c.lineWidth = 1.1;
  c.setLineDash([]);
  c.beginPath();
  c.moveTo(coda.x, coda.y); c.lineTo(punta.x, punta.y);
  c.stroke();

  const f = 3.4;
  const nx = -uy, ny = ux;
  c.beginPath();
  c.moveTo(punta.x, punta.y);
  c.lineTo(punta.x - ux * f * 2 + nx * f * 0.7, punta.y - uy * f * 2 + ny * f * 0.7);
  c.lineTo(punta.x - ux * f * 2 - nx * f * 0.7, punta.y - uy * f * 2 - ny * f * 0.7);
  c.closePath();
  c.fill();

  c.fillStyle = p.carico;
  c.allineamento = ux >= 0 ? 'right' : 'left';
  c.fillText(etichetta, coda.x - ux * 3, coda.y - uy * 3);
}

function arcoMomento(
  c: ContestoPdf, p: PaletteDocumento,
  centro: { x: number; y: number }, antiorario: boolean, etichetta: string,
): void {
  const r = 9;
  c.strokeStyle = p.carico;
  c.fillStyle = p.carico;
  c.lineWidth = 1.1;
  c.setLineDash([]);
  c.beginPath();
  c.arc(centro.x, centro.y, r, -Math.PI * 0.75, Math.PI * 0.55);
  c.stroke();
  const t = antiorario ? -Math.PI * 0.75 : Math.PI * 0.55;
  const P = { x: centro.x + r * Math.cos(t), y: centro.y + r * Math.sin(t) };
  const d = antiorario ? -1 : 1;
  c.beginPath();
  c.moveTo(P.x, P.y);
  c.lineTo(P.x + d * 3.4 * Math.sin(t) + 2, P.y - d * 3.4 * Math.cos(t) + 1);
  c.lineTo(P.x + d * 3.4 * Math.sin(t) - 2, P.y - d * 3.4 * Math.cos(t) - 1);
  c.closePath();
  c.fill();
  c.allineamento = 'center';
  c.fillText(etichetta, centro.x, centro.y - r - 6);
}

function distribuito(
  c: ContestoPdf, o: OpzioniSchema, q: Inquadratura,
  k: Extract<Carico, { tipo: 'distribuito' }>,
  lunghezza: (v: number) => number,
): void {
  const { progetto: pr, palette: p } = o;
  const a = pr.aste.find((x) => x.id === k.astaId);
  if (!a) return;
  const i = pr.nodi.find((n) => n.id === a.nodoIniziale);
  const j = pr.nodi.find((n) => n.id === a.nodoFinale);
  if (!i || !j) return;

  const ix = i.x as unknown as number, iy = i.y as unknown as number;
  const jx = j.x as unknown as number, jy = j.y as unknown as number;
  const s0 = k.sIniziale, s1 = k.sFinale;
  const q1 = k.q1 as unknown as number, q2 = k.q2 as unknown as number;

  /*
   * La DIREZIONE del carico distribuito non si indovina dal segno: dipende dal
   * modo di riferimento (globale, locale, per proiezione). La si chiede al
   * modulo che la definisce, che è lo stesso usato dal calcolo.
   */
  const asse = assiAsta(pr, k.astaId) ?? { c: 1, s: 0 };
  const verso = versoreGlobale(k.direzione, asse);

  // tratti in numero PARI: le frecce vanno a punti alterni, e così ce n'è
  // una anche sull'estremo destro (con 9 il carico finiva senza freccia)
  const N = 10;
  c.strokeStyle = p.carico;
  c.fillStyle = p.carico;
  c.lineWidth = 0.9;
  c.setLineDash([]);

  const cima: { x: number; y: number }[] = [];
  for (let t = 0; t <= N; t++) {
    const s = s0 + ((s1 - s0) * t) / N;
    const v = q1 + ((q2 - q1) * t) / N;
    const base = q.p(ix + (jx - ix) * s, iy + (jy - iy) * s);
    /*
     * IL SEGNO STA NEL VALORE, non nel versore: `versoreGlobale` dà la
     * direzione del riferimento scelto, e q negativa significa «nell'altro
     * verso». Ignorarlo faceva puntare in alto un carico che va in basso, che
     * è l'errore più visibile che uno schema strutturale possa contenere.
     */
    const segno = v >= 0 ? 1 : -1;
    const dir = { x: verso[0] * segno, y: -verso[1] * segno };
    const L = lunghezza(v) * 0.7;
    const alto = { x: base.x - dir.x * L, y: base.y - dir.y * L };
    cima.push(alto);
    if (t % 2 === 0) {
      c.beginPath();
      c.moveTo(alto.x, alto.y); c.lineTo(base.x, base.y);
      c.stroke();
      const f = 2.4;
      const ux = dir.x, uy = dir.y;
      const nx = -uy, ny = ux;
      c.beginPath();
      c.moveTo(base.x, base.y);
      c.lineTo(base.x - ux * f * 2 + nx * f * 0.7, base.y - uy * f * 2 + ny * f * 0.7);
      c.lineTo(base.x - ux * f * 2 - nx * f * 0.7, base.y - uy * f * 2 - ny * f * 0.7);
      c.closePath();
      c.fill();
    }
  }
  c.lineWidth = 1.1;
  c.beginPath();
  cima.forEach((v, t) => (t === 0 ? c.moveTo(v.x, v.y) : c.lineTo(v.x, v.y)));
  c.stroke();

  const testo = Math.abs(q1 - q2) < 1e-9
    ? `${num(Math.abs(q1) / 1e3, 1)} kN/m`
    : `${num(Math.abs(q1) / 1e3, 1)}→${num(Math.abs(q2) / 1e3, 1)} kN/m`;
  const mezzo = cima[Math.floor(cima.length / 2)];
  c.fillStyle = p.carico;
  c.allineamento = 'center';
  c.base = 'bottom';
  c.fillText(testo, mezzo.x, mezzo.y - 2);
  c.base = 'middle';
}

// ═══════════════════════ QUOTE ═══════════════════════

/**
 * Quote delle aste.
 *
 * Si quota ogni asta con la sua lunghezza, dal lato opposto alla tratteggiata
 * così le due non si accavallano. Su strutture con molte aste le quote si
 * fitterebbero: sopra le dodici aste si quotano soltanto gli ingombri
 * complessivi, perché venti numeri sovrapposti non sono venti quote.
 */
function disegnaQuote(c: ContestoPdf, o: OpzioniSchema, q: Inquadratura): void {
  const { progetto: pr, palette: p } = o;
  const nodi = new Map(pr.nodi.map((n) => [n.id, n]));

  if (pr.aste.length <= 12) {
    const centro = baricentro(pr, q);
    for (const a of pr.aste) {
      const i = nodi.get(a.nodoIniziale), j = nodi.get(a.nodoFinale);
      if (!i || !j) continue;
      const ix = i.x as unknown as number, iy = i.y as unknown as number;
      const jx = j.x as unknown as number, jy = j.y as unknown as number;
      const L = Math.hypot(jx - ix, jy - iy);
      if (L < 1e-9) continue;
      const A = q.p(ix, iy), B = q.p(jx, jy);
      /*
       * DOVE VA LA QUOTA. Sulle aste orizzontali va SOTTO, come in qualunque
       * disegno tecnico: sopra ci stanno i carichi, e una quota fra le frecce
       * di un distribuito non si legge. Sulle altre va dalla parte esterna,
       * lontano dal corpo della struttura, perché dentro un telaio finirebbe
       * addosso alle etichette delle aste.
       */
      const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
      const dx = B.x - A.x, dy = B.y - A.y;
      const orizzontale = Math.abs(dy) < Math.abs(dx) * 0.36;
      let verso: number;
      if (orizzontale) {
        // la normale (-dy, dx) punta in basso sullo schermo quando dx > 0
        verso = dx >= 0 ? 1 : -1;
      } else {
        const nx = -dy, ny = dx;
        verso = (mx - centro.x) * nx + (my - centro.y) * ny >= 0 ? 1 : -1;
      }
      quota(c, p, A, B, `${num(L, 2)} m`, 15 * verso);
    }
    return;
  }

  const xs = pr.nodi.map((n) => n.x as unknown as number);
  const ys = pr.nodi.map((n) => n.y as unknown as number);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const y0 = Math.min(...ys), y1 = Math.max(...ys);
  quota(c, p, q.p(x0, y0), q.p(x1, y0), `${num(x1 - x0, 2)} m`, 24);
  quota(c, p, q.p(x1, y0), q.p(x1, y1), `${num(y1 - y0, 2)} m`, -24);
}

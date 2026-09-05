/**
 * Strumenti di disegno condivisi dai blocchi del documento.
 *
 * Il pezzo centrale è `inquadra`: porta un modello in metri dentro un riquadro
 * in punti tipografici, con lo stesso rapporto in x e in y — perché una
 * struttura schiacciata su un asse non è più la struttura, e un angolo di 45°
 * che sul foglio ne misura 30 è un disegno che mente.
 */

import type { Progetto } from '../core/model/types.js';
import type { ContestoPdf } from './contesto.js';
import type { PaletteDocumento } from './palette.js';

export interface Riquadro { x: number; y: number; w: number; h: number }

export interface Inquadratura {
  /** da metri a punti */
  k: number;
  /** porta un punto del modello sul foglio */
  p(x: number, y: number): { x: number; y: number };
  riquadro: Riquadro;
}

/**
 * Adatta un insieme di punti a un riquadro, isotropicamente.
 *
 * `margine` è in punti e serve a lasciare spazio ai simboli dei vincoli e alle
 * frecce dei carichi, che sporgono oltre la geometria: senza, un incastro
 * disegnato al bordo del riquadro finisce mezzo fuori.
 */
export function inquadra(
  punti: readonly { x: number; y: number }[], r: Riquadro, margine = 26,
): Inquadratura {
  const xs = punti.map((p) => p.x), ys = punti.map((p) => p.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const y0 = Math.min(...ys), y1 = Math.max(...ys);
  const dx = x1 - x0, dy = y1 - y0;

  const utileW = Math.max(1, r.w - 2 * margine);
  const utileH = Math.max(1, r.h - 2 * margine);

  /*
   * UNA DIMENSIONE NULLA NON VINCOLA. Una trave orizzontale ha dy = 0: se la
   * si tratta come 1 per non dividere per zero, il rapporto altezza/estensione
   * diventa enorme e la scala che ne esce rimpicciolisce la trave a metà
   * riquadro. Una struttura piatta deve riempire la larghezza.
   */
  const QUASI = 1e-9;
  const perX = dx > QUASI ? utileW / dx : Number.POSITIVE_INFINITY;
  const perY = dy > QUASI ? utileH / dy : Number.POSITIVE_INFINITY;
  const k = Number.isFinite(Math.min(perX, perY)) ? Math.min(perX, perY) : 1;

  // centrato nel riquadro; la y del modello cresce verso l'alto, quella del
  // foglio verso il basso — è l'unico ribaltamento che resta da fare
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;

  return {
    k,
    riquadro: r,
    p: (x, y) => ({ x: cx + (x - mx) * k, y: cy - (y - my) * k }),
  };
}

/** I punti che devono entrare nell'inquadratura di un modello. */
export function puntiDelModello(p: Progetto): { x: number; y: number }[] {
  return p.nodi.length > 0
    ? p.nodi.map((n) => ({ x: n.x as unknown as number, y: n.y as unknown as number }))
    : [{ x: 0, y: 0 }, { x: 1, y: 1 }];
}

// ═══════════════════════ ELEMENTI RICORRENTI ═══════════════════════

/** Titolo di un blocco, con il filetto sotto. */
export function titoloBlocco(
  c: ContestoPdf, p: PaletteDocumento, numero: string, testo: string,
  x: number, y: number, larghezza: number,
): number {
  c.grassetto = true;
  c.dimensione = 12;
  c.fillStyle = p.testo;
  c.allineamento = 'left';
  c.base = 'alphabetic';
  c.fillText(`${numero}. ${testo}`, x, y);
  c.grassetto = false;
  c.strokeStyle = p.linea;
  c.lineWidth = 0.6;
  c.beginPath();
  c.moveTo(x, y + 4);
  c.lineTo(x + larghezza, y + 4);
  c.stroke();
  return y + 16;
}

/** Riga di testo semplice; restituisce la y della riga successiva. */
export function riga(
  c: ContestoPdf, testo: string, x: number, y: number,
  { dimensione = 8.5, colore, grassetto = false }: {
    dimensione?: number; colore?: string; grassetto?: boolean;
  } = {},
): number {
  c.dimensione = dimensione;
  c.grassetto = grassetto;
  if (colore) c.fillStyle = colore;
  c.allineamento = 'left';
  c.base = 'alphabetic';
  c.fillText(testo, x, y);
  c.grassetto = false;
  return y + dimensione * 1.45;
}

/**
 * Testo che va a capo dentro una larghezza.
 *
 * Le righe si spezzano sugli spazi misurando con le larghezze vere del font:
 * dividere per una larghezza media sbaglia di parecchio su una riga di numeri,
 * dove le cifre sono strette e le unità larghe.
 */
export function paragrafo(
  c: ContestoPdf, testo: string, x: number, y: number, larghezza: number,
  { dimensione = 8, colore }: { dimensione?: number; colore?: string } = {},
): number {
  c.dimensione = dimensione;
  if (colore) c.fillStyle = colore;
  c.allineamento = 'left';
  c.base = 'alphabetic';

  const parole = testo.split(/\s+/);
  let corrente = '';
  let yy = y;
  const scrivi = () => {
    if (corrente) { c.fillText(corrente, x, yy); yy += dimensione * 1.4; }
  };
  for (const w of parole) {
    const prova = corrente ? `${corrente} ${w}` : w;
    if (c.misura(prova, dimensione) > larghezza && corrente) {
      scrivi(); corrente = w;
    } else {
      corrente = prova;
    }
  }
  scrivi();
  return yy;
}

// ═══════════════════════ TABELLE ═══════════════════════

export interface ColonnaTabella {
  testo: string;
  /** unità, scritta sotto il nome nell'intestazione */
  unita?: string;
  larghezza: number;
  allinea?: 'left' | 'right' | 'center';
}

/**
 * Una tabella con l'intestazione ripetuta se cambia pagina.
 *
 * `nuovaPagina` viene chiamata quando lo spazio finisce e deve restituire il
 * contesto della pagina nuova e la y di partenza: così la tabella non sa nulla
 * dell'impaginazione e l'impaginazione non sa nulla della tabella.
 */
export function tabella(
  c: ContestoPdf, p: PaletteDocumento,
  colonne: ColonnaTabella[], righe: string[][],
  x: number, y: number,
  opzioni: {
    dimensione?: number;
    limite?: number;
    nuovaPagina?: () => { c: ContestoPdf; y: number };
    evidenzia?: (i: number) => string | null;
  } = {},
): { c: ContestoPdf; y: number } {
  const dim = opzioni.dimensione ?? 7.6;
  const hRiga = dim * 1.75;
  const hTesta = colonne.some((k) => k.unita) ? dim * 2.5 : dim * 1.9;
  const larghezza = colonne.reduce((a, k) => a + k.larghezza, 0);

  let ctx = c;
  let yy = y;

  const testa = () => {
    ctx.dimensione = dim;
    ctx.base = 'alphabetic';
    let cx = x;
    for (const k of colonne) {
      ctx.fillStyle = p.testoAttenuato;
      ctx.allineamento = k.allinea ?? 'left';
      const ax = k.allinea === 'right' ? cx + k.larghezza - 3
        : k.allinea === 'center' ? cx + k.larghezza / 2 : cx + 3;
      ctx.fillText(k.testo, ax, yy + dim);
      if (k.unita) {
        ctx.dimensione = dim - 0.8;
        ctx.fillText(k.unita, ax, yy + dim * 2);
        ctx.dimensione = dim;
      }
      cx += k.larghezza;
    }
    yy += hTesta;
    ctx.strokeStyle = p.linea;
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(x, yy - 2); ctx.lineTo(x + larghezza, yy - 2);
    ctx.stroke();
  };

  testa();

  righe.forEach((r, i) => {
    if (opzioni.limite !== undefined && yy + hRiga > opzioni.limite && opzioni.nuovaPagina) {
      const nuova = opzioni.nuovaPagina();
      ctx = nuova.c; yy = nuova.y;
      testa();
    }
    const sfondo = opzioni.evidenzia?.(i);
    if (sfondo) {
      ctx.fillStyle = sfondo;
      ctx.fillRect(x, yy - 1, larghezza, hRiga);
    }
    ctx.dimensione = dim;
    ctx.base = 'alphabetic';
    let cx = x;
    r.forEach((cella, k) => {
      const col = colonne[k];
      if (!col) return;
      ctx.fillStyle = k === 0 ? p.testo : p.testoAttenuato;
      ctx.allineamento = col.allinea ?? 'left';
      const ax = col.allinea === 'right' ? cx + col.larghezza - 3
        : col.allinea === 'center' ? cx + col.larghezza / 2 : cx + 3;
      ctx.fillText(cella, ax, yy + dim);
      cx += col.larghezza;
    });
    yy += hRiga;
    ctx.strokeStyle = p.lineaTenue;
    ctx.lineWidth = 0.4;
    ctx.beginPath();
    ctx.moveTo(x, yy - 1); ctx.lineTo(x + larghezza, yy - 1);
    ctx.stroke();
  });

  return { c: ctx, y: yy + 4 };
}

// ═══════════════════════ QUOTE ═══════════════════════

/**
 * Una quota fra due punti del foglio, con la misura scritta sopra la linea.
 *
 * È il disegno tecnico di sempre: due linee di richiamo, una linea di misura
 * con le frecce agli estremi, e il numero. Il numero sta SOPRA la linea e
 * ruotato con essa, così una quota inclinata resta leggibile senza girare il
 * foglio.
 */
export function quota(
  c: ContestoPdf, p: PaletteDocumento,
  a: { x: number; y: number }, b: { x: number; y: number },
  testo: string, scostamento = 14,
): void {
  const dx = b.x - a.x, dy = b.y - a.y;
  const L = Math.hypot(dx, dy);
  if (L < 1) return;
  const ux = dx / L, uy = dy / L;
  // normale, scelta in modo che la quota cada dalla parte "esterna"
  const nx = -uy, ny = ux;
  const s = scostamento;

  const a1 = { x: a.x + nx * s, y: a.y + ny * s };
  const b1 = { x: b.x + nx * s, y: b.y + ny * s };

  c.save();
  c.strokeStyle = p.quota;
  c.lineWidth = 0.5;
  c.setLineDash([]);
  // richiami
  c.beginPath();
  c.moveTo(a.x + nx * 3, a.y + ny * 3); c.lineTo(a1.x + nx * 3, a1.y + ny * 3);
  c.moveTo(b.x + nx * 3, b.y + ny * 3); c.lineTo(b1.x + nx * 3, b1.y + ny * 3);
  c.stroke();
  // linea di misura
  c.beginPath();
  c.moveTo(a1.x, a1.y); c.lineTo(b1.x, b1.y);
  c.stroke();
  // frecce
  for (const [q, verso] of [[a1, 1], [b1, -1]] as const) {
    const f = 3.2;
    c.beginPath();
    c.moveTo(q.x, q.y);
    c.lineTo(q.x + verso * ux * f * 2 + nx * f * 0.6, q.y + verso * uy * f * 2 + ny * f * 0.6);
    c.lineTo(q.x + verso * ux * f * 2 - nx * f * 0.6, q.y + verso * uy * f * 2 - ny * f * 0.6);
    c.closePath();
    c.fillStyle = p.quota;
    c.fill();
  }
  // testo, ruotato con la linea e sempre "in piedi"
  const mx = (a1.x + b1.x) / 2, my = (a1.y + b1.y) / 2;
  let ang = Math.atan2(dy, dx);
  if (ang > Math.PI / 2 || ang < -Math.PI / 2) ang += Math.PI;
  c.save();
  c.translate(mx, my);
  c.rotate(ang);
  c.fillStyle = p.quota;
  c.dimensione = 7;
  c.allineamento = 'center';
  c.base = 'bottom';
  c.fillText(testo, 0, -2);
  c.restore();
  c.restore();
}

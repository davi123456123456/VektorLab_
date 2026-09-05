/**
 * §4.1 — LA PALETTE CHIARA, DERIVATA DA QUELLA DEL SITO.
 *
 * I colori NON sono ridefiniti qui: si parte da `leggiTema()`, cioè dalle
 * stesse variabili CSS che alimentano il canvas. Se domani `--momento` diventa
 * un altro arancione, cambia insieme il diagramma a schermo e quello nel PDF.
 *
 * L'unico adattamento è il fondo. L'applicazione lavora su nero, il foglio è
 * bianco, e le stesse tinte si comportano in modo opposto sui due fondi: un
 * giallo che risalta sul nero sparisce sul bianco. Quindi si conserva la
 * TINTA — l'identità cromatica di N, T, M e deformata, che è ciò per cui i
 * colori esistono — e si scurisce quanto basta perché il contrasto regga.
 *
 * «Quanto basta» non è a occhio: è il rapporto di contrasto WCAG, calcolato,
 * e c'è un test che lo verifica su ogni colore della palette.
 */

import { leggiTema, type Tema } from '../render/tema.js';

// ═══════════════════════ COLORE: LETTURA E CONTRASTO ═══════════════════════

export interface Rgb { r: number; g: number; b: number }

/** Legge `#rgb`, `#rrggbb` o `rgb(...)`. Restituisce null se non riconosciuto. */
export function leggiColore(c: string): Rgb | null {
  const s = c.trim();
  if (s.startsWith('#')) {
    const n = s.slice(1);
    if (n.length === 3) {
      return {
        r: parseInt(n[0] + n[0], 16),
        g: parseInt(n[1] + n[1], 16),
        b: parseInt(n[2] + n[2], 16),
      };
    }
    if (n.length === 6) {
      return {
        r: parseInt(n.slice(0, 2), 16),
        g: parseInt(n.slice(2, 4), 16),
        b: parseInt(n.slice(4, 6), 16),
      };
    }
    return null;
  }
  const m = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(s);
  return m ? { r: +m[1], g: +m[2], b: +m[3] } : null;
}

export const scriviColore = ({ r, g, b }: Rgb): string =>
  `#${[r, g, b].map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('')}`;

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

/** Luminanza relativa secondo WCAG 2.1. */
export function luminanza({ r, g, b }: Rgb): number {
  const lin = (v: number) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** Rapporto di contrasto WCAG fra due colori: da 1 (uguali) a 21 (bianco/nero). */
export function contrasto(a: Rgb, b: Rgb): number {
  const la = luminanza(a), lb = luminanza(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const BIANCO: Rgb = { r: 255, g: 255, b: 255 };

/** Contrasto di un colore sul foglio bianco. */
export const suBianco = (c: Rgb): number => contrasto(c, BIANCO);

// ═══════════════════════ TINTA, SATURAZIONE, LUMINOSITÀ ═══════════════════════

interface Hsl { h: number; s: number; l: number }

export function aHsl({ r, g, b }: Rgb): Hsl {
  const R = r / 255, G = g / 255, B = b / 255;
  const max = Math.max(R, G, B), min = Math.min(R, G, B);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === R) h = ((G - B) / d + (G < B ? 6 : 0)) / 6;
  else if (max === G) h = ((B - R) / d + 2) / 6;
  else h = ((R - G) / d + 4) / 6;
  return { h, s, l };
}

export function daHsl({ h, s, l }: Hsl): Rgb {
  if (s === 0) {
    const v = Math.round(l * 255);
    return { r: v, g: v, b: v };
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const canale = (t: number) => {
    let u = t;
    if (u < 0) u += 1;
    if (u > 1) u -= 1;
    if (u < 1 / 6) return p + (q - p) * 6 * u;
    if (u < 1 / 2) return q;
    if (u < 2 / 3) return p + (q - p) * (2 / 3 - u) * 6;
    return p;
  };
  return {
    r: Math.round(canale(h + 1 / 3) * 255),
    g: Math.round(canale(h) * 255),
    b: Math.round(canale(h - 1 / 3) * 255),
  };
}

/**
 * Scurisce un colore fino a raggiungere il contrasto richiesto sul bianco,
 * LASCIANDO LA TINTA DOV'È.
 *
 * Scurire abbassando la luminosità e non desaturando è la scelta che conserva
 * l'identità del colore: il momento resta arancione, il taglio resta verde, e
 * il lettore che ha in mente lo schermo riconosce il diagramma sul foglio. Un
 * grigio con lo stesso contrasto sarebbe leggibile e muto.
 */
export function scurisciFinoA(colore: string, minimo: number): string {
  const rgb = leggiColore(colore);
  if (!rgb) return colore;
  if (suBianco(rgb) >= minimo) return scriviColore(rgb);

  const hsl = aHsl(rgb);
  // bisezione sulla luminosità: monotòna, quindi converge sempre e in fretta
  let alto = hsl.l, basso = 0;
  for (let i = 0; i < 40; i++) {
    const mezzo = (alto + basso) / 2;
    const c = daHsl({ ...hsl, l: mezzo });
    if (suBianco(c) >= minimo) basso = mezzo; else alto = mezzo;
  }
  return scriviColore(daHsl({ ...hsl, l: basso }));
}

// ═══════════════════════ LA PALETTE DEL DOCUMENTO ═══════════════════════

/**
 * Soglie di contrasto sul bianco.
 *
 * Il testo deve reggere il criterio WCAG AA (4,5); le linee dei diagrammi sono
 * elementi grafici e bastano 3, che è la soglia per i grafici — chiedere 4,5
 * anche a loro le scurirebbe fino a farle somigliare tutte al nero.
 */
export const CONTRASTO_TESTO = 4.5;
export const CONTRASTO_GRAFICA = 3;

/**
 * I tratti SUBORDINATI hanno una soglia loro, e a due lati.
 *
 * La struttura grigia sotto un diagramma, il filetto tenue di una tabella, la
 * tratteggiata: devono vedersi in stampa — sotto 1,6 su carta spariscono — ma
 * devono anche RESTARE sotto la soglia della grafica, altrimenti competono con
 * ciò che stanno accompagnando e il diagramma non si stacca più dal suo
 * riferimento. Un massimo, qui, è un requisito quanto il minimo.
 */
export const CONTRASTO_TENUE_MIN = 1.6;
export const CONTRASTO_TENUE_MAX = 3;

export interface PaletteDocumento {
  /** fondo del foglio */
  foglio: string;
  testo: string;
  testoAttenuato: string;
  /** filetti, bordi di tabella, riquadri */
  linea: string;
  lineaTenue: string;
  /** la struttura di riferimento sotto i diagrammi */
  strutturaTenue: string;

  asta: string;
  nodo: string;
  vincolo: string;
  carico: string;
  tratteggiata: string;
  quota: string;

  sforzoNormale: string;
  taglio: string;
  momento: string;
  deformata: string;
  reazione: string;

  ok: string;
  errore: string;
  avviso: string;
  accento: string;
}

/**
 * Deriva la palette del documento da quella dello schermo.
 *
 * Fondo e testo si scambiano i ruoli — è l'unica cosa che si ribalta. Tutto il
 * resto conserva la tinta e viene scurito solo se il contrasto sul bianco non
 * regge.
 */
export function paletteDocumento(tema: Tema = leggiTema()): PaletteDocumento {
  const g = (c: string) => scurisciFinoA(c, CONTRASTO_GRAFICA);
  const t = (c: string) => scurisciFinoA(c, CONTRASTO_TESTO);

  return {
    foglio: '#ffffff',
    // il testo non deriva da `--testo` (un grigio chiaro pensato per il nero):
    // sul bianco il suo posto lo prende un quasi-nero, che è il ribaltamento
    // del ruolo, non della tinta
    testo: '#14171c',
    testoAttenuato: '#4a5361',
    // i filetti di tabella portano informazione — separano le colonne — e
    // stanno quindi con la grafica, non con i tratti subordinati
    linea: '#767f8d',
    lineaTenue: '#c2c9d3',
    strutturaTenue: '#a8b0bc',

    asta: '#2b323c',
    nodo: t(tema.nodo),
    vincolo: t(tema.vincolo),
    carico: t(tema.carico),
    tratteggiata: '#949cab',
    quota: '#5a6373',

    // ── le quattro tinte che devono restare riconoscibili ──
    sforzoNormale: g(tema.sforzoNormale),
    taglio: g(tema.taglio),
    momento: g(tema.momento),
    deformata: g(tema.deformata),
    reazione: g(tema.reazione),

    ok: t(tema.taglio),
    errore: t(tema.vincolo),
    avviso: t('#ffbd2e'),
    accento: t(tema.accento),
  };
}

/** Le tinte dei diagrammi, per il controllo di corrispondenza con lo schermo. */
export const TINTE_DIAGRAMMI = [
  'sforzoNormale', 'taglio', 'momento', 'deformata',
] as const satisfies readonly (keyof PaletteDocumento & keyof Tema)[];

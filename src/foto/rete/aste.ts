/**
 * ASTE DALLA SEGMENTAZIONE — i segmenti d'asta fra i nodi che la rete trova.
 *
 * I vertici sono i picchi del canale dei nodi (estremi delle aste, anche
 * quelli accorciati davanti a un pallino che interrompe la linea). Una
 * coppia di vertici è un'asta se la retta che li unisce corre sulla classe
 * «asta» della segmentazione:
 *
 *   · almeno il 60 % dei campioni (ogni 2 px) ha una cella d'asta entro 1
 *     cella, e al più il 15 % è sfondo: carichi e ausiliarie sopra l'asta (la
 *     punta di una forza, un richiamo di quota) non la spezzano, e nelle foto
 *     vere le aste sottili si confondono spesso con loro. I simboli invece
 *     contano come sfondo: il pallino di una cerniera interna è un buco;
 *   · nessun tratto di sfondo più lungo di max(6 px, 1.2 × raggio tipico dei
 *     pallini): un tratto sbiadito di pochi pixel non divide l'asta;
 *   · nessun pallino col centro sulla retta (entro mezzo raggio) all'interno
 *     del segmento: un pallino centrato sulla linea la interrompe e l'asta lì
 *     si divide (la regola di Davide), anche quando il buco è di pochi pixel.
 *
 * Fra le coppie accettate si tolgono quelle che passano su un terzo vertice
 * a sua volta collegato a entrambe: restano i pezzi fra nodi consecutivi.
 * Tutto in pixel d'ingresso con y verso il basso.
 */

import { mediana } from '../geometria.js';
import type { Pallino, Punto, SegmentoAsta } from '../tipi.js';
import type { Uscite } from './tensori.js';
import { CLASSE, PASSO_SEG } from './vocabolario.js';

export const ASTE = { lunghezzaMinima: 10, passo: 2, asta: 0.6, sfondo: 0.15, buco: 6, bucoRaggi: 1.2, allineato: 6 };

function cella(u: Uscite, x: number, y: number): [number, number] {
  return [Math.round((y - (PASSO_SEG - 1) / 2) / PASSO_SEG), Math.round((x - (PASSO_SEG - 1) / 2) / PASSO_SEG)];
}

function asta(u: Uscite, i: number, j: number): boolean {
  return i >= 0 && i < u.h2 && j >= 0 && j < u.w2 && u.seg[i * u.w2 + j] === CLASSE.asta;
}

/** Che cosa c'è entro 1 cella dal punto: asta, un altro disegno o solo sfondo. */
function sotto(u: Uscite, x: number, y: number): 'asta' | 'disegno' | 'sfondo' {
  const [i, j] = cella(u, x, y);
  let disegno = false;
  for (let di = -1; di <= 1; di++) {
    for (let dj = -1; dj <= 1; dj++) {
      const a = i + di, b = j + dj;
      if (a < 0 || a >= u.h2 || b < 0 || b >= u.w2) continue;
      const c = u.seg[a * u.w2 + b];
      if (c === CLASSE.asta) return 'asta';
      if (c === CLASSE.carico || c === CLASSE.ausiliaria) disegno = true;
    }
  }
  return disegno ? 'disegno' : 'sfondo';
}

function corre(u: Uscite, a: Punto, b: Punto, bucoMassimo: number): boolean {
  const l = Math.hypot(b.x - a.x, b.y - a.y);
  const n = Math.max(2, Math.ceil(l / ASTE.passo));
  let aste = 0, sfondo = 0, buco = 0, bucoPeggiore = 0;
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    const c = sotto(u, a.x + t * (b.x - a.x), a.y + t * (b.y - a.y));
    if (c === 'sfondo') {
      sfondo++;
      buco += l / n;
      bucoPeggiore = Math.max(bucoPeggiore, buco);
    } else {
      if (c === 'asta') aste++;
      buco = 0;
    }
  }
  return aste / (n + 1) >= ASTE.asta && sfondo / (n + 1) <= ASTE.sfondo && bucoPeggiore <= bucoMassimo;
}

/** Larghezza della fascia d'asta attraversata perpendicolarmente in p [px]. */
function larghezza(u: Uscite, p: Punto, nx: number, ny: number): number {
  const esatto = (x: number, y: number) => asta(u, ...cella(u, x, y));
  if (!esatto(p.x, p.y)) return 0;
  let w = 0;
  for (const verso of [1, -1]) {
    for (let s = 0.5; s < 20; s += 0.5) {
      if (!esatto(p.x + verso * s * nx, p.y + verso * s * ny)) break;
      w += 0.5;
    }
  }
  return w;
}

/** Un pallino ha il centro sulla retta ab (entro mezzo raggio), dentro il segmento. */
function interrotta(a: Punto, b: Punto, pallini: Pallino[]): boolean {
  const l = Math.hypot(b.x - a.x, b.y - a.y);
  const ux = (b.x - a.x) / l, uy = (b.y - a.y) / l;
  return pallini.some(({ c, r }) => {
    const t = (c.x - a.x) * ux + (c.y - a.y) * uy;
    return t > 0 && t < l && Math.abs((c.x - a.x) * uy - (c.y - a.y) * ux) < 0.5 * r;
  });
}

export function tracciaAste(u: Uscite, nodi: Punto[], pallini: Pallino[] = []): SegmentoAsta[] {
  const raggio = pallini.length > 0 ? mediana(pallini.map((p) => p.r)) : 0;
  const bucoMassimo = Math.max(ASTE.buco, ASTE.bucoRaggi * raggio);
  const n = nodi.length;
  const ok: boolean[][] = Array.from({ length: n }, () => new Array<boolean>(n).fill(false));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const l = Math.hypot(nodi[j].x - nodi[i].x, nodi[j].y - nodi[i].y);
      if (l >= ASTE.lunghezzaMinima && corre(u, nodi[i], nodi[j], bucoMassimo)
          && !interrotta(nodi[i], nodi[j], pallini)) ok[i][j] = ok[j][i] = true;
    }
  }
  const out: SegmentoAsta[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (!ok[i][j]) continue;
      const a = nodi[i], b = nodi[j];
      const l = Math.hypot(b.x - a.x, b.y - a.y);
      const ux = (b.x - a.x) / l, uy = (b.y - a.y) / l;
      const scavalca = nodi.some((c, k) => {
        if (k === i || k === j || !ok[i][k] || !ok[k][j]) return false;
        const t = (c.x - a.x) * ux + (c.y - a.y) * uy;
        const d = Math.abs((c.x - a.x) * uy - (c.y - a.y) * ux);
        return t > 0 && t < l && d < ASTE.allineato;
      });
      if (scavalca) continue;
      const larghezze = [0.25, 0.5, 0.75].map((t) =>
        larghezza(u, { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) }, -uy, ux)).filter((w) => w > 0);
      const spessore = larghezze.length > 0 ? larghezze.reduce((s, w) => s + w, 0) / larghezze.length : PASSO_SEG;
      out.push({ a, b, spessore, confidenza: 1 });
    }
  }
  return out;
}

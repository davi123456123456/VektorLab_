/**
 * Dettaglio ingrandito di un concio di trave: fibre tese e compresse.
 *
 * PERCHÉ ESISTE — un diagramma del momento dice QUANTO, non COSA SUCCEDE. Il
 * passaggio che gli studenti fanno più fatica a interiorizzare è che flettere
 * una trave significa allungare le fibre da un lato e accorciarle dall'altro,
 * e che è per questo che la ghisa si rompe dalla parte tesa mentre resiste
 * benissimo dall'altra.
 *
 * Qui si disegna un tratto di trave molto ingrandito, con le sue fibre e le
 * due sezioni di estremità. Sotto l'azione del momento le sezioni RUOTANO
 * l'una rispetto all'altra dell'angolo
 *
 *     Δθ = χ · Δx        con χ = M/(E·I)
 *
 * restando piane: è l'ipotesi di Bernoulli, disegnata. Le fibre si allungano
 * proporzionalmente alla distanza dall'asse neutro, dove la deformazione è
 * nulla — e infatti la fibra centrale resta della stessa lunghezza.
 *
 * L'ingrandimento della rotazione è enorme e dichiarato: la curvatura reale di
 * una trave in esercizio è dell'ordine di 10⁻³ m⁻¹ e sarebbe invisibile.
 */

import { etichettaSuSfondo } from './frecce.js';
import type { PuntoTensione } from '../core/checks/index.js';

export interface OpzioniFibre {
  /** curvatura reale χ = M/EI [1/m] */
  curvatura: number;
  /** sforzo normale sulla sezione, per la traslazione uniforme [N] */
  N: number;
  /** rigidezza assiale EA [N] */
  EA: number;
  /** altezza della sezione [m] */
  altezza: number;
  /** distribuzione delle tensioni sulla sezione */
  distribuzione: PuntoTensione[];
  /** avanzamento dell'animazione, 0 = indeformato, 1 = deformato */
  lambda: number;
  larghezza: number;
  altezzaCanvas: number;
  colori: {
    sfondo: string; contorno: string; trazione: string; compressione: string;
    neutro: string; testo: string; debole: string;
  };
}

/** Colore di una fibra in base al segno e all'intensità della sua tensione. */
function coloreFibra(
  sigma: number, massimo: number, trazione: string, compressione: string,
): string {
  const intensita = massimo > 0 ? Math.min(1, Math.abs(sigma) / massimo) : 0;
  const base = sigma >= 0 ? trazione : compressione;
  // dall'asse neutro verso le fibre estreme il colore si satura
  const alpha = 0.25 + 0.75 * intensita;
  return applicaAlpha(base, alpha);
}

function applicaAlpha(colore: string, alpha: number): string {
  const c = colore.trim();
  if (c.startsWith('#') && (c.length === 7 || c.length === 4)) {
    const n = c.length === 4
      ? c.slice(1).split('').map((h) => h + h).join('')
      : c.slice(1);
    const r = parseInt(n.slice(0, 2), 16);
    const g = parseInt(n.slice(2, 4), 16);
    const b = parseInt(n.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`;
  }
  return c;
}

export function disegnaFibre(
  ctx: CanvasRenderingContext2D, o: OpzioniFibre,
): void {
  const { larghezza: W, altezzaCanvas: H, colori } = o;
  ctx.save();
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = colori.sfondo;
  ctx.fillRect(0, 0, W, H);

  const margine = 30;
  const larghezzaConcio = W - 2 * margine;
  const altezzaDisegno = Math.min(H - 2 * margine, larghezzaConcio * 0.62);
  const cx = W / 2;
  const cy = H / 2;

  const punti = o.distribuzione.length > 0 ? o.distribuzione : [];
  const sigmaMax = punti.reduce((m, p) => Math.max(m, Math.abs(p.sigma)), 0);

  /**
   * Rotazione relativa delle due sezioni. La curvatura reale darebbe pochi
   * centesimi di grado: si sceglie un'apertura leggibile e la si dichiara,
   * conservando il SEGNO, che è l'informazione vera.
   */
  const aperturaMax = 0.30;   // rad, circa 17°
  const segno = Math.sign(o.curvatura) || 1;
  const apertura = segno * aperturaMax * o.lambda;

  // deformazione assiale, anch'essa amplificata
  const epsAssiale = o.EA !== 0 ? o.N / o.EA : 0;
  const allungamentoUniforme = Math.sign(epsAssiale) * Math.min(0.12, Math.abs(epsAssiale) * 400)
    * o.lambda;

  // ── fibre ──
  const nFibre = 17;
  for (let i = 0; i < nFibre; i++) {
    const t = i / (nFibre - 1);          // 0 = fibra inferiore
    const yRel = t - 0.5;                // −0.5 … +0.5
    const y = cy - yRel * altezzaDisegno;

    // la fibra si allunga proporzionalmente alla distanza dall'asse neutro;
    // il segno è quello della convenzione: M>0 tende le fibre a −y
    const fattore = 1 + allungamentoUniforme - apertura * yRel;
    const semiLunghezza = (larghezzaConcio / 2) * fattore;

    // tensione alla quota corrispondente
    const yFisico = yRel * o.altezza;
    const sigma = interpolaSigma(punti, yFisico);
    ctx.strokeStyle = coloreFibra(sigma, sigmaMax, colori.trazione, colori.compressione);
    ctx.lineWidth = i === (nFibre - 1) / 2 ? 1 : 2.4;
    ctx.beginPath();
    ctx.moveTo(cx - semiLunghezza, y);
    ctx.lineTo(cx + semiLunghezza, y);
    ctx.stroke();
  }

  // ── sezioni di estremità: restano PIANE e ruotano ──
  ctx.strokeStyle = colori.contorno;
  ctx.lineWidth = 2;
  for (const lato of [-1, 1] as const) {
    const rotazione = (lato * apertura) / 2;
    const meta = larghezzaConcio / 2;
    const alto = { x: cx + lato * meta, y: cy - altezzaDisegno / 2 };
    const basso = { x: cx + lato * meta, y: cy + altezzaDisegno / 2 };
    const ruota = (p: { x: number; y: number }) => {
      const dx = p.x - cx, dy = p.y - cy;
      return {
        x: cx + dx * Math.cos(rotazione) - dy * Math.sin(rotazione)
             + lato * (larghezzaConcio / 2) * allungamentoUniforme,
        y: cy + dx * Math.sin(rotazione) + dy * Math.cos(rotazione),
      };
    };
    const a = ruota(alto), b = ruota(basso);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  // ── asse neutro ──
  ctx.strokeStyle = colori.neutro;
  ctx.setLineDash([5, 4]);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(margine * 0.5, cy);
  ctx.lineTo(W - margine * 0.5, cy);
  ctx.stroke();
  ctx.setLineDash([]);

  // ── etichette ──
  ctx.font = '10px ui-monospace, SF Mono, Menlo, monospace';
  ctx.textBaseline = 'middle';

  const latoTeso = segno > 0 ? 'basso' : 'alto';
  const yTeso = latoTeso === 'basso' ? cy + altezzaDisegno / 2 + 14 : cy - altezzaDisegno / 2 - 14;
  const yCompresso = latoTeso === 'basso' ? cy - altezzaDisegno / 2 - 14 : cy + altezzaDisegno / 2 + 14;

  ctx.textAlign = 'center';
  ctx.fillStyle = colori.trazione;
  ctx.fillText('fibre TESE — si allungano', cx, yTeso);
  ctx.fillStyle = colori.compressione;
  ctx.fillText('fibre COMPRESSE — si accorciano', cx, yCompresso);

  // La riga dell'asse neutro attraversa il disegno da parte a parte: qui non
  // esiste un punto libero dove scriverla, quindi va su sfondo opaco. Ed è
  // accorciata: «asse neutro» dice già tutto, «lunghezza invariata» lo
  // ripeteva a parole ed era la metà che finiva sopra il contorno.
  ctx.textAlign = 'left';
  etichettaSuSfondo(ctx, 'asse neutro', margine * 0.5, cy - 10,
                    colori.neutro, colori.sfondo);

  ctx.restore();
}

function interpolaSigma(punti: PuntoTensione[], y: number): number {
  if (punti.length === 0) return 0;
  if (y <= punti[0].y) return punti[0].sigma;
  const ultimo = punti.length - 1;
  if (y >= punti[ultimo].y) return punti[ultimo].sigma;
  for (let i = 0; i < ultimo; i++) {
    if (y >= punti[i].y && y <= punti[i + 1].y) {
      const dy = punti[i + 1].y - punti[i].y;
      const t = dy > 0 ? (y - punti[i].y) / dy : 0;
      return punti[i].sigma + (punti[i + 1].sigma - punti[i].sigma) * t;
    }
  }
  return 0;
}

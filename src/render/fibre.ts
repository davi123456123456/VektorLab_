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
import { quotaAsseNeutro } from './sezioneDisegno.js';
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
  /**
   * §4.2 — le due quote estreme misurate DAL BARICENTRO.
   *
   * Su una sezione a T o a L il baricentro non sta a metà altezza, e prendere
   * ±H/2 metteva la fibra estrema dove non è: la fibra più sollecitata
   * risultava quella sbagliata, cioè proprio il numero che questa figura
   * dovrebbe spiegare. Vengono dal modulo delle sezioni, non ricalcolate qui.
   */
  ySup: number;
  yInf: number;
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

  // MARGINI ASIMMETRICI, e non per distrazione: a sinistra serve una corsia
  // per l'etichetta dell'asse neutro. Scrivendola sopra il concio interrompeva
  // le fibre e sembrava un buco nel disegno; scriverla fuori costa settanta
  // pixel di larghezza e non copre più niente.
  const margine = 30;
  const margineSinistro = 74;
  const margineDestro = 20;
  const larghezzaConcio = W - margineSinistro - margineDestro;
  const altezzaDisegno = Math.min(H - 2 * margine, larghezzaConcio * 0.62);
  const cx = margineSinistro + larghezzaConcio / 2;
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

  /**
   * UNA SOLA PARAMETRIZZAZIONE per fibre e facce.
   *
   * Prima le fibre erano segmenti orizzontali con una semilunghezza
   * approssimata al primo ordine, mentre le facce d'estremità venivano
   * ruotate attorno al centro del concio: due costruzioni diverse per la
   * stessa figura. Il risultato era che gli estremi delle fibre non cadevano
   * sulle facce — il bordo esterno della trave si sfrangiava — e che la
   * rotazione, applicata a punti distanti `m` dal centro, traslava l'intero
   * concio verso il basso al crescere di λ.
   *
   * Qui c'è una sola funzione. Detta `u` la quota di una fibra misurata sulla
   * sezione (positiva verso il basso), con φ metà dell'apertura:
   *
   *     y(u)    = cy + u·cos φ            la sezione si accorcia in proiezione
   *     semi(u) = m·(1+ε) + u·sin φ       le fibre sotto si allungano
   *
   * Le facce sono i luoghi degli estremi al variare di u, quindi sono rette e
   * ogni fibra ci finisce sopra per costruzione, non per approssimazione. Il
   * centro resta fermo, e sull'asse neutro (u = 0) la lunghezza non cambia.
   */
  const phi = apertura / 2;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);
  const meta = (larghezzaConcio / 2) * (1 + allungamentoUniforme);

  const quotaY = (u: number) => cy + u * cosPhi;
  const semi = (u: number) => meta + u * sinPhi;
  /*
   * La mappatura quota fisica → quota sul disegno passa per il baricentro,
   * non per la mezzeria del rettangolo: `u = 0` è il baricentro, e le due
   * estremità stanno a distanze diverse quando la sezione è asimmetrica.
   */
  const arco = (o.ySup + o.yInf) || o.altezza || 1;
  const aDisegno = (yFisico: number) => -(yFisico / arco) * altezzaDisegno;
  const uSup = aDisegno(o.ySup);
  const uInf = aDisegno(-o.yInf);

  // ── contorno del concio ──
  // Il bordo è una linea sua, sottile e neutra. Prima il contorno era il
  // sottoprodotto delle due fibre estreme, disegnate spesse e colorate: il
  // profilo della trave finiva rosso da una parte e blu dall'altra, e dove le
  // fibre non arrivavano alla faccia restava un gradino.
  ctx.strokeStyle = colori.contorno;
  ctx.lineWidth = 1.6;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - semi(uSup), quotaY(uSup));
  ctx.lineTo(cx + semi(uSup), quotaY(uSup));
  ctx.lineTo(cx + semi(uInf), quotaY(uInf));
  ctx.lineTo(cx - semi(uInf), quotaY(uInf));
  ctx.closePath();
  ctx.stroke();

  // ── fibre ──
  const nFibre = 17;
  for (let i = 0; i < nFibre; i++) {
    const t = i / (nFibre - 1);          // 0 = fibra inferiore
    // dalla fibra più bassa (−yInf) alla più alta (+ySup): sono le quote
    // vere della sezione, che su una T non sono simmetriche
    const yFisico = -o.yInf + t * arco;
    const u = aDisegno(yFisico);

    // le fibre estreme coincidono con il contorno: disegnarle sopra lo
    // sporcherebbe, e sono già rappresentate dal profilo
    if (i === 0 || i === nFibre - 1) continue;

    const y = quotaY(u);
    const semiLunghezza = semi(u);

    const sigma = interpolaSigma(punti, yFisico);
    ctx.strokeStyle = coloreFibra(sigma, sigmaMax, colori.trazione, colori.compressione);
    ctx.lineWidth = i === (nFibre - 1) / 2 ? 1 : 2.4;
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.moveTo(cx - semiLunghezza, y);
    ctx.lineTo(cx + semiLunghezza, y);
    ctx.stroke();
  }

  // ── facce d'estremità: restano PIANE e ruotano ──
  ctx.strokeStyle = colori.contorno;
  ctx.lineWidth = 2;
  for (const lato of [-1, 1] as const) {
    ctx.beginPath();
    ctx.moveTo(cx + lato * semi(uSup), quotaY(uSup));
    ctx.lineTo(cx + lato * semi(uInf), quotaY(uInf));
    ctx.stroke();
  }

  /*
   * ── ASSE NEUTRO ──
   * Dove σ si annulla, che è il baricentro solo se N è nullo. Con uno sforzo
   * normale la fibra indeformata si sposta, e disegnarla sempre a metà
   * direbbe il contrario di quello che il conto ha trovato.
   */
  const yn = quotaAsseNeutro(punti);
  const yAsse = yn === null ? cy : quotaY(aDisegno(yn));
  ctx.strokeStyle = colori.neutro;
  ctx.setLineDash([5, 4]);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(4, yAsse);
  ctx.lineTo(W - 6, yAsse);
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
  ctx.fillText('fibre TESE', cx, yTeso);
  ctx.fillStyle = colori.compressione;
  ctx.fillText('fibre COMPRESSE', cx, yCompresso);

  // La riga dell'asse neutro attraversa il disegno da parte a parte: qui non
  // esiste un punto libero dove scriverla, quindi va su sfondo opaco. Ed è
  // accorciata: «asse neutro» dice già tutto, «lunghezza invariata» lo
  // ripeteva a parole ed era la metà che finiva sopra il contorno.
  // Al CENTRO, non a sinistra: là copriva il bordo esterno del concio. Qui
  // l'unica cosa che interrompe è la fibra di mezzo, che è l'asse neutro
  // stesso — e un'etichetta appoggiata sulla linea che nomina si legge come
  // una didascalia, non come una sovrapposizione.
  // nella corsia di sinistra, alla quota dell'asse: nessuna fibra da
  // interrompere, nessuno sfondo opaco da sovrapporre
  ctx.textAlign = 'left';
  ctx.fillStyle = colori.neutro;
  ctx.fillStyle = colori.sfondo;
  ctx.fillRect(2, cy - 7, margineSinistro - 10, 14);
  ctx.fillStyle = colori.neutro;
  ctx.fillText('asse neutro', 4, cy);

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

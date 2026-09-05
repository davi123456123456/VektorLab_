/**
 * Disegno della sezione trasversale con i diagrammi di σ e τ sull'altezza.
 *
 * È la figura che spiega il risultato della verifica: si vede la sezione vera
 * (con il suo vuoto, se cava), la tensione normale che varia linearmente, la
 * tangenziale che salta dove la larghezza cambia, e il punto in cui la
 * tensione ideale è massima — che spesso non è dove uno guarderebbe.
 *
 * Dimensioni in pixel: il disegno è schematico, non in scala col modello.
 */

import type { DistribuzioneTensioni, PuntoTensione } from '../core/checks/index.js';
import {
  contornoInterno, contornoSezione, proprietaDa, type ParametriSezione,
} from '../core/materials/sezioniParametriche.js';

export interface OpzioniSezione {
  parametri: ParametriSezione;
  distribuzione: DistribuzioneTensioni | null;
  larghezza: number;
  altezza: number;
  colori: {
    sfondo: string; contorno: string; riempimento: string;
    sigma: string; tau: string; ideale: string; critico: string;
    testo: string; griglia: string;
    /** §4.2 — zone tese e compresse, campite sulla sagoma vera */
    trazione: string; compressione: string;
  };
}

/**
 * §4.2 — QUOTA DELL'ASSE NEUTRO, letta dalla distribuzione.
 *
 * L'asse neutro è dove σ si annulla, e NON coincide con l'asse baricentrico
 * appena c'è sforzo normale: con N di trazione la sezione si tende tutta e
 * l'asse esce dal profilo. Non lo si ricalcola — la distribuzione viene dal
 * modulo di verifica — lo si cerca fra i campioni, dove il segno cambia.
 *
 * null quando σ non cambia segno: allora un asse neutro dentro la sezione non
 * c'è, ed è un'informazione, non un caso da nascondere disegnando una riga a
 * metà altezza.
 */
export function quotaAsseNeutro(punti: PuntoTensione[]): number | null {
  for (let i = 0; i < punti.length - 1; i++) {
    const a = punti[i], b = punti[i + 1];
    if (a.sigma === 0) return a.y;
    if ((a.sigma < 0) === (b.sigma < 0)) continue;
    const d = b.sigma - a.sigma;
    if (Math.abs(d) < 1e-30) continue;
    return a.y + ((b.y - a.y) * (0 - a.sigma)) / d;
  }
  const ultimo = punti[punti.length - 1];
  return ultimo && ultimo.sigma === 0 ? ultimo.y : null;
}

interface Riquadro { x: number; y: number; w: number; h: number }

export function disegnaSezione(
  ctx: CanvasRenderingContext2D, o: OpzioniSezione,
): void {
  const { larghezza: W, altezza: H, colori } = o;
  ctx.save();
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = colori.sfondo;
  ctx.fillRect(0, 0, W, H);

  const margine = 26;
  /*
   * I valori hanno una BANDA PROPRIA in fondo, sottratta all'altezza utile.
   *
   * L'impaginazione si calcola PRIMA di disporre i riquadri, perché quante
   * righe servano dipende dal testo: con una banda fissa quattro righe
   * finivano sopra il disegno, e un numero scritto sopra un altro non è
   * un'informazione in più, è una in meno.
   */
  const righeValori = disponiValori(ctx, o);
  const bandaValori = righeValori.length * 11 + 6;
  const utile = H - 2 * margine - bandaValori;
  // tre riquadri affiancati: sezione, σ, τ
  const wSezione = Math.min(W * 0.3, utile * 0.9);
  const wDiagramma = (W - wSezione - margine * 2 - 24) / 2;

  const rSezione: Riquadro = { x: margine, y: margine, w: wSezione, h: utile };
  const rSigma: Riquadro = { x: margine + wSezione + 12, y: margine, w: wDiagramma, h: utile };
  const rTau: Riquadro = { x: rSigma.x + wDiagramma + 12, y: margine, w: wDiagramma, h: utile };

  disegnaProfilo(ctx, o, rSezione);
  if (o.distribuzione) {
    disegnaAndamento(ctx, o, rSigma, (p) => p.sigma, colori.sigma, 'σ  MPa');
    disegnaAndamento(ctx, o, rTau, (p) => p.tau, colori.tau, 'τ  MPa');
    evidenziaCritico(ctx, o, rSezione, rSigma, rTau);
  }
  scriviValori(ctx, o, righeValori, margine, H);
  ctx.restore();
}

/** Fattore di scala che fa entrare la sezione nel riquadro. */
function scalaProfilo(punti: { y: number; z: number }[], r: Riquadro): {
  k: number; cx: number; cy: number;
} {
  const zs = punti.map((p) => p.z);
  const ys = punti.map((p) => p.y);
  const dz = Math.max(...zs) - Math.min(...zs) || 1;
  const dy = Math.max(...ys) - Math.min(...ys) || 1;
  const k = Math.min((r.w * 0.85) / dz, (r.h * 0.9) / dy);
  return { k, cx: r.x + r.w / 2, cy: r.y + r.h / 2 };
}

function disegnaProfilo(
  ctx: CanvasRenderingContext2D, o: OpzioniSezione, r: Riquadro,
): void {
  const esterno = contornoSezione(o.parametri);
  const interno = contornoInterno(o.parametri);
  const { k, cx, cy } = scalaProfilo(esterno, r);

  const percorso = (punti: { y: number; z: number }[]) => {
    ctx.beginPath();
    punti.forEach((p, i) => {
      // z orizzontale, y verticale ribaltata (il canvas ha y verso il basso)
      const x = cx + p.z * k;
      const y = cy - p.y * k;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.closePath();
  };

  ctx.save();
  // il vuoto delle sezioni cave si ottiene con la regola evenodd
  percorso(esterno);
  if (interno.length > 0) percorso(interno);

  /*
   * §4.2 — ZONE TESE E COMPRESSE, CAMPITE SULLA SAGOMA VERA.
   *
   * La campitura è un gradiente verticale costruito sui campioni di σ, e viene
   * ritagliato dal contorno reale: è quello che la fa aderire alla forma —
   * l'anima stretta di un doppio T si colora quanto è larga, non quanto è
   * largo il suo riquadro. Senza distribuzione resta il riempimento neutro:
   * un colore inventato direbbe qualcosa che non è stato calcolato.
   */
  const punti = o.distribuzione?.punti ?? [];
  if (punti.length > 1) {
    const ys = punti.map((p) => p.y);
    const yAlto = Math.max(...ys), yBasso = Math.min(...ys);
    const g = ctx.createLinearGradient(0, cy - yAlto * k, 0, cy - yBasso * k);
    const massimo = Math.max(...punti.map((p) => Math.abs(p.sigma))) || 1;
    // dal campione più alto al più basso: è il verso del gradiente
    const ordinati = [...punti].sort((a, b) => b.y - a.y);
    const arco = (yAlto - yBasso) || 1;
    for (const p of ordinati) {
      const t = Math.min(1, Math.max(0, (yAlto - p.y) / arco));
      const intensita = Math.min(1, Math.abs(p.sigma) / massimo);
      g.addColorStop(t, conAlpha(
        p.sigma >= 0 ? o.colori.trazione : o.colori.compressione,
        0.18 + 0.55 * intensita,
      ));
    }
    ctx.fillStyle = g;
  } else {
    ctx.fillStyle = o.colori.riempimento;
  }
  ctx.fill('evenodd');

  ctx.strokeStyle = o.colori.contorno;
  ctx.lineWidth = 1.4;
  percorso(esterno);
  ctx.stroke();
  if (interno.length > 0) { percorso(interno); ctx.stroke(); }

  // asse baricentrico: y = 0 nel riferimento della sezione
  ctx.strokeStyle = o.colori.griglia;
  ctx.setLineDash([4, 3]);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(r.x, cy); ctx.lineTo(r.x + r.w, cy);
  ctx.stroke();
  ctx.setLineDash([]);

  // §4.2 — l'ASSE NEUTRO, dove σ si annulla: coincide col baricentrico solo
  // se N è nullo, e su una sezione asimmetrica non sta a metà altezza
  const yn = punti.length > 1 ? quotaAsseNeutro(punti) : null;
  if (yn !== null) {
    const y = cy - yn * k;
    ctx.strokeStyle = o.colori.ideale;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(r.x, y); ctx.lineTo(r.x + r.w, y);
    ctx.stroke();
    ctx.fillStyle = o.colori.ideale;
    ctx.font = '9px ui-monospace, monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText('asse neutro', r.x + 1, y - 2);
  }
  ctx.restore();
}

function conAlpha(colore: string, alpha: number): string {
  const c = colore.trim();
  if (!c.startsWith('#') || (c.length !== 7 && c.length !== 4)) return c;
  const n = c.length === 4 ? c.slice(1).split('').map((h) => h + h).join('') : c.slice(1);
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`;
}

/**
 * §4.2 — i valori numerici accanto al disegno.
 *
 * Sono quelli GIÀ CALCOLATI: le proprietà vengono dal modulo delle sezioni, le
 * tensioni dalla distribuzione. Qui non si calcola niente, si scrive.
 */
type Voce = [string, string];

/**
 * §4.2 — i valori numerici accanto al disegno, impaginati.
 *
 * Sono quelli GIÀ CALCOLATI: le proprietà vengono dal modulo delle sezioni, le
 * tensioni dalla distribuzione. Qui non si calcola niente di meccanico, si
 * decide soltanto dove vanno a capo.
 */
function disponiValori(
  ctx: CanvasRenderingContext2D, o: OpzioniSezione,
): Voce[][] {
  const q = proprietaDa(o.parametri);
  const d = o.distribuzione;
  const voci: Voce[] = [
    ['A', `${(q.A * 1e6).toFixed(0)} mm²`],
    ['I', `${(q.I * 1e12).toExponential(2)} mm⁴`],
    ['W', `${(q.W * 1e9).toFixed(1)} cm³`],
    ['y sup', `${(q.ySup * 1e3).toFixed(1)}`],
    ['y inf', `${(q.yInf * 1e3).toFixed(1)} mm`],
  ];
  if (d) {
    voci.push(['σ max', `${(d.fibraEstrema.sigma / 1e6).toFixed(1)}`]);
    voci.push(['τ max', `${(d.taglioMassimo.tau / 1e6).toFixed(1)} MPa`]);
  }

  ctx.save();
  ctx.font = '9px ui-monospace, monospace';
  const largh = (v: Voce) =>
    ctx.measureText(v[0]).width + 4 + ctx.measureText(v[1]).width + 10;
  const dispone = o.larghezza - 2 * 26;
  const righe: Voce[][] = [[]];
  let usata = 0;
  for (const v of voci) {
    const w = largh(v);
    if (usata + w > dispone && righe[righe.length - 1].length > 0) {
      righe.push([]); usata = 0;
    }
    righe[righe.length - 1].push(v);
    usata += w;
  }
  ctx.restore();
  return righe;
}

function scriviValori(
  ctx: CanvasRenderingContext2D, o: OpzioniSezione,
  righe: Voce[][], margine: number, H: number,
): void {
  ctx.save();
  ctx.font = '9px ui-monospace, monospace';
  ctx.textBaseline = 'middle';
  const prima = H - margine + 2 - (righe.length - 1) * 11;
  righe.forEach((riga, k) => {
    let x = margine;
    const y = prima + k * 11;
    for (const [nome, valore] of riga) {
      ctx.fillStyle = o.colori.testo;
      ctx.textAlign = 'left';
      ctx.fillText(nome, x, y);
      x += ctx.measureText(nome).width + 4;
      ctx.fillStyle = o.colori.contorno;
      ctx.fillText(valore, x, y);
      x += ctx.measureText(valore).width + 10;
    }
  });
  ctx.restore();
}

function disegnaAndamento(
  ctx: CanvasRenderingContext2D, o: OpzioniSezione, r: Riquadro,
  valore: (p: PuntoTensione) => number, colore: string, titolo: string,
): void {
  const punti = o.distribuzione!.punti;
  const massimo = Math.max(...punti.map((p) => Math.abs(valore(p)))) || 1;
  const ys = punti.map((p) => p.y);
  const yMin = Math.min(...ys), yMax = Math.max(...ys);
  const k = r.h / ((yMax - yMin) || 1);
  const asseX = r.x + r.w / 2;
  const scalaX = (r.w / 2) * 0.9 / massimo;

  const schermo = (p: PuntoTensione) => ({
    x: asseX + valore(p) * scalaX,
    y: r.y + r.h - (p.y - yMin) * k,
  });

  ctx.save();
  // asse zero
  ctx.strokeStyle = o.colori.griglia;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(asseX, r.y); ctx.lineTo(asseX, r.y + r.h);
  ctx.stroke();

  // riempimento e contorno dell'andamento
  ctx.globalAlpha = 0.2;
  ctx.fillStyle = colore;
  ctx.beginPath();
  ctx.moveTo(asseX, schermo(punti[0]).y);
  for (const p of punti) { const s = schermo(p); ctx.lineTo(s.x, s.y); }
  ctx.lineTo(asseX, schermo(punti[punti.length - 1]).y);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.strokeStyle = colore;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  punti.forEach((p, i) => {
    const s = schermo(p);
    if (i === 0) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y);
  });
  ctx.stroke();

  // titolo e valore di picco
  ctx.font = '10px ui-monospace, SF Mono, Menlo, monospace';
  ctx.fillStyle = o.colori.testo;
  ctx.textAlign = 'center';
  ctx.fillText(titolo, r.x + r.w / 2, r.y - 10);
  ctx.fillStyle = colore;
  ctx.fillText((massimo / 1e6).toFixed(1), r.x + r.w / 2, r.y + r.h + 14);
  ctx.restore();
}

/** Marca il punto critico su tutti e tre i riquadri, alla stessa quota. */
function evidenziaCritico(
  ctx: CanvasRenderingContext2D, o: OpzioniSezione,
  rSezione: Riquadro, rSigma: Riquadro, rTau: Riquadro,
): void {
  const d = o.distribuzione!;
  const ys = d.punti.map((p) => p.y);
  const yMin = Math.min(...ys), yMax = Math.max(...ys);
  const k = rSigma.h / ((yMax - yMin) || 1);
  const ySchermo = rSigma.y + rSigma.h - (d.critico.y - yMin) * k;

  ctx.save();
  ctx.strokeStyle = o.colori.critico;
  ctx.setLineDash([3, 3]);
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(rSezione.x, ySchermo);
  ctx.lineTo(rTau.x + rTau.w, ySchermo);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = o.colori.critico;
  ctx.beginPath();
  ctx.arc(rSezione.x + rSezione.w / 2, ySchermo, 3.5, 0, Math.PI * 2);
  ctx.fill();

  // L'ETICHETTA NON STA SULLA QUOTA, sta nell'intestazione.
  //
  // Alla quota critica c'è sempre un'ala o un'anima: non esiste una posizione
  // libera dentro il disegno della sezione, e uno sfondo opaco risolveva la
  // leggibilità cancellando però un pezzo di profilo — l'ala inferiore
  // spariva sotto il riquadro. Qui il valore va in cima, sulla stessa riga di
  // «σ MPa» e «τ MPa» a cui appartiene, mentre sulla quota restano il pallino
  // e la linea tratteggiata, che la marcano senza coprire niente.
  ctx.font = 'bold 10px ui-monospace, SF Mono, Menlo, monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = o.colori.critico;
  ctx.fillText(
    `σid ${(d.critico.vonMises / 1e6).toFixed(1)} MPa`,
    rSezione.x, rSezione.y - 10,
  );
  ctx.restore();
}

/**
 * Modalità REAZIONI VINCOLARI: la struttura sospesa nel vuoto.
 *
 * I simboli dei vincoli sfumano via e al loro posto compaiono le forze che
 * essi esercitano. È la rappresentazione del corpo libero, e il passaggio da
 * una all'altra è il concetto che il disegno deve insegnare: il vincolo NON è
 * una forza, ma può essere sostituito dalla forza che trasmette.
 *
 * REGOLA SUL VERSO — la freccia punta sempre nel verso in cui la forza agisce
 * davvero e l'etichetta riporta il modulo, positivo. Mostrare «−12 kN» con la
 * freccia disegnata a caso è il modo più efficace per insegnare a sbagliare.
 */

import type {
  ComponenteReazione, ForzaDiSconnessione,
} from '../core/statica/reazioni.js';
import type { CorpoRigido } from '../core/model/results.js';
import type { Tronco } from '../core/statica/elementino.js';
import type { Carico, ElementId, NodeId, Progetto } from '../core/model/types.js';
import { risultanteDistribuito, type Risultante } from '../core/model/direzioni.js';
import { type Camera, type Punto, mondoASchermo } from './camera.js';
import { arcoMomento, etichettaSuSfondo, frecciaPiena, inKilo } from './frecce.js';

export interface ColoriReazioni {
  reazione: string;
  sfondo: string;
  testo: string;
  testoAttenuato: string;
  asta: string;
  accento: string;
  carico: string;
  momento: string;
  /** tinta della risultante: una TERZA, distinta da carichi e reazioni */
  risultante: string;
}

export interface OpzioniReazioniVincolari {
  camera: Camera;
  /** solo le componenti dei vincoli ESTERNI */
  componenti: ComponenteReazione[];
  colori: ColoriReazioni;
  mostraValori: boolean;
  /** comparsa progressiva in [0,1]: le frecce crescono dal vincolo */
  comparsa: number;
}

const LUNGHEZZA_MIN = 20;
const LUNGHEZZA_MAX = 58;

/**
 * Frecce delle reazioni, una per COMPONENTE e non una risultante per nodo:
 * il carrello deve mostrare una sola freccia lungo il proprio asse, e
 * l'incastro due forze più la coppia. Sommarle in una risultante unica
 * nasconderebbe proprio ciò che distingue un vincolo dall'altro.
 */
export function disegnaReazioniVincolari(
  ctx: CanvasRenderingContext2D, o: OpzioniReazioniVincolari,
): void {
  if (o.comparsa <= 0) return;
  let forzaMax = 0, momentoMax = 0;
  for (const c of o.componenti) {
    if (c.componente === 'rotazione') momentoMax = Math.max(momentoMax, Math.abs(c.valore));
    else forzaMax = Math.max(forzaMax, Math.abs(c.valore));
  }
  forzaMax = forzaMax || 1;
  momentoMax = momentoMax || 1;

  for (const c of o.componenti) {
    if (Math.abs(c.valore) < 1e-9) continue;
    if (c.x === undefined || c.y === undefined) continue;
    const p = mondoASchermo(o.camera, { x: c.x, y: c.y });

    if (c.componente === 'rotazione') {
      const raggio = (13 + 7 * Math.sqrt(Math.abs(c.valore) / momentoMax)) * o.comparsa;
      arcoMomento(ctx, p, raggio, c.valore > 0, o.colori.reazione);
      if (o.mostraValori && o.comparsa > 0.6) {
        etichettaSuSfondo(
          ctx, inKilo(c.valore, 'kNm'), p.x + raggio + 5, p.y + 15,
          o.colori.reazione, o.colori.sfondo,
        );
      }
      continue;
    }

    if (!c.direzione) continue;
    // il verso disegnato è quello FISICO: il segno del valore ribalta la freccia
    const segno = c.valore >= 0 ? 1 : -1;
    const ux = c.direzione.dx * segno;
    const uy = c.direzione.dy * segno;
    const L = (LUNGHEZZA_MIN + (LUNGHEZZA_MAX - LUNGHEZZA_MIN)
      * Math.sqrt(Math.abs(c.valore) / forzaMax)) * o.comparsa;
    // la freccia arriva sul nodo spingendo nel verso della reazione
    const dx = ux * L, dy = -uy * L;
    frecciaPiena(ctx, p, dx, dy, o.colori.reazione, 2.4);
    if (o.mostraValori && o.comparsa > 0.6) {
      etichettaSuSfondo(
        ctx, inKilo(c.valore, 'kN'),
        p.x - dx - (dx > 0 ? 34 : -6), p.y - dy - 10,
        o.colori.reazione, o.colori.sfondo,
      );
    }
  }
}

// ═══════════════════ VISTA ESPLOSA DELLE SCONNESSIONI ═══════════════════

export interface OpzioniEsploso {
  camera: Camera;
  /** modello di CALCOLO: è lì che i corpi rigidi sono definiti */
  calcolo: Progetto;
  corpi: CorpoRigido[];
  forza: ForzaDiSconnessione;
  colori: ColoriReazioni;
  /** apertura in [0,1]: 0 = chiusa, 1 = completamente aperta */
  apertura: number;
  mostraValori: boolean;
}

/** Scostamento in metri dei due tronchi, per ciascuno dei due corpi. */
function separazione(o: OpzioniEsploso): { dx: number; dy: number } {
  const a = o.corpi[o.forza.corpi[0]];
  const b = o.corpi[o.forza.corpi[1]];
  const passo = (26 / o.camera.zoom) * o.apertura;   // 26 px a schermo
  if (!a || !b) return { dx: passo, dy: 0 };
  let dx = b.xG - a.xG, dy = b.yG - a.yG;
  const n = Math.hypot(dx, dy);
  if (n < 1e-9) return { dx: passo, dy: 0 };
  dx /= n; dy /= n;
  // uno scostamento anche ORTOGONALE: su una trave i due tronchi sono
  // allineati, e allontanarli solo lungo l'asse li lascia sulla stessa retta —
  // si vedrebbe un'unica linea con un buco invece di due pezzi distinti
  return {
    dx: (dx - dy * 0.45) * passo,
    dy: (dy + dx * 0.45) * passo,
  };
}

/**
 * I due tronchi si allontanano e compaiono le due forze che si scambiano:
 * stessa retta d'azione, stesso modulo, verso opposto. È il terzo principio
 * reso visibile — e l'etichetta «M = 0» dice che cosa la cerniera NON
 * trasmette, che è l'informazione da cui discende tutto il calcolo.
 */
export function disegnaEsploso(
  ctx: CanvasRenderingContext2D, o: OpzioniEsploso,
): void {
  if (o.apertura <= 0.001) return;
  const nodi = new Map(o.calcolo.nodi.map((n) => [n.id, n]));
  const sep = separazione(o);
  const scostamento = new Map<number, { dx: number; dy: number }>([
    [o.forza.corpi[0], { dx: -sep.dx, dy: -sep.dy }],
    [o.forza.corpi[1], { dx: sep.dx, dy: sep.dy }],
  ]);

  // i due corpi ridisegnati nella posizione esplosa
  ctx.save();
  ctx.lineWidth = 2.4;
  ctx.lineCap = 'round';
  for (const [indice, d] of scostamento) {
    const corpo = o.corpi[indice];
    if (!corpo) continue;
    ctx.strokeStyle = indice === o.forza.corpi[0] ? o.colori.accento : o.colori.carico;
    for (const astaId of corpo.asteIds) {
      const a = o.calcolo.aste.find((x) => x.id === astaId);
      if (!a) continue;
      const ni = nodi.get(a.nodoIniziale), nj = nodi.get(a.nodoFinale);
      if (!ni || !nj) continue;
      const p1 = mondoASchermo(o.camera, { x: ni.x + d.dx, y: ni.y + d.dy });
      const p2 = mondoASchermo(o.camera, { x: nj.x + d.dx, y: nj.y + d.dy });
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }
  }
  ctx.restore();

  // le due forze: sul primo corpo (fx, fy), sul secondo l'opposta
  const modulo = Math.hypot(o.forza.fx, o.forza.fy);
  if (modulo > 1e-9) {
    const L = 46;
    const ux = o.forza.fx / modulo, uy = o.forza.fy / modulo;
    for (const [indice, d] of scostamento) {
      const verso = indice === o.forza.corpi[0] ? 1 : -1;
      const p = mondoASchermo(o.camera, {
        x: o.forza.x + d.dx, y: o.forza.y + d.dy,
      });
      frecciaPiena(ctx, p, ux * L * verso, -uy * L * verso, o.colori.reazione, 2.4);
      if (o.mostraValori && o.apertura > 0.5) {
        etichettaSuSfondo(
          ctx, inKilo(modulo, 'kN'),
          p.x - ux * L * verso + 6, p.y + uy * L * verso - 12,
          o.colori.reazione, o.colori.sfondo,
        );
      }
    }
  }

  if (o.apertura > 0.4) {
    const centro = mondoASchermo(o.camera, { x: o.forza.x, y: o.forza.y });
    ctx.save();
    ctx.globalAlpha = Math.min(1, (o.apertura - 0.4) / 0.4);
    etichettaSuSfondo(
      ctx, 'M = 0', centro.x - 16, centro.y - 22,
      o.colori.momento, o.colori.sfondo, true,
    );
    ctx.restore();
  }
}

// ═════════════════════ CORPO LIBERO DEL TRONCO ═════════════════════

export interface OpzioniCorpoLibero {
  camera: Camera;
  calcolo: Progetto;
  tronco: Tronco;
  colori: ColoriReazioni;
  mostraValori: boolean;
  /** comparsa in [0,1] */
  comparsa: number;
}

/**
 * Il tronco considerato, con tutte le forze che vi agiscono e le tre azioni
 * interne sulla faccia tagliata. È la figura che si disegna a mano quando si
 * ricava un diagramma, e vederla costruita è ciò che rende il risultato
 * comprensibile invece che da accettare per fede.
 */
export function disegnaCorpoLibero(
  ctx: CanvasRenderingContext2D, o: OpzioniCorpoLibero,
): void {
  const t = o.tronco;
  if (!t.applicabile || o.comparsa <= 0) return;
  const nodi = new Map(o.calcolo.nodi.map((n) => [n.id, n]));
  const punto = (id: NodeId) => nodi.get(id);

  // ── il tronco: aste piene, il resto già attenuato dalla scena ──
  ctx.save();
  ctx.strokeStyle = o.colori.accento;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.globalAlpha = 0.55 * o.comparsa;
  const disegnaSegmento = (a: Punto, b: Punto) => {
    const p1 = mondoASchermo(o.camera, a);
    const p2 = mondoASchermo(o.camera, b);
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
  };
  for (const astaId of t.aste) {
    const a = o.calcolo.aste.find((x) => x.id === (astaId as ElementId));
    if (!a) continue;
    const ni = punto(a.nodoIniziale), nj = punto(a.nodoFinale);
    if (ni && nj) disegnaSegmento(ni, nj);
  }
  // porzione dell'asta tagliata
  {
    const a = o.calcolo.aste.find((x) => x.id === t.astaId);
    const ni = a && punto(a.nodoIniziale);
    const nj = a && punto(a.nodoFinale);
    if (ni && nj) {
      const q = (s: number) => ({
        x: ni.x + (nj.x - ni.x) * s, y: ni.y + (nj.y - ni.y) * s,
      });
      disegnaSegmento(q(t.porzione[0]), q(t.porzione[1]));
    }
  }
  ctx.restore();

  // ── la sezione di taglio ──
  const pc = mondoASchermo(o.camera, { x: t.px, y: t.py });
  ctx.save();
  ctx.strokeStyle = o.colori.momento;
  ctx.lineWidth = 2.5;
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.moveTo(pc.x, pc.y - 15);
  ctx.lineTo(pc.x, pc.y + 15);
  ctx.stroke();
  ctx.restore();

  if (o.comparsa < 0.35) return;

  // ── le forze che agiscono sul tronco ──
  let massimo = 0;
  for (const x of t.termini) massimo = Math.max(massimo, Math.hypot(x.fx, x.fy));
  massimo = massimo || 1;
  ctx.save();
  ctx.globalAlpha = Math.min(1, (o.comparsa - 0.35) / 0.4);
  for (const x of t.termini) {
    const p = mondoASchermo(o.camera, { x: x.x, y: x.y });
    const modulo = Math.hypot(x.fx, x.fy);
    const colore = x.categoria === 'reazione' ? o.colori.reazione : o.colori.carico;
    if (modulo > 1e-9) {
      const L = 18 + 30 * Math.sqrt(modulo / massimo);
      frecciaPiena(ctx, p, (x.fx / modulo) * L, (-x.fy / modulo) * L, colore, 2);
      if (o.mostraValori) {
        etichettaSuSfondo(
          ctx, inKilo(modulo, 'kN'),
          p.x - (x.fx / modulo) * L - 16, p.y + (x.fy / modulo) * L - 11,
          colore, o.colori.sfondo,
        );
      }
    }
    if (Math.abs(x.mz) > 1e-9) {
      arcoMomento(ctx, p, 13, x.mz > 0, colore, 2);
      if (o.mostraValori) {
        etichettaSuSfondo(ctx, inKilo(x.mz, 'kNm'), p.x + 17, p.y + 15,
                          colore, o.colori.sfondo);
      }
    }
  }
  ctx.restore();

  // ── le tre azioni sulla faccia tagliata ──
  const righe = [
    `N ${(t.N / 1e3).toFixed(2)} kN`,
    `T ${(t.T / 1e3).toFixed(2)} kN`,
    `M ${(t.M / 1e3).toFixed(2)} kNm`,
  ];
  righe.forEach((r, i) => {
    etichettaSuSfondo(ctx, r, pc.x + 12, pc.y - 24 + i * 15,
                      o.colori.testo, o.colori.sfondo, true);
  });
}

// ═════════════ RISULTANTI DEI CARICHI DISTRIBUITI ═════════════

export interface OpzioniRisultanti {
  camera: Camera;
  progetto: Progetto;
  carichi: Carico[];
  colori: ColoriReazioni;
  mostraValori: boolean;
  /** 0 = carico distribuito com'è, 1 = solo la risultante */
  collasso: number;
}

/**
 * La risultante di un carico distribuito, per l'equilibrio dei corpi rigidi.
 *
 * ATTENZIONE, ed è il motivo per cui questa funzione sta nel modulo delle
 * REAZIONI e non in quello dei carichi: la risultante vale solo per
 * l'equilibrio. Dentro il tratto caricato le caratteristiche di sollecitazione
 * si ottengono integrando il carico nella sua forma vera — usare la risultante
 * darebbe un salto del taglio in mezzeria invece della rampa, e un momento
 * spezzato invece che parabolico, con reazioni ed estremi comunque corretti e
 * quindi difficilissimo da smascherare. Il modello tiene le due
 * rappresentazioni in parallelo: qui si disegna, non si calcola.
 *
 * Il colore è diverso sia da quello dei carichi sia da quello delle reazioni:
 * è una terza cosa, e confonderla con le altre due è esattamente l'errore.
 */
export function disegnaRisultanti(
  ctx: CanvasRenderingContext2D, o: OpzioniRisultanti,
): void {
  if (o.collasso <= 0.001) return;
  const nodi = new Map(o.progetto.nodi.map((n) => [n.id, n]));
  const aste = new Map(o.progetto.aste.map((a) => [a.id, a]));

  let massimo = 0;
  const risultanti: { r: Risultante; astaId: string }[] = [];
  for (const c of o.carichi) {
    if (c.tipo !== 'distribuito') continue;
    const a = aste.get(c.astaId);
    if (!a) continue;
    const ni = nodi.get(a.nodoIniziale), nj = nodi.get(a.nodoFinale);
    if (!ni || !nj) continue;
    const dx = nj.x - ni.x, dy = nj.y - ni.y;
    const L = Math.hypot(dx, dy) || 1;
    const r = risultanteDistribuito(c.q1, c.q2, c.sIniziale, c.sFinale, c.direzione, {
      x1: ni.x, y1: ni.y, x2: nj.x, y2: nj.y, L, c: dx / L, s: dy / L,
    });
    if (Math.abs(r.modulo) < 1e-9) continue;
    massimo = Math.max(massimo, Math.abs(r.modulo));
    risultanti.push({ r, astaId: a.id as unknown as string });
  }
  if (risultanti.length === 0) return;

  ctx.save();
  ctx.globalAlpha = o.collasso;
  for (const { r } of risultanti) {
    const p = mondoASchermo(o.camera, { x: r.x, y: r.y });
    const modulo = Math.abs(r.modulo);
    const L = (22 + 40 * Math.sqrt(modulo / (massimo || 1))) * o.collasso;
    const ux = r.Fx / modulo, uy = r.Fy / modulo;
    // la freccia ARRIVA sul punto di applicazione, come un carico concentrato
    frecciaPiena(ctx, p, ux * L, -uy * L, o.colori.risultante, 2.6);
    // il punto di applicazione, che è l'altra metà dell'informazione
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2.6, 0, Math.PI * 2);
    ctx.fillStyle = o.colori.risultante;
    ctx.fill();
    if (o.mostraValori && o.collasso > 0.6) {
      etichettaSuSfondo(
        ctx,
        `R = ${inKilo(modulo, 'kN')} @ ${r.sApplicazione.toFixed(2)}·L`,
        p.x - ux * L + 8, p.y + uy * L - 12,
        o.colori.risultante, o.colori.sfondo,
      );
    }
  }
  ctx.restore();
}

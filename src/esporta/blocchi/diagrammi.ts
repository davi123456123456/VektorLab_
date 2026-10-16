/**
 * §3.5 — I DIAGRAMMI: N, T, M e la deformata, uno per grafico.
 *
 * Quattro grafici distinti, mai sovrapposti: sullo schermo si accendono e si
 * spengono, su carta no, e tre curve dello stesso ordine di grandezza in un
 * solo riquadro non si leggono. Ognuno porta la struttura in grigio tenue come
 * riferimento, il diagramma campito, la tratteggiata e i VALORI NOTEVOLI
 * quotati — estremi, massimi, annullamenti, salti — perché un diagramma senza
 * numeri dice la forma e non il risultato.
 *
 * I valori NON si ricalcolano: vengono da `RisultatoAsta`, gli stessi campioni
 * e gli stessi punti notevoli mostrati a schermo.
 */

import type { RisultatoAnalisi, RisultatoAsta } from '../../core/model/results.js';
import type { Progetto } from '../../core/model/types.js';
import { latiDelCalcolo, vistaDallaTratteggiata } from '../../core/model/tratteggiata.js';
import { latoDelPositivo } from '../../render/diagrammi.js';
import {
  espressioniPerAsta, scrivi, type Polinomio,
} from '../../core/statica/espressioni.js';
import type { Etichette } from '../../state/etichette.js';
import type { ContestoPdf } from '../contesto.js';
import type { PaletteDocumento } from '../palette.js';
import { inquadra, puntiDelModello, type Inquadratura, type Riquadro } from '../disegno.js';
import { disegnaSchema } from './schema.js';

export type Componente = 'N' | 'T' | 'M' | 'D';

export const NOME_COMPONENTE: Record<Componente, string> = {
  N: 'Sforzo normale N',
  T: 'Taglio T',
  M: 'Momento flettente M',
  D: 'Deformata',
};

export const UNITA_COMPONENTE: Record<Componente, string> = {
  N: 'kN', T: 'kN', M: 'kNm', D: 'mm',
};

export function coloreComponente(p: PaletteDocumento, c: Componente): string {
  return c === 'N' ? p.sforzoNormale
    : c === 'T' ? p.taglio
    : c === 'M' ? p.momento
    : p.deformata;
}

const fmt = (v: number, cifre: number): string =>
  v.toFixed(cifre).replace('.', ',').replace(/^-/, '−');

// ═══════════════════════ IL DIAGRAMMA SULLA STRUTTURA ═══════════════════════

export interface OpzioniDiagramma {
  progetto: Progetto;
  risultato: RisultatoAnalisi;
  /** modello di calcolo: le aste del risultato possono essere suddivise */
  modelloRisultati: Progetto;
  etichette: Etichette;
  palette: PaletteDocumento;
  componente: Componente;
  riquadro: Riquadro;
  /** cifre significative, le stesse mostrate a schermo */
  cifre?: number;
  /** amplificazione della deformata; se assente, si sceglie da sé */
  fattoreDeformata?: number;
  /** M dalla parte delle fibre tese, come sullo schermo */
  fibreTese?: boolean;
}

/** Il fattore usato per la deformata, da dichiarare in didascalia. */
export function fattoreDeformata(pr: Progetto, r: RisultatoAnalisi): number {
  if (r.spostamentoMassimo <= 0) return 1;
  const xs = pr.nodi.map((n) => n.x as unknown as number);
  const ys = pr.nodi.map((n) => n.y as unknown as number);
  const diagonale = Math.hypot(
    Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys),
  ) || 1;
  const f = (0.08 * diagonale) / r.spostamentoMassimo;
  const e = Math.floor(Math.log10(f));
  const b = 10 ** e;
  const m = f / b;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * b;
}

/**
 * Disegna un diagramma sulla struttura e restituisce la didascalia da
 * scrivere sotto: contiene la scala e, per la deformata, l'amplificazione.
 */
/**
 * È nullo dappertutto?
 *
 * Un diagramma identicamente nullo non merita mezza pagina bianca con la
 * struttura disegnata sotto: merita una riga che lo dica. Su una trave
 * inflessa lo sforzo normale è esattamente questo caso, e capita spesso.
 */
export function componenteNulla(
  r: RisultatoAnalisi, k: Componente,
): boolean {
  if (k === 'D') return r.spostamentoMassimo <= 0;
  for (const a of r.aste) {
    for (const v of valori(a, k)) if (Math.abs(v) > 0) return false;
  }
  return true;
}

/**
 * Altezza consigliata per il riquadro di un diagramma.
 *
 * La struttura sotto ha le sue proporzioni, e il diagramma sporge da entrambi
 * i lati: il riquadro è l'una più l'altro. Con un'altezza fissa una trave
 * orizzontale si trovava in mezzo a mezza pagina vuota.
 */
export function ampiezzaDiagramma(larghezza: number): number {
  // un decimo della larghezza: abbastanza perché la forma si legga, non tanto
  // da far sembrare enorme un valore piccolo
  return Math.max(24, Math.min(64, larghezza * 0.1));
}

export function altezzaDiagramma(pr: Progetto, larghezza: number): number {
  const xs = pr.nodi.map((n) => n.x as unknown as number);
  const ys = pr.nodi.map((n) => n.y as unknown as number);
  if (xs.length === 0) return 150;
  const dx = Math.max(...xs) - Math.min(...xs) || 1;
  const dy = Math.max(...ys) - Math.min(...ys);
  const utile = Math.max(1, larghezza - 36);
  const struttura = Math.min(utile, (dy / dx) * utile);
  /*
   * Il riquadro è la struttura PIÙ il diagramma che le sporge da entrambi i
   * lati, più lo spazio per le quote. Prima l'ampiezza era una frazione del
   * riquadro e il riquadro una costante: su una trave orizzontale ne usciva
   * un rettangolo alto duecento punti con dentro un diagramma di trenta, e il
   * resto era aria.
   */
  const a = ampiezzaDiagramma(larghezza);
  return Math.max(96, Math.min(360, struttura + 2 * a + 34));
}

export function disegnaDiagramma(c: ContestoPdf, o: OpzioniDiagramma): string {
  const { palette: p, componente: k } = o;
  const cifre = o.cifre ?? 2;

  /*
   * La struttura si inquadra in un riquadro RIDOTTO dell'ampiezza del
   * diagramma su ciascun lato: è lo spazio in cui il diagramma va a finire, e
   * senza riservarlo le ordinate più alte escono dal riquadro e finiscono
   * sopra il titolo del blocco successivo.
   */
  const a = ampiezzaDiagramma(o.riquadro.w);
  const dentro: Riquadro = {
    x: o.riquadro.x, y: o.riquadro.y + a,
    w: o.riquadro.w, h: Math.max(10, o.riquadro.h - 2 * a - 12),
  };
  disegnaSchema(c, {
    progetto: o.progetto, carichi: [], etichette: o.etichette,
    palette: p, riquadro: dentro, tenue: true,
  });

  const q = inquadra(puntiDelModello(o.modelloRisultati), dentro, 18);
  const nodi = new Map(o.modelloRisultati.nodi.map((n) => [n.id, n]));
  const aste = new Map(o.modelloRisultati.aste.map((a) => [a.id, a]));
  /*
   * LA STESSA REGOLA DELLO SCHERMO (vedi `render/diagrammi.ts`): i valori si
   * leggono dalla tratteggiata dell'asta che l'autore ha disegnato, M positivo
   * dalla sua parte (fibre tese), N e T positivi dalla parte opposta. Prima
   * il documento aveva una regola sua, e sbagliata: su una trave appoggiata
   * disegnata da sinistra il momento finiva sopra, sulle fibre compresse,
   * mentre la didascalia diceva il contrario.
   */
  const lati = latiDelCalcolo(o.progetto, o.modelloRisultati);
  const vista = vistaDallaTratteggiata(o.risultato, lati);
  const colore = coloreComponente(p, k);

  if (k === 'D') return deformata(c, o, q, nodi, aste, colore);

  // ── scala: la stessa per tutte le aste, altrimenti i confronti mentono ──
  let massimo = 0;
  for (const a of o.risultato.aste) {
    for (const v of valori(a, k)) massimo = Math.max(massimo, Math.abs(v));
  }
  if (massimo <= 0) return `${NOME_COMPONENTE[k]} identicamente nullo su tutte le aste.`;
  const ampiezza = ampiezzaDiagramma(o.riquadro.w);
  const scala = ampiezza / massimo;

  const quote: { x: number; y: number; testo: string }[] = [];

  for (const ra of vista.aste) {
    const el = aste.get(ra.astaId);
    if (!el) continue;
    const i = nodi.get(el.nodoIniziale), j = nodi.get(el.nodoFinale);
    if (!i || !j) continue;
    const A = q.p(i.x as unknown as number, i.y as unknown as number);
    const B = q.p(j.x as unknown as number, j.y as unknown as number);
    const L = Math.hypot(B.x - A.x, B.y - A.y) || 1;
    const ux = (B.x - A.x) / L, uy = (B.y - A.y) / L;
    // dove vanno i valori POSITIVI: ŷ dell'asta per `latoDelPositivo`, e ŷ
    // sul foglio — che ha la y verso il basso — è (uy, −ux)
    const verso = latoDelPositivo(k, lati.get(el.id) ?? 1, o.fibreTese !== false);
    const nx = uy * verso, ny = -ux * verso;

    const v = valori(ra, k);
    const punti = [...ra.ascisse].map((x, t) => {
      const s = ra.lunghezza > 0 ? x / ra.lunghezza : 0;
      const base = { x: A.x + ux * L * s, y: A.y + uy * L * s };
      const d = v[t] * scala;
      return { base, x: base.x + nx * d, y: base.y + ny * d };
    });
    if (punti.length < 2) continue;

    // campitura fra la struttura e la curva
    c.save();
    c.globalAlpha = 0.18;
    c.fillStyle = colore;
    c.beginPath();
    c.moveTo(punti[0].base.x, punti[0].base.y);
    for (const t of punti) c.lineTo(t.x, t.y);
    c.lineTo(punti[punti.length - 1].base.x, punti[punti.length - 1].base.y);
    c.closePath();
    c.fill();
    c.restore();

    // la curva
    c.strokeStyle = colore;
    c.lineWidth = 1.1;
    c.setLineDash([]);
    c.beginPath();
    punti.forEach((t, idx) => (idx === 0 ? c.moveTo(t.x, t.y) : c.lineTo(t.x, t.y)));
    c.stroke();

    // i tratti di chiusura agli estremi
    c.lineWidth = 0.7;
    c.beginPath();
    c.moveTo(punti[0].base.x, punti[0].base.y); c.lineTo(punti[0].x, punti[0].y);
    c.moveTo(punti[punti.length - 1].base.x, punti[punti.length - 1].base.y);
    c.lineTo(punti[punti.length - 1].x, punti[punti.length - 1].y);
    c.stroke();

    // ── valori notevoli ──
    for (const idx of indiciNotevoli(ra, k)) {
      const t = punti[idx];
      if (!t) continue;
      const val = v[idx] / (k === 'M' ? 1e3 : 1e3);
      quote.push({ x: t.x + nx * 5, y: t.y + ny * 5, testo: fmt(val, cifre) });
    }
  }

  scriviQuote(c, p, colore, quote);

  const unitaScala = k === 'M' ? 'kNm' : 'kN';
  return `${NOME_COMPONENTE[k]} — valori in ${unitaScala}. `
    + `Massimo in modulo ${fmt(massimo / 1e3, cifre)} ${unitaScala}. `
    + (k === 'M'
      ? 'Il diagramma è riportato dalla parte delle fibre tese: M positivo tende '
        + 'la fibra tratteggiata e sta dalla sua parte.'
      : `${k} positivo dalla parte opposta alla tratteggiata, negativo dalla sua parte.`);
}

function valori(a: RisultatoAsta, k: Exclude<Componente, 'D'>): Float64Array {
  return k === 'N' ? a.N : k === 'T' ? a.T : a.M;
}

/**
 * Gli indici da quotare.
 *
 * I punti notevoli li individua già il modulo di calcolo — estremi, azzeramenti
 * del taglio, discontinuità — e sono gli stessi che l'interfaccia mostra. Qui
 * si aggiungono i due estremi dell'asta, che sono ciò che un lettore cerca per
 * primo, e si scarta chi vale zero: una fila di «0,00» lungo un tratto scarico
 * copre il disegno senza dire niente.
 */
function indiciNotevoli(a: RisultatoAsta, k: Exclude<Componente, 'D'>): number[] {
  const v = valori(a, k);
  const n = v.length;
  const scelti = new Set<number>([0, n - 1]);

  for (const pn of a.puntiNotevoli) {
    // il punto notevole porta l'ascissa: si cerca il campione che le
    // corrisponde, perché gli indici del campionamento non sono esposti
    let migliore = 0, distanza = Infinity;
    for (let i = 0; i < n; i++) {
      const d = Math.abs(a.ascisse[i] - pn.x);
      if (d < distanza) { distanza = d; migliore = i; }
    }
    scelti.add(migliore);
  }
  // le discontinuità: ascissa ripetuta
  for (let i = 0; i < n - 1; i++) {
    if (a.ascisse[i] === a.ascisse[i + 1]) { scelti.add(i); scelti.add(i + 1); }
  }

  const scala = Math.max(...[...v].map(Math.abs), 1);
  return [...scelti]
    .filter((i) => Math.abs(v[i]) > scala * 1e-4)
    .sort((x, y) => x - y);
}

/**
 * Scrive le quote scartando quelle che si sovrappongono.
 *
 * Su un telaio con dieci aste i punti notevoli sono decine e i numeri si
 * accavallano fino a diventare una macchia. Si tiene il primo di ogni gruppo
 * ravvicinato: meglio una quota in meno che due illeggibili.
 */
function scriviQuote(
  c: ContestoPdf, p: PaletteDocumento, colore: string,
  quote: { x: number; y: number; testo: string }[],
): void {
  c.dimensione = 6.4;
  c.grassetto = false;
  c.base = 'middle';
  c.allineamento = 'center';

  const scritte: { x: number; y: number; w: number }[] = [];
  for (const q of quote) {
    const w = c.misura(q.testo, 6.4);
    const collide = scritte.some(
      (s) => Math.abs(s.x - q.x) < (s.w + w) / 2 + 2 && Math.abs(s.y - q.y) < 8,
    );
    if (collide) continue;
    scritte.push({ x: q.x, y: q.y, w });
    // alone chiaro sotto il numero: lo stacca dalla campitura
    c.fillStyle = p.foglio;
    c.fillRect(q.x - w / 2 - 1, q.y - 4, w + 2, 8);
    c.fillStyle = colore;
    c.fillText(q.testo, q.x, q.y);
  }
}

// ═══════════════════════ DEFORMATA ═══════════════════════

function deformata(
  c: ContestoPdf, o: OpzioniDiagramma, q: Inquadratura,
  nodi: Map<unknown, { x: unknown; y: unknown }>,
  aste: Map<unknown, { nodoIniziale: unknown; nodoFinale: unknown }>,
  colore: string,
): string {
  const f = o.fattoreDeformata ?? fattoreDeformata(o.progetto, o.risultato);

  c.strokeStyle = colore;
  c.lineWidth = 1.4;
  c.setLineDash([]);
  c.lineCap = 'round';

  for (const ra of o.risultato.aste) {
    const el = aste.get(ra.astaId);
    if (!el) continue;
    const i = nodi.get(el.nodoIniziale), j = nodi.get(el.nodoFinale);
    if (!i || !j) continue;
    const ix = i.x as number, iy = i.y as number;
    const jx = j.x as number, jy = j.y as number;
    const dx = jx - ix, dy = jy - iy;
    const L = Math.hypot(dx, dy) || 1;
    const cx = dx / L, sy = dy / L;

    c.beginPath();
    for (let t = 0; t < ra.ascisse.length; t++) {
      const x = ra.ascisse[t];
      const u = ra.uLocale[t] * f, v = ra.vLocale[t] * f;
      const mondo = {
        x: ix + cx * (x + u) - sy * v,
        y: iy + sy * (x + u) + cx * v,
      };
      const P = q.p(mondo.x, mondo.y);
      if (t === 0) c.moveTo(P.x, P.y); else c.lineTo(P.x, P.y);
    }
    c.stroke();
  }

  const mm = o.risultato.spostamentoMassimo * 1e3;
  return `Deformata amplificata ${f} volte. `
    + `Spostamento massimo ${fmt(mm, mm >= 100 ? 0 : 2)} mm.`;
}

// ═══════════════════════ DIAGRAMMI PER SINGOLA ASTA ═══════════════════════

export interface OpzioniPerAsta {
  /** risultato GIÀ letto dalla tratteggiata (`vistaDallaTratteggiata`) */
  risultato: RisultatoAnalisi;
  modelloRisultati: Progetto;
  etichette: Etichette;
  palette: PaletteDocumento;
  riquadro: Riquadro;
  astaId: unknown;
  cifre?: number;
}

/**
 * Il diagramma di una sola asta, con l'ascissa in orizzontale.
 *
 * È la forma in cui si studiano: N, T e M sovrapposti nello stesso intervallo
 * di x, così si vede che T è la derivata di M dove entrambi sono continui.
 * Sotto vanno le espressioni polinomiali, nella stessa forma dello schermo.
 */
export function disegnaAsta(c: ContestoPdf, o: OpzioniPerAsta): string[] {
  const p = o.palette;
  const cifre = o.cifre ?? 2;
  const ra = o.risultato.aste.find((a) => a.astaId === o.astaId);
  if (!ra) return [];
  const r = o.riquadro;

  const componenti: Exclude<Componente, 'D'>[] = ['N', 'T', 'M'];
  const hOgni = r.h / 3;

  componenti.forEach((k, indice) => {
    const box = { x: r.x, y: r.y + indice * hOgni, w: r.w, h: hOgni };
    const v = valori(ra, k);
    const massimo = Math.max(...[...v].map(Math.abs), 1e-12);
    const colore = coloreComponente(p, k);

    /*
     * L'ASSE ZERO STA DOVE LO METTONO I VALORI, non a una frazione fissa
     * dell'altezza. Su un diagramma tutto negativo — il momento di una mensola
     * — uno zero a due terzi lascia il grafico fuori dal riquadro e la quota
     * finisce addosso al blocco successivo.
     */
    const alto = Math.max(0, ...[...v]);
    const basso = Math.min(0, ...[...v]);
    const arco = alto - basso || 1;
    // 12 punti sopra e sotto per le quote, che si scrivono fuori dalla curva
    const cima = box.y + 20, fondo = box.y + box.h - 22;
    const perX = (x: number) => box.x + 34 + ((box.w - 50) * x) / (ra.lunghezza || 1);
    const perY = (val: number) => fondo - ((val - basso) / arco) * (fondo - cima);
    const asse = perY(0);

    // asse delle x
    c.strokeStyle = p.linea;
    c.lineWidth = 0.5;
    c.setLineDash([]);
    c.beginPath();
    c.moveTo(perX(0), asse); c.lineTo(perX(ra.lunghezza), asse);
    c.stroke();

    // campitura e curva
    c.save();
    c.globalAlpha = 0.18;
    c.fillStyle = colore;
    c.beginPath();
    c.moveTo(perX(ra.ascisse[0]), asse);
    for (let t = 0; t < ra.ascisse.length; t++) c.lineTo(perX(ra.ascisse[t]), perY(v[t]));
    c.lineTo(perX(ra.ascisse[ra.ascisse.length - 1]), asse);
    c.closePath();
    c.fill();
    c.restore();

    c.strokeStyle = colore;
    c.lineWidth = 1.1;
    c.beginPath();
    for (let t = 0; t < ra.ascisse.length; t++) {
      const X = perX(ra.ascisse[t]), Y = perY(v[t]);
      if (t === 0) c.moveTo(X, Y); else c.lineTo(X, Y);
    }
    c.stroke();

    // etichetta e valori notevoli
    c.dimensione = 7.4;
    c.fillStyle = colore;
    c.allineamento = 'left';
    c.base = 'middle';
    c.fillText(`${k} [${UNITA_COMPONENTE[k]}]`, box.x, box.y + 9);

    const quote = indiciNotevoli(ra, k).map((t) => ({
      x: perX(ra.ascisse[t]),
      y: perY(v[t]) + (v[t] >= 0 ? -6 : 6),
      testo: fmt(v[t] / 1e3, cifre),
    }));
    scriviQuote(c, p, colore, quote);

    // l'ascissa, agli estremi
    c.dimensione = 6.4;
    c.fillStyle = p.testoAttenuato;
    c.allineamento = 'center';
    c.fillText('x = 0', perX(0), asse + 9);
    c.fillText(`${fmt(ra.lunghezza, 2)} m`, perX(ra.lunghezza), asse + 9);
  });

  /*
   * ── LE ESPRESSIONI POLINOMIALI ──
   *
   * In kN e kNm, esattamente come le mostra il pannello dei risultati: il
   * motore lavora in newton, l'interfaccia divide per mille, e il documento
   * deve dire lo stesso numero dello schermo. Il §0 vieta all'esportazione di
   * arrotondare o convertire per conto proprio, e questa conversione è la
   * stessa riga di codice che c'è nel pannello.
   */
  const inKilo = (q: Polinomio | null): Polinomio | null =>
    (q ? { ...q, coefficienti: q.coefficienti.map((k) => k / 1e3) } : null);

  const tratti = espressioniPerAsta(ra.ascisse, ra.N, ra.T, ra.M, ra.lunghezza);
  const righe: string[] = [];
  for (const t of tratti) {
    righe.push(tratti.length > 1
      ? `${fmt(t.da, 2)} ≤ x ≤ ${fmt(t.a, 2)} m`
      : `0 ≤ x ≤ ${fmt(t.a, 2)} m`);
    righe.push(`   N(x) = ${scrivi(inKilo(t.N), 'kN')}`);
    righe.push(`   T(x) = ${scrivi(inKilo(t.T), 'kN')}`);
    righe.push(`   M(x) = ${scrivi(inKilo(t.M), 'kNm')}`);
  }
  return righe;
}

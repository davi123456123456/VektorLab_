/**
 * §4.2 — UN CONTESTO DI DISEGNO CHE PARLA PDF.
 *
 * Espone la stessa API che i moduli di `render/` usano sul canvas — `moveTo`,
 * `arc`, `stroke`, `fillText`, `save`/`restore` — e invece di dipingere pixel
 * emette gli operatori del flusso di contenuto di una pagina PDF. Così i
 * simboli dei vincoli, che sono l'unica cosa che DEVE essere identica a
 * schermo e su carta, si disegnano con lo stesso codice: due disegni della
 * stessa forma divergono, e questa lezione il progetto l'ha già imparata con
 * il carrello interno.
 *
 * IL RIBALTAMENTO. Il canvas ha la y verso il basso, il PDF verso l'alto. La
 * pagina si apre con una trasformazione che ribalta l'asse una volta sola, e
 * da lì in poi ogni coordinata è «da canvas». Le lettere però verrebbero
 * capovolte, quindi il testo porta nella sua matrice un secondo ribaltamento
 * che annulla il primo: è il motivo per cui `fillText` non è una `Td`
 * qualunque.
 */

import {
  larghezzaTesto, letteraleWinAnsi, codificaWinAnsi, type FontRegistrato,
} from './pdf.js';
import { leggiColore } from './palette.js';

export type Allineamento = 'left' | 'center' | 'right';
export type BaseTesto = 'alphabetic' | 'middle' | 'top' | 'bottom';

/**
 * Una sfumatura lineare verticale, resa a BANDE.
 *
 * Il PDF ha le sfumature vere (dizionari di ombreggiatura), ma richiedono
 * oggetti e funzioni a parte per ogni gradiente. Un centinaio di bande
 * ritagliate dalla forma dà lo stesso risultato — a 600 punti per pollice una
 * banda è larga meno di un decimo di millimetro — resta interamente
 * vettoriale, e soprattutto permette di riusare `disegnaSezione` senza
 * toccarla: la campitura delle fibre tese e compresse è la stessa a schermo e
 * sul foglio.
 */
export class Sfumatura {
  readonly fermate: { t: number; colore: string }[] = [];
  constructor(
    readonly x0: number, readonly y0: number,
    readonly x1: number, readonly y1: number,
  ) {}
  addColorStop(t: number, colore: string): void {
    this.fermate.push({ t, colore });
    this.fermate.sort((a, b) => a.t - b.t);
  }
  /** Il colore alla frazione t, interpolato fra le fermate. */
  colore(t: number): string {
    const f = this.fermate;
    if (f.length === 0) return '#000000';
    if (t <= f[0].t) return f[0].colore;
    if (t >= f[f.length - 1].t) return f[f.length - 1].colore;
    for (let i = 0; i < f.length - 1; i++) {
      if (t < f[i].t || t > f[i + 1].t) continue;
      const d = f[i + 1].t - f[i].t;
      const u = d <= 0 ? 0 : (t - f[i].t) / d;
      return mescola(f[i].colore, f[i + 1].colore, u);
    }
    return f[f.length - 1].colore;
  }
}

function mescola(a: string, b: string, u: number): string {
  const A = leggiColore(a), B = leggiColore(b);
  if (!A || !B) return a;
  const m = (x: number, y: number) => Math.round(x + (y - x) * u);
  return `rgb(${m(A.r, B.r)}, ${m(A.g, B.g)}, ${m(A.b, B.b)})`;
}

interface Stato {
  riempimento: string | Sfumatura;
  tratto: string;
  spessore: number;
  tratteggio: number[];
  opacita: number;
  giunto: 'miter' | 'round' | 'bevel';
  estremo: 'butt' | 'round' | 'square';
}

const iniziale = (): Stato => ({
  riempimento: '#000000' as string | Sfumatura, tratto: '#000000', spessore: 1,
  tratteggio: [], opacita: 1, giunto: 'miter', estremo: 'butt',
});

const n = (v: number): string => {
  // tre decimali sono un millesimo di punto: sotto la risoluzione di qualunque
  // stampante, e tengono il file leggero
  const s = v.toFixed(3);
  return s.replace(/\.?0+$/, '') || '0';
};

/**
 * Il contesto di una pagina.
 *
 * `font` e `fontGrassetto` sono già incorporati nel documento: qui servono
 * solo la sigla, per l'operatore `Tf`, e le larghezze, per allineare.
 */
export class ContestoPdf {
  private pezzi: string[] = [];
  private stato: Stato = iniziale();
  private pila: Stato[] = [];
  /** opacità già dichiarate: il PDF le vuole in uno stato grafico con nome */
  private opacitaUsate = new Set<number>();
  /*
   * IL PERCORSO SI ACCUMULA, non si emette subito.
   *
   * Nel canvas `fill()` NON consuma il percorso: si può riempire e poi
   * contornare la stessa forma, ed è quello che fanno tutti i simboli dei
   * vincoli — triangolo bianco con il bordo rosso. Nel PDF l'operatore `f`
   * chiude il percorso e quello che segue non ha più niente da contornare: i
   * triangoli uscivano senza bordo, cioè invisibili sul foglio bianco.
   *
   * Tenendo i comandi in un elenco si riemettono a ogni operazione di
   * disegno, e le due semantiche coincidono.
   */
  private percorso: string[] = [];
  private percorsoAperto = false;
  private ultimo: { x: number; y: number } | null = null;

  /** caratteri sostituiti perché fuori dalla codifica, per il resoconto */
  readonly sostituzioni = new Set<string>();

  /** il font incorporato: `font` da solo è la proprietà in stile canvas */
  fontNormale: FontRegistrato;
  fontGrassetto: FontRegistrato;
  dimensione = 9;
  grassetto = false;
  allineamento: Allineamento = 'left';
  base: BaseTesto = 'alphabetic';

  constructor(
    public readonly larghezza: number,
    public readonly altezza: number,
    font: FontRegistrato,
    fontGrassetto: FontRegistrato,
  ) {
    this.fontNormale = font;
    this.fontGrassetto = fontGrassetto;
    // il ribaltamento dell'asse, una volta sola per pagina
    this.pezzi.push(`1 0 0 -1 0 ${n(altezza)} cm`);
  }

  private out(s: string): void { this.pezzi.push(s); }

  // ── stato ──────────────────────────────────────────────────────────
  save(): void { this.pila.push({ ...this.stato }); this.out('q'); }
  restore(): void {
    const s = this.pila.pop();
    if (s) this.stato = s;
    this.out('Q');
  }

  translate(x: number, y: number): void { this.out(`1 0 0 1 ${n(x)} ${n(y)} cm`); }
  scale(x: number, y: number): void { this.out(`${n(x)} 0 0 ${n(y)} 0 0 cm`); }
  rotate(a: number): void {
    const c = Math.cos(a), s = Math.sin(a);
    this.out(`${n(c)} ${n(s)} ${n(-s)} ${n(c)} 0 0 cm`);
  }

  set fillStyle(c: string | Sfumatura) { this.stato.riempimento = c; }
  get fillStyle(): string | Sfumatura { return this.stato.riempimento; }
  set strokeStyle(c: string) { this.stato.tratto = c; }
  get strokeStyle(): string { return this.stato.tratto; }
  set lineWidth(v: number) { this.stato.spessore = v; }
  get lineWidth(): number { return this.stato.spessore; }
  set lineJoin(v: 'miter' | 'round' | 'bevel') { this.stato.giunto = v; }
  set lineCap(v: 'butt' | 'round' | 'square') { this.stato.estremo = v; }
  set globalAlpha(v: number) { this.stato.opacita = v; }
  get globalAlpha(): number { return this.stato.opacita; }

  setLineDash(d: number[]): void { this.stato.tratteggio = d; }

  createLinearGradient(x0: number, y0: number, x1: number, y1: number): Sfumatura {
    return new Sfumatura(x0, y0, x1, y1);
  }

  /** clearRect sul foglio è un rettangolo bianco: non c'è niente da svuotare. */
  clearRect(): void { /* il foglio è già bianco */ }

  private colore(c: string, perRiempimento: boolean): void {
    const rgb = leggiColore(c) ?? { r: 0, g: 0, b: 0 };
    const t = `${n(rgb.r / 255)} ${n(rgb.g / 255)} ${n(rgb.b / 255)}`;
    this.out(perRiempimento ? `${t} rg` : `${t} RG`);
  }

  private applicaOpacita(): void {
    const a = this.stato.opacita;
    if (a >= 1) { this.out('/O100 gs'); this.opacitaUsate.add(1); return; }
    const chiave = Math.round(a * 100) / 100;
    this.opacitaUsate.add(chiave);
    this.out(`/O${Math.round(chiave * 100)} gs`);
  }

  /** Gli stati grafici da dichiarare fra le risorse della pagina. */
  statiOpacita(): number[] { return [...this.opacitaUsate]; }

  // ── percorsi ───────────────────────────────────────────────────────
  private via(s: string): void { this.percorso.push(s); }

  beginPath(): void {
    this.percorso = [];
    this.percorsoAperto = false;
    this.ultimo = null;
  }

  moveTo(x: number, y: number): void {
    this.via(`${n(x)} ${n(y)} m`);
    this.percorsoAperto = true;
    this.ultimo = { x, y };
  }
  lineTo(x: number, y: number): void {
    if (!this.percorsoAperto) return this.moveTo(x, y);
    this.via(`${n(x)} ${n(y)} l`);
    this.ultimo = { x, y };
  }
  bezierCurveTo(x1: number, y1: number, x2: number, y2: number, x: number, y: number): void {
    if (!this.percorsoAperto) this.moveTo(x1, y1);
    this.via(`${n(x1)} ${n(y1)} ${n(x2)} ${n(y2)} ${n(x)} ${n(y)} c`);
    this.ultimo = { x, y };
  }
  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void {
    const p = this.ultimo ?? { x: cx, y: cy };
    // una quadratica è una cubica con i due controlli a due terzi
    this.bezierCurveTo(
      p.x + (2 / 3) * (cx - p.x), p.y + (2 / 3) * (cy - p.y),
      x + (2 / 3) * (cx - x), y + (2 / 3) * (cy - y),
      x, y,
    );
  }
  closePath(): void { if (this.percorsoAperto) this.via('h'); }

  rect(x: number, y: number, w: number, h: number): void {
    this.via(`${n(x)} ${n(y)} ${n(w)} ${n(h)} re`);
    this.percorsoAperto = true;
  }

  /**
   * Arco approssimato con cubiche di Bézier, un quarto di giro per volta.
   *
   * Il PDF non ha un operatore per gli archi. Con il fattore 0,5523 l'errore
   * su un quarto di cerchio è dello 0,02 %: sotto la risoluzione di stampa, e
   * un cerchio disegnato così resta un cerchio anche ingrandito, che è il
   * motivo per cui si usano curve e non una spezzata.
   */
  arc(cx: number, cy: number, r: number, da = 0, a = Math.PI * 2, antiorario = false): void {
    let inizio = da, fine = a;
    if (antiorario) { const t = inizio; inizio = fine; fine = t; }
    while (fine < inizio) fine += Math.PI * 2;
    const totale = Math.min(fine - inizio, Math.PI * 2);
    const passi = Math.max(1, Math.ceil(totale / (Math.PI / 2)));
    const d = totale / passi;
    const k = (4 / 3) * Math.tan(d / 4);

    const punto = (t: number) => ({ x: cx + r * Math.cos(t), y: cy + r * Math.sin(t) });
    let p = punto(inizio);
    if (!this.percorsoAperto) this.moveTo(p.x, p.y); else this.lineTo(p.x, p.y);
    for (let i = 0; i < passi; i++) {
      const t0 = inizio + i * d, t1 = t0 + d;
      const a0 = punto(t0), a1 = punto(t1);
      this.bezierCurveTo(
        a0.x - k * r * Math.sin(t0), a0.y + k * r * Math.cos(t0),
        a1.x + k * r * Math.sin(t1), a1.y - k * r * Math.cos(t1),
        a1.x, a1.y,
      );
      p = a1;
    }
  }

  ellipse(
    cx: number, cy: number, rx: number, ry: number,
    rotazione: number, da: number, a: number,
  ): void {
    this.save();
    this.translate(cx, cy);
    if (rotazione) this.rotate(rotazione);
    this.scale(rx, ry);
    this.beginPath();
    this.arc(0, 0, 1, da, a);
    this.restore();
  }

  private prima(): void {
    this.applicaOpacita();
    const d = this.stato.tratteggio;
    this.out(d.length > 0 ? `[${d.map(n).join(' ')}] 0 d` : '[] 0 d');
    this.out(`${n(this.stato.spessore)} w`);
    this.out(`${{ miter: 0, round: 1, bevel: 2 }[this.stato.giunto]} j`);
    this.out(`${{ butt: 0, round: 1, square: 2 }[this.stato.estremo]} J`);
  }

  /** Riemette il percorso accumulato e lo dipinge con l'operatore dato. */
  private dipingi(operatore: string, conRiempimento: boolean, conTratto: boolean): void {
    if (this.percorso.length === 0) return;

    // una sfumatura si dipinge a bande dentro la forma, e il contorno segue
    if (conRiempimento && this.stato.riempimento instanceof Sfumatura) {
      this.bande(this.stato.riempimento, operatore.includes('*'));
      if (conTratto) this.dipingi('S', false, true);
      return;
    }

    this.prima();
    if (conRiempimento) this.colore(this.stato.riempimento as string, true);
    if (conTratto) this.colore(this.stato.tratto, false);
    for (const s of this.percorso) this.out(s);
    this.out(operatore);
  }

  /** La sfumatura, ritagliata dal percorso corrente. */
  private bande(g: Sfumatura, pariDispari: boolean): void {
    const passi = 72;
    const dx = g.x1 - g.x0, dy = g.y1 - g.y0;
    const L = Math.hypot(dx, dy);
    if (L < 1e-9) return;

    this.out('q');
    for (const s of this.percorso) this.out(s);
    this.out(pariDispari ? 'W* n' : 'W n');
    this.applicaOpacita();

    // le bande sono perpendicolari alla direzione della sfumatura ed
    // esondano di proposito: il ritaglio le taglia sulla forma vera
    const ux = dx / L, uy = dy / L;
    const px = -uy, py = ux;
    const larga = 4000;
    for (let i = 0; i < passi; i++) {
      const t0 = i / passi, t1 = (i + 1) / passi;
      // un filo di sovrapposizione, o fra una banda e l'altra resta una
      // riga bianca dovuta all'arrotondamento del rasterizzatore
      const a = -0.35 / passi;
      const A = { x: g.x0 + dx * (t0 + a), y: g.y0 + dy * (t0 + a) };
      const B = { x: g.x0 + dx * (t1 - a), y: g.y0 + dy * (t1 - a) };
      this.colore(g.colore((t0 + t1) / 2), true);
      this.out(`${n(A.x + px * larga)} ${n(A.y + py * larga)} m`);
      this.out(`${n(B.x + px * larga)} ${n(B.y + py * larga)} l`);
      this.out(`${n(B.x - px * larga)} ${n(B.y - py * larga)} l`);
      this.out(`${n(A.x - px * larga)} ${n(A.y - py * larga)} l`);
      this.out('h f');
    }
    this.out('Q');
  }

  stroke(): void { this.dipingi('S', false, true); }
  fill(regola?: 'evenodd' | 'nonzero'): void {
    this.dipingi(regola === 'evenodd' ? 'f*' : 'f', true, false);
  }
  fillStroke(regola?: 'evenodd' | 'nonzero'): void {
    this.dipingi(regola === 'evenodd' ? 'B*' : 'B', true, true);
  }
  clip(regola?: 'evenodd' | 'nonzero'): void {
    if (this.percorso.length === 0) return;
    for (const s of this.percorso) this.out(s);
    this.out(regola === 'evenodd' ? 'W* n' : 'W n');
    this.beginPath();
  }

  fillRect(x: number, y: number, w: number, h: number): void {
    this.beginPath(); this.rect(x, y, w, h); this.fill(); this.beginPath();
  }
  strokeRect(x: number, y: number, w: number, h: number): void {
    this.beginPath(); this.rect(x, y, w, h); this.stroke(); this.beginPath();
  }

  // ── testo ──────────────────────────────────────────────────────────

  /** Larghezza del testo come verrà scritto, sostituzioni comprese. */
  misura(testo: string, dimensione = this.dimensione, grassetto = this.grassetto): number {
    const { testo: t } = codificaWinAnsi(testo);
    const f = grassetto ? this.fontGrassetto : this.fontNormale;
    return larghezzaTesto(t, f.font, dimensione);
  }

  /** Altezza approssimata di una riga, per impaginare. */
  altezzaRiga(dimensione = this.dimensione): number { return dimensione * 1.32; }

  /**
   * Scrive del testo. Resta TESTO: selezionabile e ricercabile.
   *
   * La matrice porta un `-1` sulla y perché la pagina è già ribaltata: senza,
   * le lettere uscirebbero specchiate. È l'unico punto del modulo in cui il
   * ribaltamento torna a farsi vedere.
   */
  fillText(testo: string, x: number, y: number): void {
    const { testo: t, sostituiti } = codificaWinAnsi(testo);
    for (const c of sostituiti) this.sostituzioni.add(c);
    if (t.length === 0) return;

    const f = this.grassetto ? this.fontGrassetto : this.fontNormale;
    const w = larghezzaTesto(t, f.font, this.dimensione);
    const dx = this.allineamento === 'center' ? -w / 2
      : this.allineamento === 'right' ? -w : 0;

    // la base tipografica sta sotto le lettere; le altre si ricavano da lì
    const sopra = (f.font.altezzaMaiuscole / 1000) * this.dimensione;
    const sotto = (Math.abs(f.font.discendente) / 1000) * this.dimensione;
    const dy = this.base === 'middle' ? sopra / 2
      : this.base === 'top' ? sopra
      : this.base === 'bottom' ? -sotto : 0;

    this.applicaOpacita();
    this.out('BT');
    this.colore(
      typeof this.stato.riempimento === 'string' ? this.stato.riempimento : '#000000',
      true,
    );
    this.out(`/${f.sigla} ${n(this.dimensione)} Tf`);
    this.out(`1 0 0 -1 ${n(x + dx)} ${n(y + dy)} Tm`);
    this.out(`${letteraleWinAnsi(t)} Tj`);
    this.out('ET');
  }

  // ── compatibilità con il canvas ─────────────────────────────────────
  /*
   * Questi tre membri esistono perché i moduli di `render/` siano
   * riutilizzabili QUI SENZA MODIFICHE. I simboli dei vincoli, le frecce dei
   * carichi e le loro etichette si disegnano con lo stesso codice che gira sul
   * canvas: è l'unico modo di garantire che il PDF mostri gli stessi simboli
   * dello schermo, e il progetto ha già pagato una volta il prezzo di avere
   * due disegni della stessa cosa.
   */

  /** Accetta la forma «bold 9px famiglia» del canvas. */
  set font(v: string) {
    const m = /(\d+(?:\.\d+)?)px/.exec(v);
    if (m) this.dimensione = Number(m[1]);
    this.grassetto = /\bbold\b|\b[6-9]00\b/.test(v);
  }
  get font(): string {
    return `${this.grassetto ? 'bold ' : ''}${this.dimensione}px Roboto`;
  }

  set textAlign(v: Allineamento | 'start' | 'end') {
    this.allineamento = v === 'start' ? 'left' : v === 'end' ? 'right' : v;
  }
  get textAlign(): Allineamento { return this.allineamento; }

  set textBaseline(v: BaseTesto | 'hanging' | 'ideographic') {
    this.base = v === 'hanging' ? 'top' : v === 'ideographic' ? 'bottom' : v;
  }
  get textBaseline(): BaseTesto { return this.base; }

  measureText(testo: string): { width: number } {
    return { width: this.misura(testo) };
  }

  strokeText(testo: string, x: number, y: number): void {
    // il PDF sa contornare il testo, ma sul foglio bianco non serve a nulla:
    // il contorno esiste sullo schermo per staccare una scritta dal fondo scuro
    this.fillText(testo, x, y);
  }

  /** Il flusso di contenuto della pagina. */
  contenuto(): string { return this.pezzi.join('\n'); }
}

/**
 * DISEGNI DI PROVA per le regole di lettura.
 *
 * Producono le `Primitive` che una rete perfetta restituirebbe guardando lo
 * schema: si scrivono in unità di L, con y verso l'alto, così che un caso di
 * prova somigli all'esercizio che rappresenta. La conversione in pixel
 * (scala, margine, rotazione, rumore) avviene solo in `primitive()`.
 *
 * Due dettagli imitano il disegno vero, perché sono proprio ciò che le
 * regole devono leggere:
 *   · un'asta che finisce su un pallino centrato si ferma sul bordo del
 *     pallino (la linea è interrotta dal simbolo);
 *   · un appoggio "non interrompente" ha il pallino tangente alla struttura,
 *     con l'asta che gli passa sopra continua.
 */

import type {
  Primitive, Punto, TipoCorpo, ValoreScritta,
} from '../../src/foto/tipi.js';

const GRADI = Math.PI / 180;
/** raggio del pallino e spessore della linea, in unità di L */
export const RAGGIO = 0.06;
const R = RAGGIO;
const SPESSORE = 0.03;

const puntamento = (gradi: number): Punto =>
  ({ x: -Math.sin(gradi * GRADI), y: Math.cos(gradi * GRADI) });

export class Disegno {
  private aste: { a: Punto; b: Punto }[] = [];
  private pallini: Punto[] = [];
  /** centri dei pallini su cui le aste vanno accorciate */
  private interruzioni: Punto[] = [];
  private corpi: { tipo: TipoCorpo; attacco: Punto; gradi: number }[] = [];
  private frecce: { punta: Punto; gradi: number; lung: number }[] = [];
  private momenti: { centro: Punto; verso: 'orario' | 'antiorario'; raggio: number }[] = [];
  private scritte: { centro: Punto; valore: ValoreScritta; estremi?: [Punto, Punto] }[] = [];
  private rotazione = 0;
  private ampiezzaRumore = 0;

  constructor(private readonly scala = 100) {}

  asta(x1: number, y1: number, x2: number, y2: number): this {
    this.aste.push({ a: { x: x1, y: y1 }, b: { x: x2, y: y2 } });
    return this;
  }

  /** Cerniera interna: pallino centrato nel punto, le aste vi si interrompono. */
  cerniera(x: number, y: number): this {
    this.pallini.push({ x, y });
    this.interruzioni.push({ x, y });
    return this;
  }

  /**
   * Vincolo esterno nel punto (x, y) della struttura, puntato verso `gradi`
   * nella convenzione di VektorLab (0° = vertice in alto, simbolo sotto).
   */
  appoggio(
    tipo: TipoCorpo, x: number, y: number, gradi = 0,
    o: { pallino?: boolean; interrompe?: boolean } = {},
  ): this {
    const pallino = o.pallino ?? true;
    const u = puntamento(gradi);
    const p = { x, y };
    if (!pallino) return this.corpo(tipo, x, y, gradi);
    if (o.interrompe) {
      this.cerniera(x, y);
      return this.corpo(tipo, x - R * u.x, y - R * u.y, gradi);
    }
    this.pallini.push({ x: p.x - R * u.x, y: p.y - R * u.y });
    return this.corpo(tipo, x - 2 * R * u.x, y - 2 * R * u.y, gradi);
  }

  corpo(tipo: TipoCorpo, x: number, y: number, gradi = 0): this {
    this.corpi.push({ tipo, attacco: { x, y }, gradi });
    return this;
  }

  /** Freccia con la punta in (x, y), rivolta verso `gradi`. */
  freccia(x: number, y: number, gradi: number, lung = 0.4): this {
    this.frecce.push({ punta: { x, y }, gradi, lung });
    return this;
  }

  /**
   * `n` frecce equidistanti fra P1 e P2, estremi compresi. Con `punte` le
   * punte toccano la linea P1–P2; altrimenti la toccano le code.
   */
  distribuito(
    x1: number, y1: number, x2: number, y2: number, gradi: number,
    o: { n?: number; punte?: boolean; lung?: number } = {},
  ): this {
    const n = o.n ?? 5;
    const lung = o.lung ?? 0.4;
    const d = { x: Math.cos(gradi * GRADI), y: Math.sin(gradi * GRADI) };
    for (let k = 0; k < n; k++) {
      const s = n === 1 ? 0.5 : k / (n - 1);
      const px = x1 + s * (x2 - x1);
      const py = y1 + s * (y2 - y1);
      if (o.punte ?? true) this.freccia(px, py, gradi, lung);
      else this.freccia(px + lung * d.x, py + lung * d.y, gradi, lung);
    }
    return this;
  }

  momento(x: number, y: number, verso: 'orario' | 'antiorario', raggio = 0.25): this {
    this.momenti.push({ centro: { x, y }, verso, raggio });
    return this;
  }

  /** Quota: il tratto fra (x1, y1) e (x2, y2) vale `valore`·L. */
  quota(valore: number, x1: number, y1: number, x2: number, y2: number): this {
    this.scritte.push({
      centro: { x: (x1 + x2) / 2, y: (y1 + y2) / 2 + 0.1 },
      valore: { famiglia: 'L', valore },
      estremi: [{ x: x1, y: y1 }, { x: x2, y: y2 }],
    });
    return this;
  }

  scritta(famiglia: 'q' | 'F' | 'M', coefficiente: number, x: number, y: number): this {
    this.scritte.push({ centro: { x, y }, valore: { famiglia, coefficiente } });
    return this;
  }

  /** Ruota l'intero disegno, come una foto presa un po' storta. */
  ruota(gradi: number): this {
    this.rotazione = gradi * GRADI;
    return this;
  }

  /** Spostamenti pseudo-casuali ripetibili di ogni punto, in pixel. */
  rumore(ampiezza: number): this {
    this.ampiezzaRumore = ampiezza;
    return this;
  }

  primitive(): Primitive {
    const s = this.scala;
    const aste = this.aste.map(({ a, b }) => accorcia(a, b, this.interruzioni));

    // riquadro di tutto ciò che è disegnato, in unità di L
    const tutti: Punto[] = [
      ...aste.flatMap((x) => [x.a, x.b]), ...this.pallini,
      ...this.corpi.map((c) => c.attacco),
      ...this.frecce.flatMap((f) => [f.punta, coda(f)]),
      ...this.momenti.map((m) => m.centro),
      ...this.scritte.flatMap((x) => [x.centro, ...(x.estremi ?? [])]),
    ];
    const minX = Math.min(...tutti.map((p) => p.x));
    const maxX = Math.max(...tutti.map((p) => p.x));
    const minY = Math.min(...tutti.map((p) => p.y));
    const maxY = Math.max(...tutti.map((p) => p.y));
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const meta = Math.hypot(maxX - minX, maxY - minY) / 2 + 0.5;
    const lato = 2 * meta * s;

    let seme = 12345;
    const caso = (): number => {
      seme = (seme * 1103515245 + 12345) % 2147483648;
      return seme / 2147483648 - 0.5;
    };
    const c = Math.cos(this.rotazione);
    const sn = Math.sin(this.rotazione);
    const px = (p: Punto): Punto => {
      const x = p.x - cx;
      const y = p.y - cy;
      return {
        x: (x * c - y * sn + meta) * s + this.ampiezzaRumore * caso(),
        y: (x * sn + y * c + meta) * s + this.ampiezzaRumore * caso(),
      };
    };
    const rot = this.rotazione;

    return {
      larghezza: lato,
      altezza: lato,
      aste: aste.map(({ a, b }) => ({ a: px(a), b: px(b), spessore: SPESSORE * s, confidenza: 1 })),
      pallini: this.pallini.map((p) => ({ c: px(p), r: R * s, confidenza: 1 })),
      corpi: this.corpi.map((k) => ({
        tipo: k.tipo, attacco: px(k.attacco), angolo: k.gradi * GRADI + rot, confidenza: 1,
      })),
      frecce: this.frecce.map((f) => ({
        punta: px(f.punta), direzione: f.gradi * GRADI + rot, lunghezza: f.lung * s, confidenza: 1,
      })),
      momenti: this.momenti.map((m) => ({
        centro: px(m.centro), raggio: m.raggio * s, verso: m.verso, confidenza: 1,
      })),
      nodi: [],
      scritte: this.scritte.map((x) => ({
        centro: px(x.centro), valore: x.valore, confidenza: 1,
        ...(x.estremi ? { estremi: [px(x.estremi[0]), px(x.estremi[1])] as [Punto, Punto] } : {}),
      })),
    };
  }
}

export const disegno = (scala = 100): Disegno => new Disegno(scala);

function coda(f: { punta: Punto; gradi: number; lung: number }): Punto {
  return {
    x: f.punta.x - f.lung * Math.cos(f.gradi * GRADI),
    y: f.punta.y - f.lung * Math.sin(f.gradi * GRADI),
  };
}

/** Un estremo che cade nel centro di un pallino si ferma sul suo bordo. */
function accorcia(a: Punto, b: Punto, centri: readonly Punto[]): { a: Punto; b: Punto } {
  const l = Math.hypot(b.x - a.x, b.y - a.y);
  const ux = (b.x - a.x) / l;
  const uy = (b.y - a.y) / l;
  const tocca = (p: Punto): boolean => centri.some((c) => Math.hypot(c.x - p.x, c.y - p.y) < 1e-9);
  return {
    a: tocca(a) ? { x: a.x + R * ux, y: a.y + R * uy } : a,
    b: tocca(b) ? { x: b.x - R * ux, y: b.y - R * uy } : b,
  };
}


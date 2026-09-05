/**
 * §4.2 — SCRITTURA DEL PDF: grafica vettoriale e testo che resta testo.
 *
 * Un PDF non è un'immagine: è una sequenza di comandi di disegno molto simili
 * a quelli del canvas — sposta, traccia, riempi, scrivi — più una struttura di
 * oggetti numerati con in fondo una tabella che dice dove si trova ciascuno.
 * Scriverlo direttamente costa poche centinaia di righe e in cambio dà due
 * cose che una libreria di conversione non garantisce: ogni linea è un
 * vettore, e ogni scritta è testo selezionabile e ricercabile.
 *
 * COORDINATE — il PDF ha l'origine in BASSO a sinistra e la y verso l'alto,
 * il canvas in alto a sinistra e la y verso il basso. La conversione avviene
 * in un punto solo, `punto()`, e tutto il resto del programma continua a
 * ragionare come il canvas.
 *
 * UNITÀ — il punto tipografico, 1/72 di pollice. Un A4 è 595,28 × 841,89.
 */

import { leggiFont, type FontTrueType } from './ttf.js';

export const A4 = { larghezza: 595.28, altezza: 841.89 };

export type Orientamento = 'verticale' | 'orizzontale';

export function misurePagina(o: Orientamento): { larghezza: number; altezza: number } {
  return o === 'verticale'
    ? { larghezza: A4.larghezza, altezza: A4.altezza }
    : { larghezza: A4.altezza, altezza: A4.larghezza };
}

// ═══════════════════════ OGGETTI E STRUTTURA ═══════════════════════

/**
 * Un oggetto del file. Il corpo è già testo PDF; i flussi portano anche i
 * byte grezzi, che non passano per una stringa perché un font contiene ogni
 * valore da 0 a 255 e attraversare una stringa JavaScript lo corromperebbe.
 */
interface Oggetto {
  corpo: string;
  flusso?: Uint8Array;
}

const codifica = new TextEncoder();

/** Concatena pezzi di testo e byte in un unico blocco. */
class Nastro {
  private pezzi: Uint8Array[] = [];
  private lunghezza = 0;

  scrivi(s: string): void { this.byte(codifica.encode(s)); }
  byte(b: Uint8Array): void { this.pezzi.push(b); this.lunghezza += b.length; }
  get posizione(): number { return this.lunghezza; }

  chiudi(): Uint8Array {
    const out = new Uint8Array(this.lunghezza);
    let p = 0;
    for (const b of this.pezzi) { out.set(b, p); p += b.length; }
    return out;
  }
}

/** Testo di una stringa PDF letterale, con le parentesi protette. */
export function stringaPdf(s: string): string {
  return `(${s.replace(/[\\()]/g, (c) => `\\${c}`)})`;
}

/**
 * Testo in UTF-16BE, per le stringhe dei metadati.
 *
 * Il titolo di un elaborato in italiano ha gli accenti, e nella codifica a un
 * byte del PDF diventerebbero caratteri sbagliati nella barra del titolo del
 * lettore.
 */
function stringaUnicode(s: string): string {
  let esadecimale = 'FEFF';
  for (const c of s) {
    const p = c.codePointAt(0)!;
    if (p > 0xffff) {
      const v = p - 0x10000;
      esadecimale += (0xd800 + (v >> 10)).toString(16).padStart(4, '0');
      esadecimale += (0xdc00 + (v & 0x3ff)).toString(16).padStart(4, '0');
    } else {
      esadecimale += p.toString(16).padStart(4, '0');
    }
  }
  return `<${esadecimale.toUpperCase()}>`;
}

// ═══════════════════════ IL DOCUMENTO ═══════════════════════

export interface Metadati {
  titolo: string;
  autore: string;
  soggetto?: string;
}

export interface FontRegistrato {
  /** nome della risorsa dentro il contenuto: /F1, /F2 … */
  sigla: string;
  font: FontTrueType;
}

export class DocumentoPdf {
  private oggetti: (Oggetto | null)[] = [null];   // l'indice 0 non esiste
  private pagine: { riferimento: number; larghezza: number; altezza: number }[] = [];
  private font: FontRegistrato[] = [];

  constructor(private readonly metadati: Metadati) {}

  private aggiungi(corpo: string, flusso?: Uint8Array): number {
    this.oggetti.push({ corpo, flusso });
    return this.oggetti.length - 1;
  }

  /**
   * Incorpora un font e restituisce la sigla con cui usarlo.
   *
   * Il font entra nel file per intero come `FontFile2`, e accanto ci va la
   * tabella delle larghezze: è quella che permette al lettore di ricostruire
   * le parole quando l'utente seleziona o cerca nel documento. Senza, il testo
   * resterebbe visibile e diventerebbe inselezionabile.
   */
  incorporaFont(byte: Uint8Array): FontRegistrato {
    const f = leggiFont(byte);
    const sigla = `F${this.font.length + 1}`;

    const file = this.aggiungi(
      `<< /Length ${byte.length} /Length1 ${byte.length} >>`, byte,
    );

    /*
     * ENCODING. Si usa WinAnsiEncoding, che copre il latino occidentale —
     * accenti italiani compresi — con un byte per carattere. I caratteri fuori
     * da quella tavola (σ, τ, ×, ‰) non si possono scrivere così: chi scrive
     * il testo li sostituisce, e `codificaWinAnsi` dice quali sono.
     */
    const larghezze: number[] = [];
    for (let c = 32; c <= 255; c++) {
      larghezze.push(f.larghezza(daWinAnsi(c)));
    }

    const descrittore = this.aggiungi([
      '<< /Type /FontDescriptor',
      `/FontName /${f.nome}`,
      // 32 = font simbolico spento + font non simbolico acceso
      '/Flags 32',
      `/FontBBox [${f.riquadro.xMin} ${f.riquadro.yMin} ${f.riquadro.xMax} ${f.riquadro.yMax}]`,
      `/ItalicAngle ${f.angoloCorsivo.toFixed(1)}`,
      `/Ascent ${f.ascendente}`,
      `/Descent ${f.discendente}`,
      `/CapHeight ${f.altezzaMaiuscole}`,
      '/StemV 80',
      `/FontFile2 ${file} 0 R`,
      '>>',
    ].join(' '));

    const oggetto = this.aggiungi([
      '<< /Type /Font /Subtype /TrueType',
      `/BaseFont /${f.nome}`,
      '/FirstChar 32 /LastChar 255',
      `/Widths [${larghezze.join(' ')}]`,
      `/FontDescriptor ${descrittore} 0 R`,
      '/Encoding /WinAnsiEncoding',
      '>>',
    ].join(' '));

    const reg = { sigla, font: f, riferimento: oggetto };
    this.riferimentiFont.set(sigla, oggetto);
    this.font.push(reg);
    return reg;
  }

  private riferimentiFont = new Map<string, number>();

  /** Aggiunge una pagina con il contenuto già composto. */
  aggiungiPagina(
    contenuto: string, larghezza: number, altezza: number,
  ): void {
    const flusso = codifica.encode(contenuto);
    const c = this.aggiungi(`<< /Length ${flusso.length} >>`, flusso);
    this.pagine.push({ riferimento: c, larghezza, altezza });
  }

  get numeroPagine(): number { return this.pagine.length; }

  /** Chiude il documento e restituisce i byte del file. */
  serializza(): Uint8Array {
    /*
     * STATI GRAFICI PER L'OPACITÀ. Il PDF non ha un «alpha» fra i parametri
     * del tratto: la trasparenza è uno stato grafico con un nome, che va
     * dichiarato fra le risorse. Si dichiarano tutti i centesimi in un colpo
     * solo — sono un centinaio di righe di dizionario, meno di due kilobyte —
     * invece di raccogliere quali servono da ogni pagina: il codice che ne
     * risulterebbe costa più di quei due kilobyte.
     */
    const stati: string[] = [];
    for (let i = 0; i <= 100; i++) {
      const a = (i / 100).toFixed(2);
      stati.push(`/O${i} << /Type /ExtGState /ca ${a} /CA ${a} >>`);
    }

    const risorse = [
      '<< /Font <<',
      ...[...this.riferimentiFont].map(([s, r]) => `/${s} ${r} 0 R`),
      '>>',
      `/ExtGState << ${stati.join(' ')} >>`,
      '>>',
    ].join(' ');

    // l'albero delle pagine si conosce solo alla fine: i figli devono già
    // esistere, e il padre deve essere citato da ciascuno
    const albero = this.oggetti.length + this.pagine.length;
    const riferimentiPagina: number[] = [];
    for (const p of this.pagine) {
      riferimentiPagina.push(this.aggiungi([
        '<< /Type /Page',
        `/Parent ${albero} 0 R`,
        `/MediaBox [0 0 ${p.larghezza.toFixed(2)} ${p.altezza.toFixed(2)}]`,
        `/Resources ${risorse}`,
        `/Contents ${p.riferimento} 0 R`,
        '>>',
      ].join(' ')));
    }
    const rifAlbero = this.aggiungi([
      '<< /Type /Pages',
      `/Count ${riferimentiPagina.length}`,
      `/Kids [${riferimentiPagina.map((r) => `${r} 0 R`).join(' ')}]`,
      '>>',
    ].join(' '));
    if (rifAlbero !== albero) {
      throw new Error('Numerazione degli oggetti incoerente nell\'albero delle pagine.');
    }

    const info = this.aggiungi([
      '<<',
      `/Title ${stringaUnicode(this.metadati.titolo)}`,
      `/Author ${stringaUnicode(this.metadati.autore)}`,
      this.metadati.soggetto ? `/Subject ${stringaUnicode(this.metadati.soggetto)}` : '',
      '/Producer (VektorLab)',
      '/Creator (VektorLab)',
      `/CreationDate ${stringaPdf(dataPdf(new Date()))}`,
      '>>',
    ].filter(Boolean).join(' '));

    const catalogo = this.aggiungi(
      `<< /Type /Catalog /Pages ${rifAlbero} 0 R >>`,
    );

    // ── scrittura ──
    const n = new Nastro();
    n.scrivi('%PDF-1.4\n');
    // un commento con byte alti dichiara che il file è binario: senza, un
    // trasferimento «di testo» potrebbe alterare i byte del font
    n.byte(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));

    const posizioni: number[] = [0];
    for (let i = 1; i < this.oggetti.length; i++) {
      const o = this.oggetti[i]!;
      posizioni.push(n.posizione);
      n.scrivi(`${i} 0 obj\n${o.corpo}\n`);
      if (o.flusso) {
        n.scrivi('stream\n');
        n.byte(o.flusso);
        n.scrivi('\nendstream\n');
      }
      n.scrivi('endobj\n');
    }

    const inizioXref = n.posizione;
    n.scrivi(`xref\n0 ${this.oggetti.length}\n`);
    n.scrivi('0000000000 65535 f \n');
    for (let i = 1; i < this.oggetti.length; i++) {
      n.scrivi(`${String(posizioni[i]).padStart(10, '0')} 00000 n \n`);
    }
    n.scrivi([
      'trailer',
      `<< /Size ${this.oggetti.length} /Root ${catalogo} 0 R /Info ${info} 0 R >>`,
      'startxref',
      `${inizioXref}`,
      '%%EOF',
    ].join('\n'));
    n.scrivi('\n');
    return n.chiudi();
  }
}

function dataPdf(d: Date): string {
  const p = (v: number) => String(v).padStart(2, '0');
  const scarto = -d.getTimezoneOffset();
  const segno = scarto >= 0 ? '+' : '-';
  return `D:${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`
    + `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
    + `${segno}${p(Math.floor(Math.abs(scarto) / 60))}'${p(Math.abs(scarto) % 60)}'`;
}

// ═══════════════════════ CODIFICA DEL TESTO ═══════════════════════

/**
 * WinAnsiEncoding: le 32 caselle fra 128 e 159 non sono Latin-1.
 *
 * È l'unico punto in cui la tavola si discosta da Unicode, e ignorarlo
 * significa scrivere un carattere per un altro proprio dove capitano le
 * virgolette tipografiche e il trattino lungo, che in un testo italiano
 * scritto bene ci sono di sicuro.
 */
const ALTA: Record<number, number> = {
  128: 0x20ac, 130: 0x201a, 131: 0x0192, 132: 0x201e, 133: 0x2026,
  134: 0x2020, 135: 0x2021, 136: 0x02c6, 137: 0x2030, 138: 0x0160,
  139: 0x2039, 140: 0x0152, 142: 0x017d, 145: 0x2018, 146: 0x2019,
  147: 0x201c, 148: 0x201d, 149: 0x2022, 150: 0x2013, 151: 0x2014,
  152: 0x02dc, 153: 0x2122, 154: 0x0161, 155: 0x203a, 156: 0x0153,
  158: 0x017e, 159: 0x0178,
};

const daWinAnsi = (codice: number): number => ALTA[codice] ?? codice;

const aWinAnsi = new Map<number, number>();
for (let c = 32; c <= 255; c++) aWinAnsi.set(daWinAnsi(c), c);

/**
 * Sostituzioni per i caratteri che WinAnsi non ha.
 *
 * σ, τ, ×, ² compaiono ovunque in una relazione di calcolo, e WinAnsi non li
 * contiene. Le alternative sono tre: un font a codifica larga (complica il
 * documento), un glifo mancante (un rettangolo vuoto in mezzo a una formula),
 * o una sostituzione dichiarata. La terza è la sola che lascia il testo
 * leggibile E ricercabile, e le sostituzioni sono quelle che un ingegnere
 * scriverebbe comunque a mano.
 */
const SOSTITUZIONI: Record<string, string> = {
  'σ': 'sigma', 'τ': 'tau', 'χ': 'chi', 'θ': 'theta', 'λ': 'lambda',
  'γ': 'gamma', 'δ': 'delta', 'ρ': 'rho', 'α': 'alpha', 'β': 'beta',
  'ν': 'nu', 'Δ': 'Delta', 'Σ': 'Somma', 'φ': 'phi', 'ω': 'omega',
  'π': 'pi', 'ε': 'epsilon', 'η': 'eta', 'μ': 'mu',
  '×': 'x', '·': '.', '−': '-', '–': '-', '—': '-',
  // ² e ³ ci sono in WinAnsi e passano intatti; dal quarto in poi no, e
  // «mm?» al posto di «mm⁴» in un'intestazione è un dato perso
  '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁰': '0', '¹': '1',
  '≤': '<=', '≥': '>=', '≠': '!=', '≈': '~=',
  // «rad» per la radice sarebbe confondibile con i radianti, in un documento
  // in cui gli angoli compaiono davvero
  '∞': 'inf', '√': 'sqrt', '∑': 'somma', '⊥': 'perp', '∥': '//',
  '∫': 'int', '∂': 'd', '∆': 'Delta',
  '₀': '0', '₁': '1', '₂': '2', '₃': '3', '↑': '^', '↓': 'v',
  '⌀': 'diam ', '‰': 'per mille', '⋅': '.',
};

/**
 * Porta un testo dentro la codifica del font, dichiarando le sostituzioni.
 *
 * Restituisce anche `sostituiti`, così chi chiama può accorgersi che una
 * lettera greca è diventata una parola invece di scoprirlo guardando il PDF.
 */
export function codificaWinAnsi(testo: string): { testo: string; sostituiti: string[] } {
  const sostituiti: string[] = [];
  const lettera = (s: string) => /[A-Za-z0-9]/.test(s);
  const caratteri = [...testo];
  let out = '';

  for (let i = 0; i < caratteri.length; i++) {
    const c = caratteri[i];
    const p = c.codePointAt(0)!;
    if (aWinAnsi.has(p)) { out += c; continue; }

    const alt = SOSTITUZIONI[c];
    if (alt === undefined) { out += '?'; sostituiti.push(c); continue; }

    /*
     * UNA SOSTITUZIONE LUNGA VUOLE ARIA. «σid» diventava «sigmaid», che non è
     * una parola: quando al posto di un simbolo entra una parola, questa non
     * può saldarsi a ciò che le sta accanto. Le sostituzioni di un solo
     * carattere (⁴ → 4) invece devono restare attaccate.
     */
    const parola = alt.length > 1 && /[a-z]/i.test(alt);
    const prima = parola && out.length > 0 && lettera(out[out.length - 1]) ? ' ' : '';
    const dopo = parola && lettera(caratteri[i + 1] ?? '') ? ' ' : '';
    out += prima + alt + dopo;
    sostituiti.push(c);
  }
  return { testo: out, sostituiti };
}

/** I byte di una stringa già ridotta a WinAnsi, come stringa PDF letterale. */
export function letteraleWinAnsi(testo: string): string {
  let out = '';
  for (const c of testo) {
    const b = aWinAnsi.get(c.codePointAt(0)!) ?? 0x3f;
    if (b === 0x28 || b === 0x29 || b === 0x5c) out += `\\${String.fromCharCode(b)}`;
    else if (b < 32 || b > 126) out += `\\${b.toString(8).padStart(3, '0')}`;
    else out += String.fromCharCode(b);
  }
  return `(${out})`;
}

/** Larghezza di un testo, in punti, per un font a una data dimensione. */
export function larghezzaTesto(
  testo: string, font: FontTrueType, dimensione: number,
): number {
  let mille = 0;
  for (const c of testo) mille += font.larghezza(c.codePointAt(0)!);
  return (mille * dimensione) / 1000;
}

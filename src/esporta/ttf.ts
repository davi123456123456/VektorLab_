/**
 * §4.2 — LETTURA DI UN FONT TRUETYPE, quel tanto che serve per incorporarlo.
 *
 * Per mettere un font dentro un PDF servono tre cose: i BYTE del file, la
 * LARGHEZZA di ogni carattere usato — senza, il lettore non sa dove finisce
 * una parola e il testo selezionato viene fuori sbagliato — e qualche misura
 * per il descrittore. Tutto il resto del font (contorni, hinting, kerning) al
 * PDF non serve: lo interpreta il lettore.
 *
 * Qui NON si disegnano glifi e non si fa sottoinsieme: si legge, si misura, e
 * si consegna il file intero. Un font di 124 kB incorporato per intero è più
 * semplice e più sicuro di un sottoinsieme costruito a mano, e il documento
 * pesa quanto una fotografia.
 *
 * Tabelle lette: `head` (unità per em, riquadro), `hhea` + `hmtx` (larghezze),
 * `cmap` (da carattere a glifo), `OS/2` (altezza delle maiuscole).
 */

export interface FontTrueType {
  /** i byte del file, così come vanno nel PDF */
  byte: Uint8Array;
  /** nome PostScript, quello che finisce nel PDF */
  nome: string;
  /** unità di disegno per em: quasi sempre 1000 o 2048 */
  unitaPerEm: number;
  /** riquadro del font, in unità di disegno */
  riquadro: { xMin: number; yMin: number; xMax: number; yMax: number };
  ascendente: number;
  discendente: number;
  altezzaMaiuscole: number;
  angoloCorsivo: number;
  /** larghezza di un carattere Unicode, in millesimi di em */
  larghezza(codice: number): number;
}

class Lettore {
  constructor(private readonly d: DataView, public pos = 0) {}
  u8(): number { return this.d.getUint8(this.pos++); }
  u16(): number { const v = this.d.getUint16(this.pos); this.pos += 2; return v; }
  i16(): number { const v = this.d.getInt16(this.pos); this.pos += 2; return v; }
  u32(): number { const v = this.d.getUint32(this.pos); this.pos += 4; return v; }
  a(p: number): this { this.pos = p; return this; }
}

/**
 * Analizza un font TrueType.
 *
 * Se qualcosa non torna si solleva un errore con il motivo: un font illeggibile
 * deve fermare l'esportazione con una spiegazione, non produrre un PDF in cui
 * il testo è largo a caso.
 */
export function leggiFont(byte: Uint8Array): FontTrueType {
  const d = new DataView(byte.buffer, byte.byteOffset, byte.byteLength);
  const l = new Lettore(d);

  const versione = l.u32();
  if (versione !== 0x00010000 && versione !== 0x74727565) {
    throw new Error('Il file non è un font TrueType riconoscibile.');
  }
  const numeroTabelle = l.u16();
  l.pos += 6;

  const tabelle = new Map<string, { off: number; len: number }>();
  for (let i = 0; i < numeroTabelle; i++) {
    const tag = String.fromCharCode(l.u8(), l.u8(), l.u8(), l.u8());
    l.u32();                                   // checksum, non serve
    tabelle.set(tag, { off: l.u32(), len: l.u32() });
  }
  const tab = (nome: string) => {
    const t = tabelle.get(nome);
    if (!t) throw new Error(`Font senza la tabella «${nome}».`);
    return t;
  };

  // ── head: unità per em e riquadro ──
  const head = tab('head');
  l.a(head.off + 18);
  const unitaPerEm = l.u16();
  l.a(head.off + 36);
  const riquadro = { xMin: l.i16(), yMin: l.i16(), xMax: l.i16(), yMax: l.i16() };
  l.a(head.off + 50);
  const formatoLoca = l.i16();
  void formatoLoca;

  // ── hhea: quante metriche orizzontali ci sono in hmtx ──
  const hhea = tab('hhea');
  l.a(hhea.off + 4);
  const ascendente = l.i16();
  const discendente = l.i16();
  l.a(hhea.off + 34);
  const numeroMetriche = l.u16();

  // ── hmtx: le larghezze, per indice di glifo ──
  const hmtx = tab('hmtx');
  const avanzamenti = new Uint16Array(numeroMetriche);
  l.a(hmtx.off);
  for (let i = 0; i < numeroMetriche; i++) { avanzamenti[i] = l.u16(); l.i16(); }

  // ── cmap: da carattere Unicode a indice di glifo ──
  const cmap = leggiCmap(l, tab('cmap').off);

  // ── OS/2: altezza delle maiuscole, per il descrittore ──
  let altezzaMaiuscole = Math.round(0.7 * unitaPerEm);
  const os2 = tabelle.get('OS/2');
  if (os2 && os2.len >= 90) {
    l.a(os2.off);
    const v = l.u16();
    if (v >= 2) { l.a(os2.off + 88); altezzaMaiuscole = l.i16(); }
  }

  let angoloCorsivo = 0;
  const post = tabelle.get('post');
  if (post) {
    l.a(post.off + 4);
    // italicAngle è un fixed 16.16
    angoloCorsivo = l.i16() + l.u16() / 65536;
  }

  const nome = leggiNomePostScript(l, tabelle.get('name'))
    ?? 'FontIncorporato';

  /*
   * Le larghezze del PDF sono in MILLESIMI DI EM, sempre, indipendentemente da
   * quante unità per em usi il font: Roboto ne usa 2048, un altro font 1000, e
   * il PDF non deve accorgersene.
   */
  const scala = 1000 / unitaPerEm;
  const cache = new Map<number, number>();
  const larghezza = (codice: number): number => {
    const memo = cache.get(codice);
    if (memo !== undefined) return memo;
    const glifo = cmap.get(codice) ?? 0;
    const grezza = avanzamenti[Math.min(glifo, numeroMetriche - 1)] ?? 0;
    const v = Math.round(grezza * scala);
    cache.set(codice, v);
    return v;
  };

  return {
    byte, nome, unitaPerEm,
    riquadro: {
      xMin: Math.round(riquadro.xMin * scala), yMin: Math.round(riquadro.yMin * scala),
      xMax: Math.round(riquadro.xMax * scala), yMax: Math.round(riquadro.yMax * scala),
    },
    ascendente: Math.round(ascendente * scala),
    discendente: Math.round(discendente * scala),
    altezzaMaiuscole: Math.round(altezzaMaiuscole * scala),
    angoloCorsivo,
    larghezza,
  };
}

/**
 * Sottotabella cmap Unicode.
 *
 * Si cercano i formati 4 (BMP, quello che hanno tutti) e 12 (oltre il BMP).
 * Un font senza sottotabella Unicode non è utilizzabile per scrivere testo
 * ricercabile, ed è meglio dirlo subito.
 */
function leggiCmap(l: Lettore, off: number): Map<number, number> {
  l.a(off + 2);
  const n = l.u16();
  let scelta = -1, sceltaFormato = -1;
  for (let i = 0; i < n; i++) {
    const piattaforma = l.u16(), codifica = l.u16(), sub = l.u32();
    const unicode = piattaforma === 0
      || (piattaforma === 3 && (codifica === 1 || codifica === 10));
    if (!unicode) continue;
    const dopo = l.pos;
    const formato = l.a(off + sub).u16();
    l.a(dopo);
    if (formato === 12) { scelta = off + sub; sceltaFormato = 12; break; }
    if (formato === 4 && sceltaFormato !== 4) { scelta = off + sub; sceltaFormato = 4; }
  }
  if (scelta < 0) throw new Error('Font senza tabella cmap Unicode.');

  const m = new Map<number, number>();
  if (sceltaFormato === 12) {
    l.a(scelta + 12);
    const gruppi = l.u32();
    for (let i = 0; i < gruppi; i++) {
      const primo = l.u32(), ultimo = l.u32(), glifo = l.u32();
      for (let c = primo; c <= ultimo && c - primo < 0x10000; c++) {
        m.set(c, glifo + (c - primo));
      }
    }
    return m;
  }

  // formato 4: segmenti con delta e range offset
  l.a(scelta + 6);
  const segX2 = l.u16();
  const seg = segX2 / 2;
  l.pos += 6;
  const fine: number[] = [], inizio: number[] = [], delta: number[] = [], scarto: number[] = [];
  const baseScarto: number[] = [];
  for (let i = 0; i < seg; i++) fine.push(l.u16());
  l.u16();
  for (let i = 0; i < seg; i++) inizio.push(l.u16());
  for (let i = 0; i < seg; i++) delta.push(l.i16());
  for (let i = 0; i < seg; i++) { baseScarto.push(l.pos); scarto.push(l.u16()); }

  for (let i = 0; i < seg; i++) {
    for (let c = inizio[i]; c <= fine[i] && c !== 0xffff; c++) {
      let g: number;
      if (scarto[i] === 0) {
        g = (c + delta[i]) & 0xffff;
      } else {
        const p = baseScarto[i] + scarto[i] + (c - inizio[i]) * 2;
        g = l.a(p).u16();
        if (g !== 0) g = (g + delta[i]) & 0xffff;
      }
      if (g !== 0) m.set(c, g);
    }
  }
  return m;
}

/** Nome PostScript (record 6) dalla tabella `name`. */
function leggiNomePostScript(
  l: Lettore, tab: { off: number; len: number } | undefined,
): string | null {
  if (!tab) return null;
  l.a(tab.off + 2);
  const n = l.u16();
  const areaStringhe = tab.off + l.u16();
  for (let i = 0; i < n; i++) {
    const piattaforma = l.u16();
    l.u16();                                   // codifica
    l.u16();                                   // lingua
    const id = l.u16();
    const lunghezza = l.u16();
    const scarto = l.u16();
    if (id !== 6) continue;
    const dopo = l.pos;
    l.a(areaStringhe + scarto);
    let s = '';
    if (piattaforma === 3) {
      for (let k = 0; k < lunghezza / 2; k++) s += String.fromCharCode(l.u16());
    } else {
      for (let k = 0; k < lunghezza; k++) s += String.fromCharCode(l.u8());
    }
    l.a(dopo);
    // il nome PostScript non ammette spazi né parentesi
    const pulito = s.replace(/[^\x21-\x7e]|[()<>[\]{}/%]/g, '');
    if (pulito) return pulito;
  }
  return null;
}

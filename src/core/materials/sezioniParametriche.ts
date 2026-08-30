/**
 * Sezioni parametriche.
 *
 * Ogni sezione è definita dalle sue MISURE e le proprietà si calcolano con le
 * formule esatte: niente tabelle. I profili commerciali restano disponibili
 * come PRESET che precompilano i campi, ma i campi restano liberi — un profilo
 * tabellato è un punto di partenza, non una gabbia.
 *
 * SIMMETRIA — le sezioni a T e a L non sono simmetriche rispetto all'asse
 * orizzontale: il baricentro non sta a metà altezza e il modulo di resistenza
 * è diverso sopra e sotto. Tutto il modulo lavora quindi con la coordinata y
 * misurata DAL BARICENTRO, con estremi `yInf` e `ySup` distinti.
 *
 * OLTRE AD A E I — la verifica tensionale ha bisogno, a ogni quota, della
 * larghezza b(y) e del momento statico S(y) per calcolare τ = T·S/(I·b).
 * Sono definiti qui perché discendono dalla forma, e da A e I non si ricavano.
 */

import type { SectionId, Sezione } from '../model/types.js';

export type FamigliaParametrica =
  | 'rettangolarePiena'
  | 'rettangolareCava'
  | 'circolarePiena'
  | 'circolareCava'
  | 'doppioT'
  | 'aT'
  | 'aC'
  | 'aL';

export type ParametriSezione =
  | { famiglia: 'rettangolarePiena'; B: number; H: number }
  | { famiglia: 'rettangolareCava'; B: number; H: number; s: number }
  | { famiglia: 'circolarePiena'; D: number }
  | { famiglia: 'circolareCava'; D: number; s: number }
  /** doppio T simmetrico: anima s1, ali s2, raccordo r */
  | { famiglia: 'doppioT'; H: number; B: number; s1: number; s2: number; r?: number }
  /** a T: ala in alto, anima sotto. Asimmetrica rispetto all'asse orizzontale */
  | { famiglia: 'aT'; H: number; B: number; s1: number; s2: number }
  /** a C: anima verticale a sinistra, due ali. Simmetrica in verticale */
  | { famiglia: 'aC'; H: number; B: number; s1: number; s2: number }
  /** angolare a lati disuguali, spessore costante */
  | { famiglia: 'aL'; H: number; B: number; s: number };

export interface MisuraRichiesta {
  chiave: string;
  etichetta: string;
  simbolo: string;
  predefinito: number;
  /** true se può valere zero */
  facoltativa?: boolean;
}

export interface DescrizioneFamiglia {
  famiglia: FamigliaParametrica;
  nome: string;
  misure: MisuraRichiesta[];
  note?: string;
  /** true se il baricentro non sta a metà altezza */
  asimmetrica?: boolean;
}

export const FAMIGLIE: DescrizioneFamiglia[] = [
  {
    famiglia: 'rettangolarePiena', nome: 'Rettangolare piena',
    misure: [
      { chiave: 'B', etichetta: 'base', simbolo: 'B', predefinito: 0.20 },
      { chiave: 'H', etichetta: 'altezza', simbolo: 'H', predefinito: 0.40 },
    ],
  },
  {
    famiglia: 'rettangolareCava', nome: 'Rettangolare cava',
    misure: [
      { chiave: 'B', etichetta: 'base esterna', simbolo: 'B', predefinito: 0.20 },
      { chiave: 'H', etichetta: 'altezza esterna', simbolo: 'H', predefinito: 0.30 },
      { chiave: 's', etichetta: 'spessore', simbolo: 's', predefinito: 0.010 },
    ],
    note: 'Spessore costante sui quattro lati.',
  },
  {
    famiglia: 'circolarePiena', nome: 'Circolare piena',
    misure: [{ chiave: 'D', etichetta: 'diametro', simbolo: 'D', predefinito: 0.20 }],
  },
  {
    famiglia: 'circolareCava', nome: 'Tubo circolare',
    misure: [
      { chiave: 'D', etichetta: 'diametro esterno', simbolo: 'D', predefinito: 0.20 },
      { chiave: 's', etichetta: 'spessore', simbolo: 's', predefinito: 0.008 },
    ],
  },
  {
    famiglia: 'doppioT', nome: 'Doppio T',
    misure: [
      { chiave: 'H', etichetta: 'altezza totale', simbolo: 'H', predefinito: 0.30 },
      { chiave: 'B', etichetta: 'larghezza ali', simbolo: 'B', predefinito: 0.15 },
      { chiave: 's1', etichetta: 'spessore anima', simbolo: 's₁', predefinito: 0.0071 },
      { chiave: 's2', etichetta: 'spessore ali', simbolo: 's₂', predefinito: 0.0107 },
      { chiave: 'r', etichetta: 'raccordo', simbolo: 'r', predefinito: 0.015, facoltativa: true },
    ],
    note: 'Il raccordo fra anima e ala incide su A e I di circa il 4 %: '
      + 'includendolo, le proprietà coincidono con quelle tabellate entro lo 0,1 %.',
  },
  {
    famiglia: 'aT', nome: 'Sezione a T',
    misure: [
      { chiave: 'H', etichetta: 'altezza totale', simbolo: 'H', predefinito: 0.20 },
      { chiave: 'B', etichetta: 'larghezza ala', simbolo: 'B', predefinito: 0.20 },
      { chiave: 's1', etichetta: 'spessore anima', simbolo: 's₁', predefinito: 0.010 },
      { chiave: 's2', etichetta: 'spessore ala', simbolo: 's₂', predefinito: 0.014 },
    ],
    note: 'Ala in alto. Il baricentro non sta a metà altezza: i moduli di '
      + 'resistenza superiore e inferiore sono diversi.',
    asimmetrica: true,
  },
  {
    famiglia: 'aC', nome: 'Sezione a C',
    misure: [
      { chiave: 'H', etichetta: 'altezza totale', simbolo: 'H', predefinito: 0.20 },
      { chiave: 'B', etichetta: 'larghezza ali', simbolo: 'B', predefinito: 0.075 },
      { chiave: 's1', etichetta: 'spessore anima', simbolo: 's₁', predefinito: 0.0085 },
      { chiave: 's2', etichetta: 'spessore ali', simbolo: 's₂', predefinito: 0.0115 },
    ],
    note: 'Per la flessione nel piano vale lo stesso I del doppio T con le '
      + 'stesse misure: cambia la posizione del centro di taglio, che un '
      + 'programma piano non modella.',
  },
  {
    famiglia: 'aL', nome: 'Angolare a L',
    misure: [
      { chiave: 'H', etichetta: 'lato verticale', simbolo: 'H', predefinito: 0.10 },
      { chiave: 'B', etichetta: 'lato orizzontale', simbolo: 'B', predefinito: 0.10 },
      { chiave: 's', etichetta: 'spessore', simbolo: 's', predefinito: 0.010 },
    ],
    note: 'Baricentro fuori asse in entrambe le direzioni.',
    asimmetrica: true,
  },
];

// ══════════════════════ PRESET DEI PROFILI COMMERCIALI ══════════════════════

export interface Preset {
  nome: string;
  serie: string;
  parametri: ParametriSezione;
  /** area tabellata [cm²], per il confronto con quella calcolata */
  Atabellata?: number;
  /** inerzia tabellata [cm⁴] */
  Itabellata?: number;
}

/** H, B, s1, s2, r in mm; A in cm²; I in cm⁴ */
const IPE: [string, number, number, number, number, number, number, number][] = [
  ['IPE 80', 80, 46, 3.8, 5.2, 5, 7.64, 80.1],
  ['IPE 100', 100, 55, 4.1, 5.7, 7, 10.3, 171],
  ['IPE 120', 120, 64, 4.4, 6.3, 7, 13.2, 318],
  ['IPE 140', 140, 73, 4.7, 6.9, 7, 16.4, 541],
  ['IPE 160', 160, 82, 5.0, 7.4, 9, 20.1, 869],
  ['IPE 180', 180, 91, 5.3, 8.0, 9, 23.9, 1317],
  ['IPE 200', 200, 100, 5.6, 8.5, 12, 28.5, 1943],
  ['IPE 220', 220, 110, 5.9, 9.2, 12, 33.4, 2772],
  ['IPE 240', 240, 120, 6.2, 9.8, 15, 39.1, 3892],
  ['IPE 270', 270, 135, 6.6, 10.2, 15, 45.9, 5790],
  ['IPE 300', 300, 150, 7.1, 10.7, 15, 53.8, 8356],
  ['IPE 330', 330, 160, 7.5, 11.5, 18, 62.6, 11770],
  ['IPE 360', 360, 170, 8.0, 12.7, 18, 72.7, 16270],
  ['IPE 400', 400, 180, 8.6, 13.5, 21, 84.5, 23130],
  ['IPE 450', 450, 190, 9.4, 14.6, 21, 98.8, 33740],
  ['IPE 500', 500, 200, 10.2, 16.0, 21, 116, 48200],
  ['IPE 550', 550, 210, 11.1, 17.2, 24, 134, 67120],
  ['IPE 600', 600, 220, 12.0, 19.0, 24, 156, 92080],
];

const HEA: [string, number, number, number, number, number, number, number][] = [
  ['HEA 100', 96, 100, 5.0, 8.0, 12, 21.2, 349],
  ['HEA 120', 114, 120, 5.0, 8.0, 12, 25.3, 606],
  ['HEA 140', 133, 140, 5.5, 8.5, 12, 31.4, 1033],
  ['HEA 160', 152, 160, 6.0, 9.0, 15, 38.8, 1673],
  ['HEA 180', 171, 180, 6.0, 9.5, 15, 45.3, 2510],
  ['HEA 200', 190, 200, 6.5, 10.0, 18, 53.8, 3692],
  ['HEA 220', 210, 220, 7.0, 11.0, 18, 64.3, 5410],
  ['HEA 240', 230, 240, 7.5, 12.0, 21, 76.8, 7763],
  ['HEA 260', 250, 260, 7.5, 12.5, 24, 86.8, 10450],
  ['HEA 300', 290, 300, 8.5, 14.0, 27, 112, 18260],
  ['HEA 340', 330, 300, 9.5, 16.5, 27, 133, 27690],
  ['HEA 400', 390, 300, 11.0, 19.0, 27, 159, 45070],
];

const HEB: [string, number, number, number, number, number, number, number][] = [
  ['HEB 100', 100, 100, 6.0, 10.0, 12, 26.0, 450],
  ['HEB 120', 120, 120, 6.5, 11.0, 12, 34.0, 864],
  ['HEB 140', 140, 140, 7.0, 12.0, 12, 43.0, 1509],
  ['HEB 160', 160, 160, 8.0, 13.0, 15, 54.3, 2492],
  ['HEB 180', 180, 180, 8.5, 14.0, 15, 65.3, 3831],
  ['HEB 200', 200, 200, 9.0, 15.0, 18, 78.1, 5696],
  ['HEB 220', 220, 220, 9.5, 16.0, 18, 91.0, 8091],
  ['HEB 240', 240, 240, 10.0, 17.0, 21, 106, 11260],
  ['HEB 260', 260, 260, 10.0, 17.5, 24, 118, 14920],
  ['HEB 300', 300, 300, 11.0, 19.0, 27, 149, 25170],
  ['HEB 400', 400, 300, 13.5, 24.0, 27, 198, 57680],
];

function presetDoppioT(
  righe: typeof IPE, serie: string,
): Preset[] {
  return righe.map(([nome, H, B, s1, s2, r, A, I]) => ({
    nome, serie,
    parametri: {
      famiglia: 'doppioT' as const,
      H: H * 1e-3, B: B * 1e-3, s1: s1 * 1e-3, s2: s2 * 1e-3, r: r * 1e-3,
    },
    Atabellata: A, Itabellata: I,
  }));
}

export const PRESET: Preset[] = [
  ...presetDoppioT(IPE, 'IPE'),
  ...presetDoppioT(HEA, 'HEA'),
  ...presetDoppioT(HEB, 'HEB'),
];

export function preset(nome: string): ParametriSezione {
  const p = PRESET.find((x) => x.nome === nome);
  if (!p) throw new Error(`Preset sconosciuto: ${nome}`);
  return { ...p.parametri };
}

// ══════════════════════════ PROPRIETÀ DERIVATE ══════════════════════════

export interface ProprietaSezione {
  A: number;
  /** inerzia attorno all'asse forte, quello di flessione nel piano [m⁴] */
  I: number;
  /** inerzia attorno all'asse debole [m⁴] */
  Iz: number;
  /** modulo di resistenza minimo [m³] */
  W: number;
  /** moduli riferiti alla fibra superiore e inferiore [m³] */
  Wsup: number;
  Winf: number;
  /** momento statico massimo, al baricentro [m³] */
  Smax: number;
  /** area resistente a taglio [m²] */
  Av: number;
  /** raggio d'inerzia attorno all'asse forte [m] */
  i: number;
  /** altezza totale [m] */
  H: number;
  /** larghezza massima [m] */
  B: number;
  /** distanze del baricentro dalle fibre estreme [m], entrambe positive */
  ySup: number;
  yInf: number;
}

/** Contributo del raccordo: area e posizione del baricentro del quarto. */
const AREA_RACCORDO = 1 - Math.PI / 4;              // ≈ 0.2146 r²
const OFFSET_RACCORDO = (10 - 3 * Math.PI) / (12 - 3 * Math.PI);   // ≈ 0.2234 r

function geometriaDoppioT(H: number, B: number, s1: number, s2: number, r = 0) {
  const hw = H - 2 * s2;
  if (hw <= 0) throw new Error('Le ali sono più spesse di metà altezza.');
  if (s1 >= B) throw new Error('L\'anima è più larga delle ali.');

  // formule esatte del profilo senza raccordi
  let A = 2 * B * s2 + hw * s1;
  let I = (B * H ** 3 - (B - s1) * hw ** 3) / 12;
  const Iz = (2 * s2 * B ** 3 + hw * s1 ** 3) / 12;
  let Smax = B * s2 * ((H - s2) / 2) + (s1 * (H / 2 - s2) ** 2) / 2;

  if (r > 0) {
    // quattro raccordi fra anima e ali: area piccola ma braccio grande, quindi
    // il contributo a I è dell'ordine del 4 % e non si può trascurare
    const Ar = AREA_RACCORDO * r * r;
    const d = OFFSET_RACCORDO * r;
    const yc = H / 2 - s2 - d;
    A += 4 * Ar;
    // si trascura l'inerzia propria del raccordo: è ~10⁻⁴ del termine di trasporto
    I += 4 * Ar * yc * yc;
    // i due raccordi superiori entrano nel momento statico di mezza sezione
    Smax += 2 * Ar * yc;
  }

  return { hw, A, I, Iz, Smax };
}

export function proprietaDa(p: ParametriSezione): ProprietaSezione {
  switch (p.famiglia) {
    case 'rettangolarePiena': {
      if (p.B <= 0 || p.H <= 0) throw new Error('Le dimensioni devono essere positive.');
      const A = p.B * p.H;
      const I = (p.B * p.H ** 3) / 12;
      const W = (p.B * p.H ** 2) / 6;
      return {
        A, I, Iz: (p.H * p.B ** 3) / 12, W, Wsup: W, Winf: W,
        Smax: (p.B * p.H ** 2) / 8, Av: (5 / 6) * A, i: Math.sqrt(I / A),
        H: p.H, B: p.B, ySup: p.H / 2, yInf: p.H / 2,
      };
    }

    case 'rettangolareCava': {
      const Bi = p.B - 2 * p.s;
      const Hi = p.H - 2 * p.s;
      if (Bi <= 0 || Hi <= 0) throw new Error('Spessore troppo grande per le dimensioni.');
      const A = p.B * p.H - Bi * Hi;
      const I = (p.B * p.H ** 3 - Bi * Hi ** 3) / 12;
      const W = I / (p.H / 2);
      return {
        A, I, Iz: (p.H * p.B ** 3 - Hi * Bi ** 3) / 12, W, Wsup: W, Winf: W,
        Smax: (p.B * p.H ** 2 - Bi * Hi ** 2) / 8,
        // resistono a taglio le due pareti verticali
        Av: 2 * p.H * p.s, i: Math.sqrt(I / A),
        H: p.H, B: p.B, ySup: p.H / 2, yInf: p.H / 2,
      };
    }

    case 'circolarePiena': {
      if (p.D <= 0) throw new Error('Il diametro deve essere positivo.');
      const A = (Math.PI * p.D ** 2) / 4;
      const I = (Math.PI * p.D ** 4) / 64;
      const W = (Math.PI * p.D ** 3) / 32;
      return {
        A, I, Iz: I, W, Wsup: W, Winf: W,
        Smax: p.D ** 3 / 12, Av: 0.9 * A, i: Math.sqrt(I / A),
        H: p.D, B: p.D, ySup: p.D / 2, yInf: p.D / 2,
      };
    }

    case 'circolareCava': {
      const Di = p.D - 2 * p.s;
      if (Di <= 0) throw new Error('Spessore troppo grande per il diametro.');
      const A = (Math.PI * (p.D ** 2 - Di ** 2)) / 4;
      const I = (Math.PI * (p.D ** 4 - Di ** 4)) / 64;
      const W = I / (p.D / 2);
      return {
        A, I, Iz: I, W, Wsup: W, Winf: W,
        Smax: (p.D ** 3 - Di ** 3) / 12,
        Av: (2 * A) / Math.PI, i: Math.sqrt(I / A),
        H: p.D, B: p.D, ySup: p.D / 2, yInf: p.D / 2,
      };
    }

    case 'doppioT': {
      const g = geometriaDoppioT(p.H, p.B, p.s1, p.s2, p.r ?? 0);
      const W = g.I / (p.H / 2);
      return {
        A: g.A, I: g.I, Iz: g.Iz, W, Wsup: W, Winf: W,
        Smax: g.Smax, Av: p.H * p.s1, i: Math.sqrt(g.I / g.A),
        H: p.H, B: p.B, ySup: p.H / 2, yInf: p.H / 2,
      };
    }

    case 'aC': {
      // per la flessione nel piano il C ha lo stesso I del doppio T
      const g = geometriaDoppioT(p.H, p.B, p.s1, p.s2, 0);
      const W = g.I / (p.H / 2);
      const hw = p.H - 2 * p.s2;
      // Iz rispetto all'asse verticale baricentrico: la sezione è asimmetrica
      // in orizzontale, ma per il calcolo piano serve solo come informazione
      const Az = 2 * p.B * p.s2 + hw * p.s1;
      const zc = (2 * p.B * p.s2 * (p.B / 2) + hw * p.s1 * (p.s1 / 2)) / Az;
      const Iz = 2 * ((p.s2 * p.B ** 3) / 12 + p.B * p.s2 * (p.B / 2 - zc) ** 2)
        + ((hw * p.s1 ** 3) / 12 + hw * p.s1 * (p.s1 / 2 - zc) ** 2);
      return {
        A: g.A, I: g.I, Iz, W, Wsup: W, Winf: W,
        Smax: g.Smax, Av: p.H * p.s1, i: Math.sqrt(g.I / g.A),
        H: p.H, B: p.B, ySup: p.H / 2, yInf: p.H / 2,
      };
    }

    case 'aT': {
      const hw = p.H - p.s2;
      if (hw <= 0) throw new Error('L\'ala è più spessa dell\'altezza totale.');
      const Aala = p.B * p.s2;
      const Aanima = hw * p.s1;
      const A = Aala + Aanima;
      // baricentro misurato dal BORDO INFERIORE
      const yBar = (Aala * (p.H - p.s2 / 2) + Aanima * (hw / 2)) / A;
      const I =
        (p.B * p.s2 ** 3) / 12 + Aala * (p.H - p.s2 / 2 - yBar) ** 2
        + (p.s1 * hw ** 3) / 12 + Aanima * (hw / 2 - yBar) ** 2;
      const Iz = (p.s2 * p.B ** 3) / 12 + (hw * p.s1 ** 3) / 12;
      const ySup = p.H - yBar;
      const yInf = yBar;
      const Wsup = I / ySup;
      const Winf = I / yInf;
      // momento statico al baricentro: porzione al di sopra di esso
      const Smax = momentoStaticoT(p, yBar, 0);
      return {
        A, I, Iz, W: Math.min(Wsup, Winf), Wsup, Winf,
        Smax, Av: p.H * p.s1, i: Math.sqrt(I / A),
        H: p.H, B: p.B, ySup, yInf,
      };
    }

    case 'aL': {
      if (p.s >= p.H || p.s >= p.B) throw new Error('Spessore troppo grande per i lati.');
      const Aver = p.H * p.s;
      const Aoriz = (p.B - p.s) * p.s;
      const A = Aver + Aoriz;
      const yBar = (Aver * (p.H / 2) + Aoriz * (p.s / 2)) / A;
      const zBar = (Aver * (p.s / 2) + Aoriz * (p.s + (p.B - p.s) / 2)) / A;
      const I =
        (p.s * p.H ** 3) / 12 + Aver * (p.H / 2 - yBar) ** 2
        + ((p.B - p.s) * p.s ** 3) / 12 + Aoriz * (p.s / 2 - yBar) ** 2;
      const Iz =
        (p.H * p.s ** 3) / 12 + Aver * (p.s / 2 - zBar) ** 2
        + (p.s * (p.B - p.s) ** 3) / 12 + Aoriz * (p.s + (p.B - p.s) / 2 - zBar) ** 2;
      const ySup = p.H - yBar;
      const yInf = yBar;
      const Wsup = I / ySup;
      const Winf = I / yInf;
      return {
        A, I, Iz, W: Math.min(Wsup, Winf), Wsup, Winf,
        Smax: momentoStaticoL(p, yBar, 0),
        Av: p.H * p.s, i: Math.sqrt(I / A),
        H: p.H, B: p.B, ySup, yInf,
      };
    }
  }
}

/** Estremi della coordinata y, misurata dal baricentro. */
export function estremiY(p: ParametriSezione): { yInf: number; ySup: number } {
  const q = proprietaDa(p);
  return { yInf: q.yInf, ySup: q.ySup };
}

// ══════════════ DISTRIBUZIONE SULLA SEZIONE (per τ) ══════════════

/**
 * Momento statico (rispetto al baricentro) della parte dei due raccordi che sta
 * al di sopra della quota `t`, misurata dal fondo della fascia dei raccordi
 * (0 ≤ t ≤ r); `c` è la quota della faccia interna dell'ala.
 *
 * Un raccordo largo `r − √(r²−t²)` per lato: `G` e `Ht` sono le primitive di
 * quella larghezza e del suo momento primo. Per t = 0 il risultato coincide con
 * la forma chiusa 2·Ar·(c − OFFSET·r) usata sotto la fascia: le due espressioni
 * si raccordano con continuità, come deve essere perché S(y) è un integrale.
 */
function momentoRaccordi(r: number, c: number, t: number): number {
  const G = (u: number) =>
    r * u
    - (u / 2) * Math.sqrt(Math.max(0, r * r - u * u))
    - ((r * r) / 2) * Math.asin(Math.min(1, u / r));
  const Ht = (u: number) =>
    (r * u * u) / 2 + Math.pow(Math.max(0, r * r - u * u), 1.5) / 3;
  return 2 * ((c - r) * (G(r) - G(t)) + (Ht(r) - Ht(t)));
}

export function larghezzaA(p: ParametriSezione, y: number): number {
  switch (p.famiglia) {
    case 'rettangolarePiena':
      return Math.abs(y) <= p.H / 2 ? p.B : 0;

    case 'rettangolareCava': {
      const Hi = p.H - 2 * p.s;
      if (Math.abs(y) > p.H / 2) return 0;
      return Math.abs(y) >= Hi / 2 ? p.B : 2 * p.s;
    }

    case 'circolarePiena': {
      const R = p.D / 2;
      return Math.abs(y) >= R ? 0 : 2 * Math.sqrt(R * R - y * y);
    }

    case 'circolareCava': {
      const R = p.D / 2;
      const Ri = R - p.s;
      if (Math.abs(y) >= R) return 0;
      const esterna = 2 * Math.sqrt(R * R - y * y);
      if (Math.abs(y) >= Ri) return esterna;
      return esterna - 2 * Math.sqrt(Ri * Ri - y * y);
    }

    case 'doppioT':
    case 'aC': {
      const a = Math.abs(y);
      if (a > p.H / 2) return 0;
      const c = p.H / 2 - p.s2;                 // faccia interna dell'ala
      if (a >= c) return p.B;
      const r = p.famiglia === 'doppioT' ? (p.r ?? 0) : 0;
      if (r > 0 && a > c - r) {
        // I due raccordi allargano l'anima: a contatto con l'ala la larghezza
        // vale s1 + 2r e si richiude sul quarto di cerchio scendendo di r.
        // Senza questo termine b(y) avrebbe un salto dove τ è massima e la
        // tensione al raccordo risulterebbe sovrastimata di alcuni punti %.
        const t = a - (c - r);
        return p.s1 + 2 * (r - Math.sqrt(Math.max(0, r * r - t * t)));
      }
      return p.s1;
    }

    case 'aT': {
      const q = proprietaDa(p);
      if (y > q.ySup || y < -q.yInf) return 0;
      // dal bordo superiore verso il basso, l'ala è spessa s2
      const daSopra = q.ySup - y;
      return daSopra <= p.s2 ? p.B : p.s1;
    }

    case 'aL': {
      const q = proprietaDa(p);
      if (y > q.ySup || y < -q.yInf) return 0;
      const daSotto = y + q.yInf;
      // il lato orizzontale occupa la fascia inferiore di spessore s
      return daSotto <= p.s ? p.B : p.s;
    }
  }
}

export function momentoStaticoA(p: ParametriSezione, y: number): number {
  switch (p.famiglia) {
    case 'rettangolarePiena': {
      const R = p.H / 2;
      const a = Math.abs(y);
      return a >= R ? 0 : (p.B / 2) * (R * R - a * a);
    }

    case 'rettangolareCava': {
      const R = p.H / 2;
      const Ri = (p.H - 2 * p.s) / 2;
      const a = Math.abs(y);
      if (a >= R) return 0;
      if (a >= Ri) return (p.B / 2) * (R * R - a * a);
      return (p.B / 2) * (R * R - Ri * Ri) + p.s * (Ri * Ri - a * a);
    }

    case 'circolarePiena': {
      const R = p.D / 2;
      const a = Math.abs(y);
      return a >= R ? 0 : (2 / 3) * Math.pow(R * R - a * a, 1.5);
    }

    case 'circolareCava': {
      const R = p.D / 2;
      const Ri = R - p.s;
      const a = Math.abs(y);
      if (a >= R) return 0;
      const esterno = (2 / 3) * Math.pow(R * R - a * a, 1.5);
      if (a >= Ri) return esterno;
      return esterno - (2 / 3) * Math.pow(Ri * Ri - a * a, 1.5);
    }

    case 'doppioT':
    case 'aC': {
      const R = p.H / 2;
      const a = Math.abs(y);
      if (a >= R) return 0;
      const c = R - p.s2;
      if (a >= c) return (p.B / 2) * (R * R - a * a);
      const ala = p.B * p.s2 * ((p.H - p.s2) / 2);
      const anima = (p.s1 / 2) * (c * c - a * a);
      const r = p.famiglia === 'doppioT' ? (p.r ?? 0) : 0;
      if (r <= 0) return ala + anima;
      // sotto la fascia dei raccordi entra tutta la loro area, dentro la fascia
      // solo la parte che sta sopra la quota richiesta (vedi momentoRaccordi)
      if (a <= c - r) {
        return ala + anima + 2 * AREA_RACCORDO * r * r * (c - OFFSET_RACCORDO * r);
      }
      return ala + anima + momentoRaccordi(r, c, a - (c - r));
    }

    case 'aT': {
      const q = proprietaDa(p);
      return momentoStaticoT(p, q.yInf, y);
    }

    case 'aL': {
      const q = proprietaDa(p);
      return momentoStaticoL(p, q.yInf, y);
    }
  }
}

/**
 * Momento statico della porzione di T al di sopra della quota y (dal
 * baricentro), con `yBar` distanza del baricentro dal bordo inferiore.
 */
function momentoStaticoT(
  p: Extract<ParametriSezione, { famiglia: 'aT' }>, yBar: number, y: number,
): number {
  const ySup = p.H - yBar;
  if (y >= ySup) return 0;
  if (y <= -yBar) return 0;
  const limiteAla = ySup - p.s2;   // quota inferiore dell'ala

  if (y >= limiteAla) {
    // taglio dentro l'ala
    const altezza = ySup - y;
    return p.B * altezza * (y + altezza / 2);
  }
  // ala intera + porzione di anima sopra y
  const ala = p.B * p.s2 * (limiteAla + p.s2 / 2);
  const hAnima = limiteAla - y;
  const anima = p.s1 * hAnima * (y + hAnima / 2);
  return ala + anima;
}

/** Momento statico della porzione di L al di sopra della quota y. */
function momentoStaticoL(
  p: Extract<ParametriSezione, { famiglia: 'aL' }>, yBar: number, y: number,
): number {
  const ySup = p.H - yBar;
  if (y >= ySup) return 0;
  const yInf = -yBar;
  if (y <= yInf) return 0;
  const limiteBase = yInf + p.s;   // quota superiore del lato orizzontale

  if (y >= limiteBase) {
    // sopra la base c'è solo il lato verticale, di spessore s
    const altezza = ySup - y;
    return p.s * altezza * (y + altezza / 2);
  }
  const verticale = p.s * (ySup - limiteBase) * ((ySup + limiteBase) / 2);
  const hBase = limiteBase - y;
  const base = p.B * hBase * (y + hBase / 2);
  return verticale + base;
}

/**
 * Quote in cui la larghezza salta: sono le discontinuità di τ, e cadono spesso
 * dove la tensione ideale è massima. Un campionamento a passo costante le
 * mancherebbe.
 */
export function quoteNotevoli(p: ParametriSezione): number[] {
  const eps = 1e-9;
  const q = proprietaDa(p);
  const quote = new Set<number>([0, q.ySup, -q.yInf]);
  const aggiungiSalto = (y: number) => {
    quote.add(y - eps);
    quote.add(y + eps);
  };

  switch (p.famiglia) {
    case 'rettangolareCava':
      aggiungiSalto((p.H - 2 * p.s) / 2);
      aggiungiSalto(-(p.H - 2 * p.s) / 2);
      break;
    case 'circolareCava':
      aggiungiSalto(p.D / 2 - p.s);
      aggiungiSalto(-(p.D / 2 - p.s));
      break;
    case 'doppioT':
    case 'aC':
      aggiungiSalto((p.H - 2 * p.s2) / 2);
      aggiungiSalto(-(p.H - 2 * p.s2) / 2);
      break;
    case 'aT':
      aggiungiSalto(q.ySup - p.s2);
      break;
    case 'aL':
      aggiungiSalto(-q.yInf + p.s);
      break;
    default:
      break;
  }
  return [...quote].filter((y) => y >= -q.yInf - eps && y <= q.ySup + eps)
    .sort((a, b) => a - b);
}

// ══════════════════════ CONTORNO PER IL DISEGNO ══════════════════════

/** Contorno esterno in coordinate (z orizzontale, y verticale) dal baricentro. */
export function contornoSezione(p: ParametriSezione): { y: number; z: number }[] {
  const q = proprietaDa(p);
  switch (p.famiglia) {
    case 'rettangolarePiena':
    case 'rettangolareCava':
      return rettangolo(p.B, p.H);
    case 'circolarePiena':
    case 'circolareCava':
      return cerchio(p.D / 2, 48);
    case 'doppioT': {
      const Hm = p.H / 2, Bm = p.B / 2, w = p.s1 / 2, f = p.s2;
      return [
        { z: -Bm, y: Hm }, { z: Bm, y: Hm }, { z: Bm, y: Hm - f },
        { z: w, y: Hm - f }, { z: w, y: -Hm + f }, { z: Bm, y: -Hm + f },
        { z: Bm, y: -Hm }, { z: -Bm, y: -Hm }, { z: -Bm, y: -Hm + f },
        { z: -w, y: -Hm + f }, { z: -w, y: Hm - f }, { z: -Bm, y: Hm - f },
      ];
    }
    case 'aC': {
      const Hm = p.H / 2, f = p.s2, w = p.s1;
      // anima a sinistra, ali verso destra
      return [
        { z: 0, y: Hm }, { z: p.B, y: Hm }, { z: p.B, y: Hm - f },
        { z: w, y: Hm - f }, { z: w, y: -Hm + f }, { z: p.B, y: -Hm + f },
        { z: p.B, y: -Hm }, { z: 0, y: -Hm },
      ].map((punto) => ({ ...punto, z: punto.z - p.B / 2 }));
    }
    case 'aT': {
      const w = p.s1 / 2, Bm = p.B / 2;
      const ySup = q.ySup, yInf = -q.yInf;
      return [
        { z: -Bm, y: ySup }, { z: Bm, y: ySup }, { z: Bm, y: ySup - p.s2 },
        { z: w, y: ySup - p.s2 }, { z: w, y: yInf }, { z: -w, y: yInf },
        { z: -w, y: ySup - p.s2 }, { z: -Bm, y: ySup - p.s2 },
      ];
    }
    case 'aL': {
      const ySup = q.ySup, yInf = -q.yInf;
      // il baricentro orizzontale non è centrato: si trasla per il disegno
      const zBar = zBaricentroL(p);
      return [
        { z: 0 - zBar, y: yInf }, { z: p.B - zBar, y: yInf },
        { z: p.B - zBar, y: yInf + p.s }, { z: p.s - zBar, y: yInf + p.s },
        { z: p.s - zBar, y: ySup }, { z: 0 - zBar, y: ySup },
      ];
    }
  }
}

function zBaricentroL(p: Extract<ParametriSezione, { famiglia: 'aL' }>): number {
  const Aver = p.H * p.s;
  const Aoriz = (p.B - p.s) * p.s;
  return (Aver * (p.s / 2) + Aoriz * (p.s + (p.B - p.s) / 2)) / (Aver + Aoriz);
}

/** Contorno interno delle sezioni cave; vuoto per le altre. */
export function contornoInterno(p: ParametriSezione): { y: number; z: number }[] {
  if (p.famiglia === 'rettangolareCava') {
    return rettangolo(p.B - 2 * p.s, p.H - 2 * p.s);
  }
  if (p.famiglia === 'circolareCava') {
    return cerchio(p.D / 2 - p.s, 48);
  }
  return [];
}

const rettangolo = (B: number, H: number) => [
  { z: -B / 2, y: -H / 2 }, { z: B / 2, y: -H / 2 },
  { z: B / 2, y: H / 2 }, { z: -B / 2, y: H / 2 },
];

const cerchio = (r: number, n: number) =>
  Array.from({ length: n }, (_, i) => {
    const a = (2 * Math.PI * i) / n;
    return { z: r * Math.cos(a), y: r * Math.sin(a) };
  });

// ══════════════════════ COSTRUZIONE DELLA SEZIONE ══════════════════════

export function nomePredefinito(p: ParametriSezione): string {
  // se le misure coincidono con quelle di un profilo di catalogo, il nome
  // commerciale è più informativo di quello geometrico
  if (p.famiglia === 'doppioT') {
    const uguale = PRESET.find((x) => {
      const q = x.parametri;
      if (q.famiglia !== 'doppioT') return false;
      return Math.abs(q.H - p.H) < 1e-9 && Math.abs(q.B - p.B) < 1e-9
        && Math.abs(q.s1 - p.s1) < 1e-9 && Math.abs(q.s2 - p.s2) < 1e-9
        && Math.abs((q.r ?? 0) - (p.r ?? 0)) < 1e-9;
    });
    if (uguale) return uguale.nome;
  }
  const mm = (v: number) => Math.round(v * 1000);
  const mm1 = (v: number) => (v * 1000).toFixed(1);
  switch (p.famiglia) {
    case 'rettangolarePiena': return `Rett ${mm(p.B)}×${mm(p.H)}`;
    case 'rettangolareCava': return `Rett cava ${mm(p.B)}×${mm(p.H)}×${mm1(p.s)}`;
    case 'circolarePiena': return `Ø ${mm(p.D)}`;
    case 'circolareCava': return `Ø ${mm(p.D)}×${mm1(p.s)}`;
    case 'doppioT': return `Doppio T ${mm(p.H)}×${mm(p.B)}`;
    case 'aT': return `T ${mm(p.H)}×${mm(p.B)}`;
    case 'aC': return `C ${mm(p.H)}×${mm(p.B)}`;
    case 'aL': return `L ${mm(p.H)}×${mm(p.B)}×${mm1(p.s)}`;
  }
}

export function sezioneDaParametri(
  parametri: ParametriSezione, id: string, nome?: string,
): Sezione {
  const q = proprietaDa(parametri);
  return {
    id: id as SectionId,
    nome: nome ?? nomePredefinito(parametri),
    famiglia: famigliaLegacy(parametri.famiglia),
    A: q.A, I: q.I, W: q.W, h: q.H, b: q.B,
    Av: q.Av, Smax: q.Smax, i: q.i,
    parametri,
    contorno: contornoSezione(parametri),
  };
}

function famigliaLegacy(f: FamigliaParametrica): Sezione['famiglia'] {
  switch (f) {
    case 'rettangolarePiena': return 'rettangolare';
    case 'rettangolareCava': return 'tuboRettangolare';
    case 'circolarePiena': return 'circolare';
    case 'circolareCava': return 'tuboCircolare';
    default: return 'generica';
  }
}

/** Peso al metro [kg/m] della sezione, data la densità del materiale. */
export const pesoAlMetro = (q: ProprietaSezione, rho: number): number => q.A * rho;

export function parametriPredefiniti(f: FamigliaParametrica): ParametriSezione {
  const d = FAMIGLIE.find((x) => x.famiglia === f)!;
  const valori: Record<string, number> = {};
  for (const m of d.misure) valori[m.chiave] = m.predefinito;
  return { famiglia: f, ...valori } as ParametriSezione;
}

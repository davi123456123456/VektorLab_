/**
 * Libreria delle sezioni. Unità SI (m, m², m⁴).
 *
 * Le proprietà dei profili europei sono quelle tabellate (non ricalcolate dal
 * disegno): i raggi di raccordo fra ala e anima incidono su A e I in modo non
 * trascurabile, e usare valori "geometrici semplificati" darebbe risultati
 * diversi da qualunque manuale.
 */

import type { Sezione, SectionId } from '../model/types.js';

const id = (s: string): SectionId => s as SectionId;

// ── costruttori parametrici ────────────────────────────────────────────

export function rettangolare(b: number, h: number, nome?: string): Sezione {
  const A = b * h;
  const I = (b * h ** 3) / 12;
  return {
    id: id(nome ?? `RET${b * 1000}x${h * 1000}`),
    nome: nome ?? `Rettangolare ${(b * 1000).toFixed(0)}×${(h * 1000).toFixed(0)}`,
    famiglia: 'rettangolare',
    A, I, W: (b * h ** 2) / 6, h, b,
    Av: (5 / 6) * A,
    Smax: (b * h ** 2) / 8,
    i: Math.sqrt(I / A),
  };
}

export function circolare(d: number, nome?: string): Sezione {
  const A = (Math.PI * d ** 2) / 4;
  const I = (Math.PI * d ** 4) / 64;
  return {
    id: id(nome ?? `TON${d * 1000}`),
    nome: nome ?? `Tondo Ø${(d * 1000).toFixed(0)}`,
    famiglia: 'circolare',
    A, I, W: (Math.PI * d ** 3) / 32, h: d, b: d,
    Av: 0.9 * A,
    Smax: d ** 3 / 12,
    i: Math.sqrt(I / A),
  };
}

export function tuboCircolare(de: number, t: number, nome?: string): Sezione {
  const di = de - 2 * t;
  if (di <= 0) throw new Error('Spessore troppo grande per il diametro esterno.');
  const A = (Math.PI * (de ** 2 - di ** 2)) / 4;
  const I = (Math.PI * (de ** 4 - di ** 4)) / 64;
  return {
    id: id(nome ?? `TUB${de * 1000}x${t * 1000}`),
    nome: nome ?? `Tubo Ø${(de * 1000).toFixed(0)}×${(t * 1000).toFixed(1)}`,
    famiglia: 'tuboCircolare',
    A, I, W: I / (de / 2), h: de, b: de,
    Av: 2 * A / Math.PI,
    Smax: (de ** 3 - di ** 3) / 12,
    i: Math.sqrt(I / A),
  };
}

export function tuboRettangolare(b: number, h: number, t: number, nome?: string): Sezione {
  const bi = b - 2 * t;
  const hi = h - 2 * t;
  if (bi <= 0 || hi <= 0) throw new Error('Spessore troppo grande per le dimensioni.');
  const A = b * h - bi * hi;
  const I = (b * h ** 3 - bi * hi ** 3) / 12;
  return {
    id: id(nome ?? `RHS${b * 1000}x${h * 1000}x${t * 1000}`),
    nome: nome ?? `RHS ${(b * 1000).toFixed(0)}×${(h * 1000).toFixed(0)}×${(t * 1000).toFixed(1)}`,
    famiglia: 'tuboRettangolare',
    A, I, W: I / (h / 2), h, b,
    Av: 2 * h * t,
    Smax: (b * h ** 2 - bi * hi ** 2) / 8,
    i: Math.sqrt(I / A),
  };
}

/** Doppio T simmetrico generico (per sezioni non tabellate). */
export function doppioT(h: number, b: number, tw: number, tf: number, nome?: string): Sezione {
  const hw = h - 2 * tf;
  const A = 2 * b * tf + hw * tw;
  const I = (b * h ** 3) / 12 - ((b - tw) * hw ** 3) / 12;
  return {
    id: id(nome ?? `IT${h * 1000}`),
    nome: nome ?? `Doppio T ${(h * 1000).toFixed(0)}`,
    famiglia: 'generica',
    A, I, W: I / (h / 2), h, b,
    Av: h * tw,
    Smax: (b * tf * (h - tf)) / 2 + (tw * hw ** 2) / 8,
    i: Math.sqrt(I / A),
  };
}

// ── profili europei tabellati ──────────────────────────────────────────
// h[mm], b[mm], A[cm²], Iy[cm⁴], Wy[cm³], Av[cm²]
type Riga = [string, number, number, number, number, number, number];

function daTabella(fam: Sezione['famiglia'], righe: Riga[]): Sezione[] {
  return righe.map(([nome, h, b, Acm2, Icm4, Wcm3, Avcm2]) => {
    const A = Acm2 * 1e-4;
    const I = Icm4 * 1e-8;
    return {
      id: id(nome), nome, famiglia: fam,
      A, I, W: Wcm3 * 1e-6, h: h * 1e-3, b: b * 1e-3,
      Av: Avcm2 * 1e-4,
      i: Math.sqrt(I / A),
    };
  });
}

export const IPE = daTabella('IPE', [
  ['IPE 100', 100, 55, 10.3, 171, 34.2, 5.08],
  ['IPE 120', 120, 64, 13.2, 318, 53.0, 6.31],
  ['IPE 140', 140, 73, 16.4, 541, 77.3, 7.64],
  ['IPE 160', 160, 82, 20.1, 869, 109, 9.66],
  ['IPE 180', 180, 91, 23.9, 1317, 146, 11.3],
  ['IPE 200', 200, 100, 28.5, 1943, 194, 14.0],
  ['IPE 220', 220, 110, 33.4, 2772, 252, 15.9],
  ['IPE 240', 240, 120, 39.1, 3892, 324, 19.1],
  ['IPE 270', 270, 135, 45.9, 5790, 429, 22.1],
  ['IPE 300', 300, 150, 53.8, 8356, 557, 25.7],
  ['IPE 330', 330, 160, 62.6, 11770, 713, 30.8],
  ['IPE 360', 360, 170, 72.7, 16270, 904, 35.1],
  ['IPE 400', 400, 180, 84.5, 23130, 1156, 42.7],
  ['IPE 450', 450, 190, 98.8, 33740, 1500, 50.8],
  ['IPE 500', 500, 200, 116, 48200, 1928, 59.9],
  ['IPE 600', 600, 220, 156, 92080, 3069, 83.8],
]);

export const HEA = daTabella('HEA', [
  ['HEA 100', 96, 100, 21.2, 349, 72.8, 7.56],
  ['HEA 120', 114, 120, 25.3, 606, 106, 8.46],
  ['HEA 140', 133, 140, 31.4, 1033, 155, 10.1],
  ['HEA 160', 152, 160, 38.8, 1673, 220, 13.2],
  ['HEA 180', 171, 180, 45.3, 2510, 294, 14.5],
  ['HEA 200', 190, 200, 53.8, 3692, 389, 18.1],
  ['HEA 220', 210, 220, 64.3, 5410, 515, 20.7],
  ['HEA 240', 230, 240, 76.8, 7763, 675, 25.2],
  ['HEA 260', 250, 260, 86.8, 10450, 836, 28.8],
  ['HEA 300', 290, 300, 112, 18260, 1260, 37.3],
  ['HEA 340', 330, 300, 133, 27690, 1678, 44.9],
  ['HEA 400', 390, 300, 159, 45070, 2311, 57.3],
]);

export const HEB = daTabella('HEB', [
  ['HEB 100', 100, 100, 26.0, 450, 89.9, 9.04],
  ['HEB 120', 120, 120, 34.0, 864, 144, 11.0],
  ['HEB 140', 140, 140, 43.0, 1509, 216, 13.1],
  ['HEB 160', 160, 160, 54.3, 2492, 311, 17.6],
  ['HEB 180', 180, 180, 65.3, 3831, 426, 20.2],
  ['HEB 200', 200, 200, 78.1, 5696, 570, 24.8],
  ['HEB 220', 220, 220, 91.0, 8091, 736, 27.9],
  ['HEB 240', 240, 240, 106, 11260, 938, 33.2],
  ['HEB 260', 260, 260, 118, 14920, 1148, 37.6],
  ['HEB 300', 300, 300, 149, 25170, 1678, 47.4],
  ['HEB 400', 400, 300, 198, 57680, 2884, 70.0],
]);

export const UPN = daTabella('UPN', [
  ['UPN 80', 80, 45, 11.0, 106, 26.5, 3.4],
  ['UPN 100', 100, 50, 13.5, 206, 41.2, 4.0],
  ['UPN 120', 120, 55, 17.0, 364, 60.7, 4.6],
  ['UPN 140', 140, 60, 20.4, 605, 86.4, 5.4],
  ['UPN 160', 160, 65, 24.0, 925, 116, 6.3],
  ['UPN 180', 180, 70, 28.0, 1350, 150, 7.2],
  ['UPN 200', 200, 75, 32.2, 1910, 191, 8.1],
]);

export const SEZIONI: Sezione[] = [...IPE, ...HEA, ...HEB, ...UPN];
export const SEZIONE_PER_ID = new Map(SEZIONI.map((s) => [s.id, s]));

export function sezionePerId(k: string): Sezione {
  const s = SEZIONE_PER_ID.get(k as SectionId);
  if (!s) throw new Error(`Sezione sconosciuta: '${k}'`);
  return s;
}

/**
 * Sezione generica definita per punti (poligono chiuso, coordinate y-z locali).
 * Calcola area, baricentro e momento d'inerzia con la formula di Gauss
 * (shoelace) estesa ai momenti del secondo ordine.
 */
export function sezioneGenerica(
  punti: { y: number; z: number }[],
  nome: string,
): Sezione {
  const n = punti.length;
  if (n < 3) throw new Error('Servono almeno 3 punti.');
  let A2 = 0, cy = 0, cz = 0;
  for (let i = 0; i < n; i++) {
    const p = punti[i], q = punti[(i + 1) % n];
    const cross = p.y * q.z - q.y * p.z;
    A2 += cross;
    cy += (p.y + q.y) * cross;
    cz += (p.z + q.z) * cross;
  }
  const A = Math.abs(A2) / 2;
  if (A === 0) throw new Error('Poligono degenere: area nulla.');
  cy /= 3 * A2;
  cz /= 3 * A2;

  // momento d'inerzia rispetto all'asse baricentrico parallelo a y
  let Iz = 0;
  for (let i = 0; i < n; i++) {
    const p = punti[i], q = punti[(i + 1) % n];
    const py = p.y - cy, pz = p.z - cz;
    const qy = q.y - cy, qz = q.z - cz;
    const cross = py * qz - qy * pz;
    Iz += cross * (pz * pz + pz * qz + qz * qz);
  }
  Iz = Math.abs(Iz) / 12;

  const zMax = Math.max(...punti.map((p) => Math.abs(p.z - cz)));
  const h = Math.max(...punti.map((p) => p.z)) - Math.min(...punti.map((p) => p.z));
  const b = Math.max(...punti.map((p) => p.y)) - Math.min(...punti.map((p) => p.y));
  return {
    id: id(nome), nome, famiglia: 'generica',
    A, I: Iz, W: zMax > 0 ? Iz / zMax : 0, h, b,
    Av: (5 / 6) * A,
    i: Math.sqrt(Iz / A),
    contorno: punti,
  };
}

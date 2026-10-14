/**
 * Modelli attesi degli esercizi veri ricostruiti nei test: li usano sia la
 * lettura delle primitive (esercizi.test.ts) sia la conversione dello schema
 * del generatore (schema.test.ts).
 */

import { progetto } from '../../src/core/builder.js';
import type { Progetto } from '../../src/core/model/types.js';

const MAT = 'S275';
const SEZ = 'IPE 300';
const G = Math.PI / 180;

export function atteso19(): Progetto {
  const p = progetto('19');
  const a = p.nodo(0, 0);
  const d = p.nodo(3, 0);
  const ad = p.asta(a, d, MAT, SEZ);
  p.vincoloSuAsta(ad, 1 / 3, 'carrello');
  p.vincoloSuAsta(ad, 2 / 3, 'cerniera');
  p.vincolo(d, 'carrello');
  p.forza(a, 0, -1000);
  return p.costruisci();
}

export function atteso20(): Progetto {
  const p = progetto('20');
  const A = p.nodo(0, 0);
  const B = p.nodo(0, 1);
  const C = p.nodo(0, 2);
  const D = p.nodo(1, 2);
  const E = p.nodo(2, 2);
  const Gn = p.nodo(2, 0);
  const ab = p.asta(A, B, MAT, SEZ);
  p.asta(B, C, MAT, SEZ);
  p.asta(C, D, MAT, SEZ);
  const de = p.asta(D, E, MAT, SEZ);
  p.asta(E, Gn, MAT, SEZ);
  const bg = p.asta(B, Gn, MAT, SEZ);
  p.vincolo(A, 'cerniera');
  p.vincolo(Gn, 'carrello');
  p.sconnessioneNodale(B, 'cerniera', { astaMaster: ab, asteSvincolate: [bg] });
  p.sconnessioneNodale(D, 'cerniera');
  p.sconnessioneNodale(Gn, 'cerniera');
  p.distribuito(de, -1000);
  return p.costruisci();
}

export function atteso24(): Progetto {
  const p = progetto('24');
  const A = p.nodo(0, 0);
  const B = p.nodo(2, 0);
  const C = p.nodo(2, 1);
  const ab = p.asta(A, B, MAT, SEZ);
  p.asta(B, C, MAT, SEZ);
  p.vincolo(A, 'incastro', 270 * G);
  p.vincolo(C, 'cerniera', 180 * G);
  p.sconnessioneNodale(B, 'cerniera');
  p.momentoInCampata(ab, 0.5, -1000);
  return p.costruisci();
}

export function atteso16(): Progetto {
  const p = progetto('16');
  const a = p.nodo(0, 0);
  const b = p.nodo(4, 0);
  const t = p.asta(a, b, MAT, SEZ);
  p.vincolo(a, 'incastro', 270 * G);
  p.vincolo(b, 'incastro', 90 * G);
  for (const s of [0.25, 0.5, 0.75]) p.vincoloSuAsta(t, s, 'carrello');
  p.distribuito(t, -1000, { s1: 0.25, s2: 0.5 });
  p.distribuito(t, 1000, { s1: 0.5, s2: 0.75 });
  return p.costruisci();
}

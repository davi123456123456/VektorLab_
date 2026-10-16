/**
 * PGM (P5) → Grigio: il formato in cui `python -m rete.grigi` passa le
 * immagini agli strumenti in Node, che non sanno leggere PNG né WebP.
 */

import type { Grigio } from './ingresso.js';

export function leggiPGM(dati: Uint8Array): Grigio {
  // P5 <spazi> larghezza <spazi> altezza <spazi> 255 <un byte bianco> dati
  let k = 0;
  const campi: string[] = [];
  while (campi.length < 4) {
    let s = '';
    while (k < dati.length && ![0x0a, 0x20, 0x0d, 0x09].includes(dati[k])) s += String.fromCharCode(dati[k++]);
    k++;
    if (s) campi.push(s);
  }
  if (campi[0] !== 'P5' || campi[3] !== '255') throw new Error('PGM non supportato');
  const larghezza = Number(campi[1]), altezza = Number(campi[2]);
  return { dati: dati.subarray(k, k + larghezza * altezza), larghezza, altezza };
}

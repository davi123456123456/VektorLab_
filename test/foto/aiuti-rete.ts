/**
 * USCITE IDEALI DELLA RETE per le prove della decodifica: i bersagli che
 * Python costruisce dalle etichette (test/foto/campioni-rete, rigenerabili
 * con `python -m rete.fixture_ts`), cioè ciò che darebbe una rete perfetta.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Uscite } from '../../src/foto/rete/tensori.js';
import type { SchemaGenerato } from '../../src/foto/schema.js';
import type { Primitive } from '../../src/foto/tipi.js';

export const CARTELLA_RETE = join(dirname(fileURLToPath(import.meta.url)), 'campioni-rete');

export interface Ideale {
  uscite: Uscite;
  larghezza: number;
  altezza: number;
  primitive: Primitive;
  schema: SchemaGenerato;
  /** riquadro della figura (x0, y0, x1, y1) in px y giù */
  riquadro: [number, number, number, number];
}

export function nomiIdeali(): string[] {
  return readdirSync(CARTELLA_RETE).filter((f) => f.startsWith('ideale-')).sort()
    .map((f) => f.replace('.json', ''));
}

export function caricaIdeale(nome: string): Ideale {
  const d = JSON.parse(readFileSync(join(CARTELLA_RETE, `${nome}.json`), 'utf8'));
  const [h2, w2] = d.seg.forma as [number, number];
  const seg = new Uint8Array(h2 * w2);
  let k = 0;
  for (let n = 0; n < d.seg.rle.length; n += 2) {
    seg.fill(d.seg.rle[n], k, k + d.seg.rle[n + 1]);
    k += d.seg.rle[n + 1];
  }
  const [c, h4, w4] = d.testa.forma as [number, number, number];
  const testa = new Float32Array(c * h4 * w4);
  for (const [canale, i, j, v] of d.testa.voci as [number, number, number, number][]) {
    testa[(canale * h4 + i) * w4 + j] = v;
  }
  return {
    uscite: { seg, h2, w2, testa, h4, w4 },
    larghezza: d.larghezza, altezza: d.altezza,
    primitive: d.primitive, schema: d.schema, riquadro: d.riquadro,
  };
}

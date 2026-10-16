/**
 * DECODIFICA — dalle uscite della rete alle `Primitive` della Fase 1.
 *
 * Punti e aste si decodificano in pixel y giù (come le celle), poi si
 * ribaltano nel contratto (y su rispetto all'altezza dell'immagine vera,
 * senza il riempimento bianco fino a multipli di 32). Ciò che cade nel
 * riempimento si scarta.
 */

import type { Primitive, Punto } from '../tipi.js';
import { tracciaAste } from './aste.js';
import { decodificaPuntuali } from './puntuali.js';
import type { Uscite } from './tensori.js';

export function decodifica(u: Uscite, dim: { larghezza: number; altezza: number }): Primitive {
  const { larghezza, altezza } = dim;
  const p = decodificaPuntuali(u);
  const dentro = (q: Punto) => q.x >= 0 && q.x < larghezza && q.y >= 0 && q.y < altezza;
  const su = (q: Punto): Punto => ({ x: q.x, y: altezza - q.y });
  const nodi = p.nodi.filter(dentro);
  const aste = tracciaAste(u, nodi, p.pallini);
  return {
    larghezza, altezza,
    aste: aste.map((s) => ({ ...s, a: su(s.a), b: su(s.b) })),
    pallini: p.pallini.filter((x) => dentro(x.c)).map((x) => ({ ...x, c: su(x.c) })),
    corpi: p.corpi.filter((x) => dentro(x.attacco)).map((x) => ({ ...x, attacco: su(x.attacco) })),
    frecce: p.frecce.filter((x) => dentro(x.punta)).map((x) => ({ ...x, punta: su(x.punta) })),
    momenti: p.momenti.filter((x) => dentro(x.centro)).map((x) => ({ ...x, centro: su(x.centro) })),
    nodi: nodi.map(su),
    scritte: p.scritte.filter((x) => dentro(x.centro)).map((x) => ({
      ...x, centro: su(x.centro), ...(x.estremi ? { estremi: [su(x.estremi[0]), su(x.estremi[1])] as [Punto, Punto] } : {}),
    })),
  };
}

/**
 * LETTURA DEI PALLINI — la prima domanda davanti a uno schema.
 *
 * Il pallino da solo non dice niente: conta come la linea d'asta lo tocca.
 *
 *   · la linea ci FINISCE, puntando al centro → la linea è interrotta lì;
 *   · la linea ci PASSA accanto (o attraverso) e prosegue → l'asta è
 *     continua, e il pallino appartiene al vincolo che le sta sotto.
 *
 * Contando le une e le altre si ottiene l'esito; il corpo che sta "sotto" il
 * pallino (triangolo, rulli…) si aggancia qui e viene interpretato dopo, in
 * `grafo.ts`, insieme all'esito.
 *
 *   k = aste che finiscono, h = aste che passano
 *   k ≥ 2, h = 0  'cerniera'    la linea si divide: cerniera interna
 *   k ≥ 1, h ≥ 1  'accanto'     un'asta prosegue, le altre vi sono incernierate
 *   k = 0, h ≥ 1  'appoggiato'  asta continua, il pallino è del vincolo sotto
 *   k = 1, h = 0  'estremo'     fine di un'asta sola
 *   altrimenti    'isolato'
 */

import { distanza, proiezione } from '../geometria.js';
import type { Tolleranze } from '../parametri.js';
import type { Primitive } from '../tipi.js';

export type EsitoPallino = 'cerniera' | 'accanto' | 'appoggiato' | 'estremo' | 'isolato';

export interface EstremoRef { segmento: number; estremo: 'a' | 'b' }

export interface LetturaPallino {
  /** indice in `Primitive.pallini` */
  indice: number;
  esito: EsitoPallino;
  /** estremi d'asta che finiscono sul pallino */
  terminano: EstremoRef[];
  /** aste che proseguono, con l'ascissa del punto di contatto */
  passanti: { segmento: number; t: number }[];
  /** indice del corpo di vincolo esterno "sotto" il pallino */
  corpo: number | null;
}

const INTERNI = new Set(['doppioPendoloInterno', 'pattinoInterno']);

export function leggiPallini(p: Primitive, tol: Tolleranze): LetturaPallino[] {
  return distinti(p).map((indice) => {
    const { c, r } = p.pallini[indice];
    const terminano: EstremoRef[] = [];
    const passanti: { segmento: number; t: number }[] = [];

    p.aste.forEach((s, k) => {
      const pr = proiezione(c, s.a, s.b);
      const da = distanza(c, s.a);
      const db = distanza(c, s.b);
      // finisce: l'estremo è sul bordo E la linea punta al centro
      if (pr.distanza < 0.5 * r && Math.min(da, db) < r + tol.tau) {
        terminano.push({ segmento: k, estremo: da <= db ? 'a' : 'b' });
        return;
      }
      // passa: il corpo della linea sfiora o attraversa il pallino. Il piede
      // può cadere poco oltre un estremo: è lo spigolo appoggiato sul pallino.
      const margine = tol.tau / Math.max(distanza(s.a, s.b), 1e-9);
      if (pr.distanza <= 1.5 * r + tol.tau && pr.t > -margine && pr.t < 1 + margine) {
        passanti.push({ segmento: k, t: Math.min(1, Math.max(0, pr.t)) });
      }
    });

    return { indice, esito: esito(terminano.length, passanti.length), terminano, passanti,
             corpo: corpoSotto(p, indice, tol) };
  });
}

function esito(k: number, h: number): EsitoPallino {
  if (k >= 2 && h === 0) return 'cerniera';
  if (k >= 1 && h >= 1) return 'accanto';
  if (k === 0 && h >= 1) return 'appoggiato';
  if (k === 1 && h === 0) return 'estremo';
  return 'isolato';
}

/**
 * Pallini rilevati due volte (centri più vicini del raggio) si fondono: si
 * tiene il più confidente. Restituisce gli indici tenuti, in ordine.
 */
function distinti(p: Primitive): number[] {
  const ordine = p.pallini.map((_, i) => i)
    .sort((i, j) => p.pallini[j].confidenza - p.pallini[i].confidenza);
  const tenuti: number[] = [];
  for (const i of ordine) {
    const { c, r } = p.pallini[i];
    if (!tenuti.some((j) => distanza(p.pallini[j].c, c) < r)) tenuti.push(i);
  }
  return tenuti.sort((a, b) => a - b);
}

function corpoSotto(p: Primitive, indice: number, tol: Tolleranze): number | null {
  const { c, r } = p.pallini[indice];
  let migliore: number | null = null;
  let dMin = 2.5 * r + tol.tau;
  p.corpi.forEach((k, i) => {
    if (INTERNI.has(k.tipo)) return;
    const d = distanza(k.attacco, c);
    if (d <= dMin) { dMin = d; migliore = i; }
  });
  return migliore;
}

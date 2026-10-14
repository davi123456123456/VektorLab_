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
 *   k = aste che finiscono puntando al centro
 *   h = aste che passano e PROSEGUONO oltre il contatto
 *   e = aste che lo sfiorano col proprio estremo (uno spigolo posato sopra)
 *
 *   h ≥ 1, k ≥ 1        'accanto'     un'asta prosegue, le altre vi sono incernierate
 *   h ≥ 1, k = 0        'appoggiato'  asta continua, il pallino è del vincolo sotto
 *   h = 0, k + e = 1    'estremo'     fine di un'asta sola
 *   h = 0, k ≥ 2        'cerniera'    la linea si divide: cerniera interna
 *   h = 0, k ≤ 1, e ≥ 1 'appoggiato'  spigolo posato sul pallino: rigido o
 *                                     imperniato? È ambiguo, e `grafo.ts` lo
 *                                     segnala invece di scegliere in silenzio
 *   niente              'isolato'
 *
 * Un'asta che punta al centro ma ha fra sé e il pallino un'asta che prosegue
 * (l'asta a T che arriva sulla trave proprio sopra l'appoggio) non lo
 * raggiunge: non conta fra quelle che finiscono, e l'incrocio lo fa il grafo.
 */

import { distanza, proiezione } from '../geometria.js';
import type { Tolleranze } from '../parametri.js';
import type { Primitive, Punto } from '../tipi.js';

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
      // finisce: l'estremo è vicino al pallino E il centro gli sta più davanti
      // che di fianco. È il confronto fra le due componenti, non una soglia
      // sulla distanza dalla retta, a reggere i pochi pixel d'errore di una
      // rilevazione vera: chi punta al centro e si ferma un po' prima resta
      // "davanti", chi lo sfiora di lato resta "di fianco"
      const e: 'a' | 'b' = da <= db ? 'a' : 'b';
      const fine = s[e];
      const altro = e === 'a' ? s.b : s.a;
      const l = Math.max(distanza(fine, altro), 1e-9);
      const d = { x: (fine.x - altro.x) / l, y: (fine.y - altro.y) / l };
      const w = { x: c.x - fine.x, y: c.y - fine.y };
      const davanti = w.x * d.x + w.y * d.y;
      const fianco = Math.abs(w.x * d.y - w.y * d.x);
      if (Math.min(da, db) < r + tol.tau && davanti > fianco) {
        terminano.push({ segmento: k, estremo: e });
        return;
      }
      // passa: il corpo della linea sfiora o attraversa il pallino. Il piede
      // può cadere poco oltre un estremo: è lo spigolo appoggiato sul pallino.
      const margine = tol.tau / Math.max(distanza(s.a, s.b), 1e-9);
      if (pr.distanza <= 1.5 * r + tol.tau && pr.t > -margine && pr.t < 1 + margine) {
        passanti.push({ segmento: k, t: Math.min(1, Math.max(0, pr.t)) });
      }
    });

    const prosegue = passanti.filter((x) => interno(p, x, tol));
    const raggiunte = terminano.filter((e) => !oltreLaTrave(p, e, prosegue, c));
    const sfiorano = passanti.length - prosegue.length;
    return {
      indice, esito: esito(raggiunte.length, prosegue.length, sfiorano),
      terminano: raggiunte, passanti, corpo: corpoSotto(p, indice, tol),
    };
  });
}

function esito(k: number, h: number, e: number): EsitoPallino {
  if (h >= 1) return k >= 1 ? 'accanto' : 'appoggiato';
  if (k + e === 0) return 'isolato';
  if (k + e === 1) return 'estremo';
  return k >= 2 ? 'cerniera' : 'appoggiato';
}

/** Il contatto cade dentro l'asta, non su un suo estremo: l'asta prosegue. */
function interno(p: Primitive, x: { segmento: number; t: number }, tol: Tolleranze): boolean {
  const s = p.aste[x.segmento];
  const margine = tol.tau / Math.max(distanza(s.a, s.b), 1e-9);
  return x.t > margine && x.t < 1 - margine;
}

/**
 * Vero se il corpo dell'asta che "finisce" sta dall'altra parte di un'asta
 * che prosegue rispetto al pallino: allora arriva sulla trave, non sul pallino.
 */
function oltreLaTrave(
  p: Primitive, e: EstremoRef, prosegue: readonly { segmento: number }[], c: Punto,
): boolean {
  const s = p.aste[e.segmento];
  const lontano = e.estremo === 'a' ? s.b : s.a;
  return prosegue.some(({ segmento }) => {
    const t = p.aste[segmento];
    const lato = (q: Punto): number =>
      (t.b.x - t.a.x) * (q.y - t.a.y) - (t.b.y - t.a.y) * (q.x - t.a.x);
    return lato(lontano) * lato(c) < 0;
  });
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

/**
 * DECODIFICA DEI PUNTI — dai picchi delle mappe alle primitive puntuali.
 *
 * Coordinate in pixel d'ingresso con y verso il BASSO (come le celle); gli
 * angoli invece sono già quelli del contratto (y su), come li regredisce
 * la rete. È `decodifica` a ribaltare le y alla fine.
 *
 * I tipi di vincolo, i versi dei momenti e i valori delle scritte si
 * leggono dai picchi del MASSIMO dei loro canali, poi si sceglie il canale
 * più forte in quella cella: così un simbolo non diventa due oggetti di
 * tipo diverso in celle vicine.
 *
 * Il verso di un momento non viene dai canali 16–17 (si accendono
 * entrambi) ma dalla punta del suo arco, che la rete mette nel canale delle
 * frecce: la punta più vicina al centro fra 6 e 90 px fra quelle TANGENTI
 * all'arco (|cos| fra raggio e direzione < 0.7: una forza che punta sul nodo
 * del momento è radiale e resta una forza); antiorario se
 * (punta − centro) × direzione > 0 con y su. Quella punta non è un carico.
 * Senza una punta così il momento resta, con confidenza sotto VERSO_INCERTO:
 * la lettura avvisa che il verso va controllato.
 */

import { VERSO_INCERTO, type ArcoMomento, type CorpoVincolo, type Freccia, type Pallino, type Punto, type Scritta } from '../tipi.js';
import { canale, centroCella, massimoCanali, picchi, type Picco, type Uscite } from './tensori.js';
import * as V from './vocabolario.js';

export interface Puntuali {
  pallini: Pallino[];
  corpi: CorpoVincolo[];
  frecce: Freccia[];
  momenti: ArcoMomento[];
  scritte: Scritta[];
  nodi: Punto[];
}

/** distanza della punta dell'arco dal centro del momento [px] */
export const PUNTA_MOMENTO = { min: 6, max: 90, radiale: 0.7 };

const intervallo = (da: number, n: number) => Array.from({ length: n }, (_, k) => da + k);

export function decodificaPuntuali(u: Uscite): Puntuali {
  const valore = (k: number, p: Picco) => u.testa[(k * u.h4 + p.i) * u.w4 + p.j];
  const centro = (p: Picco) => centroCella(p.i, p.j);
  const piuForte = (canali: number[], p: Picco) =>
    canali.reduce((m, k) => (valore(k, p) > valore(m, p) ? k : m), canali[0]);
  const daMassimo = (canali: number[]) => picchi(massimoCanali(u, canali), u.h4, u.w4);
  const daCanale = (k: number) => picchi(canale(u, k), u.h4, u.w4);

  const pallini: Pallino[] = daCanale(V.PALLINO).map((p) => ({
    c: centro(p), r: valore(V.RAGGIO, p) * V.SCALA_RAGGIO, confidenza: p.v,
  }));

  const canaliCorpo = intervallo(V.CORPO0, V.TIPI_CORPO.length);
  const corpi: CorpoVincolo[] = daMassimo(canaliCorpo).map((p) => ({
    tipo: V.TIPI_CORPO[piuForte(canaliCorpo, p) - V.CORPO0],
    attacco: centro(p),
    angolo: Math.atan2(valore(V.SIN_CORPO, p), valore(V.COS_CORPO, p)),
    confidenza: p.v,
  }));

  const punte = daCanale(V.FRECCIA).map((p) => ({
    punta: centro(p),
    direzione: Math.atan2(valore(V.SIN_FRECCIA, p), valore(V.COS_FRECCIA, p)),
    lunghezza: valore(V.LUNG_FRECCIA, p) * V.SCALA_LUNGHEZZA,
    confidenza: p.v,
  }));
  const usate = new Set<number>();
  const momenti: ArcoMomento[] = [];
  for (const p of daMassimo([V.MOMENTO0, V.MOMENTO0 + 1])) {
    const c = centro(p);
    let scelta = -1;
    let migliore = Infinity;
    punte.forEach((f, k) => {
      const d = Math.hypot(f.punta.x - c.x, f.punta.y - c.y);
      if (usate.has(k) || d < PUNTA_MOMENTO.min || d > PUNTA_MOMENTO.max || d >= migliore) return;
      // y su per la parte radiale, come la direzione
      const radiale = Math.abs(((f.punta.x - c.x) * Math.cos(f.direzione) - (f.punta.y - c.y) * Math.sin(f.direzione)) / d);
      if (radiale >= PUNTA_MOMENTO.radiale) return;
      migliore = d;
      scelta = k;
    });
    if (scelta < 0) {
      // senza punta il verso sarebbe un tiro a caso: il momento resta, segnato incerto
      momenti.push({ centro: c, raggio: 20, verso: 'antiorario', confidenza: Math.min(p.v, VERSO_INCERTO - 0.05) });
      continue;
    }
    usate.add(scelta);
    const f = punte[scelta];
    const rx = f.punta.x - c.x, ry = -(f.punta.y - c.y); // y su
    const croce = rx * Math.sin(f.direzione) - ry * Math.cos(f.direzione);
    momenti.push({ centro: c, raggio: migliore, verso: croce > 0 ? 'antiorario' : 'orario', confidenza: p.v });
  }
  const frecce: Freccia[] = punte.filter((_, k) => !usate.has(k));

  const canaliScritta = intervallo(V.SCRITTA0, V.SCRITTE.length);
  const scritte: Scritta[] = daMassimo(canaliScritta).map((p) => {
    const s = V.SCRITTE[piuForte(canaliScritta, p) - V.SCRITTA0];
    const c = centro(p);
    if (s.famiglia !== 'L') {
      return { centro: c, valore: { famiglia: s.famiglia, coefficiente: s.valore }, confidenza: p.v };
    }
    const d = intervallo(V.QUOTA0, 4).map((k) => valore(k, p) * V.SCALA_QUOTA);
    // gli scarti sono y su: in pixel y giù si sottraggono
    const estremi: [Punto, Punto] = [{ x: c.x + d[0], y: c.y - d[1] }, { x: c.x + d[2], y: c.y - d[3] }];
    return { centro: c, valore: { famiglia: 'L', valore: s.valore }, estremi, confidenza: p.v };
  });

  const nodi = daCanale(V.NODO).map(centro);
  return { pallini, corpi, frecce, momenti, scritte, nodi };
}

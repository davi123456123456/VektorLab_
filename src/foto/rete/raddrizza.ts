/**
 * RADDRIZZAMENTO — la foto storta di qualche grado.
 *
 * Gli schemi sono fatti quasi solo di aste orizzontali e verticali: lo
 * scarto di ciascuna dal multiplo di 90° più vicino (solo quelli sotto 10°,
 * così le aste a 45° non contano), mediato con la mediana pesata per la
 * lunghezza, è la rotazione della foto. Si ruotano le primitive attorno al
 * centro dell'immagine; sotto 0.3° non si tocca niente. Y su, radianti.
 */

import type { Primitive, Punto } from '../tipi.js';

const GRADI = Math.PI / 180;
export const RADDRIZZA = { scartoMassimo: 10 * GRADI, minimo: 0.3 * GRADI };

function medianaPesata(valori: { v: number; p: number }[]): number {
  const ordinati = [...valori].sort((a, b) => a.v - b.v);
  const totale = ordinati.reduce((s, x) => s + x.p, 0);
  let somma = 0;
  for (const x of ordinati) {
    somma += x.p;
    if (somma >= totale / 2) return x.v;
  }
  return 0;
}

export function raddrizza(p: Primitive): { primitive: Primitive; angolo: number } {
  const scarti = p.aste.map((s) => {
    const phi = Math.atan2(s.b.y - s.a.y, s.b.x - s.a.x);
    const quarto = Math.PI / 2;
    return { v: phi - Math.round(phi / quarto) * quarto, p: Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y) };
  }).filter((x) => Math.abs(x.v) < RADDRIZZA.scartoMassimo);
  const angolo = scarti.length > 0 ? medianaPesata(scarti) : 0;
  if (Math.abs(angolo) < RADDRIZZA.minimo) return { primitive: p, angolo };
  const cx = p.larghezza / 2, cy = p.altezza / 2, c = Math.cos(-angolo), s = Math.sin(-angolo);
  const r = (q: Punto): Punto => ({ x: cx + (q.x - cx) * c - (q.y - cy) * s, y: cy + (q.x - cx) * s + (q.y - cy) * c });
  return {
    angolo,
    primitive: {
      ...p,
      aste: p.aste.map((x) => ({ ...x, a: r(x.a), b: r(x.b) })),
      pallini: p.pallini.map((x) => ({ ...x, c: r(x.c) })),
      corpi: p.corpi.map((x) => ({ ...x, attacco: r(x.attacco), angolo: x.angolo - angolo })),
      frecce: p.frecce.map((x) => ({ ...x, punta: r(x.punta), direzione: x.direzione - angolo })),
      momenti: p.momenti.map((x) => ({ ...x, centro: r(x.centro) })),
      nodi: p.nodi.map(r),
      scritte: p.scritte.map((x) => ({
        ...x, centro: r(x.centro), ...(x.estremi ? { estremi: [r(x.estremi[0]), r(x.estremi[1])] as [Punto, Punto] } : {}),
      })),
    },
  };
}

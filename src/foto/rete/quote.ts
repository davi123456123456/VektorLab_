/**
 * AGGANCIO DELLE QUOTE — gli estremi regrediti dalla rete sono grossolani
 * (sul sintetico 6 px di mediana, 14 px al 90 %), la lettura li vuole sui
 * punti notevoli entro pochi pixel.
 *
 * Ogni estremo si sposta, lungo l'asse della quota (x, y o l'asta inclinata,
 * come in `associaQuote`), sul punto notevole più vicino: estremi delle
 * aste, nodi, pallini, attacchi dei vincoli, punte delle frecce. Solo entro
 * max(12 px, 30 % della quota): all'errore della rete si somma la
 * prospettiva, che sposta i richiami di quota di una decina di pixel. I due
 * estremi non vanno mai sullo stesso punto (resta dov'è quello più lontano).
 * Y su, come le Primitive.
 */

import type { Primitive, Punto } from '../tipi.js';

export const QUOTE = { finestra: 12, frazione: 0.3 };

export function agganciaQuote(p: Primitive): Primitive {
  const candidati: Punto[] = [
    ...p.aste.flatMap((s) => [s.a, s.b]), ...p.nodi, ...p.pallini.map((c) => c.c),
    ...p.corpi.map((k) => k.attacco), ...p.frecce.map((f) => f.punta),
  ];
  return {
    ...p,
    scritte: p.scritte.map((s) => {
      if (s.valore.famiglia !== 'L' || !s.estremi) return s;
      const [e1, e2] = s.estremi;
      const dx = Math.abs(e2.x - e1.x), dy = Math.abs(e2.y - e1.y);
      const asse = dx > 3 * dy ? 'x' : dy > 3 * dx ? 'y' : 'asta';
      const finestra = Math.max(QUOTE.finestra, QUOTE.frazione * Math.hypot(dx, dy));
      const distanza = (e: Punto, q: Punto) =>
        asse === 'x' ? Math.abs(q.x - e.x) : asse === 'y' ? Math.abs(q.y - e.y) : Math.hypot(q.x - e.x, q.y - e.y);
      const piuVicino = (e: Punto) => {
        let migliore: { q: Punto; d: number } | null = null;
        for (const q of candidati) {
          const d = distanza(e, q);
          if (d <= finestra && (!migliore || d < migliore.d)) migliore = { q, d };
        }
        return migliore;
      };
      const sposta = (e: Punto, q: Punto): Punto =>
        asse === 'x' ? { x: q.x, y: e.y } : asse === 'y' ? { x: e.x, y: q.y } : { ...q };
      const m1 = piuVicino(e1), m2 = piuVicino(e2);
      let n1 = m1 ? sposta(e1, m1.q) : e1, n2 = m2 ? sposta(e2, m2.q) : e2;
      if (m1 && m2 && m1.q === m2.q) {
        if (m1.d <= m2.d) n2 = e2;
        else n1 = e1;
      }
      return { ...s, estremi: [n1, n2] as [Punto, Punto] };
    }),
  };
}

/**
 * Geometria elementare del piano per le regole di lettura. Nessuna
 * dipendenza: sono le stesse quattro operazioni ripetute ovunque, e averle in
 * un posto solo evita che ciascuna regola ne scriva una versione appena
 * diversa.
 */

import type { Punto } from './tipi.js';

const DUE_PI = Math.PI * 2;

export function distanza(a: Punto, b: Punto): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/**
 * Proiezione di `p` sulla RETTA per `a` e `b`. `t` non è limitato a [0, 1]:
 * dice anche da che parte, e quanto fuori, cade il piede.
 */
export function proiezione(
  p: Punto, a: Punto, b: Punto,
): { t: number; punto: Punto; distanza: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return { t: 0, punto: { ...a }, distanza: distanza(p, a) };
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2;
  const punto = { x: a.x + t * dx, y: a.y + t * dy };
  return { t, punto, distanza: distanza(p, punto) };
}

/** Distanza dal SEGMENTO, cioè con il piede limitato agli estremi. */
export function distanzaSegmento(p: Punto, a: Punto, b: Punto): number {
  const { t, punto } = proiezione(p, a, b);
  if (t <= 0) return distanza(p, a);
  if (t >= 1) return distanza(p, b);
  return distanza(p, punto);
}

export function angoloDi(a: Punto, b: Punto): number {
  return Math.atan2(b.y - a.y, b.x - a.x);
}

/** Differenza fra due direzioni, in [0, π]. */
export function differenzaAngoli(a: number, b: number): number {
  const d = Math.abs(a - b) % DUE_PI;
  return d > Math.PI ? DUE_PI - d : d;
}

/** Riporta `a` al multiplo di `passo` più vicino, se ci dista meno di `soglia`. */
export function agganciaAngolo(a: number, passo: number, soglia: number): number {
  const vicino = Math.round(a / passo) * passo;
  return Math.abs(a - vicino) <= soglia ? vicino : a;
}

/**
 * Raggruppamento monodimensionale a collegamento singolo: valori ordinati
 * che distano meno di `tolleranza` dal precedente stanno nello stesso
 * gruppo. Restituisce l'indice di gruppo di ciascun valore, nell'ordine
 * d'ingresso, con i gruppi numerati per valore crescente.
 */
export function raggruppa1D(valori: readonly number[], tolleranza: number): number[] {
  const ordine = valori.map((v, i) => i).sort((i, j) => valori[i] - valori[j]);
  const gruppo = new Array<number>(valori.length);
  let corrente = -1;
  let precedente = -Infinity;
  for (const i of ordine) {
    if (valori[i] - precedente >= tolleranza) corrente++;
    gruppo[i] = corrente;
    precedente = valori[i];
  }
  return gruppo;
}

export function mediana(valori: readonly number[]): number {
  if (valori.length === 0) return NaN;
  const s = [...valori].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

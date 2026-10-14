/**
 * PULIZIA DELLE PRIMITIVE prima della lettura.
 *
 * Una rete vera sbaglia in due modi che le regole non devono pagare:
 *
 *   · valori non validi (NaN, infiniti, lunghezze nulle): un solo NaN
 *     propagato dalla metrica renderebbe illeggibile l'intero modello;
 *   · rilevazioni doppie della stessa cosa: due picchi per la stessa
 *     freccia diventerebbero una forza raddoppiata, in silenzio.
 *
 * Gli scarti si dicono con un avviso; i doppioni si fondono e basta, perché
 * sono rumore e non informazione.
 */

import { differenzaAngoli, distanza, mediana } from './geometria.js';
import { tolleranze } from './parametri.js';
import type { Avviso, Primitive, Punto } from './tipi.js';

const GRADI = Math.PI / 180;

export function pulisci(p: Primitive): { primitive: Primitive; avvisi: Avviso[] } {
  let scartate = 0;
  const tieni = <T>(elenco: readonly T[], valido: (x: T) => boolean): T[] => {
    const buoni = elenco.filter(valido);
    scartate += elenco.length - buoni.length;
    return buoni;
  };
  const ok = (q: Punto | undefined): boolean => !!q && Number.isFinite(q.x) && Number.isFinite(q.y);
  const positivo = (v: number): boolean => Number.isFinite(v) && v > 0;

  // uno spessore non valido non butta via l'asta: prende quello tipico
  const aste = tieni(p.aste, (s) => ok(s.a) && ok(s.b) && distanza(s.a, s.b) > 0);
  const spessori = aste.map((s) => s.spessore).filter(positivo);
  const tipico = spessori.length > 0 ? mediana(spessori) : 1;
  const pulite: Primitive = {
    larghezza: p.larghezza,
    altezza: p.altezza,
    aste: aste.map((s) => (positivo(s.spessore) ? s : { ...s, spessore: tipico })),
    pallini: tieni(p.pallini, (c) => ok(c.c) && positivo(c.r)),
    corpi: tieni(p.corpi, (k) => ok(k.attacco) && Number.isFinite(k.angolo)),
    frecce: tieni(p.frecce, (f) => ok(f.punta) && Number.isFinite(f.direzione) && positivo(f.lunghezza)),
    momenti: tieni(p.momenti, (m) => ok(m.centro) && positivo(m.raggio)),
    nodi: tieni(p.nodi, ok),
    scritte: tieni(p.scritte, (s) => ok(s.centro) && (!s.estremi || (ok(s.estremi[0]) && ok(s.estremi[1])))),
  };
  if (!positivo(pulite.larghezza) || !positivo(pulite.altezza)) {
    const xs = pulite.aste.flatMap((s) => [s.a.x, s.b.x]);
    const ys = pulite.aste.flatMap((s) => [s.a.y, s.b.y]);
    pulite.larghezza = xs.length > 0 ? Math.max(...xs) - Math.min(...xs) || 1 : 1;
    pulite.altezza = ys.length > 0 ? Math.max(...ys) - Math.min(...ys) || 1 : 1;
  }

  // doppioni: stessa freccia (punta vicina, stesso verso), stesso arco
  const { tau } = tolleranze(pulite);
  pulite.frecce = senzaDoppioni(pulite.frecce, (u, v) =>
    distanza(u.punta, v.punta) < tau && differenzaAngoli(u.direzione, v.direzione) < 15 * GRADI);
  pulite.momenti = senzaDoppioni(pulite.momenti, (u, v) =>
    distanza(u.centro, v.centro) < tau && u.verso === v.verso);

  const avvisi: Avviso[] = scartate > 0
    ? [{ codice: 'primitiveScartate', messaggio: `Scartati ${scartate} elementi rilevati male.` }]
    : [];
  return { primitive: pulite, avvisi };
}

/** Tiene, fra gli elementi uguali, il più confidente. */
function senzaDoppioni<T extends { confidenza: number }>(
  elenco: readonly T[], uguali: (u: T, v: T) => boolean,
): T[] {
  const tenuti: T[] = [];
  for (const x of [...elenco].sort((a, b) => b.confidenza - a.confidenza)) {
    if (!tenuti.some((t) => uguali(t, x))) tenuti.push(x);
  }
  return elenco.filter((x) => tenuti.includes(x));
}

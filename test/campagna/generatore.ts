/**
 * GENERATORE DI STRUTTURE CASUALI — §10.2.
 *
 * Genera geometrie, vincoli e carichi a caso e SCARTA tutto ciò che non è
 * isostatico. Lo scarto non è uno spreco: è il filtro che rende la campagna
 * significativa, perché su una struttura labile o iperstatica gli invarianti
 * non direbbero niente sul metodo di calcolo isostatico.
 *
 * Il generatore è DETERMINISTICO a parità di seme, così un fallimento si
 * riproduce esattamente e si può ridurre al caso minimo.
 */

import { progetto } from '../../src/core/builder.js';
import { preset } from '../../src/core/materials/sezioniParametriche.js';
import { analizzaCinematica } from '../../src/core/index.js';
import type { NodeId, Progetto, TipoVincolo } from '../../src/core/model/types.js';

/** Generatore lineare congruenziale: piccolo, riproducibile, sufficiente. */
export function casuale(seme: number): () => number {
  let s = seme >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export interface Opzioni {
  /** numero di aste da provare */
  aste: number;
  /** true per usare angoli non notevoli */
  angoliIrregolari: boolean;
  /** true per inserire sconnessioni interne */
  sconnessioni: boolean;
}

const TIPI_ESTERNI: TipoVincolo[] = ['cerniera', 'carrello', 'incastro'];

/**
 * Una struttura casuale, oppure null se non è isostatica.
 *
 * La forma è una spezzata aperta di aste concatenate, con vincoli agli
 * estremi e talvolta in mezzo: è la famiglia che copre travi, mensole, telai
 * a L, a T e portali, cioè quasi tutto ciò che si risolve a mano.
 */
export function generaIsostatica(seme: number, o: Opzioni): Progetto | null {
  const rnd = casuale(seme);
  const p = progetto(`casuale-${seme}`);
  const sez = p.sezioneParametrica('s', preset('IPE 200'));

  const n = Math.max(2, o.aste);
  const nodi: NodeId[] = [p.nodo(0, 0)];
  let x = 0, y = 0;
  for (let i = 0; i < n; i++) {
    const ang = o.angoliIrregolari
      ? rnd() * Math.PI * 2
      : (Math.floor(rnd() * 8) * Math.PI) / 4;
    const lung = 1.5 + rnd() * 4;
    x += Math.cos(ang) * lung;
    y += Math.sin(ang) * lung;
    nodi.push(p.nodo(Number(x.toFixed(6)), Number(y.toFixed(6))));
  }
  const aste = [];
  for (let i = 0; i < n; i++) aste.push(p.asta(nodi[i], nodi[i + 1], 'S275', sez));

  // ── vincoli: si prova finché non esce isostatica ──
  const angolo = () => (o.angoliIrregolari
    ? rnd() * Math.PI * 2 : (Math.floor(rnd() * 8) * Math.PI) / 4);

  const tipoA = TIPI_ESTERNI[Math.floor(rnd() * TIPI_ESTERNI.length)];
  p.vincolo(nodi[0], tipoA, angolo());
  const tipoB = TIPI_ESTERNI[Math.floor(rnd() * TIPI_ESTERNI.length)];
  p.vincolo(nodi[n], tipoB, angolo());

  if (o.sconnessioni && n >= 2) {
    const k = 1 + Math.floor(rnd() * (n - 1));
    p.sconnessioneNodale(nodi[k], 'cerniera');
  }

  // ── carichi: solo forme covarianti per rotazione ──
  const quanti = 1 + Math.floor(rnd() * 3);
  for (let i = 0; i < quanti; i++) {
    const scelta = rnd();
    if (scelta < 0.45) {
      const k = 1 + Math.floor(rnd() * n);
      p.forza(nodi[k], (rnd() - 0.5) * 2e4, (rnd() - 0.5) * 2e4);
    } else if (scelta < 0.8) {
      const k = Math.floor(rnd() * n);
      p.distribuito(aste[k], (rnd() - 0.5) * 2e4, {
        modo: 'angolo', alpha: (rnd() * Math.PI * 2) as never,
      });
    } else {
      const k = 1 + Math.floor(rnd() * n);
      p.momento(nodi[k], (rnd() - 0.5) * 3e4);
    }
  }

  const costruito = p.costruisci();
  let c;
  try {
    c = analizzaCinematica(costruito);
  } catch {
    return null;
  }
  // isostatica: né labile né iperstatica, e senza anelli interni
  if (c.labilita !== 0 || c.iperstaticita !== 0 || c.anelliChiusi !== 0) return null;
  return costruito;
}

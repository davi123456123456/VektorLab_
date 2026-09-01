/**
 * GLI INVARIANTI — gli oracoli del §10.2.
 *
 * Per una struttura generata a caso non esiste una soluzione tabellata, ma
 * esistono proprietà che la soluzione DEVE avere qualunque essa sia. Sono
 * altrettanto stringenti di un valore atteso, e coprono più casi: un errore
 * di proiezione o di convenzione angolare non sopravvive alla rotazione
 * dell'intera struttura.
 */

import { analizzaCaso } from '../../src/core/index.js';
import type {
  Carico, LoadCaseId, Progetto, Radianti,
} from '../../src/core/model/types.js';
import type { RisultatoAnalisi } from '../../src/core/model/results.js';

export const CASO = 'principale' as LoadCaseId;

/** Ruota l'intera struttura di θ: nodi, angoli dei vincoli, direzioni dei carichi. */
export function ruotaStruttura(p: Progetto, theta: number): Progetto {
  const c = Math.cos(theta), s = Math.sin(theta);
  const ruotaPunto = (x: number, y: number) => ({ x: x * c - y * s, y: x * s + y * c });

  return {
    ...p,
    nodi: p.nodi.map((n) => {
      const q = ruotaPunto(n.x, n.y);
      return {
        ...n,
        x: q.x as never, y: q.y as never,
        // l'angolo del vincolo è ASSOLUTO: ruota con la struttura
        ...(n.vincolo
          ? { vincolo: { ...n.vincolo, angolo: (n.vincolo.angolo + theta) as Radianti } }
          : {}),
      };
    }),
    vincoliSuAsta: (p.vincoliSuAsta ?? []).map((v) => ({
      ...v, vincolo: { ...v.vincolo, angolo: (v.vincolo.angolo + theta) as Radianti },
    })),
    sconnessioni: (p.sconnessioni ?? []).map((x) => (
      x.angolo === undefined ? x : { ...x, angolo: (x.angolo + theta) as Radianti }
    )),
    carichi: p.carichi.map((k): Carico => {
      if (k.tipo === 'forzaNodale' || k.tipo === 'forzaInCampata') {
        const q = ruotaPunto(k.fx, k.fy);
        return { ...k, fx: q.x as never, fy: q.y as never };
      }
      if (k.tipo === 'distribuito') {
        // solo il modo «angolo» è covariante: globaleX e globaleY sono legati
        // agli assi del mondo e NON ruotano con la struttura
        if (k.direzione.modo !== 'angolo') return k;
        return {
          ...k,
          direzione: {
            ...k.direzione, alpha: ((k.direzione.alpha ?? 0) + theta) as Radianti,
          },
        };
      }
      return k;
    }),
  };
}

/** Tutti i carichi moltiplicati per un fattore. */
export function scalaCarichi(p: Progetto, k: number): Progetto {
  return {
    ...p,
    carichi: p.carichi.map((c): Carico => {
      if (c.tipo === 'forzaNodale' || c.tipo === 'forzaInCampata') {
        return { ...c, fx: (c.fx * k) as never, fy: (c.fy * k) as never };
      }
      if (c.tipo === 'momentoNodale' || c.tipo === 'momentoInCampata') {
        return { ...c, mz: (c.mz * k) as never };
      }
      if (c.tipo === 'distribuito') {
        return { ...c, q1: (c.q1 * k) as never, q2: (c.q2 * k) as never };
      }
      return c;
    }),
  };
}

/** Tutte le lunghezze moltiplicate per un fattore, carichi concentrati invariati. */
export function scalaGeometria(p: Progetto, k: number): Progetto {
  return {
    ...p,
    nodi: p.nodi.map((n) => ({ ...n, x: (n.x * k) as never, y: (n.y * k) as never })),
  };
}

/**
 * TOLLERANZA DEGLI INVARIANTI — quella del §9.16, `1e-6` relativo.
 *
 * Non è una soglia scelta per far passare i test: è il limite del metodo.
 * La matrice di rigidezza di un telaio articolato ha un numero di
 * condizionamento alto — la rigidezza assiale `EA/L` e quella flessionale
 * `12EI/L³` differiscono di ordini di grandezza — e in doppia precisione
 * l'accuratezza relativa che se ne ottiene è appunto intorno a `1e-7`.
 * Pretendere di più significherebbe misurare il rumore.
 *
 * Resta abbondantemente sufficiente allo scopo: un errore di segno o di
 * proiezione produce uno scarto dell'ordine dell'unità, sei ordini di
 * grandezza sopra questa soglia.
 */
export const TOLLERANZA = 1e-6;

export interface Scostamento {
  nome: string;
  atteso: number;
  ottenuto: number;
  scarto: number;
}

/**
 * Confronto relativo ALL'AMPIEZZA DEL PROBLEMA, non al singolo valore.
 *
 * Rapportare lo scarto al valore stesso sembra più severo e in realtà è solo
 * più rumoroso: su uno sforzo normale che vale 1e-7 N in una struttura dove i
 * momenti valgono 1e4 Nm, una differenza di macchina diventa uno scarto
 * relativo del 50 %, e la campagna segnala centinaia di falsi allarmi che
 * nascondono quelli veri.
 *
 * «Coincidere entro 1e-6 relativo» significa rispetto alla grandezza in
 * gioco. Un errore di segno o di proiezione produce uno scarto dell'ordine
 * del doppio del valore, che su qualunque valore significativo resta
 * ordini di grandezza sopra questa soglia.
 */
export function confronta(
  nome: string, atteso: number, ottenuto: number,
  scala: number, tolleranza = 1e-6,
): Scostamento | null {
  const scarto = Math.abs(atteso - ottenuto) / Math.max(scala, 1e-30);
  return scarto > tolleranza ? { nome, atteso, ottenuto, scarto } : null;
}

/** Ampiezza tipica delle sollecitazioni: serve a rendere relativo il confronto. */
export function ampiezza(r: RisultatoAnalisi): number {
  let m = 0;
  for (const a of r.aste) {
    for (const v of [a.estremi.Nmax, a.estremi.Nmin, a.estremi.Tmax,
                     a.estremi.Tmin, a.estremi.Mmax, a.estremi.Mmin]) {
      m = Math.max(m, Math.abs(v));
    }
  }
  return Math.max(m, 1);
}

/**
 * §10.2.4a — INVARIANZA PER ROTOTRASLAZIONE.
 *
 * Ruotando l'intera struttura, N, T e M devono restare IDENTICI: sono
 * grandezze definite nel riferimento locale dell'asta, che ruota con lei. Le
 * reazioni invece ruotano, perché sono vettori nel riferimento globale.
 *
 * È il test più efficace del documento, e il motivo è che mette sotto sforzo
 * tutto insieme: convenzione degli angoli dei vincoli, proiezione dei carichi,
 * assi locali, segni di T e M. Un errore in uno qualunque di questi lo fa
 * fallire, mentre una struttura orizzontale con carichi verticali potrebbe
 * non accorgersene mai.
 */
export function verificaRotazione(p: Progetto, theta: number): Scostamento[] {
  const base = analizzaCaso(p, CASO);
  const ruotato = analizzaCaso(ruotaStruttura(p, theta), CASO);
  const scala = ampiezza(base);
  const fuori: Scostamento[] = [];

  if (base.aste.length !== ruotato.aste.length) {
    return [{ nome: 'numero di aste', atteso: base.aste.length,
              ottenuto: ruotato.aste.length, scarto: 1 }];
  }

  for (let i = 0; i < base.aste.length; i++) {
    const a = base.aste[i], b = ruotato.aste[i];
    for (const quale of ['N', 'T', 'M'] as const) {
      for (let k = 0; k < a[quale].length; k++) {
        const s = confronta(
          `${a.astaId as unknown as string}.${quale}[${k}]`,
          a[quale][k], b[quale][k], scala, TOLLERANZA);
        if (s) fuori.push(s);
      }
    }
  }

  // le reazioni ruotano della stessa quantità
  const c = Math.cos(theta), sn = Math.sin(theta);
  const scalaR = Math.max(...base.reazioni.map(
    (r) => Math.hypot(r.fx, r.fy)), 1);
  for (let i = 0; i < base.reazioni.length; i++) {
    const r0 = base.reazioni[i], r1 = ruotato.reazioni[i];
    const attesoX = r0.fx * c - r0.fy * sn;
    const attesoY = r0.fx * sn + r0.fy * c;
    for (const [nome, atteso, ott] of [
      ['Rx', attesoX, r1.fx], ['Ry', attesoY, r1.fy], ['Mz', r0.mz, r1.mz],
    ] as const) {
      const s = confronta(`reazione ${i}.${nome}`, atteso, ott, scalaR, TOLLERANZA);
      if (s) fuori.push(s);
    }
  }
  return fuori;
}

/** §10.2.4b — raddoppiando i carichi, tutto raddoppia. */
export function verificaLinearita(p: Progetto, k = 2): Scostamento[] {
  const base = analizzaCaso(p, CASO);
  const scalato = analizzaCaso(scalaCarichi(p, k), CASO);
  const scala = ampiezza(base) * Math.abs(k);
  const fuori: Scostamento[] = [];
  for (let i = 0; i < base.aste.length; i++) {
    const a = base.aste[i], b = scalato.aste[i];
    for (const quale of ['N', 'T', 'M'] as const) {
      for (let j = 0; j < a[quale].length; j++) {
        const s = confronta(`${quale}[${j}]`, a[quale][j] * k, b[quale][j], scala, TOLLERANZA);
        if (s) fuori.push(s);
      }
    }
  }
  return fuori;
}

/**
 * §10.2.4c — raddoppiando le lunghezze a carichi CONCENTRATI invariati, M
 * raddoppia mentre N e T restano.
 *
 * DUE ESCLUSIONI, ed entrambe sono nella natura del carico, non nel codice:
 *
 *   · i DISTRIBUITI danno una risultante doppia su un'asta lunga il doppio,
 *     quindi non è più lo stesso problema;
 *   · i MOMENTI CONCENTRATI non scalano affatto — una coppia resta quella
 *     coppia — e il momento flettente che ne discende è la somma di una parte
 *     che raddoppia (le forze per il braccio) e di una che non lo fa. Il
 *     rapporto atteso non è più 2 e l'invariante non si applica.
 */
export function verificaScala(p: Progetto, k = 2): Scostamento[] {
  const scalabile = (c: Progetto['carichi'][number]) =>
    c.tipo !== 'distribuito' && c.tipo !== 'momentoNodale'
    && c.tipo !== 'momentoInCampata';
  if (!p.carichi.every(scalabile)) return [];
  const base = analizzaCaso(p, CASO);
  const grande = analizzaCaso(scalaGeometria(p, k), CASO);
  const scala = ampiezza(base) * k;
  const fuori: Scostamento[] = [];
  for (let i = 0; i < base.aste.length; i++) {
    const a = base.aste[i], b = grande.aste[i];
    for (let j = 0; j < a.N.length; j++) {
      for (const [quale, fattore] of [['N', 1], ['T', 1], ['M', k]] as const) {
        const s = confronta(
          `${quale}[${j}]`, a[quale][j] * fattore, b[quale][j], scala, TOLLERANZA);
        if (s) fuori.push(s);
      }
    }
  }
  return fuori;
}

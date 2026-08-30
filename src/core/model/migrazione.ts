/**
 * Lettura dei file salvati con versioni precedenti del formato.
 *
 * Un file `.strut` scritto ieri deve aprirsi oggi. Il modello è cambiato — i
 * carichi distribuiti avevano due componenti (qx, qy) e ora hanno un'intensità
 * più una DIREZIONE dichiarata — e la conversione va fatta una volta sola, in
 * ingresso, così tutto il resto del programma vede un solo formato.
 *
 * La regola che governa la conversione: nessuna approssimazione. Un carico
 * obliquo del vecchio formato non viene «arrotondato» al modo più somigliante,
 * ma SPEZZATO in due carichi che insieme danno esattamente la stessa
 * risultante. Meglio due voci nell'elenco che un numero diverso da quello che
 * l'utente aveva salvato.
 */

import type {
  Carico, DirezioneCarico, LoadId, Progetto, Radianti, Vincolo,
} from './types.js';
import { normalizzaAngolo } from './orientamento.js';

export const VERSIONE_FORMATO = 2;

/** Forma del distribuito prima dell'introduzione della direzione esplicita. */
interface DistribuitoV1 {
  tipo: 'distribuito';
  id: LoadId;
  casoId: Carico['casoId'];
  astaId: string;
  riferimento?: 'locale' | 'globale';
  sIniziale?: number;
  sFinale?: number;
  qxIniziale?: number;
  qxFinale?: number;
  qyIniziale?: number;
  qyFinale?: number;
}

function eVecchioDistribuito(c: unknown): c is DistribuitoV1 {
  const x = c as Record<string, unknown>;
  return x.tipo === 'distribuito' && x.direzione === undefined;
}

/** Converte un distribuito del formato 1 in uno o due del formato 2. */
function convertiDistribuito(c: DistribuitoV1): Carico[] {
  const s0 = c.sIniziale ?? 0;
  const s1 = c.sFinale ?? 1;
  const qx1 = c.qxIniziale ?? 0, qx2 = c.qxFinale ?? 0;
  const qy1 = c.qyIniziale ?? 0, qy2 = c.qyFinale ?? 0;
  const locale = c.riferimento !== 'globale';

  const fatto = (
    modo: DirezioneCarico['modo'], q1: number, q2: number, suffisso: string,
  ): Carico => ({
    tipo: 'distribuito',
    id: (suffisso ? `${c.id as unknown as string}${suffisso}` : c.id) as LoadId,
    casoId: c.casoId,
    astaId: c.astaId as never,
    direzione: { modo },
    sIniziale: s0, sFinale: s1,
    q1: q1 as never, q2: q2 as never,
  });

  const out: Carico[] = [];
  const nulloX = qx1 === 0 && qx2 === 0;
  const nulloY = qy1 === 0 && qy2 === 0;
  // un carico nullo resta nell'elenco: cancellarlo silenziosamente
  // cambierebbe il modello di chi lo ha salvato
  if (nulloX && nulloY) return [fatto(locale ? 'localeOrtogonale' : 'globaleY', 0, 0, '')];

  if (!nulloY) out.push(fatto(locale ? 'localeOrtogonale' : 'globaleY', qy1, qy2, ''));
  if (!nulloX) {
    out.push(fatto(
      locale ? 'localeAssiale' : 'globaleX', qx1, qx2, out.length ? 'x' : '',
    ));
  }
  return out;
}

/**
 * Porta un progetto al formato corrente. È idempotente: applicarla a un
 * progetto già aggiornato non lo tocca.
 */
export function migra(p: Progetto): Progetto {
  const carichi: Carico[] = [];
  let modificato = false;

  // I vincoli salvati prima della convenzione assoluta possono avere angoli
  // fuori intervallo o un `latoDisegno` che oggi non esiste più: si riporta
  // l'angolo in [0°, 360°) e il lato, se valeva «sopra», si riassorbe in
  // mezzo giro — che è esattamente ciò che significava.
  // Restituisce l'oggetto ORIGINALE quando non c'è nulla da cambiare: è ciò
  // che rende la migrazione idempotente, e l'idempotenza è ciò che permette
  // di chiamarla prima di ogni analisi senza allocare un modello nuovo ogni
  // volta.
  const aggiorna = (v: Vincolo): Vincolo => {
    const conLato = v as Vincolo & { latoDisegno?: 'sotto' | 'sopra' };
    const lato = conLato.latoDisegno;
    const atteso = normalizzaAngolo(v.angolo + (lato === 'sopra' ? Math.PI : 0));
    if (lato === undefined && Math.abs(atteso - v.angolo) < 1e-12) return v;
    const { latoDisegno: _via, ...resto } = conLato;
    return { ...resto, angolo: atteso as Radianti };
  };

  const nodi = p.nodi.map((n) => {
    if (!n.vincolo) return n;
    const v = aggiorna(n.vincolo);
    if (v === n.vincolo) return n;
    modificato = true;
    return { ...n, vincolo: v };
  });
  const vincoliSuAsta = (p.vincoliSuAsta ?? []).map((x) => {
    const v = aggiorna(x.vincolo);
    if (v === x.vincolo) return x;
    modificato = true;
    return { ...x, vincolo: v };
  });

  for (const c of p.carichi) {
    if (eVecchioDistribuito(c)) {
      carichi.push(...convertiDistribuito(c as DistribuitoV1));
      modificato = true;
      continue;
    }
    if (c.tipo === 'forzaInCampata' && c.riferimento === undefined) {
      carichi.push({ ...c, riferimento: 'globale' });
      modificato = true;
      continue;
    }
    carichi.push(c);
  }

  if (!modificato && p.versioneFormato === VERSIONE_FORMATO) return p;
  return {
    ...p, versioneFormato: VERSIONE_FORMATO, carichi, nodi,
    ...(p.vincoliSuAsta ? { vincoliSuAsta } : {}),
  };
}

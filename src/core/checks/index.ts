/**
 * Verifiche su tutta la struttura.
 */

import { costruisciIndice, materialeDi, sezioneDi } from '../model/queries.js';
import { MATERIALI } from '../materials/materials.js';
import { SEZIONI } from '../materials/sections.js';
import {
  proprietaDa, type ParametriSezione,
} from '../materials/sezioniParametriche.js';
import type { RisultatoAnalisi } from '../model/results.js';
import type { Materiale, Progetto, Sezione } from '../model/types.js';
import { verificaAsta, type EsitoVerifica, type OpzioniVerifica } from './verifica.js';
import { verificaInstabilita, type EsitoInstabilita } from './instabilita.js';
import { verificaEsercizio, type EsitoEsercizio } from './esercizio.js';

export * from './tensioni.js';
export * from './verifica.js';
export * from './instabilita.js';
export * from './esercizio.js';
export * from './confronto.js';
export * from './coefficiente.js';

export interface EsitoVerifiche {
  perAsta: EsitoVerifica[];
  /** instabilità, solo per le aste compresse */
  instabilita: Map<string, EsitoInstabilita>;
  /** deformabilità in esercizio */
  esercizio: Map<string, EsitoEsercizio>;
  /** asta con lo sfruttamento più alto a resistenza */
  peggiore: EsitoVerifica | null;
  /** asta con lo sfruttamento più alto a instabilità */
  peggioreInstabilita: { astaId: string; esito: EsitoInstabilita } | null;
  /** true se tutte le aste verificano a resistenza */
  tutteVerificate: boolean;
  /** true se tutte le aste compresse verificano a instabilità */
  tutteStabili: boolean;
  /** true se tutte rispettano il limite di freccia */
  tutteInEsercizio: boolean;
  /** aste per cui la verifica non è stata possibile, con il motivo */
  nonVerificabili: { astaId: string; motivo: string }[];
}

/**
 * Ricava i parametri della sezione. Le sezioni definite per misure li portano
 * con sé; per quelle storiche, definite solo da A/I/W, la verifica tensionale
 * non è possibile — servirebbero b(y) e S(y), che da A e I non si ricavano.
 */
function parametriDi(s: Sezione): ParametriSezione | null {
  return s.parametri ?? null;
}

export function verificaStruttura(
  progetto: Progetto,
  risultato: RisultatoAnalisi,
  opzioni: OpzioniVerifica & {
    materialiExtra?: Materiale[]; sezioniExtra?: Sezione[]; limiteFreccia?: number;
  } = {},
): EsitoVerifiche {
  const idx = costruisciIndice(
    progetto,
    [...MATERIALI, ...(opzioni.materialiExtra ?? [])],
    [...SEZIONI, ...(opzioni.sezioniExtra ?? [])],
  );

  const perAsta: EsitoVerifica[] = [];
  const instabilita = new Map<string, EsitoInstabilita>();
  const esercizio = new Map<string, EsitoEsercizio>();
  const nonVerificabili: { astaId: string; motivo: string }[] = [];

  for (const risAsta of risultato.aste) {
    const asta = idx.aste.get(risAsta.astaId);
    if (!asta) continue;
    let materiale: Materiale;
    let sezione: Sezione;
    try {
      materiale = materialeDi(asta, idx);
      sezione = sezioneDi(asta, idx);
    } catch (e) {
      nonVerificabili.push({
        astaId: risAsta.astaId as string, motivo: (e as Error).message,
      });
      continue;
    }

    const parametri = parametriDi(sezione);
    if (!parametri) {
      nonVerificabili.push({
        astaId: risAsta.astaId as string,
        motivo: `La sezione "${sezione.nome}" non è definita per misure: la ` +
          'verifica tensionale richiede la larghezza b(y) e il momento statico ' +
          'S(y) lungo l\'altezza, che da A e I non si ricavano.',
      });
      continue;
    }

    const prop = proprietaDa(parametri);
    const id = risAsta.astaId as string;
    perAsta.push(verificaAsta(
      id, risAsta, parametri, { A: prop.A, I: prop.I }, materiale, opzioni,
    ));

    // instabilità: interessa solo le aste compresse, ma va valutata SEMPRE,
    // perché è l'unica verifica che può fallire mentre la resistenza passa
    const Nmin = Math.min(...risAsta.N);
    if (Nmin < 0) {
      instabilita.set(id, verificaInstabilita({
        Nmin, lunghezza: risAsta.lunghezza,
        A: prop.A, I: prop.I, i: prop.i,
        beta: asta.betaInstabilita ?? 1,
        materiale,
      }));
    }

    esercizio.set(id, verificaEsercizio(
      id, risAsta, opzioni.limiteFreccia ?? progetto.impostazioni.limiteFreccia,
    ));
  }

  const peggiore = perAsta.reduce<EsitoVerifica | null>(
    (best, v) => (best === null || v.sfruttamento > best.sfruttamento ? v : best),
    null,
  );

  let peggioreInstabilita: { astaId: string; esito: EsitoInstabilita } | null = null;
  for (const [astaId, esito] of instabilita) {
    if (!peggioreInstabilita || esito.sfruttamento > peggioreInstabilita.esito.sfruttamento) {
      peggioreInstabilita = { astaId, esito };
    }
  }

  return {
    perAsta, instabilita, esercizio, peggiore, peggioreInstabilita,
    tutteVerificate: perAsta.every((v) => v.verificato),
    tutteStabili: [...instabilita.values()].every((v) => v.verificato),
    tutteInEsercizio: [...esercizio.values()].every((v) => v.verificato),
    nonVerificabili,
  };
}

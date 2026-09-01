/**
 * CONTROLLO DI INTEGRITÀ DEL MODELLO.
 *
 * Un modello è integro quando ogni riferimento punta a qualcosa che esiste.
 * Sembra ovvio, e proprio per questo non veniva mai controllato: un vincolo
 * posato su un'asta cancellata resta nel modello, non si disegna — il
 * renderer non trova l'asta e passa oltre — e quindi non c'è modo di
 * accorgersene guardando. Poi arriva un'asta nuova con quell'id, e il vincolo
 * ricompare su una struttura in cui nessuno l'ha messo.
 *
 * Da qui la regola: le anomalie si RIMUOVONO, ma si SEGNALANO sempre. Correggere
 * in silenzio sarebbe peggio del bug, perché toglierebbe all'utente l'unica
 * occasione di capire che il suo modello conteneva qualcosa di non voluto.
 *
 * La funzione è pura: non tocca il modello che riceve, ne restituisce uno
 * ripulito. Va eseguita dopo ogni operazione di editing e prima di ogni
 * analisi.
 */

import { gruppiSconnessione, partizioneNonRappresentabile } from './partizione.js';
import type { ElementId, NodeId, Progetto } from './types.js';

export type GenereAnomalia =
  | 'vincoloSuAstaOrfano'
  | 'sconnessioneOrfana'
  | 'vincoloInternoOrfano'
  | 'caricoOrfano'
  | 'astaOrfana'
  | 'astaDegenere'
  | 'sezioneInesistente'
  | 'materialeInesistente'
  | 'nodiCoincidenti'
  | 'partizioneNonRappresentabile';

export interface Anomalia {
  genere: GenereAnomalia;
  /** id dell'entità colpevole */
  id: string;
  /** riferimento che non si risolve */
  riferimento: string;
  /** frase pronta per il pannello diagnostico */
  messaggio: string;
  /** true se l'entità è stata tolta dal modello */
  rimossa: boolean;
}

export interface EsitoIntegrita {
  progetto: Progetto;
  anomalie: Anomalia[];
  /** true se non c'era niente da correggere: il caso normale */
  integro: boolean;
}

/** Distanza sotto la quale due nodi sono lo stesso punto [m]. */
const TOLLERANZA_COINCIDENZA = 1e-9;

export function verificaIntegrita(p: Progetto): EsitoIntegrita {
  const anomalie: Anomalia[] = [];
  const nodi = new Set<string>(p.nodi.map((n) => n.id as string));

  // ── 1. aste che pendono da nodi inesistenti ──
  // vanno per prime: un'asta rimossa qui rende orfano ciò che vi era posato,
  // e quel controllo viene dopo, quindi la cascata si chiude in una passata
  const asteValide = p.aste.filter((a) => {
    const i = nodi.has(a.nodoIniziale as string);
    const j = nodi.has(a.nodoFinale as string);
    if (i && j) return true;
    anomalie.push({
      genere: 'astaOrfana',
      id: a.id as string,
      riferimento: (i ? a.nodoFinale : a.nodoIniziale) as string,
      messaggio: `Asta ${a.id as string}: il nodo `
        + `${(i ? a.nodoFinale : a.nodoIniziale) as string} non esiste.`,
      rimossa: true,
    });
    return false;
  });
  const aste = new Set<string>(asteValide.map((a) => a.id as string));

  // ── 2. vincoli posati su aste inesistenti ──
  const vincoliSuAsta = (p.vincoliSuAsta ?? []).filter((v) => {
    if (aste.has(v.astaId as string)) return true;
    anomalie.push({
      genere: 'vincoloSuAstaOrfano',
      id: v.id,
      riferimento: v.astaId as string,
      messaggio: `Vincolo ${v.id} (${v.vincolo.tipo}) posato sull'asta `
        + `${v.astaId as string}, che non esiste.`,
      rimossa: true,
    });
    return false;
  });

  // ── 3. sconnessioni su aste inesistenti ──
  const sconnessioni = (p.sconnessioni ?? []).filter((x) => {
    if (aste.has(x.astaId as string)) return true;
    anomalie.push({
      genere: 'sconnessioneOrfana',
      id: x.id,
      riferimento: x.astaId as string,
      messaggio: `Sconnessione ${x.id} (${x.tipo}) sull'asta `
        + `${x.astaId as string}, che non esiste.`,
      rimossa: true,
    });
    return false;
  });

  // ── 4. sconnessioni nodali su nodi inesistenti ──
  const vincoliInterni = (p.vincoliInterni ?? []).flatMap((v) => {
    if (!nodi.has(v.nodoId as string)) {
      anomalie.push({
        genere: 'vincoloInternoOrfano',
        id: v.id,
        riferimento: v.nodoId as string,
        messaggio: `Sconnessione interna ${v.id} (${v.tipo}) sul nodo `
          + `${v.nodoId as string}, che non esiste.`,
        rimossa: true,
      });
      return [];
    }
    // il nodo c'è, ma le aste citate possono non esserci più
    const master = v.astaMaster && !aste.has(v.astaMaster as string)
      ? undefined : v.astaMaster;
    const svincolate = v.asteSvincolate?.filter((a) => aste.has(a as string));
    if (master === v.astaMaster
        && (svincolate?.length ?? 0) === (v.asteSvincolate?.length ?? 0)) {
      return [v];
    }
    anomalie.push({
      genere: 'vincoloInternoOrfano',
      id: v.id,
      riferimento: (v.astaMaster ?? '') as string,
      messaggio: `Sconnessione interna ${v.id}: alcune aste citate non esistono `
        + 'più; il riferimento è stato ripulito.',
      rimossa: false,
    });
    return [{
      ...v,
      ...(master ? { astaMaster: master } : { astaMaster: undefined }),
      ...(svincolate ? { asteSvincolate: svincolate } : {}),
    }];
  });

  // ── 5. carichi appesi al nulla ──
  const carichi = p.carichi.filter((c) => {
    const rif = 'nodoId' in c ? (c.nodoId as string)
      : 'astaId' in c ? (c.astaId as string) : null;
    if (rif === null) return true;
    const esiste = 'nodoId' in c ? nodi.has(rif) : aste.has(rif);
    if (esiste) return true;
    anomalie.push({
      genere: 'caricoOrfano',
      id: c.id as string,
      riferimento: rif,
      messaggio: `Carico ${c.id as string} (${c.tipo}) applicato a ${rif}, `
        + 'che non esiste.',
      rimossa: true,
    });
    return false;
  });

  // ── 6. sezioni e materiali assegnati a definizioni inesistenti ──
  // non si rimuove l'asta: si segnala e basta, perché il rimedio è assegnare
  // una sezione, non buttare la geometria
  const sezioniNote = new Set<string>(
    p.sezioniPersonalizzate.map((x) => x.id as unknown as string));
  const materialiNoti = new Set<string>(
    p.materialiPersonalizzati.map((x) => x.id as unknown as string));
  for (const a of asteValide) {
    if (a.sezioneSpecifica && !sezioniNote.has(a.sezioneId as string)
        && !(a.sezioneId as string).match(/^(IPE|HE[AB])/)) {
      anomalie.push({
        genere: 'sezioneInesistente', id: a.id as string,
        riferimento: a.sezioneId as string,
        messaggio: `Asta ${a.id as string}: la sezione ${a.sezioneId as string} `
          + 'non è definita nel modello.',
        rimossa: false,
      });
    }
    if (a.materialeSpecifico && !materialiNoti.has(a.materialeId as string)
        && !(a.materialeId as string).match(/^(S\d|AL|ACCIAIO|LEGNO|CLS|GHISA|TITANIO|INOX)/)) {
      anomalie.push({
        genere: 'materialeInesistente', id: a.id as string,
        riferimento: a.materialeId as string,
        messaggio: `Asta ${a.id as string}: il materiale `
          + `${a.materialeId as string} non è definito nel modello.`,
        rimossa: false,
      });
    }
  }

  // ── 6b. partizioni che il meccanismo di rilascio non sa rappresentare ──
  for (const v of vincoliInterni) {
    const convergenti = asteValide
      .filter((a) => a.nodoIniziale === v.nodoId || a.nodoFinale === v.nodoId)
      .map((a) => a.id);
    const gruppi = gruppiSconnessione(v, convergenti);
    if (!partizioneNonRappresentabile(gruppi)) continue;
    anomalie.push({
      genere: 'partizioneNonRappresentabile',
      id: v.id,
      riferimento: v.nodoId as string,
      messaggio: `Sconnessione ${v.id}: due o più gruppi con più di un'asta. `
        + 'Il rilascio degli estremi sa tenerne saldato uno solo, quindi il '
        + 'conteggio userebbe il gruppo più numeroso.',
      rimossa: false,
    });
  }

  // ── 7. nodi coincidenti non fusi ──
  // solo segnalazione: fonderli qui cambierebbe la topologia senza che
  // l'utente l'abbia chiesto, e la fusione ha già il suo posto in normalizza()
  for (let i = 0; i < p.nodi.length; i++) {
    for (let j = i + 1; j < p.nodi.length; j++) {
      const a = p.nodi[i], b = p.nodi[j];
      if (Math.hypot(a.x - b.x, a.y - b.y) > TOLLERANZA_COINCIDENZA) continue;
      anomalie.push({
        genere: 'nodiCoincidenti', id: a.id as string, riferimento: b.id as string,
        messaggio: `I nodi ${a.id as string} e ${b.id as string} occupano lo `
          + 'stesso punto e non sono fusi.',
        rimossa: false,
      });
    }
  }

  if (anomalie.length === 0) return { progetto: p, anomalie, integro: true };

  return {
    progetto: {
      ...p,
      aste: asteValide,
      vincoliSuAsta,
      sconnessioni,
      vincoliInterni,
      carichi,
    },
    anomalie,
    integro: false,
  };
}

/**
 * §4.1 — quanti vincoli contiene il modello, contando TUTTE E QUATTRO le
 * famiglie.
 *
 * L'elenco dell'interfaccia si costruisce da qui, e non da una lista propria:
 * è così che il numero di righe non può divergere dal modello. Un elenco che
 * ne enumerasse solo tre — com'era, senza i vincoli sui nodi né le
 * sconnessioni nodali — lascerebbe fuori vincoli che si possono inserire e
 * non si possono più selezionare né togliere.
 */
export function contaVincoli(p: Progetto): {
  suNodo: number; inCampata: number; sconnessioniInCampata: number;
  sconnessioniNodali: number; totale: number;
} {
  const suNodo = p.nodi.filter((n) => n.vincolo).length;
  const inCampata = (p.vincoliSuAsta ?? []).length;
  const sconnessioniInCampata = (p.sconnessioni ?? []).length;
  const sconnessioniNodali = (p.vincoliInterni ?? []).length;
  return {
    suNodo, inCampata, sconnessioniInCampata, sconnessioniNodali,
    totale: suNodo + inCampata + sconnessioniInCampata + sconnessioniNodali,
  };
}

/** Riferimenti pendenti, senza toccare il modello: per i test e la diagnostica. */
export function contaOrfani(p: Progetto): number {
  return verificaIntegrita(p).anomalie.filter((a) => a.rimossa).length;
}

export type { NodeId, ElementId };

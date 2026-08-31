/**
 * Command pattern per undo/redo illimitato.
 *
 * Ogni comando sa applicarsi E annullarsi. Cattura alla costruzione tutto ciò
 * che serve per invertirsi (p.es. l'eliminazione conserva gli oggetti
 * rimossi), quindi l'annullamento non richiede istantanee dell'intero modello:
 * la cronologia resta leggera anche su strutture grandi e con migliaia di
 * passi.
 *
 * I comandi sono PURI: ricevono un progetto e ne restituiscono uno nuovo.
 * Nessuna mutazione in luogo, così React vede sempre riferimenti nuovi.
 */

import type {
  Asta, Carico, CaricoDati, ElementId, LoadCaseId, LoadId, NodeId, Nodo,
  Materiale, Progetto, SconnessioneSuAsta, Sezione, Vincolo, VincoloInterno,
  VincoloSuAsta,
} from '../core/model/types.js';
import {
  nuovoIdAsta, nuovoIdCarico, nuovoIdNodo, nuovoIdSconnessione,
  nuovoIdVincoloInterno, nuovoIdVincoloSuAsta, registraId,
} from './ids.js';
import {
  sezioneDaParametri, type ParametriSezione,
} from '../core/materials/sezioniParametriche.js';
import { ridistribuisci, type TrattoDiAsta } from '../core/model/espansione.js';
import { normalizzaAngolo, ribalta } from '../core/model/orientamento.js';

export interface Comando {
  etichetta: string;
  esegui(p: Progetto): Progetto;
  annulla(p: Progetto): Progetto;
}

const senzaNodi = (p: Progetto, ids: Set<string>): Nodo[] =>
  p.nodi.filter((n) => !ids.has(n.id as string));
const senzaAste = (p: Progetto, ids: Set<string>): Asta[] =>
  p.aste.filter((a) => !ids.has(a.id as string));

/**
 * DIPENDENTI DI NODI E ASTE.
 *
 * Un vincolo posato su un'asta, una sconnessione, una sconnessione nodale e i
 * carichi non esistono per conto loro: esistono PERCHÉ esiste il nodo o l'asta
 * che li porta. Toglierli separatamente sarebbe una scelta; lasciarli indietro
 * non lo è — diventano entità orfane che puntano a id spariti, invisibili
 * perché il disegno non trova più il portante, e pronte a riagganciarsi alla
 * prima geometria che riceva quello stesso id.
 *
 * Da qui passano tutte le rimozioni di geometria, così la cascata è una sola
 * e non va ricordata caso per caso.
 */
export interface Dipendenti {
  carichi: Carico[];
  vincoliSuAsta: VincoloSuAsta[];
  sconnessioni: SconnessioneSuAsta[];
  vincoliInterni: VincoloInterno[];
}

function dipendentiDi(
  p: Progetto, nodi: Set<string>, aste: Set<string>,
): Dipendenti {
  return {
    carichi: p.carichi.filter((c) => {
      if ('nodoId' in c) return nodi.has(c.nodoId as string);
      if ('astaId' in c) return aste.has(c.astaId as string);
      return false;
    }),
    vincoliSuAsta: (p.vincoliSuAsta ?? []).filter((v) => aste.has(v.astaId as string)),
    sconnessioni: (p.sconnessioni ?? []).filter((x) => aste.has(x.astaId as string)),
    vincoliInterni: (p.vincoliInterni ?? []).filter((v) => nodi.has(v.nodoId as string)),
  };
}

/** Il progetto senza i dipendenti indicati, in una sola passata. */
function senzaDipendenti(p: Progetto, d: Dipendenti): Progetto {
  const idc = new Set(d.carichi.map((x) => x.id as string));
  const idv = new Set(d.vincoliSuAsta.map((x) => x.id));
  const ids = new Set(d.sconnessioni.map((x) => x.id));
  const idi = new Set(d.vincoliInterni.map((x) => x.id));
  return {
    ...p,
    carichi: p.carichi.filter((x) => !idc.has(x.id as string)),
    vincoliSuAsta: (p.vincoliSuAsta ?? []).filter((x) => !idv.has(x.id)),
    sconnessioni: (p.sconnessioni ?? []).filter((x) => !ids.has(x.id)),
    vincoliInterni: (p.vincoliInterni ?? []).filter((x) => !idi.has(x.id)),
  };
}

/** I dipendenti rimessi al loro posto, per l'annullamento. */
function conDipendenti(p: Progetto, d: Dipendenti): Progetto {
  return {
    ...p,
    carichi: [...p.carichi, ...d.carichi],
    vincoliSuAsta: [...(p.vincoliSuAsta ?? []), ...d.vincoliSuAsta],
    sconnessioni: [...(p.sconnessioni ?? []), ...d.sconnessioni],
    vincoliInterni: [...(p.vincoliInterni ?? []), ...d.vincoliInterni],
  };
}

// ══════════════════════════════ GEOMETRIA ══════════════════════════════

export function aggiungiNodo(x: number, y: number): Comando & { id?: NodeId } {
  let id: NodeId | undefined;
  return {
    etichetta: 'aggiungi nodo',
    get id() { return id; },
    esegui(p) {
      id = id ?? nuovoIdNodo(p);
      return { ...registraId(p, id), nodi: [...p.nodi, { id, x: x as never, y: y as never }] };
    },
    annulla(p) {
      return { ...p, nodi: senzaNodi(p, new Set([id as string])) };
    },
  };
}

export function aggiungiAsta(
  nodoIniziale: NodeId, nodoFinale: NodeId,
  materialeId: string, sezioneId: string,
): Comando & { id?: ElementId } {
  let id: ElementId | undefined;
  return {
    etichetta: 'aggiungi asta',
    get id() { return id; },
    esegui(p) {
      id = id ?? nuovoIdAsta(p);
      const asta: Asta = {
        id,
        nodoIniziale, nodoFinale,
        materialeId: materialeId as Asta['materialeId'],
        sezioneId: sezioneId as Asta['sezioneId'],
        svincolo: {
          iniziale: { N: false, T: false, M: false },
          finale: { N: false, T: false, M: false },
        },
      };
      return { ...registraId(p, id as string), aste: [...p.aste, asta] };
    },
    annulla(p) {
      return { ...p, aste: senzaAste(p, new Set([id as string])) };
    },
  };
}

/**
 * Estrusione: crea in un colpo solo il nodo di arrivo e l'asta che lo collega.
 * È un comando unico e non due, perché all'annullamento l'utente si aspetta
 * che sparisca l'intera estrusione, non solo metà.
 */
export function estrudi(
  daNodo: NodeId, x: number, y: number, materialeId: string, sezioneId: string,
): Comando & { idNodo?: NodeId; idAsta?: ElementId } {
  let idNodo: NodeId | undefined;
  let idAsta: ElementId | undefined;
  return {
    etichetta: 'estrudi',
    get idNodo() { return idNodo; },
    get idAsta() { return idAsta; },
    esegui(p) {
      idNodo = idNodo ?? nuovoIdNodo(p);
      idAsta = idAsta ?? nuovoIdAsta(p);
      const asta: Asta = {
        id: idAsta, nodoIniziale: daNodo, nodoFinale: idNodo,
        materialeId: materialeId as Asta['materialeId'],
        sezioneId: sezioneId as Asta['sezioneId'],
        svincolo: {
          iniziale: { N: false, T: false, M: false },
          finale: { N: false, T: false, M: false },
        },
      };
      return {
        ...registraId(p, idNodo as string, idAsta as string),
        nodi: [...p.nodi, { id: idNodo, x: x as never, y: y as never }],
        aste: [...p.aste, asta],
      };
    },
    annulla(p) {
      return {
        ...p,
        nodi: senzaNodi(p, new Set([idNodo as string])),
        aste: senzaAste(p, new Set([idAsta as string])),
      };
    },
  };
}

/** Trasformazione geometrica generica: sposta, ruota, scala. */
export function trasformaNodi(
  ids: readonly NodeId[],
  nuovePosizioni: ReadonlyMap<NodeId, { x: number; y: number }>,
  etichetta: string,
  posizioniPrecedenti: ReadonlyMap<NodeId, { x: number; y: number }>,
): Comando {
  const applica = (p: Progetto, pos: ReadonlyMap<NodeId, { x: number; y: number }>) => ({
    ...p,
    nodi: p.nodi.map((n) => {
      const q = pos.get(n.id);
      return q ? { ...n, x: q.x as never, y: q.y as never } : n;
    }),
  });
  return {
    etichetta,
    esegui: (p) => applica(p, nuovePosizioni),
    annulla: (p) => applica(p, posizioniPrecedenti),
  };
}

/**
 * Eliminazione. Le aste che perdono un nodo vengono eliminate anche se non
 * erano selezionate — un'asta senza estremità non è un oggetto valido — e i
 * carichi che vi si riferiscono con esse. Tutto viene conservato per l'undo.
 */
export function elimina(nodiIds: readonly NodeId[], asteIds: readonly ElementId[]): Comando {
  let nodiRimossi: Nodo[] = [];
  let asteRimosse: Asta[] = [];
  let dipendenti: Dipendenti = {
    carichi: [], vincoliSuAsta: [], sconnessioni: [], vincoliInterni: [],
  };
  return {
    etichetta: 'elimina',
    esegui(p) {
      const insiemeNodi = new Set<string>(nodiIds as readonly string[]);
      const insiemeAste = new Set<string>(asteIds as readonly string[]);
      // un'asta senza uno dei suoi estremi non è un'asta: se ne va anche lei,
      // e con lei tutto ciò che vi era appoggiato
      for (const a of p.aste) {
        if (insiemeNodi.has(a.nodoIniziale as string) || insiemeNodi.has(a.nodoFinale as string)) {
          insiemeAste.add(a.id as string);
        }
      }
      nodiRimossi = p.nodi.filter((n) => insiemeNodi.has(n.id as string));
      asteRimosse = p.aste.filter((a) => insiemeAste.has(a.id as string));
      dipendenti = dipendentiDi(p, insiemeNodi, insiemeAste);

      return {
        ...senzaDipendenti(p, dipendenti),
        nodi: senzaNodi(p, insiemeNodi),
        aste: senzaAste(p, insiemeAste),
      };
    },
    annulla(p) {
      return {
        ...conDipendenti(p, dipendenti),
        nodi: [...p.nodi, ...nodiRimossi],
        aste: [...p.aste, ...asteRimosse],
      };
    },
  };
}

/**
 * SVUOTAMENTO TOTALE.
 *
 * Quando la selezione copre tutto il modello non si itera sulle entità: si
 * mette al suo posto un modello vuoto. Iterando basterebbe una collezione
 * dimenticata perché qualcosa sopravvivesse, e «elimina tutto» che lascia
 * indietro qualcosa è il modo più diretto di falsare un'analisi.
 *
 * Sopravvivono il contatore degli id — altrimenti la geometria nuova
 * riceverebbe gli id di quella vecchia — le impostazioni, i casi di carico e
 * la libreria di materiali e sezioni, che l'utente ha definito e non ha
 * chiesto di buttare.
 */
export function svuotaModello(): Comando {
  let precedente: Progetto | null = null;
  return {
    etichetta: 'elimina tutto',
    esegui(p) {
      precedente = p;
      return {
        ...p,
        nodi: [],
        aste: [],
        vincoliInterni: [],
        vincoliSuAsta: [],
        sconnessioni: [],
        carichi: [],
      };
    },
    annulla() {
      return precedente!;
    },
  };
}

/** Duplicazione con scostamento; restituisce anche la corrispondenza vecchio→nuovo. */
export function duplica(
  nodiIds: readonly NodeId[], asteIds: readonly ElementId[],
  dx: number, dy: number,
): Comando & { mappaNodi: Map<NodeId, NodeId>; nuoveAste: ElementId[] } {
  const mappaNodi = new Map<NodeId, NodeId>();
  const nuoveAste: ElementId[] = [];
  let fatto = false;
  return {
    etichetta: 'duplica',
    mappaNodi, nuoveAste,
    esegui(p) {
      if (!fatto) {
        mappaNodi.clear(); nuoveAste.length = 0;
        nodiIds.forEach((vecchio, k) => {
          mappaNodi.set(vecchio, nuovoIdNodo(p, k));
        });
        asteIds.forEach((_, k) => nuoveAste.push(nuovoIdAsta(p, k)));
        fatto = true;
      }
      const originali = new Map(p.nodi.map((n) => [n.id, n]));
      const nuoviNodi: Nodo[] = [];
      for (const vecchio of nodiIds) {
        const n = originali.get(vecchio);
        if (!n) continue;
        nuoviNodi.push({
          ...n, id: mappaNodi.get(vecchio)!,
          x: (n.x + dx) as never, y: (n.y + dy) as never,
        });
      }
      const asteOriginali = new Map(p.aste.map((a) => [a.id, a]));
      const nuove: Asta[] = [];
      asteIds.forEach((vecchia, k) => {
        const a = asteOriginali.get(vecchia);
        if (!a) return;
        const i = mappaNodi.get(a.nodoIniziale);
        const j = mappaNodi.get(a.nodoFinale);
        // si duplicano solo le aste i cui DUE estremi sono nella selezione
        if (!i || !j) return;
        nuove.push({ ...a, id: nuoveAste[k], nodoIniziale: i, nodoFinale: j });
      });
      return {
        ...registraId(p, ...[...mappaNodi.values()] as string[], ...nuoveAste as string[]),
        nodi: [...p.nodi, ...nuoviNodi],
        aste: [...p.aste, ...nuove],
      };
    },
    annulla(p) {
      return {
        ...p,
        nodi: senzaNodi(p, new Set<string>([...mappaNodi.values()] as string[])),
        aste: senzaAste(p, new Set<string>(nuoveAste as string[])),
      };
    },
  };
}

// ══════════════════════════════ PROPRIETÀ ══════════════════════════════

export function modificaAste(
  ids: readonly ElementId[], patch: Partial<Asta>,
): Comando {
  let precedenti: Map<string, Asta> = new Map();
  return {
    etichetta: 'modifica aste',
    esegui(p) {
      const insieme = new Set<string>(ids as readonly string[]);
      precedenti = new Map(
        p.aste.filter((a) => insieme.has(a.id as string)).map((a) => [a.id as string, a]),
      );
      return {
        ...p,
        aste: p.aste.map((a) => (insieme.has(a.id as string) ? { ...a, ...patch, id: a.id } : a)),
      };
    },
    annulla(p) {
      return { ...p, aste: p.aste.map((a) => precedenti.get(a.id as string) ?? a) };
    },
  };
}

export function impostaVincolo(
  nodiIds: readonly NodeId[], vincolo: Vincolo | undefined,
): Comando {
  let precedenti: Map<string, Vincolo | undefined> = new Map();
  return {
    etichetta: vincolo ? `vincolo ${vincolo.tipo}` : 'rimuovi vincolo',
    esegui(p) {
      const insieme = new Set<string>(nodiIds as readonly string[]);
      precedenti = new Map(
        p.nodi.filter((n) => insieme.has(n.id as string))
          .map((n) => [n.id as string, n.vincolo]),
      );
      return {
        ...p,
        nodi: p.nodi.map((n) => {
          if (!insieme.has(n.id as string)) return n;
          const { vincolo: _vecchio, ...resto } = n;
          return vincolo ? { ...resto, vincolo } : resto;
        }),
      };
    },
    annulla(p) {
      return {
        ...p,
        nodi: p.nodi.map((n) => {
          if (!precedenti.has(n.id as string)) return n;
          const v = precedenti.get(n.id as string);
          const { vincolo: _vecchio, ...resto } = n;
          return v ? { ...resto, vincolo: v } : resto;
        }),
      };
    },
  };
}

export function rinominaProgetto(nome: string): Comando {
  let precedente = '';
  return {
    etichetta: 'rinomina progetto',
    esegui(p) { precedente = p.nome; return { ...p, nome }; },
    annulla(p) { return { ...p, nome: precedente }; },
  };
}


// ══════════════════════════════ CARICHI ══════════════════════════════

export function aggiungiCarico(dati: CaricoDati, casoId: LoadCaseId): Comando & { id?: LoadId } {
  let id: LoadId | undefined;
  return {
    etichetta: `aggiungi ${dati.tipo}`,
    get id() { return id; },
    esegui(p) {
      id = id ?? nuovoIdCarico(p);
      return {
        ...registraId(p, id as string),
        carichi: [...p.carichi, { ...dati, id, casoId } as Carico],
      };
    },
    annulla(p) {
      return { ...p, carichi: p.carichi.filter((c) => (c.id as string) !== (id as string)) };
    },
  };
}

export function modificaCarico(id: LoadId, patch: Partial<CaricoDati>): Comando {
  let precedente: Carico | undefined;
  return {
    etichetta: 'modifica carico',
    esegui(p) {
      precedente = p.carichi.find((c) => c.id === id);
      return {
        ...p,
        carichi: p.carichi.map((c) =>
          c.id === id ? ({ ...c, ...patch, id: c.id, casoId: c.casoId } as Carico) : c),
      };
    },
    annulla(p) {
      return {
        ...p,
        carichi: p.carichi.map((c) => (c.id === id && precedente ? precedente : c)),
      };
    },
  };
}

export function eliminaCarichi(ids: readonly LoadId[]): Comando {
  let rimossi: Carico[] = [];
  return {
    etichetta: 'elimina carichi',
    esegui(p) {
      const insieme = new Set<string>(ids as readonly string[]);
      rimossi = p.carichi.filter((c) => insieme.has(c.id as string));
      return { ...p, carichi: p.carichi.filter((c) => !insieme.has(c.id as string)) };
    },
    annulla(p) {
      return { ...p, carichi: [...p.carichi, ...rimossi] };
    },
  };
}

/**
 * Casi di carico. Eliminandone uno spariscono i suoi carichi: lasciarli
 * orfani produrrebbe un modello che si analizza senza errori ma con carichi
 * invisibili, che è il tipo di bug peggiore.
 */
export function aggiungiCaso(
  id: string, nome: string, natura: Progetto['casi'][number]['natura'],
): Comando {
  return {
    etichetta: 'aggiungi caso di carico',
    esegui(p) {
      if (p.casi.some((c) => (c.id as string) === id)) return p;
      return { ...p, casi: [...p.casi, { id: id as LoadCaseId, nome, natura }] };
    },
    annulla(p) {
      return { ...p, casi: p.casi.filter((c) => (c.id as string) !== id) };
    },
  };
}

export function eliminaCaso(id: LoadCaseId): Comando {
  let caso: Progetto['casi'][number] | undefined;
  let carichi: Carico[] = [];
  let posizione = 0;
  return {
    etichetta: 'elimina caso di carico',
    esegui(p) {
      posizione = p.casi.findIndex((c) => c.id === id);
      caso = p.casi[posizione];
      carichi = p.carichi.filter((c) => c.casoId === id);
      return {
        ...p,
        casi: p.casi.filter((c) => c.id !== id),
        carichi: p.carichi.filter((c) => c.casoId !== id),
        combinazioni: p.combinazioni.map((k) => ({
          ...k, termini: k.termini.filter((t) => t.casoId !== id),
        })),
      };
    },
    annulla(p) {
      if (!caso) return p;
      const casi = [...p.casi];
      casi.splice(posizione, 0, caso);
      return { ...p, casi, carichi: [...p.carichi, ...carichi] };
    },
  };
}


// ══════════════════════════════ SEZIONI ══════════════════════════════

/**
 * Le sezioni parametriche vivono in `sezioniPersonalizzate` del progetto.
 * Modificare una misura ricalcola A, I, W: le proprietà non sono mai
 * modificabili direttamente, così non possono divergere dalle misure.
 */
export function aggiungiSezione(
  parametri: ParametriSezione, id: string, nome?: string,
): Comando & { id: string } {
  return {
    etichetta: 'aggiungi sezione',
    id,
    esegui(p) {
      if (p.sezioniPersonalizzate.some((s) => (s.id as string) === id)) return p;
      return {
        ...p,
        sezioniPersonalizzate: [
          ...p.sezioniPersonalizzate, sezioneDaParametri(parametri, id, nome),
        ],
      };
    },
    annulla(p) {
      return {
        ...p,
        sezioniPersonalizzate: p.sezioniPersonalizzate.filter(
          (s) => (s.id as string) !== id,
        ),
      };
    },
  };
}

export function modificaSezione(
  id: string, parametri: ParametriSezione, nome?: string,
): Comando {
  let precedente: Sezione | undefined;
  return {
    etichetta: 'modifica sezione',
    esegui(p) {
      precedente = p.sezioniPersonalizzate.find((s) => (s.id as string) === id);
      return {
        ...p,
        sezioniPersonalizzate: p.sezioniPersonalizzate.map((s) =>
          (s.id as string) === id
            ? sezioneDaParametri(parametri, id, nome ?? s.nome)
            : s),
      };
    },
    annulla(p) {
      if (!precedente) return p;
      return {
        ...p,
        sezioniPersonalizzate: p.sezioniPersonalizzate.map((s) =>
          (s.id as string) === id ? precedente! : s),
      };
    },
  };
}

/**
 * Eliminare una sezione usata da qualche asta lascerebbe il modello in uno
 * stato non analizzabile: le aste vengono riassegnate alla sezione indicata.
 */
export function eliminaSezione(id: string, sostituto: string): Comando {
  let rimossa: Sezione | undefined;
  let posizione = 0;
  let riassegnate: ElementId[] = [];
  return {
    etichetta: 'elimina sezione',
    esegui(p) {
      posizione = p.sezioniPersonalizzate.findIndex((s) => (s.id as string) === id);
      rimossa = p.sezioniPersonalizzate[posizione];
      riassegnate = p.aste.filter((a) => (a.sezioneId as string) === id).map((a) => a.id);
      const insieme = new Set<string>(riassegnate as readonly string[]);
      return {
        ...p,
        sezioniPersonalizzate: p.sezioniPersonalizzate.filter(
          (s) => (s.id as string) !== id,
        ),
        aste: p.aste.map((a) =>
          insieme.has(a.id as string)
            ? { ...a, sezioneId: sostituto as Asta['sezioneId'] }
            : a),
      };
    },
    annulla(p) {
      if (!rimossa) return p;
      const sezioni = [...p.sezioniPersonalizzate];
      sezioni.splice(posizione, 0, rimossa);
      const insieme = new Set<string>(riassegnate as readonly string[]);
      return {
        ...p,
        sezioniPersonalizzate: sezioni,
        aste: p.aste.map((a) =>
          insieme.has(a.id as string)
            ? { ...a, sezioneId: id as Asta['sezioneId'] }
            : a),
      };
    },
  };
}


// ══════════════════════════════ MATERIALI ══════════════════════════════

/**
 * I materiali personalizzati vivono in `materialiPersonalizzati` e hanno la
 * precedenza sulla libreria a parità di id. È il modo per usare un acciaio di
 * cui si conosce solo lo snervamento, o per calibrare un materiale su un
 * certificato di prova.
 */
export function aggiungiMateriale(m: Materiale): Comando {
  return {
    etichetta: 'aggiungi materiale',
    esegui(p) {
      if (p.materialiPersonalizzati.some((x) => x.id === m.id)) return p;
      return { ...p, materialiPersonalizzati: [...p.materialiPersonalizzati, m] };
    },
    annulla(p) {
      return {
        ...p,
        materialiPersonalizzati: p.materialiPersonalizzati.filter((x) => x.id !== m.id),
      };
    },
  };
}

export function modificaMateriale(id: string, patch: Partial<Materiale>): Comando {
  let precedente: Materiale | undefined;
  return {
    etichetta: 'modifica materiale',
    esegui(p) {
      precedente = p.materialiPersonalizzati.find((x) => (x.id as string) === id);
      return {
        ...p,
        materialiPersonalizzati: p.materialiPersonalizzati.map((x) =>
          (x.id as string) === id
            ? { ...x, ...patch, id: x.id, resistenze: { ...x.resistenze, ...patch.resistenze } }
            : x),
      };
    },
    annulla(p) {
      if (!precedente) return p;
      return {
        ...p,
        materialiPersonalizzati: p.materialiPersonalizzati.map((x) =>
          (x.id as string) === id ? precedente! : x),
      };
    },
  };
}

export function eliminaMateriale(id: string, sostituto: string): Comando {
  let rimosso: Materiale | undefined;
  let posizione = 0;
  let riassegnate: ElementId[] = [];
  return {
    etichetta: 'elimina materiale',
    esegui(p) {
      posizione = p.materialiPersonalizzati.findIndex((x) => (x.id as string) === id);
      rimosso = p.materialiPersonalizzati[posizione];
      riassegnate = p.aste.filter((a) => (a.materialeId as string) === id).map((a) => a.id);
      const insieme = new Set<string>(riassegnate as readonly string[]);
      return {
        ...p,
        materialiPersonalizzati: p.materialiPersonalizzati.filter(
          (x) => (x.id as string) !== id,
        ),
        aste: p.aste.map((a) =>
          insieme.has(a.id as string)
            ? { ...a, materialeId: sostituto as Asta['materialeId'] }
            : a),
      };
    },
    annulla(p) {
      if (!rimosso) return p;
      const materiali = [...p.materialiPersonalizzati];
      materiali.splice(posizione, 0, rimosso);
      const insieme = new Set<string>(riassegnate as readonly string[]);
      return {
        ...p,
        materialiPersonalizzati: materiali,
        aste: p.aste.map((a) =>
          insieme.has(a.id as string)
            ? { ...a, materialeId: id as Asta['materialeId'] }
            : a),
      };
    },
  };
}


// ══════════════ VINCOLI E SCONNESSIONI LUNGO L'ASTA ══════════════

/**
 * Un vincolo esterno posato in mezzo a un'asta NON la interrompe: la trave
 * resta un corpo solo e la rotazione è continua attraverso quel punto. È il
 * caso della trave continua su tre appoggi, che è iperstatica proprio perché
 * l'appoggio centrale non introduce alcuna sconnessione.
 */
export function aggiungiVincoloSuAsta(
  astaId: ElementId, s: number, vincolo: Vincolo,
): Comando & { id?: string } {
  let id = '';
  const cmd: Comando & { id?: string } = {
    etichetta: `${vincolo.tipo} sull'asta`,
    esegui(p) {
      id = id || nuovoIdVincoloSuAsta(p);
      cmd.id = id;
      return {
        ...registraId(p, id),
        vincoliSuAsta: [
          ...(p.vincoliSuAsta ?? []),
          { id, astaId, s: Math.min(Math.max(s, 1e-6), 1 - 1e-6), vincolo },
        ],
      };
    },
    annulla(p) {
      return { ...p, vincoliSuAsta: (p.vincoliSuAsta ?? []).filter((v) => v.id !== id) };
    },
  };
  return cmd;
}

/**
 * Una sconnessione interna divide invece il corpo in due. Cerniera, bipendolo
 * e pattino differiscono per quale caratteristica NON trasmettono.
 */
export function aggiungiSconnessione(
  astaId: ElementId, s: number,
  tipo: 'cerniera' | 'bipendolo' | 'pattino', angolo = 0,
): Comando & { id?: string } {
  let id = '';
  const cmd: Comando & { id?: string } = {
    etichetta: `${tipo} interna`,
    esegui(p) {
      id = id || nuovoIdSconnessione(p);
      cmd.id = id;
      return {
        ...registraId(p, id),
        sconnessioni: [
          ...(p.sconnessioni ?? []),
          {
            id, astaId, s: Math.min(Math.max(s, 1e-6), 1 - 1e-6), tipo,
            ...(angolo ? { angolo: angolo as never } : {}),
          },
        ],
      };
    },
    annulla(p) {
      return { ...p, sconnessioni: (p.sconnessioni ?? []).filter((v) => v.id !== id) };
    },
  };
  return cmd;
}

/** Sposta un vincolo o una sconnessione lungo la propria asta. */
export function spostaSuAsta(id: string, s: number): Comando {
  let precedente = 0;
  const limitato = Math.min(Math.max(s, 1e-6), 1 - 1e-6);
  return {
    etichetta: 'sposta lungo l\'asta',
    esegui(p) {
      const v = (p.vincoliSuAsta ?? []).find((x) => x.id === id);
      const c = (p.sconnessioni ?? []).find((x) => x.id === id);
      precedente = v?.s ?? c?.s ?? 0;
      return {
        ...p,
        vincoliSuAsta: (p.vincoliSuAsta ?? []).map(
          (x) => (x.id === id ? { ...x, s: limitato } : x)),
        sconnessioni: (p.sconnessioni ?? []).map(
          (x) => (x.id === id ? { ...x, s: limitato } : x)),
      };
    },
    annulla(p) {
      return {
        ...p,
        vincoliSuAsta: (p.vincoliSuAsta ?? []).map(
          (x) => (x.id === id ? { ...x, s: precedente } : x)),
        sconnessioni: (p.sconnessioni ?? []).map(
          (x) => (x.id === id ? { ...x, s: precedente } : x)),
      };
    },
  };
}

/** Rimuove un vincolo su asta o una sconnessione, per id. */
export function eliminaSuAsta(id: string): Comando {
  let vincolo: VincoloSuAsta | undefined;
  let sconnessione: SconnessioneSuAsta | undefined;
  return {
    etichetta: 'elimina dall\'asta',
    esegui(p) {
      vincolo = (p.vincoliSuAsta ?? []).find((x) => x.id === id);
      sconnessione = (p.sconnessioni ?? []).find((x) => x.id === id);
      return {
        ...p,
        vincoliSuAsta: (p.vincoliSuAsta ?? []).filter((x) => x.id !== id),
        sconnessioni: (p.sconnessioni ?? []).filter((x) => x.id !== id),
      };
    },
    annulla(p) {
      return {
        ...p,
        vincoliSuAsta: vincolo ? [...(p.vincoliSuAsta ?? []), vincolo] : p.vincoliSuAsta,
        sconnessioni: sconnessione
          ? [...(p.sconnessioni ?? []), sconnessione]
          : p.sconnessioni,
      };
    },
  };
}


/**
 * Sconnessione interna su un NODO.
 *
 * Riguarda per default tutte le aste che vi convergono; elencandone solo
 * alcune si ottiene la sconnessione parziale — in un nodo con tre aste, la
 * cerniera può riguardarne due sole, e le altre restano rigidamente connesse.
 */
export function aggiungiSconnessioneNodale(
  nodoId: NodeId,
  tipo: 'cerniera' | 'bipendolo' | 'pattino',
  opzioni: { astaMaster?: ElementId; asteSvincolate?: ElementId[] } = {},
): Comando & { id?: string } {
  let id = '';
  const cmd: Comando & { id?: string } = {
    etichetta: `${tipo} interna in ${nodoId as unknown as string}`,
    esegui(p) {
      id = id || nuovoIdVincoloInterno(p);
      cmd.id = id;
      return {
        ...registraId(p, id),
        vincoliInterni: [
          ...(p.vincoliInterni ?? []),
          {
            id, tipo, nodoId,
            ...(opzioni.astaMaster ? { astaMaster: opzioni.astaMaster } : {}),
            ...(opzioni.asteSvincolate ? { asteSvincolate: opzioni.asteSvincolate } : {}),
          },
        ],
      };
    },
    annulla(p) {
      return { ...p, vincoliInterni: (p.vincoliInterni ?? []).filter((v) => v.id !== id) };
    },
  };
  return cmd;
}

/** Rimuove una sconnessione nodale, per id o per nodo. */
export function eliminaSconnessioneNodale(id: string): Comando {
  let rimossa: VincoloInterno | undefined;
  return {
    etichetta: 'rimuovi sconnessione interna',
    esegui(p) {
      rimossa = (p.vincoliInterni ?? []).find((v) => v.id === id);
      return { ...p, vincoliInterni: (p.vincoliInterni ?? []).filter((v) => v.id !== id) };
    },
    annulla(p) {
      return {
        ...p,
        vincoliInterni: rimossa ? [...(p.vincoliInterni ?? []), rimossa] : p.vincoliInterni,
      };
    },
  };
}


/**
 * Ribalta il vincolo: mezzo giro.
 *
 * Con l'angolo su tutto il giro il ribaltamento non ha bisogno di un
 * parametro proprio — `angolo + 180°` È il ribaltamento. Un flag separato
 * sarebbe un secondo modo di dire la stessa cosa, e due modi di dire la
 * stessa cosa finiscono sempre per dirne due diverse.
 */
export function ribaltaVincolo(
  nodiIds: readonly NodeId[], suAstaIds: readonly string[] = [],
): Comando {
  const gira = (v: Vincolo): Vincolo => ({ ...v, angolo: ribalta(v.angolo) as never });
  const inverti = (p: Progetto): Progetto => ({
    ...p,
    nodi: p.nodi.map((n) => (
      n.vincolo && (nodiIds as readonly string[]).includes(n.id as string)
        ? { ...n, vincolo: gira(n.vincolo) }
        : n
    )),
    vincoliSuAsta: (p.vincoliSuAsta ?? []).map((v) => (
      suAstaIds.includes(v.id) ? { ...v, vincolo: gira(v.vincolo) } : v
    )),
  });
  return { etichetta: 'ribalta il vincolo (+180°)', esegui: inverti, annulla: inverti };
}


// ═══════════════════ DIVIDERE E RICONGIUNGERE ═══════════════════

/**
 * Divide un'asta in `parti` tronchi uguali, inserendo i nodi intermedi.
 *
 * Non è la stessa cosa dei vincoli in campata, che NON dividono niente: qui
 * l'utente vuole proprio dei nodi, per appenderci qualcosa. I carichi
 * distribuiti seguono la suddivisione, riscalati sui nuovi tronchi: dividere
 * un'asta non deve cambiare il carico che porta.
 */
export function dividiAsta(astaId: ElementId, parti: number): Comando {
  let precedente: Progetto | null = null;
  return {
    etichetta: `dividi in ${parti} parti`,
    esegui(p) {
      precedente = p;
      const asta = p.aste.find((a) => a.id === astaId);
      const ni = asta && p.nodi.find((n) => n.id === asta.nodoIniziale);
      const nj = asta && p.nodi.find((n) => n.id === asta.nodoFinale);
      if (!asta || !ni || !nj || parti < 2) return p;

      const nodi: Nodo[] = [...p.nodi];
      const idsIntermedi: NodeId[] = [];
      for (let k = 1; k < parti; k++) {
        const t = k / parti;
        const id = nuovoIdNodo({ ...p, nodi }, 0);
        nodi.push({
          id,
          x: (ni.x + (nj.x - ni.x) * t) as never,
          y: (ni.y + (nj.y - ni.y) * t) as never,
        });
        idsIntermedi.push(id);
      }

      const catena = [asta.nodoIniziale, ...idsIntermedi, asta.nodoFinale];
      const tratti: TrattoDiAsta[] = [];
      const aste: Asta[] = [];
      for (let k = 0; k < parti; k++) {
        const id = (k === 0 ? asta.id : nuovoIdAsta({ ...p, aste: [...p.aste, ...aste] }, 0));
        aste.push({
          ...asta, id,
          nodoIniziale: catena[k], nodoFinale: catena[k + 1],
          svincolo: {
            iniziale: k === 0 ? asta.svincolo.iniziale : { N: false, T: false, M: false },
            finale: k === parti - 1 ? asta.svincolo.finale : { N: false, T: false, M: false },
          },
        });
        tratti.push({ id, originale: asta.id, s0: k / parti, s1: (k + 1) / parti });
      }

      const carichi: Carico[] = [];
      for (const c of p.carichi) {
        if (!('astaId' in c) || c.astaId !== astaId) { carichi.push(c); continue; }
        carichi.push(...ridistribuisci(c, tratti));
      }

      // i vincoli e le sconnessioni posati sull'asta seguono il proprio tronco
      const riposiziona = <T extends { astaId: ElementId; s: number }>(x: T): T => {
        const t = tratti.find((y) => x.s >= y.s0 && x.s <= y.s1) ?? tratti[tratti.length - 1];
        return { ...x, astaId: t.id, s: (x.s - t.s0) / (t.s1 - t.s0) };
      };

      return {
        ...registraId(p, ...idsIntermedi as unknown as string[],
                      ...aste.map((a) => a.id as unknown as string)),
        nodi,
        aste: p.aste.flatMap((a) => (a.id === astaId ? aste : [a])),
        carichi,
        vincoliSuAsta: (p.vincoliSuAsta ?? []).map(
          (v) => (v.astaId === astaId ? riposiziona(v) : v)),
        sconnessioni: (p.sconnessioni ?? []).map(
          (c) => (c.astaId === astaId ? riposiziona(c) : c)),
      };
    },
    annulla(p) { return precedente ?? p; },
  };
}

/**
 * Elimina un nodo di sola mesh ricongiungendo i due tronchi adiacenti.
 *
 * Vale solo se il nodo NON porta nulla: due sole aste, rigidamente connesse,
 * senza vincoli, carichi o sconnessioni. Negli altri casi cancellare il nodo
 * cambierebbe la struttura, e va fatto con il comando di eliminazione
 * normale, che lo dice.
 */
export function ricongiungiNodo(nodoId: NodeId): Comando & { possibile: boolean } {
  let precedente: Progetto | null = null;
  const cmd: Comando & { possibile: boolean } = {
    etichetta: 'ricongiungi le aste',
    possibile: true,
    esegui(p) {
      precedente = p;
      const tocca = p.aste.filter(
        (a) => a.nodoIniziale === nodoId || a.nodoFinale === nodoId);
      const nodo = p.nodi.find((n) => n.id === nodoId);
      const impedito = tocca.length !== 2 || !!nodo?.vincolo
        || (p.vincoliInterni ?? []).some((v) => v.nodoId === nodoId)
        || p.carichi.some((c) => 'nodoId' in c && c.nodoId === nodoId)
        || tocca.some((a) => {
          const s = a.nodoIniziale === nodoId ? a.svincolo.iniziale : a.svincolo.finale;
          return s.N || s.T || s.M;
        });
      cmd.possibile = !impedito;
      if (impedito) return p;

      const [a, b] = tocca;
      const altroDi = (x: typeof a) => (x.nodoIniziale === nodoId ? x.nodoFinale : x.nodoIniziale);
      const fusa: Asta = {
        ...a,
        nodoIniziale: altroDi(a),
        nodoFinale: altroDi(b),
        svincolo: {
          iniziale: a.nodoIniziale === nodoId ? a.svincolo.finale : a.svincolo.iniziale,
          finale: b.nodoIniziale === nodoId ? b.svincolo.finale : b.svincolo.iniziale,
        },
      };
      return {
        ...p,
        nodi: p.nodi.filter((n) => n.id !== nodoId),
        aste: p.aste.filter((x) => x.id !== a.id && x.id !== b.id).concat(fusa),
        // i carichi delle due aste non sono più riportabili senza ambiguità:
        // si spostano tutti sull'asta fusa mantenendo l'ascissa relativa del
        // proprio tronco, che è l'unica lettura sensata
        carichi: p.carichi.filter((c) => !('astaId' in c)
          || (c.astaId !== a.id && c.astaId !== b.id)),
      };
    },
    annulla(p) { return precedente ?? p; },
  };
  return cmd;
}


/**
 * Spezza un'asta in un punto interno, facendola passare per un nodo.
 *
 * È la correzione del bug più insidioso del programma: agganciare una nuova
 * asta a metà di un'altra creava un nodo NUOVO alle stesse coordinate, mentre
 * l'asta ospite restava intera. Due segmenti coincidenti in un punto ma
 * topologicamente scollegati, e un conteggio di corpi rigidi giusto su un
 * modello sbagliato. Da qui in avanti il nodo è UNO e tutti i segmenti che vi
 * arrivano lo referenziano per id.
 *
 * La suddivisione è puramente topologica: stesso materiale, stessa sezione,
 * nessuno svincolo introdotto, carichi riscalati sui due tronchi. N, T e M
 * restano continui attraverso quel punto perché lì non è cambiato nulla.
 */
function spezza(
  p: Progetto, astaId: ElementId, s: number, nodoId: NodeId,
): Progetto {
  const asta = p.aste.find((a) => a.id === astaId);
  if (!asta || s <= 1e-9 || s >= 1 - 1e-9) return p;
  if (asta.nodoIniziale === nodoId || asta.nodoFinale === nodoId) return p;

  const idSecondo = nuovoIdAsta(p);
  const gruppo = asta.gruppo ?? asta.id;
  const primo: Asta = {
    ...asta, gruppo,
    nodoFinale: nodoId,
    svincolo: { iniziale: asta.svincolo.iniziale, finale: NESSUN_SVINCOLO },
  };
  const secondo: Asta = {
    ...asta, id: idSecondo, gruppo,
    nodoIniziale: nodoId,
    svincolo: { iniziale: NESSUN_SVINCOLO, finale: asta.svincolo.finale },
  };
  const tratti: TrattoDiAsta[] = [
    { id: asta.id, originale: asta.id, s0: 0, s1: s },
    { id: idSecondo, originale: asta.id, s0: s, s1: 1 },
  ];

  const riposiziona = <T extends { astaId: ElementId; s: number }>(x: T): T => {
    const t = x.s <= s ? tratti[0] : tratti[1];
    return { ...x, astaId: t.id, s: (x.s - t.s0) / (t.s1 - t.s0) };
  };

  return {
    ...registraId(p, idSecondo as unknown as string),
    aste: p.aste.flatMap((a) => (a.id === astaId ? [primo, secondo] : [a])),
    carichi: p.carichi.flatMap((c) => (
      'astaId' in c && c.astaId === astaId ? ridistribuisci(c, tratti) : [c]
    )),
    vincoliSuAsta: (p.vincoliSuAsta ?? []).map(
      (v) => (v.astaId === astaId ? riposiziona(v) : v)),
    sconnessioni: (p.sconnessioni ?? []).map(
      (c) => (c.astaId === astaId ? riposiziona(c) : c)),
  };
}

const NESSUN_SVINCOLO = { N: false, T: false, M: false } as const;

/**
 * Crea un nodo alle coordinate date e lo COLLEGA alle aste su cui si appoggia,
 * spezzandole. Se `suAste` è vuoto è un nodo libero come un altro.
 */
export function nodoCollegato(
  x: number, y: number,
  suAste: readonly { astaId: ElementId; s: number }[] = [],
): Comando & { id?: NodeId } {
  let precedente: Progetto | null = null;
  let id: NodeId | null = null;
  const cmd: Comando & { id?: NodeId } = {
    etichetta: suAste.length > 0 ? 'nodo su asta' : 'nuovo nodo',
    esegui(p) {
      precedente = p;
      id = id ?? nuovoIdNodo(p);
      cmd.id = id;
      let q: Progetto = {
        ...registraId(p, id as string),
        nodi: [...p.nodi, { id, x: x as never, y: y as never }],
      };
      // le ascisse si riferiscono alle aste ORIGINALI: spezzando la prima, la
      // seconda potrebbe essere già stata divisa, quindi si ricalcola ogni
      // volta su quale tronco cade il punto
      for (const s of suAste) {
        const bersaglio = troncoContenente(q, s.astaId, s.s);
        if (bersaglio) q = spezza(q, bersaglio.astaId, bersaglio.s, id);
      }
      return q;
    },
    annulla(p) { return precedente ?? p; },
  };
  return cmd;
}

/** Su quale tronco (ed a quale ascissa locale) cade l'ascissa `s` dell'asta. */
function troncoContenente(
  p: Progetto, astaId: ElementId, s: number,
): { astaId: ElementId; s: number } | null {
  const diretta = p.aste.find((a) => a.id === astaId);
  if (diretta) return { astaId, s };
  return null;
}


/**
 * Cambia l'orientamento di un vincolo, con l'etichetta che dice da dove a
 * dove: nella cronologia «Rotazione carrello G: 0° → 270°» si legge, «ruota
 * vincolo» no.
 */
export function ruotaVincolo(
  bersaglio: { tipo: 'nodo'; id: NodeId } | { tipo: 'suAsta'; id: string },
  angolo: number,
  etichettaTipo = 'vincolo',
): Comando {
  let precedente = 0;
  const nuovo = normalizzaAngolo(angolo);
  const gradi = (a: number) => Math.round((a * 180) / Math.PI);
  const cmd: Comando = {
    etichetta: 'rotazione',
    esegui(p) {
      if (bersaglio.tipo === 'nodo') {
        const n = p.nodi.find((x) => x.id === bersaglio.id);
        precedente = n?.vincolo?.angolo ?? 0;
        cmd.etichetta = `Rotazione ${etichettaTipo} ${bersaglio.id as unknown as string}: `
          + `${gradi(precedente)}° → ${gradi(nuovo)}°`;
        return {
          ...p,
          nodi: p.nodi.map((x) => (
            x.id === bersaglio.id && x.vincolo
              ? { ...x, vincolo: { ...x.vincolo, angolo: nuovo as never } }
              : x
          )),
        };
      }
      const v = (p.vincoliSuAsta ?? []).find((x) => x.id === bersaglio.id);
      precedente = v?.vincolo.angolo ?? 0;
      cmd.etichetta = `Rotazione ${etichettaTipo} ${bersaglio.id}: `
        + `${gradi(precedente)}° → ${gradi(nuovo)}°`;
      return {
        ...p,
        vincoliSuAsta: (p.vincoliSuAsta ?? []).map((x) => (
          x.id === bersaglio.id
            ? { ...x, vincolo: { ...x.vincolo, angolo: nuovo as never } }
            : x
        )),
      };
    },
    annulla(p) {
      if (bersaglio.tipo === 'nodo') {
        return {
          ...p,
          nodi: p.nodi.map((x) => (
            x.id === bersaglio.id && x.vincolo
              ? { ...x, vincolo: { ...x.vincolo, angolo: precedente as never } }
              : x
          )),
        };
      }
      return {
        ...p,
        vincoliSuAsta: (p.vincoliSuAsta ?? []).map((x) => (
          x.id === bersaglio.id
            ? { ...x, vincolo: { ...x.vincolo, angolo: precedente as never } }
            : x
        )),
      };
    },
  };
  return cmd;
}


// ═══════════ SEZIONE E MATERIALE: PREDEFINITO E SPECIFICO ═══════════

/**
 * La sezione (o il materiale) PREDEFINITA del modello: quella che seguono
 * tutte le aste che non ne hanno una loro.
 *
 * È il comportamento normale, ed è quello che deve funzionare senza
 * selezionare niente: una struttura con un solo profilo — la stragrande
 * maggioranza — non deve richiedere di selezionare le aste prima di
 * assegnarlo. Le aste con assegnazione specifica restano dove sono.
 */
export function impostaSezionePredefinita(sezioneId: string): Comando {
  let precedente: Progetto | null = null;
  return {
    etichetta: 'sezione predefinita',
    esegui(p) {
      precedente = p;
      return {
        ...p,
        sezionePredefinita: sezioneId as Progetto['sezionePredefinita'],
        aste: p.aste.map((a) => (
          a.sezioneSpecifica ? a : { ...a, sezioneId: sezioneId as Asta['sezioneId'] }
        )),
      };
    },
    annulla(p) { return precedente ?? p; },
  };
}

export function impostaMaterialePredefinito(materialeId: string): Comando {
  let precedente: Progetto | null = null;
  return {
    etichetta: 'materiale predefinito',
    esegui(p) {
      precedente = p;
      return {
        ...p,
        materialePredefinito: materialeId as Progetto['materialePredefinito'],
        aste: p.aste.map((a) => (
          a.materialeSpecifico ? a : { ...a, materialeId: materialeId as Asta['materialeId'] }
        )),
      };
    },
    annulla(p) { return precedente ?? p; },
  };
}

/** Assegnazione SPECIFICA alle sole aste indicate: da lì in poi non seguono più il predefinito. */
export function assegnaSpecifica(
  asteIds: readonly ElementId[],
  cosa: { sezioneId?: string; materialeId?: string },
): Comando {
  let precedente: Progetto | null = null;
  const insieme = new Set<string>(asteIds as readonly string[]);
  return {
    etichetta: cosa.sezioneId ? 'assegna sezione' : 'assegna materiale',
    esegui(p) {
      precedente = p;
      return {
        ...p,
        aste: p.aste.map((a) => {
          if (!insieme.has(a.id as unknown as string)) return a;
          return {
            ...a,
            ...(cosa.sezioneId
              ? { sezioneId: cosa.sezioneId as Asta['sezioneId'], sezioneSpecifica: true }
              : {}),
            ...(cosa.materialeId
              ? { materialeId: cosa.materialeId as Asta['materialeId'], materialeSpecifico: true }
              : {}),
          };
        }),
      };
    },
    annulla(p) { return precedente ?? p; },
  };
}

/** Toglie la sovrascrittura: le aste tornano a seguire il predefinito del modello. */
export function ripristinaPredefinita(
  asteIds: readonly ElementId[],
  cosa: { sezione?: boolean; materiale?: boolean } = { sezione: true, materiale: true },
): Comando {
  let precedente: Progetto | null = null;
  const insieme = new Set<string>(asteIds as readonly string[]);
  return {
    etichetta: 'ripristina predefinita',
    esegui(p) {
      precedente = p;
      const sez = p.sezionePredefinita ?? p.aste[0]?.sezioneId;
      const mat = p.materialePredefinito ?? p.aste[0]?.materialeId;
      return {
        ...p,
        aste: p.aste.map((a) => {
          if (!insieme.has(a.id as unknown as string)) return a;
          const { sezioneSpecifica: _s, materialeSpecifico: _m, ...resto } = a;
          return {
            ...resto,
            ...(cosa.sezione && sez ? { sezioneId: sez } : {}),
            ...(cosa.materiale && mat ? { materialeId: mat } : {}),
            ...(cosa.sezione ? {} : { sezioneSpecifica: a.sezioneSpecifica }),
            ...(cosa.materiale ? {} : { materialeSpecifico: a.materialeSpecifico }),
          };
        }),
      };
    },
    annulla(p) { return precedente ?? p; },
  };
}

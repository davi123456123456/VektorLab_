/**
 * LA TRATTEGGIATA — il sistema di riferimento locale, reso visibile.
 *
 * Una linea tratteggiata su UN SOLO lato di ogni asta. Individua la fibra di
 * riferimento — l'equivalente della «fibra inferiore» su una trave
 * orizzontale — ed è ciò che rende univoco il segno di `T` e di `M`. Senza,
 * un diagramma del momento non è leggibile: si sa quanto vale, non da che
 * parte tende le fibre.
 *
 * Per ogni segmento:
 *
 *     x̂ = versore assiale, dal nodo iniziale al nodo finale
 *     ŷ = x̂ ruotato di +90°
 *     tratteggiata = dal lato −ŷ
 *
 * IL REQUISITO CHE CONTA È LA COERENZA, non quale lato. Se un'asta piegata
 * cambia lato a metà, i segni si invertono nel mezzo e i diagrammi diventano
 * illeggibili — e il lato dipende da come i segmenti sono stati memorizzati,
 * cioè da un dettaglio che l'utente non controlla e non vede.
 *
 * Per questo il lato non si legge dal singolo segmento: si propaga con una
 * visita in profondità lungo il membro, partendo da un nodo scelto in modo
 * deterministico. Tutti i segmenti di uno stesso membro ereditano il verso di
 * percorrenza, e la tratteggiata resta dallo stesso lato attraverso le pieghe.
 */

import type { Asta, ElementId, NodeId, Progetto } from './types.js';
import type { RisultatoAnalisi, RisultatoAsta } from './results.js';
import { astaDiOrigine } from './espansione.js';

/** +1 se il lato è quello naturale (−ŷ), −1 se invertito per coerenza. */
export type LatoTratteggiata = 1 | -1;

export interface EsitoTratteggiata {
  /** lato da usare per ogni asta */
  lato: Map<ElementId, LatoTratteggiata>;
  /** membro di appartenenza: le aste con lo stesso numero si percorrono insieme */
  membro: Map<ElementId, number>;
  /** prima asta di ciascun membro, dove disegnare l'indicatore di x̂ */
  capofila: ElementId[];
}

/**
 * Nodo da cui partire, scelto in modo DETERMINISTICO.
 *
 * L'ordine di preferenza non è arbitrario: un estremo libero è il punto da
 * cui si comincerebbe a mano, perché lì si conosce già tutto; in mancanza, un
 * nodo vincolato; in mancanza, il primo. Deve comunque essere una regola
 * fissa, altrimenti la tratteggiata cambierebbe lato a ogni ricalcolo.
 */
function radice(p: Progetto, aste: readonly Asta[]): NodeId {
  const grado = new Map<string, number>();
  for (const a of aste) {
    for (const n of [a.nodoIniziale, a.nodoFinale]) {
      grado.set(n as unknown as string, (grado.get(n as unknown as string) ?? 0) + 1);
    }
  }
  const candidati = [...grado.keys()].sort();
  const liberi = candidati.filter((n) => grado.get(n) === 1);
  if (liberi.length > 0) return liberi[0] as unknown as NodeId;
  const vincolati = candidati.filter(
    (n) => p.nodi.find((x) => (x.id as unknown as string) === n)?.vincolo);
  if (vincolati.length > 0) return vincolati[0] as unknown as NodeId;
  return (candidati[0] ?? p.nodi[0]?.id) as unknown as NodeId;
}

export function calcolaTratteggiata(p: Progetto): EsitoTratteggiata {
  const lato = new Map<ElementId, LatoTratteggiata>();
  const membro = new Map<ElementId, number>();
  const capofila: ElementId[] = [];

  const incidenti = new Map<string, Asta[]>();
  for (const a of p.aste) {
    for (const n of [a.nodoIniziale, a.nodoFinale]) {
      const k = n as unknown as string;
      const lista = incidenti.get(k);
      if (lista) lista.push(a); else incidenti.set(k, [a]);
    }
  }

  const visitate = new Set<string>();
  let numeroMembro = 0;

  // si parte dalla radice e si esplora; le componenti separate hanno ciascuna
  // la propria radice, scelta con la stessa regola
  const daVisitare: NodeId[] = [];
  const restanti = new Set(p.aste.map((a) => a.id as unknown as string));

  while (restanti.size > 0) {
    const asteRimaste = p.aste.filter(
      (a) => restanti.has(a.id as unknown as string));
    daVisitare.length = 0;
    daVisitare.push(radice(p, asteRimaste));
    const membroCorrente = numeroMembro++;
    let primo = true;

    while (daVisitare.length > 0) {
      const nodo = daVisitare.pop()!;
      for (const a of incidenti.get(nodo as unknown as string) ?? []) {
        const chiave = a.id as unknown as string;
        if (visitate.has(chiave)) continue;
        visitate.add(chiave);
        restanti.delete(chiave);
        membro.set(a.id, membroCorrente);
        if (primo) { capofila.push(a.id); primo = false; }

        /*
         * IL SEGNO. Percorrendo il membro si arriva a `nodo`; se il segmento
         * memorizzato parte proprio da lì, il verso di percorrenza coincide
         * con quello memorizzato e il lato resta quello naturale. Se invece
         * ci arriva — cioè `nodo` è il suo nodo FINALE — il segmento è
         * memorizzato al contrario, il suo ŷ punta dalla parte opposta, e per
         * tenere la tratteggiata dallo stesso lato fisico va compensato.
         *
         * È il motivo per cui questo calcolo esiste: l'ordine con cui i due
         * nodi di un'asta sono finiti nel modello dipende da come l'utente
         * l'ha disegnata, e non deve decidere da che parte si legge il
         * momento.
         */
        const concorde = a.nodoIniziale === nodo;
        lato.set(a.id, concorde ? 1 : -1);

        const altro = concorde ? a.nodoFinale : a.nodoIniziale;
        daVisitare.push(altro);
      }
    }
  }

  return { lato, membro, capofila };
}

/**
 * Lato effettivo, tenendo conto dell'inversione chiesta dall'utente.
 *
 * `Asta.tratteggiataInvertita` ribalta il lato di quel segmento. Il risultato
 * fisico non cambia — cambia quale fibra si chiama «di riferimento» — e
 * quindi i segni di `T` e di `M` si ribaltano mentre `N` resta quello che è:
 * lo sforzo normale non ha un lato.
 */
export function latoEffettivo(
  esito: EsitoTratteggiata, a: Asta,
): LatoTratteggiata {
  const base = esito.lato.get(a.id) ?? 1;
  return (a.tratteggiataInvertita ? -base : base) as LatoTratteggiata;
}

/**
 * Applica alla terna (N, T, M) il cambio di fibra di riferimento.
 *
 * Ribaltare la tratteggiata è una RIFLESSIONE del riferimento locale: `x̂`
 * resta, `ŷ` cambia verso. Una riflessione inverte il senso delle rotazioni,
 * quindi `T` cambia segno; e cambia la fibra che il momento tende, quindi
 * anche `M`. `N` è la proiezione su `x̂`, che non è toccato: resta identico,
 * segno compreso.
 */
export function conLato(
  lato: LatoTratteggiata, v: { N: number; T: number; M: number },
): { N: number; T: number; M: number } {
  return { N: v.N, T: lato * v.T, M: lato * v.M };
}

/**
 * IL LATO DELLA TRATTEGGIATA PER OGNI ELEMENTO DEL MODELLO DI CALCOLO.
 *
 * I risultati appartengono al modello ESPANSO, dove un'asta con un vincolo
 * in campata diventa due tratti. La tratteggiata che l'utente vede però è
 * quella dell'asta che ha disegnato: il lato si legge lì, e ogni tratto
 * eredita quello della sua asta — ne conserva anche il verso, quindi il lato
 * vale identico. Ricalcolarlo sul modello espanso poteva dare un lato
 * diverso, perché i nodi in più cambiano da dove parte la visita, e il
 * diagramma sarebbe finito dalla parte opposta della tratteggiata disegnata.
 */
export function latiDelCalcolo(
  autore: Progetto, calcolo: Progetto,
): Map<ElementId, LatoTratteggiata> {
  const tAutore = calcolaTratteggiata(autore);
  const tCalcolo = calcolo === autore ? tAutore : calcolaTratteggiata(calcolo);
  const perId = new Map(autore.aste.map((a) => [a.id, a]));
  const lati = new Map<ElementId, LatoTratteggiata>();
  for (const a of calcolo.aste) {
    const originale = perId.get(astaDiOrigine(a.id));
    lati.set(a.id, originale ? latoEffettivo(tAutore, originale) : latoEffettivo(tCalcolo, a));
  }
  return lati;
}

/**
 * I RISULTATI LETTI DALLA TRATTEGGIATA — per mostrarli, non per calcolare.
 *
 * Il motore restituisce N, T e M nel riferimento NATURALE dell'asta: fibra
 * di riferimento dal lato −ŷ. Dove la tratteggiata sta dall'altra parte, chi
 * legge il diagramma ragiona rispetto a lei, e rispetto a lei T e M hanno il
 * segno opposto (`conLato`). Questa è la copia da mostrare: diagrammi, quote,
 * tabelle, espressioni.
 *
 * Restano come sono, e devono restare: le forze d'estremità e gli spostamenti
 * (sono vettori fisici, servono a frecce e deformata), e l'originale, su cui
 * lavorano le verifiche. Lo zero resta +0: un «−0.00» in tabella sembrerebbe
 * un errore.
 */
export function vistaDallaTratteggiata(
  r: RisultatoAnalisi, lati: ReadonlyMap<ElementId, LatoTratteggiata>,
): RisultatoAnalisi {
  return { ...r, aste: r.aste.map((a) => ((lati.get(a.astaId) ?? 1) === 1 ? a : ribaltaAsta(a))) };
}

const opposto = (x: number): number => (x === 0 ? 0 : -x);

function ribaltaAsta(a: RisultatoAsta): RisultatoAsta {
  return {
    ...a,
    T: a.T.map(opposto),
    M: a.M.map(opposto),
    puntiNotevoli: a.puntiNotevoli.map((p) => ({ ...p, T: opposto(p.T), M: opposto(p.M) })),
    estremi: {
      ...a.estremi,
      Tmin: opposto(a.estremi.Tmax), Tmax: opposto(a.estremi.Tmin),
      Mmin: opposto(a.estremi.Mmax), Mmax: opposto(a.estremi.Mmin),
    },
  };
}

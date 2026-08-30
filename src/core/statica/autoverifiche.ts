/**
 * Autoverifiche sul risultato statico.
 *
 * Sono i controlli che intercettano gli errori PRIMA che diventino numeri
 * plausibili in una relazione. Ciascuno verifica una proprietà che deve valere
 * per costruzione: se fallisce, il calcolo è sbagliato, non "approssimato".
 *
 * Il più forte è l'ultimo — il confronto fra due metodi indipendenti. Le
 * equazioni cardinali e il metodo degli spostamenti non condividono nulla se
 * non la geometria: se concordano a otto cifre, sbagliano entrambi solo se
 * sbagliano allo stesso modo, il che è molto improbabile.
 */

import type { RisultatoAnalisi } from '../model/results.js';
import type { IndiceModello } from '../model/queries.js';
import type { Espansione } from '../model/espansione.js';
import type { Progetto } from '../model/types.js';
import type { EsitoReazioni } from './reazioni.js';
import { preparaTronco, valutaTronco } from './elementino.js';
import type {
  ContestoTronco, DiagrammaEquilibrio, ReazioneEsterna, SorgenteReazioni,
} from './elementino.js';
import type { ElementId } from '../model/types.js';
import { geometriaAsta } from '../model/queries.js';

/**
 * Quel che serve alle autoverifiche per interrogare il metodo dell'elementino.
 * Deliberatamente strutturale: `core/index` compone l'esito completo, ma questo
 * modulo non deve dipendere da lui.
 */
export interface ContestoElementino {
  sorgente: SorgenteReazioni;
  reazioni: ReazioneEsterna[];
  diagrammi: Map<ElementId, DiagrammaEquilibrio>;
}

export interface Autoverifica {
  codice: string;
  descrizione: string;
  superata: boolean;
  /** scarto misurato, nell'unità pertinente */
  scarto: number;
  tolleranza: number;
  dettaglio: string;
  /**
   * Quanti oggetti sono stati effettivamente esaminati.
   *
   * Serve a distinguere «verificato, tutto a posto» da «non c'era nulla da
   * verificare»: senza questo conteggio una verifica resa vuota da un errore
   * di ricerca risulterebbe superata, che è il modo peggiore in cui un
   * controllo può fallire.
   */
  esaminati: number;
}

export interface EsitoAutoverifiche {
  verifiche: Autoverifica[];
  tutteSuperate: boolean;
}

const TOLL_RELATIVA = 1e-6;

/** Scala di riferimento: il massimo carico o reazione in gioco. */
function scalaForze(r: RisultatoAnalisi): number {
  let s = 0;
  for (const x of r.reazioni) s = Math.max(s, Math.abs(x.fx), Math.abs(x.fy));
  for (const a of r.aste) {
    s = Math.max(s, Math.abs(a.estremi.Nmin), Math.abs(a.estremi.Nmax));
    s = Math.max(s, Math.abs(a.estremi.Tmin), Math.abs(a.estremi.Tmax));
  }
  return Math.max(s, 1);
}

function scalaMomenti(r: RisultatoAnalisi): number {
  let s = 0;
  for (const x of r.reazioni) s = Math.max(s, Math.abs(x.mz));
  for (const a of r.aste) {
    s = Math.max(s, Math.abs(a.estremi.Mmin), Math.abs(a.estremi.Mmax));
  }
  return Math.max(s, 1);
}

export function eseguiAutoverifiche(
  progetto: Progetto,
  espansione: Espansione,
  idx: IndiceModello,
  risultatoFEM: RisultatoAnalisi,
  reazioniEquilibrio: EsitoReazioni | null,
  elementino?: ContestoElementino,
): EsitoAutoverifiche {
  const verifiche: Autoverifica[] = [];
  const scalaF = scalaForze(risultatoFEM);
  const scalaM = scalaMomenti(risultatoFEM);
  const calcolo = espansione.progetto;

  // ── 1. momento nullo in ogni cerniera interna ──
  {
    let peggiore = 0;
    let dove = '';
    let esaminati = 0;
    const perNodo = new Map<string, string>();
    for (const [nodoId, info] of espansione.nodiSconnessione) {
      if (info.tipo !== 'cerniera') continue;
      perNodo.set(nodoId as string, info.astaId as string);
    }
    // aste che partono da un nodo di sconnessione con M rilasciato
    for (const asta of calcolo.aste) {
      const ris = risultatoFEM.aste.find((x) => x.astaId === asta.id);
      if (!ris) continue;
      if (asta.svincolo.iniziale.M && perNodo.has(asta.nodoIniziale as string)) {
        const m = Math.abs(ris.M[0]);
        if (m > peggiore) { peggiore = m; dove = `${asta.nodoIniziale}`; }
      }
      if (asta.svincolo.finale.M && perNodo.has(asta.nodoFinale as string)) {
        const m = Math.abs(ris.M[ris.M.length - 1]);
        if (m > peggiore) { peggiore = m; dove = `${asta.nodoFinale}`; }
      }
    }
    // include anche le cerniere dichiarate come svincolo d'asta
    for (const asta of calcolo.aste) {
      const ris = risultatoFEM.aste.find((x) => x.astaId === asta.id);
      if (!ris) continue;
      if (asta.svincolo.iniziale.M) {
        esaminati++;
        const m = Math.abs(ris.M[0]);
        if (m > peggiore) { peggiore = m; dove = `${asta.id} (estremo iniziale)`; }
      }
      if (asta.svincolo.finale.M) {
        esaminati++;
        const m = Math.abs(ris.M[ris.M.length - 1]);
        if (m > peggiore) { peggiore = m; dove = `${asta.id} (estremo finale)`; }
      }
    }
    const toll = TOLL_RELATIVA * scalaM;
    verifiche.push({
      codice: 'M_NULLO_IN_CERNIERA',
      descrizione: 'In ogni cerniera interna il momento flettente è nullo',
      superata: peggiore <= toll,
      scarto: peggiore, tolleranza: toll,
      esaminati,
      dettaglio: esaminati === 0 ? 'nessuna cerniera interna nel modello'
        : `${esaminati} cerniere esaminate, massimo ` +
          `${(peggiore / 1e3).toExponential(2)} kNm${dove ? ` in ${dove}` : ''}`,
    });
  }

  // ── 2. N = T = M = 0 in ogni estremo libero ──
  {
    const gradiDelNodo = new Map<string, number>();
    for (const asta of calcolo.aste) {
      for (const n of [asta.nodoIniziale, asta.nodoFinale]) {
        gradiDelNodo.set(n as string, (gradiDelNodo.get(n as string) ?? 0) + 1);
      }
    }
    let peggiore = 0;
    let dove = '';
    let esaminati = 0;
    for (const asta of calcolo.aste) {
      const ris = risultatoFEM.aste.find((x) => x.astaId === asta.id);
      if (!ris) continue;
      for (const [nodoId, indice] of [
        [asta.nodoIniziale, 0], [asta.nodoFinale, ris.ascisse.length - 1],
      ] as const) {
        const nodo = idx.nodi.get(nodoId);
        const libero = (gradiDelNodo.get(nodoId as string) ?? 0) === 1
          && !nodo?.vincolo
          && !calcolo.carichi.some((c) => 'nodoId' in c && c.nodoId === nodoId);
        if (!libero) continue;
        esaminati++;
        const v = Math.max(
          Math.abs(ris.N[indice]), Math.abs(ris.T[indice]),
          Math.abs(ris.M[indice]) / Math.max(1, scalaM / scalaF),
        );
        if (v > peggiore) { peggiore = v; dove = `${nodoId}`; }
      }
    }
    const toll = TOLL_RELATIVA * scalaF;
    verifiche.push({
      codice: 'ESTREMO_LIBERO_SCARICO',
      descrizione: 'In ogni estremo libero N = T = M = 0',
      superata: peggiore <= toll,
      scarto: peggiore, tolleranza: toll,
      esaminati,
      dettaglio: esaminati === 0 ? 'nessun estremo libero nel modello'
        : `${esaminati} estremi esaminati, massimo ` +
          `${(peggiore / 1e3).toExponential(2)} kN${dove ? ` in ${dove}` : ''}`,
    });
  }

  // ── 3. la reazione del carrello è parallela al suo asse ──
  {
    let peggiore = 0;
    let dove = '';
    let esaminati = 0;
    for (const nodo of calcolo.nodi) {
      const v = nodo.vincolo;
      if (!v || (v.tipo !== 'carrello' && v.tipo !== 'biella')) continue;
      const r = risultatoFEM.reazioni.find((x) => x.nodoId === nodo.id);
      if (!r) continue;
      esaminati++;
      // direzione ammessa: normale al piano per il carrello, asse per la biella
      const d = v.tipo === 'carrello'
        ? [-Math.sin(v.angolo), Math.cos(v.angolo)]
        : [Math.cos(v.angolo), Math.sin(v.angolo)];
      // componente PERPENDICOLARE alla direzione ammessa: deve essere nulla
      const perpendicolare = Math.abs(r.fx * -d[1] + r.fy * d[0]);
      if (perpendicolare > peggiore) { peggiore = perpendicolare; dove = `${nodo.id}`; }
    }
    const toll = TOLL_RELATIVA * scalaF;
    verifiche.push({
      codice: 'CARRELLO_PARALLELO',
      descrizione: 'La reazione di carrelli e bielle è diretta lungo il proprio asse',
      superata: peggiore <= toll,
      scarto: peggiore, tolleranza: toll,
      esaminati,
      dettaglio: esaminati === 0 ? 'nessun carrello o biella nel modello'
        : `${esaminati} vincoli esaminati, componente perpendicolare massima ` +
          `${(peggiore / 1e3).toExponential(2)} kN${dove ? ` in ${dove}` : ''}`,
    });
  }

  // ── 4. momento reattivo nullo nelle cerniere esterne ──
  {
    let peggiore = 0;
    let dove = '';
    let esaminati = 0;
    for (const nodo of calcolo.nodi) {
      if (nodo.vincolo?.tipo !== 'cerniera' && nodo.vincolo?.tipo !== 'carrello') continue;
      const r = risultatoFEM.reazioni.find((x) => x.nodoId === nodo.id);
      if (!r) continue;
      esaminati++;
      if (Math.abs(r.mz) > peggiore) { peggiore = Math.abs(r.mz); dove = `${nodo.id}`; }
    }
    const toll = TOLL_RELATIVA * scalaM;
    verifiche.push({
      codice: 'CERNIERA_SENZA_MOMENTO',
      descrizione: 'Cerniere e carrelli esterni non esplicano momento reattivo',
      superata: peggiore <= toll,
      scarto: peggiore, tolleranza: toll,
      esaminati,
      dettaglio: esaminati === 0 ? 'nessuna cerniera o carrello esterno nel modello'
        : `${esaminati} vincoli esaminati, momento massimo ` +
          `${(peggiore / 1e3).toExponential(2)} kNm${dove ? ` in ${dove}` : ''}`,
    });
  }

  // ── 5. equilibrio globale ──
  {
    const eq = risultatoFEM.equilibrio;
    verifiche.push({
      codice: 'EQUILIBRIO_GLOBALE',
      descrizione: 'Somma di carichi e reazioni nulla',
      superata: eq.soddisfatto,
      scarto: eq.residuoRelativo, tolleranza: 1e-8, esaminati: 1,
      dettaglio: `ΣFx ${(eq.sommaFx / 1e3).toExponential(2)} kN, ` +
        `ΣFy ${(eq.sommaFy / 1e3).toExponential(2)} kN, ` +
        `residuo relativo ${eq.residuoRelativo.toExponential(2)}`,
    });
  }

  // ── 6. confronto incrociato fra i due metodi ──
  {
    if (!reazioniEquilibrio || !reazioniEquilibrio.risolto) {
      verifiche.push({
        codice: 'CONFRONTO_METODI',
        descrizione: 'Le reazioni per equilibrio coincidono con quelle del FEM',
        superata: true, scarto: 0, tolleranza: TOLL_RELATIVA, esaminati: 0,
        dettaglio: reazioniEquilibrio
          ? `non applicabile: struttura ${reazioniEquilibrio.classificazione}`
          : 'calcolo per equilibrio non eseguito',
      });
    } else {
      let peggiore = 0;
      let dove = '';
      let esaminati = 0;
      for (const eq of reazioniEquilibrio.perNodo) {
        const fem = risultatoFEM.reazioni.find((x) => (x.nodoId as string) === eq.nodoId);
        if (!fem) continue;
        esaminati++;
        const dF = Math.max(Math.abs(eq.fx - fem.fx), Math.abs(eq.fy - fem.fy)) / scalaF;
        const dM = Math.abs(eq.mz - fem.mz) / scalaM;
        const d = Math.max(dF, dM);
        if (d > peggiore) { peggiore = d; dove = eq.nodoId; }
      }
      verifiche.push({
        codice: 'CONFRONTO_METODI',
        descrizione: 'Le reazioni per equilibrio coincidono con quelle del FEM',
        superata: peggiore <= TOLL_RELATIVA && esaminati > 0,
        scarto: peggiore, tolleranza: TOLL_RELATIVA, esaminati,
        dettaglio: esaminati === 0
          ? 'NESSUNA reazione confrontata: il confronto non ha verificato nulla'
          : `${esaminati} reazioni confrontate, scarto relativo massimo ` +
            `${peggiore.toExponential(2)}${dove ? ` in ${dove}` : ''}`,
      });
    }
  }

  // ── 7. coerenza differenziale dei diagrammi ricostruiti ──
  {
    let peggiore = 0;
    let dove = '';
    let esaminati = 0;
    for (const [astaId, d] of elementino?.diagrammi ?? []) {
      if (!d.applicabile || d.differenziale.campioni === 0) continue;
      esaminati++;
      const scarto = Math.max(d.differenziale.scartoM, d.differenziale.scartoT);
      if (scarto > peggiore) { peggiore = scarto; dove = astaId as unknown as string; }
    }
    verifiche.push({
      codice: 'COERENZA_DIFFERENZIALE',
      descrizione: 'Sui tratti continui vale dM/ds = T e dT/ds = q',
      superata: esaminati === 0 || peggiore <= 1e-7,
      scarto: peggiore, tolleranza: 1e-7, esaminati,
      dettaglio: esaminati === 0
        ? 'nessun diagramma ricostruito per equilibrio'
        : `${esaminati} aste, scarto relativo massimo ${peggiore.toExponential(2)}` +
          `${dove ? ` su ${dove}` : ''}`,
    });
  }

  // ── 8. i diagrammi per equilibrio coincidono con quelli del FEM ──
  {
    let peggiore = 0;
    let dove = '';
    let esaminati = 0;
    if (elementino) {
      for (const ris of risultatoFEM.aste) {
        const d = elementino.diagrammi.get(ris.astaId);
        if (!d || !d.applicabile) continue;
        const ctx = preparaTronco(
          calcolo, idx, elementino.reazioni, ris.astaId, 'monte',
        );
        if (!ctx.applicabile) continue;
        esaminati++;
        for (let i = 0; i < ris.ascisse.length; i++) {
          const t = valutaTronco(ctx, ris.ascisse[i]);
          const scarto = Math.max(
            Math.abs(t.N - ris.N[i]) / scalaF,
            Math.abs(t.T - ris.T[i]) / scalaF,
            Math.abs(t.M - ris.M[i]) / scalaM,
          );
          if (scarto > peggiore) {
            peggiore = scarto;
            dove = `${ris.astaId as unknown as string} a s = ${ris.ascisse[i].toFixed(3)} m`;
          }
        }
      }
    }
    verifiche.push({
      codice: 'CONFRONTO_DIAGRAMMI',
      descrizione: 'N, T, M per equilibrio coincidono con quelli del FEM',
      superata: esaminati === 0 || peggiore <= TOLL_RELATIVA,
      scarto: peggiore, tolleranza: TOLL_RELATIVA, esaminati,
      dettaglio: esaminati === 0
        ? 'nessun diagramma confrontabile'
        : `${esaminati} aste confrontate, scarto relativo massimo ` +
          `${peggiore.toExponential(2)}${dove ? ` (${dove})` : ''}`,
    });
  }

  // ── 9. continuità attraverso i nodi rigidi e le pieghe ──
  {
    const r = continuitaNodi(calcolo, idx, risultatoFEM, scalaF, scalaM);
    verifiche.push({
      codice: 'CONTINUITA_NODI',
      descrizione: 'Nei nodi rigidi scarichi N, T e M passano senza salti',
      superata: r.esaminati === 0 || r.peggiore <= TOLL_RELATIVA,
      scarto: r.peggiore, tolleranza: TOLL_RELATIVA, esaminati: r.esaminati,
      dettaglio: r.esaminati === 0
        ? 'nessun nodo rigido scarico da esaminare'
        : `${r.esaminati} nodi esaminati, scarto relativo massimo ` +
          `${r.peggiore.toExponential(2)}${r.dove ? ` in ${r.dove}` : ''}`,
    });
  }

  // ── 10. forma integrale: M(b) − M(a) = ∫ T ds ──
  {
    let peggiore = 0, dove = '', esaminati = 0;
    for (const [astaId, d] of elementino?.diagrammi ?? []) {
      if (!d.applicabile) continue;
      const ctx = preparaTronco(calcolo, idx, elementino!.reazioni, astaId, 'monte');
      if (!ctx.applicabile) continue;
      const r = confrontoIntegrale(ctx, d);
      if (r.campioni === 0) continue;
      esaminati++;
      if (r.scarto > peggiore) { peggiore = r.scarto; dove = astaId as unknown as string; }
    }
    verifiche.push({
      codice: 'INTEGRALE_TAGLIO',
      descrizione: 'M(b) − M(a) coincide con ∫T ds (quadratura di Simpson)',
      superata: esaminati === 0 || peggiore <= 1e-9,
      scarto: peggiore, tolleranza: 1e-9, esaminati,
      dettaglio: esaminati === 0
        ? 'nessun tratto continuo da integrare'
        : `${esaminati} aste, scarto relativo massimo ${peggiore.toExponential(2)}` +
          `${dove ? ` su ${dove}` : ''}`,
    });
  }

  return { verifiche, tutteSuperate: verifiche.every((v) => v.superata) };
}

/**
 * Continuità attraverso un nodo rigido, scritta come EQUILIBRIO DEL NODO.
 *
 * Si esaminano i nodi rigidi senza carichi concentrati né reazioni: lì la
 * somma di ciò che le aste si scambiano deve annullarsi. Su una trave dritta
 * spezzata in due tronchi la condizione si riduce alla continuità di N, T ed
 * M; su una piega diventa l'equilibrio del vertice, ed è per questo che il
 * confronto si fa in assi GLOBALI: in locale N e T dei due tronchi si
 * scambiano ruolo con la rotazione e non sarebbero confrontabili.
 *
 * IL SEGNO DELL'ESTREMO — l'azione che un'asta esercita sul nodo è +（S, M)
 * se il nodo è il suo estremo INIZIALE (lì l'asta vede la faccia negativa) e
 * −(S, M) se è quello finale. Dimenticarlo fa fallire ogni angolo di telaio,
 * ed è l'errore che questa nota esiste per prevenire.
 *
 * È il controllo che smaschera gli svincoli inseriti per sbaglio: un vincolo
 * esterno che spezza la trave invece di appoggiarcisi si vede qui.
 */
function continuitaNodi(
  calcolo: Progetto,
  idx: IndiceModello,
  fem: RisultatoAnalisi,
  scalaF: number,
  scalaM: number,
): { peggiore: number; dove: string; esaminati: number } {
  let peggiore = 0, dove = '', esaminati = 0;

  const conCarico = new Set<string>();
  for (const c of calcolo.carichi) {
    if (c.tipo === 'forzaNodale' || c.tipo === 'momentoNodale') {
      conCarico.add(c.nodoId as unknown as string);
    }
  }
  const conReazione = new Set(
    fem.reazioni.map((r) => r.nodoId as unknown as string),
  );

  for (const nodo of calcolo.nodi) {
    const id = nodo.id as unknown as string;
    if (conCarico.has(id) || conReazione.has(id) || nodo.vincolo) continue;

    let Fx = 0, Fy = 0, Mz = 0, quante = 0;
    let rigidi = true;

    for (const a of calcolo.aste) {
      for (const estremo of ['iniziale', 'finale'] as const) {
        const suNodo = estremo === 'iniziale'
          ? a.nodoIniziale === nodo.id
          : a.nodoFinale === nodo.id;
        if (!suNodo) continue;
        const ris = fem.aste.find((x) => x.astaId === a.id);
        if (!ris || ris.N.length === 0) continue;
        const sv = estremo === 'iniziale' ? a.svincolo.iniziale : a.svincolo.finale;
        if (sv.N || sv.T || sv.M) { rigidi = false; break; }

        const g = geometriaAsta(a, idx);
        const k = estremo === 'iniziale' ? 0 : ris.N.length - 1;
        const N = ris.N[k], T = ris.T[k], M = ris.M[k];
        // forza attraverso la sezione in assi globali: S = N·x̂ − T·ŷ
        const Sx = N * g.c + T * g.s;
        const Sy = N * g.s - T * g.c;
        const segno = estremo === 'iniziale' ? 1 : -1;
        Fx += segno * Sx; Fy += segno * Sy; Mz += segno * M;
        quante++;
      }
      if (!rigidi) break;
    }

    if (!rigidi || quante < 2) continue;
    esaminati++;
    const d = Math.max(Math.abs(Fx) / scalaF, Math.abs(Fy) / scalaF, Math.abs(Mz) / scalaM);
    if (d > peggiore) { peggiore = d; dove = id; }
  }

  return { peggiore, dove, esaminati };
}

/**
 * M(b) − M(a) contro ∫T ds, per quadratura di Simpson su ogni tratto continuo.
 *
 * È la forma INTEGRALE della stessa identità che `COERENZA_DIFFERENZIALE`
 * verifica per derivazione, ed è più robusta: la derivata numerica amplifica
 * l'arrotondamento, l'integrale lo media. Con carico trapezoidale T è al più
 * quadratico, quindi Simpson è esatto e ciò che resta è solo arrotondamento.
 */
function confrontoIntegrale(
  ctx: ContestoTronco, d: DiagrammaEquilibrio,
): { scarto: number; campioni: number } {
  const L = d.L;
  if (L <= 0) return { scarto: 0, campioni: 0 };

  // estremi dei tratti continui: dove il diagramma ha salti o spigoli, cioè
  // dove le ascisse campionate si ripetono
  const bordi = [...new Set([0, ...d.ascisse, L])].sort((x, y) => x - y);
  // La scala è quella dell'INTERO diagramma, non del singolo tratto: vicino a
  // un estremo del momento ΔM tende a zero, e rapportarci l'errore darebbe un
  // numero enorme per uno scarto invisibile.
  const scala = Math.max(
    ...[...d.M].map(Math.abs), ...[...d.T].map((t) => Math.abs(t) * L), 1e-9,
  );
  let scarto = 0, campioni = 0;

  for (let k = 0; k + 1 < bordi.length; k++) {
    const a = bordi[k], b = bordi[k + 1];
    if (b - a < L * 1e-6) continue;
    const n = 8;                                  // pari, come vuole Simpson
    const h = (b - a) / n;
    let somma = 0;
    for (let i = 0; i <= n; i++) {
      const x = i === 0 ? a + h * 1e-9 : i === n ? b - h * 1e-9 : a + i * h;
      const peso = i === 0 || i === n ? 1 : i % 2 === 1 ? 4 : 2;
      somma += peso * valutaTronco(ctx, x).T;
    }
    const integrale = (h / 3) * somma;
    const dM = valutaTronco(ctx, b, -1).M - valutaTronco(ctx, a, 1).M;
    scarto = Math.max(scarto, Math.abs(dM - integrale) / scala);
    campioni++;
  }
  return { scarto, campioni };
}

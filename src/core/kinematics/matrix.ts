/**
 * Costruzione della MATRICE CINEMATICA A.
 *
 * Incognite: per ogni corpo rigido b, il moto infinitesimo (u_b, v_b, φ_b)
 * riferito al suo baricentro G_b. Lo spostamento di un punto P del corpo è
 *
 *     u_P = u_b − φ_b·(y_P − y_Gb)
 *     v_P = v_b + φ_b·(x_P − x_Gb)
 *
 * Ogni grado di vincolo (esterno o interno) è UNA riga di A che annulla una
 * combinazione lineare di queste quantità. Il sistema A·q = 0 descrive i moti
 * rigidi compatibili con i vincoli: il suo nucleo sono i MECCANISMI.
 *
 * SCALATURA DELLE COLONNE — le colonne di rotazione hanno coefficienti con le
 * dimensioni di una lunghezza, quelle di traslazione sono adimensionali. Senza
 * riscalare, il rango numerico dipenderebbe dall'unità di misura scelta e dalla
 * dimensione della struttura. Si usa quindi φ' = φ·L_c con L_c la dimensione
 * caratteristica del modello, e si riporta φ = φ'/L_c alla fine.
 *
 * CONTEGGIO DEI GRADI DI VINCOLO — le righe generate riproducono esattamente la
 * tabella classica:
 *   carrello 1 · biella 1 · cerniera 2 · bipendolo 2 · pattino 2 · incastro 3
 *   cerniera interna fra m aste 2(m−1) · bipendolo interno 2 · pattino interno 2
 * perché un'estremità svincolata genera una riga per ciascuna componente NON
 * rilasciata: una cerniera (M rilasciato) trasmette N e T, cioè 2 equazioni.
 */

import type { Progetto, Vincolo } from '../model/types.js';
import { geometriaAsta, type IndiceModello } from '../model/queries.js';
import { orientamentoVincolo } from '../model/orientamento.js';
import type { Decomposizione } from './bodies.js';

export interface RigaVincolo {
  /** descrizione leggibile, usata nei messaggi diagnostici */
  descrizione: string;
  /** origine: vincolo esterno su un nodo, oppure continuità interna */
  origine: 'esterno' | 'interno';
  nodoId: string;
  /** per i vincoli esterni traslazionali: retta d'azione della reazione */
  reazione?: { x: number; y: number; dx: number; dy: number };
  /**
   * Punto in cui la riga agisce. C'è SEMPRE, anche per le righe rotazionali,
   * che non hanno una retta d'azione ma vanno comunque disegnate da qualche
   * parte: senza questo, il momento d'incastro non avrebbe un posto dove
   * comparire e sparirebbe dal disegno.
   */
  punto?: { x: number; y: number };
  /** true se la riga impone una rotazione (non una traslazione) */
  rotazionale: boolean;
  /** tipo di vincolo esterno che ha generato la riga */
  tipoVincolo?: string;
  /** corpi coinvolti: uno per i vincoli esterni, due per le continuità */
  corpi: number[];
  /** componente descritta, per l'etichetta della reazione */
  componente: 'x' | 'y' | 'normale' | 'assiale' | 'rotazione';
}

export interface MatriceCinematica {
  /** A come array di righe, dimensione v × 3n (colonne rotazione già scalate) */
  A: number[][];
  /**
   * La stessa matrice SENZA la scalatura delle colonne di rotazione, cioè nelle
   * variabili fisiche (u, v, φ).
   *
   * Serve alla DUALITÀ STATICO-CINEMATICA: la matrice delle equazioni di
   * equilibrio dei corpi rigidi è la trasposta di questa. Il legame discende
   * dal principio dei lavori virtuali — per ogni moto rigido virtuale q il
   * lavoro delle reazioni x è xᵀ(A q) e quello dei carichi è Fᵀq, quindi
   * l'equilibrio equivale a  F + Aᵀx = 0  per ogni q.
   *
   * Costruire una sola geometria e usarla per entrambe garantisce che analisi
   * cinematica e calcolo delle reazioni non possano divergere.
   */
  ANonScalata: number[][];
  righe: RigaVincolo[];
  nCorpi: number;
  /** lunghezza caratteristica usata per la scalatura delle colonne di rotazione */
  Lc: number;
}

export function costruisciMatriceCinematica(
  progetto: Progetto,
  idx: IndiceModello,
  dec: Decomposizione,
): MatriceCinematica {
  const nCorpi = dec.corpi.length;
  const nCol = 3 * nCorpi;

  // dimensione caratteristica del modello
  let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
  for (const n of progetto.nodi) {
    xmin = Math.min(xmin, n.x); xmax = Math.max(xmax, n.x);
    ymin = Math.min(ymin, n.y); ymax = Math.max(ymax, n.y);
  }
  const Lc = Math.max(Math.hypot(xmax - xmin, ymax - ymin), 1e-9);

  const A: number[][] = [];
  const ANonScalata: number[][] = [];
  const righe: RigaVincolo[] = [];

  /** coefficienti dello spostamento del punto P del corpo b lungo la direzione d */
  const proiezione = (b: number, xP: number, yP: number, dx: number, dy: number) => {
    const corpo = dec.corpi[b];
    return {
      cu: dx,
      cv: dy,
      // φ scalata: coefficiente diviso per Lc perché la variabile è φ·Lc
      cphi: (-dx * (yP - corpo.yG) + dy * (xP - corpo.xG)) / Lc,
    };
  };

  const nuovaRiga = (): number[] => new Array(nCol).fill(0);

  const aggiungiTraslazione = (
    b: number, xP: number, yP: number, dx: number, dy: number,
    info: Omit<RigaVincolo, 'rotazionale' | 'corpi' | 'componente'>
        & { componente: RigaVincolo['componente'] },
  ) => {
    const r = nuovaRiga();
    const g = nuovaRiga();
    const c = proiezione(b, xP, yP, dx, dy);
    r[3 * b] += c.cu; r[3 * b + 1] += c.cv; r[3 * b + 2] += c.cphi;
    g[3 * b] += c.cu; g[3 * b + 1] += c.cv; g[3 * b + 2] += c.cphi * Lc;
    A.push(r);
    ANonScalata.push(g);
    righe.push({ ...info, punto: { x: xP, y: yP }, rotazionale: false, corpi: [b] });
  };

  const aggiungiRotazione = (
    b: number, punto: { x: number; y: number },
    info: Omit<RigaVincolo, 'rotazionale' | 'corpi' | 'componente'>,
  ) => {
    const r = nuovaRiga();
    const g = nuovaRiga();
    r[3 * b + 2] += 1;
    g[3 * b + 2] += 1;
    A.push(r);
    ANonScalata.push(g);
    righe.push({
      ...info, punto, rotazionale: true, corpi: [b], componente: 'rotazione',
    });
  };

  // ── vincoli esterni ────────────────────────────────────────────────
  for (const nodo of progetto.nodi) {
    const v: Vincolo | undefined = nodo.vincolo;
    if (!v || v.tipo === 'molla') continue;
    const b = dec.corpoMasterDelNodo.get(nodo.id);
    if (b === undefined) continue;   // nodo isolato: nessun corpo

    // UNA sola formula per l'orientamento, la stessa che usa il disegno:
    // û è la direzione di puntamento, e le reazioni dei vincoli direzionali
    // sono tutte lungo di essa. Nessun offset per tipo — è da lì che nasceva
    // la discrepanza fra cerniera e carrello con lo stesso angolo.
    const { u } = orientamentoVincolo(v.angolo);
    const base = { origine: 'esterno' as const, nodoId: nodo.id as string };

    switch (v.tipo) {
      case 'cerniera':
        aggiungiTraslazione(b, nodo.x, nodo.y, 1, 0, {
          ...base, descrizione: `cerniera in ${nodo.id}: u_x = 0`,
          reazione: { x: nodo.x, y: nodo.y, dx: 1, dy: 0 },
          tipoVincolo: 'cerniera', componente: 'x',
        });
        aggiungiTraslazione(b, nodo.x, nodo.y, 0, 1, {
          ...base, descrizione: `cerniera in ${nodo.id}: u_y = 0`,
          reazione: { x: nodo.x, y: nodo.y, dx: 0, dy: 1 },
          tipoVincolo: 'cerniera', componente: 'y',
        });
        break;
      case 'incastro':
        aggiungiTraslazione(b, nodo.x, nodo.y, 1, 0, {
          ...base, descrizione: `incastro in ${nodo.id}: u_x = 0`,
          reazione: { x: nodo.x, y: nodo.y, dx: 1, dy: 0 },
          tipoVincolo: 'incastro', componente: 'x',
        });
        aggiungiTraslazione(b, nodo.x, nodo.y, 0, 1, {
          ...base, descrizione: `incastro in ${nodo.id}: u_y = 0`,
          reazione: { x: nodo.x, y: nodo.y, dx: 0, dy: 1 },
          tipoVincolo: 'incastro', componente: 'y',
        });
        aggiungiRotazione(b, { x: nodo.x, y: nodo.y }, {
          ...base, descrizione: `incastro in ${nodo.id}: φ = 0`,
          tipoVincolo: 'incastro',
        });
        break;
      case 'carrello':
        // la reazione è lungo û: il carrello scorre nel piano perpendicolare
        aggiungiTraslazione(b, nodo.x, nodo.y, u[0], u[1], {
          ...base, descrizione: `carrello in ${nodo.id}: spostamento lungo û nullo`,
          reazione: { x: nodo.x, y: nodo.y, dx: u[0], dy: u[1] },
          tipoVincolo: 'carrello', componente: 'normale',
        });
        break;
      case 'biella':
        aggiungiTraslazione(b, nodo.x, nodo.y, u[0], u[1], {
          ...base, descrizione: `biella in ${nodo.id}: spostamento lungo û nullo`,
          reazione: { x: nodo.x, y: nodo.y, dx: u[0], dy: u[1] },
          tipoVincolo: 'biella', componente: 'assiale',
        });
        break;
      case 'bipendolo':
      case 'pattino':
        aggiungiTraslazione(b, nodo.x, nodo.y, u[0], u[1], {
          ...base, descrizione: `${v.tipo} in ${nodo.id}: spostamento lungo û nullo`,
          reazione: { x: nodo.x, y: nodo.y, dx: u[0], dy: u[1] },
          tipoVincolo: v.tipo, componente: 'normale',
        });
        aggiungiRotazione(b, { x: nodo.x, y: nodo.y }, {
          ...base, descrizione: `${v.tipo} in ${nodo.id}: φ = 0`,
          tipoVincolo: v.tipo,
        });
        break;
    }
  }

  // ── continuità interne ─────────────────────────────────────────────
  for (const nd of dec.nodi) {
    if (nd.svincolate.length === 0) continue;
    const bMaster = dec.corpoMasterDelNodo.get(nd.nodoId);
    if (bMaster === undefined) continue;
    const nodo = idx.nodi.get(nd.nodoId)!;

    for (const e of nd.svincolate) {
      const bAltro = dec.corpoDiAsta.get(e.astaId)!;
      if (bAltro === bMaster) continue;   // già lo stesso corpo: nulla da imporre

      const asta = idx.aste.get(e.astaId)!;
      const g = geometriaAsta(asta, idx);
      const ex: [number, number] = [g.c, g.s];
      const ey: [number, number] = [-g.s, g.c];
      const base = { origine: 'interno' as const, nodoId: nd.nodoId as string };

      const continuitaTraslazione = (d: [number, number], nome: string) => {
        const r = nuovaRiga();
        const g = nuovaRiga();
        const c2 = proiezione(bAltro, nodo.x, nodo.y, d[0], d[1]);
        const c1 = proiezione(bMaster, nodo.x, nodo.y, d[0], d[1]);
        r[3 * bAltro] += c2.cu; r[3 * bAltro + 1] += c2.cv; r[3 * bAltro + 2] += c2.cphi;
        r[3 * bMaster] -= c1.cu; r[3 * bMaster + 1] -= c1.cv; r[3 * bMaster + 2] -= c1.cphi;
        g[3 * bAltro] += c2.cu; g[3 * bAltro + 1] += c2.cv;
        g[3 * bAltro + 2] += c2.cphi * Lc;
        g[3 * bMaster] -= c1.cu; g[3 * bMaster + 1] -= c1.cv;
        g[3 * bMaster + 2] -= c1.cphi * Lc;
        A.push(r);
        ANonScalata.push(g);
        righe.push({
          ...base, rotazionale: false,
          descrizione: `continuità ${nome} in ${nd.nodoId} (asta ${e.astaId})`,
          corpi: [bAltro, bMaster],
          componente: nome === 'assiale' ? 'assiale' : 'normale',
          reazione: { x: nodo.x, y: nodo.y, dx: d[0], dy: d[1] },
        });
      };

      if (!e.svincolo.N) continuitaTraslazione(ex, 'assiale');
      if (!e.svincolo.T) continuitaTraslazione(ey, 'trasversale');
      if (!e.svincolo.M) {
        const r = nuovaRiga();
        const g = nuovaRiga();
        r[3 * bAltro + 2] += 1;
        r[3 * bMaster + 2] -= 1;
        g[3 * bAltro + 2] += 1;
        g[3 * bMaster + 2] -= 1;
        A.push(r);
        ANonScalata.push(g);
        righe.push({
          ...base, rotazionale: true,
          descrizione: `continuità rotazionale in ${nd.nodoId} (asta ${e.astaId})`,
          punto: { x: nodo.x, y: nodo.y },
          corpi: [bAltro, bMaster], componente: 'rotazione',
        });
      }
    }
  }

  return { A, ANonScalata, righe, nCorpi, Lc };
}

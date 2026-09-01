/**
 * Solutore statico lineare: partizione, risoluzione, reazioni, recupero.
 *
 * METODO DELLA PARTIZIONE (non penalty). Riordinati i DOF in liberi (f) e
 * vincolati (c):
 *
 *     ⎡K_ff  K_fc⎤ ⎧u_f⎫   ⎧F_f⎫
 *     ⎣K_cf  K_cc⎦ ⎩u_c⎭ = ⎩F_c + R_c⎭
 *
 *     K_ff·u_f = F_f − K_fc·u_c          (u_c = cedimenti imposti)
 *     R_c      = K_cf·u_f + K_cc·u_c − F_c
 *
 * I metodi a penalità richiedono di scegliere "a occhio" un numero grande e
 * degradano il condizionamento; la partizione è esatta e non ha parametri.
 */

import { CostruttoreSparso, preparaSolutore } from '../linalg/skyline.js';
import type {
  DiagnosticaSolutore, Reazione, RisultatoAnalisi, RisultatoAsta,
  VerificaEquilibrio,
} from '../model/results.js';
import type { Progetto } from '../model/types.js';
import { moltiplica } from './transform.js';
import type { SistemaAssemblato } from './assemble.js';
import { azioniInterne, ascisseCampionamento, puntiNotevoli } from '../post/internalActions.js';
import { deformataLocale } from '../post/deflection.js';
import { idx6 } from './stiffness.js';

export interface EsitoSolutore {
  spostamenti: Float64Array;
  reazioni: Reazione[];
  aste: RisultatoAsta[];
  equilibrio: VerificaEquilibrio;
  diagnostica: DiagnosticaSolutore;
  spostamentoMassimo: number;
}

export function risolvi(
  sistema: SistemaAssemblato,
  progetto: Progetto,
  campioniPerAsta: number,
): EsitoSolutore {
  const t0 = performance.now();
  const { nDof, terne, F, vincolati } = sistema;

  // ── partizione ────────────────────────────────────────────────────────
  const valoreVincolato = new Float64Array(nDof);
  const eVincolato = new Uint8Array(nDof);
  for (const { dof, valore } of vincolati) {
    eVincolato[dof] = 1;
    valoreVincolato[dof] = valore;
  }
  const mapLibero = new Int32Array(nDof).fill(-1);
  let nLiberi = 0;
  for (let i = 0; i < nDof; i++) if (!eVincolato[i]) mapLibero[i] = nLiberi++;

  // ── K_ff e termine noto ridotto ───────────────────────────────────────
  const cff = new CostruttoreSparso(nLiberi);
  const rhs = new Float64Array(nLiberi);
  for (let i = 0; i < nDof; i++) if (!eVincolato[i]) rhs[mapLibero[i]] = F[i];

  for (const { i, j, v } of terne) {
    const li = eVincolato[i] ? -1 : mapLibero[i];
    const lj = eVincolato[j] ? -1 : mapLibero[j];
    if (li >= 0 && lj >= 0) {
      cff.aggiungi(li, lj, v);
    } else if (li >= 0 && lj < 0) {
      rhs[li] -= v * valoreVincolato[j];
    } else if (li < 0 && lj >= 0) {
      rhs[lj] -= v * valoreVincolato[i];
    }
  }

  const solutore = preparaSolutore(cff, nLiberi > 1);
  const uf = nLiberi > 0 ? solutore.risolvi(rhs) : new Float64Array(0);

  // spostamenti completi nel riferimento NODALE
  const uNod = new Float64Array(nDof);
  for (let i = 0; i < nDof; i++) {
    uNod[i] = eVincolato[i] ? valoreVincolato[i] : uf[mapLibero[i]];
  }

  // ── reazioni: R = K·u − F sui DOF vincolati ───────────────────────────
  const acc = new Float64Array(nDof);
  for (const { i, j, v } of terne) {
    acc[i] += v * uNod[j];
    if (i !== j) acc[j] += v * uNod[i];
  }
  const reazioniPerDof = new Float64Array(nDof);
  for (let i = 0; i < nDof; i++) {
    if (eVincolato[i]) reazioniPerDof[i] = acc[i] - F[i];
  }
  // le molle non sono vincoli rigidi ma esercitano comunque una forza
  for (const [dof, k] of sistema.molle) {
    if (!eVincolato[dof]) reazioniPerDof[dof] = -k * uNod[dof];
  }

  // ── ritorno agli assi globali ─────────────────────────────────────────
  const uGlob = new Float64Array(nDof);
  const reazioni: Reazione[] = [];
  progetto.nodi.forEach((nodo, k) => {
    const b = sistema.angoliNodali[k];
    const c = Math.cos(b), s = Math.sin(b);
    const ux = uNod[3 * k], uy = uNod[3 * k + 1];
    uGlob[3 * k] = c * ux - s * uy;
    uGlob[3 * k + 1] = s * ux + c * uy;
    uGlob[3 * k + 2] = uNod[3 * k + 2];

    const rx = reazioniPerDof[3 * k], ry = reazioniPerDof[3 * k + 1];
    const rz = reazioniPerDof[3 * k + 2];
    // Un nodo vincolato compare ANCHE con reazione nulla: «questo appoggio non
    // porta niente» è un risultato, non un'assenza di risultato. Ometterlo
    // renderebbe vuoto il confronto fra i due metodi proprio sui casi in cui
    // tutte le reazioni si annullano.
    const vincolato = eVincolato[3 * k] === 1 || eVincolato[3 * k + 1] === 1
      || eVincolato[3 * k + 2] === 1;
    if (vincolato || rx !== 0 || ry !== 0 || rz !== 0) {
      reazioni.push({
        nodoId: nodo.id,
        fx: c * rx - s * ry,
        fy: s * rx + c * ry,
        mz: rz,
      });
    }
  });

  // ── recupero per asta ─────────────────────────────────────────────────
  const aste: RisultatoAsta[] = [];
  for (const el of sistema.elementi) {
    const dNod = new Float64Array(6);
    for (let a = 0; a < 6; a++) dNod[a] = uNod[el.dof[a]];
    const dGlob = moltiplica(el.R, dNod);        // nodale → globale
    const dLocCond = moltiplica(el.T, dGlob);    // globale → locale
    const dLoc = el.condensato.recuperaSpostamenti(dLocCond);

    // forze d'estremità: s = k_piena·d_completo − f_eq_piena
    const s = new Float64Array(6);
    for (let a = 0; a < 6; a++) {
      let acc2 = 0;
      for (let b = 0; b < 6; b++) acc2 += el.kLocale[idx6(a, b)] * dLoc[b];
      s[a] = acc2 - el.feqLocale[a];
    }

    const L = el.geometria.L;
    const ascisse = ascisseCampionamento(el.carichiCampata, L, campioniPerAsta);
    const N = new Float64Array(ascisse.length);
    const T = new Float64Array(ascisse.length);
    const M = new Float64Array(ascisse.length);
    for (let i = 0; i < ascisse.length; i++) {
      const a = azioniInterne(s, el.carichiCampata, L, ascisse[i]);
      N[i] = a.N; T[i] = a.T; M[i] = a.M;
    }

    const EI = el.proprieta.E * el.proprieta.I;
    const EA = el.proprieta.E * el.proprieta.A;
    const GAv = el.timoshenko
      ? el.proprieta.G * (el.proprieta.Av ?? el.proprieta.A * (5 / 6))
      : 0;
    const def = deformataLocale(s, dLoc, el.carichiCampata, L, EI, EA, GAv, ascisse);

    const notevoli = puntiNotevoli(s, el.carichiCampata, L, ascisse);

    aste.push({
      astaId: el.asta.id,
      lunghezza: L,
      forzeEstremita: [s[0], s[1], s[2], s[3], s[4], s[5]] as const,
      ascisse: Float64Array.from(ascisse),
      N, T, M,
      uLocale: def.u,
      vLocale: def.v,
      puntiNotevoli: notevoli,
      frecciaMassima: def.frecciaMassima,
      xFreccia: def.xFreccia,
      estremi: {
        Nmin: Math.min(...N), Nmax: Math.max(...N),
        Tmin: Math.min(...T), Tmax: Math.max(...T),
        Mmin: Math.min(...M), Mmax: Math.max(...M),
      },
    });
  }

  // ── verifica di equilibrio globale ────────────────────────────────────
  const equilibrio = verificaEquilibrio(progetto, sistema, reazioni);

  /**
   * Spostamento massimo OVUNQUE, non solo nei nodi.
   *
   * Contare i soli nodi sarebbe fuorviante proprio nei casi più comuni: una
   * trave appoggiata modellata con un solo elemento ha entrambi i nodi
   * vincolati, quindi darebbe spostamento nullo mentre in mezzeria si inflette.
   * Con un valore nullo l'amplificazione automatica della deformata non
   * saprebbe che fattore usare, e il disegno resterebbe piatto.
   */
  let spostamentoMassimo = 0;
  for (let k = 0; k < progetto.nodi.length; k++) {
    const d = Math.hypot(uGlob[3 * k], uGlob[3 * k + 1]);
    if (d > spostamentoMassimo) spostamentoMassimo = d;
  }
  /*
   * IL MASSIMO SI CERCA PUNTO PER PUNTO, non sommando due massimi.
   *
   * Prima si prendeva lo spostamento maggiore fra i due estremi e vi si
   * sommava la freccia rispetto alla corda. Sono due massimi raggiunti in
   * punti DIVERSI — l'uno all'estremo, l'altra a metà — e sommarli dà un
   * maggiorante, non il massimo. Su una mensola con forza in punta l'errore
   * vale esattamente il 19,245 %: la freccia rispetto alla corda inclinata
   * misura 0,19245·δ e finiva sommata a δ.
   *
   * `uLocale` e `vLocale` sono già gli spostamenti ASSOLUTI campionati lungo
   * l'asta, quindi il massimo è il loro modulo maggiore e basta cercarlo.
   */
  for (const a of aste) {
    // i campioni: corretti sempre, ma il massimo di una curva cade fra due
    // di essi e viene leggermente sottostimato
    for (let i = 0; i < a.uLocale.length; i++) {
      const d = Math.hypot(a.uLocale[i], a.vLocale[i]);
      if (d > spostamentoMassimo) spostamentoMassimo = d;
    }

    // e il punto di freccia massima, dove `frecciaMassima` è ESATTA perché
    // ricavata per integrazione e non per campionamento. Lì lo spostamento
    // assoluto è quello della corda più la freccia, che le è ortogonale: è il
    // termine che restituisce il valore esatto sulla trave appoggiata, dove
    // la corda non si muove.
    const ultimo = a.uLocale.length - 1;
    if (ultimo < 1 || a.lunghezza <= 0) continue;
    const s = a.xFreccia / a.lunghezza;
    const uc = a.uLocale[0] + (a.uLocale[ultimo] - a.uLocale[0]) * s;
    const vc = a.vLocale[0] + (a.vLocale[ultimo] - a.vLocale[0]) * s;
    for (const verso of [1, -1]) {
      const d = Math.hypot(uc, vc + verso * a.frecciaMassima);
      if (d > spostamentoMassimo) spostamentoMassimo = d;
    }
  }

  const diagnostica: DiagnosticaSolutore = {
    pivotMinimo: solutore.pivotMinimo,
    dofSingolari: solutore.dofSingolari.map((d) => {
      // riporta l'indice compatto al DOF globale
      for (let i = 0; i < nDof; i++) if (mapLibero[i] === d) return i;
      return -1;
    }).filter((d) => d >= 0),
    nucleo: solutore.nucleo().map((v) => {
      const pieno = new Float64Array(nDof);
      for (let i = 0; i < nDof; i++) if (mapLibero[i] >= 0) pieno[i] = v[mapLibero[i]];
      return pieno;
    }),
    numeroDof: nDof,
    numeroDofLiberi: nLiberi,
    tempoMs: performance.now() - t0,
  };

  return { spostamenti: uGlob, reazioni, aste, equilibrio, diagnostica, spostamentoMassimo };
}

/**
 * Controllo indipendente: la somma di carichi applicati e reazioni deve
 * annullarsi. Non è una formalità — intercetta errori di segno nei carichi
 * equivalenti, vincoli obliqui ruotati male, svincoli incoerenti.
 */
function verificaEquilibrio(
  progetto: Progetto,
  sistema: SistemaAssemblato,
  reazioni: Reazione[],
): VerificaEquilibrio {
  let Fx = 0, Fy = 0, Mz = 0, scalaF = 0, scalaM = 0;

  /*
   * LUNGHEZZA CARATTERISTICA — serve a rendere confrontabili forze e momenti.
   *
   * Il residuo era `hypot(ΣFx, ΣFy)` e la scala la somma delle sole forze.
   * Due conseguenze, entrambe sbagliate: uno squilibrio di MOMENTO non
   * compariva affatto nel residuo, e su una struttura caricata da coppie la
   * scala tendeva a zero, così un residuo di 1e-11 N diventava un «64 %» che
   * faceva fallire l'autoverifica su una soluzione perfettamente equilibrata.
   *
   * Dividendo i momenti per la diagonale del modello si ottiene una forza
   * equivalente, e le due famiglie tornano sommabili.
   */
  const xs = progetto.nodi.map((n) => n.x);
  const ys = progetto.nodi.map((n) => n.y);
  const diagonale = progetto.nodi.length > 0
    ? Math.max(1e-9, Math.hypot(
        Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)))
    : 1;

  // carichi applicati, riportati in assi globali
  progetto.nodi.forEach((nodo, k) => {
    const b = sistema.angoliNodali[k];
    const c = Math.cos(b), s = Math.sin(b);
    const fx0 = sistema.F[3 * k], fy0 = sistema.F[3 * k + 1], mz0 = sistema.F[3 * k + 2];
    const fx = c * fx0 - s * fy0;
    const fy = s * fx0 + c * fy0;
    Fx += fx; Fy += fy;
    Mz += mz0 + nodo.x * fy - nodo.y * fx;
    scalaF += Math.abs(fx) + Math.abs(fy);
    scalaM += Math.abs(mz0);
  });

  const indice = sistema.indiceNodo;
  for (const r of reazioni) {
    const k = indice.get(r.nodoId)!;
    const nodo = progetto.nodi[k];
    Fx += r.fx; Fy += r.fy;
    Mz += r.mz + nodo.x * r.fy - nodo.y * r.fx;
    scalaF += Math.abs(r.fx) + Math.abs(r.fy);
    scalaM += Math.abs(r.mz);
  }

  // il momento entra nel residuo, che prima lo ignorava: una struttura
  // squilibrata alla rotazione passava il controllo
  const norma = Math.hypot(Fx, Fy, Mz / diagonale);
  const scala = scalaF + scalaM / diagonale;
  // sotto la soglia il problema non ha carichi degni di questo nome, e un
  // rapporto fra due quantità entrambe nulle non dice niente: si confronta
  // in assoluto
  const residuoRelativo = scala > 1e-6 ? norma / scala : norma;
  return {
    sommaFx: Fx, sommaFy: Fy, sommaMz: Mz,
    residuoRelativo,
    soddisfatto: residuoRelativo < 1e-8,
  };
}

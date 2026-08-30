/**
 * Assemblaggio del sistema globale.
 *
 * NUMERAZIONE DEI DOF — ogni nodo ha sempre 3 gradi di libertà:
 *     dof(nodo k) = 3k, 3k+1, 3k+2  →  (u_x, u_y, θ_z)
 * Uniforme e prevedibile; l'eventuale rigidezza rotazionale mancante (tutte le
 * aste incernierate su un nodo) viene rilevata come pivot nullo e segnalata.
 *
 * VINCOLI OBLIQUI — i DOF dei nodi con vincolo inclinato sono espressi in un
 * riferimento RUOTATO dell'angolo del vincolo, così che il vincolo risulti
 * allineato a un asse. Le matrici di elemento vengono pre-ruotate in
 * assemblaggio; gli spostamenti si riportano in assi globali alla fine.
 */

import { CostruttoreSparso, type Terna } from '../linalg/skyline.js';
import type {
  Asta, ElementId, NodeId, Progetto, Vincolo,
} from '../model/types.js';
import {
  geometriaAsta, globaleALocale, materialeDi, sezioneDi, usaTimoshenko,
  type GeometriaAsta, type IndiceModello,
} from '../model/queries.js';
import { rigidezzaLocale, type Mat6, type ProprietaAsta, type Vec6, idx6 } from './stiffness.js';
import { congruenza, matriceRotazione, matriceRotazioneNodi, moltiplicaTrasposta } from './transform.js';
import { condensa, dofRilasciati, type ElementoCondensato } from './releases.js';
import { aggiungiTermico, raccogliCarichi, type CarichiCampata } from './loads.js';
import { feqDistribuito } from './fixedEnd.js';
import { G_GRAVITA } from '../units.js';

/** Angolo di rotazione del riferimento nodale imposto dal vincolo. */
export function angoloNodale(v: Vincolo | undefined): number {
  if (!v) return 0;
  switch (v.tipo) {
    case 'carrello':
    case 'bipendolo':
    case 'pattino':
    case 'biella':
    case 'molla':
      return v.angolo;
    // cerniera e incastro bloccano direzioni simmetriche: nessuna rotazione utile
    default:
      return 0;
  }
}

/**
 * DOF bloccati dal vincolo, espressi nel riferimento NODALE ruotato di
 * `angolo`. Indici: 0 = x', 1 = y', 2 = rotazione.
 *
 * Il riferimento è quello della convenzione assoluta: **y' coincide con û**,
 * la direzione di puntamento. Tutti i vincoli direzionali bloccano y', senza
 * eccezioni — carrello, biella, bipendolo, pattino. La biella aveva una
 * convenzione propria (bloccava x', cioè l'asse) ed era l'ultimo posto in cui
 * lo stesso angolo significava due cose diverse a seconda del tipo.
 */
export function dofBloccati(v: Vincolo | undefined): number[] {
  if (!v) return [];
  switch (v.tipo) {
    case 'incastro': return [0, 1, 2];
    case 'cerniera': return [0, 1];
    // tutti i direzionali bloccano y' = û
    case 'carrello': return [1];
    case 'biella': return [1];
    // bipendolo e pattino aggiungono la rotazione
    case 'bipendolo':
    case 'pattino': return [1, 2];
    case 'molla': return [];
  }
}

export interface ElementoAssemblato {
  asta: Asta;
  geometria: GeometriaAsta;
  proprieta: ProprietaAsta;
  timoshenko: boolean;
  /** rigidezza locale PIENA (prima della condensazione) */
  kLocale: Mat6;
  /** carichi equivalenti locali PIENI */
  feqLocale: Vec6;
  condensato: ElementoCondensato;
  /** indici globali dei 6 DOF */
  dof: number[];
  /** rotazione locale→globale */
  T: Mat6;
  /** rotazione riferimento nodale→globale */
  R: Mat6;
  carichiCampata: CarichiCampata;
}

export interface SistemaAssemblato {
  nDof: number;
  costruttore: CostruttoreSparso;
  terne: Terna[];
  /** vettore dei carichi nel riferimento NODALE */
  F: Float64Array;
  elementi: ElementoAssemblato[];
  /** dof → indice nodo */
  nodoDelDof: Int32Array;
  indiceNodo: Map<NodeId, number>;
  angoliNodali: Float64Array;
  /** DOF vincolati e valore imposto (riferimento nodale) */
  vincolati: { dof: number; valore: number }[];
  /** molle: dof → rigidezza (riferimento nodale) */
  molle: Map<number, number>;
  avvisi: string[];
}

export interface OpzioniAssemblaggio {
  includiPesoProprio: boolean;
}

export function assembla(
  progetto: Progetto,
  idx: IndiceModello,
  carichiDelCaso: Parameters<typeof raccogliCarichi>[0],
  opzioni: OpzioniAssemblaggio,
): SistemaAssemblato {
  const avvisi: string[] = [];
  const indiceNodo = new Map<NodeId, number>();
  progetto.nodi.forEach((n, k) => indiceNodo.set(n.id, k));
  const nNodi = progetto.nodi.length;
  const nDof = 3 * nNodi;

  const nodoDelDof = new Int32Array(nDof);
  for (let k = 0; k < nNodi; k++) {
    nodoDelDof[3 * k] = k; nodoDelDof[3 * k + 1] = k; nodoDelDof[3 * k + 2] = k;
  }

  const angoliNodali = new Float64Array(nNodi);
  progetto.nodi.forEach((n, k) => { angoliNodali[k] = angoloNodale(n.vincolo); });

  // geometrie
  const geometrie = new Map<ElementId, GeometriaAsta>();
  for (const a of progetto.aste) geometrie.set(a.id, geometriaAsta(a, idx));

  const raccolta = raccogliCarichi(carichiDelCaso, geometrie);

  const costruttore = new CostruttoreSparso(nDof);
  const F = new Float64Array(nDof);
  const elementi: ElementoAssemblato[] = [];

  for (const asta of progetto.aste) {
    const g = geometrie.get(asta.id)!;
    const mat = materialeDi(asta, idx);
    const sez = sezioneDi(asta, idx);
    const prop: ProprietaAsta = {
      E: mat.E, G: mat.G, A: sez.A, I: sez.I, L: g.L,
      ...(sez.Av !== undefined ? { Av: sez.Av } : {}),
    };
    const timo = usaTimoshenko(asta, idx);
    if (timo && (asta.teoria ?? 'auto') === 'auto') {
      avvisi.push(
        `Asta ${asta.id}: L/h = ${(g.L / sez.h).toFixed(1)} < 10. ` +
        `L'ipotesi di Eulero-Bernoulli non è appropriata: si usa Timoshenko.`,
      );
    }
    const kLocale = rigidezzaLocale(prop, timo);

    // carichi equivalenti locali
    const feqLocale = new Float64Array(6);
    const base = raccolta.feqLocale.get(asta.id);
    if (base) for (let i = 0; i < 6; i++) feqLocale[i] += base[i];

    const t = raccolta.termici.get(asta.id);
    if (t) aggiungiTermico(feqLocale, t, mat.E, sez.A, sez.I, mat.alpha, sez.h);

    const carichiCampata: CarichiCampata =
      raccolta.campata.get(asta.id) ?? { distribuiti: [], forze: [], momenti: [] };

    // Peso proprio: carico uniforme verticale (globale) proiettato in locale.
    // q_glob = (0, -ρ·A·g)  →  q_loc = ( s·q_y , c·q_y ) con (c,s) dell'asse x locale.
    if (opzioni.includiPesoProprio && (asta.pesoProprio ?? true) && mat.rho > 0) {
      const qyGlob = -mat.rho * sez.A * G_GRAVITA;
      const [qxLoc, qyLoc] = globaleALocale(g, 0, qyGlob);
      carichiCampata.distribuiti.push({
        s1: 0, s2: 1, qx1: qxLoc, qx2: qxLoc, qy1: qyLoc, qy2: qyLoc,
      });
      const f = feqDistribuito(
        { sIniziale: 0, sFinale: 1, qxIniziale: qxLoc, qxFinale: qxLoc,
          qyIniziale: qyLoc, qyFinale: qyLoc }, g.L);
      for (let i = 0; i < 6; i++) feqLocale[i] += f[i];
    }

    const rilasci = dofRilasciati(asta.svincolo.iniziale, asta.svincolo.finale);
    const cond = condensa(kLocale, feqLocale, rilasci);
    if (cond.degenere) {
      avvisi.push(
        `Asta ${asta.id}: gli svincoli dichiarati la rendono scollegata ` +
        `(la stessa componente è rilasciata a entrambe le estremità).`,
      );
    }

    const T = matriceRotazione(g.c, g.s);
    const ki = indiceNodo.get(asta.nodoIniziale)!;
    const kj = indiceNodo.get(asta.nodoFinale)!;
    const R = matriceRotazioneNodi(angoliNodali[ki], angoliNodali[kj]);

    // locale → globale → nodale
    const kGlob = congruenza(T, cond.k);
    const kNod = congruenza(R, kGlob);
    const fGlob = moltiplicaTrasposta(T, cond.f);
    const fNod = moltiplicaTrasposta(R, fGlob);

    const dof = [3 * ki, 3 * ki + 1, 3 * ki + 2, 3 * kj, 3 * kj + 1, 3 * kj + 2];
    for (let a = 0; a < 6; a++) {
      F[dof[a]] += fNod[a];
      for (let b = 0; b < 6; b++) {
        const v = kNod[idx6(a, b)];
        if (v !== 0) costruttore.aggiungi(dof[a], dof[b], v);
      }
    }

    elementi.push({
      asta, geometria: g, proprieta: prop, timoshenko: timo,
      kLocale, feqLocale, condensato: cond, dof, T, R, carichiCampata,
    });
  }

  // carichi nodali (assi globali → riferimento nodale)
  for (const [nodoId, v] of raccolta.nodali.perNodo) {
    const k = indiceNodo.get(nodoId);
    if (k === undefined) continue;
    const b = angoliNodali[k];
    const c = Math.cos(b), s = Math.sin(b);
    F[3 * k] += c * v[0] + s * v[1];
    F[3 * k + 1] += -s * v[0] + c * v[1];
    F[3 * k + 2] += v[2];
  }

  // vincoli e cedimenti
  const vincolati: { dof: number; valore: number }[] = [];
  const molle = new Map<number, number>();
  for (const nodo of progetto.nodi) {
    const k = indiceNodo.get(nodo.id)!;
    const v = nodo.vincolo;
    if (!v) continue;

    if (v.tipo === 'molla') {
      const r = v.rigidezza;
      if (r) {
        if (r.kx !== null) { costruttore.aggiungi(3 * k, 3 * k, r.kx); molle.set(3 * k, r.kx); }
        if (r.ky !== null) { costruttore.aggiungi(3 * k + 1, 3 * k + 1, r.ky); molle.set(3 * k + 1, r.ky); }
        if (r.krz !== null) { costruttore.aggiungi(3 * k + 2, 3 * k + 2, r.krz); molle.set(3 * k + 2, r.krz); }
      }
      continue;
    }

    const ced = raccolta.nodali.cedimenti.get(nodo.id);
    const b = angoliNodali[k];
    const c = Math.cos(b), s = Math.sin(b);
    // cedimento globale → nodale
    const cedNod: [number, number, number] = ced
      ? [c * ced[0] + s * ced[1], -s * ced[0] + c * ced[1], ced[2]]
      : [0, 0, 0];

    for (const d of dofBloccati(v)) {
      vincolati.push({ dof: 3 * k + d, valore: cedNod[d] });
    }
  }

  return {
    nDof, costruttore, terne: costruttore.terne(), F, elementi,
    nodoDelDof, indiceNodo, angoliNodali, vincolati, molle, avvisi,
  };
}

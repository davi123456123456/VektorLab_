/**
 * SCHEMA DEL GENERATORE → Progetto.
 *
 * Il generatore sintetico (Python, `addestramento/generatore/schema.py`)
 * descrive ogni struttura in un JSON piccolo e leggibile. Qui diventa un
 * `Progetto` con il builder dell'app: il formato `.vektor` lo conosce solo
 * TypeScript, e così non c'è un secondo posto da tenere allineato.
 *
 * Unità come nella lettura: L = 1 m, q = 1 kN/m, F = 1 kN, M = 1 kN·m.
 * Angoli dello schema in GRADI (vincoli: puntamento di VektorLab; carichi:
 * direzione della punta).
 */

import { progetto as nuovoProgetto } from '../core/builder.js';
import { migra } from '../core/model/migrazione.js';
import type { ElementId, NodeId, Progetto } from '../core/model/types.js';
import { direzioneDistribuito } from './traduci.js';

type TipoVincoloSchema = 'incastro' | 'cerniera' | 'carrello' | 'bipendolo' | 'pattino' | 'biella';

export interface SchemaGenerato {
  famiglia: string;
  nodi: [number, number][];
  aste: [number, number][];
  vincoli: ({ tipo: TipoVincoloSchema; angolo: number } & ({ nodo: number } | { asta: number; s: number }))[];
  sconnessioni: { nodo: number; tipo: 'cerniera' | 'bipendolo' | 'pattino'; svincolate: number[] | null }[];
  carichi: (
    | { tipo: 'distribuito'; asta: number; s1: number; s2: number; direzione: number; coefficiente: number }
    | ({ tipo: 'forza'; direzione: number; coefficiente: number } & ({ nodo: number } | { asta: number; s: number }))
    | ({ tipo: 'momento'; verso: 1 | -1; coefficiente: number } & ({ nodo: number } | { asta: number; s: number }))
  )[];
}

const MATERIALE = 'S275';
const SEZIONE = 'IPE 300';
const KILO = 1000;
const GRADI = Math.PI / 180;

export function schemaInProgetto(s: SchemaGenerato): Progetto {
  const b = nuovoProgetto(s.famiglia);
  const nodi: NodeId[] = s.nodi.map(([x, y]) => b.nodo(x, y));
  const aste: ElementId[] = s.aste.map(([i, j]) => b.asta(nodi[i], nodi[j], MATERIALE, SEZIONE));

  for (const v of s.vincoli) {
    if ('nodo' in v) b.vincolo(nodi[v.nodo], v.tipo, v.angolo * GRADI);
    else b.vincoloSuAsta(aste[v.asta], v.s, v.tipo, v.angolo * GRADI);
  }

  for (const c of s.sconnessioni) {
    if (c.svincolate === null) {
      b.sconnessioneNodale(nodi[c.nodo], c.tipo);
      continue;
    }
    const convergenti = s.aste
      .map((a, k) => ({ a, k }))
      .filter(({ a }) => a[0] === c.nodo || a[1] === c.nodo)
      .map(({ k }) => k);
    const master = convergenti.find((k) => !c.svincolate!.includes(k));
    b.sconnessioneNodale(nodi[c.nodo], c.tipo, {
      ...(master !== undefined ? { astaMaster: aste[master] } : {}),
      asteSvincolate: c.svincolate.map((k) => aste[k]),
    });
  }

  for (const c of s.carichi) {
    if (c.tipo === 'distribuito') {
      const { modo, alpha, q } = direzioneDistribuito(c.direzione * GRADI, c.coefficiente * KILO);
      b.distribuito(aste[c.asta], q, { s1: c.s1, s2: c.s2, modo, ...(alpha !== undefined ? { alpha } : {}) });
    } else if (c.tipo === 'forza') {
      const fx = pulito(c.coefficiente * KILO * Math.cos(c.direzione * GRADI));
      const fy = pulito(c.coefficiente * KILO * Math.sin(c.direzione * GRADI));
      if ('nodo' in c) b.forza(nodi[c.nodo], fx, fy);
      else b.forzaInCampata(aste[c.asta], c.s, fx, fy, 'globale');
    } else {
      const mz = c.verso * c.coefficiente * KILO;
      if ('nodo' in c) b.momento(nodi[c.nodo], mz);
      else b.momentoInCampata(aste[c.asta], c.s, mz);
    }
  }
  return migra(b.costruisci());
}

function pulito(v: number): number {
  return Math.abs(v) < 1e-9 ? 0 : v;
}

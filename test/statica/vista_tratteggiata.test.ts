/**
 * I risultati LETTI DALLA TRATTEGGIATA.
 *
 * Il motore restituisce N, T e M nel riferimento naturale dell'asta (fibra di
 * riferimento dal lato −ŷ). La tratteggiata disegnata può stare dall'altra
 * parte — per coerenza lungo un membro piegato, o perché l'utente l'ha
 * ribaltata — e allora i segni di T e di M, letti rispetto a lei, si
 * invertono. Questi test fissano tre cose:
 *
 *   1. il calcolo non cambia: la vista è una copia, l'originale resta intatto;
 *   2. la regola del disegno — N e T negativi dal lato della tratteggiata, M
 *      negativo dal lato opposto — vale su ogni asta, qualunque sia il lato;
 *   3. il momento resta disegnato sulle fibre TESE: cambia il segno scritto,
 *      non la posizione fisica del diagramma.
 */

import { describe, it, expect } from 'vitest';
import { esempi } from '../../src/state/esempi.js';
import { analizza, espandi } from '../../src/core/index.js';
import { progetto } from '../../src/core/builder.js';
import { preset } from '../../src/core/materials/sezioniParametriche.js';
import {
  latiDelCalcolo, vistaDallaTratteggiata,
} from '../../src/core/model/tratteggiata.js';
import { latoDelPositivo } from '../../src/render/diagrammi.js';
import type { Progetto, RisultatoAnalisi } from '../../src/core/index.js';

function portale(): { p: Progetto; r: RisultatoAnalisi } {
  const p = esempi.find((e) => e.nome === 'Portale')!.costruisci();
  return { p, r: [...analizza(p).perCaso.values()][0] };
}

describe('lati della tratteggiata per i risultati', () => {
  it('nel portale la tratteggiata sta all\'esterno: lato −1 su tutte le aste', () => {
    const { p } = portale();
    const lati = latiDelCalcolo(p, espandi(p).progetto);
    expect([...lati.values()]).toEqual([-1, -1, -1]);
  });

  it('i tratti di un\'asta spezzata prendono il lato dell\'asta originale', () => {
    const b = progetto('trave su tre appoggi');
    const s = b.sezioneParametrica('s', preset('IPE 200'));
    const n1 = b.nodo(8, 0), n2 = b.nodo(0, 0);
    const a = b.asta(n1, n2, 'S275', s);           // disegnata da destra
    b.vincolo(n1, 'cerniera');
    b.vincolo(n2, 'carrello');
    b.vincoloSuAsta(a, 0.5, 'carrello');
    const p = b.costruisci();
    const esp = espandi(p);
    const tratti = esp.perOriginale.get(a)!;
    expect(tratti.length).toBe(2);
    const lati = latiDelCalcolo(p, esp.progetto);
    const latoOriginale = latiDelCalcolo(p, p).get(a);
    for (const t of tratti) expect(lati.get(t.id)).toBe(latoOriginale);
  });
});

describe('la vista dalla tratteggiata', () => {
  it('non tocca il risultato del calcolo', () => {
    const { p, r } = portale();
    const prima = r.aste.map((a) => [...a.T, ...a.M]);
    vistaDallaTratteggiata(r, latiDelCalcolo(p, espandi(p).progetto));
    expect(r.aste.map((a) => [...a.T, ...a.M])).toEqual(prima);
  });

  it('con lato −1 ribalta T e M, punti notevoli ed estremi compresi; N resta', () => {
    const { p, r } = portale();
    const v = vistaDallaTratteggiata(r, latiDelCalcolo(p, espandi(p).progetto));
    for (let k = 0; k < r.aste.length; k++) {
      const a = r.aste[k], b = v.aste[k];
      // opposti: la somma è zero (lo zero resta +0, quindi niente toBe(−x))
      for (let i = 0; i < a.T.length; i++) {
        expect(b.N[i]).toBe(a.N[i]);
        expect(b.T[i] + a.T[i]).toBe(0);
        expect(b.M[i] + a.M[i]).toBe(0);
      }
      a.puntiNotevoli.forEach((q, i) => {
        expect(b.puntiNotevoli[i].N).toBe(q.N);
        expect(b.puntiNotevoli[i].T + q.T).toBe(0);
        expect(b.puntiNotevoli[i].M + q.M).toBe(0);
      });
      expect(b.estremi.Mmax + a.estremi.Mmin).toBe(0);
      expect(b.estremi.Mmin + a.estremi.Mmax).toBe(0);
      expect(b.estremi.Tmax + a.estremi.Tmin).toBe(0);
      expect(b.estremi.Tmin + a.estremi.Tmax).toBe(0);
    }
  });

  it('a metà traverso il momento tende le fibre di sotto: rispetto alla tratteggiata (sopra) è negativo', () => {
    const { p, r } = portale();
    const v = vistaDallaTratteggiata(r, latiDelCalcolo(p, espandi(p).progetto));
    const traverso = v.aste.find((a) => a.astaId === 'a2')!;
    const minimo = Math.min(...traverso.M);
    expect(minimo / 1e3).toBeCloseTo(-75.63, 1);
  });

  it('dove la tratteggiata è al suo posto naturale non cambia niente', () => {
    const { r } = portale();
    const lati = new Map(r.aste.map((a) => [a.astaId, 1 as const]));
    const v = vistaDallaTratteggiata(r, lati);
    v.aste.forEach((b, k) => {
      expect([...b.T]).toEqual([...r.aste[k].T]);
      expect([...b.M]).toEqual([...r.aste[k].M]);
    });
  });
});

describe('da che parte si disegna', () => {
  // in unità di ŷ: la tratteggiata sta dal lato −ŷ·lato
  const latoTratteggiata = (lato: 1 | -1) => -lato;

  for (const lato of [1, -1] as const) {
    it(`lato ${lato}: N e T negativi dal lato della tratteggiata, M negativo dal lato opposto`, () => {
      for (const c of ['N', 'T'] as const) {
        const spostamento = -1 * latoDelPositivo(c, lato, true);
        expect(Math.sign(spostamento)).toBe(latoTratteggiata(lato));
      }
      const m = -1 * latoDelPositivo('M', lato, true);
      expect(Math.sign(m)).toBe(-latoTratteggiata(lato));
    });
  }

  it('il momento resta sulle fibre tese: con lato −1 la posizione fisica non cambia', () => {
    // M grezzo > 0 tende le fibre −ŷ: il diagramma deve stare dal lato −ŷ
    const Mgrezzo = 1;
    for (const lato of [1, -1] as const) {
      const mostrato = lato * Mgrezzo;
      expect(Math.sign(mostrato * latoDelPositivo('M', lato, true))).toBe(-1);
    }
  });
});

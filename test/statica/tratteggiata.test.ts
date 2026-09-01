/**
 * §2 — la tratteggiata e la sua coerenza lungo il membro.
 */

import { describe, it, expect } from 'vitest';
import { progetto } from '../../src/core/builder.js';
import { preset } from '../../src/core/materials/sezioniParametriche.js';
import {
  calcolaTratteggiata, conLato, latoEffettivo,
} from '../../src/core/model/tratteggiata.js';
import { invertiTratteggiata } from '../../src/state/commands.js';
import type { Progetto } from '../../src/core/model/types.js';

/**
 * Telaio a L in cui il secondo segmento è memorizzato AL CONTRARIO: parte dal
 * nodo lontano e arriva alla piega. È il caso che rompe la coerenza, e
 * capita ogni volta che si disegna la seconda asta partendo dall'altro capo.
 */
function aLConSegmentoRovescio(): Progetto {
  const p = progetto('L');
  const s = p.sezioneParametrica('s', preset('IPE 200'));
  const base = p.nodo(0, 0), piega = p.nodo(0, 4), fine = p.nodo(5, 4);
  p.asta(base, piega, 'S275', s);
  p.asta(fine, piega, 'S275', s);      // memorizzata all'indietro
  p.vincolo(base, 'incastro');
  return p.costruisci();
}

describe('coerenza lungo il membro', () => {
  it('il segmento memorizzato al contrario viene compensato', () => {
    const p = aLConSegmentoRovescio();
    const t = calcolaTratteggiata(p);
    const lati = p.aste.map((a) => t.lato.get(a.id));
    // i due segmenti NON possono avere lo stesso lato naturale: uno dei due
    // va ribaltato, altrimenti la tratteggiata cambierebbe faccia alla piega
    expect(new Set(lati).size).toBe(2);
  });

  it('con i segmenti memorizzati concordi non c è niente da compensare', () => {
    const p = progetto('L');
    const s = p.sezioneParametrica('s', preset('IPE 200'));
    const base = p.nodo(0, 0), piega = p.nodo(0, 4), fine = p.nodo(5, 4);
    p.asta(base, piega, 'S275', s);
    p.asta(piega, fine, 'S275', s);
    p.vincolo(base, 'incastro');
    const costruito = p.costruisci();
    const t = calcolaTratteggiata(costruito);
    expect([...t.lato.values()]).toEqual([1, 1]);
  });

  it('ogni asta appartiene a un membro e ha un lato', () => {
    const p = aLConSegmentoRovescio();
    const t = calcolaTratteggiata(p);
    for (const a of p.aste) {
      expect(t.lato.has(a.id)).toBe(true);
      expect(t.membro.has(a.id)).toBe(true);
    }
    expect(t.capofila.length).toBeGreaterThan(0);
  });

  it('è DETERMINISTICO: due calcoli danno lo stesso risultato', () => {
    // se cambiasse fra un ricalcolo e l'altro, i segni dei diagrammi
    // salterebbero da soli
    const p = aLConSegmentoRovescio();
    const a = calcolaTratteggiata(p);
    const b = calcolaTratteggiata(p);
    for (const asta of p.aste) {
      expect(b.lato.get(asta.id)).toBe(a.lato.get(asta.id));
    }
  });

  it('strutture staccate hanno ciascuna il proprio membro', () => {
    const p = progetto('due pezzi');
    const s = p.sezioneParametrica('s', preset('IPE 200'));
    const a1 = p.nodo(0, 0), a2 = p.nodo(3, 0);
    const b1 = p.nodo(10, 0), b2 = p.nodo(13, 0);
    p.asta(a1, a2, 'S275', s);
    p.asta(b1, b2, 'S275', s);
    const t = calcolaTratteggiata(p.costruisci());
    expect(new Set(t.membro.values()).size).toBe(2);
    expect(t.capofila).toHaveLength(2);
  });
});

describe('§2.2 — inversione della tratteggiata', () => {
  const v = { N: -12e3, T: 18e3, M: -7.5e3 };

  it('|T| e |M| restano invariati, i segni si ribaltano', () => {
    const invertito = conLato(-1, v);
    expect(Math.abs(invertito.T)).toBeCloseTo(Math.abs(v.T), 9);
    expect(Math.abs(invertito.M)).toBeCloseTo(Math.abs(v.M), 9);
    expect(Math.sign(invertito.T)).toBe(-Math.sign(v.T));
    expect(Math.sign(invertito.M)).toBe(-Math.sign(v.M));
  });

  it('N resta invariato IN SEGNO: lo sforzo normale non ha un lato', () => {
    const invertito = conLato(-1, v);
    expect(invertito.N).toBe(v.N);
  });

  it('invertire due volte riporta al punto di partenza', () => {
    expect(conLato(-1, conLato(-1, v))).toEqual(v);
  });

  it('il lato naturale non tocca niente', () => {
    expect(conLato(1, v)).toEqual(v);
  });

  it('il flag sull asta ribalta il lato calcolato', () => {
    const p = aLConSegmentoRovescio();
    const t = calcolaTratteggiata(p);
    const asta = p.aste[0];
    const naturale = latoEffettivo(t, asta);
    const invertita = latoEffettivo(t, { ...asta, tratteggiataInvertita: true });
    expect(invertita).toBe(-naturale);
  });
});

describe('§2.2 — il comando di inversione', () => {
  it('ribalta il flag e l annullamento lo riporta', () => {
    const p = aLConSegmentoRovescio();
    const id = p.aste[0].id;
    const cmd = invertiTratteggiata([id]);

    const dopo = cmd.esegui(p);
    expect(dopo.aste[0].tratteggiataInvertita).toBe(true);
    expect(dopo.aste[1].tratteggiataInvertita).toBeUndefined();

    const tornato = cmd.annulla(dopo);
    expect(tornato.aste[0].tratteggiataInvertita).toBe(false);
  });

  it('agisce su tutte le aste indicate e su nessun altra', () => {
    const p = aLConSegmentoRovescio();
    const dopo = invertiTratteggiata(p.aste.map((a) => a.id)).esegui(p);
    expect(dopo.aste.every((a) => a.tratteggiataInvertita)).toBe(true);
  });

  it('il lato effettivo cambia segno, e con lui T e M', () => {
    const p = aLConSegmentoRovescio();
    const t = calcolaTratteggiata(p);
    const v = { N: 5e3, T: -3e3, M: 9e3 };

    const prima = conLato(latoEffettivo(t, p.aste[0]), v);
    const dopo = invertiTratteggiata([p.aste[0].id]).esegui(p);
    const poi = conLato(latoEffettivo(t, dopo.aste[0]), v);

    expect(poi.N).toBe(prima.N);
    expect(poi.T).toBe(-prima.T);
    expect(poi.M).toBe(-prima.M);
    expect(Math.abs(poi.T)).toBeCloseTo(Math.abs(prima.T), 9);
    expect(Math.abs(poi.M)).toBeCloseTo(Math.abs(prima.M), 9);
  });
});

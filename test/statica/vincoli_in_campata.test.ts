/**
 * §3.1 — TUTTI i vincoli a telaio si posano in campata, e nessuno separa.
 *
 * È la conseguenza della distinzione del §2: la natura del vincolo — a telaio
 * oppure sconnessione — è indipendente da DOVE lo si mette. Un carrello a
 * metà trave resta un vincolo a telaio; posarlo non spezza niente.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../../src/state/store.js';
import { progetto } from '../../src/core/builder.js';
import { preset } from '../../src/core/materials/sezioniParametriche.js';
import { posaSuAsta } from '../../src/state/azioni.js';
import { analizzaCinematica } from '../../src/core/index.js';
import { vincoliDi } from '../../src/core/model/catalogoVincoli.js';
import type { ElementId, Progetto } from '../../src/core/model/types.js';

const st = () => useStore.getState();

/** Mensola: un'asta sola, così in campata c'è davvero solo la campata. */
function mensola(): Progetto {
  const p = progetto('mensola');
  const sez = p.sezioneParametrica('s', preset('IPE 200'));
  const a = p.nodo(0, 0);
  const b = p.nodo(6, 0);
  p.asta(a, b, 'S275', sez);
  p.vincolo(a, 'incastro');
  return p.costruisci();
}

beforeEach(() => {
  useStore.setState({ passato: [], futuro: [] });
  st().caricaProgetto(mensola());
});

const asta = () => st().progetto.aste[0].id as ElementId;

describe('ogni vincolo a telaio si posa in campata', () => {
  for (const v of vincoliDi('telaio')) {
    it(`${v.nome}`, () => {
      const prima = analizzaCinematica(st().progetto);
      st().scegliVincolo(v.id);
      posaSuAsta(asta(), 0.5);

      const p = st().progetto;
      expect((p.vincoliSuAsta ?? []).length).toBe(1);
      expect((p.vincoliSuAsta ?? [])[0].vincolo.tipo).toBe(
        v.icona.genere === 'telaio' ? v.icona.tipo : 'cerniera');

      // NON separa: il numero di corpi rigidi resta quello di prima
      const dopo = analizzaCinematica(st().progetto);
      expect(dopo.numeroCorpi).toBe(prima.numeroCorpi);
    });
  }
});

describe('la «Cerniera» in campata invece separa', () => {
  it('posa insieme appoggio e sconnessione, in un passo solo', () => {
    const prima = analizzaCinematica(st().progetto);
    const passiPrima = st().passato.length;

    st().scegliVincolo('cernieraSconnessa');
    posaSuAsta(asta(), 0.5);

    const p = st().progetto;
    expect((p.vincoliSuAsta ?? []).length).toBe(1);
    expect((p.sconnessioni ?? []).length).toBe(1);
    expect(st().passato.length).toBe(passiPrima + 1);

    const dopo = analizzaCinematica(st().progetto);
    expect(dopo.numeroCorpi).toBe(prima.numeroCorpi + 1);
    // 2 a terra + 2(2−1) di sconnessione = 4
    expect(dopo.gradiVincolo - prima.gradiVincolo).toBe(4);
  });

  it('e l undo toglie tutte e due le cose', () => {
    st().scegliVincolo('cernieraSconnessa');
    posaSuAsta(asta(), 0.5);
    st().annulla();
    expect((st().progetto.vincoliSuAsta ?? []).length).toBe(0);
    expect((st().progetto.sconnessioni ?? []).length).toBe(0);
  });
});

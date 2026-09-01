/**
 * §3.0.1 — la «Cerniera» degli interni: appoggio a terra CHE SCONNETTE.
 *
 * Non è un tipo nuovo del modello, è la somma di due che esistono già —
 * vincolo esterno di cerniera più sconnessione nodale — ed è anche il conto
 * che dà la specifica: 2 + 2(m−1) = 2m.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../../src/state/store.js';
import { progetto } from '../../src/core/builder.js';
import { preset } from '../../src/core/materials/sezioniParametriche.js';
import { applicaVincolo } from '../../src/state/azioni.js';
import { analizzaCinematica } from '../../src/core/index.js';
import type { NodeId, Progetto } from '../../src/core/model/types.js';

const st = () => useStore.getState();

/** Trave continua su due campate: il nodo di mezzo ha m = 2 aste. */
function traveDueCampate(): Progetto {
  const p = progetto('due campate');
  const sez = p.sezioneParametrica('s', preset('IPE 200'));
  const a = p.nodo(0, 0);
  const b = p.nodo(5, 0);
  const c = p.nodo(10, 0);
  p.asta(a, b, 'S275', sez);
  p.asta(b, c, 'S275', sez);
  p.vincolo(a, 'cerniera');
  p.vincolo(c, 'carrello');
  return p.costruisci();
}

beforeEach(() => {
  useStore.setState({ passato: [], futuro: [] });
  st().caricaProgetto(traveDueCampate());
});

describe('cerniera a terra che sconnette', () => {
  const nodoDiMezzo = () => st().progetto.nodi[1].id as NodeId;

  it('posa insieme il vincolo esterno e la sconnessione interna', () => {
    st().scegliVincolo('cernieraSconnessa');
    st().seleziona({ nodi: new Set([nodoDiMezzo()]) });
    applicaVincolo([nodoDiMezzo()]);

    const p = st().progetto;
    const nodo = p.nodi.find((n) => n.id === nodoDiMezzo())!;
    expect(nodo.vincolo?.tipo).toBe('cerniera');
    expect((p.vincoliInterni ?? []).some((v) => v.nodoId === nodoDiMezzo())).toBe(true);
  });

  it('è UN SOLO passo di undo, e lo disfa tutto insieme', () => {
    const passiPrima = st().passato.length;
    st().scegliVincolo('cernieraSconnessa');
    applicaVincolo([nodoDiMezzo()]);
    expect(st().passato.length).toBe(passiPrima + 1);

    st().annulla();
    const p = st().progetto;
    expect(p.nodi.find((n) => n.id === nodoDiMezzo())?.vincolo).toBeUndefined();
    expect((p.vincoliInterni ?? []).length).toBe(0);
  });

  it('con m = 2 aste dà 4 gradi di vincolo e 2 corpi rigidi', () => {
    const prima = analizzaCinematica(st().progetto);

    st().scegliVincolo('cernieraSconnessa');
    applicaVincolo([nodoDiMezzo()]);

    const dopo = analizzaCinematica(st().progetto);
    // 2 esterni (cerniera) + 2(m−1) interni = 2m = 4
    expect(dopo.gradiVincolo - prima.gradiVincolo).toBe(4);
    // e la trave si divide in due membri
    expect(dopo.numeroCorpi).toBe(prima.numeroCorpi + 1);
  });

  it('la sola cerniera interna, senza terra, ne dà 2', () => {
    const prima = analizzaCinematica(st().progetto);
    st().scegliVincolo('cernieraInterna');
    applicaVincolo([nodoDiMezzo()]);
    const dopo = analizzaCinematica(st().progetto);
    expect(dopo.gradiVincolo - prima.gradiVincolo).toBe(2);
  });

  it('la sola cerniera a telaio ne dà 2 e NON separa', () => {
    const prima = analizzaCinematica(st().progetto);
    st().scegliVincolo('cerniera');
    applicaVincolo([nodoDiMezzo()]);
    const dopo = analizzaCinematica(st().progetto);
    expect(dopo.gradiVincolo - prima.gradiVincolo).toBe(2);
    expect(dopo.numeroCorpi).toBe(prima.numeroCorpi);
  });
});

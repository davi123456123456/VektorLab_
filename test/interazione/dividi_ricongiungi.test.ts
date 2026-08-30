/**
 * Dividere un'asta e ricongiungere un nodo di sola mesh.
 *
 * La proprietà che conta: la struttura non deve cambiare. Dividere una trave
 * in tre parti non altera il carico che porta né le sue reazioni; e un nodo
 * che non porta nulla si può togliere senza conseguenze. Se uno dei due
 * comandi cambiasse i risultati, sarebbe un modo silenzioso di sbagliare.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { progetto } from '../../src/core/builder.js';
import { preset } from '../../src/core/materials/sezioniParametriche.js';
import { analizzaCaso, analizzaCinematica } from '../../src/core/index.js';
import { useStore, progettoVuoto } from '../../src/state/store.js';
import { dividiAsta, ricongiungiNodo } from '../../src/state/commands.js';
import type { ElementId, LoadCaseId, NodeId, Progetto } from '../../src/core/model/types.js';

const CASO = 'principale' as LoadCaseId;

function trave(): Progetto {
  const p = progetto('trave');
  const sez = p.sezioneParametrica('s', preset('IPE 300'));
  const a = p.nodo(0, 0, 'A');
  const b = p.nodo(9, 0, 'B');
  const el = p.asta(a, b, 'S275', sez, { teoria: 'eulero-bernoulli' });
  p.vincolo(a, 'cerniera');
  p.vincolo(b, 'carrello');
  p.distribuito(el, -12e3);
  return p.costruisci();
}

const reazioni = (p: Progetto) => {
  const r = analizzaCaso(p, CASO);
  return {
    A: r.reazioni.find((x) => (x.nodoId as unknown as string) === 'A')!.fy,
    B: r.reazioni.find((x) => (x.nodoId as unknown as string) === 'B')!.fy,
    // il massimo VERO, quello dei punti notevoli (dove T = 0, per bisezione):
    // il massimo del campionamento cambierebbe con la suddivisione senza che
    // sia cambiato niente di fisico
    Mmax: Math.max(...r.aste.flatMap((a) => a.puntiNotevoli.map((x) => x.M))),
  };
};

beforeEach(() => {
  useStore.setState({ progetto: progettoVuoto(), passato: [], futuro: [] });
  useStore.getState().caricaProgetto(trave());
});

describe('dividere un\'asta', () => {
  it('crea i nodi equidistanti e conserva la struttura', () => {
    const prima = reazioni(useStore.getState().progetto);
    const asta = useStore.getState().progetto.aste[0].id;
    useStore.getState().esegui(dividiAsta(asta, 3));

    const p = useStore.getState().progetto;
    expect(p.aste.length).toBe(3);
    expect(p.nodi.length).toBe(4);
    const x = p.nodi.map((n) => n.x).sort((a, b) => a - b);
    expect(x).toEqual([0, 3, 6, 9]);

    // e il calcolo dà gli stessi numeri: dividere è un'operazione di comodo
    const dopo = reazioni(p);
    expect(dopo.A).toBeCloseTo(prima.A, 6);
    expect(dopo.B).toBeCloseTo(prima.B, 6);
    expect(dopo.Mmax).toBeCloseTo(prima.Mmax, 4);
  });

  it('resta un corpo rigido solo: i nodi non sconnettono', () => {
    const asta = useStore.getState().progetto.aste[0].id;
    useStore.getState().esegui(dividiAsta(asta, 4));
    expect(analizzaCinematica(useStore.getState().progetto).numeroCorpi).toBe(1);
  });

  it('è annullabile e riporta il modello esattamente com\'era', () => {
    const asta = useStore.getState().progetto.aste[0].id;
    const prima = JSON.stringify(useStore.getState().progetto);
    useStore.getState().esegui(dividiAsta(asta, 2));
    useStore.getState().annulla();
    expect(JSON.stringify(useStore.getState().progetto)).toBe(prima);
  });

  it('i vincoli posati sull\'asta seguono il proprio tronco', async () => {
    const asta = useStore.getState().progetto.aste[0].id;
    useStore.getState().esegui(
      (await import('../../src/state/commands.js')).aggiungiVincoloSuAsta(
        asta, 0.8, { tipo: 'carrello', angolo: 0 as never }),
    );
    useStore.getState().esegui(dividiAsta(asta, 2));
    const v = useStore.getState().progetto.vincoliSuAsta![0];
    // 0.8 dell'asta intera è 0.6 del secondo tronco
    expect(v.s).toBeCloseTo(0.6, 9);
    expect(v.astaId).not.toBe(asta);
  });
});

describe('ricongiungere un nodo di sola mesh', () => {
  it('fonde le due aste e non cambia la struttura', () => {
    const asta = useStore.getState().progetto.aste[0].id;
    useStore.getState().esegui(dividiAsta(asta, 2));
    const centro = useStore.getState().progetto.nodi.find((n) => n.x === 4.5)!.id;

    const cmd = ricongiungiNodo(centro);
    useStore.getState().esegui(cmd);
    expect(cmd.possibile).toBe(true);
    const p = useStore.getState().progetto;
    expect(p.aste.length).toBe(1);
    expect(p.nodi.length).toBe(2);
    expect(analizzaCinematica(p).numeroCorpi).toBe(1);
  });

  it('si rifiuta se il nodo porta qualcosa, invece di cambiare la struttura', async () => {
    const asta = useStore.getState().progetto.aste[0].id;
    useStore.getState().esegui(dividiAsta(asta, 2));
    const centro = useStore.getState().progetto.nodi.find((n) => n.x === 4.5)!.id;
    useStore.setState({ vincoloCorrente: 'carrello', modoCerniera: 'esterno' });
    const { applicaVincolo } = await import('../../src/state/azioni.js');
    applicaVincolo([centro]);

    const cmd = ricongiungiNodo(centro);
    useStore.getState().esegui(cmd);
    expect(cmd.possibile).toBe(false);
    expect(useStore.getState().progetto.aste.length).toBe(2);
  });
});

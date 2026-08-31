/**
 * §1.4 — I SETTE TEST DEL BUG DEI VINCOLI FANTASMA.
 *
 * Il difetto: «seleziona tutto → elimina» lasciava indietro vincoli su asta,
 * sconnessioni e sconnessioni nodali, che puntavano a id spariti. Gli id
 * venivano poi riassegnati dall'inizio, e quelle entità si riagganciavano alla
 * geometria nuova. L'utente analizzava una struttura diversa da quella che
 * aveva disegnato, senza vedere niente di anomalo.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../../src/state/store.js';
import { progetto } from '../../src/core/builder.js';
import { preset } from '../../src/core/materials/sezioniParametriche.js';
import {
  aggiungiAsta, aggiungiCarico, aggiungiNodo, aggiungiSconnessione,
  aggiungiSconnessioneNodale, aggiungiVincoloSuAsta,
} from '../../src/state/commands.js';
import { eliminaSelezione } from '../../src/state/azioni.js';
import { verificaIntegrita } from '../../src/core/model/integrita.js';
import type {
  ElementId, LoadCaseId, NodeId, Progetto, Radianti, Vincolo,
} from '../../src/core/model/types.js';

const CASO = 'principale' as LoadCaseId;
const st = () => useStore.getState();
const p = () => useStore.getState().progetto;

/** Telaio con un vincolo di ogni specie: tutto ciò che può restare orfano. */
function telaioCompleto() {
  const b = progetto('telaio');
  const sez = b.sezioneParametrica('s', preset('IPE 200'));
  const A = b.nodo(0, 0), B = b.nodo(0, 4), C = b.nodo(6, 4), D = b.nodo(6, 0);
  const a1 = b.asta(A, B, 'S275', sez);
  const a2 = b.asta(B, C, 'S275', sez);
  b.asta(C, D, 'S275', sez);
  b.vincolo(A, 'incastro');
  b.vincolo(D, 'incastro');
  st().caricaProgetto(b.costruisci());

  st().esegui(aggiungiVincoloSuAsta(
    a2, 0.5, { tipo: 'carrello', angolo: 0 as Radianti } as Vincolo));
  st().esegui(aggiungiSconnessione(a1, 0.5, 'cerniera'));
  st().esegui(aggiungiSconnessioneNodale(B, 'cerniera'));
  st().esegui(aggiungiCarico(
    { tipo: 'forzaNodale', nodoId: B, fx: 1e3, fy: -2e3 } as never, CASO));
}

function conteggi() {
  const m = p();
  return {
    nodi: m.nodi.length,
    aste: m.aste.length,
    carichi: m.carichi.length,
    vincoliSuAsta: (m.vincoliSuAsta ?? []).length,
    sconnessioni: (m.sconnessioni ?? []).length,
    vincoliInterni: (m.vincoliInterni ?? []).length,
  };
}

beforeEach(() => {
  useStore.setState({ passato: [], futuro: [], anomalieIntegrita: [] });
  telaioCompleto();
});

describe('§1.4', () => {
  it('1 — seleziona tutto ed elimina svuota DAVVERO ogni collezione', () => {
    expect(conteggi()).toEqual({
      nodi: 4, aste: 3, carichi: 1,
      vincoliSuAsta: 1, sconnessioni: 1, vincoliInterni: 1,
    });

    st().selezionaTutto();
    eliminaSelezione();

    expect(conteggi()).toEqual({
      nodi: 0, aste: 0, carichi: 0,
      vincoliSuAsta: 0, sconnessioni: 0, vincoliInterni: 0,
    });
    expect(p().nodi.filter((n) => n.vincolo).length).toBe(0);
  });

  it('2 — ridisegnando nella stessa posizione l asta resta NUDA', () => {
    st().selezionaTutto();
    eliminaSelezione();

    // stessi punti, stesso ordine, stessa inclinazione della struttura di prima
    st().esegui(aggiungiNodo(0, 0));
    st().esegui(aggiungiNodo(0, 4));
    const [n1, n2] = p().nodi.map((n) => n.id);
    st().esegui(aggiungiAsta(n1, n2, 'S275', p().sezioniPersonalizzate[0].id));

    expect(conteggi()).toEqual({
      nodi: 2, aste: 1, carichi: 0,
      vincoliSuAsta: 0, sconnessioni: 0, vincoliInterni: 0,
    });
    expect(p().nodi.every((n) => !n.vincolo)).toBe(true);
  });

  it('2b — e gli id non vengono riassegnati', () => {
    const primaNodi = p().nodi.map((n) => n.id as string);
    st().selezionaTutto();
    eliminaSelezione();

    st().esegui(aggiungiNodo(0, 0));
    st().esegui(aggiungiNodo(0, 4));
    const dopoNodi = p().nodi.map((n) => n.id as string);

    for (const id of dopoNodi) expect(primaNodi).not.toContain(id);
  });

  it('3 — eliminando un nodo se ne vanno vincolo e carico, in UN passo', () => {
    const B = p().nodi[1].id as NodeId;      // porta la sconnessione nodale
    const passiPrima = st().passato.length;

    st().seleziona({ nodi: new Set([B]) });
    eliminaSelezione();

    expect(st().passato.length).toBe(passiPrima + 1);
    expect(p().nodi.some((n) => n.id === B)).toBe(false);
    expect((p().vincoliInterni ?? []).some((v) => v.nodoId === B)).toBe(false);
    expect(p().carichi.some((c) => 'nodoId' in c && c.nodoId === B)).toBe(false);
    // le due aste che vi convergevano se ne vanno con lui, e con loro
    // il vincolo su asta e la sconnessione che vi erano posati
    expect(conteggi().vincoliSuAsta).toBe(0);
    expect(conteggi().sconnessioni).toBe(0);
  });

  it('4 — l undo riporta indietro nodo, vincolo e carico TUTTI INSIEME', () => {
    const prima = conteggi();
    const B = p().nodi[1].id as NodeId;

    st().seleziona({ nodi: new Set([B]) });
    eliminaSelezione();
    st().annulla();

    expect(conteggi()).toEqual(prima);
    expect(p().nodi.some((n) => n.id === B)).toBe(true);
    expect((p().vincoliInterni ?? []).some((v) => v.nodoId === B)).toBe(true);
    expect(p().carichi.some((c) => 'nodoId' in c && c.nodoId === B)).toBe(true);
  });

  it('5 — eliminando un segmento sopravvive ciò che sta sui nodi rimasti', () => {
    // l'asta a2 porta il vincolo su asta; i nodi A e D portano gli incastri
    const a2 = p().aste[1].id as ElementId;
    st().seleziona({ aste: new Set([a2]) });
    eliminaSelezione();

    // il vincolo posato su a2 se ne va con lei
    expect(conteggi().vincoliSuAsta).toBe(0);
    // ma gli incastri sui nodi restano, e la sconnessione sull'asta a1 pure
    expect(p().nodi.filter((n) => n.vincolo).length).toBe(2);
    expect(conteggi().sconnessioni).toBe(1);
    expect(conteggi().nodi).toBe(4);
  });

  it('6 — dopo un azzeramento totale non c è nulla da reidratare', () => {
    st().selezionaTutto();
    eliminaSelezione();
    const svuotato = p();

    // ricaricare il modello è ciò che farebbe una ricarica di pagina con la
    // persistenza del §4.4: deve restare vuoto, senza far ricomparire niente
    st().caricaProgetto(svuotato);

    expect(conteggi()).toEqual({
      nodi: 0, aste: 0, carichi: 0,
      vincoliSuAsta: 0, sconnessioni: 0, vincoliInterni: 0,
    });
    expect(st().anomalieIntegrita).toEqual([]);
  });

  it('7 — verificaIntegrita trova, rimuove e SEGNALA un orfano iniettato', () => {
    const sano = p();
    const malato: Progetto = {
      ...sano,
      vincoliSuAsta: [
        ...(sano.vincoliSuAsta ?? []),
        {
          id: 'va-fantasma', astaId: 'a999' as ElementId, s: 0.5,
          vincolo: { tipo: 'carrello', angolo: 0 as Radianti },
        },
      ],
      vincoliInterni: [
        ...(sano.vincoliInterni ?? []),
        { id: 'vi-fantasma', tipo: 'cerniera', nodoId: 'n999' as NodeId },
      ],
    };

    const esito = verificaIntegrita(malato);

    expect(esito.integro).toBe(false);
    expect(esito.anomalie).toHaveLength(2);
    expect(esito.anomalie.map((a) => a.genere).sort())
      .toEqual(['vincoloInternoOrfano', 'vincoloSuAstaOrfano']);
    expect(esito.anomalie.every((a) => a.rimossa)).toBe(true);
    // il messaggio nomina l'entità e il riferimento che non si risolve
    expect(esito.anomalie[0].messaggio).toContain('a999');
    expect(esito.anomalie[1].messaggio).toContain('n999');

    // rimossi davvero, e senza toccare quelli sani
    expect((esito.progetto.vincoliSuAsta ?? []).some((v) => v.id === 'va-fantasma'))
      .toBe(false);
    expect((esito.progetto.vincoliInterni ?? []).some((v) => v.id === 'vi-fantasma'))
      .toBe(false);
    expect((esito.progetto.vincoliSuAsta ?? []).length)
      .toBe((sano.vincoliSuAsta ?? []).length);

    // e arriva al pannello: caricando il modello malato lo store le espone
    st().caricaProgetto(malato);
    expect(st().anomalieIntegrita).toHaveLength(2);
  });

  it('7b — un modello sano non produce nessuna segnalazione', () => {
    const esito = verificaIntegrita(p());
    expect(esito.integro).toBe(true);
    expect(esito.anomalie).toEqual([]);
    expect(esito.progetto).toBe(p());   // stesso oggetto: nessuna allocazione
  });
});

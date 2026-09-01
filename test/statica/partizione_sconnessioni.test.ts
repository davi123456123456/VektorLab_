/**
 * §3.2 — cerniera interna su nodi con tre o più aste: completa o parziale.
 *
 * Le due si distinguono dal GESTO con cui si inseriscono, e producono
 * strutture diverse. Il modello memorizza la partizione esplicitamente,
 * perché «cerniera su un nodo a tre aste» non basta a dire quale sia.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../../src/state/store.js';
import { progetto } from '../../src/core/builder.js';
import { preset } from '../../src/core/materials/sezioniParametriche.js';
import {
  applicaVincolo, concludiTrascinamentoSuAsta, posaSuAsta,
} from '../../src/state/azioni.js';
import { impostaGruppiSconnessione } from '../../src/state/commands.js';
import { analizzaCinematica } from '../../src/core/index.js';
import {
  gradiDiVincoloPartizione, gruppiSconnessione, partizioneNonRappresentabile,
} from '../../src/core/model/partizione.js';
import type { ElementId, NodeId, Progetto } from '../../src/core/model/types.js';

const st = () => useStore.getState();

/** Nodo centrale con TRE aste che vi convergono, a raggiera. */
function treAste(): Progetto {
  const p = progetto('tre aste');
  const sez = p.sezioneParametrica('s', preset('IPE 200'));
  const c = p.nodo(0, 0);
  const a = p.nodo(-4, 0);
  const b = p.nodo(4, 0);
  const d = p.nodo(0, -4);
  p.asta(c, a, 'S275', sez);
  p.asta(c, b, 'S275', sez);
  p.asta(c, d, 'S275', sez);
  p.vincolo(a, 'incastro');
  p.vincolo(b, 'incastro');
  p.vincolo(d, 'incastro');
  return p.costruisci();
}

beforeEach(() => {
  useStore.setState({ passato: [], futuro: [] });
  st().caricaProgetto(treAste());
  st().scegliVincolo('cernieraInterna');
});

const nodoCentrale = () => st().progetto.nodi[0].id as NodeId;
const cinem = () => analizzaCinematica(st().progetto);

describe('§3.2', () => {
  it('1 — cerniera inserita SUL NODO: tre corpi, 4 gradi di vincolo interni', () => {
    const prima = cinem();
    applicaVincolo([nodoCentrale()]);
    const dopo = cinem();

    const v = st().progetto.vincoliInterni![0];
    expect(v.gruppi).toHaveLength(3);
    expect(gradiDiVincoloPartizione(v.gruppi!)).toBe(4);

    // n aumenta di 2: da un corpo solo a tre
    expect(dopo.numeroCorpi).toBe(prima.numeroCorpi + 2);
    expect(dopo.gradiVincolo - prima.gradiVincolo).toBe(4);
  });

  it('2 — cerniera trascinata da un asta al nodo: due corpi, 2 gradi', () => {
    const prima = cinem();
    const asta = st().progetto.aste[0].id as ElementId;

    // la si posa in campata e la si trascina fino all'estremo che sta sul nodo
    posaSuAsta(asta, 0.5);
    const id = (st().progetto.sconnessioni ?? [])[0].id;
    concludiTrascinamentoSuAsta(id, 0.0);

    const p = st().progetto;
    expect(p.sconnessioni ?? []).toHaveLength(0);
    const v = p.vincoliInterni![0];
    expect(v.gruppi).toHaveLength(2);
    // l'asta trascinata da sola, le altre due insieme
    expect(v.gruppi![0]).toEqual([asta]);
    expect(v.gruppi![1]).toHaveLength(2);
    expect(gradiDiVincoloPartizione(v.gruppi!)).toBe(2);

    const dopo = cinem();
    expect(dopo.numeroCorpi).toBe(prima.numeroCorpi + 1);
    expect(dopo.gradiVincolo - prima.gradiVincolo).toBe(2);
  });

  it('3 — spostando un asta da un gruppo all altro il conteggio si aggiorna', () => {
    applicaVincolo([nodoCentrale()]);
    const v = st().progetto.vincoliInterni![0];
    expect(cinem().numeroCorpi).toBe(3);

    // da [[a1],[a2],[a3]] a [[a1],[a2,a3]]: due corpi invece di tre
    const [g1, g2, g3] = v.gruppi!;
    st().esegui(impostaGruppiSconnessione(v.id, [g1, [...g2, ...g3]]));

    const dopo = st().progetto.vincoliInterni![0];
    expect(dopo.gruppi).toHaveLength(2);
    expect(gradiDiVincoloPartizione(dopo.gruppi!)).toBe(2);
    expect(cinem().numeroCorpi).toBe(2);
  });

  it('3b — ed è annullabile', () => {
    applicaVincolo([nodoCentrale()]);
    const v = st().progetto.vincoliInterni![0];
    const [g1, g2, g3] = v.gruppi!;
    st().esegui(impostaGruppiSconnessione(v.id, [g1, [...g2, ...g3]]));
    st().annulla();
    expect(st().progetto.vincoliInterni![0].gruppi).toHaveLength(3);
    expect(cinem().numeroCorpi).toBe(3);
  });

  it('4 — con due sole aste il comportamento non cambia: 2 gradi', () => {
    const p = progetto('due aste');
    const sez = p.sezioneParametrica('s', preset('IPE 200'));
    const c = p.nodo(0, 0), a = p.nodo(-4, 0), b = p.nodo(4, 0);
    p.asta(c, a, 'S275', sez);
    p.asta(c, b, 'S275', sez);
    p.vincolo(a, 'incastro');
    p.vincolo(b, 'incastro');
    st().caricaProgetto(p.costruisci());
    st().scegliVincolo('cernieraInterna');

    const prima = cinem();
    applicaVincolo([st().progetto.nodi[0].id as NodeId]);
    const v = st().progetto.vincoliInterni![0];
    expect(gradiDiVincoloPartizione(v.gruppi!)).toBe(2);
    expect(cinem().gradiVincolo - prima.gradiVincolo).toBe(2);
  });

  it('5 — cerniera parziale in un anello chiuso: n non cresce, i gdv sì', () => {
    // maglia triangolare: togliere una continuità non stacca nessun pezzo,
    // perché il giro si chiude dall'altra parte
    const p = progetto('anello');
    const sez = p.sezioneParametrica('s', preset('IPE 200'));
    const a = p.nodo(0, 0), b = p.nodo(4, 0), c = p.nodo(2, 3);
    p.asta(a, b, 'S275', sez);
    p.asta(b, c, 'S275', sez);
    p.asta(c, a, 'S275', sez);
    p.vincolo(a, 'cerniera');
    p.vincolo(b, 'carrello');
    st().caricaProgetto(p.costruisci());
    st().scegliVincolo('cernieraInterna');

    const prima = cinem();
    const nodo = st().progetto.nodi[1].id as NodeId;   // b, dove ne convergono 2
    applicaVincolo([nodo]);

    const dopo = cinem();
    expect(dopo.numeroCorpi).toBe(prima.numeroCorpi);   // l'anello regge

    // I gradi di vincolo sono contati, ma NON fra le righe della matrice
    // cinematica: quella confronta corpi rigidi diversi, e qui il corpo è
    // sempre uno solo. Finiscono nel campo che li tiene, ed è giusto così —
    // sommarli a `gradiVincolo` conterebbe un vincolo fra un corpo e sé stesso.
    expect(dopo.gradiVincoloInterni - prima.gradiVincoloInterni).toBe(2);
    expect(dopo.gradiVincolo).toBe(prima.gradiVincolo);
  });
});

describe('la partizione ricostruita e i suoi limiti', () => {
  it('un modello vecchio senza gruppi si legge come sconnessione completa', () => {
    const convergenti = ['a1', 'a2', 'a3'] as unknown as ElementId[];
    const g = gruppiSconnessione(
      { id: 'vi1', tipo: 'cerniera', nodoId: 'n1' as unknown as NodeId },
      convergenti,
    );
    expect(g).toEqual([['a1'], ['a2'], ['a3']]);
  });

  it('un asta comparsa dopo entra in un gruppo proprio, non saldata d ufficio', () => {
    const g = gruppiSconnessione(
      {
        id: 'vi1', tipo: 'cerniera', nodoId: 'n1' as unknown as NodeId,
        gruppi: [['a1'], ['a2']] as unknown as ElementId[][],
      },
      ['a1', 'a2', 'a3'] as unknown as ElementId[],
    );
    expect(g).toEqual([['a1'], ['a2'], ['a3']]);
  });

  it('due gruppi da più aste non sono rappresentabili, e si sa', () => {
    const ok = [['a1'], ['a2', 'a3']] as unknown as ElementId[][];
    const no = [['a1', 'a2'], ['a3', 'a4']] as unknown as ElementId[][];
    expect(partizioneNonRappresentabile(ok)).toBe(false);
    expect(partizioneNonRappresentabile(no)).toBe(true);
  });
});

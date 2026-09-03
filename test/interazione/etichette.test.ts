/**
 * §1 — l'etichetta visibile è derivata, l'id interno non si riusa mai.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../../src/state/store.js';
import { progetto } from '../../src/core/builder.js';
import { preset } from '../../src/core/materials/sezioniParametriche.js';
import { aggiungiAsta, aggiungiNodo } from '../../src/state/commands.js';
import { eliminaSelezione } from '../../src/state/azioni.js';
import { etichette } from '../../src/state/etichette.js';
import type { NodeId, Progetto } from '../../src/core/model/types.js';

const st = () => useStore.getState();
const eti = () => etichette(st().progetto);

function trave(): Progetto {
  const p = progetto('trave');
  const s = p.sezioneParametrica('s', preset('IPE 200'));
  const a = p.nodo(0, 0), b = p.nodo(4, 0), c = p.nodo(8, 0);
  p.asta(a, b, 'S275', s);
  p.asta(b, c, 'S275', s);
  p.vincolo(a, 'cerniera');
  p.vincolo(c, 'carrello');
  return p.costruisci();
}

beforeEach(() => {
  useStore.setState({ passato: [], futuro: [] });
  st().caricaProgetto(trave());
});

describe('§1.4', () => {
  it('1 — cancellando tutto e ridisegnando, le etichette ripartono da n1', () => {
    st().selezionaTutto();
    eliminaSelezione();

    st().esegui(aggiungiNodo(0, 0));
    st().esegui(aggiungiNodo(3, 0));
    const p = st().progetto;
    const e = eti();

    expect(e.nodo(p.nodi[0].id)).toBe('n1');
    expect(e.nodo(p.nodi[1].id)).toBe('n2');

    // MA gli id interni NON sono ripartiti: è la regola dell'iterazione 8
    expect(p.nodi[0].id as unknown as string).not.toBe('n1');

    st().esegui(aggiungiAsta(
      p.nodi[0].id, p.nodi[1].id, 'S275', p.sezioniPersonalizzate[0].id));
    const dopo = etichette(st().progetto);
    expect(dopo.asta(st().progetto.aste[0].id)).toBe('a1');
    expect(st().progetto.aste[0].id as unknown as string).not.toBe('a1');
  });

  it('2 — eliminando un nodo intermedio le etichette restano compatte', () => {
    st().caricaProgetto(progetto('p').costruisci());
    for (const x of [0, 1, 2, 3]) st().esegui(aggiungiNodo(x, 0));
    const prima = st().progetto.nodi.map((n) => eti().nodo(n.id));
    expect(prima).toEqual(['n1', 'n2', 'n3', 'n4']);

    const intermedio = st().progetto.nodi[1].id as NodeId;
    st().seleziona({ nodi: new Set([intermedio]) });
    eliminaSelezione();

    const dopo = st().progetto.nodi.map((n) => eti().nodo(n.id));
    expect(dopo).toEqual(['n1', 'n2', 'n3']);   // nessun buco
  });

  it('3 — dopo la rinumerazione vincoli e carichi restano agganciati', () => {
    const p = st().progetto;
    const nodoDiMezzo = p.nodi[1].id as NodeId;
    st().seleziona({ nodi: new Set([nodoDiMezzo]) });
    eliminaSelezione();

    const dopo = st().progetto;
    // i due vincoli erano sugli estremi: devono esserci ancora, sui LORO nodi
    const vincolati = dopo.nodi.filter((n) => n.vincolo);
    expect(vincolati).toHaveLength(2);
    expect(vincolati[0].vincolo?.tipo).toBe('cerniera');
    expect(vincolati[1].vincolo?.tipo).toBe('carrello');
    // e i riferimenti puntano agli id, non alle etichette
    for (const c of dopo.carichi) {
      if ('nodoId' in c) {
        expect(dopo.nodi.some((n) => n.id === c.nodoId)).toBe(true);
      }
    }
  });

  it('4 — l undo riporta etichette e riferimenti coerenti', () => {
    const prima = st().progetto.nodi.map((n) => eti().nodo(n.id));
    const nodoDiMezzo = st().progetto.nodi[1].id as NodeId;
    st().seleziona({ nodi: new Set([nodoDiMezzo]) });
    eliminaSelezione();
    st().annulla();

    expect(st().progetto.nodi.map((n) => eti().nodo(n.id))).toEqual(prima);
    expect(st().progetto.aste).toHaveLength(2);
    for (const a of st().progetto.aste) {
      expect(st().progetto.nodi.some((n) => n.id === a.nodoIniziale)).toBe(true);
      expect(st().progetto.nodi.some((n) => n.id === a.nodoFinale)).toBe(true);
    }
  });

  it('5 — salvando e riaprendo, i riferimenti restano e le etichette si ricalcolano', () => {
    const salvato = JSON.parse(JSON.stringify(st().progetto)) as Progetto;
    st().caricaProgetto(salvato);

    const e = etichette(st().progetto);
    expect(st().progetto.nodi.map((n) => e.nodo(n.id)))
      .toEqual(['n1', 'n2', 'n3']);
    for (const a of st().progetto.aste) {
      expect(st().progetto.nodi.some((n) => n.id === a.nodoIniziale)).toBe(true);
    }
  });

  it('le etichette d autore vincono sul numero', () => {
    // gli esempi danno nomi parlanti ai nodi: `piede-sx` dice più di `n1`
    const p = progetto('portale');
    const s = p.sezioneParametrica('s', preset('IPE 200'));
    const a = p.nodo(0, 0, 'piede-sx');
    const b = p.nodo(0, 4, 'testa-sx');
    p.asta(a, b, 'S275', s);
    const e = etichette(p.costruisci());
    expect(e.nodo(a)).toBe('piede-sx');
    expect(e.nodo(b)).toBe('testa-sx');
  });

  it('un riferimento pendente si mostra per quello che è', () => {
    const e = eti();
    expect(e.nodo('n999' as unknown as NodeId)).toBe('n999');
  });
});

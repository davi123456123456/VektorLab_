/**
 * §4 — completezza dell'elenco ed eliminazione con Canc.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../../src/state/store.js';
import { progetto } from '../../src/core/builder.js';
import { preset } from '../../src/core/materials/sezioniParametriche.js';
import { applicaVincolo, eliminaSelezione, posaSuAsta } from '../../src/state/azioni.js';
import { contaVincoli } from '../../src/core/model/integrita.js';
import { dividiAsta } from '../../src/state/commands.js';
import type { ElementId, NodeId, Progetto } from '../../src/core/model/types.js';

const st = () => useStore.getState();

function telaio(): Progetto {
  const p = progetto('telaio');
  const sez = p.sezioneParametrica('s', preset('IPE 200'));
  const a = p.nodo(0, 0), b = p.nodo(0, 4), c = p.nodo(6, 4), d = p.nodo(6, 0);
  p.asta(a, b, 'S275', sez);
  p.asta(b, c, 'S275', sez);
  p.asta(c, d, 'S275', sez);
  p.vincolo(a, 'incastro');
  p.vincolo(d, 'incastro');
  return p.costruisci();
}

beforeEach(() => {
  useStore.setState({ passato: [], futuro: [] });
  st().caricaProgetto(telaio());
});

describe('§4.1 — ogni vincolo è contato', () => {
  it('parte dai due incastri sui nodi', () => {
    const c = contaVincoli(st().progetto);
    expect(c.suNodo).toBe(2);
    expect(c.totale).toBe(2);
  });

  it('conta i vincoli posati IN CAMPATA, che prima sfuggivano', () => {
    st().scegliVincolo('carrello');
    posaSuAsta(st().progetto.aste[1].id as ElementId, 0.4);
    const c = contaVincoli(st().progetto);
    expect(c.inCampata).toBe(1);
    expect(c.totale).toBe(3);
  });

  it('conta le sconnessioni nodali', () => {
    st().scegliVincolo('cernieraInterna');
    applicaVincolo([st().progetto.nodi[1].id as NodeId]);
    const c = contaVincoli(st().progetto);
    expect(c.sconnessioniNodali).toBe(1);
    expect(c.totale).toBe(3);
  });

  it('conta i vincoli su nodi nati dalla suddivisione di un asta', () => {
    st().esegui(dividiAsta(st().progetto.aste[1].id as ElementId, 2));
    const nuovo = st().progetto.nodi[st().progetto.nodi.length - 1].id as NodeId;
    st().scegliVincolo('carrello');
    applicaVincolo([nuovo]);
    const c = contaVincoli(st().progetto);
    expect(c.suNodo).toBe(3);
  });

  it('il conto sopravvive a undo e redo', () => {
    st().scegliVincolo('carrello');
    posaSuAsta(st().progetto.aste[1].id as ElementId, 0.4);
    expect(contaVincoli(st().progetto).totale).toBe(3);
    st().annulla();
    expect(contaVincoli(st().progetto).totale).toBe(2);
    st().rifai();
    expect(contaVincoli(st().progetto).totale).toBe(3);
  });
});

describe('§4.2 — Canc elimina il vincolo selezionato', () => {
  it('toglie un vincolo posato in campata, non la geometria', () => {
    st().scegliVincolo('carrello');
    const asta = st().progetto.aste[1].id as ElementId;
    posaSuAsta(asta, 0.4);
    const nodiPrima = st().progetto.nodi.length;

    // posaSuAsta lo seleziona da sé, come farebbe il clic
    expect(st().suAstaSelezionato).not.toBeNull();
    eliminaSelezione();

    expect(contaVincoli(st().progetto).inCampata).toBe(0);
    expect(st().progetto.nodi.length).toBe(nodiPrima);
    expect(st().suAstaSelezionato).toBeNull();
  });

  it('l etichetta di undo dice che cosa è stato tolto', () => {
    st().scegliVincolo('carrello');
    posaSuAsta(st().progetto.aste[1].id as ElementId, 0.4);
    eliminaSelezione();
    const ultimo = st().passato[st().passato.length - 1];
    expect(ultimo.etichetta.toLowerCase()).toContain('eliminato');
    expect(ultimo.etichetta.toLowerCase()).toContain('carrello');
  });

  it('toglie una sconnessione nodale e i corpi si ricompongono', () => {
    st().scegliVincolo('cernieraInterna');
    applicaVincolo([st().progetto.nodi[1].id as NodeId]);
    const id = st().progetto.vincoliInterni![0].id;
    st().selezionaSconnessioneNodale(id);

    eliminaSelezione();
    expect(contaVincoli(st().progetto).sconnessioniNodali).toBe(0);
    expect(st().sconnessioneNodaleSelezionata).toBeNull();
  });

  it('un solo passo di undo, che lo rimette', () => {
    st().scegliVincolo('carrello');
    posaSuAsta(st().progetto.aste[1].id as ElementId, 0.4);
    const passi = st().passato.length;
    eliminaSelezione();
    expect(st().passato.length).toBe(passi + 1);
    st().annulla();
    expect(contaVincoli(st().progetto).inCampata).toBe(1);
  });

  it('senza vincolo selezionato, Canc torna a eliminare la geometria', () => {
    const nodo = st().progetto.nodi[1].id as NodeId;
    st().seleziona({ nodi: new Set([nodo]) });
    eliminaSelezione();
    expect(st().progetto.nodi.some((n) => n.id === nodo)).toBe(false);
  });
});

/**
 * §1 (iterazione 11-bis) — IL GESTORE UNICO DI ELIMINAZIONE.
 *
 * La regressione da cui nascono questi test: dall'iterazione 9 un'asta
 * selezionata non veniva più eliminata con Canc. Il tasto arrivava dove
 * doveva; era `eliminaSelezione` a uscire prima, perché `suAstaSelezionato`
 * conservava l'id di un vincolo su asta annullato e nessuno ripuliva quel
 * campo. Il primo ramo trovava un id, eseguiva un comando a vuoto e faceva
 * `return`.
 *
 * I test coprono le otto righe della tabella del §1.4 e, soprattutto, quella
 * sequenza: è il caso che il codice sbagliato superava senza accorgersene.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { progetto } from '../../src/core/builder.js';
import { preset } from '../../src/core/materials/sezioniParametriche.js';
import { verificaIntegrita } from '../../src/core/model/integrita.js';
import { useStore, progettoVuoto } from '../../src/state/store.js';
import { eliminaSelezione, posaSuAsta } from '../../src/state/azioni.js';
import { inCampoDiTesto } from '../../src/ui/shortcuts/useScorciatoie.js';
import type { ElementId, NodeId, Progetto } from '../../src/core/model/types.js';

/** Telaio a portale: tre aste, quattro nodi, due incastri, un distribuito. */
function portale(): Progetto {
  const p = progetto('portale');
  const s = p.sezioneParametrica('s', preset('HEA 200'));
  const ps = p.nodo(0, 0, 'piede-sx'), ts = p.nodo(0, 4, 'testa-sx');
  const td = p.nodo(6, 4, 'testa-dx'), pd = p.nodo(6, 0, 'piede-dx');
  p.asta(ps, ts, 'S275', s);
  const tr = p.asta(ts, td, 'S275', s);
  p.asta(td, pd, 'S275', s);
  p.vincolo(ps, 'incastro'); p.vincolo(pd, 'incastro');
  p.distribuito(tr, -15e3);
  p.forza(ts, 8e3, 0);
  return p.costruisci();
}

beforeEach(() => {
  useStore.setState({
    progetto: progettoVuoto(), passato: [], futuro: [],
    suAstaSelezionato: null, sconnessioneNodaleSelezionata: null,
    caricoSelezionato: null,
    posaSuAsta: 'vincolo', vincoloCorrente: 'carrello',
    sconnessioneCorrente: 'cerniera', angoloVincolo: 0,
  });
  useStore.getState().caricaProgetto(portale());
});

const st = () => useStore.getState();
const conta = () => {
  const p = st().progetto;
  return {
    nodi: p.nodi.length, aste: p.aste.length, carichi: p.carichi.length,
    suAsta: (p.vincoliSuAsta ?? []).length + (p.sconnessioni ?? []).length,
    interni: (p.vincoliInterni ?? []).length,
    vincolati: p.nodi.filter((n) => n.vincolo).length,
  };
};
const asta = (k: number): ElementId => st().progetto.aste[k].id;
const nodo = (k: number): NodeId => st().progetto.nodi[k].id;

/** §1.4 riga 8 — nessuna entità orfana, dopo ogni eliminazione. */
function integra(): void {
  const esito = verificaIntegrita(st().progetto);
  expect(esito.anomalie, JSON.stringify(esito.anomalie)).toEqual([]);
}

describe('§1.4 — la tabella', () => {
  it('1. una sola asta selezionata viene eliminata', () => {
    st().seleziona({ aste: new Set([asta(1)]) });
    eliminaSelezione();
    expect(conta().aste).toBe(2);
    integra();
  });

  it('2. più aste: eliminate tutte, in un solo passo di undo', () => {
    const prima = st().passato.length;
    st().seleziona({ aste: new Set([asta(0), asta(1), asta(2)]) });
    eliminaSelezione();
    expect(conta().aste).toBe(0);
    expect(st().passato.length).toBe(prima + 1);
    integra();
  });

  it('3. un nodo con vincolo e carico: eliminati insieme, un solo undo', () => {
    // testa-sx porta la forza orizzontale; piede-sx porta l'incastro
    const prima = st().passato.length;
    st().seleziona({ nodi: new Set([nodo(0), nodo(1)]) });
    eliminaSelezione();
    const c = conta();
    expect(c.nodi).toBe(2);
    // le aste che vi insistevano se ne vanno con loro: resta la sola td→pd
    expect(c.aste).toBe(1);
    expect(c.carichi).toBe(0);
    expect(c.vincolati).toBe(1);
    expect(st().passato.length).toBe(prima + 1);
    integra();
  });

  it('4. un vincolo su asta: eliminato, come nell iterazione 9', () => {
    useStore.setState({ posaSuAsta: 'vincolo', vincoloCorrente: 'carrello' });
    posaSuAsta(asta(1), 0.5);
    expect(conta().suAsta).toBe(1);
    expect(st().suAstaSelezionato).not.toBeNull();
    eliminaSelezione();
    expect(conta().suAsta).toBe(0);
    expect(conta().aste).toBe(3);
    integra();
  });

  it('5. selezione mista: aste, vincolo su asta e carico, tutto insieme', () => {
    useStore.setState({ posaSuAsta: 'vincolo', vincoloCorrente: 'carrello' });
    posaSuAsta(asta(1), 0.3);
    const caricoId = st().progetto.carichi[0].id;
    st().selezionaCarico(caricoId);
    // `selezionaCarico` non tocca il vincolo su asta: la selezione è mista
    st().seleziona({ aste: new Set([asta(0)]) });

    const prima = st().passato.length;
    eliminaSelezione();
    const c = conta();
    expect(c.suAsta).toBe(0);
    expect(c.aste).toBe(2);
    expect(c.carichi).toBe(1);
    expect(st().passato.length).toBe(prima + 1);
    integra();
  });

  it('6. col fuoco in un campo di testo il gestore non parte nemmeno', () => {
    // La guardia sta all'inizio del gestore da tastiera: se dice «sono in un
    // campo», l'evento non arriva mai a `eliminaSelezione` e il carattere
    // viene cancellato dal campo, come in qualunque altro programma.
    const campi = [
      { tagName: 'INPUT' }, { tagName: 'TEXTAREA' }, { tagName: 'SELECT' },
      { tagName: 'DIV', isContentEditable: true },
      { tagName: 'SPAN', closest: (sel: string) => (sel.includes('contenteditable') ? {} : null) },
    ];
    for (const target of campi) {
      expect(inCampoDiTesto({ target }), JSON.stringify(target.tagName)).toBe(true);
    }
    // sul canvas e sul corpo della pagina invece deve lasciar passare
    for (const target of [{ tagName: 'CANVAS' }, { tagName: 'BODY' }, { tagName: 'BUTTON' }]) {
      expect(inCampoDiTesto({ target })).toBe(false);
    }
    expect(inCampoDiTesto({ target: null })).toBe(false);
  });

  it('6-bis. una sconnessione nodale selezionata viene eliminata', () => {
    useStore.setState({ posaSuAsta: 'sconnessione', sconnessioneCorrente: 'cerniera' });
    posaSuAsta(asta(1), 0.5);
    expect(conta().suAsta).toBe(1);
    eliminaSelezione();
    expect(conta().suAsta).toBe(0);
    integra();
  });

  it('7. undo dopo ciascun caso ripristina tutto', () => {
    const iniziale = conta();
    st().seleziona({ aste: new Set([asta(0), asta(1)]), nodi: new Set([nodo(3)]) });
    eliminaSelezione();
    expect(conta().aste).toBeLessThan(iniziale.aste);
    st().annulla();
    expect(conta()).toEqual(iniziale);
    integra();
  });

  it('8. dopo ogni eliminazione il modello resta integro', () => {
    for (const sel of [
      { aste: new Set([asta(0)]) },
      { nodi: new Set([nodo(1)]) },
    ]) {
      st().seleziona(sel);
      eliminaSelezione();
      integra();
    }
  });
});

describe('§1 — la regressione vera e propria', () => {
  /*
   * LA SEQUENZA CHE ROMPEVA. Un vincolo su asta creato e poi annullato
   * lasciava `suAstaSelezionato` appeso a un id che nel modello non c'era
   * più. Il ramo prioritario lo trovava, eseguiva un comando a vuoto e usciva:
   * l'asta selezionata non veniva mai toccata.
   */
  it('un riferimento annullato non blocca l eliminazione dell asta', () => {
    useStore.setState({ posaSuAsta: 'vincolo', vincoloCorrente: 'carrello' });
    posaSuAsta(asta(1), 0.5);
    const appeso = st().suAstaSelezionato;
    expect(appeso).not.toBeNull();

    st().annulla();
    // il puntatore va ripulito insieme al modello: è la correzione strutturale
    expect(st().suAstaSelezionato).toBeNull();
    expect(conta().suAsta).toBe(0);

    st().seleziona({ aste: new Set([asta(1)]) });
    eliminaSelezione();
    expect(conta().aste).toBe(2);
    integra();
  });

  it('anche forzando il riferimento appeso, l asta viene eliminata', () => {
    // difesa nel punto d'uso: se per una via qualsiasi il campo tornasse a
    // puntare al nulla, l'eliminazione non deve comunque perdere il bersaglio
    useStore.setState({ suAstaSelezionato: 'vs-inesistente' });
    st().seleziona({ aste: new Set([asta(1)]) });
    eliminaSelezione();
    expect(conta().aste).toBe(2);
    integra();
  });

  it('senza nulla di selezionato non si tocca la cronologia', () => {
    const prima = st().passato.length;
    st().svuotaSelezione();
    eliminaSelezione();
    expect(st().passato.length).toBe(prima);
    expect(conta().aste).toBe(3);
  });
});

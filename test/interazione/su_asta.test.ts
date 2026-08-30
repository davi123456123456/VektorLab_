/**
 * Vincoli e sconnessioni posati LUNGO un'asta.
 *
 * È la distinzione del §2: lo stesso gesto — un click in mezzo alla trave —
 * produce due strutture completamente diverse a seconda di che cosa si sta
 * posando. Questi test verificano che la differenza arrivi fino al calcolo,
 * non solo al disegno.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { progetto } from '../../src/core/builder.js';
import { preset } from '../../src/core/materials/sezioniParametriche.js';
import { analizzaCinematica, espandi } from '../../src/core/index.js';
import { useStore, progettoVuoto } from '../../src/state/store.js';
import {
  posaSuAsta, eliminaSuAstaSelezionato, applicaVincolo,
} from '../../src/state/azioni.js';
import { ribaltaVincolo, spostaSuAsta } from '../../src/state/commands.js';
import { deduciAzioneSuNodo } from '../../src/core/model/deduzione.js';
import type { ElementId, Progetto } from '../../src/core/model/types.js';

/** Trave semplicemente appoggiata di 10 m. */
function trave(): Progetto {
  const p = progetto('trave');
  const sez = p.sezioneParametrica('s', preset('IPE 300'));
  const a = p.nodo(0, 0, 'A');
  const b = p.nodo(10, 0, 'B');
  const el = p.asta(a, b, 'S275', sez, { teoria: 'eulero-bernoulli' });
  p.vincolo(a, 'cerniera');
  p.vincolo(b, 'carrello');
  p.distribuito(el, -10e3);
  return p.costruisci();
}

beforeEach(() => {
  useStore.setState({
    progetto: progettoVuoto(), passato: [], futuro: [],
    suAstaSelezionato: null, posaSuAsta: 'vincolo', vincoloCorrente: 'carrello',
    sconnessioneCorrente: 'cerniera', angoloVincolo: 0,
  });
  useStore.getState().caricaProgetto(trave());
});

const astaId = () => useStore.getState().progetto.aste[0].id as ElementId;

describe('vincolo esterno intermedio', () => {
  it('non interrompe la trave: un solo corpo rigido, struttura iperstatica', () => {
    useStore.setState({ posaSuAsta: 'vincolo', vincoloCorrente: 'carrello' });
    posaSuAsta(astaId(), 0.5);

    const p = useStore.getState().progetto;
    expect(p.vincoliSuAsta?.length).toBe(1);
    expect(p.sconnessioni ?? []).toHaveLength(0);
    // l'asta disegnata resta UNA sola: l'utente non deve vedersi comparire
    // due travi dove ne ha tracciata una
    expect(p.aste.length).toBe(1);

    const c = analizzaCinematica(p);
    expect(c.numeroCorpi).toBe(1);
    expect(c.classificazione).toBe('iperstatica');
    expect(c.iperstaticita).toBe(1);
  });

  it('nel modello di calcolo diventa un nodo, con continuità completa', () => {
    useStore.setState({ posaSuAsta: 'vincolo', vincoloCorrente: 'carrello' });
    posaSuAsta(astaId(), 0.4);
    const e = espandi(useStore.getState().progetto);
    expect(e.progetto.aste.length).toBe(2);
    expect(e.nodiVincolo.size).toBe(1);
    // nessun rilascio: i due tronchi condividono anche la rotazione
    for (const a of e.progetto.aste) {
      expect(a.svincolo.iniziale.M).toBe(false);
      expect(a.svincolo.finale.M).toBe(false);
    }
  });
});

describe('sconnessione interna', () => {
  it('divide la struttura in due corpi e la riporta isostatica', () => {
    // due carrelli intermedi renderebbero la trave 2 volte iperstatica;
    // aggiungendo una cerniera interna si torna a 1
    useStore.setState({ posaSuAsta: 'vincolo', vincoloCorrente: 'carrello' });
    posaSuAsta(astaId(), 0.5);
    useStore.setState({ posaSuAsta: 'sconnessione', sconnessioneCorrente: 'cerniera' });
    posaSuAsta(astaId(), 0.75);

    const p = useStore.getState().progetto;
    expect(p.sconnessioni?.length).toBe(1);
    const c = analizzaCinematica(p);
    expect(c.numeroCorpi).toBe(2);
    expect(c.classificazione).toBe('isostatica');
  });

  it('applica il rilascio giusto secondo il tipo', () => {
    const rilasci = (tipo: 'cerniera' | 'bipendolo' | 'pattino') => {
      useStore.getState().caricaProgetto(trave());
      useStore.setState({ posaSuAsta: 'sconnessione', sconnessioneCorrente: tipo });
      posaSuAsta(astaId(), 0.5);
      const e = espandi(useStore.getState().progetto);
      // il rilascio sta sull'estremo iniziale del tronco che segue
      return e.progetto.aste[1].svincolo.iniziale;
    };
    expect(rilasci('cerniera')).toMatchObject({ M: true, N: false, T: false });
    expect(rilasci('bipendolo')).toMatchObject({ T: true, N: false, M: false });
    expect(rilasci('pattino')).toMatchObject({ N: true, T: false, M: false });
  });
});

describe('modifica e rimozione', () => {
  it('spostare lungo l\'asta è un solo comando, annullabile', () => {
    useStore.setState({ posaSuAsta: 'vincolo', vincoloCorrente: 'carrello' });
    posaSuAsta(astaId(), 0.5);
    const id = useStore.getState().progetto.vincoliSuAsta![0].id;

    useStore.getState().esegui(spostaSuAsta(id, 0.8));
    expect(useStore.getState().progetto.vincoliSuAsta![0].s).toBeCloseTo(0.8, 9);
    useStore.getState().annulla();
    expect(useStore.getState().progetto.vincoliSuAsta![0].s).toBeCloseTo(0.5, 9);
  });

  it('l\'ascissa resta dentro l\'asta, estremi esclusi', () => {
    useStore.setState({ posaSuAsta: 'vincolo', vincoloCorrente: 'carrello' });
    posaSuAsta(astaId(), 0.5);
    const id = useStore.getState().progetto.vincoliSuAsta![0].id;
    // un vincolo esattamente sull'estremo genererebbe un tronco di lunghezza
    // nulla, e il solutore non ha nulla da fare con un'asta di lunghezza zero
    useStore.getState().esegui(spostaSuAsta(id, 1.5));
    expect(useStore.getState().progetto.vincoliSuAsta![0].s).toBeLessThan(1);
    expect(useStore.getState().progetto.vincoliSuAsta![0].s).toBeGreaterThan(0.999);
    useStore.getState().esegui(spostaSuAsta(id, -0.3));
    expect(useStore.getState().progetto.vincoliSuAsta![0].s).toBeGreaterThan(0);
  });

  it('eliminare rimette la struttura come prima ed è annullabile', () => {
    useStore.setState({ posaSuAsta: 'sconnessione', sconnessioneCorrente: 'cerniera' });
    posaSuAsta(astaId(), 0.5);
    expect(useStore.getState().progetto.sconnessioni!.length).toBe(1);
    eliminaSuAstaSelezionato();
    expect(useStore.getState().progetto.sconnessioni!.length).toBe(0);
    useStore.getState().annulla();
    expect(useStore.getState().progetto.sconnessioni!.length).toBe(1);
  });
});

describe('sconnessione interna su un nodo', () => {
  /**
   * Il gesto di A5: clic su un nodo interno. Il software deve dedurre da solo
   * che lì serve una cerniera INTERNA, e dirlo prima del clic.
   */
  function aTelaio(): Progetto {
    const p = progetto('telaietto');
    const sez = p.sezioneParametrica('s', preset('IPE 300'));
    const a = p.nodo(0, 0, 'A');
    const b = p.nodo(0, 3, 'B');
    const c = p.nodo(4, 3, 'C');
    p.asta(a, b, 'S275', sez, { teoria: 'eulero-bernoulli' });
    p.asta(b, c, 'S275', sez, { teoria: 'eulero-bernoulli' });
    p.vincolo(a, 'incastro');
    return p.costruisci();
  }

  it('su un nodo dove convergono due aste deduce la sconnessione interna', () => {
    const p = aTelaio();
    const e = deduciAzioneSuNodo(p, 'B' as never, 'cerniera');
    expect(e.azione).toBe('sconnessioneInterna');
    expect(e.motivo).toMatch(/sconnette/);
  });

  it('su un estremo deduce il vincolo esterno: non c\'è nulla da sconnettere', () => {
    const p = aTelaio();
    const e = deduciAzioneSuNodo(p, 'C' as never, 'cerniera');
    expect(e.azione).toBe('vincoloEsterno');
  });

  it('il modo esplicito scavalca l\'euristica', () => {
    const p = aTelaio();
    expect(deduciAzioneSuNodo(p, 'B' as never, 'cerniera', 'esterno').azione)
      .toBe('vincoloEsterno');
    const forzata = deduciAzioneSuNodo(p, 'C' as never, 'cerniera', 'interno');
    expect(forzata.azione).toBe('impossibile');
    expect(forzata.motivo).toMatch(/una sola asta/);
  });

  it('un incastro non ha versione interna', () => {
    const p = aTelaio();
    expect(deduciAzioneSuNodo(p, 'B' as never, 'incastro').azione).toBe('vincoloEsterno');
    expect(deduciAzioneSuNodo(p, 'B' as never, 'incastro', 'interno').azione)
      .toBe('impossibile');
  });

  it('applicandola due volte si toglie, e il conteggio torna indietro', () => {
    useStore.getState().caricaProgetto(aTelaio());
    useStore.setState({ vincoloCorrente: 'cerniera', modoCerniera: 'auto' });
    applicaVincolo(['B' as never]);
    expect(useStore.getState().progetto.vincoliInterni.length).toBe(1);
    expect(analizzaCinematica(useStore.getState().progetto).numeroCorpi).toBe(2);

    applicaVincolo(['B' as never]);
    expect(useStore.getState().progetto.vincoliInterni.length).toBe(0);
    expect(analizzaCinematica(useStore.getState().progetto).numeroCorpi).toBe(1);
  });

  it('il ribaltamento è mezzo giro e non tocca il rango', () => {
    useStore.getState().caricaProgetto(aTelaio());
    const prima = analizzaCinematica(useStore.getState().progetto);
    useStore.getState().esegui(ribaltaVincolo(['A' as never]));
    const nodo = useStore.getState().progetto.nodi.find((n) => (n.id as string) === 'A')!;
    expect((nodo.vincolo!.angolo * 180) / Math.PI).toBeCloseTo(180, 9);
    // l'incastro non ha direzione preferenziale: il rango non cambia
    const dopo = analizzaCinematica(useStore.getState().progetto);
    expect(dopo.rango).toBe(prima.rango);
    expect(dopo.classificazione).toBe(prima.classificazione);
  });
});

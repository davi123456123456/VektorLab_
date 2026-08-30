/**
 * Disegno dei risultati: scale, deformata, convenzione del momento, worker.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { progetto } from '../../src/core/builder.js';
import { analizzaCaso, analizzaCinematica } from '../../src/core/index.js';
import {
  massimoAssoluto, scalaAutomatica, valoriComponente,
} from '../../src/render/diagrammi.js';
import { asseDeformato, fattoreAutomatico } from '../../src/render/deformata.js';
import { ponte } from '../../src/worker/bridge.js';
import { useStore } from '../../src/state/store.js';
import { aggiungiNodo } from '../../src/state/commands.js';
import type { LoadCaseId, Progetto } from '../../src/core/model/types.js';

const CASO = 'principale' as LoadCaseId;

/** Mensola di 4 m con carico in punta: M lineare, T costante, N nullo. */
function mensola(): Progetto {
  const p = progetto('mensola');
  const a = p.nodo(0, 0);
  const b = p.nodo(4, 0);
  p.asta(a, b, 'S275', 'IPE 300', { teoria: 'eulero-bernoulli' });
  p.vincolo(a, 'incastro');
  p.forza(b, 0, -10000);
  return p.costruisci();
}

describe('scale dei diagrammi', () => {
  it('il massimo assoluto corrisponde ai valori calcolati', () => {
    const p = mensola();
    const r = analizzaCaso(p, CASO);
    // mensola L=4, P=10 kN → M all'incastro = 40 kNm, T = 10 kN
    expect(massimoAssoluto(r, 'M')).toBeCloseTo(40e3, 3);
    expect(massimoAssoluto(r, 'T')).toBeCloseTo(10e3, 3);
    expect(massimoAssoluto(r, 'N')).toBeLessThan(1e-6);
  });

  it('la scala automatica dà al picco una frazione fissa del modello', () => {
    const p = mensola();
    const r = analizzaCaso(p, CASO);
    const scala = scalaAutomatica(p, r, 'M', 0.13);
    // il picco disegnato vale scala · M_max, e deve essere il 13 % della
    // diagonale del modello (qui 4 m)
    expect(scala * massimoAssoluto(r, 'M')).toBeCloseTo(0.13 * 4, 6);
  });

  it('la scala è nulla quando la componente è ovunque nulla', () => {
    const p = mensola();
    const r = analizzaCaso(p, CASO);
    expect(scalaAutomatica(p, r, 'N')).toBe(0);
  });

  it('valoriComponente restituisce la serie giusta', () => {
    const r = analizzaCaso(mensola(), CASO);
    expect(valoriComponente(r.aste[0], 'M')).toBe(r.aste[0].M);
    expect(valoriComponente(r.aste[0], 'T')).toBe(r.aste[0].T);
    expect(valoriComponente(r.aste[0], 'N')).toBe(r.aste[0].N);
  });
});

describe('deformata', () => {
  it('l\'amplificazione automatica è un numero "tondo"', () => {
    const p = mensola();
    const r = analizzaCaso(p, CASO);
    const f = fattoreAutomatico(p, r);
    // deve essere della forma 1, 2, 5 × potenza di 10: «×250» si comunica,
    // «×237.4» no
    const m = f / Math.pow(10, Math.floor(Math.log10(f)));
    expect([1, 2, 5, 10].some((k) => Math.abs(m - k) < 1e-9)).toBe(true);
    // e deve portare la freccia massima a circa l'8 % della luce
    expect(f * r.spostamentoMassimo).toBeGreaterThan(0.08 * 4 * 0.5);
    expect(f * r.spostamentoMassimo).toBeLessThan(0.08 * 4 * 2.5);
  });

  it('l\'asse deformato parte dal nodo iniziale e arriva a quello finale', () => {
    const p = mensola();
    const r = analizzaCaso(p, CASO);
    const g = { x1: 0, y1: 0, c: 1, s: 0 };
    const punti = asseDeformato(r.aste[0], g, 1);

    // l'estremo incastrato non si sposta
    expect(punti[0].x).toBeCloseTo(0, 9);
    expect(punti[0].y).toBeCloseTo(0, 9);

    // L'estremo libero coincide con lo spostamento nodale calcolato dal
    // solutore. È una verifica di COERENZA fra due strade indipendenti:
    // la soluzione del sistema globale e l'integrazione della curvatura.
    const ultimo = punti[punti.length - 1];
    expect(ultimo.x).toBeCloseTo(4 + r.spostamenti[3], 9);
    expect(ultimo.y).toBeCloseTo(r.spostamenti[4], 11);
  });

  it('la freccia cresce in modo monotono lungo la mensola', () => {
    const r = analizzaCaso(mensola(), CASO);
    const punti = asseDeformato(r.aste[0], { x1: 0, y1: 0, c: 1, s: 0 }, 1);
    for (let i = 1; i < punti.length; i++) {
      expect(punti[i].y).toBeLessThanOrEqual(punti[i - 1].y + 1e-12);
    }
  });

  it('l\'amplificazione scala linearmente la deformata', () => {
    const r = analizzaCaso(mensola(), CASO);
    const g = { x1: 0, y1: 0, c: 1, s: 0 };
    const a = asseDeformato(r.aste[0], g, 1);
    const b = asseDeformato(r.aste[0], g, 100);
    const i = a.length - 1;
    expect(b[i].y).toBeCloseTo(a[i].y * 100, 9);
  });
});

describe('convenzione del momento', () => {
  /**
   * Con M > 0 che tende le fibre dal lato −y locale, disegnare «dalla parte
   * delle fibre tese» significa riportarlo dal lato −y. Su una mensola
   * caricata verso il basso il momento è negativo (fibre superiori tese),
   * quindi il diagramma cade dal lato +y, cioè SOPRA la trave.
   */
  it('la mensola con carico verso il basso ha momento negativo', () => {
    const r = analizzaCaso(mensola(), CASO);
    const M = r.aste[0].M;
    expect(M[0]).toBeLessThan(0);
    expect(Math.abs(M[0])).toBeCloseTo(40e3, 3);
  });

  it('la trave appoggiata con carico verso il basso ha momento positivo', () => {
    const p = progetto('appoggiata');
    const a = p.nodo(0, 0);
    const b = p.nodo(6, 0);
    const asta = p.asta(a, b, 'S275', 'IPE 300', { teoria: 'eulero-bernoulli' });
    p.vincolo(a, 'cerniera');
    p.vincolo(b, 'carrello');
    p.distribuito(asta, -10000);
    const r = analizzaCaso(p.costruisci(), CASO);
    const notevoli = r.aste[0].puntiNotevoli.filter((x) => x.tipo === 'M_max');
    expect(notevoli.length).toBe(1);
    // q L²/8 = 10·36/8 = 45 kNm, positivo (fibre inferiori tese)
    expect(notevoli[0].M).toBeCloseTo(45e3, 2);
    expect(notevoli[0].x).toBeCloseTo(3, 6);
  });
});

describe('ponte verso il worker', () => {
  it('ripiega sul calcolo sincrono quando i Worker non esistono', async () => {
    // in Node non c'è `Worker`: il ponte deve calcolare comunque, con lo
    // stesso codice di `core/`
    expect(typeof Worker).toBe('undefined');
    const esito = await ponte.analizza(mensola(), { tipo: 'caso', id: CASO });
    expect(esito).not.toBeNull();
    expect(esito!.risultato.equilibrio.soddisfatto).toBe(true);
    expect(esito!.risultato.reazioni[0].fy).toBeCloseTo(10000, 6);
  });

  it('l\'analisi cinematica passa dallo stesso ponte', async () => {
    const k = await ponte.cinematica(mensola());
    expect(k).not.toBeNull();
    expect(k!.classificazione).toBe('isostatica');
  });
});

describe('validità dei risultati nello store', () => {
  beforeEach(() => {
    useStore.setState({
      progetto: mensola(), passato: [], futuro: [],
      risultato: null, cinematica: null, erroreCalcolo: null,
      selezione: { nodi: new Set(), aste: new Set() },
      sorgenteRisultati: { tipo: 'caso', id: CASO },
    });
  });

  it('calcola e conserva il risultato', async () => {
    await useStore.getState().calcolaRisultati();
    const r = useStore.getState().risultato;
    expect(r).not.toBeNull();
    expect(r!.equilibrio.soddisfatto).toBe(true);
  });

  it('qualunque modifica del modello invalida i risultati', async () => {
    await useStore.getState().calcolaRisultati();
    expect(useStore.getState().risultato).not.toBeNull();

    // Mostrare risultati calcolati su un modello PRECEDENTE è il modo più
    // efficace di far sbagliare una verifica: devono sparire.
    useStore.getState().esegui(aggiungiNodo(9, 9));
    expect(useStore.getState().risultato).toBeNull();

    // Il conteggio invece NON sparisce: si rifà. È il pannello sempre visibile,
    // e deve dire la verità sul modello di ADESSO, non tacere né restare
    // fermo a quello di prima.
    const dopo = useStore.getState().cinematica;
    expect(dopo, 'il conteggio deve essere ricalcolato, non azzerato').not.toBeNull();
    const atteso = analizzaCinematica(useStore.getState().progetto);
    expect(dopo!.numeroCorpi).toBe(atteso.numeroCorpi);
    expect(dopo!.rango).toBe(atteso.rango);
    expect(dopo!.classificazione).toBe(atteso.classificazione);
  });

  it('un modello senza aste non produce risultati ma spiega perché', async () => {
    useStore.setState({
      progetto: { ...mensola(), aste: [], nodi: [] },
      risultato: null, erroreCalcolo: null,
    });
    await useStore.getState().calcolaRisultati();
    expect(useStore.getState().risultato).toBeNull();
    expect(useStore.getState().erroreCalcolo).toContain('aste');
  });
});

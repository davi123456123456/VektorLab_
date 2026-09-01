/**
 * REGRESSIONE — le autoverifiche normalizzavano su quantità che possono
 * legittimamente annullarsi.
 *
 * Tre volte lo stesso errore di fondo, a tre livelli diversi:
 *
 *   · `residuoRelativo` divideva per la somma delle sole FORZE, e su una
 *     struttura caricata da coppie il denominatore andava a zero;
 *   · la verifica differenziale `dM/dx = T` divideva per i valori DELLA
 *     SINGOLA ASTA, e su un puntone — dove `T` e `M` sono nulli ovunque —
 *     l'arrotondamento diviso zero dava scarti dell'ordine di 10;
 *   · il pavimento globale che ho aggiunto per rimediare leggeva a sua volta
 *     le sole forze di reazione, che su una struttura a sola coppia sono
 *     esattamente nulle.
 *
 * Il rimedio è sempre lo stesso: il termine di confronto è l'ampiezza della
 * STRUTTURA, e i momenti vi entrano divisi per una lunghezza caratteristica,
 * che li rende forze equivalenti.
 *
 * Sono difetti delle VERIFICHE, non del calcolo: le soluzioni erano esatte.
 * Ma un'autoverifica che grida al lupo su un risultato corretto è peggio di
 * nessuna autoverifica, perché insegna a ignorarla.
 *
 * Trovati dalla campagna casuale del §10.2, semi 9019, 1026 e 200086.
 */

import { describe, it, expect } from 'vitest';
import { progetto } from '../../src/core/builder.js';
import { preset } from '../../src/core/materials/sezioniParametriche.js';
import { analizzaStatica } from '../../src/core/index.js';
import type { LoadCaseId, Progetto } from '../../src/core/model/types.js';

const SORGENTE = { tipo: 'caso', id: 'principale' as LoadCaseId } as const;

/** Tutte le autoverifiche che hanno esaminato qualcosa devono passare. */
function verificaTutto(p: Progetto): void {
  const st = analizzaStatica(p, SORGENTE);
  const fallite = st.autoverifiche.verifiche
    .filter((v) => !v.superata && v.esaminati > 0)
    .map((v) => `${v.codice}: ${v.dettaglio}`);
  expect(fallite).toEqual([]);
}

describe('strutture dove il termine di confronto si annulla', () => {
  it('puntone scarico a flessione: T e M nulli su tutta un asta', () => {
    // il carico passa per l'asse della seconda asta, che lavora a solo sforzo
    // normale: lì T ≡ 0 e M ≡ 0, e la verifica differenziale divideva per zero
    const p = progetto('puntone');
    const s = p.sezioneParametrica('s', preset('IPE 200'));
    const a = p.nodo(0, 0), b = p.nodo(0, -3), c = p.nodo(4, -3);
    p.asta(b, a, 'S275', s, { teoria: 'eulero-bernoulli' });
    p.asta(b, c, 'S275', s, { teoria: 'eulero-bernoulli' });
    p.vincolo(a, 'cerniera');
    p.vincolo(c, 'cerniera');
    p.forza(b, 0, -10e3);
    verificaTutto(p.costruisci());
  });

  it('struttura caricata da una SOLA COPPIA: reazioni di forza nulle', () => {
    const p = progetto('coppia');
    const s = p.sezioneParametrica('s', preset('IPE 200'));
    const a = p.nodo(0, 0), b = p.nodo(4, 0);
    p.asta(a, b, 'S275', s, { teoria: 'eulero-bernoulli' });
    p.vincolo(a, 'incastro');
    p.momento(b, 20e3);
    const costruito = p.costruisci();

    const st = analizzaStatica(costruito, SORGENTE);
    // è proprio il caso limite: nessuna reazione di forza
    expect(Math.abs(st.fem.reazioni[0].fx)).toBeLessThan(1e-6);
    expect(Math.abs(st.fem.reazioni[0].fy)).toBeLessThan(1e-6);
    verificaTutto(costruito);
  });

  it('coppia su una struttura con un carrello interno', () => {
    // il caso ridotto dal seme 200086: due aste scariche a flessione e una
    // reazione di solo momento
    const p = progetto('carrello interno');
    const s = p.sezioneParametrica('s', preset('IPE 200'));
    const a = p.nodo(0, 0), b = p.nodo(0, -4);
    const c = p.nodo(3, -4), d = p.nodo(3, 0);
    p.asta(a, b, 'S275', s, { teoria: 'eulero-bernoulli' });
    p.asta(b, c, 'S275', s, { teoria: 'eulero-bernoulli' });
    p.asta(c, d, 'S275', s, { teoria: 'eulero-bernoulli' });
    p.vincolo(a, 'incastro');
    p.vincolo(d, 'cerniera');
    p.sconnessioneNodale(c, 'carrelloInterno');
    p.momento(b, 12e3);
    verificaTutto(p.costruisci());
  });

  it('e il residuo di equilibrio resta piccolo in tutti e tre i casi', () => {
    const p = progetto('coppia');
    const s = p.sezioneParametrica('s', preset('IPE 200'));
    const a = p.nodo(0, 0), b = p.nodo(4, 0);
    p.asta(a, b, 'S275', s, { teoria: 'eulero-bernoulli' });
    p.vincolo(a, 'incastro');
    p.momento(b, 20e3);
    const st = analizzaStatica(p.costruisci(), SORGENTE);
    expect(st.fem.equilibrio.residuoRelativo).toBeLessThan(1e-8);
    expect(st.fem.equilibrio.soddisfatto).toBe(true);
  });
});

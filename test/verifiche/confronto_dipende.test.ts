/**
 * §6.2 — il confronto dipende DAVVERO dalla struttura.
 *
 * È il test che la specifica indica come criterio: allungando un'asta,
 * spostando un vincolo o aggiungendo un carico, i valori devono cambiare.
 * Se restassero fermi, il confronto non starebbe analizzando il modello.
 */

import { describe, it, expect } from 'vitest';
import { progetto } from '../../src/core/builder.js';
import { preset } from '../../src/core/materials/sezioniParametriche.js';
import { confrontaMateriali } from '../../src/core/checks/confronto.js';
import { MATERIALI } from '../../src/core/materials/materials.js';
import type { LoadCaseId, Progetto } from '../../src/core/model/types.js';

const SORGENTE = { tipo: 'caso', id: 'principale' as LoadCaseId } as const;

function trave(L: number, q: number, vincoloDestro: 'carrello' | 'incastro' = 'carrello'): Progetto {
  const p = progetto('t');
  const s = p.sezioneParametrica('s', preset('IPE 200'));
  const a = p.nodo(0, 0), b = p.nodo(L, 0);
  const el = p.asta(a, b, 'S275', s, { teoria: 'eulero-bernoulli' });
  p.vincolo(a, 'cerniera');
  p.vincolo(b, vincoloDestro);
  p.distribuito(el, -q);
  return p.costruisci();
}

const riga = (p: Progetto, id: string) =>
  confrontaMateriali(p, SORGENTE, MATERIALI).find((r) => r.materialeId === id)!;

describe('§6.2 — dipendenza dal modello reale', () => {
  it('allungando l asta, peso freccia e sfruttamento cambiano', () => {
    const corta = riga(trave(4, 10e3), 'S275');
    const lunga = riga(trave(9, 10e3), 'S275');

    expect(lunga.massa).toBeGreaterThan(corta.massa * 2);
    expect(lunga.spostamentoMassimo).toBeGreaterThan(corta.spostamentoMassimo * 10);
    expect(lunga.sfruttamentoMassimo).toBeGreaterThan(corta.sfruttamentoMassimo * 2);
  });

  it('aggiungendo carico, sfruttamento e freccia crescono in proporzione', () => {
    const leggera = riga(trave(6, 5e3), 'S275');
    const carica = riga(trave(6, 10e3), 'S275');

    expect(carica.sfruttamentoMassimo / leggera.sfruttamentoMassimo).toBeCloseTo(2, 1);
    expect(carica.spostamentoMassimo / leggera.spostamentoMassimo).toBeCloseTo(2, 1);
    // il peso invece NON dipende dal carico
    expect(carica.massa).toBeCloseTo(leggera.massa, 9);
  });

  it('cambiando il vincolo cambia lo schema statico, e i risultati con lui', () => {
    const appoggiata = riga(trave(6, 10e3), 'S275');
    const incastrata = riga(trave(6, 10e3, 'incastro'), 'S275');

    // stessa massa, comportamento diverso: l'incastro riduce freccia e
    // sfruttamento perché la struttura non è più isostatica
    expect(incastrata.massa).toBeCloseTo(appoggiata.massa, 9);
    expect(incastrata.spostamentoMassimo).toBeLessThan(appoggiata.spostamentoMassimo);
  });

  it('le PROPRIETÀ del materiale invece restano quelle, ed è giusto', () => {
    // è il motivo per cui la vista non deve aprirsi su queste: mostrandole
    // per prime, il confronto sembrava non reagire mai al modello
    const corta = riga(trave(4, 10e3), 'S275');
    const lunga = riga(trave(9, 10e3), 'S275');
    expect(lunga.resistenza).toBe(corta.resistenza);
    expect(lunga.E).toBe(corta.E);
    expect(lunga.rho).toBe(corta.rho);
  });

  it('ogni materiale è valutato sulla STESSA struttura', () => {
    const righe = confrontaMateriali(trave(6, 10e3), SORGENTE, MATERIALI);
    // la massa dipende solo dalla densità, a geometria fissa: il rapporto fra
    // due masse deve essere quello fra le densità, e lo è solo se la
    // geometria usata è davvero la stessa per entrambi
    const acciaio = righe.find((r) => r.materialeId === 'S275')!;
    const alluminio = righe.find((r) => r.materialeId === 'AL6061T6')!;
    expect(alluminio.massa / acciaio.massa)
      .toBeCloseTo(alluminio.rho / acciaio.rho, 9);
  });

  it('la tensione massima si ricava da sfruttamento e resistenza', () => {
    const r = riga(trave(6, 10e3), 'S275');
    const m = MATERIALI.find((x) => (x.id as unknown as string) === 'S275')!;
    const sigma = (r.sfruttamentoMassimo * r.resistenza) / m.gammaM;

    /*
     * Le due grandezze usano resistenze DIVERSE, ed è una distinzione che
     * conta: lo sfruttamento si misura sulla resistenza DI PROGETTO
     * `f_d = f / γ_M`, perché è quella con cui si verifica; il coefficiente di
     * sicurezza sulla resistenza CARATTERISTICA `f`, perché dice quante volte
     * il materiale sta dentro sé stesso, al netto dei coefficienti parziali.
     *
     * Il loro rapporto è quindi esattamente γ_M, e questo test lo fissa: se un
     * giorno una delle due cambiasse riferimento, il rapporto smetterebbe di
     * valere 1,05 e si saprebbe subito.
     */
    expect(r.resistenza / sigma).toBeCloseTo(r.coefficienteMinimo, 6);
    expect(r.coefficienteMinimo * r.sfruttamentoMassimo).toBeCloseTo(m.gammaM, 6);
  });
});

/**
 * Confronto fra materiali: le relazioni fisiche che devono valere sempre.
 */

import { describe, it, expect } from 'vitest';
import { progetto } from '../../src/core/builder.js';
import { preset } from '../../src/core/materials/sezioniParametriche.js';
import { confrontaMateriali, massaStruttura } from '../../src/core/checks/confronto.js';
import { MATERIALI, materialePerId } from '../../src/core/materials/materials.js';
import type { LoadCaseId, Progetto } from '../../src/core/model/types.js';

const CASO = 'principale' as LoadCaseId;

function trave(): Progetto {
  const p = progetto('appoggiata');
  const sez = p.sezioneParametrica('s', preset('IPE 300'));
  const a = p.nodo(0, 0);
  const b = p.nodo(6, 0);
  const asta = p.asta(a, b, 'S275', sez, { teoria: 'eulero-bernoulli' });
  p.vincolo(a, 'cerniera');
  p.vincolo(b, 'carrello');
  p.distribuito(asta, -12e3);
  return p.costruisci();
}

describe('massa della struttura', () => {
  it('vale Σ ρ·A·L', () => {
    const p = trave();
    const m = materialePerId('S275');
    const A = p.sezioniPersonalizzate[0].A;
    expect(massaStruttura(p, m)).toBeCloseTo(m.rho * A * 6, 6);
  });
});

describe('confronto fra materiali', () => {
  const righe = confrontaMateriali(trave(), { tipo: 'caso', id: CASO }, MATERIALI);

  it('produce una riga per ciascun materiale', () => {
    expect(righe.length).toBe(MATERIALI.length);
    expect(righe.every((r) => Number.isFinite(r.massa))).toBe(true);
  });

  it('la massa è proporzionale alla densità', () => {
    const acciaio = righe.find((r) => r.materialeId === 'S275')!;
    const alluminio = righe.find((r) => r.materialeId === 'AL6061T6')!;
    expect(alluminio.massa / acciaio.massa).toBeCloseTo(2700 / 7850, 6);
  });

  it('la freccia è inversamente proporzionale al modulo elastico', () => {
    // stessa geometria e stesso carico: δ ∝ 1/E.
    // Vale solo perché lo spostamento massimo comprende la freccia in campata:
    // qui la trave ha due soli nodi, entrambi vincolati.
    const acciaio = righe.find((r) => r.materialeId === 'S275')!;
    const alluminio = righe.find((r) => r.materialeId === 'AL6061T6')!;
    expect(acciaio.spostamentoMassimo).toBeGreaterThan(0);
    expect(alluminio.spostamentoMassimo / acciaio.spostamentoMassimo)
      .toBeCloseTo(210 / 69, 2);
  });

  it('gli acciai da carpenteria hanno la stessa freccia ma sfruttamenti diversi', () => {
    // stesso E, quindi stessa deformata; f_y diverso, quindi verifica diversa
    const s235 = righe.find((r) => r.materialeId === 'S235')!;
    const s355 = righe.find((r) => r.materialeId === 'S355')!;
    expect(s355.spostamentoMassimo).toBeCloseTo(s235.spostamentoMassimo, 12);
    expect(s355.sfruttamentoMassimo / s235.sfruttamentoMassimo)
      .toBeCloseTo(235 / 355, 6);
  });

  it('nessun materiale vince su tutte le colonne', () => {
    const validi = righe.filter((r) => Number.isFinite(r.spostamentoMassimo));
    const minMassa = Math.min(...validi.map((r) => r.massa));
    const minFreccia = Math.min(...validi.map((r) => r.spostamentoMassimo));
    const conCosto = validi.filter((r) => r.costo !== null);
    const minCosto = Math.min(...conCosto.map((r) => r.costo!));
    const perfetto = validi.find((r) =>
      r.massa === minMassa && r.spostamentoMassimo === minFreccia && r.costo === minCosto);
    expect(perfetto).toBeUndefined();
  });

  it('il costo è massa × prezzo unitario', () => {
    for (const r of righe) {
      const m = MATERIALI.find((x) => (x.id as string) === r.materialeId)!;
      if (m.costoEuroKg === undefined) { expect(r.costo).toBeNull(); continue; }
      expect(r.costo!).toBeCloseTo(r.massa * m.costoEuroKg, 6);
    }
  });

  it('il calcestruzzo non verifica una trave inflessa senza armatura', () => {
    // resiste a compressione ma quasi nulla a trazione: la fibra inferiore cede
    const cls = righe.find((r) => r.materialeId === 'C25_30')!;
    expect(cls.verificato).toBe(false);
  });
});

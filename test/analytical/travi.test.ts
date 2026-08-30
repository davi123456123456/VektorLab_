/**
 * Confronto con le soluzioni analitiche della teoria tecnica delle travi.
 * Per l'elemento di Eulero-Bernoulli con carichi consistenti i valori NODALI
 * sono esatti: la tolleranza è quindi quella dell'aritmetica in virgola
 * mobile, non un margine ingegneristico.
 */

import { describe, it, expect } from 'vitest';
import { progetto, analizzaCaso, rettangolare } from '../../src/core/index.js';
import type { LoadCaseId, NodeId, ElementId } from '../../src/core/model/types.js';

const CASO = 'principale' as LoadCaseId;
const E = 210e9;
const SEZ = rettangolare(0.05, 0.10, 'SEZ');   // A=5e-3, I=4.1666e-6
const I = SEZ.I;
const EI = E * I;

/**
 * Catena di `nel` aste allineate da x=0 a x=L.
 * La teoria è forzata a Eulero-Bernoulli: i valori di confronto vengono da
 * quella teoria, e il selettore automatico passerebbe a Timoshenko perché
 * qui L/h < 10 (comportamento corretto del programma, ma altra soluzione).
 */
function trave(L: number, nel: number) {
  const p = progetto('trave');
  const nodi: NodeId[] = [];
  for (let i = 0; i <= nel; i++) nodi.push(p.nodo((L * i) / nel, 0));
  const aste: ElementId[] = [];
  for (let i = 0; i < nel; i++) {
    aste.push(p.asta(nodi[i], nodi[i + 1], 'S355', 'SEZ', { teoria: 'eulero-bernoulli' }));
  }
  p.sezione(SEZ);
  return { p, nodi, aste };
}

const M = (r: ReturnType<typeof analizzaCaso>) =>
  r.aste.flatMap((a) => [...a.M]);
const maxAbs = (v: number[]) => v.reduce((m, x) => Math.max(m, Math.abs(x)), 0);

/**
 * Momenti nei PUNTI NOTEVOLI: gli estremi veri del diagramma, individuati
 * cercando lo zero del taglio per bisezione. Il massimo del campionamento
 * regolare cadrebbe accanto al picco, non sul picco.
 */
const Mnotevoli = (r: ReturnType<typeof analizzaCaso>) =>
  r.aste.flatMap((a) => a.puntiNotevoli.map((q) => q.M));

describe('mensola', () => {
  it('forza in punta: δ = PL³/3EI, M_incastro = PL', () => {
    const L = 3, P = 5000;
    const { p, nodi } = trave(L, 4);
    p.vincolo(nodi[0], 'incastro');
    p.forza(nodi[4], 0, -P);
    const r = analizzaCaso(p.costruisci(), CASO);

    const uy = r.spostamenti[3 * 4 + 1];
    expect(uy).toBeCloseTo(-(P * L ** 3) / (3 * EI), 12);
    const rz = r.spostamenti[3 * 4 + 2];
    expect(rz).toBeCloseTo(-(P * L ** 2) / (2 * EI), 12);

    // momento all'incastro
    expect(Math.abs(r.aste[0].M[0])).toBeCloseTo(P * L, 6);
    expect(r.equilibrio.soddisfatto).toBe(true);
  });

  it('carico uniforme: δ = qL⁴/8EI, M_incastro = qL²/2', () => {
    const L = 2.5, q = 4000;
    const { p, nodi, aste } = trave(L, 6);
    p.vincolo(nodi[0], 'incastro');
    for (const a of aste) p.distribuito(a, -q);
    const r = analizzaCaso(p.costruisci(), CASO);

    expect(r.spostamenti[3 * 6 + 1]).toBeCloseTo(-(q * L ** 4) / (8 * EI), 12);
    expect(Math.abs(r.aste[0].M[0])).toBeCloseTo((q * L ** 2) / 2, 6);
    // reazione verticale = qL
    const R = r.reazioni.reduce((s, x) => s + x.fy, 0);
    expect(R).toBeCloseTo(q * L, 8);
  });
});

describe('trave appoggiata', () => {
  it('carico uniforme: M_max = qL²/8, δ = 5qL⁴/384EI', () => {
    const L = 6, q = 5000;
    const nel = 10;
    const { p, nodi, aste } = trave(L, nel);
    p.vincolo(nodi[0], 'cerniera');
    p.vincolo(nodi[nel], 'carrello');
    for (const a of aste) p.distribuito(a, -q);
    const r = analizzaCaso(p.costruisci(), CASO);

    expect(maxAbs(Mnotevoli(r))).toBeCloseTo((q * L ** 2) / 8, 6);
    expect(r.spostamenti[3 * (nel / 2) + 1])
      .toBeCloseTo(-(5 * q * L ** 4) / (384 * EI), 12);
    const R = r.reazioni.reduce((s, x) => s + x.fy, 0);
    expect(R).toBeCloseTo(q * L, 8);
  });

  it('forza in mezzeria: M = PL/4, δ = PL³/48EI', () => {
    const L = 4, P = 8000;
    const { p, nodi } = trave(L, 4);
    p.vincolo(nodi[0], 'cerniera');
    p.vincolo(nodi[4], 'carrello');
    p.forza(nodi[2], 0, -P);
    const r = analizzaCaso(p.costruisci(), CASO);

    expect(r.spostamenti[3 * 2 + 1]).toBeCloseTo(-(P * L ** 3) / (48 * EI), 12);
    expect(maxAbs(M(r))).toBeCloseTo((P * L) / 4, 6);
  });

  it('forza in campata su UN SOLO elemento: risultati esatti senza infittire', () => {
    // verifica che i carichi consistenti in campata diano valori nodali esatti
    const L = 4, P = 8000;
    const { p, nodi, aste } = trave(L, 1);
    p.vincolo(nodi[0], 'cerniera');
    p.vincolo(nodi[1], 'carrello');
    p.forzaInCampata(aste[0], 0.5, 0, -P);
    const r = analizzaCaso(p.costruisci(), CASO);

    expect(maxAbs(M(r))).toBeCloseTo((P * L) / 4, 6);
    // rotazione agli appoggi = PL²/16EI
    expect(Math.abs(r.spostamenti[2])).toBeCloseTo((P * L ** 2) / (16 * EI), 12);
  });

  it('momento concentrato in campata: equilibrio e salto del diagramma', () => {
    const L = 4, M0 = 10000, a = 0.25;
    const { p, nodi, aste } = trave(L, 1);
    p.vincolo(nodi[0], 'cerniera');
    p.vincolo(nodi[1], 'carrello');
    p.momentoInCampata(aste[0], a, M0);
    const r = analizzaCaso(p.costruisci(), CASO);

    // Equilibrio dei momenti attorno ad A:  M0 + R_B·L = 0  →  R_B = −M0/L
    // Equilibrio alla traslazione verticale:            →  R_A = +M0/L
    const Ra = r.reazioni.find((x) => x.nodoId === nodi[0])!;
    const Rb = r.reazioni.find((x) => x.nodoId === nodi[1])!;
    expect(Ra.fy).toBeCloseTo(M0 / L, 6);
    expect(Rb.fy).toBeCloseTo(-M0 / L, 6);
    // M(x) deve annullarsi agli estremi
    const asta = r.aste[0];
    expect(asta.M[0]).toBeCloseTo(0, 6);
    expect(asta.M[asta.M.length - 1]).toBeCloseTo(0, 6);
    // salto pari a M0 attraverso il punto di applicazione
    const xk = a * L;
    let prima = 0, dopo = 0;
    for (let i = 0; i < asta.ascisse.length; i++) {
      if (asta.ascisse[i] < xk) prima = asta.M[i];
      if (asta.ascisse[i] > xk && dopo === 0) dopo = asta.M[i];
    }
    expect(Math.abs(dopo - prima)).toBeCloseTo(M0, 3);
  });
});

describe('mensola puntellata (una volta iperstatica)', () => {
  it('R = 3qL/8 all appoggio, M_incastro = qL²/8', () => {
    const L = 5, q = 3000;
    const nel = 8;
    const { p, nodi, aste } = trave(L, nel);
    p.vincolo(nodi[0], 'incastro');
    p.vincolo(nodi[nel], 'carrello');
    for (const a of aste) p.distribuito(a, -q);
    const r = analizzaCaso(p.costruisci(), CASO);

    const Rb = r.reazioni.find((x) => x.nodoId === nodi[nel])!;
    expect(Rb.fy).toBeCloseTo((3 * q * L) / 8, 6);
    const Ra = r.reazioni.find((x) => x.nodoId === nodi[0])!;
    expect(Ra.fy).toBeCloseTo((5 * q * L) / 8, 6);
    expect(Math.abs(Ra.mz)).toBeCloseTo((q * L ** 2) / 8, 6);
  });
});

describe('trave continua a due campate (equazione dei tre momenti)', () => {
  it('momento sull appoggio centrale = −qL²/8', () => {
    // due campate uguali di luce L, carico uniforme su entrambe:
    // Clapeyron dà M_B = −q L²/8 e reazione centrale 10qL/8
    const L = 5, q = 4000;
    const nel = 20;                       // 10 elementi per campata
    const { p, nodi, aste } = trave(2 * L, nel);
    p.vincolo(nodi[0], 'cerniera');
    p.vincolo(nodi[nel / 2], 'carrello');
    p.vincolo(nodi[nel], 'carrello');
    for (const a of aste) p.distribuito(a, -q);
    const r = analizzaCaso(p.costruisci(), CASO);

    const tuttiM = Mnotevoli(r);
    expect(Math.min(...tuttiM)).toBeCloseTo(-(q * L ** 2) / 8, 5);
    expect(Math.max(...tuttiM)).toBeCloseTo((9 / 128) * q * L ** 2, 5);

    const Rc = r.reazioni.find((x) => x.nodoId === nodi[nel / 2])!;
    expect(Rc.fy).toBeCloseTo((10 * q * L) / 8, 5);
  });
});

describe('spostamento massimo', () => {
  it('include la freccia in campata, non solo i nodi', () => {
    // trave appoggiata modellata con UN SOLO elemento: entrambi i nodi sono
    // vincolati, quindi il massimo nodale è zero mentre la trave si inflette
    const L = 6, q = 10e3;
    const { p, nodi, aste } = trave(L, 1);
    p.vincolo(nodi[0], 'cerniera');
    p.vincolo(nodi[1], 'carrello');
    p.distribuito(aste[0], -q);
    const r = analizzaCaso(p.costruisci(), CASO);

    // i nodi non si spostano
    expect(Math.abs(r.spostamenti[1])).toBeLessThan(1e-12);
    expect(Math.abs(r.spostamenti[4])).toBeLessThan(1e-12);
    // ma lo spostamento massimo è la freccia di mezzeria, 5qL⁴/384EI
    // esatto alla precisione di macchina: sotto carico uniforme la formula di
    // integrazione a quattro punti è esatta per il grado in gioco
    expect(r.spostamentoMassimo).toBeCloseTo((5 * q * L ** 4) / (384 * EI), 12);
    expect(r.aste[0].frecciaMassima).toBeCloseTo(r.spostamentoMassimo, 12);
    expect(r.aste[0].xFreccia).toBeCloseTo(L / 2, 2);
  });
});

describe('effetti termici', () => {
  it('barra vincolata: N = −EAαΔT (riscaldamento ⇒ compressione)', () => {
    const L = 2, dT = 40;
    const { p, nodi, aste } = trave(L, 1);
    p.vincolo(nodi[0], 'incastro');
    p.vincolo(nodi[1], 'incastro');
    p.termico(aste[0], dT);
    const r = analizzaCaso(p.costruisci(), CASO);

    const alpha = 12e-6;
    const atteso = -E * SEZ.A * alpha * dT;
    expect(r.aste[0].N[0]).toBeCloseTo(atteso, 4);
  });

  it('barra libera di dilatarsi: δ = LαΔT, N = 0', () => {
    const L = 2, dT = 40;
    const { p, nodi, aste } = trave(L, 1);
    p.vincolo(nodi[0], 'incastro');
    p.termico(aste[0], dT);
    const r = analizzaCaso(p.costruisci(), CASO);

    const alpha = 12e-6;
    expect(r.spostamenti[3]).toBeCloseTo(L * alpha * dT, 12);
    expect(r.aste[0].N[0]).toBeCloseTo(0, 6);
  });

  it('gradiente termico su trave incastrata: M = EIαΔT/h costante', () => {
    const L = 3, dTg = 30;
    const { p, nodi, aste } = trave(L, 1);
    p.vincolo(nodi[0], 'incastro');
    p.vincolo(nodi[1], 'incastro');
    p.termico(aste[0], 0, dTg);
    const r = analizzaCaso(p.costruisci(), CASO);

    const alpha = 12e-6;
    const atteso = (EI * alpha * dTg) / SEZ.h;
    const asta = r.aste[0];
    expect(asta.M[0]).toBeCloseTo(atteso, 4);
    expect(asta.M[asta.M.length - 1]).toBeCloseTo(atteso, 4);
    expect(Math.abs(asta.T[0])).toBeLessThan(1e-6);
  });
});

describe('cedimento vincolare', () => {
  it('appoggio che cede su trave isostatica: nessuna sollecitazione', () => {
    const L = 4;
    const nel = 4;
    const { p, nodi } = trave(L, nel);
    p.vincolo(nodi[0], 'cerniera');
    p.vincolo(nodi[nel], 'carrello');
    p.cedimento(nodi[nel], 0, -0.01);
    const r = analizzaCaso(p.costruisci(), CASO);

    expect(r.spostamenti[3 * nel + 1]).toBeCloseTo(-0.01, 12);
    expect(maxAbs(M(r))).toBeLessThan(1e-6);
  });

  it('appoggio che cede su mensola puntellata: M = 3EIδ/L²', () => {
    const L = 4, delta = -0.005;
    const nel = 6;
    const { p, nodi } = trave(L, nel);
    p.vincolo(nodi[0], 'incastro');
    p.vincolo(nodi[nel], 'carrello');
    p.cedimento(nodi[nel], 0, delta);
    const r = analizzaCaso(p.costruisci(), CASO);

    // reazione all'appoggio cedevole: R = 3EIδ/L³
    const Rb = r.reazioni.find((x) => x.nodoId === nodi[nel])!;
    expect(Rb.fy).toBeCloseTo((3 * EI * delta) / L ** 3, 6);
    // momento all'incastro: M = 3EIδ/L²
    expect(Math.abs(r.aste[0].M[0])).toBeCloseTo(Math.abs((3 * EI * delta) / L ** 2), 6);
  });
});

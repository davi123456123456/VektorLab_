/**
 * §10.1 — CATALOGO DI ESERCIZI CON SOLUZIONE NOTA.
 *
 * Ogni caso porta i valori calcolati a mano, in forma chiusa. Sono la
 * controparte degli invarianti del §10.2: quelli dicono che la soluzione è
 * coerente con sé stessa, questi che è quella giusta.
 *
 * Le famiglie sono parametrizzate: la stessa formula verificata su luci e
 * carichi diversi è un caso diverso, perché un errore che si compensa su
 * numeri tondi non si compensa su numeri qualunque.
 */

import { describe, it, expect } from 'vitest';
import { progetto } from '../../src/core/builder.js';
import { preset } from '../../src/core/materials/sezioniParametriche.js';
import { analizzaCaso } from '../../src/core/index.js';
import { materialePerId } from '../../src/core/materials/materials.js';
import { proprietaDa } from '../../src/core/materials/sezioniParametriche.js';
import type {
  ElementId, LoadCaseId, NodeId, Progetto,
} from '../../src/core/model/types.js';
import type { RisultatoAnalisi } from '../../src/core/model/results.js';

const CASO = 'principale' as LoadCaseId;
const SEZ = preset('IPE 300');
const E = materialePerId('S275').E;
const I = proprietaDa(SEZ).I;
const EI = E * I;

interface Costruzione { p: Progetto; aste: ElementId[]; nodi: NodeId[] }

/** Trave su due appoggi, orizzontale, di luce L. */
function appoggiata(L: number): Costruzione {
  const p = progetto('appoggiata');
  const s = p.sezioneParametrica('s', SEZ);
  const a = p.nodo(0, 0), b = p.nodo(L, 0);
  const el = p.asta(a, b, 'S275', s, { teoria: 'eulero-bernoulli' });
  p.vincolo(a, 'cerniera'); p.vincolo(b, 'carrello');
  return { p: p.costruisci(), aste: [el], nodi: [a, b] };
}

/** Mensola incastrata a sinistra, di luce L. */
function mensola(L: number): Costruzione {
  const p = progetto('mensola');
  const s = p.sezioneParametrica('s', SEZ);
  const a = p.nodo(0, 0), b = p.nodo(L, 0);
  const el = p.asta(a, b, 'S275', s, { teoria: 'eulero-bernoulli' });
  p.vincolo(a, 'incastro');
  return { p: p.costruisci(), aste: [el], nodi: [a, b] };
}

/** Valore interpolato lungo l'asta k, senza attraversare le discontinuità. */
function val(r: RisultatoAnalisi, k: number, x: number, q: 'N' | 'T' | 'M'): number {
  const a = r.aste[k];
  const xs = a.ascisse, v = a[q];
  if (x <= xs[0]) return v[0];
  if (x >= xs[xs.length - 1]) return v[v.length - 1];
  for (let i = 0; i < xs.length - 1; i++) {
    const d = xs[i + 1] - xs[i];
    if (d <= 1e-12 || x < xs[i] || x > xs[i + 1]) continue;
    return v[i] + ((v[i + 1] - v[i]) * (x - xs[i])) / d;
  }
  return v[v.length - 1];
}

/**
 * Estremo del momento sull'asta k.
 *
 * Si guardano PRIMA i punti notevoli: il massimo di una parabola cade fra due
 * campioni, e cercarlo fra i soli campioni lo sottostima dello 0,06 % — un
 * errore del metro, che verrebbe scambiato per un errore del motore.
 */
function mMax(r: RisultatoAnalisi, k: number): number {
  const a = r.aste[k];
  let m = 0;
  for (const p of a.puntiNotevoli) if (Math.abs(p.M) > Math.abs(m)) m = p.M;
  for (const x of a.M) if (Math.abs(x) > Math.abs(m)) m = x;
  return m;
}

const vicino = (a: number, b: number, rel = 1e-4) => {
  expect(Math.abs(a - b)).toBeLessThanOrEqual(rel * Math.max(Math.abs(b), 1));
};

// ══════════════════════ TRAVE APPOGGIATA ══════════════════════

describe('§10.1 — trave appoggiata', () => {
  for (const [L, q] of [[6, 10e3], [4.5, 23.7e3], [9, 5e3]] as const) {
    it(`carico uniforme q=${q / 1e3} kN/m su L=${L} m`, () => {
      const c = appoggiata(L);
      const pr = progetto('x');   // ricostruzione con il carico
      void pr;
      const p2 = { ...c.p, carichi: c.p.carichi };
      void p2;
      const b = progetto('appoggiata');
      const s = b.sezioneParametrica('s', SEZ);
      const n1 = b.nodo(0, 0), n2 = b.nodo(L, 0);
      const el = b.asta(n1, n2, 'S275', s, { teoria: 'eulero-bernoulli' });
      b.vincolo(n1, 'cerniera'); b.vincolo(n2, 'carrello');
      b.distribuito(el, -q);
      const r = analizzaCaso(b.costruisci(), CASO);

      vicino(r.reazioni[0].fy, (q * L) / 2);
      vicino(r.reazioni[1].fy, (q * L) / 2);
      vicino(val(r, 0, 0, 'T'), (q * L) / 2);
      vicino(val(r, 0, L, 'T'), -(q * L) / 2);
      vicino(mMax(r, 0), (q * L * L) / 8);
      // freccia in mezzeria: 5qL⁴/384EI
      vicino(r.spostamentoMassimo, (5 * q * L ** 4) / (384 * EI), 2e-3);
    });

    it(`forza in mezzeria P=${q / 1e3} kN su L=${L} m`, () => {
      const b = progetto('appoggiata');
      const s = b.sezioneParametrica('s', SEZ);
      const n1 = b.nodo(0, 0), n2 = b.nodo(L, 0);
      const el = b.asta(n1, n2, 'S275', s, { teoria: 'eulero-bernoulli' });
      b.vincolo(n1, 'cerniera'); b.vincolo(n2, 'carrello');
      b.forzaInCampata(el, 0.5, 0, -q, 'globale');
      const r = analizzaCaso(b.costruisci(), CASO);

      vicino(r.reazioni[0].fy, q / 2);
      vicino(r.reazioni[1].fy, q / 2);
      vicino(mMax(r, 0), (q * L) / 4);
      // freccia: PL³/48EI
      vicino(r.spostamentoMassimo, (q * L ** 3) / (48 * EI), 2e-3);
    });

    it(`forza generica a un terzo, L=${L} m`, () => {
      const a1 = L / 3, b1 = L - a1;
      const b = progetto('appoggiata');
      const s = b.sezioneParametrica('s', SEZ);
      const n1 = b.nodo(0, 0), n2 = b.nodo(L, 0);
      const el = b.asta(n1, n2, 'S275', s, { teoria: 'eulero-bernoulli' });
      b.vincolo(n1, 'cerniera'); b.vincolo(n2, 'carrello');
      b.forzaInCampata(el, a1 / L, 0, -q, 'globale');
      const r = analizzaCaso(b.costruisci(), CASO);

      vicino(r.reazioni[0].fy, (q * b1) / L);
      vicino(r.reazioni[1].fy, (q * a1) / L);
      vicino(mMax(r, 0), (q * a1 * b1) / L);
    });

    it(`momento concentrato in mezzeria, L=${L} m`, () => {
      const M0 = q;   // Nm
      const b = progetto('appoggiata');
      const s = b.sezioneParametrica('s', SEZ);
      const n1 = b.nodo(0, 0), n2 = b.nodo(L, 0);
      const el = b.asta(n1, n2, 'S275', s, { teoria: 'eulero-bernoulli' });
      b.vincolo(n1, 'cerniera'); b.vincolo(n2, 'carrello');
      b.momentoInCampata(el, 0.5, M0);
      const r = analizzaCaso(b.costruisci(), CASO);

      // coppia di reazioni ±M₀/L, e M salta di M₀ in mezzeria
      vicino(Math.abs(r.reazioni[0].fy), M0 / L);
      vicino(Math.abs(r.reazioni[1].fy), M0 / L);
      vicino(Math.abs(val(r, 0, L / 2 - 1e-6, 'M'))
        + Math.abs(val(r, 0, L / 2 + 1e-6, 'M')), M0, 1e-3);
    });

    it(`carico triangolare crescente, L=${L} m`, () => {
      const b = progetto('appoggiata');
      const s = b.sezioneParametrica('s', SEZ);
      const n1 = b.nodo(0, 0), n2 = b.nodo(L, 0);
      const el = b.asta(n1, n2, 'S275', s, { teoria: 'eulero-bernoulli' });
      b.vincolo(n1, 'cerniera'); b.vincolo(n2, 'carrello');
      b.distribuito(el, 0, { q2: -q });
      const r = analizzaCaso(b.costruisci(), CASO);

      // risultante qL/2 nel baricentro a 2L/3: R_A = qL/6, R_B = qL/3
      vicino(r.reazioni[0].fy, (q * L) / 6);
      vicino(r.reazioni[1].fy, (q * L) / 3);
      // M massimo = qL²/(9√3) in x = L/√3
      vicino(mMax(r, 0), (q * L * L) / (9 * Math.sqrt(3)), 3e-3);
    });

    it(`carico uniforme su metà campata, L=${L} m`, () => {
      const b = progetto('appoggiata');
      const s = b.sezioneParametrica('s', SEZ);
      const n1 = b.nodo(0, 0), n2 = b.nodo(L, 0);
      const el = b.asta(n1, n2, 'S275', s, { teoria: 'eulero-bernoulli' });
      b.vincolo(n1, 'cerniera'); b.vincolo(n2, 'carrello');
      b.distribuito(el, -q, { s1: 0, s2: 0.5 });
      const r = analizzaCaso(b.costruisci(), CASO);

      // risultante qL/2 nel baricentro a L/4
      const R = (q * L) / 2;
      vicino(r.reazioni[0].fy, (R * (L - L / 4)) / L);
      vicino(r.reazioni[1].fy, (R * (L / 4)) / L);
    });
  }
});

// ══════════════════════ MENSOLA ══════════════════════

describe('§10.1 — mensola', () => {
  for (const [L, P] of [[4, 12e3], [2.5, 31e3], [7, 4e3]] as const) {
    it(`forza in punta P=${P / 1e3} kN su L=${L} m`, () => {
      const b = progetto('mensola');
      const s = b.sezioneParametrica('s', SEZ);
      const n1 = b.nodo(0, 0), n2 = b.nodo(L, 0);
      b.asta(n1, n2, 'S275', s, { teoria: 'eulero-bernoulli' });
      b.vincolo(n1, 'incastro');
      b.forza(n2, 0, -P);
      const r = analizzaCaso(b.costruisci(), CASO);

      vicino(r.reazioni[0].fy, P);
      vicino(Math.abs(r.reazioni[0].mz), P * L);
      vicino(Math.abs(mMax(r, 0)), P * L);
      vicino(Math.abs(val(r, 0, L, 'M')), 0, 1e-6);
      // freccia in punta: PL³/3EI
      vicino(r.spostamentoMassimo, (P * L ** 3) / (3 * EI), 2e-3);
    });

    it(`carico uniforme q=${P / 1e3} kN/m su L=${L} m`, () => {
      const b = progetto('mensola');
      const s = b.sezioneParametrica('s', SEZ);
      const n1 = b.nodo(0, 0), n2 = b.nodo(L, 0);
      const el = b.asta(n1, n2, 'S275', s, { teoria: 'eulero-bernoulli' });
      b.vincolo(n1, 'incastro');
      b.distribuito(el, -P);
      const r = analizzaCaso(b.costruisci(), CASO);

      vicino(r.reazioni[0].fy, P * L);
      vicino(Math.abs(r.reazioni[0].mz), (P * L * L) / 2);
      vicino(Math.abs(mMax(r, 0)), (P * L * L) / 2);
      // freccia in punta: qL⁴/8EI
      vicino(r.spostamentoMassimo, (P * L ** 4) / (8 * EI), 2e-3);
    });

    it(`momento in punta M=${P / 1e3} kNm su L=${L} m`, () => {
      const b = progetto('mensola');
      const s = b.sezioneParametrica('s', SEZ);
      const n1 = b.nodo(0, 0), n2 = b.nodo(L, 0);
      b.asta(n1, n2, 'S275', s, { teoria: 'eulero-bernoulli' });
      b.vincolo(n1, 'incastro');
      b.momento(n2, P);
      const r = analizzaCaso(b.costruisci(), CASO);

      vicino(Math.abs(r.reazioni[0].mz), P);
      vicino(Math.abs(r.reazioni[0].fy), 0, 1e-6);
      // M costante lungo tutta la mensola
      vicino(Math.abs(val(r, 0, L / 2, 'M')), P, 1e-3);
      // freccia in punta: ML²/2EI
      vicino(r.spostamentoMassimo, (P * L ** 2) / (2 * EI), 2e-3);
    });

    it(`carico triangolare, massimo all incastro, L=${L} m`, () => {
      const b = progetto('mensola');
      const s = b.sezioneParametrica('s', SEZ);
      const n1 = b.nodo(0, 0), n2 = b.nodo(L, 0);
      const el = b.asta(n1, n2, 'S275', s, { teoria: 'eulero-bernoulli' });
      b.vincolo(n1, 'incastro');
      b.distribuito(el, -P, { q2: 0 });
      const r = analizzaCaso(b.costruisci(), CASO);

      // risultante qL/2 nel baricentro a L/3 dall'incastro
      vicino(r.reazioni[0].fy, (P * L) / 2);
      vicino(Math.abs(r.reazioni[0].mz), ((P * L) / 2) * (L / 3));
    });

    it(`forza ASSIALE in punta, L=${L} m`, () => {
      const b = progetto('mensola');
      const s = b.sezioneParametrica('s', SEZ);
      const n1 = b.nodo(0, 0), n2 = b.nodo(L, 0);
      b.asta(n1, n2, 'S275', s, { teoria: 'eulero-bernoulli' });
      b.vincolo(n1, 'incastro');
      b.forza(n2, P, 0);
      const r = analizzaCaso(b.costruisci(), CASO);

      vicino(r.reazioni[0].fx, -P);
      // trazione costante, momento nullo
      vicino(val(r, 0, L / 2, 'N'), P);
      vicino(Math.abs(val(r, 0, L / 2, 'M')), 0, 1e-6);
    });
  }
});

// ══════════════════════ SBALZI E GERBER ══════════════════════

describe('§10.1 — trave con sbalzo', () => {
  for (const [L, a, q] of [[6, 2, 10e3], [8, 3, 7.5e3]] as const) {
    it(`sbalzo a destra: L=${L} m, sbalzo=${a} m`, () => {
      const b = progetto('sbalzo');
      const s = b.sezioneParametrica('s', SEZ);
      const n1 = b.nodo(0, 0), n2 = b.nodo(L, 0), n3 = b.nodo(L + a, 0);
      b.asta(n1, n2, 'S275', s, { teoria: 'eulero-bernoulli' });
      b.asta(n2, n3, 'S275', s, { teoria: 'eulero-bernoulli' });
      b.vincolo(n1, 'cerniera'); b.vincolo(n2, 'carrello');
      b.forza(n3, 0, -q);
      const r = analizzaCaso(b.costruisci(), CASO);

      // momento sull'appoggio intermedio: −q·a
      vicino(Math.abs(val(r, 1, 0, 'M')), q * a, 1e-3);
      // reazione in n1 verso il basso: −q·a/L
      vicino(r.reazioni[0].fy, -(q * a) / L);
      vicino(r.reazioni[1].fy, q * (1 + a / L));
    });
  }
});

describe('§10.1 — trave Gerber', () => {
  it('due campate con cerniera nella prima', () => {
    const L1 = 6, L2 = 4, d = 2, q = 10e3;
    const b = progetto('gerber');
    const s = b.sezioneParametrica('s', SEZ);
    const A = b.nodo(0, 0), G = b.nodo(L1 + d, 0), B = b.nodo(L1, 0);
    void B;
    const nA = A, nG = G;
    const nB = b.nodo(L1, 0);
    void nB;
    // A —— G(cerniera) —— B ; costruzione lineare: A, C(cerniera), B
    const p = progetto('gerber');
    const s2 = p.sezioneParametrica('s', SEZ);
    const a0 = p.nodo(0, 0), c0 = p.nodo(L1, 0), b0 = p.nodo(L1 + L2, 0);
    const e1 = p.asta(a0, c0, 'S275', s2, { teoria: 'eulero-bernoulli' });
    const e2 = p.asta(c0, b0, 'S275', s2, { teoria: 'eulero-bernoulli' });
    void e1; void e2;
    p.vincolo(a0, 'incastro');
    p.vincolo(b0, 'carrello');
    p.sconnessioneNodale(c0, 'cerniera');
    p.distribuito(e2, -q);
    const r = analizzaCaso(p.costruisci(), CASO);
    void nA; void nG;

    // il tratto C–B è una trave appoggiata su C e B: R = qL2/2 ciascuna
    vicino(r.reazioni.find((x) => x.nodoId === b0)!.fy, (q * L2) / 2);
    // in C il momento è nullo per definizione di cerniera
    vicino(Math.abs(val(r, 1, 0, 'M')), 0, 1e-6);
    // l'incastro porta la reazione di C attraverso la mensola A–C
    const inc = r.reazioni.find((x) => x.nodoId === a0)!;
    vicino(inc.fy, (q * L2) / 2);
    vicino(Math.abs(inc.mz), ((q * L2) / 2) * L1, 1e-3);
  });
});

// ══════════════════════ TELAI ══════════════════════

describe('§10.1 — telaio a L', () => {
  for (const [H, L, P] of [[4, 6, 20e3], [3, 5, 15e3]] as const) {
    it(`pilastro H=${H} m, traverso L=${L} m, forza orizzontale in testa`, () => {
      const b = progetto('L');
      const s = b.sezioneParametrica('s', SEZ);
      const base = b.nodo(0, 0), testa = b.nodo(0, H), fine = b.nodo(L, H);
      b.asta(base, testa, 'S275', s, { teoria: 'eulero-bernoulli' });
      b.asta(testa, fine, 'S275', s, { teoria: 'eulero-bernoulli' });
      b.vincolo(base, 'incastro');
      b.forza(fine, P, 0);
      const r = analizzaCaso(b.costruisci(), CASO);

      // equilibrio globale: l'incastro assorbe tutto
      vicino(r.reazioni[0].fx, -P);
      vicino(Math.abs(r.reazioni[0].mz), P * H, 1e-3);
      // nel traverso la forza è ASSIALE: N = P (trazione), T = 0
      vicino(Math.abs(val(r, 1, L / 2, 'T')), 0, 1e-6);
      // nel pilastro è taglio, non sforzo normale: la piega li scambia
      vicino(Math.abs(val(r, 0, H / 2, 'N')), 0, 1e-6);
      vicino(Math.abs(val(r, 0, H / 2, 'T')), P, 1e-3);
    });
  }
});

describe('§10.1 — pilastro verticale con carico orizzontale distribuito', () => {
  for (const [H, q] of [[5, 3e3], [8, 1.7e3]] as const) {
    it(`H=${H} m, q=${q / 1e3} kN/m (vento)`, () => {
      const b = progetto('pilastro');
      const s = b.sezioneParametrica('s', SEZ);
      const base = b.nodo(0, 0), testa = b.nodo(0, H);
      const el = b.asta(base, testa, 'S275', s, { teoria: 'eulero-bernoulli' });
      b.vincolo(base, 'incastro');
      // carico orizzontale: modo angolo, alpha = 0 → lungo +x globale
      b.distribuito(el, q, { modo: 'angolo', alpha: 0 });
      const r = analizzaCaso(b.costruisci(), CASO);

      vicino(r.reazioni[0].fx, -q * H);
      vicino(Math.abs(r.reazioni[0].mz), (q * H * H) / 2, 1e-3);
      vicino(Math.abs(mMax(r, 0)), (q * H * H) / 2, 1e-3);
    });
  }
});

describe('§10.1 — arco e portale a tre cerniere', () => {
  it('portale a tre cerniere simmetrico, carico verticale in chiave', () => {
    const L = 8, H = 4, P = 20e3;
    const b = progetto('tre cerniere');
    const s = b.sezioneParametrica('s', SEZ);
    const A = b.nodo(0, 0), C1 = b.nodo(0, H);
    const K = b.nodo(L / 2, H), C2 = b.nodo(L, H), B = b.nodo(L, 0);
    b.asta(A, C1, 'S275', s, { teoria: 'eulero-bernoulli' });
    b.asta(C1, K, 'S275', s, { teoria: 'eulero-bernoulli' });
    b.asta(K, C2, 'S275', s, { teoria: 'eulero-bernoulli' });
    b.asta(C2, B, 'S275', s, { teoria: 'eulero-bernoulli' });
    b.vincolo(A, 'cerniera'); b.vincolo(B, 'cerniera');
    b.sconnessioneNodale(K, 'cerniera');
    b.forza(K, 0, -P);
    const r = analizzaCaso(b.costruisci(), CASO);

    // simmetria: reazioni verticali P/2 ciascuna
    vicino(r.reazioni[0].fy, P / 2);
    vicino(r.reazioni[1].fy, P / 2);
    // spinta orizzontale: dal momento nullo in chiave, H_orizz = P·L/(4·H)
    vicino(Math.abs(r.reazioni[0].fx), (P * L) / (4 * H), 1e-3);
    // momento nullo in chiave, per definizione
    vicino(Math.abs(val(r, 1, r.aste[1].lunghezza, 'M')), 0, 1e-6);
  });

  it('portale a tre cerniere ASIMMETRICO', () => {
    const L = 8, H1 = 4, H2 = 2.5, P = 20e3;
    const b = progetto('tre cerniere asimm');
    const s = b.sezioneParametrica('s', SEZ);
    const A = b.nodo(0, 0), C1 = b.nodo(0, H1);
    const K = b.nodo(L / 2, H1), C2 = b.nodo(L, H2), B = b.nodo(L, 0);
    b.asta(A, C1, 'S275', s, { teoria: 'eulero-bernoulli' });
    b.asta(C1, K, 'S275', s, { teoria: 'eulero-bernoulli' });
    b.asta(K, C2, 'S275', s, { teoria: 'eulero-bernoulli' });
    b.asta(C2, B, 'S275', s, { teoria: 'eulero-bernoulli' });
    b.vincolo(A, 'cerniera'); b.vincolo(B, 'cerniera');
    b.sconnessioneNodale(K, 'cerniera');
    b.forza(K, 0, -P);
    const r = analizzaCaso(b.costruisci(), CASO);

    // l'equilibrio globale regge comunque
    vicino(r.reazioni[0].fy + r.reazioni[1].fy, P);
    vicino(r.reazioni[0].fx + r.reazioni[1].fx, 0, 1e-6);
    expect(r.equilibrio.soddisfatto).toBe(true);
    // e il momento in chiave resta nullo
    vicino(Math.abs(val(r, 1, r.aste[1].lunghezza, 'M')), 0, 1e-6);
  });
});

describe('§10.1 — aste inclinate e angoli non notevoli', () => {
  for (const gradi of [23, 67, 41.5] as const) {
    it(`mensola inclinata di ${gradi}°, forza verticale in punta`, () => {
      const L = 5, P = 15e3;
      const t = (gradi * Math.PI) / 180;
      const b = progetto('inclinata');
      const s = b.sezioneParametrica('s', SEZ);
      const n1 = b.nodo(0, 0);
      const n2 = b.nodo(L * Math.cos(t), L * Math.sin(t));
      b.asta(n1, n2, 'S275', s, { teoria: 'eulero-bernoulli' });
      b.vincolo(n1, 'incastro');
      b.forza(n2, 0, -P);
      const r = analizzaCaso(b.costruisci(), CASO);

      vicino(r.reazioni[0].fy, P);
      // il momento all'incastro è P per il braccio ORIZZONTALE
      vicino(Math.abs(r.reazioni[0].mz), P * L * Math.cos(t), 1e-3);
      // scomposizione sugli assi locali: N = −P·sin t, T = −P·cos t
      vicino(val(r, 0, L / 2, 'N'), -P * Math.sin(t), 1e-3);
      vicino(Math.abs(val(r, 0, L / 2, 'T')), P * Math.cos(t), 1e-3);
    });
  }
});

describe('§10.1 — carichi obliqui e verso l alto', () => {
  it('appoggiata con distribuito verso l ALTO', () => {
    const L = 6, q = 8e3;
    const b = progetto('su');
    const s = b.sezioneParametrica('s', SEZ);
    const n1 = b.nodo(0, 0), n2 = b.nodo(L, 0);
    const el = b.asta(n1, n2, 'S275', s, { teoria: 'eulero-bernoulli' });
    b.vincolo(n1, 'cerniera'); b.vincolo(n2, 'carrello');
    b.distribuito(el, q);              // positivo = verso l'alto
    const r = analizzaCaso(b.costruisci(), CASO);

    vicino(r.reazioni[0].fy, -(q * L) / 2);
    vicino(mMax(r, 0), -(q * L * L) / 8);
  });

  it('appoggiata con distribuito OBLIQUO a 30°', () => {
    const L = 6, q = 8e3, alpha = Math.PI / 6;
    const b = progetto('obliquo');
    const s = b.sezioneParametrica('s', SEZ);
    const n1 = b.nodo(0, 0), n2 = b.nodo(L, 0);
    const el = b.asta(n1, n2, 'S275', s, { teoria: 'eulero-bernoulli' });
    b.vincolo(n1, 'cerniera'); b.vincolo(n2, 'carrello');
    b.distribuito(el, q, { modo: 'angolo', alpha });
    const r = analizzaCaso(b.costruisci(), CASO);

    // la componente verticale si ripartisce, quella orizzontale va alla cerniera
    const totale = q * L;
    vicino(r.reazioni[0].fy + r.reazioni[1].fy, -totale * Math.sin(alpha));
    vicino(r.reazioni[0].fx, -totale * Math.cos(alpha));
    expect(r.equilibrio.soddisfatto).toBe(true);
  });
});

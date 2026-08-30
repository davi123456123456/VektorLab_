/**
 * SUITE DI SIMULAZIONI — i venti casi con soluzione in forma chiusa.
 *
 * Ogni caso verifica i valori attesi E tutte le autoverifiche: un risultato
 * giusto ottenuto da un motore che non sa dire se è giusto vale poco, e un
 * controllo che passa perché non ha esaminato nulla vale ancora meno. Per
 * questo ogni prova dichiara anche QUALI controlli hanno davvero guardato
 * qualcosa.
 *
 * I casi che riguardano la FORMA del diagramma non confrontano un punto: si
 * interpola il campionamento e si verifica il GRADO, che è l'affermazione
 * vera («il momento è parabolico») invece di una sua conseguenza.
 *
 * Vale come snapshot di non regressione: ogni variazione futura di questi
 * numeri deve essere una scelta, non una sorpresa.
 */

import { describe, it, expect } from 'vitest';
import { progetto } from '../../src/core/builder.js';
import { preset } from '../../src/core/materials/sezioniParametriche.js';
import {
  analizzaCinematica, analizzaStatica, troncoInSezione, type EsitoStatico,
} from '../../src/core/index.js';
import { agganciaAngolo } from '../../src/render/snap.js';
import type { ElementId, LoadCaseId, Progetto } from '../../src/core/model/types.js';

const CASO = 'principale' as LoadCaseId;
const EB = { teoria: 'eulero-bernoulli' as const };
const TOLL = 1e-6;

function esito(p: Progetto): EsitoStatico {
  return analizzaStatica(p, { tipo: 'caso', id: CASO }, {
    sezioniExtra: p.sezioniPersonalizzate,
    materialiExtra: p.materialiPersonalizzati,
  });
}

function base(nome: string) {
  const p = progetto(nome);
  const sez = p.sezioneParametrica('s', preset('IPE 300'));
  return { p, sez };
}

/** Tutte le autoverifiche superate, e almeno una che abbia guardato qualcosa. */
function autoverifiche(e: EsitoStatico, attesi: string[] = []): void {
  for (const v of e.autoverifiche.verifiche) {
    expect(v.superata, `${v.codice}: ${v.dettaglio}`).toBe(true);
  }
  for (const codice of attesi) {
    const v = e.autoverifiche.verifiche.find((x) => x.codice === codice)!;
    expect(v, `verifica ${codice} assente`).toBeDefined();
    expect(v.esaminati, `${codice} non ha esaminato nulla`).toBeGreaterThan(0);
  }
}

/** Valori di una caratteristica lungo l'asta, dal metodo dell'equilibrio. */
function campiona(
  e: EsitoStatico, asta: string, quanti = 21,
  da = 0.001, a = 0.999,
): { s: number[]; N: number[]; T: number[]; M: number[] } {
  const s: number[] = [], N: number[] = [], T: number[] = [], M: number[] = [];
  for (let i = 0; i < quanti; i++) {
    const x = da + ((a - da) * i) / (quanti - 1);
    const t = troncoInSezione(e, asta as unknown as ElementId, x);
    s.push(x); N.push(t.N); T.push(t.T); M.push(t.M);
  }
  return { s, N, T, M };
}

/**
 * Grado effettivo del polinomio che interpola i punti.
 *
 * Si prova a montare un polinomio di grado crescente e ci si ferma al primo
 * che riproduce i dati entro tolleranza: è quello il grado. Verificare invece
 * «il coefficiente di grado 3 è nullo» richiederebbe di sapere già in che base
 * si sta guardando, e su dati campionati è meno stabile.
 */
function grado(xs: number[], ys: number[], tolleranza = 1e-7): number {
  const scala = Math.max(...ys.map(Math.abs), 1e-12);
  for (let g = 0; g <= 4; g++) {
    const c = minimiQuadrati(xs, ys, g);
    let peggiore = 0;
    for (let i = 0; i < xs.length; i++) {
      let v = 0;
      for (let k = g; k >= 0; k--) v = v * xs[i] + c[k];
      peggiore = Math.max(peggiore, Math.abs(v - ys[i]));
    }
    if (peggiore / scala < tolleranza) return g;
  }
  return 5;
}

/** Coefficienti [c0..cg] del polinomio di grado g ai minimi quadrati. */
function minimiQuadrati(xs: number[], ys: number[], g: number): number[] {
  const n = g + 1;
  const A: number[][] = Array.from({ length: n }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i < xs.length; i++) {
    const pot: number[] = [1];
    for (let k = 1; k <= 2 * g; k++) pot.push(pot[k - 1] * xs[i]);
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) A[r][c] += pot[r + c];
      A[r][n] += pot[r] * ys[i];
    }
  }
  // eliminazione di Gauss con pivot parziale
  for (let k = 0; k < n; k++) {
    let p = k;
    for (let r = k + 1; r < n; r++) if (Math.abs(A[r][k]) > Math.abs(A[p][k])) p = r;
    [A[k], A[p]] = [A[p], A[k]];
    if (Math.abs(A[k][k]) < 1e-300) continue;
    for (let r = k + 1; r < n; r++) {
      const f = A[r][k] / A[k][k];
      for (let c = k; c <= n; c++) A[r][c] -= f * A[k][c];
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let k = n - 1; k >= 0; k--) {
    let s = A[k][n];
    for (let c = k + 1; c < n; c++) s -= A[k][c] * x[c];
    x[k] = Math.abs(A[k][k]) < 1e-300 ? 0 : s / A[k][k];
  }
  return x;
}

const reaz = (e: EsitoStatico, nodo: string) =>
  e.equilibrio.perNodo.find((x) => x.nodoId === nodo)!;

// ════════════════════════════ 1 ════════════════════════════

describe('1 — appoggio-carrello con carico uniforme', () => {
  const q = 10e3, L = 6;
  const { p, sez } = base('appoggiata q');
  const a = p.nodo(0, 0, 'A');
  const b = p.nodo(L, 0, 'B');
  const el = p.asta(a, b, 'S275', sez, EB);
  p.vincolo(a, 'cerniera');
  p.vincolo(b, 'carrello');
  p.distribuito(el, -q);
  const e = esito(p.costruisci());
  const c = campiona(e, el as string, 25);

  it('V = qL/2 su entrambi gli appoggi', () => {
    expect(reaz(e, 'A').fy).toBeCloseTo((q * L) / 2, 6);
    expect(reaz(e, 'B').fy).toBeCloseTo((q * L) / 2, 6);
  });

  it('T è LINEARE e si annulla in mezzeria', () => {
    expect(grado(c.s, c.T)).toBe(1);
    expect(troncoInSezione(e, el as unknown as ElementId, 0.5).T).toBeCloseTo(0, 6);
  });

  it('M è PARABOLICO, non spezzato: qui si vedrebbe l\'uso della risultante', () => {
    // se il taglio fosse calcolato dalla risultante concentrata invece che
    // integrando il carico, M sarebbe lineare a tratti e T avrebbe un salto
    expect(grado(c.s, c.M)).toBe(2);
    expect(troncoInSezione(e, el as unknown as ElementId, 0.5).M)
      .toBeCloseTo((q * L * L) / 8, 4);
  });

  it('supera le autoverifiche, che hanno davvero esaminato qualcosa', () => {
    autoverifiche(e, [
      'CARRELLO_PARALLELO', 'CERNIERA_SENZA_MOMENTO', 'EQUILIBRIO_GLOBALE',
      'CONFRONTO_METODI', 'COERENZA_DIFFERENZIALE', 'CONFRONTO_DIAGRAMMI',
      'INTEGRALE_TAGLIO',
    ]);
  });
});

// ════════════════════════════ 2 ════════════════════════════

describe('2 — appoggiata con forza in mezzeria', () => {
  const P = 20e3, L = 8;
  const { p, sez } = base('appoggiata P');
  const a = p.nodo(0, 0, 'A');
  const b = p.nodo(L, 0, 'B');
  const el = p.asta(a, b, 'S275', sez, EB);
  p.vincolo(a, 'cerniera');
  p.vincolo(b, 'carrello');
  p.forzaInCampata(el, 0.5, 0, -P);
  const e = esito(p.costruisci());

  it('T vale ±P/2 e salta di P sotto la forza', () => {
    const prima = troncoInSezione(e, el as unknown as ElementId, 0.5, { lettura: -1 }).T;
    const dopo = troncoInSezione(e, el as unknown as ElementId, 0.5, { lettura: 1 }).T;
    expect(prima).toBeCloseTo(P / 2, 6);
    expect(dopo).toBeCloseTo(-P / 2, 6);
    expect(prima - dopo).toBeCloseTo(P, 6);
  });

  it('M è TRIANGOLARE: lineare sui due tratti, massimo PL/4', () => {
    const sinistra = campiona(e, el as string, 15, 0.001, 0.499);
    const destra = campiona(e, el as string, 15, 0.501, 0.999);
    expect(grado(sinistra.s, sinistra.M)).toBe(1);
    expect(grado(destra.s, destra.M)).toBe(1);
    expect(troncoInSezione(e, el as unknown as ElementId, 0.5).M)
      .toBeCloseTo((P * L) / 4, 4);
  });

  it('il momento NON salta sotto la forza: cambia solo pendenza', () => {
    const prima = troncoInSezione(e, el as unknown as ElementId, 0.5, { lettura: -1 }).M;
    const dopo = troncoInSezione(e, el as unknown as ElementId, 0.5, { lettura: 1 }).M;
    expect(Math.abs(prima - dopo) / Math.abs(prima)).toBeLessThan(TOLL);
  });

  it('supera le autoverifiche', () => autoverifiche(e));
});

// ════════════════════════════ 3 ════════════════════════════

describe('3 — mensola con forza in punta', () => {
  const P = 12e3, L = 3;
  const { p, sez } = base('mensola P');
  const a = p.nodo(0, 0, 'A');
  const b = p.nodo(L, 0, 'B');
  const el = p.asta(a, b, 'S275', sez, EB);
  p.vincolo(a, 'incastro');
  p.forza(b, 0, -P);
  const e = esito(p.costruisci());

  it('M all\'incastro vale P·L con le fibre SUPERIORI tese', () => {
    const M = troncoInSezione(e, el as unknown as ElementId, 0).M;
    expect(Math.abs(M)).toBeCloseTo(P * L, 4);
    // M < 0 tende le fibre dal lato +y locale, cioè quelle superiori
    expect(M).toBeLessThan(0);
  });

  it('il momento reattivo dell\'incastro equilibra P·L', () => {
    expect(Math.abs(reaz(e, 'A').mz)).toBeCloseTo(P * L, 6);
  });

  it('supera le autoverifiche', () => autoverifiche(e, ['CONFRONTO_METODI']));
});

// ════════════════════════════ 4 ════════════════════════════

describe('4 — mensola con carico uniforme', () => {
  const q = 10e3, L = 4;
  const { p, sez } = base('mensola q');
  const a = p.nodo(0, 0, 'A');
  const b = p.nodo(L, 0, 'B');
  const el = p.asta(a, b, 'S275', sez, EB);
  p.vincolo(a, 'incastro');
  p.distribuito(el, -q);
  const e = esito(p.costruisci());
  const c = campiona(e, el as string, 25);

  it('M all\'incastro vale qL²/2 ed è parabolico', () => {
    expect(Math.abs(troncoInSezione(e, el as unknown as ElementId, 0).M))
      .toBeCloseTo((q * L * L) / 2, 3);
    expect(grado(c.s, c.M)).toBe(2);
    expect(grado(c.s, c.T)).toBe(1);
  });

  it('supera le autoverifiche', () => autoverifiche(e, ['INTEGRALE_TAGLIO']));
});

// ════════════════════════════ 5 ════════════════════════════

describe('5 — appoggiata con momento concentrato in mezzeria', () => {
  const M0 = 40e3, L = 6;
  const { p, sez } = base('appoggiata M0');
  const a = p.nodo(0, 0, 'A');
  const b = p.nodo(L, 0, 'B');
  const el = p.asta(a, b, 'S275', sez, EB);
  p.vincolo(a, 'cerniera');
  p.vincolo(b, 'carrello');
  p.momentoInCampata(el, 0.5, M0);
  const e = esito(p.costruisci());

  it('le reazioni valgono ±M₀/L', () => {
    expect(Math.abs(reaz(e, 'A').fy)).toBeCloseTo(M0 / L, 6);
    expect(Math.abs(reaz(e, 'B').fy)).toBeCloseTo(M0 / L, 6);
    expect(reaz(e, 'A').fy).toBeCloseTo(-reaz(e, 'B').fy, 6);
  });

  it('T è COSTANTE e non risente del momento', () => {
    const c = campiona(e, el as string, 21);
    expect(grado(c.s, c.T)).toBe(0);
    expect(Math.abs(c.T[0])).toBeCloseTo(M0 / L, 6);
  });

  it('M SALTA di M₀, gradino verticale netto', () => {
    const prima = troncoInSezione(e, el as unknown as ElementId, 0.5, { lettura: -1 }).M;
    const dopo = troncoInSezione(e, el as unknown as ElementId, 0.5, { lettura: 1 }).M;
    expect(Math.abs(dopo - prima)).toBeCloseTo(M0, 4);
  });

  it('supera le autoverifiche', () => autoverifiche(e));
});

// ════════════════════════════ 6 ════════════════════════════

describe('6 — carico su metà campata', () => {
  const q = 10e3, L = 8;
  const { p, sez } = base('mezza campata');
  const a = p.nodo(0, 0, 'A');
  const b = p.nodo(L, 0, 'B');
  const el = p.asta(a, b, 'S275', sez, EB);
  p.vincolo(a, 'cerniera');
  p.vincolo(b, 'carrello');
  p.distribuito(el, -q, { s1: 0, s2: 0.5 });
  const e = esito(p.costruisci());

  it('la risultante è q·L/2 e le reazioni la ripartiscono', () => {
    const totale = reaz(e, 'A').fy + reaz(e, 'B').fy;
    expect(totale).toBeCloseTo((q * L) / 2, 4);
    // il baricentro del carico è a L/4: R_B = (qL/2)·(L/4)/L
    expect(reaz(e, 'B').fy).toBeCloseTo((q * L) / 2 * 0.25, 4);
  });

  it('T è lineare sul tratto caricato e costante su quello scarico', () => {
    const caricato = campiona(e, el as string, 15, 0.001, 0.499);
    const scarico = campiona(e, el as string, 15, 0.501, 0.999);
    expect(grado(caricato.s, caricato.T)).toBe(1);
    expect(grado(scarico.s, scarico.T)).toBe(0);
  });

  it('nel raccordo T è continuo: la tangente di M non ha spigoli', () => {
    const prima = troncoInSezione(e, el as unknown as ElementId, 0.5, { lettura: -1 }).T;
    const dopo = troncoInSezione(e, el as unknown as ElementId, 0.5, { lettura: 1 }).T;
    expect(Math.abs(prima - dopo) / Math.abs(prima)).toBeLessThan(TOLL);
  });

  it('supera le autoverifiche', () => autoverifiche(e, ['INTEGRALE_TAGLIO']));
});

// ════════════════════════════ 7 ════════════════════════════

describe('7 — carico trapezoidale', () => {
  const { p, sez } = base('trapezio');
  const a = p.nodo(0, 0, 'A');
  const b = p.nodo(6, 0, 'B');
  const el = p.asta(a, b, 'S275', sez, EB);
  p.vincolo(a, 'cerniera');
  p.vincolo(b, 'carrello');
  p.distribuito(el, -5e3, { q2: -15e3 });
  const e = esito(p.costruisci());
  const c = campiona(e, el as string, 31);

  it('T è PARABOLICO e M CUBICO: è il grado che conta, non un punto', () => {
    expect(grado(c.s, c.T)).toBe(2);
    expect(grado(c.s, c.M)).toBe(3);
  });

  it('la risultante e il suo punto di applicazione sono quelli del trapezio', () => {
    const totale = reaz(e, 'A').fy + reaz(e, 'B').fy;
    expect(totale).toBeCloseTo(((5e3 + 15e3) / 2) * 6, 4);
    // baricentro a ℓ(q₁+2q₂)/(3(q₁+q₂)) = 6·35/60 = 3.5 m
    // quindi R_A = R·(1 − 3.5/6)
    expect(reaz(e, 'A').fy).toBeCloseTo(60e3 * (1 - 3.5 / 6), 3);
  });

  it('supera le autoverifiche', () => autoverifiche(e, ['INTEGRALE_TAGLIO']));
});

// ════════════════════════════ 8 ════════════════════════════

describe('8 — trave con sbalzo', () => {
  const q = 10e3, L = 6, sbalzo = 2;
  const { p, sez } = base('sbalzo');
  const a = p.nodo(0, 0, 'A');
  const b = p.nodo(L, 0, 'B');
  const c = p.nodo(L + sbalzo, 0, 'C');
  const e1 = p.asta(a, b, 'S275', sez, EB);
  const e2 = p.asta(b, c, 'S275', sez, EB);
  p.vincolo(a, 'cerniera');
  p.vincolo(b, 'carrello');
  p.distribuito(e1, -q);
  p.distribuito(e2, -q);
  const e = esito(p.costruisci());

  it('M cambia segno: positivo in campata, negativo sull\'appoggio', () => {
    const campata = troncoInSezione(e, e1 as unknown as ElementId, 0.3).M;
    const appoggio = troncoInSezione(e, e2 as unknown as ElementId, 0).M;
    expect(campata).toBeGreaterThan(0);
    expect(appoggio).toBeLessThan(0);
    // sullo sbalzo M = −q·s²/2 con s misurato dall'estremo libero
    expect(appoggio).toBeCloseTo(-(q * sbalzo * sbalzo) / 2, 3);
  });

  it('il punto di flesso si trova e si quota', () => {
    // M(x) = R_A·x − q x²/2 si annulla in x = 2 R_A / q
    const RA = reaz(e, 'A').fy;
    const flesso = (2 * RA) / q;
    expect(flesso).toBeGreaterThan(0);
    expect(flesso).toBeLessThan(L);
    const M = troncoInSezione(e, e1 as unknown as ElementId, flesso / L).M;
    expect(Math.abs(M) / (q * L * L)).toBeLessThan(1e-9);
  });

  it('supera le autoverifiche', () => autoverifiche(e));
});

// ════════════════════════════ 9 ════════════════════════════

describe('9 — trave Gerber', () => {
  const q = 15e3;
  const { p, sez } = base('gerber');
  const A = p.nodo(0, 0, 'A');
  const G = p.nodo(6, 0, 'G');
  const B = p.nodo(8, 0, 'B');
  const C = p.nodo(12, 0, 'C');
  const a1 = p.asta(A, G, 'S275', sez, EB);
  const a2 = p.asta(G, B, 'S275', sez, EB);
  const a3 = p.asta(B, C, 'S275', sez, EB);
  p.sconnessioneNodale(G, 'cerniera');
  p.vincolo(A, 'cerniera');
  p.vincolo(B, 'carrello');
  p.vincolo(C, 'carrello');
  for (const x of [a1, a2, a3]) p.distribuito(x, -q);
  // una forza orizzontale, perché la cerniera trasmette anche N
  p.forza(C, 20e3, 0);
  const e = esito(p.costruisci());

  it('nella cerniera M = 0, ma N e T NON sono nulli', () => {
    const t = troncoInSezione(e, a2 as unknown as ElementId, 0);
    const scala = q * 36;
    expect(Math.abs(t.M) / scala).toBeLessThan(1e-9);
    expect(Math.abs(t.T)).toBeGreaterThan(1e3);
    expect(Math.abs(t.N)).toBeGreaterThan(1e3);
  });

  it('la cerniera è dedotta dal nodo, non scritta sull\'asta', () => {
    expect(analizzaCinematica(e.modello.calcolo).numeroCorpi).toBe(2);
  });

  it('supera le autoverifiche', () => autoverifiche(e, ['M_NULLO_IN_CERNIERA']));
});

// ════════════════════════════ 10 ═══════════════════════════

describe('10 — arco a tre cerniere', () => {
  const L = 10, f = 3, q = 5e3;
  const { p, sez } = base('arco');
  const a = p.nodo(0, 0, 'A');
  const c = p.nodo(L / 2, f, 'C');
  const b = p.nodo(L, 0, 'B');
  const e1 = p.asta(a, c, 'S275', sez, EB);
  const e2 = p.asta(c, b, 'S275', sez, EB);
  p.sconnessioneNodale(c, 'cerniera');
  p.vincolo(a, 'cerniera');
  p.vincolo(b, 'cerniera');
  p.distribuito(e1, -q, { modo: 'globaleY', perProiezione: true });
  p.distribuito(e2, -q, { modo: 'globaleY', perProiezione: true });
  const e = esito(p.costruisci());

  it('la spinta orizzontale vale qL²/(8f)', () => {
    expect(reaz(e, 'A').fx).toBeCloseTo((q * L * L) / (8 * f), 4);
    expect(reaz(e, 'B').fx).toBeCloseTo(-(q * L * L) / (8 * f), 4);
  });

  it('M è nullo in tutte e tre le cerniere', () => {
    const scala = q * L * L;
    expect(Math.abs(reaz(e, 'A').mz) / scala).toBeLessThan(1e-9);
    expect(Math.abs(reaz(e, 'B').mz) / scala).toBeLessThan(1e-9);
    expect(Math.abs(troncoInSezione(e, e2 as unknown as ElementId, 0).M) / scala)
      .toBeLessThan(1e-9);
  });

  it('supera le autoverifiche', () => autoverifiche(e, ['M_NULLO_IN_CERNIERA']));
});

// ═══════════════════════ 11-14, 19 ═══════════════════════
// I casi di topologia hanno la loro suite dedicata, che verifica anche i corpi
// rigidi uno per uno: `test/statica/topologia.test.ts`. Qui si ricontrollano i
// numeri di testa, così la suite resta leggibile per intero.

describe('11 — telaio chiuso con tre cerniere interne', () => {
  const L = 2;
  const { p, sez } = base('telaio A6');
  const H = p.nodo(0, 0, 'H'), G = p.nodo(L, 0, 'G'), F = p.nodo(2 * L, 0, 'F');
  const E = p.nodo(3 * L, 0, 'E'), D = p.nodo(4 * L, 0, 'D');
  const A = p.nodo(0, 2 * L, 'A'), B = p.nodo(4 * L, 2 * L, 'B');
  const C = p.nodo(4 * L, L, 'C');
  p.asta(H, A, 'S275', sez, EB);
  p.asta(A, B, 'S275', sez, EB);
  p.asta(B, C, 'S275', sez, EB);
  p.asta(C, D, 'S275', sez, EB);
  p.asta(H, G, 'S275', sez, EB);
  p.asta(G, F, 'S275', sez, EB);
  p.asta(F, E, 'S275', sez, EB);
  p.asta(E, D, 'S275', sez, EB);
  for (const n of [A, B, F]) p.sconnessioneNodale(n, 'cerniera');
  p.vincolo(G, 'carrello');
  p.vincolo(E, 'cerniera');
  p.momento(C, 30e3);
  const prog = p.costruisci();
  const e = esito(prog);

  it('n = 3, v = 9, rango 9 → isostatica', () => {
    const k = analizzaCinematica(prog);
    expect(k.numeroCorpi).toBe(3);
    expect(k.gradiLiberta).toBe(9);
    expect(k.gradiVincolo).toBe(9);
    expect(k.rango).toBe(9);
    expect(k.classificazione).toBe('isostatica');
  });

  it('M = 0 nelle tre cerniere A, B, F', () => {
    const scala = 30e3;
    for (const a of e.modello.calcolo.aste) {
      const ris = e.fem.aste.find((x) => x.astaId === a.id)!;
      for (const [nodo, M] of [
        [a.nodoIniziale as unknown as string, ris.M[0]],
        [a.nodoFinale as unknown as string, ris.M[ris.M.length - 1]],
      ] as [string, number][]) {
        if (['A', 'B', 'F'].includes(nodo)) {
          expect(Math.abs(M) / scala, `M in ${nodo}`).toBeLessThan(1e-9);
        }
      }
    }
  });

  it('supera le autoverifiche, comprese quelle sui nodi rigidi', () => {
    autoverifiche(e, ['M_NULLO_IN_CERNIERA', 'CONTINUITA_NODI']);
  });
});

describe('12-13 — la H, disegnata in tre tratti', () => {
  function acca(conCerniera: boolean): Progetto {
    const { p, sez } = base('H');
    const s1 = p.nodo(0, 0, 'S1'), sm = p.nodo(0, 2, 'SM'), s2 = p.nodo(0, 4, 'S2');
    p.asta(s1, sm, 'S275', sez, EB);
    p.asta(sm, s2, 'S275', sez, EB);
    const dm = p.nodo(3, 2, 'DM');
    const traverso = p.asta(sm, dm, 'S275', sez, EB);
    const d1 = p.nodo(3, 0, 'D1'), d2 = p.nodo(3, 4, 'D2');
    p.asta(d1, dm, 'S275', sez, EB);
    p.asta(dm, d2, 'S275', sez, EB);
    p.vincolo(s1, 'incastro');
    if (conCerniera) p.sconnessioneNodale(sm, 'cerniera', { asteSvincolate: [traverso] });
    p.forza(d2, 5e3, 0);
    return p.costruisci();
  }

  it('12 — cinque segmenti, un corpo solo: l\'Esc non è un dato meccanico', () => {
    const k = analizzaCinematica(acca(false));
    expect(k.numeroCorpi).toBe(1);
    expect(k.gradiLiberta).toBe(3);
  });

  it('13 — con una cerniera su un attacco diventano due corpi', () => {
    const k = analizzaCinematica(acca(true));
    expect(k.numeroCorpi).toBe(2);
    expect(k.gradiLiberta).toBe(6);
    // vincoli interni: la cerniera trasmette N e T
    expect(k.gradiVincolo).toBe(3 + 2);
  });
});

describe('14 — carrello in mezzeria', () => {
  const q = 12e3, L = 10;
  const { p, sez } = base('carrello in mezzeria');
  const a = p.nodo(0, 0, 'A'), b = p.nodo(L, 0, 'B');
  const el = p.asta(a, b, 'S275', sez, EB);
  p.vincolo(a, 'cerniera');
  p.vincolo(b, 'carrello');
  p.vincoloSuAsta(el, 0.5, 'carrello');
  p.distribuito(el, -q);
  const prog = p.costruisci();

  it('un corpo solo: il vincolo in campata non spezza la trave', () => {
    const k = analizzaCinematica(prog);
    expect(k.numeroCorpi).toBe(1);
    expect(k.classificazione).toBe('iperstatica');
  });

  it('M è continuo attraverso l\'appoggio, nessun salto di rotazione', () => {
    const e = esito(prog);
    const eps = 1e-7;
    const prima = troncoInSezione(e, el as unknown as ElementId, 0.5 - eps).M;
    const dopo = troncoInSezione(e, el as unknown as ElementId, 0.5 + eps).M;
    expect(Math.abs(prima - dopo) / Math.abs(prima)).toBeLessThan(1e-6);
  });
});

describe('19 — telaio chiuso ad anello senza cerniere', () => {
  const { p, sez } = base('anello');
  const n1 = p.nodo(0, 0, 'N1'), n2 = p.nodo(4, 0, 'N2');
  const n3 = p.nodo(4, 3, 'N3'), n4 = p.nodo(0, 3, 'N4');
  p.asta(n1, n2, 'S275', sez, EB);
  p.asta(n2, n3, 'S275', sez, EB);
  const alto = p.asta(n3, n4, 'S275', sez, EB);
  p.asta(n4, n1, 'S275', sez, EB);
  p.vincolo(n1, 'cerniera');
  p.vincolo(n2, 'carrello');
  p.distribuito(alto, -10e3);
  const prog = p.costruisci();

  it('avvisa dell\'iperstaticità interna che il bilancio 3n − v non vede', () => {
    const k = analizzaCinematica(prog);
    expect(k.anelliChiusi).toBe(1);
    expect(k.iperstaticitaInterna).toBe(3);
    expect(k.diagnosi.some((d) => d.codice === 'ANELLO_CHIUSO')).toBe(true);
  });

  it('ripiega sul FEM: l\'elementino si dichiara inapplicabile', () => {
    const e = esito(prog);
    expect(e.elementino.applicabile).toBe(false);
    expect([...e.elementino.diagrammi.values()].some((d) => !d.applicabile)).toBe(true);
  });
});

// ════════════════════════════ 15 ═══════════════════════════

describe('15 — asta inclinata a 30° con carico verticale globale', () => {
  const q = 8e3, L = 6;
  const { p, sez } = base('inclinata 30');
  const a = p.nodo(0, 0, 'A');
  const b = p.nodo(L * Math.cos(Math.PI / 6), L * Math.sin(Math.PI / 6), 'B');
  const el = p.asta(a, b, 'S275', sez, EB);
  p.vincolo(a, 'cerniera');
  p.vincolo(b, 'carrello');
  p.distribuito(el, -q);
  const e = esito(p.costruisci());

  it('N non è nullo: il carico verticale ha componente assiale', () => {
    const t = troncoInSezione(e, el as unknown as ElementId, 0);
    expect(Math.abs(t.N)).toBeGreaterThan(1e3);
  });

  it('le proiezioni usano la rotazione dell\'asta, non assi orizzontali', () => {
    const V = (q * L) / 2;                     // reazione verticale in A
    const c = Math.cos(Math.PI / 6), s = Math.sin(Math.PI / 6);
    const t = troncoInSezione(e, el as unknown as ElementId, 0);
    expect(t.N).toBeCloseTo(-V * s, 4);
    expect(t.T).toBeCloseTo(V * c, 4);
  });

  it('supera le autoverifiche', () => autoverifiche(e));
});

// ════════════════════════════ 16 ═══════════════════════════

describe('16 — pilastro verticale con carico orizzontale distribuito', () => {
  const q = 8e3, H = 4;
  const { p, sez } = base('pilastro');
  const a = p.nodo(0, 0, 'A');
  const b = p.nodo(0, H, 'B');
  const el = p.asta(a, b, 'S275', sez, EB);
  p.vincolo(a, 'incastro');
  // carico orizzontale in assi GLOBALI, verso destra
  p.distribuito(el, q, { modo: 'globaleX' });
  const e = esito(p.costruisci());

  it('M alla base vale qH²/2', () => {
    expect(Math.abs(troncoInSezione(e, el as unknown as ElementId, 0).M))
      .toBeCloseTo((q * H * H) / 2, 3);
  });

  it('la fibra tesa è quella dalla parte giusta', () => {
    // Asse locale x̂ verso l'alto, quindi ŷ = x̂ ruotato di +90° punta a
    // SINISTRA. Il carico spinge a destra: il pilastro si incurva verso
    // destra e le fibre tese sono quelle di sinistra, cioè dal lato +ŷ.
    // Con la convenzione «M > 0 tende le fibre dal lato −ŷ» il momento alla
    // base è quindi NEGATIVO.
    expect(troncoInSezione(e, el as unknown as ElementId, 0).M).toBeLessThan(0);
  });

  it('la reazione orizzontale vale qH', () => {
    expect(Math.abs(reaz(e, 'A').fx)).toBeCloseTo(q * H, 4);
  });

  it('supera le autoverifiche', () => autoverifiche(e));
});

// ════════════════════════════ 17 ═══════════════════════════

describe('17 — carico distribuito verso l\'alto', () => {
  const q = 10e3, L = 6;
  const { p, sez } = base('sottospinta');
  const a = p.nodo(0, 0, 'A');
  const b = p.nodo(L, 0, 'B');
  const el = p.asta(a, b, 'S275', sez, EB);
  p.vincolo(a, 'cerniera');
  p.vincolo(b, 'carrello');
  p.distribuito(el, +q);
  const e = esito(p.costruisci());

  it('tutti i segni si invertono rispetto al caso 1', () => {
    expect(reaz(e, 'A').fy).toBeCloseTo(-(q * L) / 2, 6);
    expect(troncoInSezione(e, el as unknown as ElementId, 0).T).toBeCloseTo(-(q * L) / 2, 6);
    expect(troncoInSezione(e, el as unknown as ElementId, 0.5).M)
      .toBeCloseTo(-(q * L * L) / 8, 4);
  });

  it('supera le autoverifiche', () => autoverifiche(e));
});

// ════════════════════════════ 18 ═══════════════════════════

describe('18 — carrello inclinato a 30°', () => {
  const P = 10e3, L = 4, alpha = Math.PI / 6;
  const { p, sez } = base('carrello 30');
  const a = p.nodo(0, 0, 'A');
  const b = p.nodo(L, 0, 'B');
  p.asta(a, b, 'S275', sez, EB);
  p.vincolo(a, 'cerniera');
  p.vincolo(b, 'carrello', alpha);
  p.forza(b, 0, -P);
  const e = esito(p.costruisci());

  it('la reazione è diretta a 30°, con H e V entrambe non nulle', () => {
    const R = reaz(e, 'B');
    expect(Math.abs(R.fx)).toBeGreaterThan(1e3);
    expect(Math.abs(R.fy)).toBeGreaterThan(1e3);
    expect(-R.fx / R.fy).toBeCloseTo(Math.tan(alpha), 9);
  });

  it('supera le autoverifiche', () => autoverifiche(e, ['CARRELLO_PARALLELO']));
});

// ════════════════════════════ 20 ═══════════════════════════

describe('20 — aggancio angolare relativo', () => {
  const g = (x: number) => (x * Math.PI) / 180;

  it('un tratto a 20° più una piega di 45° dà esattamente 65°', () => {
    const r = agganciaAngolo(g(63.5), g(20));
    expect(r.agganciato).toBe(true);
    expect(r.riferimento).toBe('relativo');
    expect((r.angolo * 180) / Math.PI).toBeCloseTo(65, 9);
    expect((r.delta! * 180) / Math.PI).toBeCloseTo(45, 9);
  });

  it('l\'aggancio assoluto resta disponibile sui multipli di 15°', () => {
    const r = agganciaAngolo(g(44), null);
    expect(r.agganciato).toBe(true);
    expect(r.riferimento).toBe('assoluto');
    expect((r.angolo * 180) / Math.PI).toBeCloseTo(45, 9);
  });

  it('vince il candidato più vicino, non sempre lo stesso riferimento', () => {
    // a 30.5° con precedente 20°: l'assoluto (30°) dista 0.5°, il relativo
    // (35°) 4.5°. Deve vincere l'assoluto.
    const r = agganciaAngolo(g(30.5), g(20));
    expect(r.riferimento).toBe('assoluto');
    expect((r.angolo * 180) / Math.PI).toBeCloseTo(30, 9);
  });

  it('fuori tolleranza non aggancia: qualunque angolo resta ammesso', () => {
    const r = agganciaAngolo(g(37), null);
    expect(r.agganciato).toBe(false);
    expect((r.angolo * 180) / Math.PI).toBeCloseTo(37, 9);
  });
});

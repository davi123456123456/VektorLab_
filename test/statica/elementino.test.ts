/**
 * Metodo dell'elementino: N, T, M ricavati dalle sole reazioni.
 *
 * Il valore di questi test non è che i numeri tornino con la tabella, ma che
 * tornino con quelli del FEM pur non condividendo NULLA con esso: qui non si
 * risolve nessun sistema di rigidezza, si scrive l'equilibrio di un pezzo di
 * struttura. Se i due concordano a otto cifre su un portale, entrambi sono
 * quasi certamente giusti.
 */

import { describe, it, expect } from 'vitest';
import { progetto } from '../../src/core/builder.js';
import { preset } from '../../src/core/materials/sezioniParametriche.js';
import {
  analizzaStatica, troncoInSezione, troncoAlTaglio, diagrammaPerEquilibrio,
  preparaTronco, valutaTronco,
  type EsitoStatico,
} from '../../src/core/index.js';
import type { ElementId, LoadCaseId, Progetto } from '../../src/core/model/types.js';

const CASO = 'principale' as LoadCaseId;
const EB = { teoria: 'eulero-bernoulli' as const };

function statica(p: Progetto): EsitoStatico {
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

/** Azioni interne per equilibrio nella sezione s (relativa) dell'asta. */
function sezione(e: EsitoStatico, asta: string, s: number, lettura: -1 | 0 | 1 = 0) {
  return troncoInSezione(e, asta as unknown as ElementId, s, { lettura });
}

/** La verifica di coerenza differenziale deve aver esaminato qualcosa. */
function differenzialeOk(e: EsitoStatico): void {
  const v = e.autoverifiche.verifiche.find((x) => x.codice === 'COERENZA_DIFFERENZIALE')!;
  expect(v, 'verifica COERENZA_DIFFERENZIALE assente').toBeDefined();
  expect(v.esaminati, 'nessun diagramma esaminato').toBeGreaterThan(0);
  expect(v.superata, v.dettaglio).toBe(true);
  const c = e.autoverifiche.verifiche.find((x) => x.codice === 'CONFRONTO_DIAGRAMMI')!;
  expect(c.esaminati, 'nessun diagramma confrontato col FEM').toBeGreaterThan(0);
  expect(c.superata, c.dettaglio).toBe(true);
}

/**
 * Tagliando la stessa sezione da destra si ottengono gli stessi N, T, M: è la
 * prova che ogni carico è stato contato una volta sola e da una parte sola.
 */
function iDueLatiConcordano(e: EsitoStatico, asta: string, s: number): void {
  const monte = troncoInSezione(e, asta as unknown as ElementId, s, { lato: 'monte' });
  const valle = troncoInSezione(e, asta as unknown as ElementId, s, { lato: 'valle' });
  const scala = Math.max(1, Math.abs(monte.N), Math.abs(monte.T), Math.abs(monte.M));
  expect(Math.abs(monte.N - valle.N) / scala).toBeLessThan(1e-9);
  expect(Math.abs(monte.T - valle.T) / scala).toBeLessThan(1e-9);
  expect(Math.abs(monte.M - valle.M) / scala).toBeLessThan(1e-9);
}

// ════════════════════════════════════════════════════════════════════

describe('trave appoggiata con carico uniforme', () => {
  const q = 10e3, L = 6;
  const { p, sez } = base('appoggiata');
  const a = p.nodo(0, 0, 'A');
  const b = p.nodo(L, 0, 'B');
  const el = p.asta(a, b, 'S275', sez, EB);
  p.vincolo(a, 'cerniera');
  p.vincolo(b, 'carrello');
  p.distribuito(el, -q);
  const e = statica(p.costruisci());

  it('le reazioni usate vengono dall\'equilibrio, non dal FEM', () => {
    expect(e.elementino.sorgente).toBe('equilibrio');
    expect(e.elementino.applicabile).toBe(true);
  });

  it('T(0) = +qL/2, T(L) = −qL/2, T(L/2) = 0', () => {
    expect(sezione(e, el as string, 0).T).toBeCloseTo((q * L) / 2, 6);
    expect(sezione(e, el as string, 1).T).toBeCloseTo(-(q * L) / 2, 6);
    expect(sezione(e, el as string, 0.5).T).toBeCloseTo(0, 6);
  });

  it('M(L/2) = qL²/8 e M agli estremi è nullo', () => {
    expect(sezione(e, el as string, 0.5).M).toBeCloseTo((q * L * L) / 8, 6);
    expect(sezione(e, el as string, 0).M).toBeCloseTo(0, 6);
    expect(sezione(e, el as string, 1).M).toBeCloseTo(0, 6);
  });

  it('in mezzeria il corpo libero ha due termini: reazione e mezzo carico', () => {
    const t = sezione(e, el as string, 0.5);
    expect(t.termini.length).toBe(2);
    const reazione = t.termini.find((x) => x.categoria === 'reazione')!;
    const carico = t.termini.find((x) => x.categoria === 'distribuito')!;
    expect(reazione.fy).toBeCloseTo((q * L) / 2, 6);
    // metà del distribuito, applicata al centro della metà sinistra
    expect(carico.fy).toBeCloseTo(-(q * L) / 2, 6);
    expect(carico.x).toBeCloseTo(L / 4, 9);
    // e i due contributi al momento si sommano al valore finale
    expect(reazione.dM + carico.dM).toBeCloseTo(t.M, 6);
  });

  it('i due lati del taglio danno lo stesso risultato', () => {
    for (const s of [0.1, 0.25, 0.5, 0.75, 0.9]) iDueLatiConcordano(e, el as string, s);
  });

  it('N è nullo ovunque: nessun carico assiale', () => {
    for (const s of [0, 0.3, 0.7, 1]) {
      expect(Math.abs(sezione(e, el as string, s).N)).toBeLessThan(1e-9);
    }
  });

  it('supera la coerenza differenziale e il confronto col FEM', () => differenzialeOk(e));
});

describe('mensola con forza in punta', () => {
  const P = 12e3, L = 3;
  const { p, sez } = base('mensola');
  const a = p.nodo(0, 0, 'A');
  const b = p.nodo(L, 0, 'B');
  const el = p.asta(a, b, 'S275', sez, EB);
  p.vincolo(a, 'incastro');
  p.forza(b, 0, -P);
  const e = statica(p.costruisci());

  it('T = +P costante e M = −P(L−x), quindi M(0) = −P·L', () => {
    for (const s of [0, 0.25, 0.5, 0.99]) {
      expect(sezione(e, el as string, s).T).toBeCloseTo(P, 6);
      expect(sezione(e, el as string, s).M).toBeCloseTo(-P * L * (1 - s), 5);
    }
  });

  it('nella sezione di punta M = 0 e T = P: la forza sta appena fuori dal tronco', () => {
    // «estremo libero scarico» vale per un estremo SENZA carico applicato: qui
    // la sezione appena a monte della punta porta per intero la forza
    const t = sezione(e, el as string, 1);
    expect(Math.abs(t.M)).toBeLessThan(1e-9);
    expect(t.T).toBeCloseTo(P, 6);
    expect(Math.abs(t.N)).toBeLessThan(1e-9);
    expect(t.termini.length).toBe(1);          // la sola reazione d'incastro
    // e prendendo il tronco di valle — che contiene solo la forza — si ottiene
    // lo stesso risultato, come impone il terzo principio
    iDueLatiConcordano(e, el as string, 1);
  });

  it('supera la coerenza differenziale e il confronto col FEM', () => differenzialeOk(e));
});

describe('trave con forza concentrata in campata', () => {
  const P = 20e3, L = 8, a0 = 0.375;      // forza a 3 m da A
  const { p, sez } = base('forza in campata');
  const a = p.nodo(0, 0, 'A');
  const b = p.nodo(L, 0, 'B');
  const el = p.asta(a, b, 'S275', sez, EB);
  p.vincolo(a, 'cerniera');
  p.vincolo(b, 'carrello');
  p.forzaInCampata(el, a0, 0, -P);
  const e = statica(p.costruisci());

  it('il taglio salta esattamente di P sotto la forza', () => {
    const prima = sezione(e, el as string, a0, -1).T;
    const dopo = sezione(e, el as string, a0, +1).T;
    expect(prima - dopo).toBeCloseTo(P, 6);
    // e i due valori sono le reazioni: R_A = P·b/L, −R_B = −P·a/L
    expect(prima).toBeCloseTo(P * (1 - a0), 6);
    expect(dopo).toBeCloseTo(-P * a0, 6);
  });

  it('il momento è continuo sotto la forza e vale P·a·b/L', () => {
    const prima = sezione(e, el as string, a0, -1).M;
    const dopo = sezione(e, el as string, a0, +1).M;
    expect(prima).toBeCloseTo(dopo, 6);
    expect(prima).toBeCloseTo((P * (a0 * L) * ((1 - a0) * L)) / L, 5);
  });

  it('supera la coerenza differenziale e il confronto col FEM', () => differenzialeOk(e));
});

describe('trave con momento concentrato in campata', () => {
  const M0 = 40e3, L = 6, sm = 1 / 3;
  const { p, sez } = base('momento in campata');
  const a = p.nodo(0, 0, 'A');
  const b = p.nodo(L, 0, 'B');
  const el = p.asta(a, b, 'S275', sez, EB);
  p.vincolo(a, 'cerniera');
  p.vincolo(b, 'carrello');
  p.momentoInCampata(el, sm, M0);
  const e = statica(p.costruisci());

  it('il momento flettente salta esattamente di M₀', () => {
    const prima = sezione(e, el as string, sm, -1).M;
    const dopo = sezione(e, el as string, sm, +1).M;
    expect(dopo - prima).toBeCloseTo(-M0, 5);
  });

  it('il taglio resta costante: un momento non genera salti di T', () => {
    const prima = sezione(e, el as string, sm, -1).T;
    const dopo = sezione(e, el as string, sm, +1).T;
    expect(prima).toBeCloseTo(dopo, 9);
    expect(Math.abs(prima)).toBeCloseTo(M0 / L, 6);
  });

  it('supera la coerenza differenziale e il confronto col FEM', () => differenzialeOk(e));
});

describe('trave Gerber', () => {
  const q = 15e3;
  const { p, sez } = base('gerber');
  const A = p.nodo(0, 0, 'A');
  const G = p.nodo(6, 0, 'G');
  const B = p.nodo(8, 0, 'B');
  const C = p.nodo(12, 0, 'C');
  const a1 = p.asta(A, G, 'S275', sez, EB);
  const a2 = p.asta(G, B, 'S275', sez, { ...EB, svincoloIniziale: { M: true } });
  const a3 = p.asta(B, C, 'S275', sez, EB);
  p.vincolo(A, 'cerniera');
  p.vincolo(B, 'carrello');
  p.vincolo(C, 'carrello');
  for (const x of [a1, a2, a3]) p.distribuito(x, -q);
  const e = statica(p.costruisci());

  it('nella cerniera il momento è nullo da entrambi i lati', () => {
    expect(Math.abs(sezione(e, a1 as string, 1).M)).toBeLessThan(1e-8);
    expect(Math.abs(sezione(e, a2 as string, 0).M)).toBeLessThan(1e-8);
  });

  it('il tronco che compete alla seconda campata si ferma alla cerniera', () => {
    // tagliando dentro G–B, la parte di monte è il solo tratto A–G: due nodi
    const t = sezione(e, a2 as string, 0.5);
    expect(t.nodi.sort()).toEqual(['A', 'G']);
    expect(t.aste).toEqual([a1 as string]);
  });

  it('il taglio subito dopo la cerniera è la forza che essa trasmette', () => {
    const t = sezione(e, a2 as string, 0);
    const s = e.equilibrio.sconnessioni[0];
    // l'asta è orizzontale: la componente trasversale è fy
    expect(Math.abs(t.T)).toBeCloseTo(Math.abs(s.fy), 4);
    expect(Math.abs(t.T)).toBeCloseTo((q * 6) / 2, 4);
  });

  it('i due lati concordano anche attraverso la cerniera', () => {
    for (const s of [0.2, 0.5, 0.8]) {
      iDueLatiConcordano(e, a2 as string, s);
      iDueLatiConcordano(e, a3 as string, s);
    }
  });

  it('supera la coerenza differenziale e il confronto col FEM', () => differenzialeOk(e));
});

describe('portale con cerniera in chiave', () => {
  const q = 20e3, L = 6, H = 4;
  const { p, sez } = base('portale');
  const p1 = p.nodo(0, 0, 'P1');
  const t1 = p.nodo(0, H, 'T1');
  const tc = p.nodo(L / 2, H, 'TC');
  const t2 = p.nodo(L, H, 'T2');
  const p2 = p.nodo(L, 0, 'P2');
  const c1 = p.asta(p1, t1, 'S275', sez, EB);
  const b1 = p.asta(t1, tc, 'S275', sez, EB);
  const b2 = p.asta(tc, t2, 'S275', sez, { ...EB, svincoloIniziale: { M: true } });
  p.asta(t2, p2, 'S275', sez, EB);
  p.vincolo(p1, 'cerniera');
  p.vincolo(p2, 'cerniera');
  p.distribuito(b1, -q);
  p.distribuito(b2, -q);
  const e = statica(p.costruisci());

  it('tagliando la trave, il tronco di monte è la colonna, non «ciò che sta a sinistra»', () => {
    const t = sezione(e, b1 as string, 0.5);
    expect(t.nodi.sort()).toEqual(['P1', 'T1']);
    expect(t.aste).toEqual([c1 as string]);
  });

  it('nella colonna N è la reazione verticale e T la spinta', () => {
    // colonna verticale: asse locale y globale, quindi N = −V e T = ±H
    const t = sezione(e, c1 as string, 0.5);
    const R = e.equilibrio.perNodo.find((x) => x.nodoId === 'P1')!;
    expect(t.N).toBeCloseTo(-R.fy, 4);
    expect(Math.abs(t.T)).toBeCloseTo(Math.abs(R.fx), 4);
  });

  it('in chiave il momento è nullo', () => {
    expect(Math.abs(sezione(e, b2 as string, 0).M)).toBeLessThan(1e-6);
  });

  it('i due lati concordano su tutte le aste', () => {
    for (const asta of [c1, b1, b2]) {
      for (const s of [0.15, 0.5, 0.85]) iDueLatiConcordano(e, asta as string, s);
    }
  });

  it('supera la coerenza differenziale e il confronto col FEM', () => differenzialeOk(e));
});

describe('trave inclinata con carico verticale', () => {
  const q = 8e3;
  const { p, sez } = base('inclinata');
  const a = p.nodo(0, 0, 'A');
  const b = p.nodo(4, 3, 'B');            // L = 5, cosθ = 0.8, sinθ = 0.6
  const el = p.asta(a, b, 'S275', sez, EB);
  p.vincolo(a, 'cerniera');
  p.vincolo(b, 'carrello');
  p.distribuito(el, -q);
  const e = statica(p.costruisci());

  it('la proiezione usa la matrice di rotazione dell\'asta, non assi orizzontali', () => {
    // reazione in A: (0, qL/2) con L = 5. In assi locali:
    // N(0) = −(Fx·c + Fy·s) = −(qL/2)·0.6
    const V = (q * 5) / 2;
    const t = sezione(e, el as string, 0);
    expect(t.N).toBeCloseTo(-V * 0.6, 5);
    expect(t.T).toBeCloseTo(V * 0.8, 5);
  });

  it('lo sforzo normale non è nullo e si annulla in mezzeria', () => {
    expect(Math.abs(sezione(e, el as string, 0).N)).toBeGreaterThan(1e3);
    expect(sezione(e, el as string, 0.5).N).toBeCloseTo(0, 5);
  });

  it('supera la coerenza differenziale e il confronto col FEM', () => differenzialeOk(e));
});

describe('mensola verticale con carico ortogonale', () => {
  const q = 8e3, H = 4;
  const { p, sez } = base('colonna');
  const a = p.nodo(0, 0, 'A');
  const b = p.nodo(0, H, 'B');
  const el = p.asta(a, b, 'S275', sez, EB);
  p.vincolo(a, 'incastro');
  p.distribuito(el, q, { modo: 'localeOrtogonale' });
  const e = statica(p.costruisci());

  it('M all\'incastro vale qH²/2 e si annulla in punta', () => {
    expect(Math.abs(sezione(e, el as string, 0).M)).toBeCloseTo((q * H * H) / 2, 4);
    expect(Math.abs(sezione(e, el as string, 1).M)).toBeLessThan(1e-8);
  });

  it('il taglio varia linearmente da qH a zero', () => {
    expect(Math.abs(sezione(e, el as string, 0).T)).toBeCloseTo(q * H, 5);
    expect(Math.abs(sezione(e, el as string, 0.5).T)).toBeCloseTo((q * H) / 2, 5);
    expect(Math.abs(sezione(e, el as string, 1).T)).toBeLessThan(1e-8);
  });

  it('supera la coerenza differenziale e il confronto col FEM', () => differenzialeOk(e));
});

describe('carico verso l\'alto', () => {
  const q = 12e3, L = 5;
  const { p, sez } = base('sottospinta');
  const a = p.nodo(0, 0, 'A');
  const b = p.nodo(L, 0, 'B');
  const el = p.asta(a, b, 'S275', sez, EB);
  p.vincolo(a, 'cerniera');
  p.vincolo(b, 'carrello');
  p.distribuito(el, +q);
  const e = statica(p.costruisci());

  it('T e M cambiano segno rispetto al carico verso il basso', () => {
    expect(sezione(e, el as string, 0).T).toBeCloseTo(-(q * L) / 2, 6);
    expect(sezione(e, el as string, 0.5).M).toBeCloseTo(-(q * L * L) / 8, 5);
  });

  it('supera la coerenza differenziale e il confronto col FEM', () => differenzialeOk(e));
});

describe('struttura iperstatica', () => {
  const q = 12e3, campata = 5;
  const { p, sez } = base('continua');
  const a = p.nodo(0, 0, 'A');
  const b = p.nodo(2 * campata, 0, 'B');
  const el = p.asta(a, b, 'S275', sez, EB);
  p.vincolo(a, 'cerniera');
  p.vincolo(b, 'carrello');
  p.vincoloSuAsta(el, 0.5, 'carrello');
  p.distribuito(el, -q);
  const e = statica(p.costruisci());

  it('le reazioni per l\'elementino vengono dal FEM, e lo dichiara', () => {
    expect(e.equilibrio.classificazione).toBe('iperstatica');
    expect(e.equilibrio.risolto).toBe(false);
    expect(e.elementino.sorgente).toBe('fem');
  });

  it('ma il passaggio reazioni → N,T,M resta di puro equilibrio ed è esatto', () => {
    // trave continua a due campate uguali: M sull\'appoggio centrale = −qL²/8
    const t = sezione(e, el as string, 0.5);
    expect(t.M).toBeCloseTo(-(q * campata * campata) / 8, 3);
    differenzialeOk(e);
  });

  it('i due lati concordano anche qui', () => {
    for (const s of [0.2, 0.5, 0.8]) iDueLatiConcordano(e, el as string, s);
  });
});

describe('maglia chiusa: il metodo si dichiara inapplicabile', () => {
  // telaio chiuso a un piano: tagliando una qualunque asta la struttura resta
  // connessa, e le azioni interne non discendono dal solo equilibrio
  const { p, sez } = base('telaio chiuso');
  const n1 = p.nodo(0, 0, 'N1');
  const n2 = p.nodo(4, 0, 'N2');
  const n3 = p.nodo(4, 3, 'N3');
  const n4 = p.nodo(0, 3, 'N4');
  const e1 = p.asta(n1, n2, 'S275', sez, EB);
  p.asta(n2, n3, 'S275', sez, EB);
  const e3 = p.asta(n3, n4, 'S275', sez, EB);
  p.asta(n4, n1, 'S275', sez, EB);
  p.vincolo(n1, 'incastro');
  p.distribuito(e3, -10e3);
  const e = statica(p.costruisci());

  it('non produce numeri e spiega perché', () => {
    expect(e.elementino.applicabile).toBe(false);
    const d = e.elementino.diagrammi.get(e1)!;
    expect(d.applicabile).toBe(false);
    expect(d.motivo).toMatch(/maglia chiusa/);
    expect(d.ascisse.length).toBe(0);
  });

  it('anche il taglio singolo si rifiuta, invece di dare un numero plausibile', () => {
    const t = troncoAlTaglio(
      e.modello.calcolo, e.modello.indice, e.elementino.reazioni, e1, 1,
    );
    expect(t.applicabile).toBe(false);
    expect(t.N).toBe(0);
    expect(t.termini.length).toBe(0);
  });
});

describe('che cosa sanno intercettare le due verifiche', () => {
  // Le due autoverifiche non guardano la stessa cosa, e conviene sapere quale
  // protegge da cosa: l'identità differenziale è INTERNA alla ricostruzione e
  // vale qualunque siano le reazioni, mentre il confronto col FEM è l'unico
  // che vede una reazione sbagliata. Dichiararlo con un test evita di credersi
  // coperti due volte dallo stesso controllo.
  const q = 10e3, L = 6;
  const { p, sez } = base('discriminante');
  const a = p.nodo(0, 0, 'A');
  const b = p.nodo(L, 0, 'B');
  const el = p.asta(a, b, 'S275', sez, EB);
  p.vincolo(a, 'cerniera');
  p.vincolo(b, 'carrello');
  p.distribuito(el, -q);
  const e = statica(p.costruisci());

  /** Le stesse reazioni, con quella in A sbagliata del 5 %. */
  const guaste = e.elementino.reazioni.map((r) =>
    r.nodoId as unknown as string === 'A' ? { ...r, fy: r.fy * 1.05 } : r);

  it('con reazioni sbagliate i diagrammi sono sbagliati…', () => {
    const d = diagrammaPerEquilibrio(e.modello.calcolo, e.modello.indice, guaste, el);
    // il massimo del momento è comunque ~qL²/8: se le reazioni sono sbagliate
    // del 5 %, il diagramma lo è di altrettanto
    const esatto = (q * L * L) / 8;
    const massimo = Math.max(...d.M);
    expect(Math.abs(massimo - esatto) / esatto).toBeGreaterThan(0.02);
  });

  it('…ma restano coerenti con sé stessi: dM/ds = T vale comunque', () => {
    const d = diagrammaPerEquilibrio(e.modello.calcolo, e.modello.indice, guaste, el);
    expect(d.differenziale.campioni).toBeGreaterThan(0);
    expect(d.differenziale.ok).toBe(true);
  });

  it('a intercettarle è il confronto col FEM', () => {
    const ctx = preparaTronco(e.modello.calcolo, e.modello.indice, guaste, el, 'monte');
    const fem = e.fem.aste.find((x) => x.astaId === el)!;
    let peggiore = 0;
    for (let i = 0; i < fem.ascisse.length; i++) {
      peggiore = Math.max(peggiore, Math.abs(valutaTronco(ctx, fem.ascisse[i]).M - fem.M[i]));
    }
    expect(peggiore).toBeGreaterThan(1e3);
    // mentre con le reazioni giuste lo scarto è a livello di arrotondamento
    const buono = preparaTronco(
      e.modello.calcolo, e.modello.indice, e.elementino.reazioni, el, 'monte',
    );
    let residuo = 0;
    for (let i = 0; i < fem.ascisse.length; i++) {
      residuo = Math.max(residuo, Math.abs(valutaTronco(buono, fem.ascisse[i]).M - fem.M[i]));
    }
    expect(residuo).toBeLessThan(1e-6);
  });
});

/**
 * Reazioni vincolari per equazioni cardinali, e confronto con il FEM.
 *
 * Ogni caso ha soluzione analitica nota, e su ciascuno girano le sei
 * autoverifiche del §4.4. Il controllo più forte è il confronto fra i due
 * metodi: equazioni cardinali e metodo degli spostamenti non condividono
 * nulla se non la geometria.
 */

import { describe, it, expect } from 'vitest';
import { progetto } from '../../src/core/builder.js';
import { preset } from '../../src/core/materials/sezioniParametriche.js';
import { analizzaStatica, type EsitoStatico } from '../../src/core/index.js';
import type { LoadCaseId, Progetto } from '../../src/core/model/types.js';

const CASO = 'principale' as LoadCaseId;
const EB = { teoria: 'eulero-bernoulli' as const };

function statica(p: Progetto): EsitoStatico {
  return analizzaStatica(p, { tipo: 'caso', id: CASO }, {
    sezioniExtra: p.sezioniPersonalizzate,
    materialiExtra: p.materialiPersonalizzati,
  });
}

/** Le sei autoverifiche devono passare tutte, su ogni caso. */
const OBBLIGATORIE = [
  'M_NULLO_IN_CERNIERA', 'ESTREMO_LIBERO_SCARICO', 'CARRELLO_PARALLELO',
  'CERNIERA_SENZA_MOMENTO', 'EQUILIBRIO_GLOBALE', 'CONFRONTO_METODI',
];

function autoverificheOk(e: EsitoStatico): void {
  const codici = e.autoverifiche.verifiche.map((v) => v.codice);
  for (const c of OBBLIGATORIE) expect(codici, `manca ${c}`).toContain(c);
  for (const v of e.autoverifiche.verifiche) {
    expect(
      v.superata,
      `${v.codice}: ${v.descrizione} — ${v.dettaglio}`,
    ).toBe(true);
  }
}

/**
 * Verifica che un controllo abbia davvero esaminato qualcosa.
 * Un controllo superato perché non ha trovato nulla da controllare è peggio
 * di un controllo fallito: dà una falsa sicurezza.
 */
function haEsaminato(e: EsitoStatico, codice: string, almeno = 1): void {
  const v = e.autoverifiche.verifiche.find((x) => x.codice === codice);
  expect(v, `verifica ${codice} assente`).toBeDefined();
  expect(v!.esaminati, `${codice} non ha esaminato nulla`).toBeGreaterThanOrEqual(almeno);
}

/** Reazione per equilibrio su un nodo, per nome. */
const reaz = (e: EsitoStatico, nodo: string) => {
  const r = e.equilibrio.perNodo.find((x) => x.nodoId === nodo);
  if (!r) throw new Error(`nessuna reazione sul nodo ${nodo}`);
  return r;
};

function base(nome: string) {
  const p = progetto(nome);
  const sez = p.sezioneParametrica('s', preset('IPE 300'));
  return { p, sez };
}

// ════════════════════════════════════════════════════════════════════

describe('trave appoggio-carrello con carico uniforme', () => {
  const q = 10e3, L = 6;
  const { p, sez } = base('appoggiata');
  const a = p.nodo(0, 0, 'A');
  const b = p.nodo(L, 0, 'B');
  const el = p.asta(a, b, 'S275', sez, EB);
  p.vincolo(a, 'cerniera');
  p.vincolo(b, 'carrello');
  p.distribuito(el, -q);
  const e = statica(p.costruisci());

  it('è isostatica e risolta per equilibrio', () => {
    expect(e.equilibrio.classificazione).toBe('isostatica');
    expect(e.equilibrio.risolto).toBe(true);
    expect(e.equilibrio.numeroEquazioni).toBe(3);
    expect(e.equilibrio.numeroIncognite).toBe(3);
  });

  it('V_A = V_B = qL/2 e H_A = 0', () => {
    expect(reaz(e, 'A').fy).toBeCloseTo((q * L) / 2, 6);
    expect(reaz(e, 'B').fy).toBeCloseTo((q * L) / 2, 6);
    expect(reaz(e, 'A').fx).toBeCloseTo(0, 6);
  });

  it('M_max = qL²/8', () => {
    const M = e.fem.aste[0].puntiNotevoli.map((x) => x.M);
    expect(Math.max(...M)).toBeCloseTo((q * L * L) / 8, 3);
  });

  it('supera le autoverifiche', () => {
    autoverificheOk(e);
    // e le verifiche pertinenti hanno davvero guardato qualcosa
    haEsaminato(e, 'CARRELLO_PARALLELO', 1);
    haEsaminato(e, 'CERNIERA_SENZA_MOMENTO', 2);
    haEsaminato(e, 'CONFRONTO_METODI', 2);
  });
});

describe('mensola con forza in punta', () => {
  const P = 12e3, L = 3;
  const { p, sez } = base('mensola');
  const a = p.nodo(0, 0, 'A');
  const b = p.nodo(L, 0, 'B');
  p.asta(a, b, 'S275', sez, EB);
  p.vincolo(a, 'incastro');
  p.forza(b, 0, -P);
  const e = statica(p.costruisci());

  it('V = P, M_incastro = P·L, H = 0', () => {
    const R = reaz(e, 'A');
    expect(R.fy).toBeCloseTo(P, 6);
    expect(R.fx).toBeCloseTo(0, 6);
    expect(Math.abs(R.mz)).toBeCloseTo(P * L, 6);
  });

  it('supera le autoverifiche', () => autoverificheOk(e));
});

describe('mensola con momento in punta', () => {
  const M0 = 25e3, L = 4;
  const { p, sez } = base('mensola M');
  const a = p.nodo(0, 0, 'A');
  const b = p.nodo(L, 0, 'B');
  p.asta(a, b, 'S275', sez, EB);
  p.vincolo(a, 'incastro');
  p.momento(b, M0);
  const e = statica(p.costruisci());

  it('V = 0 e il momento reattivo equilibra M₀', () => {
    const R = reaz(e, 'A');
    expect(R.fy).toBeCloseTo(0, 6);
    expect(R.fx).toBeCloseTo(0, 6);
    expect(R.mz).toBeCloseTo(-M0, 6);
  });

  it('il momento flettente è costante e pari a M₀', () => {
    const M = e.fem.aste[0].M;
    expect(Math.max(...M) - Math.min(...M)).toBeLessThan(1e-6);
    expect(Math.abs(M[0])).toBeCloseTo(M0, 3);
  });

  it('supera le autoverifiche', () => autoverificheOk(e));
});

describe('trave Gerber', () => {
  // A(0) — cerniera interna G(6) — appoggio B(8) — appoggio C(12)
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

  it('è isostatica: due corpi, sei equazioni, sei incognite', () => {
    expect(e.equilibrio.classificazione).toBe('isostatica');
    expect(e.equilibrio.corpi.length).toBe(2);
    expect(e.equilibrio.numeroEquazioni).toBe(6);
    expect(e.equilibrio.numeroIncognite).toBe(6);
  });

  it('le reazioni sono quelle note', () => {
    // tronco A–G isostatico di luce 6: R_A = q·6/2
    expect(reaz(e, 'A').fy).toBeCloseTo((q * 6) / 2, 4);
    // dal tronco G–C: momenti attorno a C
    expect(reaz(e, 'B').fy).toBeCloseTo(135e3, 3);
    expect(reaz(e, 'C').fy).toBeCloseTo(0, 3);
  });

  it('il momento nella cerniera è nullo', () => {
    expect(Math.abs(e.fem.aste[1].M[0])).toBeLessThan(1e-6);
    haEsaminato(e, 'M_NULLO_IN_CERNIERA', 1);
  });

  it('la sconnessione trasmette forza ma non momento', () => {
    expect(e.equilibrio.sconnessioni.length).toBe(1);
    const s = e.equilibrio.sconnessioni[0];
    expect(Math.abs(s.mz)).toBeLessThan(1e-6);
    // la forza trasmessa è la reazione del tronco appoggiato
    expect(Math.abs(s.fy)).toBeCloseTo((q * 6) / 2, 3);
  });

  it('supera le autoverifiche', () => autoverificheOk(e));
});

describe('arco a tre cerniere', () => {
  const L = 10, f = 3, q = 5e3;
  const { p, sez } = base('arco');
  const a = p.nodo(0, 0, 'A');
  const c = p.nodo(L / 2, f, 'C');
  const b = p.nodo(L, 0, 'B');
  const e1 = p.asta(a, c, 'S275', sez, EB);
  const e2 = p.asta(c, b, 'S275', sez, { ...EB, svincoloIniziale: { M: true } });
  p.vincolo(a, 'cerniera');
  p.vincolo(b, 'cerniera');
  p.distribuito(e1, -q, { modo: 'globaleY', perProiezione: true });
  p.distribuito(e2, -q, { modo: 'globaleY', perProiezione: true });
  const e = statica(p.costruisci());

  it('spinta orizzontale H = qL²/(8f)', () => {
    expect(reaz(e, 'A').fx).toBeCloseTo((q * L * L) / (8 * f), 4);
    expect(reaz(e, 'B').fx).toBeCloseTo(-(q * L * L) / (8 * f), 4);
  });

  it('le reazioni verticali valgono qL/2 ciascuna', () => {
    expect(reaz(e, 'A').fy).toBeCloseTo((q * L) / 2, 4);
    expect(reaz(e, 'B').fy).toBeCloseTo((q * L) / 2, 4);
  });

  it('momento nullo in tutte e tre le cerniere', () => {
    expect(Math.abs(reaz(e, 'A').mz)).toBeLessThan(1e-6);
    expect(Math.abs(reaz(e, 'B').mz)).toBeLessThan(1e-6);
    expect(Math.abs(e.fem.aste[1].M[0])).toBeLessThan(1e-5);
  });

  it('supera le autoverifiche', () => autoverificheOk(e));
});

describe('portale isostatico con cerniera in chiave', () => {
  const q = 20e3, L = 6, H = 4;
  const { p, sez } = base('portale');
  const p1 = p.nodo(0, 0, 'P1');
  const t1 = p.nodo(0, H, 'T1');
  const tc = p.nodo(L / 2, H, 'TC');
  const t2 = p.nodo(L, H, 'T2');
  const p2 = p.nodo(L, 0, 'P2');
  p.asta(p1, t1, 'S275', sez, EB);
  const b1 = p.asta(t1, tc, 'S275', sez, EB);
  const b2 = p.asta(tc, t2, 'S275', sez, { ...EB, svincoloIniziale: { M: true } });
  p.asta(t2, p2, 'S275', sez, EB);
  p.vincolo(p1, 'cerniera');
  p.vincolo(p2, 'cerniera');
  p.distribuito(b1, -q);
  p.distribuito(b2, -q);
  const e = statica(p.costruisci());

  it('è isostatica', () => {
    expect(e.equilibrio.classificazione).toBe('isostatica');
  });

  it('le reazioni orizzontali sono non nulle e opposte', () => {
    const H1 = reaz(e, 'P1').fx;
    const H2 = reaz(e, 'P2').fx;
    expect(Math.abs(H1)).toBeGreaterThan(1e3);
    expect(H1).toBeCloseTo(-H2, 4);
  });

  it('le reazioni verticali valgono qL/2 per simmetria', () => {
    expect(reaz(e, 'P1').fy).toBeCloseTo((q * L) / 2, 3);
    expect(reaz(e, 'P2').fy).toBeCloseTo((q * L) / 2, 3);
  });

  it('supera le autoverifiche', () => autoverificheOk(e));
});

describe('carrello inclinato di 30°', () => {
  const P = 10e3, L = 4, alpha = Math.PI / 6;
  const { p, sez } = base('carrello inclinato');
  const a = p.nodo(0, 0, 'A');
  const b = p.nodo(L, 0, 'B');
  p.asta(a, b, 'S275', sez, EB);
  p.vincolo(a, 'cerniera');
  p.vincolo(b, 'carrello', alpha);
  p.forza(b, 0, -P);
  const e = statica(p.costruisci());

  it('la verifica del carrello ha davvero esaminato il carrello', () => {
    haEsaminato(e, 'CARRELLO_PARALLELO', 1);
  });

  it('la reazione è diretta lungo l\'asse del carrello, non verticale', () => {
    const R = reaz(e, 'B');
    // la normale al piano di scorrimento è (−sinα, cosα)
    const angolo = Math.atan2(R.fy, R.fx);
    const atteso = Math.atan2(Math.cos(alpha), -Math.sin(alpha));
    expect(Math.abs(Math.sin(angolo - atteso))).toBeLessThan(1e-9);
  });

  it('entrambe le componenti H e V sono non nulle', () => {
    const R = reaz(e, 'B');
    expect(Math.abs(R.fx)).toBeGreaterThan(1e3);
    expect(Math.abs(R.fy)).toBeGreaterThan(1e3);
    // e il rapporto è la tangente dell'angolo del piano
    expect(-R.fx / R.fy).toBeCloseTo(Math.tan(alpha), 9);
  });

  it('supera le autoverifiche', () => autoverificheOk(e));
});

describe('trave inclinata con carico globale Y', () => {
  const q = 8e3;
  const { p, sez } = base('inclinata');
  const a = p.nodo(0, 0, 'A');
  const b = p.nodo(4, 3, 'B');       // lunghezza 5, inclinazione 36.87°
  const el = p.asta(a, b, 'S275', sez, EB);
  p.vincolo(a, 'cerniera');
  p.vincolo(b, 'carrello');
  p.distribuito(el, -q);              // per unità di lunghezza dell'asta
  const e = statica(p.costruisci());

  it('la risultante è q·L, non q·proiezione', () => {
    const totale = e.equilibrio.perNodo.reduce((s, r) => s + r.fy, 0);
    expect(totale).toBeCloseTo(q * 5, 4);
  });

  it('lo sforzo normale non è nullo: il carico ha componente assiale', () => {
    const N = e.fem.aste[0].N;
    expect(Math.max(...N.map(Math.abs))).toBeGreaterThan(1e3);
  });

  it('con misura in proiezione la risultante scende a q·4', () => {
    const { p: p2, sez: s2 } = base('inclinata pianta');
    const a2 = p2.nodo(0, 0, 'A');
    const b2 = p2.nodo(4, 3, 'B');
    const el2 = p2.asta(a2, b2, 'S275', s2, EB);
    p2.vincolo(a2, 'cerniera');
    p2.vincolo(b2, 'carrello');
    p2.distribuito(el2, -q, { modo: 'globaleY', perProiezione: true });
    const e2 = statica(p2.costruisci());
    const totale = e2.equilibrio.perNodo.reduce((s, r) => s + r.fy, 0);
    expect(totale).toBeCloseTo(q * 4, 4);
  });

  it('supera le autoverifiche', () => autoverificheOk(e));
});

describe('trave verticale con carico ortogonale', () => {
  const q = 8e3, H = 4;
  const { p, sez } = base('colonna');
  const a = p.nodo(0, 0, 'A');
  const b = p.nodo(0, H, 'B');
  const el = p.asta(a, b, 'S275', sez, EB);
  p.vincolo(a, 'incastro');
  p.distribuito(el, q, { modo: 'localeOrtogonale' });
  const e = statica(p.costruisci());

  it('la reazione è orizzontale e vale qH', () => {
    const R = reaz(e, 'A');
    expect(Math.abs(R.fx)).toBeCloseTo(q * H, 4);
    expect(Math.abs(R.fy)).toBeLessThan(1e-6);
  });

  it('il momento all\'incastro vale qH²/2', () => {
    expect(Math.abs(reaz(e, 'A').mz)).toBeCloseTo((q * H * H) / 2, 3);
  });

  it('supera le autoverifiche', () => autoverificheOk(e));
});

describe('carico distribuito verso l\'alto', () => {
  const q = 12e3, L = 5;
  const { p, sez } = base('sottospinta');
  const a = p.nodo(0, 0, 'A');
  const b = p.nodo(L, 0, 'B');
  const el = p.asta(a, b, 'S275', sez, EB);
  p.vincolo(a, 'cerniera');
  p.vincolo(b, 'carrello');
  p.distribuito(el, +q);
  const e = statica(p.costruisci());

  it('le reazioni si invertono', () => {
    expect(reaz(e, 'A').fy).toBeCloseTo(-(q * L) / 2, 4);
    expect(reaz(e, 'B').fy).toBeCloseTo(-(q * L) / 2, 4);
  });

  it('il momento cambia segno rispetto al carico verso il basso', () => {
    const M = e.fem.aste[0].puntiNotevoli.map((x) => x.M);
    expect(Math.min(...M)).toBeCloseTo(-(q * L * L) / 8, 3);
  });

  it('supera le autoverifiche', () => autoverificheOk(e));
});

describe('vincolo intermedio non separante', () => {
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

  it('non genera cerniere: un solo corpo rigido', () => {
    expect(e.equilibrio.corpi.length).toBe(1);
    expect(e.equilibrio.sconnessioni.length).toBe(0);
  });

  it('è iperstatica, quindi l\'equilibrio da solo non basta', () => {
    expect(e.equilibrio.classificazione).toBe('iperstatica');
    expect(e.equilibrio.risolto).toBe(false);
    expect(e.equilibrio.iperstaticita).toBe(1);
    expect(e.equilibrio.messaggio).toContain('congruenza');
  });

  it('il FEM la risolve, con il momento di Clapeyron sull\'appoggio', () => {
    const M = e.fem.aste.flatMap((x) => x.puntiNotevoli.map((y) => y.M));
    expect(Math.min(...M)).toBeCloseTo(-(q * campata ** 2) / 8, 3);
  });

  it('la rotazione è continua attraverso il vincolo intermedio', () => {
    // i due tronchi condividono il nodo: la rotazione nodale è una sola
    const rotazioni = e.fem.aste.map((x) => x.forzeEstremita);
    expect(rotazioni.length).toBe(2);
    // il momento è continuo attraverso il nodo: non c'è alcun rilascio
    const finePrimo = e.fem.aste[0].M[e.fem.aste[0].M.length - 1];
    const inizioSecondo = e.fem.aste[1].M[0];
    expect(finePrimo).toBeCloseTo(inizioSecondo, 4);
    expect(Math.abs(finePrimo)).toBeGreaterThan(1e3);   // e non è nullo
  });

  it('supera le autoverifiche', () => autoverificheOk(e));
});

describe('classificazione', () => {
  it('una struttura labile non produce numeri', () => {
    const { p, sez } = base('labile');
    const a = p.nodo(0, 0, 'A');
    const b = p.nodo(3, 0, 'B');
    const c = p.nodo(6, 0, 'C');
    p.asta(a, b, 'S275', sez, EB);
    p.asta(b, c, 'S275', sez, EB);
    p.vincolo(a, 'carrello', 0);
    p.vincolo(b, 'carrello', 0);
    p.vincolo(c, 'carrello', 0);
    p.forza(b, 5e3, -10e3);
    const e = statica(p.costruisci());
    expect(e.equilibrio.classificazione).toBe('labile');
    expect(e.equilibrio.risolto).toBe(false);
    expect(e.equilibrio.perNodo.length).toBe(0);
  });

  it('il residuo dell\'equilibrio globale è nullo sulle isostatiche', () => {
    const { p, sez } = base('res');
    const a = p.nodo(0, 0, 'A');
    const b = p.nodo(5, 0, 'B');
    const el = p.asta(a, b, 'S275', sez, EB);
    p.vincolo(a, 'cerniera');
    p.vincolo(b, 'carrello');
    p.distribuito(el, -9e3);
    p.forzaInCampata(el, 0.3, 0, -20e3);
    const e = statica(p.costruisci());
    expect(e.equilibrio.risolto).toBe(true);
    expect(e.equilibrio.residui.relativo).toBeLessThan(1e-12);
  });
});

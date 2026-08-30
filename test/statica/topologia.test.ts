/**
 * TOPOLOGIA — quanti corpi rigidi, e da che cosa dipendono.
 *
 * Sono i test 11-14 della suite. Verificano la regola: nulla separa un corpo
 * rigido tranne una sconnessione interna esplicita. In particolare che il
 * risultato NON dipenda da come è stato tracciato il disegno, che è l'errore
 * che questi test esistono per impedire.
 */

import { describe, it, expect } from 'vitest';
import { progetto } from '../../src/core/builder.js';
import { preset } from '../../src/core/materials/sezioniParametriche.js';
import {
  analizzaCinematica, analizzaStatica, espandi, troncoInSezione,
  type EsitoStatico,
} from '../../src/core/index.js';
import { analizzaTopologia } from '../../src/core/kinematics/topologia.js';
import { costruisciIndice } from '../../src/core/model/queries.js';
import { MATERIALI } from '../../src/core/materials/materials.js';
import { SEZIONI } from '../../src/core/materials/sections.js';
import type { ElementId, LoadCaseId, Progetto } from '../../src/core/model/types.js';

const CASO = 'principale' as LoadCaseId;
const EB = { teoria: 'eulero-bernoulli' as const };

/** Topologia del modello di CALCOLO, che è quella meccanicamente vera. */
function topologia(p: Progetto) {
  const calcolo = espandi(p).progetto;
  const idx = costruisciIndice(
    calcolo,
    [...MATERIALI, ...p.materialiPersonalizzati],
    [...SEZIONI, ...p.sezioniPersonalizzate],
  );
  return analizzaTopologia(calcolo, idx);
}

function statica(p: Progetto): EsitoStatico {
  return analizzaStatica(p, { tipo: 'caso', id: CASO }, {
    sezioniExtra: p.sezioniPersonalizzate,
    materialiExtra: p.materialiPersonalizzati,
  });
}

// ═══════════════════════════ TEST 11 ═══════════════════════════

/**
 * Telaio chiuso con tre cerniere interne — il caso di accettazione.
 *
 *   A ────────────── B          A(0,2L)  B(4L,2L)
 *   │                │          montanti verticali di altezza 2L
 *   │                │          traverso inferiore H–G–F–E–D, passo L
 *   H──G──F──E───────D          cerniere interne in A, B, F
 *      △  (carrello) │          carrello in G, cerniera in E
 *            ▲ (cerniera in E)
 */
function telaioTreCerniere(L = 2): Progetto {
  const p = progetto('telaio a tre cerniere');
  const sez = p.sezioneParametrica('s', preset('IPE 300'));
  const H = p.nodo(0, 0, 'H');
  const G = p.nodo(L, 0, 'G');
  const F = p.nodo(2 * L, 0, 'F');
  const E = p.nodo(3 * L, 0, 'E');
  const D = p.nodo(4 * L, 0, 'D');
  const A = p.nodo(0, 2 * L, 'A');
  const B = p.nodo(4 * L, 2 * L, 'B');
  const C = p.nodo(4 * L, L, 'C');          // punto intermedio del montante destro

  p.asta(H, A, 'S275', sez, EB);            // montante sinistro
  p.asta(A, B, 'S275', sez, EB);            // traverso superiore
  p.asta(B, C, 'S275', sez, EB);            // montante destro, tratto alto
  p.asta(C, D, 'S275', sez, EB);            // montante destro, tratto basso
  p.asta(H, G, 'S275', sez, EB);
  p.asta(G, F, 'S275', sez, EB);
  p.asta(F, E, 'S275', sez, EB);
  p.asta(E, D, 'S275', sez, EB);

  p.sconnessioneNodale(A, 'cerniera');
  p.sconnessioneNodale(B, 'cerniera');
  p.sconnessioneNodale(F, 'cerniera');

  p.vincolo(G, 'carrello');
  p.vincolo(E, 'cerniera');
  p.momento(C, 30e3);
  return p.costruisci();
}

describe('11 — telaio chiuso con tre cerniere interne', () => {
  const p = telaioTreCerniere();
  const t = topologia(p);

  it('i corpi rigidi sono 3, non uno per segmento disegnato', () => {
    expect(t.n).toBe(3);
  });

  it('i corpi sono quelli attesi: montante + tratto inferiore, e il traverso', () => {
    const nomi = (b: number) => new Set(t.nodiDelCorpo[b].map((x) => x as unknown as string));
    // il traverso superiore è il corpo con esattamente due nodi, A e B
    const traverso = t.nodiDelCorpo.findIndex((x) => x.length === 2);
    expect(traverso).toBeGreaterThanOrEqual(0);
    expect(nomi(traverso)).toEqual(new Set(['A', 'B']));

    const altri = [0, 1, 2].filter((b) => b !== traverso);
    const insiemi = altri.map(nomi);
    // corpo I: montante sinistro H–A più il tratto H–G–F
    expect(insiemi.some((s) => s.has('A') && s.has('H') && s.has('G') && s.has('F')))
      .toBe(true);
    // corpo III: montante destro B–C–D più il tratto D–E–F
    expect(insiemi.some((s) => s.has('B') && s.has('D') && s.has('E') && s.has('F')))
      .toBe(true);
  });

  it('nessun anello resta chiuso: le tre cerniere lo spezzano', () => {
    expect(t.anelliTotali).toBe(0);
    expect(t.iperstaticitaInterna).toBe(0);
  });

  it('gdl = 9, vincoli esterni 3, interni 6, rango 9 → isostatica', () => {
    const c = analizzaCinematica(p);
    expect(c.numeroCorpi).toBe(3);
    expect(c.gradiLiberta).toBe(9);
    expect(t.gradiVincoloInterni).toBe(6);      // tre cerniere fra due corpi
    expect(c.gradiVincolo).toBe(9);             // 6 interni + 3 esterni
    expect(c.rango).toBe(9);
    expect(c.labilita).toBe(0);
    expect(c.iperstaticita).toBe(0);
    expect(c.classificazione).toBe('isostatica');
  });

  it('il momento è nullo nelle tre cerniere', () => {
    const e = statica(p);
    expect(e.equilibrio.classificazione).toBe('isostatica');
    const scala = Math.max(
      ...e.fem.aste.map((a) => Math.max(Math.abs(a.estremi.Mmin), Math.abs(a.estremi.Mmax))),
    );
    for (const nodo of ['A', 'B', 'F']) {
      const momenti = momentiInNodo(e, nodo);
      expect(momenti.length, `nessuna sezione trovata in ${nodo}`).toBeGreaterThan(0);
      for (const m of momenti) {
        expect(Math.abs(m) / scala, `M in ${nodo}`).toBeLessThan(1e-9);
      }
    }
  });

  it('supera tutte le autoverifiche', () => {
    const e = statica(p);
    for (const v of e.autoverifiche.verifiche) {
      expect(v.superata, `${v.codice}: ${v.dettaglio}`).toBe(true);
    }
  });
});

/** Momenti letti alle estremità delle aste che toccano il nodo. */
function momentiInNodo(e: EsitoStatico, nodo: string): number[] {
  const out: number[] = [];
  for (const a of e.modello.calcolo.aste) {
    const ris = e.fem.aste.find((x) => x.astaId === a.id);
    if (!ris) continue;
    if ((a.nodoIniziale as unknown as string) === nodo) out.push(ris.M[0]);
    if ((a.nodoFinale as unknown as string) === nodo) out.push(ris.M[ris.M.length - 1]);
  }
  return out;
}

describe('anello chiuso senza cerniere', () => {
  /**
   * Lo stesso telaio, TOGLIENDO le tre cerniere. Il conteggio 3n − v
   * continuerebbe a dire «isostatica» perché il telaio è un corpo solo: è
   * esattamente il caso in cui il bilancio inganna, e per questo l'anello va
   * dichiarato a parte.
   */
  function telaioChiuso(L = 2): Progetto {
    const p = progetto('telaio chiuso');
    const sez = p.sezioneParametrica('s', preset('IPE 300'));
    const H = p.nodo(0, 0, 'H');
    const G = p.nodo(L, 0, 'G');
    const E = p.nodo(3 * L, 0, 'E');
    const D = p.nodo(4 * L, 0, 'D');
    const A = p.nodo(0, 2 * L, 'A');
    const B = p.nodo(4 * L, 2 * L, 'B');
    p.asta(H, A, 'S275', sez, EB);
    const traverso = p.asta(A, B, 'S275', sez, EB);
    p.asta(B, D, 'S275', sez, EB);
    p.asta(H, G, 'S275', sez, EB);
    p.asta(G, E, 'S275', sez, EB);
    p.asta(E, D, 'S275', sez, EB);
    p.vincolo(G, 'carrello');
    p.vincolo(E, 'cerniera');
    p.distribuito(traverso, -10e3);
    return p.costruisci();
  }

  it('un corpo solo, un anello, 3 iperstaticità interne dichiarate', () => {
    const p = telaioChiuso();
    const t = topologia(p);
    expect(t.n).toBe(1);
    expect(t.anelliTotali).toBe(1);
    expect(t.iperstaticitaInterna).toBe(3);
  });

  it('il bilancio esterno direbbe isostatica: l\'avviso è l\'unica difesa', () => {
    const c = analizzaCinematica(telaioChiuso());
    expect(c.numeroCorpi).toBe(1);
    expect(c.classificazione).toBe('isostatica');   // 3 gradi di vincolo, 3 gdl
    expect(c.anelliChiusi).toBe(1);
    expect(c.iperstaticitaInterna).toBe(3);
    const avviso = c.diagnosi.find((d) => d.codice === 'ANELLO_CHIUSO');
    expect(avviso, 'manca l\'avviso sull\'anello chiuso').toBeDefined();
    expect(avviso!.messaggio).toMatch(/iperstaticità INTERNE/);
  });

  it('l\'elementino si dichiara inapplicabile sulle aste dell\'anello', () => {
    const e = statica(telaioChiuso());
    expect(e.elementino.applicabile).toBe(false);
    const inapplicabili = [...e.elementino.diagrammi.values()].filter((d) => !d.applicabile);
    expect(inapplicabili.length).toBeGreaterThan(0);
    expect(inapplicabili[0].motivo).toMatch(/maglia chiusa/);
  });
});

// ═══════════════════════════ TEST 12 ═══════════════════════════

/**
 * Struttura a H disegnata in TRE TRATTI SEPARATI, agganciati con lo snap.
 * Il tasto Esc premuto fra un tratto e l'altro non è un dato meccanico.
 */
function accaInTreTratti(): Progetto {
  const p = progetto('H in tre tratti');
  const sez = p.sezioneParametrica('s', preset('IPE 300'));
  // primo tratto: montante sinistro, disegnato per intero e poi "Esc"
  const s1 = p.nodo(0, 0, 'S1');
  const sm = p.nodo(0, 2, 'SM');            // mezzeria, nata dallo snap
  const s2 = p.nodo(0, 4, 'S2');
  p.asta(s1, sm, 'S275', sez, EB);
  p.asta(sm, s2, 'S275', sez, EB);
  // secondo tratto: traverso agganciato alla mezzeria, poi "Esc"
  const dm = p.nodo(3, 2, 'DM');
  p.asta(sm, dm, 'S275', sez, EB);
  // terzo tratto: montante destro, agganciato all'estremo del traverso
  const d1 = p.nodo(3, 0, 'D1');
  const d2 = p.nodo(3, 4, 'D2');
  p.asta(d1, dm, 'S275', sez, EB);
  p.asta(dm, d2, 'S275', sez, EB);
  p.vincolo(s1, 'incastro');
  p.forza(d2, 5e3, 0);
  return p.costruisci();
}

describe('12 — la H disegnata in tre tratti è un corpo solo', () => {
  const p = accaInTreTratti();

  it('n = 1 e gdl = 3, malgrado i cinque segmenti', () => {
    const t = topologia(p);
    expect(p.aste.length).toBe(5);
    expect(t.n).toBe(1);
    const c = analizzaCinematica(p);
    expect(c.numeroCorpi).toBe(1);
    expect(c.gradiLiberta).toBe(3);
  });

  it('nessun vincolo interno: i punti condivisi sono connessioni rigide', () => {
    const t = topologia(p);
    expect(t.gradiVincoloInterni).toBe(0);
    expect(t.anelliTotali).toBe(0);
  });

  it('con l\'incastro è isostatica, e resta tale comunque la si disegni', () => {
    const c = analizzaCinematica(p);
    expect(c.classificazione).toBe('isostatica');
  });
});

// ═══════════════════════════ TEST 13 ═══════════════════════════

describe('13 — la stessa H con una cerniera su un attacco', () => {
  function conCerniera(): Progetto {
    const p = progetto('H con cerniera');
    const sez = p.sezioneParametrica('s', preset('IPE 300'));
    const s1 = p.nodo(0, 0, 'S1');
    const sm = p.nodo(0, 2, 'SM');
    const s2 = p.nodo(0, 4, 'S2');
    p.asta(s1, sm, 'S275', sez, EB);
    p.asta(sm, s2, 'S275', sez, EB);
    const dm = p.nodo(3, 2, 'DM');
    const traverso = p.asta(sm, dm, 'S275', sez, EB);
    const d1 = p.nodo(3, 0, 'D1');
    const d2 = p.nodo(3, 4, 'D2');
    p.asta(d1, dm, 'S275', sez, EB);
    p.asta(dm, d2, 'S275', sez, EB);
    p.vincolo(s1, 'incastro');
    // la cerniera riguarda SOLO il traverso: il montante sinistro resta
    // continuo attraverso la mezzeria
    p.sconnessioneNodale(sm, 'cerniera', { asteSvincolate: [traverso] });
    p.forza(d2, 5e3, 0);
    return p.costruisci();
  }

  const p = conCerniera();

  it('n = 2 e gdl = 6', () => {
    const t = topologia(p);
    expect(t.n).toBe(2);
    const c = analizzaCinematica(p);
    expect(c.numeroCorpi).toBe(2);
    expect(c.gradiLiberta).toBe(6);
  });

  it('i vincoli interni sono 2: la cerniera trasmette N e T', () => {
    const t = topologia(p);
    expect(t.gradiVincoloInterni).toBe(2);
  });

  it('la sconnessione è PARZIALE: il montante non si spezza', () => {
    const t = topologia(p);
    const nodo = t.nodi.find((x) => (x.nodoId as unknown as string) === 'SM')!;
    // tre estremità convergono in SM, una sola è svincolata
    expect(nodo.estremita.length).toBe(3);
    expect(nodo.svincolate.length).toBe(1);
    expect(nodo.gruppoRigido.length).toBe(2);
  });
});

// ═══════════════════════════ TEST 14 ═══════════════════════════

describe('14 — carrello in mezzeria: un corpo solo, momento continuo', () => {
  const L = 10, q = 12e3;
  const p = progetto('carrello in mezzeria');
  const sez = p.sezioneParametrica('s', preset('IPE 300'));
  const a = p.nodo(0, 0, 'A');
  const b = p.nodo(L, 0, 'B');
  const el = p.asta(a, b, 'S275', sez, EB);
  p.vincolo(a, 'cerniera');
  p.vincolo(b, 'carrello');
  p.vincoloSuAsta(el, 0.5, 'carrello');
  p.distribuito(el, -q);
  const prog = p.costruisci();

  it('il vincolo in campata non crea un corpo in più', () => {
    const t = topologia(prog);
    expect(t.n).toBe(1);
    expect(t.gradiVincoloInterni).toBe(0);
    // nel modello di calcolo l'asta è divisa in due tronchi, ma restano
    // rigidamente connessi
    expect(espandi(prog).progetto.aste.length).toBe(2);
  });

  it('è iperstatica una volta, come una trave continua su tre appoggi', () => {
    const c = analizzaCinematica(prog);
    expect(c.numeroCorpi).toBe(1);
    expect(c.classificazione).toBe('iperstatica');
    expect(c.iperstaticita).toBe(1);
  });

  it('il momento è continuo attraverso l\'appoggio', () => {
    const e = statica(prog);
    const eps = 1e-6;
    const prima = troncoInSezione(e, el as unknown as ElementId, 0.5 - eps).M;
    const dopo = troncoInSezione(e, el as unknown as ElementId, 0.5 + eps).M;
    const scala = Math.abs(prima) + Math.abs(dopo);
    expect(Math.abs(prima - dopo) / scala).toBeLessThan(1e-6);
    // e vale −qL_campata²/8 con L_campata = 5 (lo scarto è il campionamento
    // spostato di 1e-5 m dall'appoggio, non un errore di calcolo)
    const atteso = -(q * 25) / 8;
    expect(Math.abs(prima - atteso) / Math.abs(atteso)).toBeLessThan(1e-4);
  });

  it('il taglio invece SALTA, di quanto vale la reazione', () => {
    const e = statica(prog);
    const eps = 1e-6;
    const prima = troncoInSezione(e, el as unknown as ElementId, 0.5 - eps).T;
    const dopo = troncoInSezione(e, el as unknown as ElementId, 0.5 + eps).T;
    const reazione = e.componentiEsterne
      .filter((c) => c.componente !== 'rotazione' && c.direzione && c.direzione.dy !== 0)
      .map((c) => Math.abs(c.valore))
      .sort((x, y) => y - x)[0];
    expect(Math.abs(Math.abs(prima - dopo) - reazione) / reazione).toBeLessThan(1e-4);
  });
});

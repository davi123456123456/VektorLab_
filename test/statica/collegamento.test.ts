/**
 * IL BUG DEL COLLEGAMENTO MANCATO — test di regressione.
 *
 * Sintomo: si aggancia una nuova asta al punto medio di un'altra, in quel nodo
 * non c'è alcuna cerniera, e il software conta due corpi rigidi dichiarando la
 * struttura labile.
 *
 * Causa: NON l'union-find. I due segmenti erano coincidenti in un punto ma
 * topologicamente scollegati — un nodo nuovo alle stesse coordinate, l'asta
 * ospite lasciata intera. Il conteggio era giusto su un modello sbagliato.
 *
 * Questi test guardano il MODELLO, non solo il risultato: verificano che i
 * segmenti condividano davvero lo stesso id di nodo. Un test che si accontenti
 * di `n === 1` passerebbe anche con una pezza applicata al conteggio.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { progetto } from '../../src/core/builder.js';
import { preset } from '../../src/core/materials/sezioniParametriche.js';
import {
  analizzaCinematica, analizzaStatica, espandi, normalizzaModello,
  preparaPerAnalisi, troncoInSezione,
} from '../../src/core/index.js';
import { useStore, progettoVuoto } from '../../src/state/store.js';
import {
  aggiungiAsta, estrudi, nodoCollegato, aggiungiVincoloSuAsta,
} from '../../src/state/commands.js';
import { calcolaSnap, SNAP_PREDEFINITO } from '../../src/render/snap.js';
import { cameraIniziale, mondoASchermo } from '../../src/render/camera.js';
import type { ElementId, LoadCaseId, NodeId, Progetto } from '../../src/core/model/types.js';

const CASO = 'principale' as LoadCaseId;
const EB = { teoria: 'eulero-bernoulli' as const };
const cam = { ...cameraIniziale(), larghezza: 900, altezza: 700, zoom: 60 };

const st = () => useStore.getState();

beforeEach(() => {
  useStore.setState({ progetto: progettoVuoto(), passato: [], futuro: [] });
});

/** Aggancia un nodo nel punto `(x, y)` come farebbe il disegno interattivo. */
function agganciaNodo(x: number, y: number): NodeId {
  const s = calcolaSnap(st().progetto, cam, mondoASchermo(cam, { x, y }), SNAP_PREDEFINITO);
  if (s.nodoId) return s.nodoId;
  const cmd = nodoCollegato(s.punto.x, s.punto.y, s.suAste);
  st().esegui(cmd);
  return cmd.id!;
}

/** Ogni nodo con il numero di segmenti che lo referenziano. */
function grado(p: Progetto, nodoId: NodeId): number {
  return p.aste.filter(
    (a) => a.nodoIniziale === nodoId || a.nodoFinale === nodoId).length;
}

// ════════════════════════════════════════════════════════════════════
// La struttura della segnalazione

/**
 *   n2 (0,6) ─┐
 *             │
 *   n6 (0,3) ─┼───────── n4 (3,3)
 *             │              │
 *   n1 (0,0) ─┘          n5 (3,0)
 */
function strutturaDellaFigura(): { nodoMedio: NodeId } {
  const p = progetto('figura');
  const sez = p.sezioneParametrica('s', preset('IPE 300'));
  const n1 = p.nodo(0, 0, 'n1');
  const n2 = p.nodo(0, 6, 'n2');
  p.asta(n1, n2, 'S275', sez, EB);
  p.vincolo(n1, 'cerniera');
  // carrello su piano VERTICALE: la sua reazione è orizzontale e impedisce la
  // rotazione attorno a n1. Con un carrello a piano orizzontale la retta
  // d'azione passerebbe per n1 e la struttura sarebbe labile — per colpa dei
  // vincoli, non del nodo n6
  p.vincolo(n2, 'carrello', Math.PI / 2);
  useStore.getState().caricaProgetto(p.costruisci());

  // il gesto che scatenava il bug: aggancio al punto medio dell'asta verticale
  const n6 = agganciaNodo(0, 3);
  const orizzontale = estrudi(n6, 3, 3, 'S275', 's');
  st().esegui(orizzontale);
  const verticaleDestra = estrudi(orizzontale.idNodo!, 3, 0, 'S275', 's');
  st().esegui(verticaleDestra);
  return { nodoMedio: n6 };
}

describe('1 — asta agganciata al punto medio: nodo rigido, UN corpo', () => {
  it('i due segmenti condividono lo STESSO id di nodo', () => {
    const { nodoMedio } = strutturaDellaFigura();
    const p = st().progetto;
    // l'asta verticale è stata spezzata: tre segmenti la toccano
    expect(grado(p, nodoMedio)).toBe(3);
    // e nessun altro nodo sta alle stesse coordinate
    const coincidenti = p.nodi.filter(
      (n) => Math.hypot(n.x - 0, n.y - 3) < 1e-9);
    expect(coincidenti.length).toBe(1);
    expect(coincidenti[0].id).toBe(nodoMedio);
  });

  it('n = 1 e gdl = 3: il nodo rigido NON separa', () => {
    strutturaDellaFigura();
    const k = analizzaCinematica(st().progetto);
    expect(k.numeroCorpi).toBe(1);
    expect(k.gradiLiberta).toBe(3);
  });

  it('non è labile per colpa di n6', () => {
    strutturaDellaFigura();
    const k = analizzaCinematica(st().progetto);
    expect(k.labilita).toBe(0);
    expect(k.classificazione).not.toBe('labile');
  });

  it('nessun nodo coincidente non fuso, nessun riferimento rotto', () => {
    strutturaDellaFigura();
    const n = normalizzaModello(st().progetto);
    expect(n.fusioni.size).toBe(0);
    expect(n.asteScartate.length).toBe(0);
    expect(n.nodiSuAsta.length).toBe(0);
  });

  it('M è continuo attraverso n6: nessuno svincolo introdotto', () => {
    const { nodoMedio } = strutturaDellaFigura();
    const p = st().progetto;
    for (const a of p.aste) {
      if (a.nodoIniziale === nodoMedio) {
        expect(a.svincolo.iniziale).toMatchObject({ N: false, T: false, M: false });
      }
      if (a.nodoFinale === nodoMedio) {
        expect(a.svincolo.finale).toMatchObject({ N: false, T: false, M: false });
      }
    }
    // e nel calcolo la continuità nei nodi rigidi è verificata dal nucleo
    const e = analizzaStatica(p, { tipo: 'caso', id: CASO }, {
      sezioniExtra: p.sezioniPersonalizzate,
      materialiExtra: p.materialiPersonalizzati,
    });
    const v = e.autoverifiche.verifiche.find((x) => x.codice === 'CONTINUITA_NODI')!;
    expect(v.superata, v.dettaglio).toBe(true);
    expect(v.esaminati).toBeGreaterThan(0);
  });
});

// ════════════════════════════════════════════════════════════════════

describe('varianti', () => {
  it('1a — cerniera interna PARZIALE in n6: solo il traverso si sconnette', () => {
    // è il caso che si vuole quasi sempre: il montante resta continuo e il
    // traverso vi si incerniera. Due corpi, due gradi di vincolo interni.
    const { nodoMedio } = strutturaDellaFigura();
    const p = st().progetto;
    const traverso = p.aste.find(
      (a) => a.nodoIniziale === nodoMedio || a.nodoFinale === nodoMedio)!;
    // il traverso è quello che ESCE dalla verticale: ha l'altro estremo in x = 3
    const orizzontale = p.aste.find((a) => {
      const altro = a.nodoIniziale === nodoMedio ? a.nodoFinale
        : a.nodoFinale === nodoMedio ? a.nodoIniziale : null;
      if (!altro) return false;
      return (p.nodi.find((n) => n.id === altro)?.x ?? 0) > 1;
    }) ?? traverso;

    const conCerniera: Progetto = {
      ...p,
      vincoliInterni: [{
        id: 'vi1', tipo: 'cerniera', nodoId: nodoMedio,
        asteSvincolate: [orizzontale.id],
      }],
    };
    const k = analizzaCinematica(conCerniera);
    expect(k.numeroCorpi).toBe(2);
    expect(k.gradiVincoloInterni).toBe(2 * (2 - 1));
  });

  it('1b — cerniera interna COMPLETA in n6: tre segmenti, tre corpi', () => {
    // con m segmenti tutti svincolati i gradi di vincolo interni sono 2(m−1):
    // uno resta rigido e gli altri si sconnettono rispetto a esso
    const { nodoMedio } = strutturaDellaFigura();
    const p = st().progetto;
    const conCerniera: Progetto = {
      ...p,
      vincoliInterni: [{ id: 'vi1', tipo: 'cerniera', nodoId: nodoMedio }],
    };
    const k = analizzaCinematica(conCerniera);
    expect(k.numeroCorpi).toBe(3);
    expect(k.gradiVincoloInterni).toBe(2 * (3 - 1));
  });

  it('2 — la H disegnata in tre tratti separati resta un corpo solo', () => {
    const p = progetto('H');
    const sez = p.sezioneParametrica('s', preset('IPE 300'));
    const s1 = p.nodo(0, 0), s2 = p.nodo(0, 4);
    p.asta(s1, s2, 'S275', sez, EB);
    p.vincolo(s1, 'incastro');
    st().caricaProgetto(p.costruisci());

    // secondo tratto: agganciato alla mezzeria del montante sinistro
    const medio = agganciaNodo(0, 2);
    const traverso = estrudi(medio, 3, 2, 'S275', 's');
    st().esegui(traverso);
    // terzo tratto: montante destro, agganciato all'estremo del traverso
    const alto = estrudi(traverso.idNodo!, 3, 4, 'S275', 's');
    st().esegui(alto);
    const basso = estrudi(traverso.idNodo!, 3, 0, 'S275', 's');
    st().esegui(basso);

    expect(analizzaCinematica(st().progetto).numeroCorpi).toBe(1);
  });

  it('3 — carrello in mezzeria: n = 1 e M continuo', () => {
    const p = progetto('carrello');
    const sez = p.sezioneParametrica('s', preset('IPE 300'));
    const a = p.nodo(0, 0, 'A'), b = p.nodo(10, 0, 'B');
    const el = p.asta(a, b, 'S275', sez, EB);
    p.vincolo(a, 'cerniera');
    p.vincolo(b, 'carrello');
    p.vincoloSuAsta(el, 0.5, 'carrello');
    p.distribuito(el, -12e3);
    const prog = p.costruisci();

    expect(analizzaCinematica(prog).numeroCorpi).toBe(1);
    const e = analizzaStatica(prog, { tipo: 'caso', id: CASO });
    const eps = 1e-7;
    const prima = troncoInSezione(e, el as unknown as ElementId, 0.5 - eps).M;
    const dopo = troncoInSezione(e, el as unknown as ElementId, 0.5 + eps).M;
    expect(Math.abs(prima - dopo) / Math.abs(prima)).toBeLessThan(1e-6);
  });

  it('4 — asta agganciata al QUARTO: n = 1', () => {
    const p = progetto('quarto');
    const sez = p.sezioneParametrica('s', preset('IPE 300'));
    const a = p.nodo(0, 0), b = p.nodo(0, 4);
    p.asta(a, b, 'S275', sez, EB);
    p.vincolo(a, 'incastro');
    st().caricaProgetto(p.costruisci());

    const q = agganciaNodo(0, 1);
    st().esegui(estrudi(q, 2, 1, 'S275', 's'));
    expect(grado(st().progetto, q)).toBe(3);
    expect(analizzaCinematica(st().progetto).numeroCorpi).toBe(1);
  });

  it('5 — asta agganciata all\'ESTREMO di un\'altra: n = 1', () => {
    const p = progetto('estremo');
    const sez = p.sezioneParametrica('s', preset('IPE 300'));
    const a = p.nodo(0, 0), b = p.nodo(0, 4);
    p.asta(a, b, 'S275', sez, EB);
    p.vincolo(a, 'incastro');
    st().caricaProgetto(p.costruisci());

    const estremo = agganciaNodo(0, 4);
    expect(estremo).toBe(b);                 // riusa il nodo, non ne crea uno nuovo
    st().esegui(estrudi(estremo, 3, 4, 'S275', 's'));
    expect(st().progetto.aste.length).toBe(2);
    expect(analizzaCinematica(st().progetto).numeroCorpi).toBe(1);
  });

  it('6 — telaio con tre cerniere interne: n = 3, v = 9, isostatica', () => {
    const L = 2;
    const p = progetto('telaio');
    const sez = p.sezioneParametrica('s', preset('IPE 300'));
    const H = p.nodo(0, 0, 'H'), G = p.nodo(L, 0, 'G'), F = p.nodo(2 * L, 0, 'F');
    const E = p.nodo(3 * L, 0, 'E'), D = p.nodo(4 * L, 0, 'D');
    const A = p.nodo(0, 2 * L, 'A'), B = p.nodo(4 * L, 2 * L, 'B');
    p.asta(H, A, 'S275', sez, EB);
    p.asta(A, B, 'S275', sez, EB);
    p.asta(B, D, 'S275', sez, EB);
    p.asta(H, G, 'S275', sez, EB);
    p.asta(G, F, 'S275', sez, EB);
    p.asta(F, E, 'S275', sez, EB);
    p.asta(E, D, 'S275', sez, EB);
    for (const n of [A, B, F]) p.sconnessioneNodale(n, 'cerniera');
    p.vincolo(G, 'carrello');
    p.vincolo(E, 'cerniera');
    const k = analizzaCinematica(p.costruisci());
    expect(k.numeroCorpi).toBe(3);
    expect(k.gradiVincolo).toBe(9);
    expect(k.rango).toBe(9);
    expect(k.classificazione).toBe('isostatica');
  });
});

// ════════════════════════════════════════════════════════════════════

describe('normalizzazione del grafo', () => {
  it('fonde due nodi coincidenti e ricollega i segmenti', () => {
    const p = progetto('doppio nodo');
    const sez = p.sezioneParametrica('s', preset('IPE 300'));
    const a = p.nodo(0, 0), b = p.nodo(4, 0);
    const c = p.nodo(4, 0);                    // stesso punto, id diverso
    const d = p.nodo(4, 3);
    p.asta(a, b, 'S275', sez, EB);
    p.asta(c, d, 'S275', sez, EB);
    p.vincolo(a, 'incastro');
    const prog = p.costruisci();

    // prima: due corpi separati, perché i due segmenti non condividono nulla
    const grezzo = analizzaCinematica({ ...prog, nodi: prog.nodi });
    const n = normalizzaModello(prog);
    expect(n.fusioni.size).toBe(1);
    expect(n.progetto.nodi.length).toBe(3);
    // dopo la fusione i due segmenti condividono il nodo, ed è un corpo solo
    expect(analizzaCinematica(n.progetto).numeroCorpi).toBe(1);
    expect(grezzo.numeroCorpi).toBe(1);        // l'analisi normalizza da sé
  });

  it('scarta le aste che referenziano nodi inesistenti, senza esplodere', () => {
    const p = progetto('rotto');
    const sez = p.sezioneParametrica('s', preset('IPE 300'));
    const a = p.nodo(0, 0), b = p.nodo(4, 0);
    p.asta(a, b, 'S275', sez, EB);
    const prog = p.costruisci();
    const rotto: Progetto = {
      ...prog,
      aste: [...prog.aste, {
        ...prog.aste[0], id: 'aX' as ElementId, nodoFinale: 'inesistente' as NodeId,
      }],
    };
    const n = normalizzaModello(rotto);
    expect(n.asteScartate.length).toBe(1);
    expect(n.asteScartate[0].motivo).toMatch(/inesistente/);
    expect(n.progetto.aste.length).toBe(1);
  });

  it('segnala i nodi appoggiati su un\'asta senza esserne un estremo', () => {
    const p = progetto('appoggiato');
    const sez = p.sezioneParametrica('s', preset('IPE 300'));
    const a = p.nodo(0, 0), b = p.nodo(4, 0);
    const isolato = p.nodo(2, 0);              // sta sull'asta, ma non la tocca
    const alto = p.nodo(2, 3);
    p.asta(a, b, 'S275', sez, EB);
    p.asta(isolato, alto, 'S275', sez, EB);
    const n = normalizzaModello(p.costruisci());
    expect(n.nodiSuAsta.length).toBe(1);
    expect(n.nodiSuAsta[0].s).toBeCloseTo(0.5, 9);
  });

  it('preparaPerAnalisi è idempotente su un modello già a posto', () => {
    const p = progetto('pulito');
    const sez = p.sezioneParametrica('s', preset('IPE 300'));
    const a = p.nodo(0, 0), b = p.nodo(4, 0);
    p.asta(a, b, 'S275', sez, EB);
    const prog = p.costruisci();
    expect(preparaPerAnalisi(preparaPerAnalisi(prog))).toEqual(preparaPerAnalisi(prog));
  });
});

/**
 * Analisi cinematica: il conteggio ingenuo NON basta.
 * Questi casi sono esattamente quelli in cui `3n − Σv` sbaglia.
 */

import { describe, it, expect } from 'vitest';
import { progetto, analizzaCinematica, rettangolare } from '../../src/core/index.js';

const SEZ = rettangolare(0.05, 0.10, 'SEZ');

function trave(L: number, nel: number, nome = 'k') {
  const p = progetto(nome);
  const nodi = [];
  for (let i = 0; i <= nel; i++) nodi.push(p.nodo((L * i) / nel, 0));
  const aste = [];
  for (let i = 0; i < nel; i++) aste.push(p.asta(nodi[i], nodi[i + 1], 'S355', 'SEZ'));
  p.sezione(SEZ);
  return { p, nodi, aste };
}

describe('classificazione elementare', () => {
  it('trave appoggiata-carrello: isostatica', () => {
    const { p, nodi } = trave(4, 2);
    p.vincolo(nodi[0], 'cerniera');
    p.vincolo(nodi[2], 'carrello');
    const k = analizzaCinematica(p.costruisci());
    expect(k.numeroCorpi).toBe(1);
    expect(k.gradiLiberta).toBe(3);
    expect(k.gradiVincolo).toBe(3);
    expect(k.rango).toBe(3);
    expect(k.labilita).toBe(0);
    expect(k.iperstaticita).toBe(0);
    expect(k.classificazione).toBe('isostatica');
  });

  it('mensola puntellata: una volta iperstatica', () => {
    const { p, nodi } = trave(4, 2);
    p.vincolo(nodi[0], 'incastro');
    p.vincolo(nodi[2], 'carrello');
    const k = analizzaCinematica(p.costruisci());
    expect(k.gradiVincolo).toBe(4);
    expect(k.rango).toBe(3);
    expect(k.labilita).toBe(0);
    expect(k.iperstaticita).toBe(1);
    expect(k.classificazione).toBe('iperstatica');
  });

  it('trave con un solo carrello: labile', () => {
    const { p, nodi } = trave(4, 2);
    p.vincolo(nodi[0], 'carrello');
    const k = analizzaCinematica(p.costruisci());
    expect(k.labilita).toBe(2);
    expect(k.iperstaticita).toBe(0);
    expect(k.classificazione).toBe('labile');
  });
});

describe('vincoli mal disposti — il caso che il conteggio non vede', () => {
  it('tre carrelli PARALLELI: conteggio 0, ma labile e iperstatica', () => {
    const { p, nodi } = trave(6, 3);
    // tutti i piani di scorrimento orizzontali ⇒ reazioni tutte verticali
    p.vincolo(nodi[0], 'carrello', 0);
    p.vincolo(nodi[1], 'carrello', 0);
    p.vincolo(nodi[3], 'carrello', 0);
    const k = analizzaCinematica(p.costruisci());

    expect(k.gradiVincolo).toBe(3);
    expect(k.gradiLiberta).toBe(3);
    // il conteggio darebbe 3−3 = 0 ⇒ "isostatica". Il rango dice altro:
    expect(k.rango).toBe(2);
    expect(k.labilita).toBe(1);
    expect(k.iperstaticita).toBe(1);
    expect(k.classificazione).toBe('labile e iperstatica');

    const cod = k.diagnosi.map((d) => d.codice);
    expect(cod).toContain('REAZIONI_PARALLELE');
    // il meccanismo è una traslazione orizzontale
    const m = k.meccanismi[0];
    expect(Math.abs(m.motoPerCorpo[0].phi)).toBeLessThan(1e-9);
    expect(Math.abs(m.motoPerCorpo[0].ux)).toBeGreaterThan(0.5);
  });

  it('reazioni CONCORRENTI in un punto: labile, con centro individuato', () => {
    // triangolo di aste rigide, tre bielle le cui rette passano tutte per l'origine
    const p = progetto('concorrenti');
    const a = p.nodo(0, 4);
    const b = p.nodo(-3, -2);
    const c = p.nodo(3, -2);
    p.asta(a, b, 'S355', 'SEZ');
    p.asta(b, c, 'S355', 'SEZ');
    p.asta(c, a, 'S355', 'SEZ');
    p.sezione(SEZ);
    // ogni biella è diretta lungo la congiungente nodo–origine
    // l'angolo è il PUNTAMENTO: û = (−sin α, cos α). Per una biella diretta
    // lungo θ si scrive α = θ − 90°.
    p.vincolo(a, 'biella', Math.atan2(4, 0) - Math.PI / 2);
    p.vincolo(b, 'biella', Math.atan2(-2, -3) - Math.PI / 2);
    p.vincolo(c, 'biella', Math.atan2(-2, 3) - Math.PI / 2);

    const k = analizzaCinematica(p.costruisci());
    expect(k.numeroCorpi).toBe(1);
    expect(k.gradiVincolo).toBe(3);
    expect(k.rango).toBe(2);
    expect(k.labilita).toBe(1);
    expect(k.iperstaticita).toBe(1);

    const d = k.diagnosi.find((x) => x.codice === 'REAZIONI_CONCORRENTI');
    expect(d).toBeDefined();
    expect(d!.evidenza).toMatchObject({ tipo: 'punto' });
    const ev = d!.evidenza as { x: number; y: number };
    expect(ev.x).toBeCloseTo(0, 6);
    expect(ev.y).toBeCloseTo(0, 6);

    // il meccanismo è una rotazione attorno all'origine
    const m = k.meccanismi[0];
    expect(m.cir[0].tipo).toBe('proprio');
    if (m.cir[0].tipo === 'proprio') {
      expect(m.cir[0].x).toBeCloseTo(0, 6);
      expect(m.cir[0].y).toBeCloseTo(0, 6);
    }
  });
});

describe('cerniere interne', () => {
  it('trave Gerber: due campate con una cerniera interna ⇒ isostatica', () => {
    // appoggi in 0, L, 2L con cerniera interna in mezzo alla seconda campata
    const { p, nodi, aste } = trave(12, 4);   // nodi a 0,3,6,9,12
    p.vincolo(nodi[0], 'cerniera');
    p.vincolo(nodi[2], 'carrello');
    p.vincolo(nodi[4], 'carrello');
    // cerniera interna nel nodo 3: svincolo il momento dell'asta successiva
    const prog = p.costruisci();
    prog.aste[3].svincolo.iniziale = { N: false, T: false, M: true };

    const k = analizzaCinematica(prog);
    expect(k.numeroCorpi).toBe(2);          // due tronchi rigidi
    expect(k.gradiLiberta).toBe(6);
    // 2 (cerniera) + 1 + 1 (carrelli) + 2 (continuità N,T alla cerniera interna)
    expect(k.gradiVincolo).toBe(6);
    expect(k.rango).toBe(6);
    expect(k.labilita).toBe(0);
    expect(k.iperstaticita).toBe(0);
    expect(k.classificazione).toBe('isostatica');
  });

  it('cerniera interna fra m aste: 2(m−1) gradi di vincolo', () => {
    // nodo centrale con 3 aste, due delle quali incernierate
    const p = progetto('nodo a 3 aste');
    const centro = p.nodo(0, 0);
    const e = p.nodo(3, 0);
    const n = p.nodo(0, 3);
    const w = p.nodo(-3, 0);
    p.asta(centro, e, 'S355', 'SEZ');
    p.asta(centro, n, 'S355', 'SEZ', { svincoloIniziale: { M: true } });
    p.asta(centro, w, 'S355', 'SEZ', { svincoloIniziale: { M: true } });
    p.sezione(SEZ);
    p.vincolo(e, 'incastro');
    p.vincolo(n, 'incastro');
    p.vincolo(w, 'incastro');

    const k = analizzaCinematica(p.costruisci());
    expect(k.numeroCorpi).toBe(3);
    // 3 incastri = 9 ; cerniera interna fra 3 aste = 2(3−1) = 4
    expect(k.gradiVincolo).toBe(13);
    expect(k.gradiLiberta).toBe(9);
    expect(k.rango).toBe(9);
    expect(k.labilita).toBe(0);
    expect(k.iperstaticita).toBe(4);
  });
});

describe('arco a tre cerniere', () => {
  it('ben disposto: isostatico', () => {
    const p = progetto('arco');
    const a = p.nodo(0, 0);
    const c = p.nodo(5, 3);      // chiave rialzata
    const b = p.nodo(10, 0);
    p.asta(a, c, 'S355', 'SEZ');
    p.asta(c, b, 'S355', 'SEZ', { svincoloIniziale: { M: true } });
    p.sezione(SEZ);
    p.vincolo(a, 'cerniera');
    p.vincolo(b, 'cerniera');

    const k = analizzaCinematica(p.costruisci());
    expect(k.numeroCorpi).toBe(2);
    expect(k.gradiLiberta).toBe(6);
    expect(k.gradiVincolo).toBe(6);   // 2+2 esterne + 2 continuità in chiave
    expect(k.labilita).toBe(0);
    expect(k.iperstaticita).toBe(0);
    expect(k.classificazione).toBe('isostatica');
  });

  it('tre cerniere ALLINEATE: labile (caso degenere)', () => {
    const p = progetto('arco degenere');
    const a = p.nodo(0, 0);
    const c = p.nodo(5, 0);      // chiave sulla stessa retta degli appoggi
    const b = p.nodo(10, 0);
    p.asta(a, c, 'S355', 'SEZ');
    p.asta(c, b, 'S355', 'SEZ', { svincoloIniziale: { M: true } });
    p.sezione(SEZ);
    p.vincolo(a, 'cerniera');
    p.vincolo(b, 'cerniera');

    const k = analizzaCinematica(p.costruisci());
    expect(k.gradiVincolo).toBe(6);
    expect(k.gradiLiberta).toBe(6);
    // il conteggio direbbe isostatica; l'allineamento la rende labile
    expect(k.rango).toBe(5);
    expect(k.labilita).toBe(1);
    expect(k.iperstaticita).toBe(1);
    expect(k.classificazione).toBe('labile e iperstatica');
  });
});

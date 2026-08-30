/** Telai, archi, travi Gerber, vincoli obliqui, Timoshenko. */

import { describe, it, expect } from 'vitest';
import {
  progetto, analizza, analizzaCaso, analizzaCinematica, rettangolare,
} from '../../src/core/index.js';
import type { LoadCaseId } from '../../src/core/model/types.js';

const CASO = 'principale' as LoadCaseId;
const E = 210e9;
const SEZ = rettangolare(0.10, 0.20, 'SEZ');
const EB = { teoria: 'eulero-bernoulli' as const };

describe('arco a tre cerniere', () => {
  it('spinta orizzontale H = qL²/(8f)', () => {
    const L = 10, f = 3, q = 5000;
    const p = progetto('arco a tre cerniere');
    const a = p.nodo(0, 0);
    const c = p.nodo(L / 2, f);
    const b = p.nodo(L, 0);
    const ac = p.asta(a, c, 'S355', 'SEZ', EB);
    const cb = p.asta(c, b, 'S355', 'SEZ', { ...EB, svincoloIniziale: { M: true } });
    p.sezione(SEZ);
    p.vincolo(a, 'cerniera');
    p.vincolo(b, 'cerniera');
    // carico uniforme verticale riferito alla PROIEZIONE ORIZZONTALE
    // carico verticale misurato in PROIEZIONE orizzontale, come la neve
    p.distribuito(ac, -q, { modo: 'globaleY', perProiezione: true });
    p.distribuito(cb, -q, { modo: 'globaleY', perProiezione: true });

    const r = analizzaCaso(p.costruisci(), CASO);
    const Ra = r.reazioni.find((x) => x.nodoId === a)!;
    const Rb = r.reazioni.find((x) => x.nodoId === b)!;

    expect(Ra.fy).toBeCloseTo((q * L) / 2, 6);
    expect(Rb.fy).toBeCloseTo((q * L) / 2, 6);
    expect(Ra.fx).toBeCloseTo((q * L ** 2) / (8 * f), 6);
    expect(Rb.fx).toBeCloseTo(-(q * L ** 2) / (8 * f), 6);
    expect(r.equilibrio.soddisfatto).toBe(true);

    // momento nullo nella cerniera in chiave
    const astaCB = r.aste[1];
    expect(Math.abs(astaCB.M[0])).toBeLessThan(1e-6);
  });
});

describe('telaio a portale', () => {
  it('piedi incernierati, forza orizzontale in testa: M in testa colonna = H·h/2', () => {
    const L = 6, h = 4, H = 20000;
    const p = progetto('portale');
    const p1 = p.nodo(0, 0);
    const t1 = p.nodo(0, h);
    const t2 = p.nodo(L, h);
    const p2 = p.nodo(L, 0);
    p.asta(p1, t1, 'S355', 'SEZ', EB);
    p.asta(t1, t2, 'S355', 'SEZ', EB);
    p.asta(t2, p2, 'S355', 'SEZ', EB);
    p.sezione(SEZ);
    p.vincolo(p1, 'cerniera');
    p.vincolo(p2, 'cerniera');
    p.forza(t1, H, 0);

    const r = analizzaCaso(p.costruisci(), CASO);
    const R1 = r.reazioni.find((x) => x.nodoId === p1)!;
    const R2 = r.reazioni.find((x) => x.nodoId === p2)!;

    // L'equilibrio orizzontale è ESATTO.
    expect(R1.fx + R2.fx).toBeCloseTo(-H, 6);

    // La ripartizione H/2 per colonna vale nell'ipotesi di TRAVERSO
    // ASSIALMENTE INDEFORMABILE, che il modello non fa: la trave si accorcia
    // di poco e i due traslanti differiscono. Lo scarto è dell'ordine del
    // rapporto fra rigidezza flessionale delle colonne e assiale del traverso
    // (qui ~1/7000), quindi si verifica in termini RELATIVI.
    expect(R1.fx / (-H / 2)).toBeCloseTo(1, 2);
    expect(R2.fx / (-H / 2)).toBeCloseTo(1, 2);

    // i piedi incernierati non trasmettono momento: questo è esatto
    expect(Math.abs(R1.mz)).toBeLessThan(1e-6);
    expect(Math.abs(R2.mz)).toBeLessThan(1e-6);

    // Le reazioni verticali formano la coppia che equilibra H·h (esatto).
    // Spingendo verso +x in testa, il telaio tende a ruotare in senso orario
    // attorno al piede destro: il piede SINISTRO viene sollevato e la sua
    // reazione è quindi rivolta verso il basso.
    expect(R1.fy).toBeCloseTo(-(H * h) / L, 5);
    expect(R2.fy).toBeCloseTo((H * h) / L, 5);

    // momento in testa alla colonna ≈ (H/2)·h, con lo stesso scarto
    const colonna = r.aste[0];
    const Mtesta = Math.abs(colonna.M[colonna.M.length - 1]);
    expect(Mtesta / ((H / 2) * h)).toBeCloseTo(1, 2);
    expect(r.equilibrio.soddisfatto).toBe(true);
  });

  it('piedi incastrati: iperstatico 3 volte, equilibrio verificato', () => {
    const L = 6, h = 4, q = 25000;
    const p = progetto('portale incastrato');
    const p1 = p.nodo(0, 0);
    const t1 = p.nodo(0, h);
    const t2 = p.nodo(L, h);
    const p2 = p.nodo(L, 0);
    p.asta(p1, t1, 'S355', 'SEZ', EB);
    const trave = p.asta(t1, t2, 'S355', 'SEZ', EB);
    p.asta(t2, p2, 'S355', 'SEZ', EB);
    p.sezione(SEZ);
    p.vincolo(p1, 'incastro');
    p.vincolo(p2, 'incastro');
    p.distribuito(trave, -q);

    const prog = p.costruisci();
    const k = analizzaCinematica(prog);
    expect(k.iperstaticita).toBe(3);
    expect(k.labilita).toBe(0);

    const r = analizzaCaso(prog, CASO);
    expect(r.reazioni.reduce((s, x) => s + x.fy, 0)).toBeCloseTo(q * L, 5);
    expect(r.reazioni.reduce((s, x) => s + x.fx, 0)).toBeCloseTo(0, 5);
    expect(r.equilibrio.soddisfatto).toBe(true);

    // simmetria: i due incastri devono dare reazioni verticali uguali
    const R1 = r.reazioni.find((x) => x.nodoId === p1)!;
    const R2 = r.reazioni.find((x) => x.nodoId === p2)!;
    expect(R1.fy).toBeCloseTo(R2.fy, 6);
    expect(R1.mz).toBeCloseTo(-R2.mz, 6);
  });
});

describe('trave Gerber', () => {
  it('isostatica: momento nullo nella cerniera, reazioni da equilibrio', () => {
    // Campata AB = 8 m appoggiata, sbalzo con cerniera a 6 m, appoggio C a 12 m
    const q = 4000;
    const p = progetto('gerber');
    const A = p.nodo(0, 0);
    const G = p.nodo(6, 0);      // cerniera interna
    const B = p.nodo(8, 0);
    const C = p.nodo(12, 0);
    const a1 = p.asta(A, G, 'S355', 'SEZ', EB);
    const a2 = p.asta(G, B, 'S355', 'SEZ', { ...EB, svincoloIniziale: { M: true } });
    const a3 = p.asta(B, C, 'S355', 'SEZ', EB);
    p.sezione(SEZ);
    p.vincolo(A, 'cerniera');
    p.vincolo(B, 'carrello');
    p.vincolo(C, 'carrello');
    for (const a of [a1, a2, a3]) p.distribuito(a, -q);

    const prog = p.costruisci();
    const k = analizzaCinematica(prog);
    expect(k.classificazione).toBe('isostatica');

    const r = analizzaCaso(prog, CASO);
    // momento nullo nella cerniera interna
    expect(Math.abs(r.aste[1].M[0])).toBeLessThan(1e-6);
    // equilibrio verticale
    expect(r.reazioni.reduce((s, x) => s + x.fy, 0)).toBeCloseTo(q * 12, 5);

    // il tratto A–G è una trave appoggiata di luce 6 con appoggio a sinistra:
    // essendo isostatico, la reazione in A vale q·6/2 = 12 kN
    const Ra = r.reazioni.find((x) => x.nodoId === A)!;
    expect(Ra.fy).toBeCloseTo((q * 6) / 2, 5);
  });
});

describe('vincoli obliqui', () => {
  it('carrello su piano inclinato: la reazione è normale al piano', () => {
    const L = 4, P = 10000;
    const alpha = Math.PI / 6;             // piano di scorrimento a 30°
    const p = progetto('carrello inclinato');
    const a = p.nodo(0, 0);
    const b = p.nodo(L, 0);
    p.asta(a, b, 'S355', 'SEZ', EB);
    p.sezione(SEZ);
    p.vincolo(a, 'cerniera');
    p.vincolo(b, 'carrello', alpha);
    p.forza(b, 0, -P);

    const r = analizzaCaso(p.costruisci(), CASO);
    const Rb = r.reazioni.find((x) => x.nodoId === b)!;
    // la reazione deve essere diretta come la normale al piano: (−sinα, cosα)
    const angoloReazione = Math.atan2(Rb.fy, Rb.fx);
    const normale = Math.atan2(Math.cos(alpha), -Math.sin(alpha));
    const scarto = Math.abs(Math.sin(angoloReazione - normale));
    expect(scarto).toBeLessThan(1e-9);
    expect(r.equilibrio.soddisfatto).toBe(true);
  });

  it('biella inclinata: blocca lo spostamento lungo û, come ogni direzionale', () => {
    // L'angolo è il PUNTAMENTO, non l'asse disegnato: û = (−sin α, cos α), ed
    // è la stessa direzione che blocca il carrello con lo stesso angolo. È la
    // convenzione unica — se la biella avesse la sua, lo stesso numero
    // significherebbe due cose diverse.
    const alpha = Math.PI / 4;
    const p = progetto('biella');
    const a = p.nodo(0, 0);
    const b = p.nodo(3, 0);
    p.asta(a, b, 'S355', 'SEZ', EB);
    p.sezione(SEZ);
    p.vincolo(a, 'incastro');
    p.vincolo(b, 'biella', alpha);
    p.forza(b, 5000, 5000);

    const r = analizzaCaso(p.costruisci(), CASO);
    const ux = r.spostamenti[3 * 1];
    const uy = r.spostamenti[3 * 1 + 1];
    const lungoU = ux * -Math.sin(alpha) + uy * Math.cos(alpha);
    expect(Math.abs(lungoU)).toBeLessThan(1e-12);
  });

  it('biella e carrello con lo stesso angolo bloccano la STESSA direzione', () => {
    // il test che il §1.3 chiede esplicitamente, in forma numerica
    const alpha = (2 * Math.PI) / 5;         // un angolo qualunque, non notevole
    const provaCon = (tipo: 'biella' | 'carrello') => {
      const p = progetto(tipo);
      const a = p.nodo(0, 0);
      const b = p.nodo(3, 0);
      p.asta(a, b, 'S355', 'SEZ', EB);
      p.sezione(SEZ);
      p.vincolo(a, 'incastro');
      p.vincolo(b, tipo, alpha);
      p.forza(b, 5000, 5000);
      const r = analizzaCaso(p.costruisci(), CASO);
      return [r.spostamenti[3], r.spostamenti[4], r.spostamenti[5]];
    };
    const biella = provaCon('biella');
    const carrello = provaCon('carrello');
    for (let i = 0; i < 3; i++) {
      expect(biella[i]).toBeCloseTo(carrello[i], 12);
    }
  });
});

describe('teoria di Timoshenko', () => {
  it('trave tozza: freccia maggiorata del contributo di taglio', () => {
    // mensola molto tozza: L/h = 4
    const L = 0.8, P = 50000;
    const sez = rettangolare(0.1, 0.2, 'TOZZA');
    const p = progetto('tozza');
    const a = p.nodo(0, 0);
    const b = p.nodo(L, 0);
    p.asta(a, b, 'S355', 'TOZZA', { teoria: 'timoshenko' });
    p.sezione(sez);
    p.vincolo(a, 'incastro');
    p.forza(b, 0, -P);

    const r = analizzaCaso(p.costruisci(), CASO);
    const uy = r.spostamenti[3 * 1 + 1];

    const G = E / (2 * (1 + 0.3));
    const Av = sez.Av!;
    const attesa = -((P * L ** 3) / (3 * E * sez.I) + (P * L) / (G * Av));
    expect(uy).toBeCloseTo(attesa, 10);

    // e deve risultare più cedevole di Eulero-Bernoulli
    const soloFlessione = -(P * L ** 3) / (3 * E * sez.I);
    expect(Math.abs(uy)).toBeGreaterThan(Math.abs(soloFlessione));
  });

  it('selettore automatico: avvisa e usa Timoshenko sotto L/h = 10', () => {
    const sez = rettangolare(0.1, 0.5, 'ALTA');
    const p = progetto('auto');
    const a = p.nodo(0, 0);
    const b = p.nodo(2, 0);            // L/h = 4
    p.asta(a, b, 'S355', 'ALTA');      // teoria 'auto'
    p.sezione(sez);
    p.vincolo(a, 'incastro');
    p.forza(b, 0, -1000);

    const esito = analizza(p.costruisci());
    expect(esito.avvisi.some((a) => a.includes('Timoshenko'))).toBe(true);
  });
});

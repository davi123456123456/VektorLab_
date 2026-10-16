import { afterAll, describe, expect, it } from 'vitest';
import { PonteFoto } from '../../src/foto/app/ponte.js';
import type { Risposta } from '../../src/foto/app/protocollo.js';
import { MESSAGGI } from '../../src/foto/app/servizio.js';

class WorkerFinto {
  static creati: WorkerFinto[] = [];
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  inviati: unknown[] = [];
  terminato = false;
  constructor() { WorkerFinto.creati.push(this); }
  postMessage(m: unknown) { this.inviati.push(m); }
  terminate() { this.terminato = true; }
}
const originale = (globalThis as { Worker?: unknown }).Worker;
(globalThis as { Worker?: unknown }).Worker = WorkerFinto;
afterAll(() => { (globalThis as { Worker?: unknown }).Worker = originale; });

const foto = (id: number) => ({ tipo: 'foto' as const, id, dati: new Uint8Array(4), larghezza: 2, altezza: 2 });

describe('il ponte verso il worker', () => {
  it('se il worker non parte (niente rete al primo uso) lo butta e alla prossima foto ne crea uno nuovo', () => {
    const p = new PonteFoto();
    const risposte: Risposta[] = [];
    p.ascolta((r) => risposte.push(r));
    p.invia(foto(3));
    const primo = WorkerFinto.creati.at(-1)!;
    primo.onerror!(new Event('error'));
    expect(risposte).toEqual([{ id: 3, tipo: 'errore', messaggio: MESSAGGI.senzaRete }]);
    expect(primo.terminato).toBe(true);
    p.invia(foto(4));
    expect(WorkerFinto.creati.at(-1)).not.toBe(primo);
    expect(WorkerFinto.creati.at(-1)!.inviati).toEqual([foto(4)]);
  });

  it('dimentica senza worker non lo crea (niente da dimenticare)', () => {
    const prima = WorkerFinto.creati.length;
    new PonteFoto().invia({ tipo: 'dimentica' });
    expect(WorkerFinto.creati.length).toBe(prima);
  });
});

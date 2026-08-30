/**
 * Operazioni modali. La parte critica è l'inserimento numerico: `G X 2.5`
 * deve produrre esattamente 2,5 m, non "circa quanto ha mosso il mouse".
 */

import { describe, it, expect } from 'vitest';
import { accumulaDigitato, calcolaAnteprima, istantaneaNodi } from '../../src/state/operazioni.js';
import { progetto } from '../../src/core/builder.js';
import type { Operazione } from '../../src/state/store.js';
import type { NodeId } from '../../src/core/model/types.js';

function base(tipo: 'sposta' | 'ruota' | 'scala', digitato = '', asse: 'x' | 'y' | null = null): Operazione {
  const p = progetto('t');
  const a = p.nodo(0, 0);
  const b = p.nodo(2, 0);
  const c = p.nodo(2, 2);
  const prog = p.costruisci();
  return {
    tipo,
    inizialiNodi: istantaneaNodi(prog, [a, b, c]),
    origine: { x: 0, y: 0 },
    centro: { x: 4 / 3, y: 2 / 3 },
    asse, digitato, valore: 0, duplica: false,
  };
}

const nodi = (op: Operazione) =>
  op.tipo === 'sposta' || op.tipo === 'ruota' || op.tipo === 'scala'
    ? [...op.inizialiNodi.keys()] : [];

describe('spostamento', () => {
  it('segue il mouse quando non si digita nulla', () => {
    const op = base('sposta');
    const a = calcolaAnteprima(op, { x: 3, y: -1 })!;
    const id = nodi(op)[0];
    expect(a.posizioni.get(id)).toEqual({ x: 3, y: -1 });
  });

  it('il vincolo di asse azzera l\'altra componente', () => {
    const opX = base('sposta', '', 'x');
    const ax = calcolaAnteprima(opX, { x: 3, y: -1 })!;
    expect(ax.posizioni.get(nodi(opX)[0])).toEqual({ x: 3, y: 0 });

    const opY = base('sposta', '', 'y');
    const ay = calcolaAnteprima(opY, { x: 3, y: -1 })!;
    expect(ay.posizioni.get(nodi(opY)[0])).toEqual({ x: 0, y: -1 });
  });

  it('il valore digitato con asse vincolato è esatto e ignora il mouse', () => {
    const op = base('sposta', '2.5', 'x');
    const a = calcolaAnteprima(op, { x: 137, y: -42 })!;
    const p = a.posizioni.get(nodi(op)[0])!;
    expect(p.x).toBeCloseTo(2.5, 12);
    expect(p.y).toBeCloseTo(0, 12);
    expect(a.descrizione).toContain('2.500');
  });

  it('senza asse vincolato il numero è la distanza nella direzione corrente', () => {
    const op = base('sposta', '5');
    // mouse a 45°: lo spostamento è 5 m in quella direzione
    const a = calcolaAnteprima(op, { x: 1, y: 1 })!;
    const p = a.posizioni.get(nodi(op)[0])!;
    expect(Math.hypot(p.x, p.y)).toBeCloseTo(5, 12);
    expect(p.x).toBeCloseTo(p.y, 12);
  });

  it('tutti i nodi si spostano dello stesso vettore', () => {
    const op = base('sposta', '3', 'x');
    const a = calcolaAnteprima(op, { x: 0, y: 0 })!;
    const ids = nodi(op);
    expect(a.posizioni.get(ids[0])).toEqual({ x: 3, y: 0 });
    expect(a.posizioni.get(ids[1])).toEqual({ x: 5, y: 0 });
    expect(a.posizioni.get(ids[2])).toEqual({ x: 5, y: 2 });
  });
});

describe('rotazione', () => {
  it('il valore digitato è in GRADI', () => {
    const op = { ...base('ruota', '90'), centro: { x: 0, y: 0 } } as Operazione;
    const a = calcolaAnteprima(op, { x: 1, y: 0 })!;
    const ids = nodi(op);
    const p = a.posizioni.get(ids[1])!;   // era (2,0)
    expect(p.x).toBeCloseTo(0, 12);
    expect(p.y).toBeCloseTo(2, 12);
    expect(a.descrizione).toContain('90.00°');
  });

  it('il centro resta fermo', () => {
    const op = { ...base('ruota', '37'), centro: { x: 2, y: 0 } } as Operazione;
    const a = calcolaAnteprima(op, { x: 1, y: 1 })!;
    const p = a.posizioni.get(nodi(op)[1])!;   // il nodo che sta nel centro
    expect(p.x).toBeCloseTo(2, 12);
    expect(p.y).toBeCloseTo(0, 12);
  });

  it('conserva le lunghezze', () => {
    const op = { ...base('ruota', '23.5'), centro: { x: 0, y: 0 } } as Operazione;
    const a = calcolaAnteprima(op, { x: 1, y: 0 })!;
    const ids = nodi(op);
    const p1 = a.posizioni.get(ids[1])!;
    const p2 = a.posizioni.get(ids[2])!;
    expect(Math.hypot(p2.x - p1.x, p2.y - p1.y)).toBeCloseTo(2, 12);
  });
});

describe('scala', () => {
  it('il valore digitato è il fattore', () => {
    const op = { ...base('scala', '2'), centro: { x: 0, y: 0 } } as Operazione;
    const a = calcolaAnteprima(op, { x: 1, y: 0 })!;
    const ids = nodi(op);
    expect(a.posizioni.get(ids[1])).toEqual({ x: 4, y: 0 });
    expect(a.posizioni.get(ids[2])).toEqual({ x: 4, y: 4 });
  });

  it('con asse vincolato scala in una sola direzione', () => {
    const op = { ...base('scala', '3', 'x'), centro: { x: 0, y: 0 } } as Operazione;
    const a = calcolaAnteprima(op, { x: 1, y: 0 })!;
    expect(a.posizioni.get(nodi(op)[2])).toEqual({ x: 6, y: 2 });
  });
});

describe('accumulo delle cifre digitate', () => {
  it('accetta cifre, punto e virgola, e il segno meno', () => {
    expect(accumulaDigitato('', '2')).toBe('2');
    expect(accumulaDigitato('2', '5')).toBe('25');
    expect(accumulaDigitato('25', '.')).toBe('25.');
    expect(accumulaDigitato('25.', '3')).toBe('25.3');
    expect(accumulaDigitato('25.3', ',')).toBe('25.3');   // un solo separatore
    expect(accumulaDigitato('25.3', '-')).toBe('-25.3');
    expect(accumulaDigitato('-25.3', '-')).toBe('25.3');  // il meno commuta
    expect(accumulaDigitato('25.3', 'Backspace')).toBe('25.');
  });

  it('ignora i tasti non pertinenti', () => {
    for (const k of ['a', 'Enter', 'Escape', 'F5', 'Shift']) {
      expect(accumulaDigitato('1', k)).toBeNull();
    }
  });

  it('un numero incompleto non viene interpretato', () => {
    const op = base('sposta', '-', 'x');
    const a = calcolaAnteprima(op, { x: 7, y: 0 })!;
    // finché c'è solo il segno, si continua a seguire il mouse
    expect(a.posizioni.get(nodi(op)[0])!.x).toBeCloseTo(7, 12);
  });
});

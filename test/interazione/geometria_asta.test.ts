/**
 * Lunghezza e inclinazione di un'asta scritte a mano (dal telefono, nella
 * barra della selezione).
 *
 * La regola: il nodo INIZIALE resta dov'è e si sposta il FINALE, che porta
 * con sé le altre aste che vi arrivano — come trascinarlo. L'inclinazione è
 * quella che l'anteprima mostra mentre si disegna: gradi dall'asse x, in
 * senso antiorario.
 */

import { describe, it, expect } from 'vitest';
import { progetto } from '../../src/core/builder.js';
import { geometriaAsta, impostaGeometriaAsta } from '../../src/state/commands.js';
import type { ElementId, Progetto } from '../../src/core/model/types.js';

function mensola(): { p: Progetto; asta: ElementId } {
  const b = progetto('mensola');
  const a = b.nodo(1, 2);
  const c = b.nodo(4, 2);
  const d = b.nodo(4, 0);
  b.asta(a, c, 'S275', 'IPE 300');
  b.asta(c, d, 'S275', 'IPE 300');
  const p = b.costruisci();
  return { p, asta: p.aste[0].id };
}

const nodo = (p: Progetto, id: string) => p.nodi.find((n) => n.id === id)!;

describe('lunghezza e inclinazione di un\'asta', () => {
  it('si leggono dalla posizione dei nodi', () => {
    const { p, asta } = mensola();
    const g = geometriaAsta(p, asta)!;
    expect(g.lunghezza).toBeCloseTo(3, 12);
    expect(g.gradi).toBeCloseTo(0, 12);
  });

  it('cambiarle sposta il nodo finale e lascia fermo l\'iniziale', () => {
    const { p, asta } = mensola();
    const a = p.aste[0];
    const cmd = impostaGeometriaAsta(p, asta, 2, 30)!;
    const dopo = cmd.esegui(p);
    expect(nodo(dopo, a.nodoIniziale).x).toBeCloseTo(1, 12);
    expect(nodo(dopo, a.nodoIniziale).y).toBeCloseTo(2, 12);
    expect(nodo(dopo, a.nodoFinale).x).toBeCloseTo(1 + Math.sqrt(3), 12);
    expect(nodo(dopo, a.nodoFinale).y).toBeCloseTo(3, 12);
    const g = geometriaAsta(dopo, asta)!;
    expect(g.lunghezza).toBeCloseTo(2, 12);
    expect(g.gradi).toBeCloseTo(30, 12);
  });

  it('annullare riporta il nodo esattamente dov\'era', () => {
    const { p, asta } = mensola();
    const cmd = impostaGeometriaAsta(p, asta, 5, -90)!;
    expect(JSON.stringify(cmd.annulla(cmd.esegui(p)))).toBe(JSON.stringify(p));
  });

  it('una lunghezza nulla o negativa non è un\'asta: nessun comando', () => {
    const { p, asta } = mensola();
    expect(impostaGeometriaAsta(p, asta, 0, 0)).toBeNull();
    expect(impostaGeometriaAsta(p, asta, -2, 0)).toBeNull();
    expect(impostaGeometriaAsta(p, asta, Number.NaN, 0)).toBeNull();
  });
});

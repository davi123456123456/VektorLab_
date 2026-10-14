/**
 * Esercizi veri ricostruiti come li vedrebbe una rete perfetta. Ognuno è
 * disegnato un po' storto (le quote correggono), e deve dare esattamente il
 * modello atteso anche ingrandito, rimpicciolito o ruotato di qualche grado.
 */

import { describe, it, expect } from 'vitest';
import { progetto } from '../../src/core/builder.js';
import { analizzaCinematica } from '../../src/core/index.js';
import type { Progetto } from '../../src/core/model/types.js';
import { confronta } from '../../src/foto/confronto.js';
import { leggi } from '../../src/foto/index.js';
import { disegno, RAGGIO, type Disegno } from './aiuti.js';

const MAT = 'S275';
const SEZ = 'IPE 300';
const G = Math.PI / 180;

interface Esercizio { nome: string; disegna: (d: Disegno) => Disegno; atteso: () => Progetto }

const esercizi: Esercizio[] = [
  {
    nome: '19 — trave con F in A, carrello, cerniera, carrello',
    disegna: (d) => d.asta(0, 0, 3.05, 0)
      .appoggio('triangoloRulli', 1.15, 0, 0).appoggio('triangolo', 1.95, 0, 0)
      .appoggio('triangoloRulli', 3.05, 0, 0)
      .freccia(0, 0, -90).scritta('F', 1, 0, 0.55)
      .quota(1, 0, -0.6, 1.15, -0.6).quota(1, 1.15, -0.6, 1.95, -0.6).quota(1, 1.95, -0.6, 3.05, -0.6),
    atteso: () => {
      const p = progetto('19');
      const a = p.nodo(0, 0);
      const d = p.nodo(3, 0);
      const ad = p.asta(a, d, MAT, SEZ);
      p.vincoloSuAsta(ad, 1 / 3, 'carrello');
      p.vincoloSuAsta(ad, 2 / 3, 'cerniera');
      p.vincolo(d, 'carrello');
      p.forza(a, 0, -1000);
      return p.costruisci();
    },
  },
  {
    nome: '20 — telaio con diagonale incernierata in B, cerniera in D, q su D–E',
    disegna: (d) => d
      .asta(0, 0, 0, 2.1).asta(0, 2.1, 1.1, 2.1).asta(1.1, 2.1, 2.2, 2.1).asta(2.2, 2.1, 2.2, 0)
      .asta(RAGGIO, 1, 2.2, 0)
      .cerniera(RAGGIO, 1).cerniera(1.1, 2.1)
      .appoggio('triangolo', 0, 0, 0, { interrompe: true })
      .appoggio('triangoloRulli', 2.2, 0, 0, { interrompe: true })
      .distribuito(1.1, 2.1, 2.2, 2.1, -90).scritta('q', 1, 1.65, 2.7)
      .quota(1, -0.4, 0, -0.4, 1).quota(1, -0.4, 1, -0.4, 2.1)
      .quota(1, 0, 2.1, 1.1, 2.1).quota(1, 1.1, 2.1, 2.2, 2.1),
    atteso: () => {
      const p = progetto('20');
      const A = p.nodo(0, 0);
      const B = p.nodo(0, 1);
      const C = p.nodo(0, 2);
      const D = p.nodo(1, 2);
      const E = p.nodo(2, 2);
      const Gn = p.nodo(2, 0);
      const ab = p.asta(A, B, MAT, SEZ);
      p.asta(B, C, MAT, SEZ);
      p.asta(C, D, MAT, SEZ);
      const de = p.asta(D, E, MAT, SEZ);
      p.asta(E, Gn, MAT, SEZ);
      const bg = p.asta(B, Gn, MAT, SEZ);
      p.vincolo(A, 'cerniera');
      p.vincolo(Gn, 'carrello');
      p.sconnessioneNodale(B, 'cerniera', { astaMaster: ab, asteSvincolate: [bg] });
      p.sconnessioneNodale(D, 'cerniera');
      p.sconnessioneNodale(Gn, 'cerniera');
      p.distribuito(de, -1000);
      return p.costruisci();
    },
  },
  {
    nome: '24 — incastro in A, momento in campata, cerniera nello spigolo B, cerniera a soffitto in C',
    disegna: (d) => d
      .asta(0, 0, 1.9, 0).asta(1.9, 0, 1.9, 1.1).cerniera(1.9, 0)
      .appoggio('incastro', 0, 0, 270, { pallino: false })
      .appoggio('triangolo', 1.9, 1.1, 180, { interrompe: true })
      .momento(0.9, 0, 'orario').scritta('M', 1, 0.9, -0.45)
      .quota(1, 0, 0, 0.9, 0).quota(1, 0.9, 0, 1.9, 0).quota(1, 1.9, 0, 1.9, 1.1),
    atteso: () => {
      const p = progetto('24');
      const A = p.nodo(0, 0);
      const B = p.nodo(2, 0);
      const C = p.nodo(2, 1);
      const ab = p.asta(A, B, MAT, SEZ);
      p.asta(B, C, MAT, SEZ);
      p.vincolo(A, 'incastro', 270 * G);
      p.vincolo(C, 'cerniera', 180 * G);
      p.sconnessioneNodale(B, 'cerniera');
      p.momentoInCampata(ab, 0.5, -1000);
      return p.costruisci();
    },
  },
  {
    nome: '16 — due incastri, tre carrelli, q giù e q su affiancati',
    disegna: (d) => d.asta(0, 0, 4, 0)
      .appoggio('incastro', 0, 0, 270, { pallino: false })
      .appoggio('incastro', 4, 0, 90, { pallino: false })
      .appoggio('triangoloRulli', 1, 0, 0).appoggio('triangoloRulli', 2, 0, 0)
      .appoggio('triangoloRulli', 3, 0, 0)
      .distribuito(1, 0, 1.95, 0, -90).scritta('q', 1, 1.5, 0.6)
      .distribuito(2.05, 0, 3, 0, 90, { punte: false }).scritta('q', 1, 2.5, 0.6)
      .quota(1, 0, -0.5, 1, -0.5).quota(1, 1, -0.5, 2, -0.5)
      .quota(1, 2, -0.5, 3, -0.5).quota(1, 3, -0.5, 4, -0.5),
    atteso: () => {
      const p = progetto('16');
      const a = p.nodo(0, 0);
      const b = p.nodo(4, 0);
      const t = p.asta(a, b, MAT, SEZ);
      p.vincolo(a, 'incastro', 270 * G);
      p.vincolo(b, 'incastro', 90 * G);
      for (const s of [0.25, 0.5, 0.75]) p.vincoloSuAsta(t, s, 'carrello');
      p.distribuito(t, -1000, { s1: 0.25, s2: 0.5 });
      p.distribuito(t, 1000, { s1: 0.5, s2: 0.75 });
      return p.costruisci();
    },
  },
];

describe.each(esercizi)('esercizio $nome', ({ disegna, atteso }) => {
  const verifica = (d: Disegno): void => {
    const { progetto: letto } = leggi(disegna(d).primitive());
    const c = confronta(letto, atteso());
    expect(c.differenze).toEqual([]);
    expect(c.perfetto).toBe(true);
  };

  it('si legge esattamente', () => verifica(disegno()));
  it('si legge uguale a 40 px per L', () => verifica(disegno(40)));
  it('si legge uguale a 400 px per L', () => verifica(disegno(400)));
  it('si legge uguale ruotato di 3°', () => verifica(disegno().ruota(3)));
  it('il modello letto si analizza senza eccezioni', () => {
    const { progetto: letto } = leggi(disegna(disegno()).primitive());
    expect(() => analizzaCinematica(letto)).not.toThrow();
  });
});

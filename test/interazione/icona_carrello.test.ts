/**
 * §2 (iterazione 11-bis) — IL CARRELLO INTERNO.
 *
 * Il punto era già stato chiesto e non aveva attecchito, e il motivo stava
 * nella struttura: il simbolo aveva un disegno tutto suo, e accanto al
 * catalogo sopravvivevano due elenchi scritti a mano che ripetevano nomi e
 * gradi. Correggere il catalogo non cambiava ciò che si vedeva.
 *
 * Questi test fissano le tre cose che devono restare vere: il simbolo è la
 * «Cerniera» con due rulli e non un secondo disegno; i rulli sono esattamente
 * due; e non esiste più un secondo elenco da cui l'interfaccia possa pescare.
 */

import { describe, it, expect } from 'vitest';
import {
  CATALOGO_VINCOLI, definizioneVincolo, vincoliDi,
} from '../../src/core/model/catalogoVincoli.js';
import {
  VINCOLI_DISPONIBILI, disegnaCernieraSconnessa, nomeVincolo,
} from '../../src/render/simboli.js';

/**
 * Contesto di disegno finto che registra i cerchi.
 *
 * Contare gli `arc` è il modo diretto di verificare «esattamente due rulli»:
 * uno screenshot lo mostra, ma non lo difende dalla prossima modifica.
 */
function contesto() {
  const archi: { x: number; y: number; r: number }[] = [];
  const segmenti: { da: [number, number]; a: [number, number] }[] = [];
  let penna: [number, number] = [0, 0];
  const ctx = {
    save() {}, restore() {}, translate() {}, rotate() {}, scale() {},
    beginPath() {}, closePath() {}, fill() {}, stroke() {},
    lineWidth: 0, lineJoin: '', strokeStyle: '', fillStyle: '',
    moveTo(x: number, y: number) { penna = [x, y]; },
    lineTo(x: number, y: number) { segmenti.push({ da: penna, a: [x, y] }); penna = [x, y]; },
    arc(x: number, y: number, r: number) { archi.push({ x, y, r }); },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, archi, segmenti };
}

function disegna(conRulli: boolean) {
  const { ctx, archi, segmenti } = contesto();
  disegnaCernieraSconnessa(ctx, { x: 0, y: 0 }, 0, '#f00', '#000', '#ccc',
    false, 1, true, conRulli);
  return { archi, segmenti };
}

describe('§2.1 — il simbolo', () => {
  const cerniera = disegna(false);
  const carrello = disegna(true);

  it('il carrello interno è la «Cerniera» con due cerchietti in più', () => {
    expect(carrello.archi.length - cerniera.archi.length).toBe(2);
  });

  it('i due cerchietti in più sono uguali fra loro e simmetrici', () => {
    const rulli = carrello.archi.filter(
      (a) => !cerniera.archi.some((b) => b.x === a.x && b.y === a.y && b.r === a.r),
    );
    expect(rulli.length).toBe(2);
    expect(rulli[0].r).toBe(rulli[1].r);
    expect(rulli[0].y).toBe(rulli[1].y);
    expect(rulli[0].x).toBe(-rulli[1].x);
  });

  it('stanno FRA la base del triangolo e la linea inferiore', () => {
    const rulli = carrello.archi.filter(
      (a) => !cerniera.archi.some((b) => b.x === a.x && b.y === a.y && b.r === a.r),
    );
    // la base del triangolo è il segmento orizzontale più in basso del
    // triangolo stesso; la linea inferiore è il piano di scorrimento
    const orizzontali = carrello.segmenti
      .filter((s) => s.da[1] === s.a[1])
      .map((s) => s.da[1])
      .sort((a, b) => a - b);
    const base = orizzontali.find((y) => y > 0)!;
    const inferiore = orizzontali[orizzontali.length - 1];
    for (const r of rulli) {
      expect(r.y).toBeGreaterThan(base);
      expect(r.y).toBeLessThan(inferiore);
    }
  });

  it('il perno resta uno solo, e non è un rullo', () => {
    const perni = carrello.archi.filter((a) => a.x === 0 && a.y === 0);
    expect(perni.length).toBe(1);
  });

  it('l icona del carrello interno È quella della Cerniera, non un altro disegno', () => {
    const c = definizioneVincolo('carrelloInterno')!;
    const cerniera2 = definizioneVincolo('cernieraSconnessa')!;
    expect(c.icona.genere).toBe(cerniera2.icona.genere);
    expect(c.icona).toEqual({ ...cerniera2.icona, rulli: true });
  });
});

describe('§2.2 — l ordine dei vincoli interni', () => {
  it('il carrello interno è il TERZO', () => {
    expect(vincoliDi('interno').map((v) => v.nome)).toEqual([
      'Cerniera interna',
      'Cerniera',
      'Carrello interno',
      'Doppio pendolo interno',
      'Pattino interno',
    ]);
  });
});

describe('§2.2 — un solo elenco', () => {
  it('VINCOLI_DISPONIBILI è derivato dal catalogo, non scritto a parte', () => {
    expect(VINCOLI_DISPONIBILI.map((v) => v.nome))
      .toEqual(vincoliDi('telaio').map((v) => v.nome));
  });

  it('i gradi coincidono con quelli del catalogo', () => {
    for (const v of vincoliDi('telaio')) {
      const d = VINCOLI_DISPONIBILI.find((x) => x.nome === v.nome)!;
      expect(d.gradi).toBe(Number.parseInt(v.gdv, 10) || 0);
    }
  });

  it('nomeVincolo pesca dal catalogo, per ogni sconnessione interna', () => {
    // il carrello interno c'è: nell'elenco parallelo mancava del tutto
    expect(nomeVincolo('carrelloInterno', 'interno')).toBe('Carrello interno');
    expect(nomeVincolo('cerniera', 'interno')).toBe('Cerniera interna');
    expect(nomeVincolo('bipendolo', 'interno')).toBe('Doppio pendolo interno');
    expect(nomeVincolo('pattino', 'interno')).toBe('Pattino interno');
  });

  it('e per i vincoli a telaio', () => {
    expect(nomeVincolo('cerniera', 'esterno')).toBe('Cerniera a telaio');
    expect(nomeVincolo('carrello', 'esterno')).toBe('Carrello');
    expect(nomeVincolo('incastro', 'esterno')).toBe('Incastro');
    expect(nomeVincolo('molla', 'esterno')).toBe('Molla');
  });

  it('ogni voce interna dichiara a quale sconnessione corrisponde', () => {
    for (const v of vincoliDi('interno')) expect(v.sconnessione).toBeDefined();
  });

  it('nessuna voce del catalogo resta senza icona o senza nome', () => {
    for (const v of CATALOGO_VINCOLI) {
      expect(v.nome.length).toBeGreaterThan(0);
      expect(v.icona.genere).toBeTruthy();
    }
  });
});

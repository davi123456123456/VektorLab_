import { describe, expect, it } from 'vitest';
import type { Riconoscimento } from '../../src/foto/rete/riconosci.js';
import { svg, tabella, type RigaValuta } from '../../strumenti/foto/valutaFormato.js';

const vuote = { aste: { attesi: 0, trovati: 0, giusti: 0 }, vincoli: { attesi: 0, trovati: 0, giusti: 0 },
  orientamenti: { attesi: 0, trovati: 0, giusti: 0 }, sconnessioni: { attesi: 0, trovati: 0, giusti: 0 },
  carichi: { attesi: 0, trovati: 0, giusti: 0 } };

describe('foto:valuta', () => {
  it('tabella: media delle correzioni e perfetti per metà', () => {
    const righe: RigaValuta[] = [
      { nome: '01', meta: 'sviluppo', esito: 'ok', correzioni: 0, perfetto: true, perCategoria: vuote, differenze: [], avvisi: [], ms: 900 },
      { nome: '02', meta: 'sviluppo', esito: 'ok', correzioni: 3, perfetto: false, perCategoria: vuote, differenze: ['x'], avvisi: [], ms: 1100 },
    ];
    const t = tabella(righe);
    expect(t).toContain('sviluppo');
    expect(t).toMatch(/media 1[.,]50/);
    expect(t).toMatch(/perfetti 1\/2/);
  });

  it('svg: foto per riferimento, riquadro e un elemento per primitiva', () => {
    const r: Riconoscimento = {
      esito: 'ok', angolo: 0, figure: [{ x0: 10, y0: 10, x1: 200, y1: 150 }], riquadro: { x0: 10, y0: 10, x1: 200, y1: 150 },
      ritaglio: { origine: { x: 0, y: 0 }, scala: 2 },
      primitive: {
        larghezza: 400, altezza: 300,
        aste: [{ a: { x: 10, y: 10 }, b: { x: 100, y: 10 }, spessore: 3, confidenza: 1 }],
        pallini: [{ c: { x: 50, y: 50 }, r: 5, confidenza: 1 }],
        corpi: [{ tipo: 'triangolo', attacco: { x: 10, y: 10 }, angolo: 0, confidenza: 1 }],
        frecce: [{ punta: { x: 60, y: 20 }, direzione: -Math.PI / 2, lunghezza: 30, confidenza: 1 }],
        momenti: [{ centro: { x: 80, y: 80 }, raggio: 12, verso: 'orario', confidenza: 1 }],
        nodi: [{ x: 10, y: 10 }],
        scritte: [{ centro: { x: 55, y: 30 }, valore: { famiglia: 'L', valore: 1 }, confidenza: 1 }],
      },
    };
    const s = svg('../foto/01.png', 800, 600, r);
    expect(s).toContain('<image href="../foto/01.png"');
    expect(s.match(/class="riquadro"/g)).toHaveLength(1);
    for (const c of ['asta', 'pallino', 'corpo', 'freccia', 'momento', 'scritta']) {
      expect(s.match(new RegExp(`class="${c}"`, 'g')), c).toHaveLength(1);
    }
    // l'asta del ritaglio (scala 2, y su in un'immagine alta 300) torna sulla foto
    expect(s).toContain('x1="5" y1="145" x2="50" y2="145"');
  });
});

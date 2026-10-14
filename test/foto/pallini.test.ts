import { describe, it, expect } from 'vitest';
import { leggiPallini } from '../../src/foto/letture/pallini.js';
import { tolleranze } from '../../src/foto/parametri.js';
import type { Primitive } from '../../src/foto/tipi.js';
import { disegno, RAGGIO } from './aiuti.js';

const leggi = (p: Primitive) => leggiPallini(p, tolleranze(p));

describe('il pallino: divide la linea o ci si appoggia?', () => {
  it('due aste che finiscono sul pallino, niente sotto: cerniera interna', () => {
    const [l] = leggi(disegno().asta(0, 0, 1, 0).asta(1, 0, 2, 0).cerniera(1, 0).primitive());
    expect(l.esito).toBe('cerniera');
    expect(l.corpo).toBeNull();
    expect(l.terminano).toEqual(expect.arrayContaining([
      { segmento: 0, estremo: 'b' }, { segmento: 1, estremo: 'a' },
    ]));
    expect(l.passanti).toEqual([]);
  });

  it('pallino che interrompe con il triangolo sotto: cerniera e corpo agganciato', () => {
    const [l] = leggi(disegno().asta(0, 0, 1, 0).asta(1, 0, 2, 0)
      .appoggio('triangolo', 1, 0, 0, { interrompe: true }).primitive());
    expect(l.esito).toBe('cerniera');
    expect(l.corpo).toBe(0);
  });

  it('pallino che interrompe con i rulli sotto: cerniera e corpo agganciato', () => {
    const p = disegno().asta(0, 0, 1, 0).asta(1, 0, 2, 0)
      .appoggio('triangoloRulli', 1, 0, 0, { interrompe: true }).primitive();
    const [l] = leggi(p);
    expect(l.esito).toBe('cerniera');
    expect(p.corpi[l.corpo!].tipo).toBe('triangoloRulli');
  });

  it('pallino accanto a una colonna che prosegue, su cui finisce la diagonale (es. 20 in B)', () => {
    const [l] = leggi(disegno().asta(0, 0, 0, 2).asta(RAGGIO, 1, 2, 0)
      .cerniera(RAGGIO, 1).primitive());
    expect(l.esito).toBe('accanto');
    expect(l.terminano).toEqual([{ segmento: 1, estremo: 'a' }]);
    expect(l.passanti).toHaveLength(1);
    expect(l.passanti[0].segmento).toBe(0);
    expect(l.passanti[0].t).toBeCloseTo(0.5, 1);
  });

  it('trave continua con il carrello appoggiato sotto: la linea prosegue', () => {
    const [l] = leggi(disegno().asta(0, 0, 3, 0).appoggio('triangoloRulli', 1, 0, 0).primitive());
    expect(l.esito).toBe('appoggiato');
    expect(l.passanti).toHaveLength(1);
    expect(l.passanti[0].t).toBeCloseTo(1 / 3, 2);
    expect(l.corpo).toBe(0);
  });

  it('asta che finisce su un appoggio col pallino in asse: estremo', () => {
    const [l] = leggi(disegno().asta(0, 0, 1, 0)
      .appoggio('triangolo', 1, 0, 0, { interrompe: true }).primitive());
    expect(l.esito).toBe('estremo');
    expect(l.terminano).toEqual([{ segmento: 0, estremo: 'b' }]);
    expect(l.corpo).toBe(0);
  });

  it('spigolo appoggiato sul pallino (es. 8 in E): appoggiato, non cerniera', () => {
    // la colonna scende verso il centro del pallino, il traverso lo sfiora col suo estremo
    const [l] = leggi(disegno().asta(0, 0, 1, 0).asta(1, 0, 1, 1)
      .appoggio('triangolo', 1, 0, 0).primitive());
    expect(l.esito).toBe('appoggiato');
  });

  it('asta che arriva sulla trave proprio sopra il pallino: incrocio, non cerniera', () => {
    // la trave sta fra l'asta e il pallino: l'asta non lo raggiunge
    const [l] = leggi(disegno().asta(0, 0, 2, 0).asta(1, 1, 1, 0)
      .appoggio('triangolo', 1, 0, 0).primitive());
    expect(l.esito).toBe('appoggiato');
    expect(l.terminano).toEqual([]);
  });

  it('estremo che si ferma un po\' prima del pallino ma lo punta: finisce lì', () => {
    const p = disegno().asta(0, 0, 1, 0).asta(1, 0, 2, 0).cerniera(1, 0).primitive();
    const c = p.pallini[0].c;
    // tratto rilevato con un errore di qualche pixel: 3.5 px fuori asse, 10 px corto
    p.aste[0] = { ...p.aste[0], a: { x: p.aste[0].a.x, y: c.y + 3.5 }, b: { x: c.x - 10, y: c.y + 3.5 } };
    expect(leggi(p)[0].esito).toBe('cerniera');
  });

  it('pallino lontano da tutte le aste: isolato', () => {
    const [l] = leggi(disegno().asta(0, 0, 1, 0).cerniera(3, 3).primitive());
    expect(l.esito).toBe('isolato');
  });

  it('due rilevazioni dello stesso pallino diventano una sola lettura', () => {
    const p = disegno().asta(0, 0, 1, 0).asta(1, 0, 2, 0).cerniera(1, 0).primitive();
    const doppio = { ...p.pallini[0], c: { x: p.pallini[0].c.x + 1, y: p.pallini[0].c.y } };
    p.pallini.push({ ...doppio, confidenza: 0.5 });
    const letture = leggi(p);
    expect(letture).toHaveLength(1);
    expect(letture[0].indice).toBe(0);
  });
});

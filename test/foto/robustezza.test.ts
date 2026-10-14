/**
 * Ingressi sporchi, come li darà una rete vera: rilevazioni doppie, valori
 * non finiti, simboli senza struttura. Mai un'eccezione, mai un carico
 * raddoppiato in silenzio.
 */

import { describe, it, expect } from 'vitest';
import { leggi } from '../../src/foto/index.js';
import { disegno } from './aiuti.js';

/** trave 0–2 incastrata in A, carrello in mezzo, quote L L */
const trave = () => disegno().asta(0, 0, 2, 0)
  .appoggio('incastro', 0, 0, 270, { pallino: false }).appoggio('triangoloRulli', 1, 0, 0)
  .quota(1, 0, -0.5, 1, -0.5).quota(1, 1, -0.5, 2, -0.5);
const codici = (a: { codice: string }[]) => a.map((x) => x.codice);

describe('rilevazioni doppie', () => {
  it('la stessa freccia rilevata due volte resta una forza sola', () => {
    const p = trave().freccia(1.5, 0, -90).scritta('F', 1, 1.5, 0.55).primitive();
    p.frecce.push({ ...p.frecce[0], punta: { x: p.frecce[0].punta.x + 1, y: p.frecce[0].punta.y } });
    const { progetto } = leggi(p);
    expect(progetto.carichi).toHaveLength(1);
    expect(progetto.carichi[0]).toMatchObject({ fy: -1000 });
  });

  it('lo stesso arco rilevato due volte resta un momento solo', () => {
    const p = trave().momento(2, 0, 'orario').scritta('M', 1, 2.4, 0.3).primitive();
    p.momenti.push({ ...p.momenti[0], centro: { x: p.momenti[0].centro.x + 1, y: p.momenti[0].centro.y } });
    expect(leggi(p).progetto.carichi).toHaveLength(1);
  });

  it('lo stesso vincolo rilevato due volte resta un vincolo solo', () => {
    const p = disegno().asta(0, 0, 2, 0).appoggio('incastro', 0, 0, 270, { pallino: false })
      .quota(2, 0, -0.5, 2, -0.5).primitive();
    p.corpi.push({ ...p.corpi[0], attacco: { x: p.corpi[0].attacco.x, y: p.corpi[0].attacco.y + 12 } });
    const { progetto } = leggi(p);
    expect(progetto.nodi.filter((n) => n.vincolo)).toHaveLength(1);
  });
});

describe('rilevazioni doppie in campata', () => {
  it('il corpo di un carrello in campata rilevato due volte dà un carrello solo', () => {
    const p = trave().primitive();
    const rulli = p.corpi.find((k) => k.tipo === 'triangoloRulli')!;
    p.corpi.push({ ...rulli, attacco: { x: rulli.attacco.x + 12, y: rulli.attacco.y }, confidenza: 0.6 });
    expect(leggi(p).progetto.vincoliSuAsta ?? []).toHaveLength(1);
  });
});

describe('momenti in campata vicino a un nodo', () => {
  it('il raggio dell\'arco non trascina il momento sul nodo', () => {
    const { progetto } = leggi(trave().momento(0.5, 0, 'orario', 0.3).scritta('M', 1, 0.5, -0.5).primitive());
    expect(progetto.carichi).toEqual([expect.objectContaining({ tipo: 'momentoInCampata', s: 0.25 })]);
  });
});

describe('valori non validi', () => {
  it('un segmento con una coordinata NaN si scarta, il resto si legge', () => {
    const p = trave().primitive();
    p.aste.push({ a: { x: Number.NaN, y: 0 }, b: { x: 10, y: 10 }, spessore: 3, confidenza: 1 });
    const esito = leggi(p);
    expect(esito.progetto.nodi.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y))).toBe(true);
    expect(esito.progetto.aste).toHaveLength(1);
    expect(codici(esito.avvisi)).toContain('primitiveScartate');
  });

  it('uno spessore NaN non fa lanciare eccezioni', () => {
    const p = trave().primitive();
    p.aste[0] = { ...p.aste[0], spessore: Number.NaN };
    expect(() => leggi(p)).not.toThrow();
  });

  it('una quota con i due capi sulla stessa colonna si scarta, senza NaN', () => {
    // foto un po' storta: i due nodi della colonna hanno x diverse di qualche
    // pixel, e una quota orizzontale corta li prende entrambi
    const p = disegno().asta(0, 0, 0, 1).asta(0, 1, 1, 1).ruota(2).primitive();
    const [a, b] = [p.aste[0].a, p.aste[0].b];
    const y = Math.min(a.y, b.y) - 50;
    p.scritte.push({
      centro: { x: a.x, y }, valore: { famiglia: 'L', valore: 1 },
      estremi: [{ x: a.x, y }, { x: b.x, y }], confidenza: 1,
    });
    const esito = leggi(p);
    expect(esito.progetto.nodi.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y))).toBe(true);
  });
});

describe('modello senza vincoli', () => {
  it('le aste arrivano, con un avviso che mancano i vincoli', () => {
    const esito = leggi(disegno().asta(0, 0, 2, 0).quota(2, 0, -0.5, 2, -0.5).primitive());
    expect(esito.progetto.aste).toHaveLength(1);
    expect(codici(esito.avvisi)).toContain('nessunVincolo');
  });
});

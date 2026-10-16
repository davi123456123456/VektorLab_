import { describe, expect, it } from 'vitest';
import { disegnaDaFoto } from '../../src/foto/app/disegna.js';
import { leggi } from '../../src/foto/index.js';
import { esempi } from '../../src/state/esempi.js';
import { serializza } from '../../src/state/file.js';
import { creaStore } from '../../src/state/store.js';
import { disegno } from './aiuti.js';

function preparato() {
  const store = creaStore();
  store.getState().caricaProgetto(esempi[0].costruisci());
  return store;
}

const letto = () => leggi(disegno().asta(0, 0, 2, 0)
  .appoggio('triangolo', 0, 0, 0).appoggio('triangoloRulli', 2, 0, 0)
  .freccia(1, 0, -90).primitive()).progetto;

describe('il comando «Struttura da foto»', () => {
  it('sostituisce il disegno del foglio con quello letto', () => {
    const store = preparato();
    const nuovo = letto();
    disegnaDaFoto(store, nuovo);
    const s = store.getState();
    expect(s.progetto.nodi).toEqual(nuovo.nodi);
    expect(s.progetto.aste).toEqual(nuovo.aste);
    expect(s.passato).toHaveLength(1);
    expect(s.passato[0].etichetta).toBe('Struttura da foto');
    expect(s.progetto.casi.map((c) => c.id)).toContain(s.casoCorrente);
  });

  it('Annulla rimette esattamente il disegno di prima, Ripeti quello letto', () => {
    const store = preparato();
    const prima = structuredClone(store.getState().progetto);
    const nuovo = letto();
    disegnaDaFoto(store, nuovo);
    store.getState().annulla();
    expect(store.getState().progetto).toEqual(prima);
    store.getState().rifai();
    expect(store.getState().progetto.aste).toEqual(nuovo.aste);
  });

  it('nel file .vektor non finisce niente della foto', () => {
    const store = preparato();
    disegnaDaFoto(store, letto());
    const testo = serializza(store.getState().progetto);
    // il nome «Da foto» sì: è un nome; dati dell’immagine e avvisi no
    expect(testo).not.toMatch(/avvis|immagine|data:image|"grigio"|"primitive"/i);
  });
});

describe('le voci «Da controllare»', () => {
  it('ogni avviso porta i nodi e le aste dei punti che cita, senza doppioni', async () => {
    const { avvisiApp } = await import('../../src/foto/app/avvisi.js');
    const voci = avvisiApp(
      [{ codice: 'versoIncerto', messaggio: 'm1', punti: ['p1', 'p2', 'p1'] }, { codice: 'nessunaQuota', messaggio: 'm2' }],
      { p1: { nodi: ['n1' as never], aste: [] }, p2: { nodi: [], aste: ['a3' as never] } },
    );
    expect(voci).toEqual([
      { messaggio: 'm1', nodi: ['n1'], aste: ['a3'] },
      { messaggio: 'm2', nodi: [], aste: [] },
    ]);
  });
});

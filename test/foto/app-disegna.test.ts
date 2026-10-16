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
    // il caso corrente torna a uno che esiste nel progetto rimesso
    expect(prima.casi.map((c) => c.id)).toContain(store.getState().casoCorrente);
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

describe('il caso di carico dopo Annulla', () => {
  it('torna un caso che esiste nel disegno rimesso, anche se i casi avevano altri nomi', () => {
    const store = creaStore();
    // un disegno il cui unico caso non si chiama come quello della foto
    const p = esempi[0].costruisci();
    const vecchio = p.casi[0].id;
    p.casi = p.casi.map((c) => (c.id === vecchio ? { ...c, id: 'vento' as never } : c));
    p.carichi = p.carichi.map((c) => (c.casoId === vecchio ? { ...c, casoId: 'vento' as never } : c));
    p.combinazioni = p.combinazioni.map((k) => ({ ...k, termini: k.termini.map((t) => (t.casoId === vecchio ? { ...t, casoId: 'vento' as never } : t)) }));
    store.getState().caricaProgetto(p);
    disegnaDaFoto(store, letto());
    store.getState().annulla();
    expect(store.getState().casoCorrente).toBe('vento');
    store.getState().rifai();
    expect(store.getState().progetto.casi.map((c) => c.id)).toContain(store.getState().casoCorrente);
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

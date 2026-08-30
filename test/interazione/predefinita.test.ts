/**
 * Assegnazione PREDEFINITA e assegnazione SPECIFICA.
 *
 * Il caso normale è una struttura con un solo profilo e un solo materiale, e
 * non deve richiedere di selezionare le aste: scegliere la sezione la assegna
 * a tutte. Solo chi vuole un'eccezione la crea, e da quel momento quelle aste
 * non seguono più il predefinito — nemmeno quando il predefinito cambia.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { progetto } from '../../src/core/builder.js';
import { preset } from '../../src/core/materials/sezioniParametriche.js';
import { useStore, progettoVuoto } from '../../src/state/store.js';
import {
  aggiungiSezione, assegnaSpecifica, eliminaSezione,
  impostaMaterialePredefinito, impostaSezionePredefinita, ripristinaPredefinita,
} from '../../src/state/commands.js';
import { parametriPredefiniti } from '../../src/ui/EditorSezione.js';
import type { ElementId, Progetto } from '../../src/core/model/types.js';

function treAste(): Progetto {
  const p = progetto('tre aste');
  const sez = p.sezioneParametrica('base', preset('IPE 300'));
  const n = [0, 1, 2, 3].map((i) => p.nodo(i * 2, 0, `n${i + 1}`));
  p.asta(n[0], n[1], 'S275', sez, { teoria: 'eulero-bernoulli' });
  p.asta(n[1], n[2], 'S275', sez, { teoria: 'eulero-bernoulli' });
  p.asta(n[2], n[3], 'S275', sez, { teoria: 'eulero-bernoulli' });
  p.vincolo(n[0], 'incastro');
  return p.costruisci();
}

const st = () => useStore.getState();
const sezioniDi = () => st().progetto.aste.map((a) => a.sezioneId as unknown as string);

beforeEach(() => {
  useStore.setState({ progetto: progettoVuoto(), passato: [], futuro: [] });
  st().caricaProgetto(treAste());
});

describe('sezione predefinita', () => {
  it('si applica a TUTTE le aste, senza selezionarne nessuna', () => {
    st().esegui(aggiungiSezione(parametriPredefiniti('circolarePiena'), 'tonda'));
    st().esegui(impostaSezionePredefinita('tonda'));
    expect(sezioniDi()).toEqual(['tonda', 'tonda', 'tonda']);
    expect(st().progetto.sezionePredefinita as unknown as string).toBe('tonda');
  });

  it('è annullabile', () => {
    st().esegui(aggiungiSezione(parametriPredefiniti('circolarePiena'), 'tonda'));
    st().esegui(impostaSezionePredefinita('tonda'));
    st().annulla();
    expect(sezioniDi()).toEqual(['base', 'base', 'base']);
  });
});

describe('assegnazione specifica', () => {
  it('riguarda le sole aste indicate, e le sottrae al predefinito', () => {
    const seconda = st().progetto.aste[1].id as ElementId;
    st().esegui(aggiungiSezione(parametriPredefiniti('circolarePiena'), 'tonda'));
    st().esegui(assegnaSpecifica([seconda], { sezioneId: 'tonda' }));
    expect(sezioniDi()).toEqual(['base', 'tonda', 'base']);
    expect(st().progetto.aste[1].sezioneSpecifica).toBe(true);

    // cambiando il predefinito, l'asta con assegnazione specifica NON si muove
    st().esegui(aggiungiSezione(parametriPredefiniti('rettangolarePiena'), 'rett'));
    st().esegui(impostaSezionePredefinita('rett'));
    expect(sezioniDi()).toEqual(['rett', 'tonda', 'rett']);
  });

  it('«ripristina predefinita» toglie la sovrascrittura', () => {
    const seconda = st().progetto.aste[1].id as ElementId;
    st().esegui(impostaSezionePredefinita('base'));
    st().esegui(aggiungiSezione(parametriPredefiniti('circolarePiena'), 'tonda'));
    st().esegui(assegnaSpecifica([seconda], { sezioneId: 'tonda' }));
    st().esegui(ripristinaPredefinita([seconda], { sezione: true }));
    expect(sezioniDi()).toEqual(['base', 'base', 'base']);
    expect(st().progetto.aste[1].sezioneSpecifica).toBeUndefined();
  });

  it('il materiale segue le stesse regole', () => {
    const prima = st().progetto.aste[0].id as ElementId;
    st().esegui(assegnaSpecifica([prima], { materialeId: 'S355' }));
    st().esegui(impostaMaterialePredefinito('S235'));
    const materiali = st().progetto.aste.map((a) => a.materialeId as unknown as string);
    expect(materiali).toEqual(['S355', 'S235', 'S235']);
  });
});

describe('eliminazione di una sezione', () => {
  it('le aste che la usavano tornano alla predefinita, non restano senza', () => {
    st().esegui(impostaSezionePredefinita('base'));
    st().esegui(aggiungiSezione(parametriPredefiniti('circolarePiena'), 'tonda'));
    const seconda = st().progetto.aste[1].id as ElementId;
    st().esegui(assegnaSpecifica([seconda], { sezioneId: 'tonda' }));

    st().esegui(eliminaSezione('tonda', 'base'));
    expect(sezioniDi()).toEqual(['base', 'base', 'base']);
    expect(st().progetto.sezioniPersonalizzate.some(
      (s) => (s.id as unknown as string) === 'tonda')).toBe(false);
  });

  it('è annullabile: la sezione e le assegnazioni tornano', () => {
    st().esegui(aggiungiSezione(parametriPredefiniti('circolarePiena'), 'tonda'));
    const seconda = st().progetto.aste[1].id as ElementId;
    st().esegui(assegnaSpecifica([seconda], { sezioneId: 'tonda' }));
    st().esegui(eliminaSezione('tonda', 'base'));
    st().annulla();
    expect(sezioniDi()).toEqual(['base', 'tonda', 'base']);
  });
});

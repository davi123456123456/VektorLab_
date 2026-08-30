/**
 * FOGLI DI LAVORO.
 *
 * Ogni foglio è un documento a sé: modello, cronologia di undo, inquadratura,
 * selezione, risultati, opzioni di vista. Non condivide niente con gli altri,
 * e la garanzia non è una convenzione ma una conseguenza strutturale — sono
 * store diversi, quindi non c'è nessun campo che possano contendersi.
 *
 * Il registro qui sotto è l'unica cosa condivisa, e contiene soltanto
 * l'elenco: identificatori, nomi, quale foglio è in primo piano. Nessun dato
 * del modello lo attraversa.
 */

import { create } from 'zustand';
import type { StoreApi, UseBoundStore } from 'zustand';
import { creaStore, impostaStoreAttivo, storeAttivo, type Stato } from './store.js';
import type { Progetto } from '../core/model/types.js';

export interface Foglio {
  id: string;
  nome: string;
  store: UseBoundStore<StoreApi<Stato>>;
}

interface RegistroFogli {
  fogli: Foglio[];
  attivo: string;
  /** cresce ad ogni cambio di foglio: è la `key` che rimonta l'area di lavoro */
  generazione: number;

  nuovo: (nome?: string, progetto?: Progetto) => string;
  attiva: (id: string) => void;
  chiudi: (id: string) => void;
  rinomina: (id: string, nome: string) => void;
  duplica: (id: string) => string;
  foglioAttivo: () => Foglio;
}

let contatore = 0;
const prossimoId = () => `foglio-${++contatore}`;

/** Nome libero più basso: «Foglio 1», «Foglio 2», … senza collisioni. */
function nomeLibero(fogli: Foglio[]): string {
  const presi = new Set(fogli.map((f) => f.nome));
  for (let i = 1; ; i++) {
    const n = `Foglio ${i}`;
    if (!presi.has(n)) return n;
  }
}

/** Il primo foglio adotta lo store già esistente, invece di crearne un altro. */
function foglioIniziale(): Foglio {
  return { id: prossimoId(), nome: 'Foglio 1', store: storeAttivo() };
}

export const useFogli = create<RegistroFogli>((set, get) => {
  const primo = foglioIniziale();
  return {
    fogli: [primo],
    attivo: primo.id,
    generazione: 0,

    nuovo(nome, progetto) {
      const store = creaStore();
      if (progetto) store.getState().caricaProgetto(progetto);
      const f: Foglio = {
        id: prossimoId(),
        nome: nome ?? nomeLibero(get().fogli),
        store,
      };
      set((s) => ({ fogli: [...s.fogli, f] }));
      get().attiva(f.id);
      return f.id;
    },

    attiva(id) {
      const f = get().fogli.find((x) => x.id === id);
      if (!f || get().attivo === id) return;
      impostaStoreAttivo(f.store);
      set((s) => ({ attivo: id, generazione: s.generazione + 1 }));
    },

    chiudi(id) {
      const { fogli, attivo } = get();
      // l'ultimo foglio non si chiude: resterebbe un'applicazione senza
      // documento, e non c'è nessuno stato sensato da mostrare
      if (fogli.length <= 1) return;
      const i = fogli.findIndex((x) => x.id === id);
      if (i < 0) return;
      const rimasti = fogli.filter((x) => x.id !== id);
      set({ fogli: rimasti });
      if (attivo === id) {
        // passa al vicino: chi chiude un foglio si aspetta di trovarsi su
        // quello accanto, non catapultato all'inizio dell'elenco
        const vicino = rimasti[Math.min(i, rimasti.length - 1)];
        impostaStoreAttivo(vicino.store);
        set((s) => ({ attivo: vicino.id, generazione: s.generazione + 1 }));
      }
    },

    rinomina(id, nome) {
      const pulito = nome.trim();
      if (!pulito) return;
      set((s) => ({
        fogli: s.fogli.map((f) => (f.id === id ? { ...f, nome: pulito } : f)),
      }));
    },

    duplica(id) {
      const f = get().fogli.find((x) => x.id === id);
      if (!f) return id;
      // si copia il MODELLO, non lo stato: la cronologia di undo del foglio
      // originale non ha senso in una copia, e portarla dietro darebbe
      // l'illusione di poter annullare azioni mai fatte qui
      return get().nuovo(`${f.nome} (copia)`, f.store.getState().progetto);
    },

    foglioAttivo() {
      const { fogli, attivo } = get();
      return fogli.find((x) => x.id === attivo) ?? fogli[0];
    },
  };
});

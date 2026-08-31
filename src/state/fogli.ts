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
import { verificaIntegrita } from '../core/model/integrita.js';
import type { Progetto } from '../core/model/types.js';

const CHIAVE_FOGLI = 'vektorlab.fogli';

/**
 * COPIA PROFONDA del modello.
 *
 * Duplicare un foglio copiandone il riferimento darebbe due schede che
 * mostrano lo stesso oggetto: modificare l'una cambierebbe l'altra, e sarebbe
 * il modo più diretto di rompere l'isolamento senza che nessun test sul
 * conteggio delle entità se ne accorga. `structuredClone` copia anche gli
 * array annidati; il ripiego serve dove non esiste.
 */
function clonaProfondo(p: Progetto): Progetto {
  try {
    return structuredClone(p);
  } catch {
    return JSON.parse(JSON.stringify(p)) as Progetto;
  }
}

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
  chiudiLeAltre: (id: string) => void;
  rinomina: (id: string, nome: string) => void;
  duplica: (id: string) => string;
  foglioAttivo: () => Foglio;
  /** true se il foglio ha modifiche non annullate: serve alla conferma */
  modificato: (id: string) => boolean;
  /** salva l'elenco e i modelli, così una ricarica non perde il lavoro */
  salva: () => void;
  /** ripristina i fogli salvati; restituisce quanti ne ha aperti */
  ripristina: () => number;
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
      // il worker del foglio si spegne con lui: lasciarlo acceso terrebbe in
      // vita un thread e la copia del modello che sta calcolando
      fogli[i].store.getState().terminaWorker();
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

    chiudiLeAltre(id) {
      for (const f of [...get().fogli]) {
        if (f.id !== id) get().chiudi(f.id);
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
      // l'illusione di poter annullare azioni mai fatte qui.
      // La copia è PROFONDA: condividere il riferimento darebbe due schede
      // legate fra loro senza che si veda.
      const id2 = get().nuovo(`${f.nome} (copia)`, clonaProfondo(f.store.getState().progetto));
      // e anche l'inquadratura si porta dietro: duplicare un foglio per
      // provare una variante e ritrovarsi altrove sullo schermo disorienta
      const sorgente = f.store.getState().camera;
      const copia = get().fogli.find((x) => x.id === id2);
      copia?.store.getState().impostaCamera({ ...sorgente });
      return id2;
    },

    foglioAttivo() {
      const { fogli, attivo } = get();
      return fogli.find((x) => x.id === attivo) ?? fogli[0];
    },

    modificato(id) {
      const f = get().fogli.find((x) => x.id === id);
      if (!f) return false;
      const st = f.store.getState();
      return st.passato.length > 0 || st.progetto.nodi.length > 0;
    },

    /**
     * §4.4 — persistenza. Ogni accesso protetto: in navigazione privata la
     * sola lettura può lanciare, e perdere l'applicazione per una preferenza
     * non salvata sarebbe uno scambio pessimo.
     */
    salva() {
      try {
        const dati = {
          attivo: get().attivo,
          fogli: get().fogli.map((f) => ({
            id: f.id, nome: f.nome, progetto: f.store.getState().progetto,
          })),
        };
        globalThis.localStorage?.setItem(CHIAVE_FOGLI, JSON.stringify(dati));
      } catch {
        // spazio esaurito o storage non disponibile: si continua a lavorare
      }
    },

    ripristina() {
      interface Salvati {
        attivo?: string;
        fogli?: { id: string; nome: string; progetto: Progetto }[];
      }
      let dati: Salvati | null = null;
      try {
        const g = globalThis.localStorage?.getItem(CHIAVE_FOGLI);
        dati = g ? (JSON.parse(g) as Salvati) : null;
      } catch {
        return 0;
      }
      const salvati = dati?.fogli?.filter((f) => f?.progetto?.nodi) ?? [];
      if (salvati.length === 0) return 0;

      const fogli: Foglio[] = salvati.map((f, k) => {
        const store = k === 0 ? storeAttivo() : creaStore();
        // §1 + §4.4 — ciò che torna da localStorage passa dal controllo di
        // integrità PRIMA di entrare nello store: un modello salvato mentre
        // conteneva riferimenti pendenti non deve reintrodurli.
        store.getState().caricaProgetto(verificaIntegrita(f.progetto).progetto);
        return { id: f.id, nome: f.nome, store };
      });
      const attivo = fogli.find((f) => f.id === dati?.attivo) ?? fogli[0];
      impostaStoreAttivo(attivo.store);
      contatore = Math.max(contatore, fogli.length);
      set((s) => ({ fogli, attivo: attivo.id, generazione: s.generazione + 1 }));
      return fogli.length;
    },
  };
});

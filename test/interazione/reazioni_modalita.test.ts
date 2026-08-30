/**
 * Modalità Reazioni: ciò che l'interfaccia mostra deve essere ciò che il
 * nucleo calcola.
 *
 * Questi test girano sullo STORE, non sui pixel: verificano che entrando nella
 * modalità la statica venga calcolata, che le componenti mostrate siano quelle
 * che ciascun vincolo può davvero esplicare, e che il corpo libero interrogato
 * cliccando coincida con quello del nucleo. Il disegno può cambiare; queste
 * corrispondenze no.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { progetto } from '../../src/core/builder.js';
import { useStore, progettoVuoto } from '../../src/state/store.js';
import { aggiungiNodo } from '../../src/state/commands.js';
import { preset } from '../../src/core/materials/sezioniParametriche.js';
import type { LoadCaseId, Progetto } from '../../src/core/model/types.js';

const CASO = 'principale' as LoadCaseId;
const EB = { teoria: 'eulero-bernoulli' as const };

/** Gerber: A(0) — cerniera G(6) — B(8) — C(12), q = 15 kN/m. */
function gerber(): Progetto {
  const p = progetto('gerber');
  const sez = p.sezioneParametrica('s', preset('IPE 300'));
  const A = p.nodo(0, 0, 'A');
  const G = p.nodo(6, 0, 'G');
  const B = p.nodo(8, 0, 'B');
  const C = p.nodo(12, 0, 'C');
  const a1 = p.asta(A, G, 'S275', sez, EB);
  const a2 = p.asta(G, B, 'S275', sez, { ...EB, svincoloIniziale: { M: true } });
  const a3 = p.asta(B, C, 'S275', sez, EB);
  p.vincolo(A, 'cerniera');
  p.vincolo(B, 'carrello');
  p.vincolo(C, 'carrello');
  for (const x of [a1, a2, a3]) p.distribuito(x, -15e3);
  return p.costruisci();
}

/** Trave continua su tre appoggi: una volta iperstatica. */
function continua(): Progetto {
  const p = progetto('continua');
  const sez = p.sezioneParametrica('s', preset('IPE 300'));
  const a = p.nodo(0, 0, 'A');
  const b = p.nodo(10, 0, 'B');
  const el = p.asta(a, b, 'S275', sez, EB);
  p.vincolo(a, 'cerniera');
  p.vincolo(b, 'carrello');
  p.vincoloSuAsta(el, 0.5, 'carrello');
  p.distribuito(el, -12e3);
  return p.costruisci();
}

async function entraInReazioni(p: Progetto): Promise<void> {
  const st = useStore.getState();
  st.caricaProgetto(p);
  await useStore.getState().calcolaRisultati({ tipo: 'caso', id: CASO });
  useStore.getState().impostaModalita('reazioni');
  useStore.getState().aggiornaStatica();
}

beforeEach(() => {
  useStore.setState({
    progetto: progettoVuoto(), passato: [], futuro: [],
    risultato: null, statico: null, troncoScelto: null, tronco: null,
    sconnessioneEsplosa: null, modalita: 'modellazione',
  });
});

describe('entrando in modalità Reazioni', () => {
  it('la statica viene calcolata e riusa il risultato del solutore', async () => {
    await entraInReazioni(gerber());
    const st = useStore.getState();
    expect(st.statico).not.toBeNull();
    expect(st.statico!.equilibrio.classificazione).toBe('isostatica');
    expect(st.statico!.elementino.sorgente).toBe('equilibrio');
    // le stesse reazioni del FEM, che è il risultato che l'interfaccia mostra
    // già nella modalità Risultati: se divergessero, l'utente vedrebbe due
    // verità diverse cambiando scheda
    for (const r of st.risultato!.reazioni) {
      const eq = st.statico!.equilibrio.perNodo.find(
        (x) => x.nodoId === (r.nodoId as unknown as string));
      if (!eq) continue;
      expect(eq.fy).toBeCloseTo(r.fy, 3);
      expect(eq.mz).toBeCloseTo(r.mz, 3);
    }
  });

  it('le componenti mostrate sono quelle che il vincolo può esplicare', async () => {
    await entraInReazioni(gerber());
    const c = useStore.getState().statico!.componentiEsterne;
    // cerniera in A: due componenti; carrelli in B e C: una ciascuno
    expect(c.filter((x) => x.nodoId === 'A').length).toBe(2);
    expect(c.filter((x) => x.nodoId === 'B').length).toBe(1);
    expect(c.filter((x) => x.nodoId === 'C').length).toBe(1);
    // e i valori sono quelli noti
    const vA = c.find((x) => x.nodoId === 'A' && x.componente !== 'x')!;
    expect(Math.abs(vA.valore)).toBeCloseTo(45e3, 2);
    expect(Math.abs(c.find((x) => x.nodoId === 'B')!.valore)).toBeCloseTo(135e3, 2);
  });

  it('ogni componente ha una direzione disegnabile e un modulo positivo', async () => {
    await entraInReazioni(gerber());
    for (const c of useStore.getState().statico!.componentiEsterne) {
      if (c.componente === 'rotazione') continue;
      expect(c.direzione, `${c.nodoId} senza direzione`).toBeDefined();
      const n = Math.hypot(c.direzione!.dx, c.direzione!.dy);
      expect(n).toBeCloseTo(1, 12);
      expect(c.x).toBeDefined();
      expect(c.y).toBeDefined();
    }
  });
});

describe('struttura vincolata ma scarica', () => {
  /**
   * Senza carichi tutte le reazioni valgono zero. È un risultato, non
   * un'assenza di risultato: se gli appoggi sparissero dall'elenco, il
   * confronto fra i due metodi non avrebbe nulla da confrontare e si
   * dichiarerebbe superato senza aver verificato niente.
   */
  it('gli appoggi compaiono lo stesso, con valore nullo', async () => {
    const p = progetto('scarica');
    const sez = p.sezioneParametrica('s', preset('IPE 300'));
    const a = p.nodo(0, 0, 'A');
    const b = p.nodo(6, 0, 'B');
    p.asta(a, b, 'S275', sez, EB);
    p.vincolo(a, 'cerniera');
    p.vincolo(b, 'carrello');
    await entraInReazioni(p.costruisci());

    const st = useStore.getState();
    expect(st.risultato!.reazioni.length).toBe(2);
    for (const r of st.risultato!.reazioni) {
      expect(Math.hypot(r.fx, r.fy)).toBeLessThan(1e-9);
    }
    const confronto = st.statico!.autoverifiche.verifiche.find(
      (v) => v.codice === 'CONFRONTO_METODI')!;
    expect(confronto.esaminati).toBeGreaterThan(0);
    expect(confronto.superata).toBe(true);
    expect(st.statico!.autoverifiche.tutteSuperate).toBe(true);
  });
});

describe('incastro: due forze e una coppia, tutte disegnabili', () => {
  it('ogni componente ha un punto di applicazione, coppia compresa', async () => {
    const p = progetto('mensola');
    const sez = p.sezioneParametrica('s', preset('IPE 300'));
    const a = p.nodo(0, 0, 'A');
    const b = p.nodo(4, 0, 'B');
    p.asta(a, b, 'S275', sez, EB);
    p.vincolo(a, 'incastro');
    p.forza(b, 0, -10e3);
    await entraInReazioni(p.costruisci());

    const c = useStore.getState().statico!.componentiEsterne;
    expect(c.length).toBe(3);
    const coppia = c.find((x) => x.componente === 'rotazione')!;
    expect(coppia, 'manca la componente di momento').toBeDefined();
    // senza queste coordinate la freccia curva non avrebbe dove comparire
    expect(coppia.x).toBeCloseTo(0, 9);
    expect(coppia.y).toBeCloseTo(0, 9);
    expect(Math.abs(coppia.valore)).toBeCloseTo(40e3, 2);
    for (const x of c) {
      expect(x.x, `${x.descrizione} senza punto`).toBeDefined();
      expect(x.y, `${x.descrizione} senza punto`).toBeDefined();
    }
  });
});

describe('corpo libero interrogato cliccando', () => {
  it('coincide con il taglio del nucleo e i due lati concordano', async () => {
    await entraInReazioni(gerber());
    useStore.getState().scegliTronco({ astaId: 'a3', s: 0.5, lato: 'monte' });
    const monte = useStore.getState().tronco!;
    expect(monte.applicabile).toBe(true);
    // a3 va da 8 a 12: a metà, x = 10
    // T = R_A + R_B − q·x = 45 + 135 − 150 = 30 kN
    expect(monte.T).toBeCloseTo(30e3, 1);
    // M = 45·10 + 135·2 − 15·100/2 = 450 + 270 − 750 = −30 kNm
    expect(monte.M).toBeCloseTo(-30e3, 1);

    useStore.getState().alternaLatoTronco();
    const valle = useStore.getState().tronco!;
    expect(valle.lato).toBe('valle');
    expect(valle.N).toBeCloseTo(monte.N, 6);
    expect(valle.T).toBeCloseTo(monte.T, 6);
    expect(valle.M).toBeCloseTo(monte.M, 6);
  });

  it('la somma dei contributi dei termini è il valore mostrato', async () => {
    await entraInReazioni(gerber());
    useStore.getState().scegliTronco({ astaId: 'a1', s: 0.4, lato: 'monte' });
    const t = useStore.getState().tronco!;
    const somma = t.termini.reduce(
      (acc, x) => ({ N: acc.N + x.dN, T: acc.T + x.dT, M: acc.M + x.dM }),
      { N: 0, T: 0, M: 0 },
    );
    expect(somma.N).toBeCloseTo(t.N, 6);
    expect(somma.T).toBeCloseTo(t.T, 6);
    expect(somma.M).toBeCloseTo(t.M, 6);
  });

  it('aprire una sconnessione chiude il corpo libero e viceversa', async () => {
    await entraInReazioni(gerber());
    useStore.getState().scegliTronco({ astaId: 'a3', s: 0.5, lato: 'monte' });
    expect(useStore.getState().tronco).not.toBeNull();
    useStore.getState().esplodiSconnessione('G');
    expect(useStore.getState().tronco).toBeNull();
    expect(useStore.getState().troncoScelto).toBeNull();
    useStore.getState().scegliTronco({ astaId: 'a1', s: 0.5, lato: 'monte' });
    expect(useStore.getState().sconnessioneEsplosa).toBeNull();
  });
});

describe('le reazioni non sopravvivono al modello che le ha generate', () => {
  it('caricare un altro esempio azzera statica, tronco ed esploso', async () => {
    await entraInReazioni(gerber());
    useStore.getState().scegliTronco({ astaId: 'a1', s: 0.5, lato: 'monte' });
    expect(useStore.getState().statico).not.toBeNull();
    expect(useStore.getState().tronco).not.toBeNull();

    useStore.getState().caricaProgetto(continua());
    // il ricalcolo è asincrono: subito dopo il caricamento non deve restare
    // NULLA della struttura precedente
    expect(useStore.getState().tronco).toBeNull();
    expect(useStore.getState().troncoScelto).toBeNull();
    expect(useStore.getState().sconnessioneEsplosa).toBeNull();
    expect(useStore.getState().statico).toBeNull();
  });

  it('una modifica del modello invalida le reazioni mostrate', async () => {
    await entraInReazioni(gerber());
    expect(useStore.getState().statico).not.toBeNull();
    useStore.getState().esegui(aggiungiNodo(20, 0));
    expect(useStore.getState().statico).toBeNull();
    expect(useStore.getState().risultato).toBeNull();
  });
});

describe('struttura labile', () => {
  /** Tre bielle le cui rette d'azione concorrono in un punto. */
  function concorrenti(): Progetto {
    const p = progetto('concorrenti');
    const sez = p.sezioneParametrica('s', preset('IPE 300'));
    const a = p.nodo(0, 4, 'A');
    const b = p.nodo(-3, -2, 'B');
    const c = p.nodo(3, -2, 'C');
    p.asta(a, b, 'S275', sez, EB);
    p.asta(b, c, 'S275', sez, EB);
    p.asta(c, a, 'S275', sez, EB);
    // l'angolo è il PUNTAMENTO: per una biella diretta lungo θ vale θ − 90°
    p.vincolo(a, 'biella', Math.atan2(4, 0) - Math.PI / 2);
    p.vincolo(b, 'biella', Math.atan2(-2, -3) - Math.PI / 2);
    p.vincolo(c, 'biella', Math.atan2(-2, 3) - Math.PI / 2);
    p.forza(a, 12000, 0);
    return p.costruisci();
  }

  it('non produce numeri: nessuna reazione, nessun diagramma', async () => {
    await entraInReazioni(concorrenti());
    const st = useStore.getState().statico!;
    expect(st.equilibrio.classificazione).toBe('labile');
    expect(st.componentiEsterne.length).toBe(0);
    expect(st.elementino.reazioni.length).toBe(0);
    expect(st.elementino.diagrammi.size).toBe(0);
    expect(st.elementino.applicabile).toBe(false);
    expect(st.elementino.motivo).toMatch(/labile/);
  });

  it('l\'equilibrio globale fallisce, ed è la conferma della diagnosi', async () => {
    await entraInReazioni(concorrenti());
    const v = useStore.getState().statico!.autoverifiche.verifiche
      .find((x) => x.codice === 'EQUILIBRIO_GLOBALE')!;
    expect(v.superata).toBe(false);
    // il residuo è la forza applicata che nessuno equilibra
    expect(v.dettaglio).toMatch(/1\.20e\+1 kN/);
  });
});

describe('struttura iperstatica', () => {
  it('dichiara che le reazioni vengono dalla congruenza, non dall\'equilibrio', async () => {
    await entraInReazioni(continua());
    const st = useStore.getState().statico!;
    expect(st.equilibrio.classificazione).toBe('iperstatica');
    expect(st.equilibrio.risolto).toBe(false);
    expect(st.elementino.sorgente).toBe('fem');
    expect(st.equilibrio.messaggio).toMatch(/rigidezze/);
    // le componenti si mostrano lo stesso, prese dal FEM
    expect(st.componentiEsterne.length).toBeGreaterThan(0);
    const totale = st.componentiEsterne
      .filter((c) => c.componente !== 'rotazione' && c.direzione)
      .reduce((s, c) => s + c.valore * c.direzione!.dy, 0);
    expect(totale).toBeCloseTo(12e3 * 10, 1);   // qL, verso l'alto
  });

  it('il corpo libero resta calcolabile: il taglio è sempre equilibrio', async () => {
    await entraInReazioni(continua());
    const asta = useStore.getState().progetto.aste[0].id as unknown as string;
    useStore.getState().scegliTronco({ astaId: asta, s: 0.5, lato: 'monte' });
    const t = useStore.getState().tronco;
    expect(t, 'nessun tronco calcolato').not.toBeNull();
    expect(t!.applicabile).toBe(true);
    // trave continua a due campate uguali: M sull'appoggio centrale = −qL²/8
    expect(t!.M).toBeCloseTo(-(12e3 * 25) / 8, 1);
  });
});

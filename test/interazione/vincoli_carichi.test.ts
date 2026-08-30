/**
 * Vincoli e carichi: coerenza fra ciò che l'interfaccia PROMETTE e ciò che il
 * nucleo CALCOLA.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { progetto } from '../../src/core/builder.js';
import { analizzaCinematica } from '../../src/core/index.js';
import { VINCOLI_DISPONIBILI } from '../../src/render/simboli.js';
import { calcolaScala } from '../../src/render/carichi.js';
import {
  configurazioneMeccanismo, ampiezzaVisibile,
} from '../../src/render/cinematica.js';
import {
  aggiungiCarico, aggiungiCaso, eliminaCarichi, eliminaCaso, modificaCarico,
} from '../../src/state/commands.js';
import { useStore } from '../../src/state/store.js';
import {
  applicaCaricoAsta, applicaCaricoNodale, applicaVincolo,
} from '../../src/state/azioni.js';
import type { LoadCaseId, LoadId, Progetto, TipoVincolo } from '../../src/core/model/types.js';

function conUnVincolo(tipo: TipoVincolo, angolo = 0): Progetto {
  const p = progetto('prova');
  const a = p.nodo(0, 0);
  const b = p.nodo(4, 0);
  p.asta(a, b, 'S275', 'IPE 300');
  p.vincolo(a, tipo, angolo);
  return p.costruisci();
}

describe('la tavolozza dei vincoli dice il vero', () => {
  /**
   * I gradi di vincolo mostrati nell'interfaccia devono coincidere con le
   * righe che il vincolo genera nella matrice cinematica. Sono due punti del
   * codice molto distanti fra loro: senza questo test divergerebbero alla
   * prima modifica, e l'interfaccia insegnerebbe una cosa sbagliata.
   */
  for (const v of VINCOLI_DISPONIBILI) {
    it(`${v.nome}: ${v.gradi} gradi dichiarati = righe generate`, () => {
      const senza = analizzaCinematica(
        (() => {
          const p = progetto('vuoto');
          const a = p.nodo(0, 0);
          const b = p.nodo(4, 0);
          p.asta(a, b, 'S275', 'IPE 300');
          return p.costruisci();
        })(),
      );
      const con = analizzaCinematica(conUnVincolo(v.tipo));
      expect(con.gradiVincolo - senza.gradiVincolo).toBe(v.gradi);
    });
  }

  it('bipendolo e pattino sono cinematicamente identici', () => {
    const b = analizzaCinematica(conUnVincolo('bipendolo', 0.3));
    const p = analizzaCinematica(conUnVincolo('pattino', 0.3));
    expect(p.gradiVincolo).toBe(b.gradiVincolo);
    expect(p.rango).toBe(b.rango);
    expect(p.labilita).toBe(b.labilita);
  });

  it('la molla non aggiunge gradi di vincolo ma viene segnalata', () => {
    const k = analizzaCinematica(conUnVincolo('molla'));
    expect(k.gradiVincolo).toBe(0);
    expect(k.diagnosi.map((d) => d.codice)).toContain('VINCOLI_ELASTICI');
  });

  it('carrello e biella a 90° di differenza bloccano la stessa direzione', () => {
    // carrello: l'angolo è il PIANO; biella: l'angolo è l'ASSE
    const carrello = analizzaCinematica(conUnVincolo('carrello', 0));
    const biella = analizzaCinematica(conUnVincolo('biella', Math.PI / 2));
    expect(biella.labilita).toBe(carrello.labilita);
    expect(biella.rango).toBe(carrello.rango);
  });
});

describe('scala di disegno dei carichi', () => {
  it('normalizza sul massimo di ciascuna famiglia', () => {
    const p = progetto('s');
    const a = p.nodo(0, 0);
    const b = p.nodo(4, 0);
    const asta = p.asta(a, b, 'S275', 'IPE 300');
    p.forza(a, 0, -1000);
    p.forza(b, 0, -50000);
    p.momento(a, 7000);
    p.distribuito(asta, -3000);
    const s = calcolaScala(p.costruisci().carichi);
    expect(s.forzaMax).toBeCloseTo(50000, 6);
    expect(s.momentoMax).toBeCloseTo(7000, 6);
    expect(s.distribuitoMax).toBeCloseTo(3000, 6);
  });

  it('non divide mai per zero', () => {
    const s = calcolaScala([]);
    expect(s.forzaMax).toBe(1);
    expect(s.momentoMax).toBe(1);
    expect(s.distribuitoMax).toBe(1);
  });
});

describe('configurazione del cinematismo', () => {
  function treCarrelliParalleli(): Progetto {
    const p = progetto('labile');
    const a = p.nodo(0, 0);
    const b = p.nodo(3, 0);
    const c = p.nodo(6, 0);
    p.asta(a, b, 'S275', 'IPE 300');
    p.asta(b, c, 'S275', 'IPE 300');
    p.vincolo(a, 'carrello', 0);
    p.vincolo(b, 'carrello', 0);
    p.vincolo(c, 'carrello', 0);
    return p.costruisci();
  }

  it('il moto rispetta i vincoli: i carrelli restano sul loro piano', () => {
    const prog = treCarrelliParalleli();
    const k = analizzaCinematica(prog);
    expect(k.labilita).toBe(1);
    const pos = configurazioneMeccanismo(prog, k, 0, 1);
    // tutti i nodi hanno vincolo verticale: la y non deve cambiare
    for (const n of prog.nodi) {
      expect(pos.get(n.id as string)!.y).toBeCloseTo(n.y, 9);
    }
    // ...e almeno un nodo deve essersi mosso in x, altrimenti non è un moto
    const spostati = prog.nodi.filter(
      (n) => Math.abs(pos.get(n.id as string)!.x - n.x) > 1e-9,
    );
    expect(spostati.length).toBeGreaterThan(0);
  });

  it('la rotazione avviene attorno al centro calcolato', () => {
    const p = progetto('rotante');
    const a = p.nodo(0, 4);
    const b = p.nodo(-3, -2);
    const c = p.nodo(3, -2);
    p.asta(a, b, 'S275', 'IPE 300');
    p.asta(b, c, 'S275', 'IPE 300');
    p.asta(c, a, 'S275', 'IPE 300');
    // l'angolo è il PUNTAMENTO: per una biella diretta lungo θ vale θ − 90°
    p.vincolo(a, 'biella', Math.atan2(4, 0) - Math.PI / 2);
    p.vincolo(b, 'biella', Math.atan2(-2, -3) - Math.PI / 2);
    p.vincolo(c, 'biella', Math.atan2(-2, 3) - Math.PI / 2);
    const prog = p.costruisci();
    const k = analizzaCinematica(prog);

    expect(k.labilita).toBe(1);
    const cir = k.meccanismi[0].cir[0];
    expect(cir.tipo).toBe('proprio');
    if (cir.tipo !== 'proprio') return;
    expect(cir.x).toBeCloseTo(0, 6);
    expect(cir.y).toBeCloseTo(0, 6);

    // il moto infinitesimo è ortogonale al raggio dal centro
    const pos = configurazioneMeccanismo(prog, k, 0, 1);
    for (const n of prog.nodi) {
      const q = pos.get(n.id as string)!;
      const dx = q.x - n.x, dy = q.y - n.y;
      const rx = n.x - cir.x, ry = n.y - cir.y;
      expect(Math.abs(dx * rx + dy * ry)).toBeLessThan(1e-9);
    }
  });

  it('l\'ampiezza rende il moto visibile ma proporzionato al modello', () => {
    const prog = treCarrelliParalleli();
    const k = analizzaCinematica(prog);
    const amp = ampiezzaVisibile(prog, k, 0);
    const pos = configurazioneMeccanismo(prog, k, 0, amp);
    let massimo = 0;
    for (const n of prog.nodi) {
      const q = pos.get(n.id as string)!;
      massimo = Math.max(massimo, Math.hypot(q.x - n.x, q.y - n.y));
    }
    // il modello è lungo 6 m: lo spostamento deve valerne circa il 12 %
    expect(massimo).toBeCloseTo(0.12 * 6, 6);
  });
});

describe('comandi sui carichi', () => {
  function base(): Progetto {
    const p = progetto('c');
    const a = p.nodo(0, 0);
    const b = p.nodo(4, 0);
    p.asta(a, b, 'S275', 'IPE 300');
    return p.costruisci();
  }

  it('aggiungi e annulla', () => {
    const p = base();
    const cmd = aggiungiCarico(
      { tipo: 'forzaNodale', nodoId: p.nodi[0].id, fx: 0 as never, fy: -1000 as never },
      'principale' as LoadCaseId,
    );
    const dopo = cmd.esegui(p);
    expect(dopo.carichi.length).toBe(1);
    expect(cmd.annulla(dopo).carichi.length).toBe(0);
  });

  it('modifica e ripristina il valore precedente', () => {
    const p = base();
    const cmd = aggiungiCarico(
      { tipo: 'forzaNodale', nodoId: p.nodi[0].id, fx: 0 as never, fy: -1000 as never },
      'principale' as LoadCaseId,
    );
    const conCarico = cmd.esegui(p);
    const id = conCarico.carichi[0].id;
    const mod = modificaCarico(id, { fy: -9999 as never });
    const modificato = mod.esegui(conCarico);
    expect((modificato.carichi[0] as { fy: number }).fy).toBe(-9999);
    const tornato = mod.annulla(modificato);
    expect((tornato.carichi[0] as { fy: number }).fy).toBe(-1000);
  });

  it('eliminare un caso porta via i suoi carichi e li restituisce all\'annullamento', () => {
    const p = progetto('multi');
    const a = p.nodo(0, 0);
    const b = p.nodo(4, 0);
    p.asta(a, b, 'S275', 'IPE 300');
    p.caso('G', 'Permanenti', 'G1');
    p.forza(b, 0, -1000);
    p.caso('Q', 'Variabili', 'Q');
    p.forza(b, 0, -2000);
    const prog = p.costruisci();
    expect(prog.carichi.length).toBe(2);

    const cmd = eliminaCaso('G' as LoadCaseId);
    const dopo = cmd.esegui(prog);
    expect(dopo.casi.length).toBe(1);
    expect(dopo.carichi.length).toBe(1);
    const tornato = cmd.annulla(dopo);
    expect(tornato.casi.length).toBe(2);
    expect(tornato.carichi.length).toBe(2);
  });
});

describe('azioni di applicazione', () => {
  beforeEach(() => {
    const p = progetto('app');
    const a = p.nodo(0, 0);
    const b = p.nodo(4, 0);
    p.asta(a, b, 'S275', 'IPE 300');
    useStore.setState({
      progetto: p.costruisci(), passato: [], futuro: [],
      selezione: { nodi: new Set(), aste: new Set() },
      casoCorrente: 'principale' as LoadCaseId,
      vincoloCorrente: 'cerniera', angoloVincolo: 0,
      caricoCorrente: 'forza', valoreForza: 10000, direzioneForza: -Math.PI / 2,
    });
  });

  it('applicare due volte lo stesso vincolo lo rimuove', () => {
    const id = useStore.getState().progetto.nodi[0].id;
    applicaVincolo([id]);
    expect(useStore.getState().progetto.nodi[0].vincolo?.tipo).toBe('cerniera');
    applicaVincolo([id]);
    expect(useStore.getState().progetto.nodi[0].vincolo).toBeUndefined();
  });

  it('applicare un vincolo DIVERSO lo sostituisce invece di rimuoverlo', () => {
    const id = useStore.getState().progetto.nodi[0].id;
    applicaVincolo([id]);
    useStore.getState().impostaVincoloCorrente('carrello');
    applicaVincolo([id]);
    expect(useStore.getState().progetto.nodi[0].vincolo?.tipo).toBe('carrello');
  });

  it('la forza nodale usa intensità e direzione impostate', () => {
    const id = useStore.getState().progetto.nodi[1].id;
    applicaCaricoNodale(id);
    const c = useStore.getState().progetto.carichi[0] as { fx: number; fy: number };
    expect(c.fx).toBeCloseTo(0, 6);
    expect(c.fy).toBeCloseTo(-10000, 6);
  });

  it('un carico da asta rifiutato su un nodo non modifica il modello', () => {
    useStore.getState().impostaCaricoCorrente('distribuito');
    const id = useStore.getState().progetto.nodi[0].id;
    applicaCaricoNodale(id);
    expect(useStore.getState().progetto.carichi.length).toBe(0);
    expect(useStore.getState().messaggio).toContain('asta');
  });

  it('il distribuito si applica all\'asta ed è annullabile', () => {
    // il SEGNO del valore è il verso: non viene rovesciato per strada, così
    // ciò che il pannello mostra è ciò che finisce nel modello
    useStore.getState().impostaCaricoCorrente('distribuito');
    useStore.getState().impostaValoriCarico({ valoreDistribuito: -5000 });
    applicaCaricoAsta(useStore.getState().progetto.aste[0].id);
    const c = useStore.getState().progetto.carichi[0] as unknown as {
      q1: number; q2: number; sIniziale: number; sFinale: number;
    };
    expect(c.q1).toBeCloseTo(-5000, 6);
    expect(c.q2).toBeCloseTo(-5000, 6);
    expect(c.sIniziale).toBe(0);
    expect(c.sFinale).toBe(1);
    useStore.getState().annulla();
    expect(useStore.getState().progetto.carichi.length).toBe(0);
  });

  it('il distribuito trapezoidale su un tratto usa q₁, q₂ e le ascisse', () => {
    useStore.getState().impostaCaricoCorrente('distribuito');
    useStore.getState().impostaValoriCarico({
      valoreDistribuito: -4000, valoreDistribuito2: -12000, trapezoidale: true,
      sInizialeCarico: 0.25, sFinaleCarico: 0.75,
    });
    applicaCaricoAsta(useStore.getState().progetto.aste[0].id);
    const c = useStore.getState().progetto.carichi[0] as unknown as {
      q1: number; q2: number; sIniziale: number; sFinale: number;
    };
    expect(c.q1).toBeCloseTo(-4000, 6);
    expect(c.q2).toBeCloseTo(-12000, 6);
    expect(c.sIniziale).toBeCloseTo(0.25, 9);
    expect(c.sFinale).toBeCloseTo(0.75, 9);
    useStore.getState().annulla();
  });

  it('il verso del momento decide il segno, non l\'utente', () => {
    const nodo = useStore.getState().progetto.nodi[0].id;
    useStore.getState().impostaCaricoCorrente('momento');
    useStore.getState().impostaValoriCarico({
      valoreMomento: 8000, versoMomento: 'orario',
    });
    applicaCaricoNodale(nodo);
    const orario = useStore.getState().progetto.carichi[0] as unknown as { mz: number };
    expect(orario.mz).toBeCloseTo(-8000, 6);
    useStore.getState().annulla();

    useStore.getState().impostaValoriCarico({ versoMomento: 'antiorario' });
    applicaCaricoNodale(nodo);
    const antiorario = useStore.getState().progetto.carichi[0] as unknown as { mz: number };
    expect(antiorario.mz).toBeCloseTo(8000, 6);
    useStore.getState().annulla();
  });
});

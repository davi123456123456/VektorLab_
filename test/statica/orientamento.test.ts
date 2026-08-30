/**
 * ORIENTAMENTO ASSOLUTO DEI VINCOLI.
 *
 * Un solo parametro, `angolo` ∈ [0°, 360°), che è la direzione di PUNTAMENTO:
 *
 *     û(α) = ( −sin α , cos α )
 *
 * Il test che conta è il primo: due tipi di vincolo con lo stesso angolo
 * devono risultare orientati identicamente. Se non lo sono, da qualche parte
 * è rimasto un offset per tipo — ed è esattamente da lì che nascevano la
 * cerniera e il carrello che finivano in posizioni diverse.
 */

import { describe, it, expect } from 'vitest';
import { progetto } from '../../src/core/builder.js';
import { preset } from '../../src/core/materials/sezioniParametriche.js';
import { analizzaCaso, analizzaStatica } from '../../src/core/index.js';
import {
  normalizzaAngolo, normalizzaGradi, orientamentoVincolo, ribalta,
} from '../../src/core/model/orientamento.js';
import { dofBloccati, angoloNodale } from '../../src/core/fem/assemble.js';
import { useStore, progettoVuoto } from '../../src/state/store.js';
import { posaSuAsta } from '../../src/state/azioni.js';
import { ruotaVincolo } from '../../src/state/commands.js';
import type { LoadCaseId, Progetto, Radianti, TipoVincolo } from '../../src/core/model/types.js';

const CASO = 'principale' as LoadCaseId;
const EB = { teoria: 'eulero-bernoulli' as const };
const g = (x: number) => (x * Math.PI) / 180;
const gradi = (x: number) => (x * 180) / Math.PI;

describe('la formula del puntamento, una sola per tutti', () => {
  it('û punta dove dice la tabella della convenzione', () => {
    const casi: [number, [number, number], string][] = [
      [0, [0, 1], 'alto'],
      [90, [-1, 0], 'sinistra'],
      [180, [0, -1], 'basso'],
      [270, [1, 0], 'destra'],
    ];
    for (const [angolo, atteso, dove] of casi) {
      const o = orientamentoVincolo(g(angolo));
      expect(o.u[0], `${angolo}° punta verso ${dove}`).toBeCloseTo(atteso[0], 12);
      expect(o.u[1], `${angolo}° punta verso ${dove}`).toBeCloseTo(atteso[1], 12);
    }
    // 45° punta in alto a sinistra
    const q = orientamentoVincolo(g(45));
    expect(q.u[0]).toBeLessThan(0);
    expect(q.u[1]).toBeGreaterThan(0);
  });

  it('il piano di posa è perpendicolare al puntamento', () => {
    for (const a of [0, 17, 45, 90, 200, 359]) {
      const o = orientamentoVincolo(g(a));
      expect(o.u[0] * o.piano[0] + o.u[1] * o.piano[1]).toBeCloseTo(0, 12);
    }
  });

  it('l\'angolo copre tutto il giro e si normalizza modulo 360', () => {
    expect(normalizzaGradi(-90)).toBe(270);
    expect(normalizzaGradi(450)).toBe(90);
    expect(normalizzaGradi(360)).toBe(0);
    expect(normalizzaGradi(359)).toBe(359);
    // 165° non è più un limite: 200° e 300° sono valori legittimi
    expect(orientamentoVincolo(g(200)).gradi).toBe(200);
    expect(orientamentoVincolo(g(300)).gradi).toBe(300);
    expect(gradi(normalizzaAngolo(g(-30)))).toBeCloseTo(330, 9);
  });

  it('il ribaltamento è mezzo giro, e due volte torna al punto di partenza', () => {
    expect(gradi(ribalta(g(0)))).toBeCloseTo(180, 9);
    expect(gradi(ribalta(g(270)))).toBeCloseTo(90, 9);
    expect(gradi(ribalta(ribalta(g(37))))).toBeCloseTo(37, 9);
  });
});

describe('nessun offset per tipo: stesso angolo, stesso orientamento', () => {
  /** Struttura minima con un vincolo direzionale nel nodo B. */
  function conVincolo(tipo: TipoVincolo, angolo: number): Progetto {
    const p = progetto(tipo);
    const sez = p.sezioneParametrica('s', preset('IPE 300'));
    const a = p.nodo(0, 0, 'A');
    const b = p.nodo(4, 0, 'B');
    p.asta(a, b, 'S275', sez, EB);
    p.vincolo(a, 'incastro');
    p.vincolo(b, tipo, angolo);
    p.forza(b, 7e3, 5e3);
    return p.costruisci();
  }

  it('cerniera e carrello a 90° hanno lo STESSO angolo memorizzato', () => {
    const cerniera = conVincolo('cerniera', g(90));
    const carrello = conVincolo('carrello', g(90));
    const angoloDi = (p: Progetto) =>
      p.nodi.find((n) => (n.id as string) === 'B')!.vincolo!.angolo;
    expect(gradi(angoloDi(cerniera))).toBeCloseTo(90, 12);
    expect(gradi(angoloDi(carrello))).toBeCloseTo(90, 12);
    // e la rotazione con cui vengono disegnati è la stessa: i due simboli
    // risultano sovrapposti, non ruotati l'uno rispetto all'altro
    expect(orientamentoVincolo(angoloDi(cerniera)).rotazioneSchermo)
      .toBeCloseTo(orientamentoVincolo(angoloDi(carrello)).rotazioneSchermo, 12);
  });

  it('tutti i direzionali bloccano û: stesso angolo, stessa direzione bloccata', () => {
    for (const tipo of ['carrello', 'biella', 'bipendolo', 'pattino'] as const) {
      const v = { tipo, angolo: g(73) as Radianti };
      // y' del riferimento nodale ruotato di `angolo` È û
      expect(dofBloccati(v), tipo).toContain(1);
      expect(dofBloccati(v), tipo).not.toContain(0);
      expect(angoloNodale(v), tipo).toBeCloseTo(g(73), 12);
    }
  });

  it('carrello e biella con lo stesso angolo danno gli stessi spostamenti', () => {
    const risultato = (tipo: TipoVincolo) => {
      const r = analizzaCaso(conVincolo(tipo, g(123)), CASO);
      return [r.spostamenti[3], r.spostamenti[4], r.spostamenti[5]];
    };
    const carrello = risultato('carrello');
    const biella = risultato('biella');
    for (let i = 0; i < 3; i++) expect(biella[i]).toBeCloseTo(carrello[i], 12);
  });
});

describe('le reazioni seguono û', () => {
  function reazioneCarrello(angolo: number) {
    const p = progetto('carrello');
    const sez = p.sezioneParametrica('s', preset('IPE 300'));
    const a = p.nodo(0, 0, 'A');
    const b = p.nodo(0, 4, 'B');
    p.asta(a, b, 'S275', sez, EB);
    p.vincolo(a, 'cerniera');
    p.vincolo(b, 'carrello', angolo);
    p.forza(b, 8e3, -6e3);
    const prog = p.costruisci();
    const e = analizzaStatica(prog, { tipo: 'caso', id: CASO }, {
      sezioniExtra: prog.sezioniPersonalizzate,
    });
    return e.fem.reazioni.find((r) => (r.nodoId as unknown as string) === 'B')!;
  }

  it('0°: reazione verticale', () => {
    const r = reazioneCarrello(0);
    expect(Math.abs(r.fx)).toBeLessThan(1e-6);
    expect(Math.abs(r.fy)).toBeGreaterThan(1e3);
  });

  it('90°: reazione orizzontale', () => {
    const r = reazioneCarrello(g(90));
    expect(Math.abs(r.fx)).toBeGreaterThan(1e3);
    expect(Math.abs(r.fy)).toBeLessThan(1e-6);
  });

  it('45°: reazione a 45°, componenti uguali in modulo', () => {
    const r = reazioneCarrello(g(45));
    expect(Math.abs(Math.abs(r.fx) - Math.abs(r.fy))).toBeLessThan(1e-6);
  });

  it('270° dà la stessa retta d\'azione di 90°: è mezzo giro', () => {
    const a = reazioneCarrello(g(90));
    const b = reazioneCarrello(g(270));
    expect(Math.abs(b.fx)).toBeCloseTo(Math.abs(a.fx), 6);
    expect(Math.abs(b.fy)).toBeCloseTo(Math.abs(a.fy), 6);
  });
});

describe('nessun orientamento dedotto dalla geometria', () => {
  it('posando un vincolo su un\'asta inclinata l\'angolo resta quello scelto', () => {
    const p = progetto('inclinata');
    const sez = p.sezioneParametrica('s', preset('IPE 300'));
    const a = p.nodo(0, 0, 'A');
    const b = p.nodo(4, 4, 'B');           // asta a 45°
    const el = p.asta(a, b, 'S275', sez, EB);
    p.vincolo(a, 'cerniera');
    useStore.setState({
      progetto: progettoVuoto(), passato: [], futuro: [],
      posaSuAsta: 'vincolo', vincoloCorrente: 'carrello', angoloVincolo: 0,
    });
    useStore.getState().caricaProgetto(p.costruisci());

    posaSuAsta(el, 0.5);
    const v = useStore.getState().progetto.vincoliSuAsta![0];
    // 0° anche su un'asta a 45°: il predefinito è sempre lo stesso
    expect(gradi(v.vincolo.angolo)).toBeCloseTo(0, 9);
  });
});

describe('rotazione interattiva', () => {
  it('il comando ricorda da dove a dove, e si annulla', () => {
    const p = progetto('rotazione');
    const sez = p.sezioneParametrica('s', preset('IPE 300'));
    const a = p.nodo(0, 0, 'A');
    const b = p.nodo(4, 0, 'B');
    p.asta(a, b, 'S275', sez, EB);
    p.vincolo(a, 'cerniera');
    p.vincolo(b, 'carrello', 0);
    useStore.setState({ progetto: progettoVuoto(), passato: [], futuro: [] });
    useStore.getState().caricaProgetto(p.costruisci());

    const cmd = ruotaVincolo({ tipo: 'nodo', id: 'B' as never }, g(270), 'carrello');
    useStore.getState().esegui(cmd);
    expect(cmd.etichetta).toBe('Rotazione carrello B: 0° → 270°');
    const dopo = useStore.getState().progetto.nodi.find((n) => (n.id as string) === 'B')!;
    expect(gradi(dopo.vincolo!.angolo)).toBeCloseTo(270, 9);

    useStore.getState().annulla();
    const tornato = useStore.getState().progetto.nodi.find((n) => (n.id as string) === 'B')!;
    expect(gradi(tornato.vincolo!.angolo)).toBeCloseTo(0, 9);
  });

  it('lo stato della rotazione vive fuori dal modello finché non si rilascia', () => {
    const p = progetto('rotazione viva');
    const sez = p.sezioneParametrica('s', preset('IPE 300'));
    const a = p.nodo(0, 0, 'A');
    const b = p.nodo(4, 0, 'B');
    p.asta(a, b, 'S275', sez, EB);
    p.vincolo(b, 'carrello', 0);
    useStore.setState({ progetto: progettoVuoto(), passato: [], futuro: [] });
    useStore.getState().caricaProgetto(p.costruisci());
    const cronologia = useStore.getState().passato.length;

    useStore.getState().avviaRotazioneVincolo({
      bersaglio: { tipo: 'nodo', id: 'B' as never }, tipoVincolo: 'carrello',
      x: 4, y: 0, angoloIniziale: 0, angolo: 0, agganciato: true,
    });
    for (const a of [30, 60, 90]) {
      useStore.getState().aggiornaRotazioneVincolo(g(a), true);
      // il modello NON è ancora cambiato: trascinare non riempie la cronologia
      expect(useStore.getState().passato.length).toBe(cronologia);
      const n = useStore.getState().progetto.nodi.find((x) => (x.id as string) === 'B')!;
      expect(gradi(n.vincolo!.angolo)).toBeCloseTo(0, 9);
    }

    useStore.getState().concludiRotazioneVincolo(true);
    expect(useStore.getState().passato.length).toBe(cronologia + 1);
    const finale = useStore.getState().progetto.nodi.find((x) => (x.id as string) === 'B')!;
    expect(gradi(finale.vincolo!.angolo)).toBeCloseTo(90, 9);
  });

  it('annullare la rotazione lascia tutto com\'era', () => {
    const p = progetto('rotazione annullata');
    const sez = p.sezioneParametrica('s', preset('IPE 300'));
    const a = p.nodo(0, 0, 'A');
    const b = p.nodo(4, 0, 'B');
    p.asta(a, b, 'S275', sez, EB);
    p.vincolo(b, 'carrello', g(45));
    useStore.setState({ progetto: progettoVuoto(), passato: [], futuro: [] });
    useStore.getState().caricaProgetto(p.costruisci());
    const cronologia = useStore.getState().passato.length;

    useStore.getState().avviaRotazioneVincolo({
      bersaglio: { tipo: 'nodo', id: 'B' as never }, tipoVincolo: 'carrello',
      x: 4, y: 0, angoloIniziale: g(45), angolo: g(45), agganciato: true,
    });
    useStore.getState().aggiornaRotazioneVincolo(g(180), true);
    useStore.getState().concludiRotazioneVincolo(false);

    expect(useStore.getState().rotazioneVincolo).toBeNull();
    expect(useStore.getState().passato.length).toBe(cronologia);
    const n = useStore.getState().progetto.nodi.find((x) => (x.id as string) === 'B')!;
    expect(gradi(n.vincolo!.angolo)).toBeCloseTo(45, 9);
  });
});

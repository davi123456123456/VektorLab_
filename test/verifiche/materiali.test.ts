/**
 * Materiali personalizzati: l'acciaio di cui si conosce solo lo snervamento.
 */

import { describe, it, expect } from 'vitest';
import { progetto } from '../../src/core/builder.js';
import { analizzaCaso, verificaStruttura } from '../../src/core/index.js';
import { MATERIALI, materialePerId } from '../../src/core/materials/materials.js';
import {
  aggiungiMateriale, eliminaMateriale, modificaMateriale,
} from '../../src/state/commands.js';
import type { LoadCaseId, MaterialId, Materiale, Progetto } from '../../src/core/model/types.js';

const CASO = 'principale' as LoadCaseId;

function mensola(materialeId: string, personalizzati: Materiale[] = []): Progetto {
  const p = progetto('m');
  const sez = p.sezioneParametrica('s', { famiglia: 'rettangolarePiena', B: 0.1, H: 0.2 });
  const a = p.nodo(0, 0);
  const b = p.nodo(2, 0);
  p.asta(a, b, materialeId, sez, { teoria: 'eulero-bernoulli' });
  p.vincolo(a, 'incastro');
  p.forza(b, 0, -15e3);
  for (const m of personalizzati) p.materiale(m);
  return p.costruisci();
}

function verifica(prog: Progetto) {
  const r = analizzaCaso(prog, CASO, {
    sezioniExtra: prog.sezioniPersonalizzate,
    materialiExtra: prog.materialiPersonalizzati,
  });
  return verificaStruttura(prog, r, {
    sezioniExtra: prog.sezioniPersonalizzate,
    materialiExtra: prog.materialiPersonalizzati,
  }).perAsta[0];
}

describe('acciaio generico', () => {
  it('esiste in libreria SENZA snervamento: è il dato che manca', () => {
    // un valore predefinito verrebbe usato senza accorgersene, e un
    // coefficiente di sicurezza calcolato su una resistenza che nessuno ha
    // dichiarato è peggio di uno che manca: il secondo si vede
    const m = materialePerId('ACCIAIO_GENERICO');
    expect(m.resistenze.fy).toBeUndefined();
    expect(m.E).toBeCloseTo(210e9, 0);
    expect(m.comportamento).toBe('duttile');
  });

  it('ha lo stesso E degli acciai designati: cambia solo la resistenza', () => {
    const generico = materialePerId('ACCIAIO_GENERICO');
    for (const id of ['S235', 'S275', 'S355']) {
      expect(materialePerId(id).E).toBeCloseTo(generico.E, 0);
    }
  });

  it('le tensioni si calcolano lo stesso: dipendono da E, A e I, non da f_y', () => {
    const a = verifica(mensola('ACCIAIO_GENERICO'));
    const b = verifica(mensola('S235'));
    expect(a.sigmaIdeale).toBeCloseTo(b.sigmaIdeale, 6);
  });

  it('dichiarando f_y si ottengono gli stessi numeri dell\'S235', () => {
    const p = mensola('ACCIAIO_GENERICO');
    const conSnervamento: Progetto = {
      ...p,
      materialiPersonalizzati: [{
        ...materialePerId('ACCIAIO_GENERICO'),
        id: 'MIO' as never,
        resistenze: { fy: 235e6 },
      }],
      aste: p.aste.map((a) => ({ ...a, materialeId: 'MIO' as never })),
    };
    const a = verifica(conSnervamento);
    const b = verifica(mensola('S235'));
    expect(a.coefficienteSicurezza).toBeCloseTo(b.coefficienteSicurezza, 9);
  });
});

describe('materiale personalizzato', () => {
  const suMisura: Materiale = {
    ...materialePerId('ACCIAIO_GENERICO'),
    id: 'mioAcciaio' as MaterialId,
    nome: 'Acciaio da certificato',
    resistenze: { fy: 420e6, fu: 520e6 },
  };

  it('prevale sulla libreria ed è usato dall\'analisi', () => {
    const v = verifica(mensola('mioAcciaio', [suMisura]));
    expect(v.resistenza).toBeCloseTo(420e6, 0);
  });

  it('lo snervamento inserito scala il coefficiente di sicurezza', () => {
    const base = verifica(mensola('S235'));
    const mio = verifica(mensola('mioAcciaio', [suMisura]));
    // la tensione non cambia (stesso E, stessa geometria), cambia il margine
    expect(mio.sigmaIdeale).toBeCloseTo(base.sigmaIdeale, 6);
    expect(mio.coefficienteSicurezza / base.coefficienteSicurezza)
      .toBeCloseTo(420 / 235, 6);
  });

  it('senza snervamento il coefficiente non è un numero: è un dato mancante', () => {
    // Infinity è il modo in cui il nucleo dice «non c'è resistenza con cui
    // confrontare»: l'interfaccia lo traduce in un errore esplicito, non in
    // una struttura infinitamente sicura
    const base = verifica(mensola('ACCIAIO_GENERICO'));
    expect(base.sigmaIdeale).toBeGreaterThan(0);
    expect(Number.isFinite(base.coefficienteSicurezza)).toBe(false);
  });

  it('cambiare E cambia la deformata ma non la tensione', () => {
    const morbido: Materiale = { ...suMisura, E: 105e9, G: 105e9 / 2.6 };
    const prog = mensola('mioAcciaio', [suMisura]);
    const progMorbido = mensola('mioAcciaio', [morbido]);
    const opz = (p: Progetto) => ({
      sezioniExtra: p.sezioniPersonalizzate, materialiExtra: p.materialiPersonalizzati,
    });
    const r1 = analizzaCaso(prog, CASO, opz(prog));
    const r2 = analizzaCaso(progMorbido, CASO, opz(progMorbido));
    // isostatica: le sollecitazioni non dipendono da E
    expect(r2.aste[0].M[0]).toBeCloseTo(r1.aste[0].M[0], 6);
    // ma la freccia raddoppia
    expect(r2.spostamentoMassimo / r1.spostamentoMassimo).toBeCloseTo(2, 6);
  });
});

describe('comandi sui materiali', () => {
  const base = () => mensola('ACCIAIO_GENERICO');

  it('aggiungi e annulla', () => {
    const m = { ...materialePerId('S275'), id: 'x' as MaterialId, nome: 'X' };
    const cmd = aggiungiMateriale(m);
    const dopo = cmd.esegui(base());
    expect(dopo.materialiPersonalizzati.length).toBe(1);
    expect(cmd.annulla(dopo).materialiPersonalizzati.length).toBe(0);
  });

  it('modifica lo snervamento e lo ripristina', () => {
    const m = { ...materialePerId('S275'), id: 'x' as MaterialId, nome: 'X' };
    const conMat = aggiungiMateriale(m).esegui(base());
    const cmd = modificaMateriale('x', { resistenze: { fy: 500e6 } });
    const dopo = cmd.esegui(conMat);
    expect(dopo.materialiPersonalizzati[0].resistenze.fy).toBe(500e6);
    // le altre resistenze restano
    expect(dopo.materialiPersonalizzati[0].resistenze.fu).toBe(430e6);
    const tornato = cmd.annulla(dopo);
    expect(tornato.materialiPersonalizzati[0].resistenze.fy).toBe(275e6);
  });

  it('eliminare un materiale riassegna le aste che lo usavano', () => {
    const m = { ...materialePerId('S275'), id: 'x' as MaterialId, nome: 'X' };
    let p = aggiungiMateriale(m).esegui(base());
    p = { ...p, aste: p.aste.map((a) => ({ ...a, materialeId: 'x' as never })) };

    const cmd = eliminaMateriale('x', 'ACCIAIO_GENERICO');
    const dopo = cmd.esegui(p);
    expect(dopo.materialiPersonalizzati.length).toBe(0);
    expect(dopo.aste.every((a) => (a.materialeId as string) === 'ACCIAIO_GENERICO')).toBe(true);

    const tornato = cmd.annulla(dopo);
    expect(tornato.materialiPersonalizzati.length).toBe(1);
    expect(tornato.aste.every((a) => (a.materialeId as string) === 'x')).toBe(true);
  });
});

describe('coerenza della libreria', () => {
  it('ogni materiale dichiara almeno una resistenza positiva', () => {
    // attenzione: `??` non basta, perché il calcestruzzo fessurato dichiara
    // deliberatamente f_t = 0 — non resiste a trazione — e uno zero è un
    // valore, non un'assenza
    for (const m of MATERIALI) {
      // l'acciaio generico è l'eccezione VOLUTA: non dichiara resistenze
      // perché è il materiale di cui l'utente conosce solo la rigidezza
      if ((m.id as unknown as string) === 'ACCIAIO_GENERICO') {
        expect(Object.keys(m.resistenze).length).toBe(0);
        continue;
      }
      const r = m.resistenze;
      const massima = Math.max(r.fy ?? 0, r.fu ?? 0, r.ft ?? 0, r.fc ?? 0, r.fm ?? 0);
      expect(massima, `${m.nome} non ha resistenze`).toBeGreaterThan(0);
    }
  });

  it('il calcestruzzo fessurato dichiara f_t = 0 e la verifica lo segnala', () => {
    const cls = MATERIALI.find((m) => (m.id as string) === 'C25_30_FESS')!;
    expect(cls.resistenze.ft).toBe(0);
    // una trave inflessa ha sempre una zona tesa: la verifica deve fallire
    // e spiegare perché, invece di dare un numero senza senso
    const v = verifica(mensola('C25_30_FESS'));
    expect(v.verificato).toBe(false);
    expect(v.note.join(' ')).toContain('non resiste a trazione');
  });

  it('G è coerente con E e ν per gli isotropi', () => {
    for (const m of MATERIALI) {
      if (m.comportamento === 'ortotropo') continue;
      expect(m.G, m.nome).toBeCloseTo(m.E / (2 * (1 + m.nu)), 0);
    }
  });

  it('i fragili dichiarano resistenze asimmetriche', () => {
    for (const m of MATERIALI.filter((x) => x.comportamento === 'fragile')) {
      expect(m.resistenze.ft, m.nome).toBeDefined();
      expect(m.resistenze.fc, m.nome).toBeDefined();
      expect(m.resistenze.fc!).toBeGreaterThanOrEqual(m.resistenze.ft!);
    }
  });
});

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { confronta } from '../../src/foto/confronto.js';
import { leggi } from '../../src/foto/index.js';
import { rivedi } from '../../src/foto/plausibilita.js';
import type { Primitive, TipoCorpo } from '../../src/foto/tipi.js';
import { disegno, type Disegno } from './aiuti.js';

const cartella = dirname(fileURLToPath(import.meta.url));

/** Le primitive del disegno, con i punteggi della rete sul corpo di un certo tipo. */
function conPunteggi(d: Disegno, tipo: TipoCorpo, punteggi: Partial<Record<TipoCorpo, number>>, quale = 0): Primitive {
  const p = d.primitive();
  const k = p.corpi.filter((c) => c.tipo === tipo)[quale];
  k.punteggi = punteggi;
  return p;
}

/** La revisione legge come il disegno giusto. */
function comeGiusto(p: Primitive, giusto: Disegno) {
  const r = rivedi(p);
  const c = confronta(r.lettura.progetto, leggi(giusto.primitive()).progetto);
  expect(c.differenze).toEqual([]);
  return r;
}

const travi = (tipo: TipoCorpo, destra: TipoCorpo = 'triangoloRulli') => disegno().asta(0, 0, 2, 0)
  .appoggio(tipo, 0, 0, 0).appoggio(destra, 2, 0, 0)
  .quota(2, 0, -0.6, 2, -0.6);

describe('vincoli che negli esami non ci sono', () => {
  it('pattino esterno: il tipo successivo secondo la rete (doppio pendolo)', () => {
    // con una cerniera a destra la trave non è labile: resta solo la correzione del tipo
    const r = comeGiusto(conPunteggi(travi('pattino', 'triangolo'), 'pattino', { pattino: 0.6, doppioPendolo: 0.3, triangolo: 0.05 }),
      travi('doppioPendolo', 'triangolo'));
    expect(r.correzioni.map((a) => a.codice)).toEqual(['revisione']);
  });

  it('biella senza punteggi: carrello', () => {
    comeGiusto(travi('biella').primitive(), travi('triangoloRulli'));
  });

  it('il pattino interno resta', () => {
    const d = disegno().asta(0, 0, 1, 0).asta(1, 0, 2, 0).corpo('pattinoInterno', 1, 0, 90)
      .appoggio('incastro', 0, 0, 270, { pallino: false }).appoggio('triangoloRulli', 2, 0, 0)
      .quota(1, 0, -0.6, 1, -0.6).quota(1, 1, -0.6, 2, -0.6);
    expect(rivedi(d.primitive()).correzioni.filter((a) => a.messaggio.includes('pattino'))).toEqual([]);
  });
});

describe('incastri dove un\'asta finisce', () => {
  const trave = (tipo: TipoCorpo) => disegno().asta(0, 0, 2, 0)
    .appoggio('triangoloRulli', 0, 0, 0).appoggio('triangoloRulli', 2, 0, 0)
    .appoggio(tipo, 1, 0, 0, { pallino: false })
    .quota(1, 0, -0.6, 1, -0.6).quota(1, 1, -0.6, 2, -0.6);

  it('a metà trave diventa il tipo successivo (cerniera)', () => {
    comeGiusto(conPunteggi(trave('incastro'), 'incastro', { incastro: 0.5, triangolo: 0.3, triangoloRulli: 0.1 }),
      trave('triangolo'));
  });

  it('fra due aste allineate a 180° diventa cerniera', () => {
    const d = (tipo: TipoCorpo) => disegno().asta(0, 0, 1, 0).asta(1, 0, 2, 0)
      .appoggio('triangoloRulli', 0, 0, 0).appoggio('triangoloRulli', 2, 0, 0)
      .appoggio(tipo, 1, 0, 0, { pallino: false })
      .quota(1, 0, -0.6, 1, -0.6).quota(1, 1, -0.6, 2, -0.6);
    comeGiusto(d('incastro').primitive(), d('triangolo'));
  });

  it('due incastri vicini a metà asta sono un doppio pendolo interno (le sue due piastre)', () => {
    const letta = disegno().asta(0, 0, 2, 0)
      .appoggio('triangolo', 0, 0, 0).appoggio('triangoloRulli', 2, 0, 0)
      .corpo('incastro', 0.92, 0, 90).corpo('incastro', 1.08, 0, 270)
      .quota(1, 0, -0.6, 1, -0.6).quota(1, 1, -0.6, 2, -0.6);
    // la convenzione della lettura: le aste si interrompono attorno al simbolo interno
    const giusta = disegno().asta(0, 0, 0.95, 0).asta(1.05, 0, 2, 0)
      .appoggio('triangolo', 0, 0, 0).appoggio('triangoloRulli', 2, 0, 0)
      .corpo('doppioPendoloInterno', 1, 0, 0)
      .quota(1, 0, -0.6, 1, -0.6).quota(1, 1, -0.6, 2, -0.6);
    const r = comeGiusto(letta.primitive(), giusta);
    expect(r.correzioni.some((a) => a.messaggio.includes('doppio pendolo interno'))).toBe(true);
  });

  it('all\'estremo e allo spigolo di un telaio resta', () => {
    const estremo = disegno().asta(0, 0, 0, 1).asta(0, 1, 1, 1)
      .appoggio('incastro', 0, 0, 0, { pallino: false }).appoggio('triangoloRulli', 1, 1, 0)
      .quota(1, -0.5, 0, -0.5, 1).quota(1, 0, 1.5, 1, 1.5);
    expect(rivedi(estremo.primitive()).correzioni).toEqual([]);
    const spigolo = disegno().asta(0, 0, 0, 1).asta(0, 1, 1, 1)
      .appoggio('incastro', 0, 1, 90, { pallino: false }).appoggio('triangoloRulli', 1, 1, 0)
      .quota(1, -0.5, 0, -0.5, 1).quota(1, 0, 1.5, 1, 1.5);
    expect(rivedi(spigolo.primitive()).correzioni.filter((a) => a.messaggio.includes('incastro'))).toEqual([]);
  });
});

describe('pezzi staccati', () => {
  it('due pezzi allineati con niente in mezzo si collegano', () => {
    // un buco di 0,6 L: la lettura di base non lo salta da sola
    const rotta = disegno().asta(0, 0, 0.8, 0).asta(1.4, 0, 2, 0)
      .appoggio('triangolo', 0, 0, 0).appoggio('triangoloRulli', 2, 0, 0).quota(2, 0, -0.6, 2, -0.6);
    const r = comeGiusto(rotta.primitive(), travi('triangolo'));
    expect(r.correzioni.some((a) => a.messaggio.includes('tratto d\'asta'))).toBe(true);
  });
});

describe('gli esercizi non sono labili', () => {
  it('due carrelli: quello di cui la rete era meno sicura diventa cerniera', () => {
    const d = travi('triangoloRulli');
    const p = d.primitive();
    p.corpi[0].punteggi = { triangoloRulli: 0.5, triangolo: 0.45 };
    p.corpi[1].punteggi = { triangoloRulli: 0.9, triangolo: 0.05 };
    const r = comeGiusto(p, travi('triangolo'));
    expect(r.correzioni.some((a) => a.messaggio.includes('labile'))).toBe(true);
  });

  it('se manca proprio un vincolo non si cambia niente a caso: solo l\'avviso', () => {
    const d = disegno().asta(0, 0, 2, 0).appoggio('triangoloRulli', 0, 0, 0).quota(2, 0, -0.6, 2, -0.6);
    const p = d.primitive();
    p.corpi[0].punteggi = { triangoloRulli: 0.95, triangolo: 0.03, incastro: 0.01 };
    const r = rivedi(p);
    expect(confronta(r.lettura.progetto, leggi(d.primitive()).progetto).differenze).toEqual([]);
    expect(r.correzioni.map((a) => a.messaggio)).toEqual(['La struttura letta è labile: controlla i vincoli.']);
  });
});

describe('una lettura plausibile non si tocca', () => {
  for (const sotto of ['campioni', 'campioni-foto']) {
    it(sotto, () => {
      let toccate = 0;
      for (const f of readdirSync(join(cartella, sotto)).filter((x) => x.endsWith('.json'))) {
        const p = JSON.parse(readFileSync(join(cartella, sotto, f), 'utf8')).primitive as Primitive;
        const r = rivedi(p);
        const cambi = r.correzioni.filter((a) => !a.messaggio.startsWith('La struttura letta è labile'));
        if (cambi.length > 0) {
          toccate++;
          continue;
        }
        expect(confronta(r.lettura.progetto, leggi(p).progetto).differenze, f).toEqual([]);
      }
      expect(toccate).toBe(0);
    });
  }
});

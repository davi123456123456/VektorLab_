import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { confronta } from '../../src/foto/confronto.js';
import { leggi } from '../../src/foto/index.js';
import { LABILE, rivedi } from '../../src/foto/plausibilita.js';
import { analizzaCinematica } from '../../src/core/index.js';
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
    // incastro + doppio pendolo interno + carrello: isostatica (con una cerniera a sinistra sarebbe labile)
    const letta = disegno().asta(0, 0, 2, 0)
      .appoggio('incastro', 0, 0, 270, { pallino: false }).appoggio('triangoloRulli', 2, 0, 0)
      .corpo('incastro', 0.92, 0, 90).corpo('incastro', 1.08, 0, 270)
      .quota(1, 0, -0.6, 1, -0.6).quota(1, 1, -0.6, 2, -0.6);
    // la convenzione della lettura: le aste si interrompono attorno al simbolo interno
    const giusta = disegno().asta(0, 0, 0.95, 0).asta(1.05, 0, 2, 0)
      .appoggio('incastro', 0, 0, 270, { pallino: false }).appoggio('triangoloRulli', 2, 0, 0)
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
    expect(r.correzioni.map((a) => a.messaggio)).toEqual([LABILE]);
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

describe('dalla revisione indipendente', () => {
  const labilita = (l: ReturnType<typeof leggi>) => analizzaCinematica(l.progetto).labilita;

  it('un tratto minuscolo con un simbolo non fa crollare la revisione', () => {
    const p = disegno().asta(0, 0, 2, 0)
      .appoggio('triangolo', 0, 0, 0).appoggio('triangoloRulli', 2, 0, 0)
      .asta(2.6, 0.5, 2.64, 0.5).corpo('incastro', 2.6, 0.5, 90)
      .quota(2, 0, -0.6, 2, -0.6).primitive();
    expect(() => rivedi(p)).not.toThrow();
  });

  it('una colonna che si ferma sotto la trave si collega a T, non all\'appoggio', () => {
    const d = (giunta: boolean) => disegno().asta(0, 2, 2, 2).asta(1, 0, 1, giunta ? 2 : 1.6)
      .appoggio('triangolo', 0, 2, 0).appoggio('triangoloRulli', 2, 2, 0).appoggio('incastro', 1, 0, 0, { pallino: false })
      .quota(2, 0, 2.6, 2, 2.6).quota(2, -0.6, 0, -0.6, 2);
    comeGiusto(d(false).primitive(), d(true));
  });

  it('una sezione disegnata accanto alla trave non si salda alla struttura', () => {
    const p = disegno().asta(0, 0, 3, 0)
      .appoggio('triangolo', 0, 0, 0).appoggio('triangoloRulli', 3, 0, 0)
      .asta(4, -0.3, 4.4, -0.3).asta(4, 0.3, 4.4, 0.3).asta(4.2, -0.3, 4.2, 0.3)
      .quota(3, 0, -0.6, 3, -0.6).primitive();
    expect(rivedi(p).correzioni.filter((a) => a.messaggio.includes('tratto d\'asta'))).toEqual([]);
  });

  it('il collegamento non trasforma un incastro giusto in cerniera', () => {
    const mensola = () => disegno().asta(0, 0, 2, 0).appoggio('incastro', 0, 0, 270, { pallino: false }).quota(2, 0, -0.6, 2, -0.6);
    for (const p of [mensola().asta(-0.9, 0, -0.35, 0).primitive(), mensola().asta(-0.06, -0.5, -0.06, 0.5).primitive()]) {
      const r = rivedi(p);
      expect(r.correzioni.filter((a) => a.messaggio.includes('incastro'))).toEqual([]);
      expect(labilita(r.lettura)).toBe(0);
    }
  });

  it('una sezione accanto alla trave, senza vincoli, si toglie con l\'avviso', () => {
    const p = disegno().asta(0, 0, 3, 0)
      .appoggio('triangolo', 0, 0, 0).appoggio('triangoloRulli', 3, 0, 0)
      .asta(4, -0.3, 4.4, -0.3).asta(4, 0.3, 4.4, 0.3).asta(4.2, -0.3, 4.2, 0.3)
      .quota(3, 0, -0.6, 3, -0.6).primitive();
    const r = rivedi(p);
    expect(r.lettura.progetto.aste.length).toBe(1);
    expect(r.correzioni.some((a) => a.messaggio.includes('tratto staccato'))).toBe(true);
  });

  it('il doppio pendolo interno si annuncia solo se è stato davvero letto', () => {
    for (const piastre of [0.08, 0.3]) {
      const p = disegno().asta(0, 0, 6, 0)
        .appoggio('incastro', 0, 0, 270, { pallino: false }).appoggio('triangoloRulli', 6, 0, 0)
        .corpo('incastro', 3 - piastre, 0, 90).corpo('incastro', 3 + piastre, 0, 270)
        .quota(3, 0, -0.6, 3, -0.6).quota(3, 3, -0.6, 6, -0.6).primitive();
      const r = rivedi(p);
      if (r.correzioni.some((a) => a.messaggio.includes('doppio pendolo interno'))) {
        expect(r.lettura.grafo.giunti.some((g) => g.tipo === 'bipendolo')).toBe(true);
      }
    }
  });

  it('le due piastre lette con l\'asta già interrotta fra loro sono un doppio pendolo interno', () => {
    // come nella foto 02: la rete interrompe l'asta fra le due piastre e la lettura riunisce i due pezzi
    const letta = disegno().asta(0, 0, 0.9, 0).asta(1.1, 0, 2, 0)
      .appoggio('incastro', 0, 0, 270, { pallino: false }).appoggio('triangoloRulli', 2, 0, 0)
      .corpo('incastro', 0.92, 0, 90).corpo('incastro', 1.08, 0, 270)
      .quota(1, 0, -0.6, 1, -0.6).quota(1, 1, -0.6, 2, -0.6);
    const giusta = disegno().asta(0, 0, 0.95, 0).asta(1.05, 0, 2, 0)
      .appoggio('incastro', 0, 0, 270, { pallino: false }).appoggio('triangoloRulli', 2, 0, 0)
      .corpo('doppioPendoloInterno', 1, 0, 0)
      .quota(1, 0, -0.6, 1, -0.6).quota(1, 1, -0.6, 2, -0.6);
    const r = comeGiusto(letta.primitive(), giusta);
    expect(r.correzioni.some((a) => a.messaggio.includes('doppio pendolo interno'))).toBe(true);
  });

  it('le piastre sulle estremità dell\'asta interrotta, lontane dal centro: le estremità si avvicinano al simbolo', () => {
    // come nella foto 02: ogni piastra sta sull'estremità di un pezzo, e le
    // estremità sono più lontane dal centro di quanto la lettura cerchi
    const letta = disegno().asta(0, 0, 1.84, 0).asta(2.16, 0, 4, 0)
      .appoggio('incastro', 0, 0, 270, { pallino: false }).appoggio('triangoloRulli', 4, 0, 0)
      .corpo('incastro', 1.84, 0, 90).corpo('incastro', 2.16, 0, 270)
      .quota(2, 0, -0.6, 2, -0.6).quota(2, 2, -0.6, 4, -0.6);
    const giusta = disegno().asta(0, 0, 1.95, 0).asta(2.05, 0, 4, 0)
      .appoggio('incastro', 0, 0, 270, { pallino: false }).appoggio('triangoloRulli', 4, 0, 0)
      .corpo('doppioPendoloInterno', 2, 0, 0)
      .quota(2, 0, -0.6, 2, -0.6).quota(2, 2, -0.6, 4, -0.6);
    const r = comeGiusto(letta.primitive(), giusta);
    expect(r.correzioni.some((a) => a.messaggio.includes('doppio pendolo interno'))).toBe(true);
  });

  it('il doppio pendolo interno va nel nodo che la lettura aveva già, dove sono attaccate le quote', () => {
    // foto 02: la quota finisce sulla prima piastra, dove la lettura ha messo il nodo
    const quote = (d: Disegno) => d.quota(1, 0, -0.6, 1.84, -0.6).quota(1, 1.84, -0.6, 4, -0.6);
    const letta = quote(disegno().asta(0, 0, 1.84, 0).asta(2.16, 0, 4, 0)
      .appoggio('incastro', 0, 0, 270, { pallino: false }).appoggio('triangoloRulli', 4, 0, 0)
      .corpo('incastro', 1.84, 0, 90).corpo('incastro', 2.16, 0, 270));
    const giusta = quote(disegno().asta(0, 0, 1.79, 0).asta(1.89, 0, 4, 0)
      .appoggio('incastro', 0, 0, 270, { pallino: false }).appoggio('triangoloRulli', 4, 0, 0)
      .corpo('doppioPendoloInterno', 1.84, 0, 0));
    const r = comeGiusto(letta.primitive(), giusta);
    expect(r.lettura.avvisi.map((a) => a.codice)).not.toContain('nessunaQuota');
  });

  it('due incastri vicino a un nodo a T non diventano un doppio pendolo interno', () => {
    const p = disegno().asta(0, 1, 2, 1).asta(1, 0, 1, 1)
      .appoggio('triangolo', 0, 1, 0).appoggio('triangoloRulli', 2, 1, 0).appoggio('incastro', 1, 0, 0, { pallino: false })
      .corpo('incastro', 0.93, 1, 90).corpo('incastro', 1.07, 1, 270)
      .quota(2, 0, 1.6, 2, 1.6).quota(1, -0.6, 0, -0.6, 1).primitive();
    expect(rivedi(p).correzioni.filter((a) => a.messaggio.includes('doppio pendolo interno'))).toEqual([]);
  });

  it('labile per una cerniera interna in più: non si cambia un appoggio giusto, si avvisa', () => {
    const p = disegno().asta(0, 0, 1, 0).asta(1, 0, 2, 0).cerniera(1, 0)
      .appoggio('triangolo', 0, 0, 0).appoggio('triangoloRulli', 2, 0, 0)
      .quota(1, 0, -0.6, 1, -0.6).quota(1, 1, -0.6, 2, -0.6).primitive();
    p.corpi.forEach((k) => { k.punteggi = k.tipo === 'triangolo' ? { triangolo: 0.7, incastro: 0.25, triangoloRulli: 0.3 } : { triangoloRulli: 0.7, triangolo: 0.3 }; });
    const r = rivedi(p);
    expect(confronta(r.lettura.progetto, leggi(p).progetto).differenze).toEqual([]);
    expect(r.correzioni.map((a) => a.messaggio)).toEqual([LABILE]);
  });

  it('una struttura grande e molto labile non fa aspettare', () => {
    const d = disegno();
    const n = 40;
    for (let i = 0; i < n; i++) d.asta(i, 0, i + 1, 0);
    for (let i = 1; i < n; i++) d.cerniera(i, 0);
    d.appoggio('triangoloRulli', 0, 0, 0).appoggio('triangoloRulli', n, 0, 0).quota(1, 0, -0.6, 1, -0.6);
    const p = d.primitive();
    for (const k of p.corpi) k.punteggi = { triangoloRulli: 0.6, triangolo: 0.21, incastro: 0.2, doppioPendolo: 0.2 };
    const t = performance.now();
    rivedi(p);
    expect(performance.now() - t).toBeLessThan(600);
  });

  it('il tipo scelto è quello che dice la rete, non il ripiego fisso', () => {
    comeGiusto(conPunteggi(travi('pattino', 'triangolo'), 'pattino', { pattino: 0.6, triangolo: 0.35, doppioPendolo: 0.1 }),
      travi('triangolo', 'triangolo'));
  });

  it('labile: cambia prima il vincolo di cui la rete era meno sicura, e lo dice in italiano corretto', () => {
    const p = travi('triangoloRulli').primitive();
    p.corpi[0].punteggi = { triangoloRulli: 0.6, triangolo: 0.3 };
    p.corpi[1].punteggi = { triangoloRulli: 0.5, triangolo: 0.45 };
    const r = rivedi(p);
    expect(confronta(r.lettura.progetto, leggi(disegno().asta(0, 0, 2, 0)
      .appoggio('triangoloRulli', 0, 0, 0).appoggio('triangolo', 2, 0, 0).quota(2, 0, -0.6, 2, -0.6).primitive()).progetto).differenze).toEqual([]);
    const testo = r.correzioni.map((a) => a.messaggio).join(' ');
    expect(testo).not.toMatch(/un cerniera|un biella|ho preso/);
    expect(testo).toContain('da carrello a cerniera');
  });
});

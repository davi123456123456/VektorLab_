/**
 * §4.2 e §6 — IL DOCUMENTO PRODOTTO.
 *
 * Non si verifica qui che sia BELLO — quello si guarda, ed è il §6 — ma che
 * sia un PDF valido, che il testo ci sia davvero come testo, che i font siano
 * incorporati e che i NUMERI siano quelli del motore. L'ultima è la proprietà
 * che conta di più: il §0 vieta all'esportazione di ricalcolare qualcosa, e un
 * numero diverso da quello a schermo è un difetto anche se il PDF è perfetto.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  analizzaCaso, analizzaCinematica, analizzaStatica, espandi,
  preparaPerAnalisi, verificaStruttura,
} from '../../src/core/index.js';
import { coefficienteCritico } from '../../src/core/checks/coefficiente.js';
import { etichette } from '../../src/state/etichette.js';
import { componiRelazione } from '../../src/esporta/relazione.js';
import { CONTENUTI_PREDEFINITI } from '../../src/esporta/contenuti.js';
import { MODELLI } from '../baseline/modelli.js';
import type { LoadCaseId, Progetto } from '../../src/core/model/types.js';

const CASO = 'principale' as LoadCaseId;

const font = {
  regolare: new Uint8Array(readFileSync('src/esporta/font/Roboto-Regular.ttf')),
  grassetto: new Uint8Array(readFileSync('src/esporta/font/Roboto-Bold.ttf')),
};

async function relazione(pr: Progetto) {
  const risultato = analizzaCaso(pr, CASO);
  const statica = analizzaStatica(pr, { tipo: 'caso', id: CASO }, {}, risultato);
  return {
    risultato,
    byte: await componiRelazione({
      titolo: 'Prova', autore: 'A B', data: '5 settembre 2026',
      progetto: pr,
      modelloRisultati: espandi(preparaPerAnalisi(pr)).progetto,
      carichi: pr.carichi.filter((k) => k.casoId === CASO),
      etichette: etichette(pr),
      risultato,
      cinematica: analizzaCinematica(pr),
      coefficiente: coefficienteCritico(pr, risultato),
      verifiche: verificaStruttura(pr, risultato),
      autoverifiche: statica.autoverifiche,
      componentiReazione: statica.componentiEsterne,
      contenuti: { ...CONTENUTI_PREDEFINITI, diagnostica: true },
      font,
    }),
  };
}

const testo = (b: Uint8Array) => Buffer.from(b).toString('latin1');

describe('§4.2 — il file è un PDF valido', () => {
  it('comincia con l intestazione e finisce con il marcatore di fine', async () => {
    const { byte } = await relazione(MODELLI[0].progetto);
    const s = testo(byte);
    expect(s.startsWith('%PDF-1.')).toBe(true);
    expect(s.trimEnd().endsWith('%%EOF')).toBe(true);
  });

  it('la tabella degli oggetti dichiara quanti ne contiene', async () => {
    const { byte } = await relazione(MODELLI[0].progetto);
    const s = testo(byte);
    const dichiarati = Number(/\/Size (\d+)/.exec(s)?.[1]);
    const presenti = [...s.matchAll(/^(\d+) 0 obj$/gm)].length;
    expect(dichiarati).toBe(presenti + 1);   // l'oggetto 0 non esiste
  });

  it('l offset di ogni oggetto punta davvero a quell oggetto', async () => {
    const { byte } = await relazione(MODELLI[0].progetto);
    const s = testo(byte);
    const xref = /xref\n0 (\d+)\n([\s\S]*?)trailer/.exec(s);
    expect(xref, 'tabella xref assente').not.toBeNull();
    const righe = xref![2].trimEnd().split('\n');
    // la prima riga è l'oggetto libero 0
    for (let i = 1; i < righe.length; i++) {
      const off = Number(righe[i].slice(0, 10));
      expect(s.slice(off, off + 20)).toMatch(new RegExp(`^${i} 0 obj`));
    }
  });
});

describe('§4.2 — i font sono incorporati', () => {
  it('due font, con i loro byte e la tabella delle larghezze', async () => {
    const { byte } = await relazione(MODELLI[0].progetto);
    const s = testo(byte);
    expect([...s.matchAll(/\/FontFile2 \d+ 0 R/g)].length).toBe(2);
    expect([...s.matchAll(/\/Subtype \/TrueType/g)].length).toBe(2);
    // 224 larghezze per font: dal codice 32 al 255
    for (const m of s.matchAll(/\/Widths \[([^\]]+)\]/g)) {
      expect(m[1].trim().split(/\s+/).length).toBe(224);
    }
    // e i byte del font ci sono per intero
    expect(byte.length).toBeGreaterThan(240_000);
  });
});

describe('§4.2 — il testo è testo', () => {
  it('le scritte compaiono come operatori di testo, non come disegni', async () => {
    const { byte } = await relazione(MODELLI[0].progetto);
    const s = testo(byte);
    // BT … Tj … ET: se le scritte fossero immagini, non ce ne sarebbe nessuno
    expect([...s.matchAll(/BT\n/g)].length).toBeGreaterThan(50);
    expect(s).toContain('Convenzioni adottate');
  });

  it('nessuna immagine rasterizzata nel documento', async () => {
    const { byte } = await relazione(MODELLI[0].progetto);
    expect(testo(byte)).not.toContain('/Subtype /Image');
  });
});

describe('§0 — i numeri sono quelli del motore, non ricalcolati', () => {
  for (const nome of ['mensola-forza', 'appoggiata-distribuito', 'gerber',
                      'portale-tre-cerniere']) {
    it(`${nome}: le reazioni del PDF sono quelle del risultato`, async () => {
      const m = MODELLI.find((x) => x.nome === nome)!;
      const { byte, risultato } = await relazione(m.progetto);
      const s = testo(byte);
      for (const r of risultato.reazioni) {
        for (const v of [r.fx, r.fy, r.mz]) {
          if (Math.abs(v) < 1e-9) continue;
          // come lo scrive il documento: due decimali, virgola, meno unicode
          const atteso = (v / 1e3).toFixed(2).replace('.', ',').replace(/^-/, '−');
          // nel flusso il testo è in ottale per i caratteri alti: si cerca la
          // parte ASCII, che per un numero è tutto tranne l'eventuale meno
          const cifre = atteso.replace('−', '');
          expect(s.includes(cifre), `${nome}: manca ${atteso}`).toBe(true);
        }
      }
    });
  }

  it('e lo spostamento massimo coincide', async () => {
    const m = MODELLI.find((x) => x.nome === 'gerber')!;
    const { byte, risultato } = await relazione(m.progetto);
    const mm = (risultato.spostamentoMassimo * 1e3).toFixed(2).replace('.', ',');
    expect(testo(byte)).toContain(mm);
  });
});

describe('§2 — i contenuti scelti sono quelli che finiscono nel documento', () => {
  it('spegnendo un blocco, il suo titolo sparisce', async () => {
    const pr = MODELLI.find((x) => x.nome === 'gerber')!.progetto;
    const risultato = analizzaCaso(pr, CASO);
    const statica = analizzaStatica(pr, { tipo: 'caso', id: CASO }, {}, risultato);
    const comune = {
      titolo: 'Prova', autore: 'A B', data: 'oggi',
      progetto: pr,
      modelloRisultati: espandi(preparaPerAnalisi(pr)).progetto,
      carichi: pr.carichi.filter((k) => k.casoId === CASO),
      etichette: etichette(pr),
      risultato,
      cinematica: analizzaCinematica(pr),
      coefficiente: coefficienteCritico(pr, risultato),
      verifiche: verificaStruttura(pr, risultato),
      autoverifiche: statica.autoverifiche,
      componentiReazione: statica.componentiEsterne,
      font,
    };
    const con = testo(await componiRelazione({
      ...comune, contenuti: { ...CONTENUTI_PREDEFINITI, dati: true },
    }));
    const senza = testo(await componiRelazione({
      ...comune, contenuti: { ...CONTENUTI_PREDEFINITI, dati: false },
    }));
    expect(con).toContain('Dati del modello');
    expect(senza).not.toContain('Dati del modello');
    expect(senza.length).toBeLessThan(con.length);
  });
});

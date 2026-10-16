import { describe, expect, it } from 'vitest';
import { confronta } from '../../src/foto/confronto.js';
import { leggi } from '../../src/foto/index.js';
import { tracciaAste } from '../../src/foto/rete/aste.js';
import { decodifica } from '../../src/foto/rete/decodifica.js';
import { decodificaPuntuali } from '../../src/foto/rete/puntuali.js';
import type { Uscite } from '../../src/foto/rete/tensori.js';
import * as V from '../../src/foto/rete/vocabolario.js';
import { schemaInProgetto } from '../../src/foto/schema.js';
import type { Punto } from '../../src/foto/tipi.js';
import { caricaIdeale, nomiIdeali } from './aiuti-rete.js';

const ritagli = nomiIdeali().filter((n) => n.startsWith('ideale-20000'));
const dist = (a: Punto, b: Punto) => Math.hypot(a.x - b.x, a.y - b.y);

describe('aste dalla segmentazione (uscite ideali)', () => {
  it('ritrova ogni asta senza inventarne', () => {
    let vere = 0, trovate = 0, giuste = 0;
    for (const nome of ritagli) {
      const f = caricaIdeale(nome);
      const giu = (q: Punto): Punto => ({ x: q.x, y: f.altezza - q.y });
      const p = decodificaPuntuali(f.uscite);
      const aste = tracciaAste(f.uscite, p.nodi, p.pallini);
      const coincide = (s: { a: Punto; b: Punto }, t: { a: Punto; b: Punto }) =>
        (dist(s.a, t.a) <= 6 && dist(s.b, t.b) <= 6) || (dist(s.a, t.b) <= 6 && dist(s.b, t.a) <= 6);
      const veri = f.primitive.aste.map((s) => ({ a: giu(s.a), b: giu(s.b), spessore: s.spessore }));
      for (const s of veri) {
        const t = aste.find((x) => coincide(x, s));
        expect(t, `${nome}: asta ${JSON.stringify(s)}`).toBeDefined();
        expect(t!.spessore).toBeGreaterThan(0.5 * s.spessore);
        expect(t!.spessore).toBeLessThan(2 * s.spessore);
      }
      vere += veri.length;
      trovate += aste.length;
      giuste += aste.filter((x) => veri.some((s) => coincide(x, s))).length;
    }
    expect(vere).toBeGreaterThan(20);
    expect(giuste / trovate).toBeGreaterThanOrEqual(0.95);
  });

  it('un pallino che interrompe la linea divide l\'asta', () => {
    // asta orizzontale da x = 20 a x = 220 (y = 41) interrotta da un pallino in x = 120
    const h2 = 48, w2 = 128;
    const u: Uscite = { seg: new Uint8Array(h2 * w2), h2, w2, testa: new Float32Array(V.CANALI * 24 * 64), h4: 24, w4: 64 };
    for (let j = 10; j <= 110; j++) if (j < 55 || j > 65) u.seg[20 * w2 + j] = V.CLASSE.asta;
    for (let j = 57; j <= 63; j++) for (let i = 17; i <= 23; i++) u.seg[i * w2 + j] = V.CLASSE.simbolo;
    const nodi = [{ x: 20.5, y: 40.5 }, { x: 108.5, y: 40.5 }, { x: 132.5, y: 40.5 }, { x: 220.5, y: 40.5 }];
    const aste = tracciaAste(u, nodi, [{ c: { x: 120.5, y: 40.5 }, r: 7, confidenza: 1 }]);
    expect(aste).toHaveLength(2);
  });

  it('anche un pallino piccolo, con un buco di pochi pixel, divide l\'asta', () => {
    // buco di 10 px (5 celle meno l'intorno di una cella): non basta la copertura
    const h2 = 48, w2 = 128;
    const u: Uscite = { seg: new Uint8Array(h2 * w2), h2, w2, testa: new Float32Array(V.CANALI * 24 * 64), h4: 24, w4: 64 };
    for (let j = 10; j <= 110; j++) if (j < 58 || j > 62) u.seg[20 * w2 + j] = V.CLASSE.asta;
    u.seg[20 * w2 + 60] = V.CLASSE.simbolo;
    const nodi = [{ x: 20.5, y: 40.5 }, { x: 114.5, y: 40.5 }, { x: 126.5, y: 40.5 }, { x: 220.5, y: 40.5 }];
    const aste = tracciaAste(u, nodi, [{ c: { x: 120.5, y: 40.5 }, r: 5, confidenza: 1 }]);
    expect(aste.map((s) => [s.a.x, s.b.x])).toEqual([[20.5, 114.5], [126.5, 220.5]]);
  });
});

describe('decodifica completa (uscite ideali)', () => {
  it('almeno 9 ritagli su 10 si leggono esattamente', () => {
    let perfetti = 0;
    const errori: string[] = [];
    for (const nome of ritagli) {
      const f = caricaIdeale(nome);
      const p = decodifica(f.uscite, { larghezza: f.larghezza, altezza: f.altezza });
      expect(p.larghezza).toBe(f.larghezza);
      const esito = leggi(p);
      expect(esito.avvisi.some((a) => a.codice === 'erroreLettura')).toBe(false);
      const c = confronta(esito.progetto, schemaInProgetto(f.schema));
      if (c.perfetto) perfetti++;
      else errori.push(`${nome}: ${c.differenze.join(' | ')}`);
    }
    expect(perfetti, errori.join('\n')).toBeGreaterThanOrEqual(9);
  });
});

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  canale, centroCella, picchi, segDaLogit,
} from '../../src/foto/rete/tensori.js';
import * as V from '../../src/foto/rete/vocabolario.js';
import { caricaIdeale, nomiIdeali } from './aiuti-rete.js';

const descrizione = JSON.parse(readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'public', 'modelli', 'foto.json'), 'utf8'));

describe('vocabolario della rete', () => {
  it('coincide con foto.json', () => {
    const c = descrizione.canali as { canale: number; nome: string; tipo?: string; famiglia?: string;
      valore?: number; coefficiente?: number }[];
    expect(c).toHaveLength(V.CANALI);
    expect(descrizione.classi).toHaveLength(V.CLASSI);
    expect(c[V.PALLINO].nome).toBe('pallino');
    expect(c[V.RAGGIO].nome).toBe('raggio');
    expect(V.TIPI_CORPO.map((_, k) => c[V.CORPO0 + k].tipo)).toEqual(V.TIPI_CORPO);
    expect([c[V.COS_CORPO].nome, c[V.SIN_CORPO].nome]).toEqual(['corpo:cos', 'corpo:sin']);
    expect([c[V.FRECCIA].nome, c[V.COS_FRECCIA].nome, c[V.SIN_FRECCIA].nome, c[V.LUNG_FRECCIA].nome])
      .toEqual(['freccia', 'freccia:cos', 'freccia:sin', 'freccia:lunghezza']);
    expect([c[V.MOMENTO0].nome, c[V.MOMENTO0 + 1].nome]).toEqual(['momento:antiorario', 'momento:orario']);
    expect(c[V.NODO].nome).toBe('nodo');
    V.SCRITTE.forEach((s, k) => {
      const d = c[V.SCRITTA0 + k];
      expect(d.famiglia).toBe(s.famiglia);
      expect(d.valore ?? d.coefficiente).toBe(s.valore);
    });
    expect(c[V.QUOTA0].nome).toBe('quota:dx1');
    expect(descrizione.passi).toEqual({ seg: V.PASSO_SEG, testa: V.PASSO_TESTA });
    expect(Object.keys(V.CLASSE)).toEqual(descrizione.classi);
  });
});

describe('tensori', () => {
  it('picchi: massimi locali 3×3 sopra la soglia', () => {
    const m = new Float32Array(100);
    m[2 * 10 + 3] = 0.9;
    m[2 * 10 + 4] = 0.5;
    m[7 * 10 + 7] = 0.2;
    m[6 * 10 + 1] = 0.4;
    const p = picchi(m, 10, 10).map(({ i, j }) => [i, j]).sort();
    expect(p).toEqual([[2, 3], [6, 1]]);
  });

  it('centro della cella e argmax della segmentazione', () => {
    expect(centroCella(2, 3)).toEqual({ x: 13.5, y: 9.5 });
    expect(centroCella(1, 1, 2)).toEqual({ x: 2.5, y: 2.5 });
    // 2 celle, 7 classi: nella prima vince la classe 4, nella seconda la 1
    const logit = new Float32Array(14);
    logit[4 * 2 + 0] = 3;
    logit[1 * 2 + 1] = 2;
    logit[5 * 2 + 1] = 1.5;
    expect(Array.from(segDaLogit(logit, 1, 2))).toEqual([4, 1]);
  });

  it('le fixture ideali hanno il picco dove cade ogni pallino', () => {
    const nomi = nomiIdeali();
    expect(nomi).toHaveLength(13);
    let visti = 0;
    for (const nome of nomi) {
      const f = caricaIdeale(nome);
      const pallini = canale(f.uscite, V.PALLINO);
      for (const q of f.primitive.pallini) {
        const x = q.c.x, y = f.altezza - q.c.y;
        const i = Math.round((y - 1.5) / 4), j = Math.round((x - 1.5) / 4);
        expect(pallini[i * f.uscite.w4 + j]).toBe(1);
        visti++;
      }
    }
    expect(visti).toBeGreaterThan(10);
  });
});

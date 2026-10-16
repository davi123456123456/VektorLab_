import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { beforeAll, describe, expect, it } from 'vitest';
import { confronta } from '../../src/foto/confronto.js';
import { leggi } from '../../src/foto/index.js';
import type { Riquadro } from '../../src/foto/rete/figura.js';
import { creaEsecutore, type Esegui } from '../../src/foto/rete/onnx.js';
import { leggiPGM } from '../../src/foto/rete/pgm.js';
import { riconosci } from '../../src/foto/rete/riconosci.js';
import type { Uscite } from '../../src/foto/rete/tensori.js';
import { schemaInProgetto } from '../../src/foto/schema.js';
import { CARTELLA_RETE, caricaIdeale, nomiIdeali } from './aiuti-rete.js';

const radice = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function iou(a: Riquadro, b: number[]): number {
  const ix = Math.max(0, Math.min(a.x1, b[2]) - Math.max(a.x0, b[0]));
  const iy = Math.max(0, Math.min(a.y1, b[3]) - Math.max(a.y0, b[1]));
  return (ix * iy) / ((a.x1 - a.x0) * (a.y1 - a.y0) + (b[2] - b[0]) * (b[3] - b[1]) - ix * iy);
}

let esegui: Esegui;
beforeAll(async () => {
  esegui = await creaEsecutore(readFileSync(join(radice, 'public', 'modelli', 'foto.onnx')));
}, 60_000);

describe('la rete in Node (onnxruntime-web)', () => {
  it('legge il PGM', () => {
    const g = leggiPGM(new Uint8Array([...Buffer.from('P5\n3 2\n255\n'), 1, 2, 3, 4, 5, 6]));
    expect([g.larghezza, g.altezza, ...g.dati]).toEqual([3, 2, 1, 2, 3, 4, 5, 6]);
  });

  it('un PGM vuoto, troncato o corto dà un errore invece di bloccarsi', () => {
    expect(() => leggiPGM(new Uint8Array())).toThrow();
    expect(() => leggiPGM(new Uint8Array(Buffer.from('P5\n3 2\n')))).toThrow();
    expect(() => leggiPGM(new Uint8Array([...Buffer.from('P5\n3 2\n255\n'), 1, 2]))).toThrow();
  });

  it('nel browser si carica solo la variante WASM', () => {
    const sorgente = readFileSync(join(radice, 'src', 'foto', 'rete', 'onnx.ts'), 'utf8');
    expect(sorgente).toContain("import('onnxruntime-web/wasm')");
  });

  it('forme delle uscite', async () => {
    const u = await esegui({ dati: new Float32Array(256 * 320).fill(1), H: 256, W: 320 });
    expect([u.h2, u.w2, u.seg.length]).toEqual([128, 160, 128 * 160]);
    expect([u.h4, u.w4, u.testa.length]).toEqual([64, 80, 43 * 64 * 80]);
  });

  it('una foto bianca non ha schemi', async () => {
    const bianca = { dati: new Uint8Array(800 * 600).fill(255), larghezza: 800, altezza: 600 };
    expect((await riconosci(bianca, esegui)).esito).toBe('nessunoSchema');
  });

  it('una foto sintetica intera diventa lo schema giusto o quasi', async () => {
    const g = leggiPGM(gunzipSync(readFileSync(join(CARTELLA_RETE, 'foto-2000201.pgm.gz'))));
    const vero = JSON.parse(readFileSync(join(CARTELLA_RETE, 'foto-2000201.json'), 'utf8'));
    const r = await riconosci(g, esegui);
    expect(r.esito).toBe('ok');
    if (r.esito !== 'ok') return;
    expect(iou(r.riquadro, vero.riquadro)).toBeGreaterThanOrEqual(0.5);
    const c = confronta(leggi(r.primitive).progetto, schemaInProgetto(vero.schema));
    expect(c.correzioni, c.differenze.join(' | ')).toBeLessThanOrEqual(3);
  }, 60_000);
});

describe('le due passate', () => {
  it('la seconda guarda il ritaglio della figura trovata nella prima', async () => {
    const f = caricaIdeale(nomiIdeali().find((n) => n.startsWith('ideale-20001'))!);
    const pagina = { dati: new Uint8Array(f.larghezza * f.altezza).fill(255), larghezza: f.larghezza, altezza: f.altezza };
    const chiamate: { H: number; W: number }[] = [];
    const finta: Esegui = async ({ H, W }) => {
      chiamate.push({ H, W });
      if (chiamate.length === 1) return f.uscite;
      const vuota: Uscite = { seg: new Uint8Array((H / 2) * (W / 2)), h2: H / 2, w2: W / 2,
        testa: new Float32Array(43 * (H / 4) * (W / 4)), h4: H / 4, w4: W / 4 };
      return vuota;
    };
    const r = await riconosci(pagina, finta);
    expect(chiamate).toHaveLength(2);
    expect(chiamate[0]).toEqual({ H: f.uscite.h4 * 4, W: f.uscite.w4 * 4 });
    expect(Math.max(chiamate[1].H, chiamate[1].W)).toBe(768);
    expect(r.esito).toBe('ok');
    if (r.esito === 'ok') expect(iou(r.riquadro, f.riquadro)).toBeGreaterThanOrEqual(0.6);
  });
});

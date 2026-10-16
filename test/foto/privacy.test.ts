/**
 * R2 — la foto non si conserva mai. Controllo sul sorgente dei file della
 * funzione: nessuna API di memorizzazione o d'invio, una sola richiesta di
 * rete (il modello), la bitmap chiusa appena letta.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const radice = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const FILE = [
  'src/foto/app/avvisi.ts', 'src/foto/app/decodifica.ts', 'src/foto/app/disegna.ts', 'src/foto/app/ponte.ts',
  'src/foto/app/protocollo.ts', 'src/foto/app/servizio.ts', 'src/worker/foto.worker.ts',
  'src/ui/FotoTelefono.tsx', 'src/ui/AvvisiFoto.tsx',
];
const VIETATE = ['localStorage', 'sessionStorage', 'indexedDB', 'caches.', 'sendBeacon', 'XMLHttpRequest', 'WebSocket', 'document.cookie'];
const sorgente = (f: string) => readFileSync(join(radice, f), 'utf8');

describe('privacy della foto (R2)', () => {
  it('nessuna API di memorizzazione o d\'invio', () => {
    for (const f of FILE) {
      for (const v of VIETATE) expect(sorgente(f).includes(v), `${f}: ${v}`).toBe(false);
    }
  });

  it('le sole richieste di rete scaricano il modello e il runtime', () => {
    const richieste = FILE.flatMap((f) => [...sorgente(f).matchAll(/fetch\(([^)]*)\)/g)].map((m) => `${f}: ${m[1]}`));
    expect(richieste).toEqual(['src/worker/foto.worker.ts: u']);
    const w = sorgente('src/worker/foto.worker.ts');
    expect(w).toContain('scaricaTutti([URL_MODELLO, wasm]');
    expect(w).toContain("modelli/foto.onnx");
    expect(w).toContain("from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url'");
    expect(/https?:\/\//.test(FILE.map(sorgente).join('\n'))).toBe(false);
  });

  it('la bitmap si chiude e la tela d\'appoggio si svuota', () => {
    const s = sorgente('src/ui/FotoTelefono.tsx');
    expect(s).toContain('bitmap.close()');
    expect(s).toContain('tela.width = 0');
    expect(s).toContain("invia({ tipo: 'dimentica' })");
  });
});

/**
 * LA RETE IN ESECUZIONE — onnxruntime-web, nel browser e in Node.
 *
 * Il pacchetto si importa solo quando serve (è grande): chi non usa la foto
 * non lo scarica mai. Si prende la variante solo WASM (14 MB invece dei 28
 * della build con WebGPU): la rete usa solo il backend wasm. Le prove e gli
 * strumenti passano la stessa funzione `Esegui`, o una finta con le uscite
 * ideali.
 */

import { segDaLogit, type Uscite } from './tensori.js';

export type Esegui = (t: { dati: Float32Array; H: number; W: number }) => Promise<Uscite>;

/** `wasm`: l'indirizzo del file .wasm, quando chi impacchetta l'app lo sposta (Vite). */
export async function creaEsecutore(modello: Uint8Array | ArrayBuffer, opzioni: { thread?: number; wasm?: string } = {}): Promise<Esegui> {
  const ort = await import('onnxruntime-web/wasm');
  ort.env.wasm.numThreads = opzioni.thread ?? 1;
  if (opzioni.wasm) ort.env.wasm.wasmPaths = { wasm: opzioni.wasm };
  const dati = modello instanceof Uint8Array ? modello : new Uint8Array(modello);
  const sessione = await ort.InferenceSession.create(dati, { executionProviders: ['wasm'] });
  return async ({ dati: ingresso, H, W }) => {
    const out = await sessione.run({ immagine: new ort.Tensor('float32', ingresso, [1, 1, H, W]) });
    const h2 = H / 2, w2 = W / 2, h4 = H / 4, w4 = W / 4;
    return {
      seg: segDaLogit(out.seg.data as Float32Array, h2, w2), h2, w2,
      testa: out.testa.data as Float32Array, h4, w4,
    };
  };
}

/**
 * Worker del riconoscimento da foto: un guscio attorno a `creaServizio`.
 *
 * Scarica la rete al primo uso, a pezzi, per la barra di avanzamento; il
 * browser la tiene poi nella sua cache HTTP. È l'unica richiesta di rete
 * della funzione: la foto non esce mai da qui.
 */

import wasm from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';
import type { Richiesta } from '../foto/app/protocollo.js';
import { creaServizio } from '../foto/app/servizio.js';
import { creaEsecutore } from '../foto/rete/onnx.js';

const URL_MODELLO = `${import.meta.env.BASE_URL}modelli/foto.onnx`;

async function scaricaModello(avanza: (fatto: number, totale?: number) => void): Promise<Uint8Array> {
  const r = await fetch(URL_MODELLO);
  if (!r.ok || !r.body) throw new Error(`modello non scaricabile (${r.status})`);
  const totale = Number(r.headers.get('content-length')) || undefined;
  const pezzi: Uint8Array[] = [];
  let fatto = 0;
  const lettore = r.body.getReader();
  for (;;) {
    const { done, value } = await lettore.read();
    if (done) break;
    pezzi.push(value);
    fatto += value.length;
    avanza(fatto, totale);
  }
  const tutto = new Uint8Array(fatto);
  let k = 0;
  for (const p of pezzi) {
    tutto.set(p, k);
    k += p.length;
  }
  return tutto;
}

const servizio = creaServizio({ scaricaModello, creaEsegui: (m) => creaEsecutore(m, { wasm }) });

self.onmessage = (e: MessageEvent<Richiesta>) => {
  void servizio.gestisci(e.data, (risposta) => self.postMessage(risposta));
};

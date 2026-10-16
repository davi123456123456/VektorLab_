/**
 * Worker del riconoscimento da foto: un guscio attorno a `creaServizio`.
 *
 * Al primo uso scarica la rete E il runtime (.wasm) insieme, a pezzi, per
 * una barra di avanzamento che dica il vero: il .wasm pesa più del
 * modello. Il browser li tiene poi nella sua cache HTTP. Sono le uniche
 * richieste di rete della funzione: la foto non esce mai da qui.
 */

import wasm from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';
import type { Richiesta } from '../foto/app/protocollo.js';
import { creaServizio } from '../foto/app/servizio.js';
import { creaEsecutore } from '../foto/rete/onnx.js';

const URL_MODELLO = `${import.meta.env.BASE_URL}modelli/foto.onnx`;

/** Scarica i file in parallelo; il totale è noto solo se nessuno è compresso in viaggio. */
async function scaricaTutti(indirizzi: string[], avanza: (fatto: number, totale?: number) => void): Promise<Uint8Array[]> {
  const risposte = await Promise.all(indirizzi.map((u) => fetch(u)));
  for (const r of risposte) if (!r.ok || !r.body) throw new Error(`file non scaricabile (${r.status})`);
  const lunghezze = risposte.map((r) => (r.headers.get('content-encoding') ? NaN : Number(r.headers.get('content-length'))));
  const totale = lunghezze.every((x) => x > 0) ? lunghezze.reduce((a, b) => a + b, 0) : undefined;
  let fatto = 0;
  return Promise.all(risposte.map(async (r) => {
    const pezzi: Uint8Array[] = [];
    let n = 0;
    const lettore = r.body!.getReader();
    for (;;) {
      const { done, value } = await lettore.read();
      if (done) break;
      pezzi.push(value);
      n += value.length;
      fatto += value.length;
      avanza(fatto, totale);
    }
    const tutto = new Uint8Array(n);
    let k = 0;
    for (const p of pezzi) {
      tutto.set(p, k);
      k += p.length;
    }
    return tutto;
  }));
}

let wasmScaricato: Uint8Array | undefined;

const servizio = creaServizio({
  scaricaModello: async (avanza) => {
    const [modello, runtime] = await scaricaTutti([URL_MODELLO, wasm], avanza);
    wasmScaricato = runtime;
    return modello;
  },
  creaEsegui: (m) => creaEsecutore(m, { wasm, wasmBinary: wasmScaricato }),
});

self.onmessage = (e: MessageEvent<Richiesta>) => {
  void servizio.gestisci(e.data, (risposta) => self.postMessage(risposta));
};

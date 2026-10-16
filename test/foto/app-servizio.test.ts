import { describe, expect, it } from 'vitest';
import type { Risposta } from '../../src/foto/app/protocollo.js';
import { creaServizio, MESSAGGI } from '../../src/foto/app/servizio.js';
import type { Esegui } from '../../src/foto/rete/onnx.js';
import type { Uscite } from '../../src/foto/rete/tensori.js';
import { caricaIdeale, nomiIdeali } from './aiuti-rete.js';

const f = caricaIdeale(nomiIdeali().find((n) => n.startsWith('ideale-20000'))!);
const vuote = (H: number, W: number): Uscite => ({ seg: new Uint8Array((H / 2) * (W / 2)), h2: H / 2, w2: W / 2,
  testa: new Float32Array(43 * (H / 4) * (W / 4)), h4: H / 4, w4: W / 4 });

/** Una rete finta: le uscite ideali del ritaglio, o niente. */
function servizio(opzioni: { vuota?: boolean; senzaRete?: boolean } = {}) {
  let reti = 0;
  const s = creaServizio({
    scaricaModello: async (avanza) => {
      if (opzioni.senzaRete) throw new TypeError('Failed to fetch');
      avanza(50, 100);
      avanza(100, 100);
      return new Uint8Array(4);
    },
    creaEsegui: async () => {
      reti++;
      const esegui: Esegui = async ({ H, W }) => (opzioni.vuota ? vuote(H, W) : f.uscite);
      return esegui;
    },
  });
  const risposte: Risposta[] = [];
  const invia = (r: Parameters<typeof s.gestisci>[0]) => s.gestisci(r, (x) => risposte.push(x));
  return { s, risposte, invia, reti: () => reti };
}

// la foto ha le misure del ritaglio; il riquadro è quello che, allargato del 15 %, la copre tutta
const foto = () => ({ tipo: 'foto' as const, dati: new Uint8Array(f.larghezza * f.altezza).fill(255),
  larghezza: f.larghezza, altezza: f.altezza });
const lato = Math.max(f.larghezza, f.altezza), m = (0.15 * lato) / 1.3;
const tutto = f.larghezza >= f.altezza
  ? { x0: m, y0: m, x1: f.larghezza - m, y1: f.altezza - m }
  : { x0: m, y0: m, x1: f.larghezza - m, y1: f.altezza - m };

describe('il servizio del worker', () => {
  it('foto → scaricamento, figure; leggi → struttura letta, e la foto si dimentica', async () => {
    const { s, risposte, invia } = servizio();
    await invia(foto());
    expect(risposte.filter((r) => r.tipo === 'avanzamento').map((r) => (r as { fase: string }).fase))
      .toEqual(['scarico', 'scarico', 'cerco']);
    const figure = risposte.find((r) => r.tipo === 'figure');
    expect(figure && figure.tipo === 'figure' && figure.scelta).toBeGreaterThanOrEqual(0);
    expect(s.haFoto()).toBe(true);
    await invia({ tipo: 'leggi', riquadro: tutto });
    const letto = risposte.find((r) => r.tipo === 'letto');
    expect(letto && letto.tipo === 'letto' && letto.progetto.aste.length).toBeGreaterThan(0);
    expect(s.haFoto()).toBe(false);
  });

  it('una foto senza schema: nessunoSchema, e la foto si dimentica', async () => {
    const { s, risposte, invia } = servizio({ vuota: true });
    await invia(foto());
    expect(risposte.at(-1)).toEqual({ tipo: 'nessunoSchema' });
    expect(s.haFoto()).toBe(false);
  });

  it('annullato al riquadro: la foto si dimentica', async () => {
    const { s, invia } = servizio();
    await invia(foto());
    await invia({ tipo: 'dimentica' });
    expect(s.haFoto()).toBe(false);
  });

  it('primo uso senza rete: messaggio chiaro, niente foto in memoria', async () => {
    const { s, risposte, invia } = servizio({ senzaRete: true });
    await invia(foto());
    expect(risposte.at(-1)).toEqual({ tipo: 'errore', messaggio: MESSAGGI.senzaRete });
    expect(MESSAGGI.senzaRete).toBe('Non riesco a scaricare il riconoscitore: serve la connessione la prima volta');
    expect(s.haFoto()).toBe(false);
  });

  it('la rete si prepara una volta sola', async () => {
    const { invia, reti } = servizio();
    await invia(foto());
    await invia({ tipo: 'dimentica' });
    await invia(foto());
    expect(reti()).toBe(1);
  });

  it('leggi senza foto è un errore, non un crollo', async () => {
    const { risposte, invia } = servizio();
    await invia({ tipo: 'leggi', riquadro: tutto });
    expect(risposte.at(-1)?.tipo).toBe('errore');
  });
});

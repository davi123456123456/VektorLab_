/**
 * Dettaglio delle fibre tese e compresse dell'asta selezionata.
 *
 * È l'animazione che risponde alla domanda «che cosa sta succedendo davvero a
 * questa trave?». Il diagramma del momento dice quanto; questo dice cosa.
 */

import { useEffect, useRef, useState } from 'react';
import { useStore } from '../state/store.js';
import { disegnaFibre } from '../render/fibre.js';
import { registro } from '../anim/registro.js';
import { Bottone } from './Pannelli.js';
import type { EsitoVerifica } from '../core/checks/index.js';

export function DettaglioFibre({ v, EI, EA, altezza, ySup, yInf }: {
  v: EsitoVerifica; EI: number; EA: number; altezza: number;
  ySup: number; yInf: number;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [riproduci, setRiproduci] = useState(true);
  const animazioni = useStore((s) => s.animazioni);

  const curvatura = EI !== 0 ? v.sezione.M / EI : 0;

  /**
   * I dati del fotogramma stanno in un ref, non nelle dipendenze dell'effetto.
   *
   * Prima l'effetto dipendeva da `v`, che è un oggetto nuovo a ogni analisi:
   * ogni ricalcolo smontava il ciclo, rimisurava il canvas — e rimisurarlo lo
   * AZZERA — e lo faceva ripartire. Si vedeva uno sfarfallio a ogni modifica
   * del modello, e l'animazione ricominciava invece di continuare.
   *
   * Con il ref il ciclo parte una volta sola e legge sempre l'ultimo valore.
   */
  const dati = useRef({ v, EI, EA, altezza, ySup, yInf, curvatura, riproduci, animazioni });
  dati.current = { v, EI, EA, altezza, ySup, yInf, curvatura, riproduci, animazioni };

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const W = 264, H = 150;
    const dpr = window.devicePixelRatio || 1;
    c.width = W * dpr; c.height = H * dpr;
    const ctx = c.getContext('2d');
    if (!ctx) return;

    const st = getComputedStyle(document.documentElement);
    const col = (n: string, f: string) => st.getPropertyValue(n).trim() || f;
    const colori = {
      sfondo: col('--sfondo', 'var(--sfondo)'),
      contorno: col('--asta', 'var(--asta)'),
      trazione: col('--errore', 'var(--vincolo)'),
      compressione: col('--sforzo-normale', 'var(--accento)'),
      neutro: col('--testo-debole', 'var(--testo-debole)'),
      testo: col('--testo-attenuato', 'var(--testo-attenuato)'),
      debole: col('--bordo-chiaro', 'var(--bordo-chiaro)'),
    };

    let vivo = true;
    let id = 0;
    const passo = () => {
      if (!vivo) return;
      const d = dati.current;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // in riproduzione il carico sale e scende: si vede la trave inflettersi
      const lambda = d.riproduci && d.animazioni
        ? 0.5 - 0.5 * Math.cos(registro.orologio * 1.4)
        : 1;
      disegnaFibre(ctx, {
        curvatura: d.curvatura, N: d.v.sezione.N, EA: d.EA, altezza: d.altezza,
        ySup: d.ySup, yInf: d.yInf,
        distribuzione: d.v.distribuzione.punti,
        lambda, larghezza: W, altezzaCanvas: H, colori,
      });
      id = requestAnimationFrame(passo);
    };
    id = requestAnimationFrame(passo);
    return () => { vivo = false; cancelAnimationFrame(id); };
  }, []);

  const latoTeso = curvatura >= 0 ? 'inferiori' : 'superiori';

  return (
    <div className="px-2">
      <canvas ref={canvas} style={{ width: 264, height: 150 }} />
      <div className="flex items-center gap-1 px-1 pt-1">
        <Bottone attivo={riproduci} onClick={() => setRiproduci((r) => !r)}>
          {riproduci ? 'in movimento' : 'fermo'}
        </Bottone>
        <span className="numerico text-[length:var(--t-minuto)]" style={{ color: 'var(--testo-debole)' }}>
          χ = M/EI = {curvatura.toExponential(2)} 1/m
        </span>
      </div>
      <p className="px-1 pt-2 text-[length:var(--t-minuto)] leading-relaxed"
         style={{ color: 'var(--testo-debole)' }}>
        Sezioni <b>piane</b> (Bernoulli). Il momento tende le fibre{' '}
        <b>{latoTeso}</b>; la rotazione è molto ingrandita.
      </p>
      {v.sezione.N !== 0 && (
        <p className="px-1 pt-1 text-[length:var(--t-minuto)] leading-relaxed"
           style={{ color: 'var(--testo-debole)' }}>
          N = {(v.sezione.N / 1e3).toFixed(1)} kN
          {v.sezione.N > 0 ? ' allunga' : ' accorcia'} tutte le fibre allo stesso
          modo: l'asse a tensione nulla si sposta dal baricentro.
        </p>
      )}
    </div>
  );
}

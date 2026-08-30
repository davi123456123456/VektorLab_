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

export function DettaglioFibre({ v, EI, EA, altezza }: {
  v: EsitoVerifica; EI: number; EA: number; altezza: number;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [riproduci, setRiproduci] = useState(true);
  const animazioni = useStore((s) => s.animazioni);

  const curvatura = EI !== 0 ? v.sezione.M / EI : 0;

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
      sfondo: col('--sfondo', '#14171c'),
      contorno: col('--asta', '#c8d0dc'),
      trazione: col('--errore', '#ff5f56'),
      compressione: col('--sforzo-normale', '#4a9eff'),
      neutro: col('--testo-debole', '#6b7483'),
      testo: col('--testo-attenuato', '#9aa3b2'),
      debole: col('--bordo-chiaro', '#3d4552'),
    };

    let vivo = true;
    const passo = () => {
      if (!vivo) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // in riproduzione il carico sale e scende: si vede la trave inflettersi
      const lambda = riproduci && animazioni
        ? 0.5 - 0.5 * Math.cos(registro.orologio * 1.4)
        : 1;
      disegnaFibre(ctx, {
        curvatura, N: v.sezione.N, EA, altezza,
        distribuzione: v.distribuzione.punti,
        lambda, larghezza: W, altezzaCanvas: H, colori,
      });
      requestAnimationFrame(passo);
    };
    const id = requestAnimationFrame(passo);
    return () => { vivo = false; cancelAnimationFrame(id); };
  }, [v, EI, EA, altezza, curvatura, riproduci, animazioni]);

  const latoTeso = curvatura >= 0 ? 'inferiori' : 'superiori';

  return (
    <div className="px-2">
      <canvas ref={canvas} style={{ width: 264, height: 150 }} />
      <div className="flex items-center gap-1 px-1 pt-1">
        <Bottone attivo={riproduci} onClick={() => setRiproduci((r) => !r)}>
          {riproduci ? 'in movimento' : 'fermo'}
        </Bottone>
        <span className="numerico text-[10px]" style={{ color: 'var(--testo-debole)' }}>
          χ = M/EI = {curvatura.toExponential(2)} 1/m
        </span>
      </div>
      <p className="px-1 pt-1.5 text-[10px] leading-relaxed"
         style={{ color: 'var(--testo-debole)' }}>
        Le sezioni restano <b>piane</b> e ruotano l'una rispetto all'altra
        (ipotesi di Bernoulli). Qui il momento tende le fibre <b>{latoTeso}</b>:
        si allungano, mentre le opposte si accorciano. Sull'asse neutro la
        lunghezza non cambia. La rotazione è ingrandita moltissimo — quella
        vera è di frazioni di grado.
      </p>
      {v.sezione.N !== 0 && (
        <p className="px-1 pt-1 text-[10px] leading-relaxed"
           style={{ color: 'var(--testo-debole)' }}>
          Lo sforzo normale N = {(v.sezione.N / 1e3).toFixed(1)} kN
          {v.sezione.N > 0 ? ' allunga' : ' accorcia'} tutte le fibre allo stesso
          modo, spostando l'asse a tensione nulla rispetto al baricentro.
        </p>
      )}
    </div>
  );
}

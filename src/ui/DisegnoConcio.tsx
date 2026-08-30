/**
 * Il concio elementare, con i versi effettivi.
 *
 * Serve a rispondere a una domanda sola, che però è quella che conta:
 * DA CHE PARTE È TESA LA FIBRA. I segni sono una convenzione, e una
 * convenzione si può ricordare male; il disegno no.
 *
 * Convenzioni (le stesse del post-processing):
 *   N > 0  trazione: le frecce ESCONO dal concio
 *   T > 0  la coppia fa ruotare il concio in senso ORARIO
 *   M > 0  tende le fibre dal lato −ŷ locale, cioè quelle "inferiori"
 *
 * Su un'asta inclinata «inferiore» non significa nulla finché non si dice
 * rispetto a cosa: qui il concio è disegnato nel riferimento LOCALE, con x̂
 * verso destra e ŷ verso l'alto, e accanto si dichiara l'inclinazione
 * dell'asta. È il modo di togliere l'ambiguità senza chiedere all'utente di
 * ruotare la testa.
 */

import { useEffect, useRef } from 'react';

export function DisegnoConcio({ N, T, M, angolo }: {
  N: number; T: number; M: number;
  /** inclinazione dell'asta rispetto all'orizzontale globale, in radianti */
  angolo: number;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const larghezza = 210, altezza = 118;

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = larghezza * dpr; c.height = altezza * dpr;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, larghezza, altezza);

    const stile = getComputedStyle(document.documentElement);
    const leggi = (v: string, riserva: string) =>
      stile.getPropertyValue(v).trim() || riserva;
    const coloreN = leggi('--sforzo-normale', '#4a9eff');
    const coloreT = leggi('--taglio', '#35c46a');
    const coloreM = leggi('--momento', '#ff8a3d');
    const coloreAsta = leggi('--asta', '#c8d0dc');
    const debole = leggi('--testo-debole', '#6b7686');

    const cx = larghezza / 2, cy = altezza / 2;
    const w = 46, h = 30;

    // il concio
    ctx.strokeStyle = coloreAsta;
    ctx.lineWidth = 1.6;
    ctx.strokeRect(cx - w / 2, cy - h / 2, w, h);

    // la fibra tesa dal momento: lato inferiore se M > 0, superiore se M < 0
    if (Math.abs(M) > 1e-9) {
      const y = M > 0 ? cy + h / 2 : cy - h / 2;
      ctx.strokeStyle = coloreM;
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      ctx.moveTo(cx - w / 2, y);
      ctx.lineTo(cx + w / 2, y);
      ctx.stroke();
    }

    const freccia = (x: number, y: number, dx: number, dy: number, colore: string) => {
      const L = Math.hypot(dx, dy);
      if (L < 1e-6) return;
      const ux = dx / L, uy = dy / L;
      ctx.strokeStyle = colore; ctx.fillStyle = colore; ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + dx, y + dy);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + dx, y + dy);
      ctx.lineTo(x + dx - ux * 7 - uy * 3, y + dy - uy * 7 + ux * 3);
      ctx.lineTo(x + dx - ux * 7 + uy * 3, y + dy - uy * 7 - ux * 3);
      ctx.closePath();
      ctx.fill();
    };

    // N: uscenti se trazione, entranti se compressione
    if (Math.abs(N) > 1e-9) {
      const verso = N > 0 ? 1 : -1;
      freccia(cx + w / 2, cy, verso * 24, 0, coloreN);
      freccia(cx - w / 2, cy, -verso * 24, 0, coloreN);
    }

    // T: coppia oraria se positivo. Sulla faccia di destra va verso il basso,
    // su quella di sinistra verso l'alto — in coordinate canvas, dove y cresce
    // verso il basso, "in basso" è +y
    if (Math.abs(T) > 1e-9) {
      const verso = T > 0 ? 1 : -1;
      freccia(cx + w / 2, cy - h / 4, 0, verso * 22, coloreT);
      freccia(cx - w / 2, cy + h / 4, 0, -verso * 22, coloreT);
    }

    // M: archi che tendono la fibra segnata
    if (Math.abs(M) > 1e-9) {
      const orario = M > 0;
      for (const lato of [-1, 1]) {
        const x = cx + (lato * w) / 2;
        ctx.strokeStyle = coloreM; ctx.fillStyle = coloreM; ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.arc(x, cy, 13, lato > 0 ? -Math.PI / 2 : Math.PI / 2,
                lato > 0 ? Math.PI / 2 : (3 * Math.PI) / 2, orario === (lato < 0));
        ctx.stroke();
        const fine = orario === (lato > 0) ? Math.PI / 2 : -Math.PI / 2;
        const px = x + 13 * Math.cos(fine), py = cy + 13 * Math.sin(fine);
        const t = orario ? 1 : -1;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px - t * 6, py - 5);
        ctx.lineTo(px - t * 6, py + 5);
        ctx.closePath();
        ctx.fill();
      }
    }

    // assi locali e inclinazione
    ctx.font = '9px ui-monospace, SF Mono, Menlo, monospace';
    ctx.fillStyle = debole;
    ctx.fillText('x̂', larghezza - 16, altezza - 6);
    ctx.fillText('ŷ', 8, 12);
    ctx.fillText(`asta a ${((angolo * 180) / Math.PI).toFixed(0)}°`, 8, altezza - 6);
    ctx.strokeStyle = debole;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(larghezza - 34, altezza - 10); ctx.lineTo(larghezza - 20, altezza - 10);
    ctx.moveTo(12, 20); ctx.lineTo(12, 34);
    ctx.stroke();
  }, [N, T, M, angolo]);

  return (
    <div className="pt-1">
      <canvas ref={canvas} style={{ width: larghezza, height: altezza }} />
      <p className="text-[10px] leading-relaxed" style={{ color: 'var(--testo-debole)' }}>
        {Math.abs(M) < 1e-9
          ? 'Momento nullo: nessuna fibra tesa dalla flessione.'
          : M > 0
            ? 'Fibre INFERIORI tese (lato −ŷ): il diagramma di M si disegna sotto.'
            : 'Fibre SUPERIORI tese (lato +ŷ): il diagramma di M si disegna sopra.'}
      </p>
    </div>
  );
}

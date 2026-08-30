/**
 * Operazioni modali (sposta / ruota / scala) nello stile di Blender.
 *
 * Il valore dell'operazione può venire dal MOUSE oppure dalla TASTIERA: se
 * l'utente digita cifre mentre l'operazione è attiva, quel numero prevale.
 * `G` `X` `2.5` `Invio` sposta di 2,5 m lungo x — è il modo più rapido di
 * inserire una geometria esatta, e non richiede di aprire alcuna finestra.
 */

import type { NodeId, Progetto } from '../core/model/types.js';
import type { Punto } from '../render/camera.js';
import type { Operazione } from './store.js';

export interface AnteprimaOperazione {
  posizioni: Map<NodeId, Punto>;
  /** testo mostrato nella barra di stato */
  descrizione: string;
  /** valore corrente (metri, gradi o fattore) */
  valore: number;
}

/** Numero digitato finora; `null` se l'utente non ha ancora scritto nulla. */
function valoreDigitato(digitato: string): number | null {
  if (digitato === '' || digitato === '-' || digitato === '.') return null;
  const v = Number.parseFloat(digitato);
  return Number.isFinite(v) ? v : null;
}

export function calcolaAnteprima(
  operazione: Operazione,
  puntatoreMondo: Punto,
): AnteprimaOperazione | null {
  if (operazione.tipo !== 'sposta' && operazione.tipo !== 'ruota' && operazione.tipo !== 'scala') {
    return null;
  }
  const { inizialiNodi, origine, centro, asse, digitato } = operazione;
  const posizioni = new Map<NodeId, Punto>();

  if (operazione.tipo === 'sposta') {
    let dx = puntatoreMondo.x - origine.x;
    let dy = puntatoreMondo.y - origine.y;
    if (asse === 'x') dy = 0;
    if (asse === 'y') dx = 0;

    const d = valoreDigitato(digitato);
    if (d !== null) {
      if (asse === 'x') { dx = d; dy = 0; }
      else if (asse === 'y') { dx = 0; dy = d; }
      else {
        // senza asse vincolato il numero è la DISTANZA nella direzione corrente
        const L = Math.hypot(dx, dy);
        if (L > 1e-12) { dx = (dx / L) * d; dy = (dy / L) * d; }
        else { dx = d; dy = 0; }
      }
    }

    for (const [id, p] of inizialiNodi) posizioni.set(id, { x: p.x + dx, y: p.y + dy });
    const etichettaAsse = asse ? ` [${asse.toUpperCase()}]` : '';
    return {
      posizioni,
      descrizione: `sposta${etichettaAsse}  Δx ${dx.toFixed(3)}  Δy ${dy.toFixed(3)} m` +
        (digitato ? `  digitato: ${digitato}` : ''),
      valore: Math.hypot(dx, dy),
    };
  }

  if (operazione.tipo === 'ruota') {
    const a0 = Math.atan2(origine.y - centro.y, origine.x - centro.x);
    const a1 = Math.atan2(puntatoreMondo.y - centro.y, puntatoreMondo.x - centro.x);
    let angolo = a1 - a0;
    const d = valoreDigitato(digitato);
    if (d !== null) angolo = (d * Math.PI) / 180;

    const c = Math.cos(angolo), s = Math.sin(angolo);
    for (const [id, p] of inizialiNodi) {
      const dx = p.x - centro.x, dy = p.y - centro.y;
      posizioni.set(id, { x: centro.x + c * dx - s * dy, y: centro.y + s * dx + c * dy });
    }
    return {
      posizioni,
      descrizione: `ruota  ${((angolo * 180) / Math.PI).toFixed(2)}°` +
        (digitato ? `  digitato: ${digitato}` : ''),
      valore: (angolo * 180) / Math.PI,
    };
  }

  // scala
  const r0 = Math.hypot(origine.x - centro.x, origine.y - centro.y);
  const r1 = Math.hypot(puntatoreMondo.x - centro.x, puntatoreMondo.y - centro.y);
  let fattore = r0 > 1e-9 ? r1 / r0 : 1;
  const d = valoreDigitato(digitato);
  if (d !== null) fattore = d;

  const fx = asse === 'y' ? 1 : fattore;
  const fy = asse === 'x' ? 1 : fattore;
  for (const [id, p] of inizialiNodi) {
    posizioni.set(id, {
      x: centro.x + (p.x - centro.x) * fx,
      y: centro.y + (p.y - centro.y) * fy,
    });
  }
  const etichettaAsse = asse ? ` [${asse.toUpperCase()}]` : '';
  return {
    posizioni,
    descrizione: `scala${etichettaAsse}  ×${fattore.toFixed(4)}` +
      (digitato ? `  digitato: ${digitato}` : ''),
    valore: fattore,
  };
}

/** Posizioni correnti dei nodi indicati, per avviare un'operazione. */
export function istantaneaNodi(p: Progetto, ids: Iterable<NodeId>): Map<NodeId, Punto> {
  const insieme = new Set(ids);
  const out = new Map<NodeId, Punto>();
  for (const n of p.nodi) if (insieme.has(n.id)) out.set(n.id, { x: n.x, y: n.y });
  return out;
}

/** Accumula le cifre digitate durante un'operazione; `null` se il tasto non è pertinente. */
export function accumulaDigitato(corrente: string, tasto: string): string | null {
  if (/^[0-9]$/.test(tasto)) return corrente + tasto;
  if (tasto === '.' || tasto === ',') return corrente.includes('.') ? corrente : corrente + '.';
  if (tasto === '-') return corrente.startsWith('-') ? corrente.slice(1) : '-' + corrente;
  if (tasto === 'Backspace') return corrente.slice(0, -1);
  return null;
}

/**
 * Motore di aggancio (snap).
 *
 * PRINCIPIO — l'aggancio deve essere PREVEDIBILE prima ancora che potente:
 * l'utente deve poter anticipare dove finirà il punto. Perciò gli agganci sono
 * ordinati per priorità fissa (prima gli oggetti esistenti, poi le costruzioni
 * geometriche, infine la griglia) e ognuno restituisce un'EVIDENZA VISIVA che
 * spiega perché quel punto è stato scelto. Un aggancio che non si vede è un
 * aggancio che l'utente subisce.
 *
 * La tolleranza è espressa in PIXEL, non in metri: deve corrispondere alla
 * precisione della mano sul mouse, indipendentemente dallo zoom.
 */

import type { ElementId, NodeId, Progetto } from '../core/model/types.js';
import { type Camera, type Punto, mondoASchermo, schermoAMondo } from './camera.js';
import { passoGriglia } from './grid.js';

export type TipoSnap =
  | 'nessuno' | 'griglia' | 'nodo' | 'puntoMedio'
  | 'intersezione' | 'ortogonale' | 'lungoAsta' | 'angolo';

export interface RisultatoSnap {
  punto: Punto;
  tipo: TipoSnap;
  /** etichetta mostrata accanto al cursore */
  etichetta: string;
  /** nodo agganciato, se `tipo === 'nodo'` */
  nodoId?: NodeId;
  /**
   * Aste su cui il punto GIACE, con la rispettiva ascissa relativa.
   *
   * È l'informazione che impedisce il bug del collegamento mancato: chi crea
   * il nodo qui deve spezzare queste aste e farle passare per esso, invece di
   * lasciare due segmenti coincidenti in un punto e scollegati nel modello.
   */
  suAste?: { astaId: ElementId; s: number }[];
  /** linee guida da disegnare, in coordinate mondo */
  guide?: { da: Punto; a: Punto }[];
}

export interface OpzioniSnap {
  griglia: boolean;
  nodi: boolean;
  puntiMedi: boolean;
  intersezioni: boolean;
  ortogonale: boolean;
  /** tolleranza in pixel */
  tolleranzaPixel: number;
}

export const SNAP_PREDEFINITO: OpzioniSnap = {
  griglia: true, nodi: true, puntiMedi: true,
  intersezioni: true, ortogonale: true, tolleranzaPixel: 12,
};

const fmt = (v: number) => (Math.abs(v) >= 1 ? v.toFixed(3) : v.toFixed(4));

/**
 * @param origine punto di partenza dell'operazione in corso (per l'aggancio
 *   ortogonale e angolare); `null` se non c'è un'operazione attiva.
 */
export function calcolaSnap(
  progetto: Progetto,
  camera: Camera,
  puntatoreSchermo: Punto,
  opzioni: OpzioniSnap,
  origine: Punto | null = null,
  escludiNodi: Set<string> = new Set(),
  /** direzione del segmento precedente, per l'aggancio angolare RELATIVO */
  direzionePrecedente: number | null = null,
): RisultatoSnap {
  const mondo = schermoAMondo(camera, puntatoreSchermo);
  const toll = opzioni.tolleranzaPixel;
  const distSchermo = (p: Punto) => {
    const s = mondoASchermo(camera, p);
    return Math.hypot(s.x - puntatoreSchermo.x, s.y - puntatoreSchermo.y);
  };

  // ── 1. nodi esistenti (priorità massima) ────────────────────────────
  if (opzioni.nodi) {
    let migliore: { n: (typeof progetto.nodi)[number]; d: number } | null = null;
    for (const n of progetto.nodi) {
      if (escludiNodi.has(n.id as string)) continue;
      const d = distSchermo({ x: n.x, y: n.y });
      if (d <= toll && (!migliore || d < migliore.d)) migliore = { n, d };
    }
    if (migliore) {
      return {
        punto: { x: migliore.n.x, y: migliore.n.y },
        tipo: 'nodo',
        etichetta: `nodo ${migliore.n.etichetta ?? migliore.n.id}`,
        nodoId: migliore.n.id,
      };
    }
  }

  // ── 2. punti medi delle aste ────────────────────────────────────────
  if (opzioni.puntiMedi) {
    let migliore: { p: Punto; d: number; astaId: ElementId } | null = null;
    for (const a of progetto.aste) {
      const ni = progetto.nodi.find((n) => n.id === a.nodoIniziale);
      const nj = progetto.nodi.find((n) => n.id === a.nodoFinale);
      if (!ni || !nj) continue;
      const p = { x: (ni.x + nj.x) / 2, y: (ni.y + nj.y) / 2 };
      const d = distSchermo(p);
      if (d <= toll && (!migliore || d < migliore.d)) migliore = { p, d, astaId: a.id };
    }
    if (migliore) {
      return {
        punto: migliore.p, tipo: 'puntoMedio', etichetta: 'punto medio',
        suAste: [{ astaId: migliore.astaId, s: 0.5 }],
      };
    }
  }

  // ── 2-bis. quarti e terzi ───────────────────────────────────────────
  // Sono i punti che servono davvero per posare carichi e vincoli: «a un
  // terzo della luce» è una posizione che si dice a parole, e deve potersi
  // indicare senza calcolare coordinate.
  if (opzioni.puntiMedi) {
    let migliore:
      { p: Punto; d: number; nome: string; astaId: ElementId; s: number } | null = null;
    for (const a of progetto.aste) {
      const ni = progetto.nodi.find((n) => n.id === a.nodoIniziale);
      const nj = progetto.nodi.find((n) => n.id === a.nodoFinale);
      if (!ni || !nj) continue;
      for (const [t, nome] of [
        [1 / 4, '1/4'], [3 / 4, '3/4'], [1 / 3, '1/3'], [2 / 3, '2/3'],
      ] as [number, string][]) {
        const p = { x: ni.x + (nj.x - ni.x) * t, y: ni.y + (nj.y - ni.y) * t };
        const d = distSchermo(p);
        if (d <= toll && (!migliore || d < migliore.d)) {
          migliore = { p, d, nome, astaId: a.id, s: t };
        }
      }
    }
    if (migliore) {
      return {
        punto: migliore.p, tipo: 'lungoAsta',
        etichetta: `${migliore.nome} dell'asta`,
        suAste: [{ astaId: migliore.astaId, s: migliore.s }],
      };
    }
  }

  // ── 3. intersezioni fra aste ────────────────────────────────────────
  if (opzioni.intersezioni) {
    const segmenti = segmentiDelProgetto(progetto);
    let migliore: { p: Punto; d: number; a: number; b: number } | null = null;
    for (let i = 0; i < segmenti.length; i++) {
      for (let j = i + 1; j < segmenti.length; j++) {
        const p = intersezioneSegmenti(segmenti[i], segmenti[j]);
        if (!p) continue;
        const d = distSchermo(p);
        if (d <= toll && (!migliore || d < migliore.d)) migliore = { p, d, a: i, b: j };
      }
    }
    if (migliore) {
      // Entrambe le aste vanno spezzate: un'intersezione collegata a una sola
      // lascerebbe l'altra a passarci sopra senza toccarla — di nuovo due
      // segmenti coincidenti e scollegati.
      const suAste = [migliore.a, migliore.b]
        .map((k) => segmenti[k])
        .map((seg) => ({ astaId: seg.astaId, s: ascissaSuSegmento(seg, migliore!.p) }));
      return {
        punto: migliore.p, tipo: 'intersezione', etichetta: 'intersezione', suAste,
      };
    }
  }

  // ── 4. aggancio angolare: multipli di 15°, assoluti E relativi ──────
  if (opzioni.ortogonale && origine) {
    const dx = mondo.x - origine.x;
    const dy = mondo.y - origine.y;
    const lung = Math.hypot(dx, dy);
    if (lung > 1e-9) {
      const a = agganciaAngolo(Math.atan2(dy, dx), direzionePrecedente);
      if (a.agganciato) {
        const p = {
          x: origine.x + lung * Math.cos(a.angolo),
          y: origine.y + lung * Math.sin(a.angolo),
        };
        const punto = allineaAGriglia(p, camera, opzioni, origine, a.angolo);
        const L = Math.hypot(punto.x - origine.x, punto.y - origine.y);
        const gradi = (x: number) => Math.round((x * 180) / Math.PI);
        const delta = a.delta === null ? '' : ` · Δ ${gradi(a.delta)}° (rel)`;
        return {
          punto,
          tipo: a.riferimento === 'relativo' ? 'angolo' : 'ortogonale',
          etichetta: `L ${fmt(L)} m · α ${gradi(a.angolo)}° (ass)${delta}`,
          guide: [{ da: origine, a: punto }],
        };
      }
    }
  }

  // ── 5. griglia ──────────────────────────────────────────────────────
  if (opzioni.griglia) {
    const passo = passoGriglia(camera.zoom);
    const p = {
      x: Math.round(mondo.x / passo) * passo,
      y: Math.round(mondo.y / passo) * passo,
    };
    if (distSchermo(p) <= toll * 1.5) {
      return { punto: p, tipo: 'griglia', etichetta: `${fmt(p.x)}, ${fmt(p.y)}` };
    }
  }

  // ── 6. proiezione ortogonale su un'asta ─────────────────────────────
  // Ultima in ordine di priorità: è la più "morbida" delle costruzioni, e non
  // deve rubare il posto a un nodo o a un punto notevole.
  if (opzioni.ortogonale) {
    let migliore: { p: Punto; d: number; astaId: ElementId; s: number } | null = null;
    for (const a of progetto.aste) {
      const ni = progetto.nodi.find((n) => n.id === a.nodoIniziale);
      const nj = progetto.nodi.find((n) => n.id === a.nodoFinale);
      if (!ni || !nj) continue;
      const vx = nj.x - ni.x, vy = nj.y - ni.y;
      const L2 = vx * vx + vy * vy;
      if (L2 < 1e-18) continue;
      const t = ((mondo.x - ni.x) * vx + (mondo.y - ni.y) * vy) / L2;
      if (t <= 0 || t >= 1) continue;
      const p = { x: ni.x + vx * t, y: ni.y + vy * t };
      const d = distSchermo(p);
      if (d <= toll && (!migliore || d < migliore.d)) {
        migliore = { p, d, astaId: a.id, s: t };
      }
    }
    if (migliore) {
      return {
        punto: migliore.p, tipo: 'lungoAsta',
        etichetta: 'sull\'asta',
        suAste: [{ astaId: migliore.astaId, s: migliore.s }],
      };
    }
  }

  return { punto: mondo, tipo: 'nessuno', etichetta: `${fmt(mondo.x)}, ${fmt(mondo.y)}` };
}

/**
 * Con l'aggancio ortogonale attivo, la LUNGHEZZA viene comunque arrotondata al
 * passo della griglia: altrimenti si otterrebbero aste a 45° esatti ma lunghe
 * 2.8374 m, che non è ciò che l'utente intende quando aggancia un angolo.
 */
function allineaAGriglia(
  p: Punto, camera: Camera, opzioni: OpzioniSnap, origine: Punto, angolo: number,
): Punto {
  if (!opzioni.griglia) return p;
  const passo = passoGriglia(camera.zoom);
  const lung = Math.hypot(p.x - origine.x, p.y - origine.y);
  const lungAgganciata = Math.round(lung / passo) * passo;
  if (lungAgganciata <= 0) return p;
  return {
    x: origine.x + lungAgganciata * Math.cos(angolo),
    y: origine.y + lungAgganciata * Math.sin(angolo),
  };
}

interface Segmento { a: Punto; b: Punto; astaId: ElementId }

function segmentiDelProgetto(p: Progetto): Segmento[] {
  const mappa = new Map(p.nodi.map((n) => [n.id, n]));
  const out: Segmento[] = [];
  for (const asta of p.aste) {
    const ni = mappa.get(asta.nodoIniziale);
    const nj = mappa.get(asta.nodoFinale);
    if (ni && nj) {
      out.push({
        a: { x: ni.x, y: ni.y }, b: { x: nj.x, y: nj.y }, astaId: asta.id,
      });
    }
  }
  return out;
}

function intersezioneSegmenti(s1: Segmento, s2: Segmento): Punto | null {
  const d1x = s1.b.x - s1.a.x, d1y = s1.b.y - s1.a.y;
  const d2x = s2.b.x - s2.a.x, d2y = s2.b.y - s2.a.y;
  const den = d1x * d2y - d1y * d2x;
  if (Math.abs(den) < 1e-12) return null;
  const t = ((s2.a.x - s1.a.x) * d2y - (s2.a.y - s1.a.y) * d2x) / den;
  const u = ((s2.a.x - s1.a.x) * d1y - (s2.a.y - s1.a.y) * d1x) / den;
  // solo intersezioni interne a entrambi i segmenti (gli estremi sono già nodi)
  const eps = 1e-6;
  if (t <= eps || t >= 1 - eps || u <= eps || u >= 1 - eps) return null;
  return { x: s1.a.x + t * d1x, y: s1.a.y + t * d1y };
}

// ═══════════════════════ AGGANCIO ANGOLARE ═══════════════════════

/**
 * L'aggancio angolare deve funzionare rispetto a DUE riferimenti insieme:
 * l'orizzontale globale e il segmento precedente. È la seconda che serve per
 * le pieghe — su un tratto già inclinato di 20°, una piega di 45° rispetto a
 * esso dà 65°, che non è multiplo di 15 e nessun aggancio assoluto potrebbe
 * produrre.
 *
 * Vince il candidato più vicino; a parità, quello relativo, perché quando si
 * sta piegando è la piega che si sta guardando.
 */
export interface EsitoSnapAngolare {
  /** angolo assoluto agganciato, in radianti */
  angolo: number;
  agganciato: boolean;
  riferimento: 'assoluto' | 'relativo' | null;
  /** angolo rispetto al segmento precedente, se c'è */
  delta: number | null;
}

const DUE_PI = Math.PI * 2;

/** Riporta un angolo in (−π, π]. */
export function normalizzaAngolo(a: number): number {
  let x = ((a + Math.PI) % DUE_PI + DUE_PI) % DUE_PI - Math.PI;
  if (x === -Math.PI) x = Math.PI;
  return x;
}

export function agganciaAngolo(
  direzione: number,
  precedente: number | null = null,
  passo: number = Math.PI / 12,
  tolleranza: number = (6 * Math.PI) / 180,
): EsitoSnapAngolare {
  const candidati: { angolo: number; riferimento: 'assoluto' | 'relativo' }[] = [];

  const multiploVicino = (base: number) => {
    const k = Math.round((direzione - base) / passo);
    return base + k * passo;
  };

  candidati.push({ angolo: multiploVicino(0), riferimento: 'assoluto' });
  if (precedente !== null) {
    candidati.push({ angolo: multiploVicino(precedente), riferimento: 'relativo' });
  }

  let scelto: { angolo: number; riferimento: 'assoluto' | 'relativo' } | null = null;
  let minimo = Infinity;
  for (const c of candidati) {
    const d = Math.abs(normalizzaAngolo(c.angolo - direzione));
    // a parità vince il relativo, che è quello che si sta guardando: il
    // confronto usa una tolleranza numerica, non l'uguaglianza esatta
    if (d < minimo - 1e-12 || (Math.abs(d - minimo) <= 1e-12 && c.riferimento === 'relativo')) {
      minimo = d; scelto = c;
    }
  }

  if (!scelto || minimo > tolleranza) {
    return {
      angolo: direzione, agganciato: false, riferimento: null,
      delta: precedente === null ? null : normalizzaAngolo(direzione - precedente),
    };
  }
  return {
    angolo: normalizzaAngolo(scelto.angolo),
    agganciato: true,
    riferimento: scelto.riferimento,
    delta: precedente === null ? null : normalizzaAngolo(scelto.angolo - precedente),
  };
}


/** Ascissa relativa di un punto che giace su un segmento. */
function ascissaSuSegmento(seg: Segmento, p: Punto): number {
  const vx = seg.b.x - seg.a.x, vy = seg.b.y - seg.a.y;
  const L2 = vx * vx + vy * vy;
  if (L2 < 1e-18) return 0;
  const t = ((p.x - seg.a.x) * vx + (p.y - seg.a.y) * vy) / L2;
  return Math.min(1, Math.max(0, t));
}

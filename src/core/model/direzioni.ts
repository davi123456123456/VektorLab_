/**
 * Conversione della direzione di un carico distribuito nelle componenti
 * locali dell'asta.
 *
 * Tutto il resto del nucleo ragiona in componenti locali (q_x lungo l'asse,
 * q_y ortogonale): la traduzione avviene una volta sola, qui.
 *
 * FATTORE DI PROIEZIONE — quando l'intensità è misurata per unità di
 * proiezione (neve in pianta), l'intensità per unità di lunghezza dell'asta si
 * ottiene moltiplicando per il seno dell'angolo fra l'asta e la direzione del
 * carico:
 *
 *     fattore = | e × d |  =  | c·sinα − s·cosα |
 *
 * con e = (c, s) versore dell'asta e d = (cosα, sinα) direzione del carico.
 * Per carico verticale su asta inclinata di θ vale |cos θ|, che è la regola
 * nota; per carico orizzontale vale |sin θ|. Ricavarlo dal prodotto vettoriale
 * invece che dai due casi particolari evita di sbagliare sugli angoli
 * arbitrari.
 */

import type { DirezioneCarico } from './types.js';

export interface AssiAsta {
  /** coseno e seno dell'asse locale x rispetto a x globale */
  c: number;
  s: number;
}

/** Direzione del carico in assi globali, come versore. */
export function versoreGlobale(d: DirezioneCarico, asse: AssiAsta): [number, number] {
  switch (d.modo) {
    case 'localeOrtogonale': return [-asse.s, asse.c];
    case 'localeAssiale': return [asse.c, asse.s];
    case 'globaleX': return [1, 0];
    case 'globaleY': return [0, 1];
    case 'angolo': {
      const a = d.alpha ?? 0;
      return [Math.cos(a), Math.sin(a)];
    }
  }
}

/**
 * Fattore per cui moltiplicare l'intensità dichiarata per ottenere quella per
 * unità di lunghezza dell'asta. Vale 1 salvo che per i carichi misurati in
 * proiezione.
 */
export function fattoreProiezione(d: DirezioneCarico, asse: AssiAsta): number {
  if (!d.perProiezione) return 1;
  // sui riferimenti locali la proiezione non ha senso: il carico è già
  // definito rispetto all'asta
  if (d.modo === 'localeOrtogonale' || d.modo === 'localeAssiale') return 1;
  const [dx, dy] = versoreGlobale(d, asse);
  return Math.abs(asse.c * dy - asse.s * dx);
}

/**
 * Componenti LOCALI (assiale, ortogonale) dell'intensità `q`, per unità di
 * lunghezza dell'asta.
 */
export function componentiLocali(
  q: number, d: DirezioneCarico, asse: AssiAsta,
): { qx: number; qy: number } {
  const intensita = q * fattoreProiezione(d, asse);
  const [dx, dy] = versoreGlobale(d, asse);
  // proiezione del vettore globale sugli assi locali
  return {
    qx: intensita * (asse.c * dx + asse.s * dy),
    qy: intensita * (-asse.s * dx + asse.c * dy),
  };
}

/** Componenti GLOBALI dell'intensità, per unità di lunghezza dell'asta. */
export function componentiGlobali(
  q: number, d: DirezioneCarico, asse: AssiAsta,
): { qx: number; qy: number } {
  const intensita = q * fattoreProiezione(d, asse);
  const [dx, dy] = versoreGlobale(d, asse);
  return { qx: intensita * dx, qy: intensita * dy };
}

export interface Risultante {
  /** componenti globali della risultante [N] */
  Fx: number;
  Fy: number;
  /** modulo [N] */
  modulo: number;
  /** punto di applicazione in coordinate globali */
  x: number;
  y: number;
  /** lunghezza del tratto caricato [m] */
  lunghezzaCaricata: number;
  /** ascissa relativa del punto di applicazione lungo l'asta */
  sApplicazione: number;
}

/**
 * Risultante di un carico distribuito trapezoidale e suo punto di
 * applicazione. Serve al calcolo per equazioni cardinali, e va mostrata
 * all'utente: è il modo più rapido per accorgersi di aver sbagliato verso o
 * modalità di misura.
 *
 * Per un trapezio di intensità q₁ e q₂ su un tratto di lunghezza ℓ, la
 * risultante vale (q₁+q₂)·ℓ/2 e cade a distanza dal primo estremo
 *
 *     x̄ = ℓ · (q₁ + 2q₂) / (3(q₁ + q₂))
 *
 * che per q₁ = q₂ dà ℓ/2 e per q₁ = 0 dà 2ℓ/3, come dev'essere.
 */
export function risultanteDistribuito(
  q1: number, q2: number, sIniziale: number, sFinale: number,
  d: DirezioneCarico,
  geometria: { x1: number; y1: number; x2: number; y2: number; L: number; c: number; s: number },
): Risultante {
  const asse = { c: geometria.c, s: geometria.s };
  const fattore = fattoreProiezione(d, asse);
  const [dx, dy] = versoreGlobale(d, asse);
  const s1 = Math.max(0, Math.min(1, sIniziale));
  const s2 = Math.max(0, Math.min(1, sFinale));
  const lunghezzaCaricata = Math.max(0, (s2 - s1) * geometria.L);

  const intensita1 = q1 * fattore;
  const intensita2 = q2 * fattore;
  const modulo = ((intensita1 + intensita2) / 2) * lunghezzaCaricata;

  // baricentro del trapezio, misurato dall'inizio del tratto
  const somma = intensita1 + intensita2;
  const frazione = Math.abs(somma) > 1e-30
    ? (intensita1 + 2 * intensita2) / (3 * somma)
    : 0.5;
  const sApplicazione = s1 + (s2 - s1) * frazione;

  return {
    Fx: modulo * dx,
    Fy: modulo * dy,
    modulo,
    x: geometria.x1 + (geometria.x2 - geometria.x1) * sApplicazione,
    y: geometria.y1 + (geometria.y2 - geometria.y1) * sApplicazione,
    lunghezzaCaricata,
    sApplicazione,
  };
}

/** Etichette per l'interfaccia. */
export const MODI_RIFERIMENTO: {
  modo: DirezioneCarico['modo']; nome: string; descrizione: string;
}[] = [
  { modo: 'localeOrtogonale', nome: 'Locale ortogonale',
    descrizione: 'Perpendicolare all\'asse dell\'asta, ruota con essa. Vento su parete, pressione.' },
  { modo: 'localeAssiale', nome: 'Locale assiale',
    descrizione: 'Parallelo all\'asse dell\'asta. Attrito, peso su una colonna.' },
  { modo: 'globaleX', nome: 'Globale X',
    descrizione: 'Orizzontale, indipendente dall\'orientamento dell\'asta.' },
  { modo: 'globaleY', nome: 'Globale Y',
    descrizione: 'Verticale, indipendente dall\'orientamento dell\'asta. Peso, carichi gravitazionali.' },
  { modo: 'angolo', nome: 'Angolo arbitrario',
    descrizione: 'Direzione definita da un angolo rispetto all\'asse x globale.' },
];

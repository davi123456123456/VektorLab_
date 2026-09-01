/**
 * ORIENTAMENTO DEI VINCOLI — convenzione assoluta, definita qui una volta sola.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │ `angolo` ∈ [0°, 360°) è la DIREZIONE DI PUNTAMENTO del vincolo:      │
 * │ la direzione verso cui punta il vertice del simbolo. Il corpo del    │
 * │ simbolo — triangolo, rulli, tratteggiatura — si sviluppa dalla parte │
 * │ OPPOSTA rispetto al nodo.                                            │
 * │                                                                       │
 * │     û(angolo) = ( −sin α , cos α )                                    │
 * │                                                                       │
 * │ È l'unica formula ammessa. Ogni simbolo e ogni direzione di reazione │
 * │ passa di qui.                                                         │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 *   0°   punta in alto      simbolo sotto il nodo      reazione verticale
 *   90°  punta a sinistra   simbolo a destra           reazione orizzontale
 *   180° punta in basso     simbolo sopra              reazione verticale
 *   270° punta a destra     simbolo a sinistra         reazione orizzontale
 *
 * Il caso classico — appoggio sotto una trave orizzontale — è `angolo = 0`.
 *
 * PERCHÉ NON C'È UN «LATO» — con l'intervallo completo 0-359° il ribaltamento
 * è `angolo + 180`, e un parametro a parte sarebbe ridondante. Ne esisteva
 * uno, e insieme a un orientamento dedotto dall'inclinazione dell'asta era la
 * ragione per cui una cerniera e un carrello con lo STESSO angolo finivano in
 * posizioni diverse: il calcolo leggeva l'angolo, il disegno leggeva l'angolo
 * più un lato deciso altrove. Un solo numero, nessun offset per tipo.
 */

import type { Radianti, Vincolo } from './types.js';

const DUE_PI = Math.PI * 2;

export interface Orientamento {
  /** versore di puntamento: dove guarda il vertice del simbolo */
  u: readonly [number, number];
  /** versore del piano di posa, perpendicolare a û */
  piano: readonly [number, number];
  /**
   * Rotazione da dare al contesto di disegno perché il simbolo, tracciato
   * con il corpo verso il basso, finisca dalla parte giusta. Tiene già conto
   * del fatto che il canvas ha y verso il basso.
   */
  rotazioneSchermo: number;
  /** angolo normalizzato, in gradi interi da 0 a 359 */
  gradi: number;
  radianti: number;
}

/** Riporta un angolo qualunque in [0, 2π). −90° diventa 270°, 450° diventa 90°. */
export function normalizzaAngolo(a: number): number {
  const x = a % DUE_PI;
  return x < 0 ? x + DUE_PI : x;
}

/** Normalizzazione in gradi interi, per l'interfaccia. */
export function normalizzaGradi(g: number): number {
  const x = Math.round(g) % 360;
  return x < 0 ? x + 360 : x;
}

export function orientamentoVincolo(angolo: number): Orientamento {
  const a = normalizzaAngolo(angolo);
  const u = [-Math.sin(a), Math.cos(a)] as const;
  return {
    u,
    // il piano di posa è perpendicolare al puntamento: ruotando û di −90°
    piano: [u[1], -u[0]] as const,
    rotazioneSchermo: -a,
    gradi: normalizzaGradi((a * 180) / Math.PI),
    radianti: a,
  };
}

/** Il vincolo con l'angolo riportato in [0, 2π). */
export function normalizzaVincolo(v: Vincolo): Vincolo {
  const a = normalizzaAngolo(v.angolo);
  return Math.abs(a - v.angolo) < 1e-12 ? v : { ...v, angolo: a as Radianti };
}

/** Ribaltamento: mezzo giro. Con l'intervallo completo non serve altro. */
export function ribalta(angolo: number): number {
  return normalizzaAngolo(angolo + Math.PI);
}

/** Preset dell'interfaccia, in gradi. */
/**
 * Preset dell'angolo: TUTTI i multipli di 15°.
 *
 * Otto valori (i multipli di 45°) coprivano le posizioni cardinali e
 * diagonali, ma lasciavano fuori proprio i casi in cui un preset serve:
 * l'appoggio su una falda a 30°, il carrello su un piano inclinato a 15°.
 * Ventiquattro bottoni occupano tre righe, ed è un prezzo basso rispetto al
 * dover digitare l'angolo ogni volta.
 */
export const PRESET_ANGOLI = [
  0, 15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165,
  180, 195, 210, 225, 240, 255, 270, 285, 300, 315, 330, 345,
] as const;

/** I soli multipli di 45°: servono ai riferimenti grafici della ghiera. */
export const TACCHE_GHIERA = [0, 45, 90, 135, 180, 225, 270, 315] as const;

/** Passo dello snap durante la rotazione interattiva. */
export const PASSO_SNAP_ANGOLO = Math.PI / 12;   // 15°

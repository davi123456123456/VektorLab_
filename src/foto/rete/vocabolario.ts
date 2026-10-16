/**
 * VOCABOLARIO DELLA RETE — che cosa c'è in ogni canale d'uscita.
 *
 * È lo specchio di `addestramento/rete/vocabolario.py` e di
 * `public/modelli/foto.json` (un test controlla che coincidano): l'ordine
 * dei canali non si cambia da una parte sola.
 */

import type { TipoCorpo } from '../tipi.js';

export const TIPI_CORPO: TipoCorpo[] = [
  'triangolo', 'triangoloRulli', 'incastro', 'doppioPendolo',
  'pattino', 'biella', 'doppioPendoloInterno', 'pattinoInterno',
];

export const SCRITTE: { famiglia: 'L' | 'q' | 'F' | 'M'; valore: number }[] = [
  ...[0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4].map((valore) => ({ famiglia: 'L' as const, valore })),
  ...(['q', 'F', 'M'] as const).flatMap((famiglia) => [1, 2, 3, 0.5].map((valore) => ({ famiglia, valore }))),
];

export const PALLINO = 0;
export const RAGGIO = 1;
export const CORPO0 = 2;
export const COS_CORPO = 10;
export const SIN_CORPO = 11;
export const FRECCIA = 12;
export const COS_FRECCIA = 13;
export const SIN_FRECCIA = 14;
export const LUNG_FRECCIA = 15;
/** 16 antiorario, 17 orario: non distinguono il verso, si fondono */
export const MOMENTO0 = 16;
export const NODO = 18;
export const SCRITTA0 = 19;
/** dx1, dy1, dx2, dy2 degli estremi di una quota rispetto al centro della scritta (px, y su) */
export const QUOTA0 = 39;
export const CANALI = 43;
export const CLASSI = 7;

export const CLASSE = { sfondo: 0, asta: 1, ausiliaria: 2, carico: 3, simbolo: 4, testo: 5, altro: 6 } as const;

export const SCALA_RAGGIO = 10;
export const SCALA_LUNGHEZZA = 100;
export const SCALA_QUOTA = 100;
export const PASSO_SEG = 2;
export const PASSO_TESTA = 4;
/** soglia dei picchi, come in Python */
export const SOGLIA = 0.3;

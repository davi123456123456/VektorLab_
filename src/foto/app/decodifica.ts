/**
 * Quanto grande si decodifica la foto: un telefono da 48 MP darebbe 200 MB
 * di pixel; per trovare lo schema e leggerlo bastano 2400 px di lato lungo.
 */

export const LATO_DECODIFICA = 2400;

export function dimensioniDecodifica(larghezza: number, altezza: number, massimo = LATO_DECODIFICA): { larghezza: number; altezza: number } {
  const s = Math.min(1, massimo / Math.max(larghezza, altezza));
  return { larghezza: Math.round(larghezza * s), altezza: Math.round(altezza * s) };
}

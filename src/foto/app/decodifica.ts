/**
 * Quanto grande si decodifica la foto: un telefono da 48 MP darebbe 200 MB
 * di pixel; per trovare lo schema e leggerlo bastano 2400 px di lato lungo.
 */

export const LATO_DECODIFICA = 2400;

export function dimensioniDecodifica(larghezza: number, altezza: number, massimo = LATO_DECODIFICA): { larghezza: number; altezza: number } {
  const s = Math.min(1, massimo / Math.max(larghezza, altezza));
  return { larghezza: Math.round(larghezza * s), altezza: Math.round(altezza * s) };
}

type CreaBitmap = (f: Blob, o?: ImageBitmapOptions) => Promise<ImageBitmap>;

/**
 * La foto decodificata GIÀ ridotta: chiedere al browser `resizeWidth`
 * evita di tenere in memoria la bitmap intera di una foto da 48 MP
 * (~190 MB) solo per rimpicciolirla dopo. Non si conosce l'orientamento
 * prima di decodificare: si prova orizzontale e, se esce più alta di
 * LATO_DECODIFICA, si rifà limitando l'altezza. Un browser che non conosce
 * le opzioni (Safari vecchi) non rifiuta la foto: si scende a meno opzioni,
 * fino alla decodifica semplice, e riduce poi la tela.
 */
export async function decodificaRidotta(file: Blob, crea: CreaBitmap = createImageBitmap): Promise<ImageBitmap> {
  const tentativi: ImageBitmapOptions[] = [
    { imageOrientation: 'from-image', resizeQuality: 'high' },
    { resizeQuality: 'high' },
  ];
  for (const base of tentativi) {
    try {
      let b = await crea(file, { ...base, resizeWidth: LATO_DECODIFICA });
      if (b.height > LATO_DECODIFICA) {
        b.close();
        b = await crea(file, { ...base, resizeHeight: LATO_DECODIFICA });
      }
      return b;
    } catch (e) {
      if (!(e instanceof TypeError)) throw e;
    }
  }
  return crea(file);
}

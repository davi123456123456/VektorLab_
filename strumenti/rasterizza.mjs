/**
 * Converte un PDF in immagini, una per pagina.
 *
 * Serve alla verifica del §6: un PDF si giudica guardandolo, e per guardarlo
 * dentro un controllo automatico bisogna renderizzarlo. Si usa pdf.js dentro
 * un Chromium di Playwright — lo stesso motore che apre i PDF nel browser,
 * quindi ciò che si vede qui è ciò che vedrà chi apre il file.
 *
 * Restituisce anche il TESTO estratto da ogni pagina: è il modo diretto di
 * verificare che le scritte siano testo vero e non pixel, e di controllare che
 * i numeri coincidano con quelli mostrati a schermo.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename, join } from 'node:path';

/** Percorso del modulo pdf.js servito dal server di sviluppo di Vite. */
const PDFJS = '/node_modules/pdfjs-dist/build/pdf.mjs';

/**
 * @param {import('playwright').Page} page  pagina già aperta sul server Vite
 * @param {Uint8Array} byte                 il PDF
 * @param {{scala?: number}} opzioni
 * @returns {Promise<{immagini: string[], testi: string[][], pagine: number}>}
 */
export async function rasterizza(page, byte, { scala = 2 } = {}) {
  const base64 = Buffer.from(byte).toString('base64');
  return page.evaluate(async ({ base64, scala, PDFJS }) => {
    const pdfjs = await import(PDFJS);
    pdfjs.GlobalWorkerOptions.workerSrc = PDFJS.replace('pdf.mjs', 'pdf.worker.mjs');

    const dati = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const doc = await pdfjs.getDocument({ data: dati }).promise;

    const immagini = [];
    const testi = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const pagina = await doc.getPage(i);
      const vista = pagina.getViewport({ scale: scala });
      const c = document.createElement('canvas');
      c.width = Math.ceil(vista.width);
      c.height = Math.ceil(vista.height);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, c.width, c.height);
      await pagina.render({ canvasContext: ctx, viewport: vista }).promise;
      immagini.push(c.toDataURL('image/png'));

      const contenuto = await pagina.getTextContent();
      testi.push(contenuto.items.map((x) => x.str));
    }
    return { immagini, testi, pagine: doc.numPages };
  }, { base64, scala, PDFJS });
}

/** Salva le immagini su disco e restituisce i percorsi. */
export function salvaImmagini(immagini, cartella, prefisso) {
  mkdirSync(cartella, { recursive: true });
  const percorsi = [];
  immagini.forEach((d, i) => {
    const f = join(cartella, `${prefisso}-p${String(i + 1).padStart(2, '0')}.png`);
    writeFileSync(f, Buffer.from(d.split(',')[1], 'base64'));
    percorsi.push(f);
  });
  return percorsi;
}

export { readFileSync, basename };

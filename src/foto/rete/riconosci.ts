/**
 * RICONOSCI — dalla foto in grigio alle Primitive, in due passate.
 *
 *   foto ─► pagina a 768 px ─► rete ─► figure ─► lo schema (aste + vincolo)
 *        ─► ritaglio con il 15 % di margine ─► 768 px ─► rete ─► decodifica
 *        ─► raddrizza ─► aggancio delle quote ─► Primitive
 *
 * Le primitive sono nel sistema del ritaglio ridotto (y su); `ritaglio`
 * dice come riportarle sulla foto. Riquadri e figure sono in pixel della
 * foto originale (y giù). Niente si scrive: la foto resta in memoria.
 */

import type { Primitive } from '../tipi.js';
import { decodifica } from './decodifica.js';
import { trovaFigure, type Figura, type Riquadro } from './figura.js';
import { LATO, riduci, ritaglia, tensore, type Grigio } from './ingresso.js';
import type { Esegui } from './onnx.js';
import { agganciaQuote } from './quote.js';
import { raddrizza } from './raddrizza.js';

export const MARGINE_RITAGLIO = 0.15;

export type Riconoscimento =
  | {
    esito: 'ok';
    primitive: Primitive;
    riquadro: Riquadro;
    figure: Riquadro[];
    /** rotazione della foto tolta alle primitive [rad] */
    angolo: number;
    /** pixel del ritaglio ridotto → foto: x_foto = origine.x + x / scala */
    ritaglio: { origine: { x: number; y: number }; scala: number };
  }
  | { esito: 'nessunoSchema'; figure: Riquadro[] };

/** Prima passata: le figure del foglio (px della foto) e quale è lo schema (−1 se nessuna). */
export async function trovaSchemi(g: Grigio, esegui: Esegui): Promise<{ figure: Figura[]; scelta: number }> {
  const { grigio: pagina, scala } = riduci(g, LATO);
  const figure = trovaFigure(await esegui(tensore(pagina))).map((f) => ({
    ...f, riquadro: { x0: f.riquadro.x0 / scala, y0: f.riquadro.y0 / scala, x1: f.riquadro.x1 / scala, y1: f.riquadro.y1 / scala },
  }));
  return { figure, scelta: figure.findIndex((f) => f.aste > 0 && f.vincoli > 0) };
}

/** Seconda passata sul riquadro (px della foto), scelto o ritoccato dallo studente. */
export async function leggiRiquadro(g: Grigio, riquadro: Riquadro, esegui: Esegui): Promise<{
  primitive: Primitive; angolo: number; ritaglio: { origine: { x: number; y: number }; scala: number };
}> {
  const { grigio: pezzo, origine } = ritaglia(g, riquadro, MARGINE_RITAGLIO);
  const { grigio: vicino, scala } = riduci(pezzo, LATO);
  const u = await esegui(tensore(vicino));
  const { primitive, angolo } = raddrizza(decodifica(u, { larghezza: vicino.larghezza, altezza: vicino.altezza }));
  return { primitive: agganciaQuote(primitive), angolo, ritaglio: { origine, scala } };
}

export async function riconosci(g: Grigio, esegui: Esegui): Promise<Riconoscimento> {
  const { figure, scelta } = await trovaSchemi(g, esegui);
  const riquadri = figure.map((f) => f.riquadro);
  if (scelta < 0) return { esito: 'nessunoSchema', figure: riquadri };
  const riquadro = riquadri[scelta];
  return { esito: 'ok', ...(await leggiRiquadro(g, riquadro, esegui)), riquadro, figure: riquadri };
}

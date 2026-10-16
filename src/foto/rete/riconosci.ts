/**
 * RICONOSCI — dalla foto in grigio alle Primitive, in due passate.
 *
 *   foto ─► pagina a 768 px ─► rete ─► figure ─► lo schema (aste + vincolo)
 *        ─► ritaglio con il 15 % di margine ─► 768 px ─► rete ─► decodifica
 *        ─► raddrizza ─► Primitive
 *
 * Le primitive sono nel sistema del ritaglio ridotto (y su); `ritaglio`
 * dice come riportarle sulla foto. Riquadri e figure sono in pixel della
 * foto originale (y giù). Niente si scrive: la foto resta in memoria.
 */

import type { Primitive } from '../tipi.js';
import { decodifica } from './decodifica.js';
import { trovaFigure, type Riquadro } from './figura.js';
import { LATO, riduci, ritaglia, tensore, type Grigio } from './ingresso.js';
import type { Esegui } from './onnx.js';
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

export async function riconosci(g: Grigio, esegui: Esegui): Promise<Riconoscimento> {
  const { grigio: pagina, scala } = riduci(g, LATO);
  const figure = trovaFigure(await esegui(tensore(pagina)));
  const inFoto = (r: Riquadro): Riquadro => ({ x0: r.x0 / scala, y0: r.y0 / scala, x1: r.x1 / scala, y1: r.y1 / scala });
  const riquadri = figure.map((f) => inFoto(f.riquadro));
  const schema = figure.findIndex((f) => f.aste > 0 && f.vincoli > 0);
  if (schema < 0) return { esito: 'nessunoSchema', figure: riquadri };

  const riquadro = riquadri[schema];
  const { grigio: pezzo, origine } = ritaglia(g, riquadro, MARGINE_RITAGLIO);
  const { grigio: vicino, scala: scalaRitaglio } = riduci(pezzo, LATO);
  const u = await esegui(tensore(vicino));
  const { primitive, angolo } = raddrizza(decodifica(u, { larghezza: vicino.larghezza, altezza: vicino.altezza }));
  return { esito: 'ok', primitive, riquadro, figure: riquadri, angolo, ritaglio: { origine, scala: scalaRitaglio } };
}

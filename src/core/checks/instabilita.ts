/**
 * Instabilità dell'equilibrio per aste compresse.
 *
 * PERCHÉ È UNA VERIFICA A SÉ — la verifica di resistenza guarda la tensione e
 * non sa nulla della lunghezza dell'asta. Un'asta lunga e compressa può
 * sbandare con tensioni molto inferiori a f_y: è l'errore più comune, perché
 * la verifica tensionale passa e sembra tutto a posto. Per questo qui si
 * marcano le aste instabili ANCHE quando la resistenza è verificata.
 *
 * IL METODO — carico critico euleriano
 *
 *     N_cr = π²·E·I / L₀²        con L₀ = β·L
 *
 * e snellezza λ = L₀/i con i = √(I/A). La snellezza adimensionale
 *
 *     λ̄ = √( A·f_y / N_cr )
 *
 * entra nelle curve di instabilità dell'Eurocodice 3, che tengono conto delle
 * imperfezioni reali (curvatura iniziale, tensioni residue di laminazione,
 * eccentricità): l'asta reale non raggiunge mai N_cr, e per questo il
 * coefficiente χ riduce la resistenza a
 *
 *     N_b,Rd = χ·A·f_y / γ_M1
 *
 * La formula di Eulero pura sopravvaluterebbe la portata di aste tozze in
 * modo pericoloso: per λ̄ → 0 darebbe N_cr → ∞, mentre il limite fisico è la
 * plasticizzazione.
 */

import type { Materiale } from '../model/types.js';

export type CurvaEC3 = 'a0' | 'a' | 'a' | 'b' | 'c' | 'd';

/** Fattori di imperfezione α delle curve di instabilità (EN 1993-1-1). */
export const ALFA_CURVA: Record<string, number> = {
  a0: 0.13, a: 0.21, b: 0.34, c: 0.49, d: 0.76,
};

export interface EsitoInstabilita {
  /** true se l'asta è compressa: altrimenti la verifica non si applica */
  compressa: boolean;
  /** sforzo normale di compressione, valore positivo [N] */
  NEd: number;
  /** lunghezza libera di inflessione [m] */
  L0: number;
  beta: number;
  /** snellezza λ = L₀/i */
  lambda: number;
  /** snellezza al limite elastico λ₁ = π√(E/f_y) */
  lambda1: number;
  /** snellezza adimensionale λ̄ */
  lambdaBarra: number;
  /** carico critico euleriano [N] */
  Ncr: number;
  /** tensione critica euleriana [Pa] */
  sigmaCr: number;
  curva: string;
  alfa: number;
  /** coefficiente di riduzione χ ∈ (0,1] */
  chi: number;
  /** resistenza all'instabilità [N] */
  NbRd: number;
  /** sfruttamento N_Ed / N_b,Rd */
  sfruttamento: number;
  verificato: boolean;
  /** margine rispetto al carico critico teorico */
  coefficienteSicurezzaEuleriano: number;
  note: string[];
}

export interface DatiInstabilita {
  /** sforzo normale minimo lungo l'asta (il più compresso) [N] */
  Nmin: number;
  lunghezza: number;
  A: number;
  I: number;
  /** raggio d'inerzia [m] */
  i: number;
  beta: number;
  materiale: Materiale;
  /** coefficiente parziale per l'instabilità */
  gammaM1?: number;
}

export function verificaInstabilita(d: DatiInstabilita): EsitoInstabilita {
  const note: string[] = [];
  const NEd = Math.max(0, -d.Nmin);   // solo la compressione conta
  const L0 = d.beta * d.lunghezza;
  const E = d.materiale.E;
  const fy = d.materiale.resistenze.fy ?? d.materiale.resistenze.fc
    ?? d.materiale.resistenze.ft ?? 0;
  const gammaM1 = d.gammaM1 ?? d.materiale.gammaM;

  const Ncr = (Math.PI ** 2 * E * d.I) / (L0 * L0);
  const sigmaCr = d.A > 0 ? Ncr / d.A : 0;
  const lambda = d.i > 0 ? L0 / d.i : Infinity;
  const lambda1 = fy > 0 ? Math.PI * Math.sqrt(E / fy) : Infinity;
  const lambdaBarra = fy > 0 && Ncr > 0 ? Math.sqrt((d.A * fy) / Ncr) : 0;

  const curva = d.materiale.curvaInstabilita ?? 'c';
  const alfa = ALFA_CURVA[curva] ?? 0.49;

  // χ secondo EN 1993-1-1 §6.3.1.2
  let chi = 1;
  if (lambdaBarra > 0.2) {
    const phi = 0.5 * (1 + alfa * (lambdaBarra - 0.2) + lambdaBarra * lambdaBarra);
    const rad = phi * phi - lambdaBarra * lambdaBarra;
    chi = rad > 0 ? 1 / (phi + Math.sqrt(rad)) : 1 / phi;
    chi = Math.min(chi, 1);
  } else {
    note.push(
      'λ̄ ≤ 0.2: l\'asta è tozza, l\'instabilità non riduce la resistenza ' +
      '(χ = 1) e governa la verifica tensionale.',
    );
  }

  const NbRd = (chi * d.A * fy) / gammaM1;
  const sfruttamento = NbRd > 0 ? NEd / NbRd : (NEd > 0 ? Infinity : 0);

  if (!d.materiale.curvaInstabilita) {
    note.push(
      `Il materiale non dichiara una curva di instabilità: si è usata la curva ` +
      `"c", cautelativa. Per i profili laminati la curva dipende da forma, ` +
      `spessore e asse di inflessione.`,
    );
  }
  if (lambda > 200) {
    note.push(
      `Snellezza λ = ${lambda.toFixed(0)}: oltre 200 le normative sconsigliano ` +
      `l'impiego come elemento principale compresso.`,
    );
  }

  return {
    compressa: NEd > 0,
    NEd, L0, beta: d.beta, lambda, lambda1, lambdaBarra,
    Ncr, sigmaCr, curva, alfa, chi, NbRd, sfruttamento,
    verificato: sfruttamento <= 1,
    coefficienteSicurezzaEuleriano: NEd > 0 ? Ncr / NEd : Infinity,
    note,
  };
}

/**
 * Lunghezza libera di inflessione secondo lo schema di vincolo.
 * Sono i casi teorici di Eulero: la β reale dipende dalla rigidezza dei nodi
 * del telaio, e per questo resta sempre sovrascrivibile a mano.
 */
export const BETA_TEORICI: { schema: string; beta: number; descrizione: string }[] = [
  { schema: 'cerniera–cerniera', beta: 1.0, descrizione: 'caso fondamentale di Eulero' },
  { schema: 'incastro–libero', beta: 2.0, descrizione: 'mensola: la più sfavorevole' },
  { schema: 'incastro–incastro', beta: 0.5, descrizione: 'estremi non traslabili' },
  { schema: 'incastro–cerniera', beta: 0.7, descrizione: 'valore teorico 0.699' },
  { schema: 'incastro–pattino', beta: 1.0, descrizione: 'estremo traslabile senza rotazione' },
  { schema: 'telaio a nodi spostabili', beta: 2.0, descrizione: 'valore prudenziale' },
];

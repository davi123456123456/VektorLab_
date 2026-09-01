/**
 * §6 — LE ESPRESSIONI POLINOMIALI DI N, T, M.
 *
 * Oltre ai valori numerici servono le espressioni in `x`, perché sono ciò che
 * si scrive risolvendo a mano ed è quello che l'utente deve poter
 * confrontare. Un diagramma dice *quanto*; `T(x) = 18 − 10x` dice *perché*.
 *
 * COME SI OTTENGONO. Non si impongono costanti di integrazione: `N₀`, `T₀` e
 * `M₀` sono i valori nella sezione iniziale del tratto, che l'equilibrio del
 * tronco fornisce già. Le costanti `c₁` e `c₂` del procedimento manuale SONO
 * quei valori, ed è la parte più fragile del calcolo a mano che sparisce.
 *
 * I coefficienti si ricavano interpolando i campioni, e il GRADO si determina
 * provando dal più basso: senza carico `T` è costante e `M` lineare; con
 * carico uniforme `T` è lineare e `M` parabolico; con carico lineare `T` è
 * parabolico e `M` cubico. Cercare il grado invece di assumerlo verifica
 * anche quella relazione, che è la §6.3.
 *
 * E QUANDO NON TORNA, non si mostra un'espressione plausibile. Se nessun
 * polinomio fino al terzo grado riproduce i campioni entro tolleranza, il
 * tratto viene dichiarato non esprimibile: succede dove c'è una singolarità
 * non intercettata, e mostrare lì una parabola inventata sarebbe peggio che
 * non mostrare niente.
 */

export interface Polinomio {
  /** coefficienti dal grado 0 in su: `a₀ + a₁x + a₂x² + …` */
  coefficienti: number[];
  /** massimo scarto fra il polinomio e i campioni */
  scarto: number;
}

export interface EspressioneTratto {
  /** ascissa iniziale e finale del tratto, in metri */
  da: number;
  a: number;
  N: Polinomio | null;
  T: Polinomio | null;
  M: Polinomio | null;
}

/** Valuta il polinomio in x. */
export function valuta(p: Polinomio, x: number): number {
  let v = 0;
  for (let i = p.coefficienti.length - 1; i >= 0; i--) v = v * x + p.coefficienti[i];
  return v;
}

/**
 * Interpolazione ai minimi quadrati di grado fissato, con equazioni normali.
 *
 * Le ascisse sono traslate all'inizio del tratto: su un tratto che comincia a
 * x = 40 m, le potenze fino alla terza valgono 64000 e la matrice normale
 * diventa inutilizzabile. Traslando, i coefficienti si riferiscono all'inizio
 * del tratto — che è anche il modo in cui si scrivono a mano.
 */
function interpola(xs: number[], ys: number[], grado: number): number[] | null {
  const n = grado + 1;
  if (xs.length < n) return null;

  const A: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  const b = new Array<number>(n).fill(0);
  for (let k = 0; k < xs.length; k++) {
    const potenze = new Array<number>(2 * n - 1);
    potenze[0] = 1;
    for (let i = 1; i < potenze.length; i++) potenze[i] = potenze[i - 1] * xs[k];
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) A[i][j] += potenze[i + j];
      b[i] += potenze[i] * ys[k];
    }
  }

  // eliminazione di Gauss con pivot parziale
  for (let i = 0; i < n; i++) {
    let p = i;
    for (let r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r;
    if (Math.abs(A[p][i]) < 1e-30) return null;
    [A[i], A[p]] = [A[p], A[i]];
    [b[i], b[p]] = [b[p], b[i]];
    for (let r = i + 1; r < n; r++) {
      const f = A[r][i] / A[i][i];
      if (f === 0) continue;
      for (let c = i; c < n; c++) A[r][c] -= f * A[i][c];
      b[r] -= f * b[i];
    }
  }
  const out = new Array<number>(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let v = b[i];
    for (let j = i + 1; j < n; j++) v -= A[i][j] * out[j];
    out[i] = v / A[i][i];
  }
  return out;
}

/**
 * Il polinomio di grado MINIMO che riproduce i campioni entro tolleranza.
 *
 * Si parte dal grado zero e si sale: il grado più basso che basta è quello
 * vero, e trovarlo dal basso evita di adattare una cubica a una retta —
 * che riuscirebbe sempre, con coefficienti spurii che poi si leggono
 * nell'espressione mostrata.
 */
function polinomioMinimo(
  xs: number[], ys: number[], scala: number, gradoMassimo = 3,
): Polinomio | null {
  const tolleranza = Math.max(scala * 1e-7, 1e-9);
  for (let g = 0; g <= gradoMassimo; g++) {
    const c = interpola(xs, ys, g);
    if (!c) continue;
    let scarto = 0;
    for (let k = 0; k < xs.length; k++) {
      let v = 0;
      for (let i = c.length - 1; i >= 0; i--) v = v * xs[k] + c[i];
      scarto = Math.max(scarto, Math.abs(v - ys[k]));
    }
    if (scarto <= tolleranza) {
      // si azzerano i coefficienti che sono solo rumore, altrimenti
      // l'espressione mostrerebbe termini come «+ 3.1e-13 x²»
      const puliti = c.map((v) => (Math.abs(v) < tolleranza ? 0 : v));
      while (puliti.length > 1 && puliti[puliti.length - 1] === 0) puliti.pop();
      return { coefficienti: puliti, scarto };
    }
  }
  return null;
}

/**
 * Espressioni tratto per tratto.
 *
 * I tratti sono separati dalle DISCONTINUITÀ, che il campionatore segnala
 * ripetendo l'ascissa. Interpolare attraverso un salto darebbe una curva che
 * non esiste in nessun punto della trave.
 */
export function espressioniPerAsta(
  ascisse: Float64Array | readonly number[],
  N: Float64Array | readonly number[],
  T: Float64Array | readonly number[],
  M: Float64Array | readonly number[],
  lunghezza: number,
): EspressioneTratto[] {
  const out: EspressioneTratto[] = [];
  const eps = Math.max(lunghezza * 1e-7, 1e-12);

  const scalaN = Math.max(...[...N].map(Math.abs), 1);
  const scalaT = Math.max(...[...T].map(Math.abs), 1);
  const scalaM = Math.max(...[...M].map(Math.abs), 1);

  let inizio = 0;
  for (let i = 1; i <= ascisse.length; i++) {
    const fineTratto = i === ascisse.length
      || ascisse[i] - ascisse[i - 1] <= eps;
    if (!fineTratto) continue;

    const indici: number[] = [];
    for (let k = inizio; k < i; k++) indici.push(k);
    if (indici.length >= 2) {
      const x0 = ascisse[indici[0]];
      const xs = indici.map((k) => ascisse[k] - x0);
      out.push({
        da: x0,
        a: ascisse[indici[indici.length - 1]],
        N: polinomioMinimo(xs, indici.map((k) => N[k]), scalaN),
        T: polinomioMinimo(xs, indici.map((k) => T[k]), scalaT),
        M: polinomioMinimo(xs, indici.map((k) => M[k]), scalaM),
      });
    }
    inizio = i;
  }
  return out;
}

/**
 * L'espressione scritta come si scriverebbe a mano.
 *
 * `unita` è quella della grandezza; `x` resta in metri. I coefficienti sono
 * già riferiti all'inizio del tratto, quindi `x` va letto da lì.
 */
export function scrivi(p: Polinomio | null, unita: string, cifre = 3): string {
  if (!p) return 'non esprimibile in forma polinomiale';
  const termini: string[] = [];
  for (let g = p.coefficienti.length - 1; g >= 0; g--) {
    const c = p.coefficienti[g];
    if (c === 0 && p.coefficienti.length > 1) continue;
    const v = Math.abs(c);
    const numero = Number(v.toPrecision(cifre)).toString();
    const parte = g === 0 ? numero
      : g === 1 ? `${numero} x`
      : `${numero} x${g === 2 ? '²' : '³'}`;
    const segno = c < 0 ? '−' : termini.length === 0 ? '' : '+';
    termini.push(termini.length === 0 ? `${segno}${parte}` : `${segno} ${parte}`);
  }
  if (termini.length === 0) termini.push('0');
  return `${termini.join(' ')}  ${unita}`;
}

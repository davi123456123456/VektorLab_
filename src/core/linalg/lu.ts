/**
 * Fattorizzazione LU con pivoting parziale, per sistemi densi piccoli.
 *
 * Il sistema delle equazioni cardinali dei corpi rigidi è 3n × v con n e v
 * dell'ordine delle decine: un metodo denso è la scelta giusta, e il pivoting
 * parziale è indispensabile perché la matrice non è né simmetrica né definita.
 *
 * Il rango si ricava dai pivot: serve a distinguere isostatico, iperstatico e
 * labile PRIMA di provare a risolvere. Non si usano pseudo-inverse né minimi
 * quadrati: su una struttura labile darebbero numeri plausibili e fisicamente
 * privi di senso, che è il modo peggiore di sbagliare.
 */

export interface EsitoLU {
  /** soluzione, se il sistema è determinato */
  x: Float64Array | null;
  rango: number;
  /** pivot più piccolo in valore assoluto fra quelli accettati */
  pivotMinimo: number;
  /** true se il sistema ammette soluzione unica */
  determinato: boolean;
  /** true se il termine noto è incompatibile con lo spazio delle colonne */
  incompatibile: boolean;
}

/**
 * Risolve A·x = b con A di dimensione m × n qualunque.
 *
 * - m = n e rango pieno  → soluzione unica
 * - rango < n            → sistema indeterminato (iperstatico): nessuna
 *                          soluzione unica, non se ne inventa una
 * - righe incompatibili  → nessuna soluzione (equilibrio impossibile: labile)
 */
export function risolviLU(
  A: number[][], b: number[], tolleranza = 1e-10,
): EsitoLU {
  const m = A.length;
  const n = m > 0 ? A[0].length : 0;
  if (m === 0 || n === 0) {
    return { x: null, rango: 0, pivotMinimo: 0, determinato: false, incompatibile: false };
  }

  // matrice aumentata, così l'eliminazione tratta anche il termine noto
  const M: number[][] = A.map((riga, i) => [...riga, b[i]]);

  // scala di riferimento per una tolleranza indipendente dalle unità
  let scala = 0;
  for (const riga of A) for (const v of riga) scala = Math.max(scala, Math.abs(v));
  if (scala === 0) scala = 1;
  const soglia = tolleranza * scala;

  const pivotDiColonna: number[] = [];
  let rango = 0;
  let pivotMinimo = Infinity;
  let riga = 0;

  for (let col = 0; col < n && riga < m; col++) {
    // pivoting parziale: si sceglie il massimo in valore assoluto
    let migliore = riga;
    for (let r = riga + 1; r < m; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[migliore][col])) migliore = r;
    }
    if (Math.abs(M[migliore][col]) < soglia) continue;   // colonna dipendente

    [M[riga], M[migliore]] = [M[migliore], M[riga]];
    const pivot = M[riga][col];
    pivotMinimo = Math.min(pivotMinimo, Math.abs(pivot));

    for (let r = riga + 1; r < m; r++) {
      const f = M[r][col] / pivot;
      if (f === 0) continue;
      for (let c = col; c <= n; c++) M[r][c] -= f * M[riga][c];
    }
    pivotDiColonna.push(col);
    rango++;
    riga++;
  }

  // righe residue tutte nulle a sinistra ma non a destra: sistema impossibile
  let incompatibile = false;
  for (let r = rango; r < m; r++) {
    let sinistraNulla = true;
    for (let c = 0; c < n; c++) {
      if (Math.abs(M[r][c]) > soglia) { sinistraNulla = false; break; }
    }
    if (sinistraNulla && Math.abs(M[r][n]) > soglia) { incompatibile = true; break; }
  }

  const determinato = rango === n && !incompatibile;
  if (!determinato) {
    return {
      x: null, rango,
      pivotMinimo: Number.isFinite(pivotMinimo) ? pivotMinimo : 0,
      determinato: false, incompatibile,
    };
  }

  // sostituzione all'indietro sulle sole colonne pivot
  const x = new Float64Array(n);
  for (let k = rango - 1; k >= 0; k--) {
    const col = pivotDiColonna[k];
    let somma = M[k][n];
    for (let c = col + 1; c < n; c++) somma -= M[k][c] * x[c];
    x[col] = somma / M[k][col];
  }

  return {
    x, rango,
    pivotMinimo: Number.isFinite(pivotMinimo) ? pivotMinimo : 0,
    determinato: true, incompatibile: false,
  };
}

/** Trasposta di una matrice densa. */
export function trasposta(A: number[][]): number[][] {
  const m = A.length;
  const n = m > 0 ? A[0].length : 0;
  const T: number[][] = Array.from({ length: n }, () => new Array<number>(m).fill(0));
  for (let i = 0; i < m; i++) for (let j = 0; j < n; j++) T[j][i] = A[i][j];
  return T;
}

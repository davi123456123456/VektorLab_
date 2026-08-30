/**
 * Riordinamento di Cuthill-McKee inverso (RCM).
 *
 * PERCHÉ — il solutore a profilo (skyline) memorizza, per ogni colonna, tutti
 * i termini dalla prima riga non nulla fino alla diagonale. Il costo dipende
 * quindi dall'AMPIEZZA DI BANDA, non dal numero di termini non nulli. RCM
 * rinumera i gradi di libertà percorrendo il grafo in ampiezza a partire da un
 * nodo periferico, riducendo la banda anche di un ordine di grandezza su
 * telai estesi. Il riordino è interno al solutore: chi lo chiama non se ne
 * accorge (la permutazione viene applicata e poi invertita).
 */

/** @param adiacenza adiacenza[i] = lista dei DOF connessi a i */
export function cuthillMcKeeInverso(adiacenza: number[][]): Int32Array {
  const n = adiacenza.length;
  const grado = adiacenza.map((a) => a.length);
  const visitato = new Uint8Array(n);
  const ordine: number[] = [];

  while (ordine.length < n) {
    // radice = nodo non visitato di grado minimo (approssima un nodo periferico)
    let radice = -1;
    for (let i = 0; i < n; i++) {
      if (!visitato[i] && (radice === -1 || grado[i] < grado[radice])) radice = i;
    }
    if (radice === -1) break;

    // visita in ampiezza, vicini ordinati per grado crescente
    const coda = [radice];
    visitato[radice] = 1;
    for (let testa = 0; testa < coda.length; testa++) {
      const v = coda[testa];
      ordine.push(v);
      const vicini = adiacenza[v]
        .filter((w) => !visitato[w])
        .sort((a, b) => grado[a] - grado[b]);
      for (const w of vicini) {
        visitato[w] = 1;
        coda.push(w);
      }
    }
  }

  // l'inversione della sequenza di Cuthill-McKee riduce ulteriormente il profilo
  ordine.reverse();
  const perm = new Int32Array(n);
  for (let k = 0; k < n; k++) perm[k] = ordine[k];
  return perm;
}

/** perm[k] = vecchio indice del k-esimo nuovo → inversa: inv[vecchio] = nuovo */
export function invertiPermutazione(perm: Int32Array): Int32Array {
  const inv = new Int32Array(perm.length);
  for (let k = 0; k < perm.length; k++) inv[perm[k]] = k;
  return inv;
}

/**
 * PARTIZIONE DELLE ASTE IN UNA SCONNESSIONE NODALE.
 *
 * In un nodo con due aste «cerniera interna» non è ambigua: c'è una sola cosa
 * che può fare. Con tre o più aste ce ne sono diverse, e sono strutture
 * diverse:
 *
 *   · svincolarle TUTTE fra loro — tre corpi rigidi distinti;
 *   · imperniarne UNA rispetto alle altre due, che restano saldate — due
 *     corpi.
 *
 * Nessuna delle due è «quella giusta»: dipende da cosa si sta modellando, e
 * il software non può indovinarlo. Per questo la partizione è un DATO, scritto
 * nel modello e modificabile, e non una deduzione fatta al volo dal tipo di
 * vincolo.
 *
 * LIMITE ATTUALE, dichiarato. L'espansione realizza la sconnessione
 * rilasciando l'estremo delle aste: un estremo rilasciato ruota per conto suo,
 * uno non rilasciato segue la rotazione del nodo. Ne segue che UN SOLO gruppo
 * può contenere più di un'asta — quello che tiene il nodo. Una partizione con
 * due gruppi da due aste ciascuno non è rappresentabile con questo meccanismo,
 * e `verificaIntegrita` la segnala invece di calcolarla sbagliata.
 */

import type { ElementId, VincoloInterno } from './types.js';

/**
 * La partizione da usare, ricostruita quando manca.
 *
 * `convergenti` sono le aste che arrivano davvero nel nodo ORA: la partizione
 * salvata può citarne di cancellate, o non citarne di nuove, e in entrambi i
 * casi va riportata alla realtà prima di usarla.
 */
export function gruppiSconnessione(
  v: VincoloInterno, convergenti: readonly ElementId[],
): ElementId[][] {
  const presenti = new Set<string>(convergenti as readonly string[]);

  if (v.gruppi && v.gruppi.length > 0) {
    const gruppi = v.gruppi
      .map((g) => g.filter((id) => presenti.has(id as unknown as string)))
      .filter((g) => g.length > 0);
    // le aste nuove, comparse dopo che la partizione è stata scritta, entrano
    // ciascuna in un gruppo proprio: è la scelta prudente, perché saldarle a
    // un gruppo esistente cambierebbe la struttura senza che nessuno l'abbia
    // chiesto
    const citate = new Set(gruppi.flat().map((x) => x as unknown as string));
    for (const id of convergenti) {
      if (!citate.has(id as unknown as string)) gruppi.push([id]);
    }
    return gruppi.length > 0 ? gruppi : convergenti.map((id) => [id]);
  }

  // ── ricostruzione dal formato precedente ──
  const master = v.astaMaster && presenti.has(v.astaMaster as unknown as string)
    ? v.astaMaster : undefined;
  const svincolate = v.asteSvincolate?.filter(
    (id) => presenti.has(id as unknown as string) && id !== master) ?? [];

  if (svincolate.length === 0) {
    // nessun elenco: la sconnessione riguardava tutte le aste
    return convergenti.map((id) => [id]);
  }
  const resto = convergenti.filter((id) => !svincolate.includes(id));
  return [...svincolate.map((id) => [id]), ...(resto.length > 0 ? [resto] : [])];
}

/** Gradi di vincolo introdotti dalla partizione: `2(g − 1)`. */
export function gradiDiVincoloPartizione(gruppi: readonly ElementId[][]): number {
  return 2 * Math.max(0, gruppi.length - 1);
}

/**
 * Il gruppo che conserva il nodo, e le aste da rilasciare.
 *
 * Tiene il nodo il gruppo PIÙ NUMEROSO: è quello per cui il rilascio
 * individuale costerebbe di più in accuratezza, e a parità di numero vince il
 * primo, così il risultato non dipende dall'ordine in cui l'utente ha
 * spuntato le caselle.
 */
export function rilasciDa(
  gruppi: readonly ElementId[][],
): { saldate: ElementId[]; rilasciate: ElementId[] } {
  if (gruppi.length <= 1) return { saldate: gruppi[0] ? [...gruppi[0]] : [], rilasciate: [] };
  let migliore = 0;
  for (let i = 1; i < gruppi.length; i++) {
    if (gruppi[i].length > gruppi[migliore].length) migliore = i;
  }
  const saldate = [...gruppi[migliore]];
  const rilasciate = gruppi.flatMap((g, i) => (i === migliore ? [] : g));
  return { saldate, rilasciate };
}

/** true se la partizione ha due o più gruppi con più di un'asta. */
export function partizioneNonRappresentabile(
  gruppi: readonly ElementId[][],
): boolean {
  return gruppi.filter((g) => g.length > 1).length >= 2;
}

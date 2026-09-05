/**
 * §3 (iterazione 11-bis) — LE COLONNE DEL CONFRONTO FRA MATERIALI.
 *
 * Stanno in un modulo loro, separate dalla tabella che le disegna, perché la
 * regola «una sola colonna per concetto» è una proprietà dell'elenco e si
 * verifica guardando l'elenco: dentro il componente non era raggiungibile da
 * un test, e infatti la densità era finita fra i risultati due volte.
 */

export type Colonna =
  | 'nome' | 'massa' | 'sigma' | 'resistenza' | 'utilizzo'
  | 'cs' | 'spostamento' | 'esito' | 'costo';

/**
 * §3.2 — LE COLONNE, una per concetto.
 *
 * Nome comprensibile e unità nell'INTESTAZIONE, mai nelle celle; il termine
 * tecnico nel suggerimento, dove serve a chi lo conosce senza costringere chi
 * non lo conosce a indovinare. «Freccia» e «sfruttamento» sono corretti e
 * incomprensibili fuori contesto: qui compaiono come spiegazione, non come
 * etichetta.
 *
 * Le proprietà costanti del materiale — densità, modulo elastico — NON stanno
 * qui: sono dati d'ingresso e vivono nella scheda del materiale. In un
 * confronto interessa l'effetto sulla struttura in esame, non la carta
 * d'identità del materiale. La resistenza di snervamento fa eccezione perché
 * è il termine di paragone di tutte le colonne che la seguono.
 */
export const COLONNE: {
  id: Colonna; testo: string; unita?: string; spiega: string;
}[] = [
  { id: 'nome', testo: 'Materiale', spiega: 'nome del materiale assegnato a tutte le aste' },
  { id: 'massa', testo: 'Peso', unita: 'kg', spiega: 'massa complessiva della struttura con quel materiale' },
  { id: 'sigma', testo: 'Tensione max', unita: 'MPa', spiega: 'σ di von Mises nel punto più sollecitato' },
  { id: 'resistenza', testo: 'Snervamento', unita: 'MPa', spiega: 'S_y, la resistenza caratteristica del materiale' },
  { id: 'utilizzo', testo: 'Utilizzo', unita: '%', spiega: 'sfruttamento: σ rapportata alla resistenza di progetto' },
  { id: 'cs', testo: 'Coeff. sicurezza', spiega: 'C.S. = S_y / σ nel punto più sollecitato' },
  { id: 'spostamento', testo: 'Spostamento max', unita: 'mm', spiega: 'freccia: il massimo spostamento della struttura' },
  { id: 'esito', testo: 'Esito', spiega: 'verificata a resistenza e stabile a compressione' },
  { id: 'costo', testo: 'Costo', unita: '€', spiega: 'costo indicativo del materiale impiegato' },
];

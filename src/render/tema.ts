/**
 * Il tema è definito UNA VOLTA nel CSS e letto qui dal canvas.
 * Così la legenda dell'interfaccia e il disegno non possono divergere: se
 * cambia `--momento` cambiano insieme il diagramma e il pallino in legenda.
 */

export interface Tema {
  sfondo: string;
  grigliaFine: string;
  grigliaMedia: string;
  grigliaAsse: string;
  asta: string;
  astaSelezionata: string;
  nodo: string;
  nodoSelezionato: string;
  evidenziato: string;
  vincolo: string;
  /** §2 — la linea tratteggiata del riferimento locale */
  tratteggiata: string;
  carico: string;
  snap: string;
  accento: string;
  testo: string;
  testoAttenuato: string;
  sforzoNormale: string;
  taglio: string;
  momento: string;
  deformata: string;
  reazione: string;
}

const VARIABILI: Record<keyof Tema, string> = {
  sfondo: '--sfondo',
  grigliaFine: '--griglia-fine',
  grigliaMedia: '--griglia-media',
  grigliaAsse: '--griglia-asse',
  asta: '--asta',
  astaSelezionata: '--asta-selezionata',
  nodo: '--nodo',
  nodoSelezionato: '--nodo-selezionato',
  evidenziato: '--evidenziato',
  vincolo: '--vincolo',
  tratteggiata: '--testo-debole',
  carico: '--carico',
  snap: '--snap',
  accento: '--accento',
  testo: '--testo',
  testoAttenuato: '--testo-attenuato',
  sforzoNormale: '--sforzo-normale',
  taglio: '--taglio',
  momento: '--momento',
  deformata: '--deformata',
  reazione: '--reazione',
};

const RISERVA: Tema = {
  sfondo: '#14171c', grigliaFine: '#20252d', grigliaMedia: '#2a313b',
  grigliaAsse: '#3f4a5a', asta: '#c8d0dc', astaSelezionata: '#ffb545',
  nodo: '#8b95a5', nodoSelezionato: '#ffb545', evidenziato: '#ffffff',
  vincolo: '#ff5f56', tratteggiata: '#6b7483', carico: '#35c46a', snap: '#00d9c0', accento: '#4a9eff',
  testo: '#e4e7ec', testoAttenuato: '#9aa3b2',
  sforzoNormale: '#4a9eff', taglio: '#35c46a', momento: '#ff8a3d',
  deformata: '#b57cff', reazione: '#ffd23f',
};

let cache: Tema | null = null;

export function leggiTema(elemento?: HTMLElement): Tema {
  if (cache) return cache;
  if (typeof window === 'undefined') return RISERVA;
  const stile = getComputedStyle(elemento ?? document.documentElement);
  const t = {} as Tema;
  for (const [chiave, variabile] of Object.entries(VARIABILI)) {
    const v = stile.getPropertyValue(variabile).trim();
    t[chiave as keyof Tema] = v || RISERVA[chiave as keyof Tema];
  }
  cache = t;
  return t;
}

export const invalidaTema = (): void => { cache = null; };

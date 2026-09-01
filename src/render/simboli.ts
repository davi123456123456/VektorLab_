/**
 * Simboli grafici dei vincoli esterni.
 *
 * Ogni simbolo è disegnato in un riferimento LOCALE con il nodo nell'origine e
 * il "terreno" orizzontale sotto di esso, poi ruotato dell'angolo del vincolo.
 * Questo tiene il disegno coerente con la cinematica: per il carrello l'angolo
 * è l'inclinazione del piano di scorrimento, e infatti il piano disegnato è
 * proprio quello lungo cui il carrello può muoversi.
 *
 * ATTENZIONE ALLA BIELLA — è l'unico simbolo in cui l'angolo indica la
 * direzione dell'ASSE e non del piano: la si disegna quindi lungo l'angolo,
 * non perpendicolarmente. È la stessa asimmetria documentata in
 * `docs/convenzioni.md`, e qui va rispettata o il disegno mentirebbe.
 *
 * I simboli hanno DIMENSIONE FISSA IN PIXEL: devono restare leggibili a
 * qualunque zoom, esattamente come le quote di un disegno tecnico.
 */

import type { Vincolo } from '../core/model/types.js';
import type { Punto } from './camera.js';
import { orientamentoVincolo } from '../core/model/orientamento.js';

export const RAGGIO_SIMBOLO = 22;

interface Contesto {
  ctx: CanvasRenderingContext2D;
  colore: string;
  sfondo: string;
  evidenziato: boolean;
}

/**
 * Disegna il vincolo `v` sul punto schermo `p`.
 * `angoloSchermo` è già corretto per il ribaltamento dell'asse y del canvas.
 */
export function disegnaVincolo(
  ctx: CanvasRenderingContext2D, p: Punto, v: Vincolo,
  colore: string, sfondo: string, evidenziato = false, scala = 1,
  /**
   * Rotazione AGGIUNTIVA in radianti sullo schermo. Non è un secondo modo di
   * orientare il vincolo: serve al solo caso in cui il simbolo va disegnato
   * solidale a una struttura che ha ruotato — sulla deformata — e resta zero
   * ovunque altrove.
   */
  rotazioneExtra = 0,
): void {
  ctx.save();
  ctx.translate(p.x, p.y);
  // UNICA fonte della rotazione, la stessa che governa le reazioni: due tipi
  // di vincolo con lo stesso angolo devono risultare orientati identicamente,
  // e ci riescono solo se nessuno dei due aggiunge un offset per conto suo.
  ctx.rotate(orientamentoVincolo(v.angolo).rotazioneSchermo + rotazioneExtra);
  ctx.scale(scala, scala);
  ctx.lineWidth = evidenziato ? 2.4 : 1.8;
  ctx.strokeStyle = colore;
  ctx.fillStyle = colore;
  ctx.lineJoin = 'round';

  const c: Contesto = { ctx, colore, sfondo, evidenziato };
  switch (v.tipo) {
    case 'cerniera': cerniera(c); break;
    case 'carrello': carrello(c); break;
    case 'incastro': incastro(c); break;
    case 'bipendolo': bipendolo(c); break;
    case 'pattino': pattino(c); break;
    case 'biella': biella(c); break;
    case 'molla': molla(c, v); break;
  }
  ctx.restore();
}

/** Tratteggio del terreno: segmenti a 45° sotto una linea orizzontale. */
function terreno(c: Contesto, y: number, semiLarghezza = 16, passo = 5): void {
  const { ctx } = c;
  ctx.beginPath();
  ctx.moveTo(-semiLarghezza, y);
  ctx.lineTo(semiLarghezza, y);
  ctx.stroke();
  ctx.beginPath();
  for (let x = -semiLarghezza; x < semiLarghezza; x += passo) {
    ctx.moveTo(x, y + passo);
    ctx.lineTo(x + passo, y);
  }
  ctx.stroke();
}

/**
 * Cerniera esterna: cerchietto VUOTO sul punto di applicazione, triangolo col
 * vertice che lo tocca, tratteggiatura del terreno sotto.
 *
 * Il cerchietto vuoto è la parte che conta: dice che lì la rotazione è libera,
 * ed è ciò che distingue la cerniera dall'incastro senza dover leggere niente.
 */
function cerniera(c: Contesto): void {
  const { ctx } = c;
  const r = 3.6;
  // il triangolo parte SOTTO il cerchietto, così il vertice lo tocca invece di
  // attraversarlo
  ctx.beginPath();
  ctx.moveTo(0, r);
  ctx.lineTo(-10, 15);
  ctx.lineTo(10, 15);
  ctx.closePath();
  ctx.fillStyle = c.sfondo;
  ctx.fill();
  ctx.strokeStyle = c.colore;
  ctx.stroke();
  terreno(c, 15);
  cerchietto(c, 0, 0, r);
}

/**
 * CERNIERA CHE SCONNETTE — il carrello senza le ruote.
 *
 * Il simbolo a terra è quello della cerniera a telaio: stesso triangolo,
 * stessa tratteggiatura, due reazioni. Cambia una cosa sola, e si vede: le
 * aste NON attraversano il perno, ci si fermano sopra. È la differenza fra un
 * appoggio sotto una trave continua e un appoggio che è anche una cerniera,
 * e nel disegno strutturale è l'unico modo di distinguerli a colpo d'occhio.
 *
 * Qui si disegnano i due mozziconi d'asta; sul canvas ci pensa il tracciato
 * delle aste, interrotto dalla partizione.
 */
export function disegnaCernieraSconnessa(
  ctx: CanvasRenderingContext2D, p: Punto, angoloSchermo: number,
  colore: string, sfondo: string, coloreAsta: string,
  evidenziato = false, scala = 1, conMozziconi = false,
): void {
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(angoloSchermo);
  ctx.scale(scala, scala);
  ctx.lineWidth = evidenziato ? 2.4 : 1.8;
  ctx.lineJoin = 'round';
  const c: Contesto = { ctx, colore, sfondo, evidenziato };

  if (conMozziconi) {
    // i due tronconi si fermano al bordo del perno: fra loro resta il vuoto
    // che rende evidente la sconnessione
    ctx.strokeStyle = coloreAsta;
    ctx.lineWidth = 1.8;
    for (const verso of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(verso * 5.2, 0);
      ctx.lineTo(verso * 17, 0);
      ctx.stroke();
    }
  }

  ctx.strokeStyle = colore;
  ctx.fillStyle = colore;
  const r = 3.6;
  ctx.beginPath();
  ctx.moveTo(0, r);
  ctx.lineTo(-10, 15);
  ctx.lineTo(10, 15);
  ctx.closePath();
  ctx.fillStyle = sfondo;
  ctx.fill();
  ctx.strokeStyle = colore;
  ctx.stroke();
  terreno(c, 15);
  cerchietto(c, 0, 0, r);
  ctx.restore();
}

/** Cerchietto vuoto: sfondo pieno perché la linea dell'asta non ci passi dentro. */
function cerchietto(c: Contesto, x: number, y: number, r: number): void {
  const { ctx } = c;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = c.sfondo;
  ctx.fill();
  ctx.strokeStyle = c.colore;
  ctx.stroke();
}

/**
 * Carrello: identico alla cerniera, con due rulli fra la base del triangolo e
 * la tratteggiatura. La direzione consentita è quella parallela al tratteggio.
 */
function carrello(c: Contesto): void {
  const { ctx } = c;
  const r = 3.6;
  ctx.beginPath();
  ctx.moveTo(0, r);
  ctx.lineTo(-10, 14);
  ctx.lineTo(10, 14);
  ctx.closePath();
  ctx.fillStyle = c.sfondo;
  ctx.fill();
  ctx.strokeStyle = c.colore;
  ctx.stroke();
  for (const x of [-5, 5]) cerchietto(c, x, 17.2, 3.2);
  // il piano di scorrimento, poi il terreno: il carrello ci scivola sopra
  ctx.beginPath();
  ctx.moveTo(-16, 20.4);
  ctx.lineTo(16, 20.4);
  ctx.stroke();
  terreno(c, 20.4);
  cerchietto(c, 0, 0, r);
}

function incastro(c: Contesto): void {
  const { ctx } = c;
  // linea piena attraverso il nodo + tratteggio: nessuna rotazione possibile
  ctx.beginPath();
  ctx.moveTo(-16, 0);
  ctx.lineTo(16, 0);
  ctx.stroke();
  terreno(c, 0, 16, 5);
}

/**
 * Doppio pendolo: due bielle PARALLELE. Impediscono la rotazione e la
 * traslazione normale, lasciano libera quella lungo il piano.
 */
function bipendolo(c: Contesto): void {
  const { ctx } = c;
  ctx.beginPath();
  ctx.moveTo(-9, 0); ctx.lineTo(-9, 14);
  ctx.moveTo(9, 0); ctx.lineTo(9, 14);
  ctx.stroke();
  for (const [x, y] of [[-9, 0], [9, 0], [-9, 14], [9, 14]] as const) {
    ctx.beginPath();
    ctx.arc(x, y, 2.6, 0, Math.PI * 2);
    ctx.fillStyle = c.sfondo; ctx.fill();
    ctx.strokeStyle = c.colore; ctx.stroke();
  }
  // barretta che collega il nodo ai due pendoli
  ctx.beginPath();
  ctx.moveTo(-12, 0); ctx.lineTo(12, 0);
  ctx.stroke();
  terreno(c, 14);
}

/** Pattino: blocchetto che scorre su una guida. Stessi gradi del bipendolo. */
function pattino(c: Contesto): void {
  const { ctx } = c;
  ctx.beginPath();
  ctx.rect(-11, 3, 22, 8);
  ctx.fillStyle = c.sfondo; ctx.fill();
  ctx.strokeStyle = c.colore; ctx.stroke();
  // gambo dal nodo al blocchetto
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.lineTo(0, 3);
  ctx.stroke();
  // guida
  ctx.beginPath();
  ctx.moveTo(-17, 13); ctx.lineTo(17, 13);
  ctx.stroke();
  terreno(c, 13, 17);
}

/**
 * Biella (pendolo semplice). L'angolo è la direzione dell'ASSE: la si disegna
 * lungo l'asse locale x, cioè verso destra prima della rotazione.
 */
function biella(c: Contesto): void {
  const { ctx } = c;
  const L = 20;
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.lineTo(L, 0);
  ctx.stroke();
  for (const x of [0, L]) {
    ctx.beginPath();
    ctx.arc(x, 0, 2.8, 0, Math.PI * 2);
    ctx.fillStyle = c.sfondo; ctx.fill();
    ctx.strokeStyle = c.colore; ctx.stroke();
  }
  // ancoraggio: tratteggio perpendicolare all'asse
  ctx.save();
  ctx.translate(L, 0);
  ctx.rotate(Math.PI / 2);
  terreno(c, 0, 10, 4);
  ctx.restore();
}

/** Molla: vincolo elastico. La spirale dice subito che non è rigido. */
function molla(c: Contesto, v: Vincolo): void {
  const { ctx } = c;
  const spire = 5;
  const L = 20;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, 4);
  for (let i = 0; i < spire; i++) {
    const y = 4 + ((i + 0.5) * (L - 6)) / spire;
    ctx.lineTo(i % 2 === 0 ? 6 : -6, y);
  }
  ctx.lineTo(0, L - 2);
  ctx.lineTo(0, L + 1);
  ctx.stroke();
  terreno(c, L + 1, 12, 4);

  // le componenti effettivamente elastiche, in piccolo
  const r = v.rigidezza;
  if (r) {
    const attive = [
      r.kx !== null ? 'x' : null,
      r.ky !== null ? 'y' : null,
      r.krz !== null ? 'θ' : null,
    ].filter(Boolean).join('');
    if (attive) {
      ctx.save();
      ctx.rotate(v.angolo);   // il testo non deve ruotare col simbolo
      ctx.font = '9px ui-monospace, monospace';
      ctx.fillStyle = c.colore;
      ctx.fillText(attive, 9, 16);
      ctx.restore();
    }
  }
}

/** Etichette per la tavolozza dei vincoli. */
export const VINCOLI_DISPONIBILI: {
  tipo: Vincolo['tipo']; nome: string; gradi: number; descrizione: string;
}[] = [
  { tipo: 'cerniera', nome: 'Cerniera a telaio', gradi: 2,
    descrizione: 'Blocca entrambe le traslazioni, lascia libera la rotazione. L\'angolo è ininfluente.' },
  { tipo: 'carrello', nome: 'Carrello', gradi: 1,
    descrizione: 'L\'angolo è l\'inclinazione del PIANO DI SCORRIMENTO: blocca la traslazione normale al piano.' },
  { tipo: 'incastro', nome: 'Incastro', gradi: 3,
    descrizione: 'Blocca tutto: due traslazioni e la rotazione. L\'angolo serve solo al disegno.' },
  { tipo: 'bipendolo', nome: 'Doppio pendolo a telaio', gradi: 2,
    descrizione: 'Blocca la traslazione normale al piano e la rotazione. Identico al pattino nella cinematica.' },
  { tipo: 'pattino', nome: 'Pattino a telaio', gradi: 2,
    descrizione: 'Blocca la traslazione normale alla guida e la rotazione. Identico al doppio pendolo nella cinematica.' },
  { tipo: 'biella', nome: 'Biella', gradi: 1,
    descrizione: 'L\'angolo è la direzione dell\'ASSE: blocca la traslazione lungo di esso.' },
  { tipo: 'molla', nome: 'Molla', gradi: 0,
    descrizione: 'Vincolo elastico: non entra nel conteggio dei gradi di vincolo, ma irrigidisce la struttura.' },
];

/**
 * Il nome che il vincolo porta, secondo l'ambito.
 *
 * Cerniera, doppio pendolo e pattino esistono in due forme che si disegnano
 * quasi nello stesso punto e fanno cose opposte: una lega la struttura a
 * terra, l'altra la divide in due corpi. Chiamarle con lo stesso nome era il
 * motivo per cui la tavolozza sembrava contenere voci duplicate.
 */
export function nomeVincolo(
  tipo: Vincolo['tipo'], ambito: 'esterno' | 'interno',
): string {
  const base = VINCOLI_DISPONIBILI.find((v) => v.tipo === tipo)?.nome ?? tipo;
  if (ambito === 'esterno') return base;
  const senzaTelaio = base.replace(' a telaio', '');
  return `${senzaTelaio} ${tipo === 'cerniera' ? 'interna' : 'interno'}`;
}

// ═══════════════════ SCONNESSIONI INTERNE ═══════════════════

export const SCONNESSIONI_DISPONIBILI: {
  tipo: 'cerniera' | 'bipendolo' | 'pattino'; nome: string;
  trasmette: string; descrizione: string;
}[] = [
  { tipo: 'cerniera', nome: 'Cerniera interna', trasmette: 'N e T, non M',
    descrizione: 'Consente la rotazione relativa fra i due tronchi: in quel punto il momento flettente è esattamente nullo.' },
  { tipo: 'bipendolo', nome: 'Bipendolo interno', trasmette: 'N e M, non T',
    descrizione: 'Consente la traslazione relativa perpendicolare: in quel punto il taglio è nullo.' },
  { tipo: 'pattino', nome: 'Pattino interno', trasmette: 'T e M, non N',
    descrizione: 'Consente lo scorrimento relativo assiale: in quel punto lo sforzo normale è nullo.' },
];

/**
 * Simbolo di una sconnessione interna, disegnato SUL contorno dell'asta.
 *
 * Il cerchietto è VUOTO — riempito del colore di sfondo, non trasparente —
 * perché deve staccarsi visivamente dalla linea dell'asta che ci passa dentro:
 * è la differenza fra «qui la trave è continua» e «qui è interrotta».
 */
export function disegnaSconnessione(
  ctx: CanvasRenderingContext2D, p: Punto,
  tipo: 'cerniera' | 'bipendolo' | 'pattino',
  angoloSchermo: number,
  colore: string, sfondo: string, evidenziato = false, scala = 1,
): void {
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(angoloSchermo);
  ctx.scale(scala, scala);
  ctx.lineWidth = evidenziato ? 2.6 : 2;
  ctx.strokeStyle = colore;
  ctx.fillStyle = sfondo;

  if (tipo === 'cerniera') {
    ctx.beginPath();
    ctx.arc(0, 0, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (tipo === 'bipendolo') {
    // due bielle parallele all'asse: consentono lo scorrimento trasversale
    ctx.beginPath();
    ctx.moveTo(-6, -5); ctx.lineTo(6, -5);
    ctx.moveTo(-6, 5); ctx.lineTo(6, 5);
    ctx.stroke();
    for (const y of [-5, 5]) {
      for (const x of [-6, 6]) {
        ctx.beginPath();
        ctx.arc(x, y, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }
  } else {
    // pattino: la guida è perpendicolare all'asse, lo scorrimento è assiale
    ctx.beginPath();
    ctx.moveTo(-4, -7); ctx.lineTo(-4, 7);
    ctx.moveTo(4, -7); ctx.lineTo(4, 7);
    ctx.stroke();
  }
  ctx.restore();
}


/**
 * Sconnessione interna su un NODO: un solo pallino, pieno, sul nodo.
 *
 * Niente triangolo, niente tratteggio, nessun simbolo di terra — non c'è
 * terra. Deve distinguersi a colpo d'occhio sia dai nodi rigidi (puntini
 * piccoli e neutri) sia dai vincoli esterni (cerchietto VUOTO più terreno):
 * qui il pieno significa «questo punto non è vincolato a nulla, è solo
 * sconnesso».
 */
export function disegnaSconnessioneNodale(
  ctx: CanvasRenderingContext2D, p: Punto,
  tipo: 'cerniera' | 'bipendolo' | 'pattino',
  colore: string, sfondo: string, evidenziato = false, scala = 1,
): void {
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.scale(scala, scala);
  ctx.lineWidth = evidenziato ? 2.6 : 2;
  ctx.strokeStyle = colore;

  if (tipo === 'cerniera') {
    ctx.beginPath();
    ctx.arc(0, 0, 5.5, 0, Math.PI * 2);
    ctx.fillStyle = colore;
    ctx.fill();
    // alone di sfondo: stacca il pallino dalla linea dell'asta che ci passa
    ctx.strokeStyle = sfondo;
    ctx.lineWidth = 1.4;
    ctx.stroke();
  } else if (tipo === 'bipendolo') {
    ctx.fillStyle = colore;
    for (const y of [-4.5, 4.5]) {
      ctx.beginPath();
      ctx.moveTo(-7, y); ctx.lineTo(7, y);
      ctx.stroke();
      for (const x of [-7, 7]) {
        ctx.beginPath();
        ctx.arc(x, y, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else {
    ctx.beginPath();
    ctx.moveTo(-4.5, -8); ctx.lineTo(-4.5, 8);
    ctx.moveTo(4.5, -8); ctx.lineTo(4.5, 8);
    ctx.stroke();
  }
  ctx.restore();
}

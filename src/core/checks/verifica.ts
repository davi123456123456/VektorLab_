/**
 * Verifica di resistenza per asta.
 *
 * SEZIONE DI VERIFICA — su richiesta si verifica la sezione con il MASSIMO
 * VALORE ASSOLUTO DEL MOMENTO, che è la scelta usuale e quasi sempre corretta.
 * Quasi: se il taglio è elevato dove il momento non lo è (mensola tozza,
 * appoggio di una trave continua) la tensione ideale può essere maggiore
 * altrove. Per questo si scorre anche l'INTERA asta e, se il punto peggiore
 * non coincide, lo si segnala invece di lasciarlo scoprire per caso.
 *
 * CRITERIO — von Mises è il criterio giusto per i materiali duttili isotropi,
 * ed è quello richiesto. Per i materiali fragili con resistenze asimmetriche
 * (ghisa, calcestruzzo, vetro) von Mises NON è appropriato, perché ignora la
 * differenza fra trazione e compressione: viene calcolato ugualmente per
 * riferimento, ma la verifica dichiarata usa la massima tensione normale
 * confrontata con f_t e f_c separatamente.
 */

import type { Materiale } from '../model/types.js';
import type { RisultatoAsta } from '../model/results.js';
import type { ParametriSezione } from '../materials/sezioniParametriche.js';
import {
  distribuzioneTensioni, type DistribuzioneTensioni, type PuntoTensione,
} from './tensioni.js';

export type Criterio =
  | 'vonMises'
  | 'tresca'
  | 'massimaTensioneNormale';

export interface SollecitazioneInSezione {
  /** ascissa lungo l'asta [m] */
  x: number;
  /** ascissa relativa in [0,1] */
  s: number;
  N: number;
  T: number;
  M: number;
}

export interface EsitoVerifica {
  astaId: string;
  /** sezione verificata: quella con |M| massimo */
  sezione: SollecitazioneInSezione;
  distribuzione: DistribuzioneTensioni;
  /** punto della sezione con la massima tensione ideale */
  critico: PuntoTensione;

  criterio: Criterio;
  /** tensione ideale usata per la verifica [Pa] */
  sigmaIdeale: number;
  /** resistenza caratteristica di riferimento [Pa] */
  resistenza: number;
  /** resistenza di progetto = resistenza / γ_M [Pa] */
  resistenzaProgetto: number;
  gammaM: number;

  /** coefficiente di sicurezza: resistenza caratteristica / tensione ideale */
  coefficienteSicurezza: number;
  /** sfruttamento: tensione ideale / resistenza di progetto; ≤ 1 verifica ok */
  sfruttamento: number;
  verificato: boolean;
  /**
   * false quando il materiale non dichiara alcuna resistenza: il coefficiente
   * di sicurezza è NaN e va mostrato come DATO MANCANTE, non come numero.
   */
  resistenzaDichiarata: boolean;

  /** von Mises e Tresca, sempre calcolati per confronto */
  vonMisesMax: number;
  trescaMax: number;

  /**
   * Sezione in cui la tensione ideale è davvero massima lungo l'asta.
   * Se diversa da quella verificata, `avvisoSezione` lo dice.
   */
  peggiore: { sezione: SollecitazioneInSezione; sigmaIdeale: number };
  avvisoSezione: string | null;
  note: string[];
}

/**
 * Sezioni candidate alla verifica: il campionamento regolare PIÙ i punti
 * notevoli.
 *
 * I punti notevoli sono indispensabili. Il massimo del momento cade dove il
 * taglio si annulla, e quel punto è stato individuato per bisezione: quasi mai
 * coincide con un campione della griglia regolare. Cercare il massimo solo fra
 * i campioni verificherebbe una sezione vicina a quella giusta ma non quella
 * giusta — su una trave appoggiata di 6 m con 41 campioni si sbaglierebbe di
 * 7 cm, e il momento risulterebbe leggermente sottostimato.
 */
function sezioniCandidate(a: RisultatoAsta): SollecitazioneInSezione[] {
  const out: SollecitazioneInSezione[] = [];
  for (let i = 0; i < a.ascisse.length; i++) {
    out.push({
      x: a.ascisse[i],
      s: a.lunghezza > 0 ? a.ascisse[i] / a.lunghezza : 0,
      N: a.N[i], T: a.T[i], M: a.M[i],
    });
  }
  for (const p of a.puntiNotevoli) {
    out.push({ x: p.x, s: p.s, N: p.N, T: p.T, M: p.M });
  }
  return out;
}

/** Indice, fra le sezioni candidate, di quella con il massimo |M|. */
export function indiceMomentoMassimo(a: RisultatoAsta): number {
  const c = sezioniCandidate(a);
  let migliore = 0;
  for (let i = 1; i < c.length; i++) {
    if (Math.abs(c[i].M) > Math.abs(c[migliore].M)) migliore = i;
  }
  return migliore;
}

export interface OpzioniVerifica {
  /** numero di punti sull'altezza della sezione */
  campioniSezione?: number;
  /** criterio richiesto; per i fragili viene comunque sostituito */
  criterioPreferito?: 'vonMises' | 'tresca';
}

export function verificaAsta(
  astaId: string,
  risultato: RisultatoAsta,
  parametri: ParametriSezione,
  prop: { A: number; I: number },
  materiale: Materiale,
  opzioni: OpzioniVerifica = {},
): EsitoVerifica {
  const campioni = opzioni.campioniSezione ?? 81;
  const preferito = opzioni.criterioPreferito ?? 'vonMises';
  const note: string[] = [];

  // ── sezione con |M| massimo: quella richiesta ──
  const candidate = sezioniCandidate(risultato);
  const iM = indiceMomentoMassimo(risultato);
  const sezione = candidate[iM];
  const distribuzione = distribuzioneTensioni(sezione, parametri, prop, campioni);

  // ── scansione dell'intera asta, per non fidarsi ciecamente di |M| max ──
  let iPeggiore = iM;
  let sigmaPeggiore = -Infinity;
  for (let i = 0; i < candidate.length; i++) {
    // basta una scansione grossolana della sezione: serve solo a confrontare
    const d = distribuzioneTensioni(candidate[i], parametri, prop, 21);
    const v = preferito === 'tresca' ? d.trescaMax : d.vonMisesMax;
    if (v > sigmaPeggiore) { sigmaPeggiore = v; iPeggiore = i; }
  }
  const sezionePeggiore = candidate[iPeggiore];

  // ── criterio dipendente dal materiale ──
  const { criterio, sigmaIdeale, resistenza, note: noteCriterio } =
    applicaCriterio(materiale, distribuzione, preferito);
  note.push(...noteCriterio);

  const gammaM = materiale.gammaM;
  const resistenzaProgetto = resistenza / gammaM;
  const coefficienteSicurezza = sigmaIdeale > 0 ? resistenza / sigmaIdeale : Infinity;
  const resistenzaDichiarata = Number.isFinite(resistenza);
  const sfruttamento = resistenzaProgetto > 0 ? sigmaIdeale / resistenzaProgetto : Infinity;

  // scarto significativo fra la sezione richiesta e quella davvero peggiore
  const rapporto = distribuzione.vonMisesMax > 0
    ? sigmaPeggiore / distribuzione.vonMisesMax : 1;
  const avvisoSezione = iPeggiore !== iM && rapporto > 1.02
    ? `La sezione con |M| massimo (x = ${sezione.x.toFixed(3)} m) non è la più ` +
      `sollecitata: a x = ${sezionePeggiore.x.toFixed(3)} m la tensione ideale ` +
      `è maggiore del ${((rapporto - 1) * 100).toFixed(1)} % perché lì il taglio ` +
      `è più elevato.`
    : null;

  return {
    astaId, sezione, distribuzione, critico: distribuzione.critico,
    criterio, sigmaIdeale, resistenza, resistenzaProgetto, gammaM,
    coefficienteSicurezza, sfruttamento,
    verificato: resistenzaDichiarata && sfruttamento <= 1,
    resistenzaDichiarata,
    vonMisesMax: distribuzione.vonMisesMax,
    trescaMax: distribuzione.trescaMax,
    peggiore: { sezione: sezionePeggiore, sigmaIdeale: sigmaPeggiore },
    avvisoSezione, note,
  };
}

/**
 * Sceglie criterio e resistenza in base al COMPORTAMENTO del materiale.
 * Applicare von Mises alla ghisa o al calcestruzzo darebbe un risultato
 * numericamente pulito e fisicamente sbagliato: quei materiali si rompono a
 * trazione molto prima che a compressione, e un criterio simmetrico non può
 * accorgersene.
 */
function applicaCriterio(
  m: Materiale, d: DistribuzioneTensioni, preferito: 'vonMises' | 'tresca',
): { criterio: Criterio; sigmaIdeale: number; resistenza: number; note: string[] } {
  const note: string[] = [];
  const r = m.resistenze;

  if (m.comportamento === 'duttile') {
    // NaN, non zero: «resistenza non dichiarata» non è «resistenza nulla».
    // Uno zero si propaga come un numero e produce un coefficiente di
    // sicurezza pari a zero, che si legge come «struttura infinitamente
    // insicura» invece che come «manca un dato». NaN si vede.
    const resistenza = r.fy ?? r.fu ?? NaN;
    if (Number.isNaN(resistenza)) {
      note.push(
        'Il materiale non dichiara una tensione di snervamento: la verifica di ' +
        'resistenza non è possibile finché non viene inserita. Tutto il resto ' +
        'del calcolo — reazioni, N, T, M, deformata — non ne dipende.',
      );
    }
    const sigmaIdeale = preferito === 'tresca' ? d.trescaMax : d.vonMisesMax;
    if (preferito === 'vonMises') {
      note.push(
        'Materiale duttile isotropo: von Mises è il criterio appropriato. ' +
        'Tresca darebbe un valore fino al 15 % più alto (2/√3 nel taglio puro).',
      );
    }
    return {
      criterio: preferito === 'tresca' ? 'tresca' : 'vonMises',
      sigmaIdeale, resistenza, note,
    };
  }

  if (m.comportamento === 'fragile') {
    // massima tensione normale, con resistenze diverse a trazione e compressione
    const ft = r.ft ?? r.fu ?? 0;
    const fc = r.fc ?? ft;
    const s1 = Math.max(...d.punti.map((p) => p.sigma1));
    const s2 = Math.min(...d.punti.map((p) => p.sigma2));
    // si confronta ciascuna con la propria resistenza e si tiene il caso peggiore
    const sfruttamentoTrazione = ft > 0 ? s1 / ft : (s1 > 0 ? Infinity : 0);
    const sfruttamentoCompressione = fc > 0 ? -s2 / fc : 0;
    const trazioneGoverna = sfruttamentoTrazione >= sfruttamentoCompressione;

    note.push(
      'Materiale FRAGILE con resistenze asimmetriche: la verifica usa la ' +
      'massima tensione normale principale, confrontata separatamente con f_t ' +
      'e f_c. Von Mises è riportato solo per confronto e NON è applicabile qui, ' +
      'perché tratta trazione e compressione allo stesso modo.',
    );
    if (s1 > 0 && ft === 0) {
      note.push('Il materiale non resiste a trazione: qualunque zona tesa è inammissibile.');
    }
    return {
      criterio: 'massimaTensioneNormale',
      sigmaIdeale: trazioneGoverna ? Math.max(s1, 0) : Math.max(-s2, 0),
      resistenza: trazioneGoverna ? ft : fc,
      note,
    };
  }

  // ortotropo: la verifica corretta dipende dall'angolo di fibratura
  const fm = r.fm ?? r.ft ?? 0;
  note.push(
    'Materiale ORTOTROPO: la resistenza dipende dall\'angolo fra fibratura e ' +
    'asse dell\'asta. Qui si confronta la tensione normale massima con la ' +
    'resistenza a flessione; una verifica completa richiede la combinazione ' +
    'flessione + sforzo normale secondo l\'Eurocodice 5.',
  );
  return {
    criterio: 'massimaTensioneNormale',
    sigmaIdeale: Math.abs(d.fibraEstrema.sigma),
    resistenza: fm,
    note,
  };
}

export const NOME_CRITERIO: Record<Criterio, string> = {
  vonMises: 'von Mises',
  tresca: 'Tresca',
  massimaTensioneNormale: 'massima tensione normale',
};

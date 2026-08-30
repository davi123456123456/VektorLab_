/**
 * COEFFICIENTE DI SICUREZZA NEL PUNTO PIÙ SOLLECITATO.
 *
 * Rifà a mano il procedimento che si svolge sul foglio — sezione critica,
 * geometria, σ, τ, von Mises, C.S. — mostrando ogni passaggio con i numeri
 * sostituiti. Non è una ripetizione della verifica completa: è la stessa
 * verifica scritta in modo da poterla ricontrollare a mente.
 *
 * DUE SEZIONI, NON UNA. Il massimo momento e la massima tensione ideale non
 * coincidono necessariamente, perché aste diverse possono avere sezioni e
 * materiali diversi: un momento più piccolo su un profilo più esile produce
 * una tensione più alta. Si riportano entrambe, e si dice se coincidono —
 * quando non coincidono, è quella a tensione massima che governa.
 *
 * IL MOMENTO SALTA. Sotto un momento concentrato o su un appoggio M è
 * discontinuo: dire «il massimo è in B» non basta, perché a sinistra e a
 * destra di B i valori sono due. Si distingue B⁻ da B⁺ e si riportano
 * entrambi.
 *
 * DATI MANCANTI. Senza tensione di snervamento il coefficiente non si
 * calcola, e non si inventa: si dichiara che manca. Il resto dell'analisi —
 * reazioni, N/T/M, deformata — dipende da E, A e I e resta valido.
 */

import type { Materiale, Progetto, Sezione } from '../model/types.js';
import type { RisultatoAnalisi, RisultatoAsta } from '../model/results.js';
import { costruisciIndice, materialeDi, sezioneDi } from '../model/queries.js';
import { MATERIALI } from '../materials/materials.js';
import { SEZIONI } from '../materials/sections.js';
import {
  estremiY, larghezzaA, momentoStaticoA, proprietaDa, type ParametriSezione,
} from '../materials/sezioniParametriche.js';

export type ModoTaglio = 'media' | 'massima';

export interface SezioneCritica {
  astaId: string;
  /** ascissa metrica lungo l'asta [m] */
  x: number;
  s: number;
  /** '−' se il valore è quello appena PRIMA della discontinuità, '+' dopo */
  lato: '' | '−' | '+';
  N: number;
  T: number;
  M: number;
  /** valori ai due lati, quando la sezione cade su un salto */
  salto?: { sinistra: number; destra: number };
}

export interface PassoCalcolo {
  numero: number;
  titolo: string;
  righe: { formula: string; valore: string }[];
}

export type CodiceErrore = 'SY_MANCANTE' | 'SEZIONE_MANCANTE';

export interface EsitoCoefficiente {
  /** true se il numero si può mostrare */
  disponibile: boolean;
  errori: { codice: CodiceErrore; messaggio: string; aste: string[] }[];

  massimoMomento: SezioneCritica | null;
  massimaTensione: SezioneCritica | null;
  /** le due sezioni sono la stessa? */
  coincidono: boolean;

  passi: PassoCalcolo[];
  sigma: number;
  tau: number;
  sigmaIdeale: number;
  resistenza: number;
  coefficiente: number;
  verificato: boolean;
  modoTaglio: ModoTaglio;
  /** fibra che governa: quella tesa o quella compressa */
  fibraGovernante: 'tesa' | 'compressa' | '';
  /** l'asta critica è compressa: la resistenza non basta, serve la stabilità */
  compressa: boolean;

  /** che cosa servirebbe perché C.S. = 1 */
  suggerimenti: {
    syMinimo: number;
    /** fattore di scala da applicare alle dimensioni della sezione */
    fattoreScala: number;
    /** dimensione caratteristica attuale e minima [m] */
    dimensione: { nome: string; attuale: number; minima: number } | null;
  } | null;
}

const MPa = (v: number) => `${(v / 1e6).toFixed(1)} MPa`;
const mm = (v: number) => `${(v * 1e3).toFixed(1)} mm`;
const mm2 = (v: number) => `${(v * 1e6).toFixed(0)} mm²`;
const mm4 = (v: number) => `${(v * 1e12).toExponential(3)} mm⁴`;
const kN = (v: number) => `${(v / 1e3).toFixed(2)} kN`;
const kNm = (v: number) => `${(v / 1e3).toFixed(2)} kNm`;

/**
 * Sezione con il massimo |M| su un'asta, distinguendo i due lati di un salto.
 *
 * Le ascisse campionate contengono i punti di discontinuità due volte, a
 * distanza infinitesima: è così che il diagramma mostra il gradino invece di
 * una rampa, ed è così che qui si riconosce da che parte cade il massimo.
 */
function massimoMomentoAsta(r: RisultatoAsta): SezioneCritica {
  let k = 0;
  for (let i = 1; i < r.M.length; i++) {
    if (Math.abs(r.M[i]) > Math.abs(r.M[k])) k = i;
  }
  return {
    astaId: r.astaId as unknown as string,
    x: r.ascisse[k],
    s: r.lunghezza > 0 ? r.ascisse[k] / r.lunghezza : 0,
    N: r.N[k], T: r.T[k], M: r.M[k],
    ...lateralita(r, k),
  };
}

/** σ e τ con il procedimento didattico, sulla fibra estrema. */
function tensioni(
  sez: SezioneCritica,
  parametri: ParametriSezione,
  modo: ModoTaglio,
): { sigma: number; tau: number; fibra: 'tesa' | 'compressa'; yMax: number;
     A: number; I: number } {
  const p = proprietaDa(parametri);
  const { ySup, yInf } = estremiY(parametri);
  const yMax = Math.max(ySup, yInf);

  // entrambe le fibre estreme, perché con lo sforzo normale la peggiore non è
  // detto che sia quella dalla parte del momento
  const sigmaSup = sez.N / p.A + (sez.M / p.I) * ySup;
  const sigmaInf = sez.N / p.A - (sez.M / p.I) * yInf;
  const sigma = Math.abs(sigmaSup) >= Math.abs(sigmaInf) ? sigmaSup : sigmaInf;

  const tau = modo === 'media'
    ? sez.T / p.A
    : (sez.T * momentoStaticoA(parametri, 0)) / (p.I * larghezzaA(parametri, 0));

  return {
    sigma, tau,
    fibra: sigma >= 0 ? 'tesa' : 'compressa',
    yMax, A: p.A, I: p.I,
  };
}

/**
 * Fattore di scala delle dimensioni della sezione che porta C.S. a 1.
 *
 * Scalando tutte le lunghezze di k: A ∝ k², I ∝ k⁴, W ∝ k³. La tensione
 * ideale non è quindi una potenza sola di k, e la si risolve per bisezione —
 * vale per qualunque forma di sezione, non solo per il tondo.
 */
function scalaPerVerificare(
  sigmaN: number, sigmaM: number, tau: number, resistenza: number,
): number {
  const vm = (k: number) => {
    const s = sigmaN / (k * k) + sigmaM / (k * k * k);
    const t = tau / (k * k);
    return Math.sqrt(s * s + 3 * t * t);
  };
  if (!Number.isFinite(resistenza) || resistenza <= 0) return NaN;
  if (vm(1) <= resistenza) return 1;
  let lo = 1, hi = 2;
  for (let i = 0; i < 60 && vm(hi) > resistenza; i++) { lo = hi; hi *= 2; }
  for (let i = 0; i < 200; i++) {
    const m = (lo + hi) / 2;
    if (vm(m) > resistenza) lo = m; else hi = m;
  }
  return hi;
}

/** Dimensione caratteristica su cui riportare il suggerimento di progetto. */
function dimensioneCaratteristica(
  p: ParametriSezione,
): { nome: string; valore: number } | null {
  switch (p.famiglia) {
    case 'circolarePiena':
    case 'circolareCava': return { nome: 'diametro d', valore: p.D };
    case 'rettangolarePiena':
    case 'rettangolareCava': return { nome: 'altezza H', valore: p.H };
    case 'doppioT':
    case 'aT':
    case 'aC':
    case 'aL': return { nome: 'altezza H', valore: p.H };
  }
}

export interface OpzioniCoefficiente {
  modoTaglio?: ModoTaglio;
  materialiExtra?: Materiale[];
  sezioniExtra?: Sezione[];
}

export function coefficienteCritico(
  progetto: Progetto,
  risultato: RisultatoAnalisi,
  opzioni: OpzioniCoefficiente = {},
): EsitoCoefficiente {
  const modoTaglio = opzioni.modoTaglio ?? 'media';
  const idx = costruisciIndice(
    progetto,
    [...MATERIALI, ...(opzioni.materialiExtra ?? [])],
    [...SEZIONI, ...(opzioni.sezioniExtra ?? [])],
  );

  const vuoto: EsitoCoefficiente = {
    disponibile: false, errori: [],
    massimoMomento: null, massimaTensione: null, coincidono: false,
    passi: [], sigma: 0, tau: 0, sigmaIdeale: 0, resistenza: NaN,
    coefficiente: NaN, verificato: false, modoTaglio,
    fibraGovernante: '', compressa: false, suggerimenti: null,
  };
  if (risultato.aste.length === 0) return vuoto;

  // ── passo 1a: la sezione di massimo momento, su tutte le aste ──
  let massimoMomento: SezioneCritica | null = null;
  for (const r of risultato.aste) {
    const c = massimoMomentoAsta(r);
    if (!massimoMomento || Math.abs(c.M) > Math.abs(massimoMomento.M)) massimoMomento = c;
  }

  // ── passo 1b: la sezione di massima tensione ideale, su tutte le aste ──
  const senzaSezione: string[] = [];
  let massimaTensione: SezioneCritica | null = null;
  let sigmaMax = -Infinity;
  let datiCritici: {
    parametri: ParametriSezione; materiale: Materiale; sigma: number; tau: number;
    fibra: 'tesa' | 'compressa'; yMax: number; A: number; I: number;
  } | null = null;

  for (const r of risultato.aste) {
    const asta = idx.aste.get(r.astaId);
    if (!asta) continue;
    let sezione: Sezione;
    let materiale: Materiale;
    try {
      sezione = sezioneDi(asta, idx);
      materiale = materialeDi(asta, idx);
    } catch {
      senzaSezione.push(r.astaId as unknown as string);
      continue;
    }
    const parametri = sezione.parametri;
    if (!parametri) { senzaSezione.push(r.astaId as unknown as string); continue; }

    // ogni punto di campionamento, non solo quello di momento massimo
    for (let k = 0; k < r.M.length; k++) {
      const sez: SezioneCritica = {
        astaId: r.astaId as unknown as string,
        x: r.ascisse[k], s: r.lunghezza > 0 ? r.ascisse[k] / r.lunghezza : 0,
        lato: '', N: r.N[k], T: r.T[k], M: r.M[k],
      };
      const t = tensioni(sez, parametri, modoTaglio);
      const vm = Math.sqrt(t.sigma * t.sigma + 3 * t.tau * t.tau);
      if (vm > sigmaMax) {
        sigmaMax = vm;
        massimaTensione = { ...sez, ...lateralita(r, k) };
        datiCritici = { parametri, materiale, ...t };
      }
    }
  }

  const errori: EsitoCoefficiente['errori'] = [];
  if (senzaSezione.length > 0) {
    errori.push({
      codice: 'SEZIONE_MANCANTE',
      messaggio: 'Errore: sezione non assegnata',
      aste: [...new Set(senzaSezione)],
    });
  }
  if (!datiCritici || !massimaTensione) {
    return { ...vuoto, errori, massimoMomento };
  }

  const resistenza = datiCritici.materiale.resistenze.fy
    ?? datiCritici.materiale.resistenze.fu
    ?? NaN;
  if (!Number.isFinite(resistenza)) {
    errori.push({
      codice: 'SY_MANCANTE',
      messaggio: 'Errore: S_y mancante in Materiali',
      aste: [massimaTensione.astaId],
    });
  }

  const { sigma, tau, fibra, yMax, A, I } = datiCritici;
  const sigmaIdeale = Math.sqrt(sigma * sigma + 3 * tau * tau);
  const coefficiente = sigmaIdeale > 0 ? resistenza / sigmaIdeale : Infinity;

  const coincidono = massimoMomento !== null
    && massimoMomento.astaId === massimaTensione.astaId
    && Math.abs(massimoMomento.x - massimaTensione.x) < 1e-9;

  // ── suggerimenti di progetto ──
  const sigmaN = massimaTensione.N / A;
  const sigmaM = sigma - sigmaN;
  const scala = scalaPerVerificare(sigmaN, sigmaM, tau, resistenza);
  const dim = dimensioneCaratteristica(datiCritici.parametri);

  return {
    disponibile: errori.length === 0,
    errori,
    massimoMomento,
    massimaTensione,
    coincidono,
    passi: componiPassi(
      massimaTensione, datiCritici.parametri, { A, I, yMax },
      { sigma, tau, sigmaIdeale, resistenza, coefficiente }, modoTaglio,
    ),
    sigma, tau, sigmaIdeale, resistenza, coefficiente,
    verificato: Number.isFinite(coefficiente) && coefficiente > 1,
    modoTaglio,
    fibraGovernante: fibra,
    compressa: massimaTensione.N < 0,
    suggerimenti: Number.isFinite(resistenza)
      ? {
          syMinimo: sigmaIdeale,
          fattoreScala: scala,
          dimensione: dim
            ? { nome: dim.nome, attuale: dim.valore, minima: dim.valore * scala }
            : null,
        }
      : { syMinimo: sigmaIdeale, fattoreScala: NaN, dimensione: null },
  };
}

/**
 * Se l'ascissa `k` cade su una discontinuità, da che parte sta.
 *
 * Il campionatore emette il punto di salto TRE volte — x−ε, x, x+ε — perché
 * il diagramma disegni il gradino verticale. Non basta quindi guardare il
 * vicino immediato: bisogna prendere tutto il grappolo di ascisse coincidenti
 * e confrontarne il primo con l'ultimo.
 */
function lateralita(
  r: RisultatoAsta, k: number,
): { lato: '' | '−' | '+'; salto?: { sinistra: number; destra: number } } {
  const eps = Math.max(r.lunghezza * 1e-6, 1e-12);
  let lo = k, hi = k;
  while (lo > 0 && Math.abs(r.ascisse[lo - 1] - r.ascisse[k]) <= eps) lo--;
  while (hi < r.M.length - 1 && Math.abs(r.ascisse[hi + 1] - r.ascisse[k]) <= eps) hi++;

  const sinistra = r.M[lo];
  const destra = r.M[hi];
  const scala = Math.max(1, Math.abs(sinistra), Math.abs(destra));
  if (Math.abs(sinistra - destra) <= 1e-6 * scala) return { lato: '' };

  // il valore scelto è più vicino a quello di sinistra o a quello di destra?
  const lato = Math.abs(r.M[k] - sinistra) <= Math.abs(r.M[k] - destra) ? '−' : '+';
  return { lato, salto: { sinistra, destra } };
}

/** I cinque passaggi, con i numeri già sostituiti. */
function componiPassi(
  sez: SezioneCritica,
  parametri: ParametriSezione,
  g: { A: number; I: number; yMax: number },
  t: { sigma: number; tau: number; sigmaIdeale: number; resistenza: number;
       coefficiente: number },
  modo: ModoTaglio,
): PassoCalcolo[] {
  const nome = descriviSezione(parametri);
  const passi: PassoCalcolo[] = [
    {
      numero: 1, titolo: 'Sezione critica',
      righe: [
        { formula: 'asta', valore: `${sez.astaId}${sez.lato} · s = ${sez.x.toFixed(3)} m` },
        { formula: 'M', valore: kNm(sez.M) },
        { formula: 'T', valore: kN(sez.T) },
        { formula: 'N', valore: kN(sez.N) },
      ],
    },
    {
      numero: 2, titolo: `Geometria (${nome.tipo})`,
      righe: [
        ...nome.misure,
        { formula: 'A', valore: mm2(g.A) },
        { formula: 'I', valore: mm4(g.I) },
        { formula: 'y_max', valore: mm(g.yMax) },
      ],
    },
    {
      numero: 3, titolo: 'Tensioni',
      righe: [
        {
          formula: sez.N !== 0 ? 'σ = N/A ± M/I · y_max' : 'σ = M/I · y_max',
          valore: MPa(t.sigma),
        },
        {
          formula: modo === 'media' ? 'τ = T/A (valore medio)' : 'τ = T·S/(I·b) (massimo)',
          valore: MPa(t.tau),
        },
      ],
    },
    {
      numero: 4, titolo: 'Von Mises',
      righe: [{ formula: 'σ_VM = √(σ² + 3τ²)', valore: MPa(t.sigmaIdeale) }],
    },
    {
      numero: 5, titolo: 'Coefficiente',
      righe: [{
        formula: 'C.S. = S_y / σ_VM',
        valore: Number.isFinite(t.resistenza)
          ? `${(t.resistenza / 1e6).toFixed(0)} / ${(t.sigmaIdeale / 1e6).toFixed(1)} = `
            + `${t.coefficiente.toFixed(2)}`
          : 'S_y non dichiarato',
      }],
    },
  ];
  return passi;
}

function descriviSezione(
  p: ParametriSezione,
): { tipo: string; misure: { formula: string; valore: string }[] } {
  switch (p.famiglia) {
    case 'circolarePiena':
      return { tipo: 'circolare', misure: [{ formula: 'd', valore: mm(p.D) }] };
    case 'circolareCava':
      return {
        tipo: 'tubo circolare',
        misure: [{ formula: 'd', valore: mm(p.D) }, { formula: 's', valore: mm(p.s) }],
      };
    case 'rettangolarePiena':
      return {
        tipo: 'rettangolare',
        misure: [{ formula: 'B', valore: mm(p.B) }, { formula: 'H', valore: mm(p.H) }],
      };
    case 'rettangolareCava':
      return {
        tipo: 'tubo rettangolare',
        misure: [
          { formula: 'B', valore: mm(p.B) }, { formula: 'H', valore: mm(p.H) },
          { formula: 's', valore: mm(p.s) },
        ],
      };
    default:
      return {
        tipo: p.famiglia,
        misure: [{ formula: 'H', valore: mm((p as { H: number }).H) }],
      };
  }
}

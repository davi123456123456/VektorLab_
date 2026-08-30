/**
 * Analisi cinematica: classificazione della struttura e diagnosi dei vincoli.
 *
 * IL PUNTO CENTRALE — il conteggio  l = 3n − Σv  non basta. Tre carrelli
 * paralleli, tre cerniere allineate, tre rette di reazione concorrenti danno
 * tutti Σv = 3 su un corpo (l = 0, "isostatica" secondo il conteggio) mentre la
 * struttura è labile E iperstatica. La differenza sta nel RANGO della matrice
 * cinematica:
 *
 *     gradi di labilità     = 3n − rango(A)
 *     gradi di iperstaticità = v  − rango(A)
 *
 * Il rango va calcolato numericamente (SVD, tolleranza relativa): una
 * eliminazione di Gauss con confronto a zero darebbe risposte diverse a
 * seconda delle unità di misura.
 */

import { nucleo, rangoNumerico, svd } from '../linalg/svd.js';
import type { IndiceModello } from '../model/queries.js';
import type {
  CIR, Classificazione, Diagnosi, ModoLabile, RisultatoCinematico,
} from '../model/results.js';
import type { Progetto } from '../model/types.js';
import { decomponi } from './bodies.js';
import { costruisciMatriceCinematica, type MatriceCinematica } from './matrix.js';

export function analisiCinematica(
  progetto: Progetto,
  idx: IndiceModello,
  tolleranzaRango = 1e-9,
): RisultatoCinematico {
  const dec = decomponi(progetto, idx);
  const mc = costruisciMatriceCinematica(progetto, idx, dec);

  const nCorpi = dec.corpi.length;
  const gradiLiberta = 3 * nCorpi;
  const gradiVincolo = mc.A.length;

  if (nCorpi === 0) {
    return vuoto(gradiVincolo);
  }

  // se non ci sono vincoli, A è vuota: rango 0, tutti i moti sono possibili
  const ris = gradiVincolo > 0
    ? svd(mc.A)
    : { sigma: [] as number[], V: [], U: [], m: 0, n: gradiLiberta };
  const rango = gradiVincolo > 0 ? rangoNumerico(ris, tolleranzaRango) : 0;

  const labilita = gradiLiberta - rango;
  const iperstaticita = gradiVincolo - rango;

  const meccanismi = gradiVincolo > 0
    ? nucleo(ris, tolleranzaRango).map((v) => modoDaVettore(v, dec, mc))
    : baseLiberaCompleta(dec, mc);

  const classificazione = classifica(labilita, iperstaticita);
  const diagnosi = diagnostica(
    progetto, mc, dec, { labilita, iperstaticita, rango, gradiLiberta, gradiVincolo },
    meccanismi,
  );

  return {
    corpi: dec.corpi,
    numeroCorpi: nCorpi,
    gradiLiberta,
    gradiVincolo,
    rango,
    labilita,
    iperstaticita,
    classificazione,
    meccanismi,
    valoriSingolari: ris.sigma,
    anelliChiusi: dec.topologia.anelliTotali,
    iperstaticitaInterna: dec.topologia.iperstaticitaInterna,
    gradiVincoloInterni: dec.topologia.gradiVincoloInterni,
    gradiVincoloEsterni: gradiVincolo - dec.topologia.gradiVincoloInterni,
    diagnosi,
  };
}

function vuoto(gradiVincolo: number): RisultatoCinematico {
  return {
    corpi: [], numeroCorpi: 0, gradiLiberta: 0, gradiVincolo, rango: 0,
    labilita: 0, iperstaticita: 0, classificazione: 'isostatica',
    meccanismi: [], valoriSingolari: [],
    anelliChiusi: 0, iperstaticitaInterna: 0,
    gradiVincoloInterni: 0, gradiVincoloEsterni: gradiVincolo,
    diagnosi: [{
      gravita: 'avviso', codice: 'MODELLO_VUOTO',
      messaggio: 'Il modello non contiene aste: non c\'è nulla da analizzare.',
    }],
  };
}

/** "1 volta", "2 volte": l'italiano tecnico non ammette "1 volte". */
const volte = (n: number): string => (n === 1 ? '1 volta' : `${n} volte`);

function classifica(labilita: number, iperstaticita: number): Classificazione {
  if (labilita > 0 && iperstaticita > 0) return 'labile e iperstatica';
  if (labilita > 0) return 'labile';
  if (iperstaticita > 0) return 'iperstatica';
  return 'isostatica';
}

/** Converte un vettore del nucleo nel moto rigido dei corpi, con i CIR. */
function modoDaVettore(
  v: Float64Array, dec: ReturnType<typeof decomponi>, mc: MatriceCinematica,
): ModoLabile {
  const motoPerCorpo: ModoLabile['motoPerCorpo'] = [];
  const cir: CIR[] = [];
  const tol = 1e-10;

  for (let b = 0; b < dec.corpi.length; b++) {
    const ux = v[3 * b];
    const uy = v[3 * b + 1];
    // la colonna di rotazione era scalata: φ = φ'/Lc
    const phi = v[3 * b + 2] / mc.Lc;
    motoPerCorpo.push({ corpoIndice: b, ux, uy, phi });

    const corpo = dec.corpi[b];
    if (Math.abs(phi) * mc.Lc > tol) {
      // centro di istantanea rotazione: punto a spostamento nullo
      cir.push({ tipo: 'proprio', x: corpo.xG - uy / phi, y: corpo.yG + ux / phi });
    } else if (Math.hypot(ux, uy) > tol) {
      // traslazione pura: il centro è improprio, sulla retta ⊥ al moto
      cir.push({ tipo: 'improprio', direzione: Math.atan2(uy, ux) + Math.PI / 2 });
    } else {
      cir.push({ tipo: 'fermo' });
    }
  }
  return { motoPerCorpo, cir };
}

/** Struttura completamente libera: base dei moti rigidi di ciascun corpo. */
function baseLiberaCompleta(
  dec: ReturnType<typeof decomponi>, mc: MatriceCinematica,
): ModoLabile[] {
  const out: ModoLabile[] = [];
  for (let b = 0; b < dec.corpi.length; b++) {
    for (let k = 0; k < 3; k++) {
      const v = new Float64Array(3 * dec.corpi.length);
      v[3 * b + k] = 1;
      out.push(modoDaVettore(v, dec, mc));
    }
  }
  return out;
}

// ══════════════════════════════ DIAGNOSI ══════════════════════════════

interface Conteggi {
  labilita: number; iperstaticita: number; rango: number;
  gradiLiberta: number; gradiVincolo: number;
}

function diagnostica(
  progetto: Progetto,
  mc: MatriceCinematica,
  dec: ReturnType<typeof decomponi>,
  c: Conteggi,
  meccanismi: ModoLabile[],
): Diagnosi[] {
  const out: Diagnosi[] = [];

  // Un anello chiuso è invisibile al bilancio 3n − v: il telaio è un corpo
  // solo e il conteggio lo dichiara isostatico, mentre dentro l'anello le
  // sollecitazioni non discendono dall'equilibrio. Va detto prima di ogni
  // altra cosa, perché cambia il significato di tutto quello che segue.
  const anelli = dec.topologia.anelliTotali;
  if (anelli > 0) {
    out.push({
      gravita: 'avviso', codice: 'ANELLO_CHIUSO',
      messaggio:
        `La struttura contiene ${anelli === 1 ? 'un anello chiuso' : `${anelli} anelli chiusi`}: ` +
        `${3 * anelli} iperstaticità INTERNE che il bilancio 3n − v non vede. ` +
        'Le equazioni cardinali bastano per le reazioni esterne, ma non per le ' +
        'caratteristiche di sollecitazione: quelle si calcolano con il metodo ' +
        'degli spostamenti. Una sconnessione interna sull\'anello lo aprirebbe.',
    });
  }

  const riepilogo =
    `${c.gradiVincolo} gradi di vincolo, ${c.gradiLiberta} gradi di libertà ` +
    `(${dec.corpi.length} ${dec.corpi.length === 1 ? 'corpo rigido' : 'corpi rigidi'}), ` +
    `rango ${c.rango}`;

  if (c.labilita === 0 && c.iperstaticita === 0) {
    out.push({
      gravita: 'info', codice: 'ISOSTATICA',
      messaggio: `${riepilogo}: la struttura è ISOSTATICA. I vincoli sono ` +
        `esattamente sufficienti e ben disposti.`,
    });
  } else if (c.labilita === 0) {
    out.push({
      gravita: 'info', codice: 'IPERSTATICA',
      messaggio: `${riepilogo}: la struttura è IPERSTATICA ` +
        `${volte(c.iperstaticita)}. Il calcolo richiede le equazioni di congruenza; ` +
        `il metodo degli spostamenti le risolve automaticamente.`,
    });
  } else if (c.iperstaticita === 0) {
    out.push({
      gravita: 'errore', codice: 'LABILE',
      messaggio: `${riepilogo}: la struttura è LABILE con ${c.labilita} ` +
        `${c.labilita === 1 ? 'grado' : 'gradi'} di labilità. I vincoli non sono ` +
        `sufficienti a impedire i moti rigidi.`,
    });
  } else {
    out.push({
      gravita: 'errore', codice: 'LABILE_E_IPERSTATICA',
      messaggio: `${riepilogo}: la struttura è LABILE con ${c.labilita} ` +
        `${c.labilita === 1 ? 'grado' : 'gradi'} di labilità ed è al tempo stesso ` +
        `IPERSTATICA ${volte(c.iperstaticita)}. I vincoli sono in numero ` +
        `sufficiente ma MAL DISPOSTI: sovrabbondano in una direzione e mancano ` +
        `in un'altra.`,
    });
  }

  if (c.labilita > 0) {
    out.push(...diagnosiVincoliMalDisposti(mc));
    out.push(...descriviMeccanismi(meccanismi, dec));
  }

  // vincoli elastici: non compaiono nel conteggio ma stabilizzano il modello
  const molle = progetto.nodi.filter((n) => n.vincolo?.tipo === 'molla');
  if (molle.length > 0) {
    out.push({
      gravita: 'info', codice: 'VINCOLI_ELASTICI',
      messaggio: `${molle.length} vincolo/i elastico/i (molla) non entrano nel ` +
        `conteggio dei gradi di vincolo, perché non impongono condizioni rigide. ` +
        `Irrigidiscono però la matrice di rigidezza: una struttura qui classificata ` +
        `labile può risultare comunque risolvibile.`,
      evidenza: { tipo: 'nodi', ids: molle.map((n) => n.id) },
    });
  }

  return out;
}

/**
 * Riconoscimento delle disposizioni classiche che rendono labile una struttura
 * apparentemente ben vincolata: rette d'azione delle reazioni CONCORRENTI in un
 * punto, oppure tutte PARALLELE (concorrenti in un punto improprio).
 */
function diagnosiVincoliMalDisposti(mc: MatriceCinematica): Diagnosi[] {
  const rette = mc.righe
    .map((r, i) => ({ r, i }))
    .filter((x) => x.r.origine === 'esterno' && x.r.reazione)
    .map((x) => x.r.reazione!);

  if (rette.length < 3) return [];

  // la retta d'azione passa per (x,y) con direzione (dx,dy)
  const direzioni = rette.map((r) => Math.atan2(r.dy, r.dx));
  const tolAng = 1e-7;
  const paralleleTutte = direzioni.every(
    (a) => Math.abs(Math.sin(a - direzioni[0])) < tolAng,
  );
  if (paralleleTutte) {
    return [{
      gravita: 'errore', codice: 'REAZIONI_PARALLELE',
      messaggio: `Le rette d'azione di tutte le reazioni sono PARALLELE ` +
        `(direzione ${(direzioni[0] * 180 / Math.PI).toFixed(1)}°): concorrono in un ` +
        `punto improprio. La struttura può traslare nella direzione ortogonale, ` +
        `e nessuna reazione può opporsi.`,
      evidenza: { tipo: 'retta', x: rette[0].x, y: rette[0].y, direzione: direzioni[0] + Math.PI / 2 },
    }];
  }

  // intersezione delle prime due rette non parallele, poi verifica che tutte vi passino
  let P: { x: number; y: number } | null = null;
  for (let i = 0; i < rette.length && !P; i++) {
    for (let j = i + 1; j < rette.length && !P; j++) {
      P = intersezione(rette[i], rette[j]);
    }
  }
  if (!P) return [];

  const scala = Math.max(mc.Lc, 1e-9);
  const tutteConcorrenti = rette.every((r) => distanzaPuntoRetta(P!, r) < 1e-7 * scala);
  if (tutteConcorrenti) {
    return [{
      gravita: 'errore', codice: 'REAZIONI_CONCORRENTI',
      messaggio: `Le rette d'azione delle reazioni CONCORRONO tutte nel punto ` +
        `P = (${P.x.toFixed(3)}, ${P.y.toFixed(3)}). Nessuna di esse ha momento ` +
        `rispetto a P: la struttura può ruotare attorno a quel punto e i vincoli ` +
        `non possono impedirlo, per quanti se ne aggiungano lungo rette passanti per P.`,
      evidenza: { tipo: 'punto', x: P.x, y: P.y },
    }];
  }
  return [];
}

function intersezione(
  a: { x: number; y: number; dx: number; dy: number },
  b: { x: number; y: number; dx: number; dy: number },
): { x: number; y: number } | null {
  // la reazione di direzione (dx,dy) applicata in (x,y) ha per retta d'azione
  // la retta passante per (x,y) con quella direzione
  const den = a.dx * b.dy - a.dy * b.dx;
  if (Math.abs(den) < 1e-12) return null;
  const t = ((b.x - a.x) * b.dy - (b.y - a.y) * b.dx) / den;
  return { x: a.x + t * a.dx, y: a.y + t * a.dy };
}

function distanzaPuntoRetta(
  P: { x: number; y: number },
  r: { x: number; y: number; dx: number; dy: number },
): number {
  const n = Math.hypot(r.dx, r.dy) || 1;
  return Math.abs((P.x - r.x) * (r.dy / n) - (P.y - r.y) * (r.dx / n));
}

function descriviMeccanismi(
  meccanismi: ModoLabile[], dec: ReturnType<typeof decomponi>,
): Diagnosi[] {
  const out: Diagnosi[] = [];
  meccanismi.forEach((m, k) => {
    const parti: string[] = [];
    m.cir.forEach((c, b) => {
      const nome = dec.corpi.length === 1 ? 'la struttura' : `il corpo ${b + 1}`;
      if (c.tipo === 'proprio') {
        parti.push(`${nome} ruota attorno a (${c.x.toFixed(3)}, ${c.y.toFixed(3)})`);
      } else if (c.tipo === 'improprio') {
        parti.push(`${nome} trasla nella direzione ${((c.direzione - Math.PI / 2) * 180 / Math.PI).toFixed(1)}°`);
      }
    });
    if (parti.length === 0) return;
    out.push({
      gravita: 'avviso', codice: 'MECCANISMO',
      messaggio: `Meccanismo ${k + 1}: ${parti.join('; ')}.`,
      ...(m.cir[0]?.tipo === 'proprio'
        ? { evidenza: { tipo: 'punto' as const, x: m.cir[0].x, y: m.cir[0].y } }
        : {}),
    });
  });
  return out;
}

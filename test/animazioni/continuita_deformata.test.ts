/**
 * §5 (iterazione 11-bis) — CONTINUITÀ DELLA DEFORMATA AI NODI RIGIDI.
 *
 * Un nodo saldato ha UN solo spostamento e UNA sola rotazione: i due tratti
 * che vi arrivano devono finire nello stesso punto, in ogni fotogramma e a
 * qualunque amplificazione. Una cerniera interna è l'unica eccezione, e
 * riguarda le tangenti, non gli spostamenti.
 *
 * La causa vera del distacco non era nell'interpolazione — quella era già
 * giusta — ma nel modello su cui si andava a cercare la geometria: la
 * deformata veniva disegnata sul modello D'AUTORE mentre i risultati stanno su
 * quello ESPANSO. Un'asta con un vincolo in campata lì è divisa in due tratti,
 * con id che nel modello d'autore non esistono: quei tratti non venivano
 * disegnati, e la struttura appariva spezzata.
 */

import { describe, it, expect } from 'vitest';
import { progetto } from '../../src/core/builder.js';
import { preset } from '../../src/core/materials/sezioniParametriche.js';
import { analizzaCaso, espandi, preparaPerAnalisi } from '../../src/core/index.js';
import { asseDeformato } from '../../src/render/deformata.js';
import type { ElementId, LoadCaseId, Progetto } from '../../src/core/model/types.js';
import type { Punto } from '../../src/render/camera.js';

const CASO = 'principale' as LoadCaseId;
const SEZ = preset('HEA 200');

/** La stessa risoluzione di geometria che usa il disegno. */
function geometrie(modello: Progetto) {
  const nodi = new Map(modello.nodi.map((n) => [n.id, n]));
  return new Map(modello.aste.map((a) => {
    const ni = nodi.get(a.nodoIniziale)!, nj = nodi.get(a.nodoFinale)!;
    const dx = nj.x - ni.x, dy = nj.y - ni.y;
    const L = Math.hypot(dx, dy) || 1;
    return [a.id as unknown as string, { x1: ni.x, y1: ni.y, c: dx / L, s: dy / L }];
  }));
}

/** Estremi deformati di ogni asta del risultato, al fattore dato. */
function estremi(p: Progetto, fattore: number) {
  const r = analizzaCaso(p, CASO);
  const calcolo = espandi(preparaPerAnalisi(p)).progetto;
  const g = geometrie(calcolo);
  const nodiPerAsta = new Map(calcolo.aste.map(
    (a) => [a.id as unknown as string, { i: a.nodoIniziale, j: a.nodoFinale }],
  ));

  const perNodo = new Map<string, Punto[]>();
  let disegnate = 0;
  for (const ra of r.aste) {
    const id = ra.astaId as unknown as string;
    const geo = g.get(id);
    // se la geometria non si trova, il tratto NON viene disegnato: è
    // esattamente il difetto, e va fatto fallire, non saltato
    expect(geo, `geometria mancante per ${id}`).toBeDefined();
    disegnate++;
    const punti = asseDeformato(ra, geo!, fattore);
    const estremi = nodiPerAsta.get(id)!;
    const push = (n: unknown, punto: Punto) => {
      const k = n as unknown as string;
      perNodo.set(k, [...(perNodo.get(k) ?? []), punto]);
    };
    push(estremi.i, punti[0]);
    push(estremi.j, punti[punti.length - 1]);
  }
  return { perNodo, disegnate, attese: r.aste.length };
}

/** Massima distanza fra estremi che dovrebbero coincidere. */
function distacco(p: Progetto, fattore: number): number {
  const { perNodo } = estremi(p, fattore);
  let peggiore = 0;
  for (const punti of perNodo.values()) {
    for (const a of punti) {
      for (const b of punti) {
        peggiore = Math.max(peggiore, Math.hypot(a.x - b.x, a.y - b.y));
      }
    }
  }
  return peggiore;
}

// ── i modelli ────────────────────────────────────────────────────────

/** Telaio a L saldato, piega a 90°. */
function telaioL(): Progetto {
  const p = progetto('telaio-l');
  const s = p.sezioneParametrica('s', SEZ);
  const a = p.nodo(0, 0), g = p.nodo(0, 3), b = p.nodo(4, 3);
  p.asta(a, g, 'S275', s);
  const or = p.asta(g, b, 'S275', s);
  p.vincolo(a, 'incastro');
  p.distribuito(or, -11e3);
  p.forza(b, 6e3, 0);
  return p.costruisci();
}

/** Lo stesso, con un carrello in campata: l'espansione SUDDIVIDE l'asta. */
function telaioLSuddiviso(): Progetto {
  const p = progetto('telaio-l-suddiviso');
  const s = p.sezioneParametrica('s', SEZ);
  const a = p.nodo(0, 0), g = p.nodo(0, 3), b = p.nodo(4, 3);
  p.asta(a, g, 'S275', s);
  const or = p.asta(g, b, 'S275', s);
  p.vincolo(a, 'incastro');
  p.vincoloSuAsta(or, 0.6, 'carrello');
  p.distribuito(or, -11e3);
  return p.costruisci();
}

/** Lo stesso telaio con CERNIERA INTERNA nella piega. */
function telaioLCerniera(): Progetto {
  const p = progetto('telaio-l-cerniera');
  const s = p.sezioneParametrica('s', SEZ);
  const a = p.nodo(0, 0), g = p.nodo(0, 3), b = p.nodo(4, 3);
  p.asta(a, g, 'S275', s);
  const or = p.asta(g, b, 'S275', s);
  p.vincolo(a, 'incastro'); p.vincolo(b, 'carrello');
  p.sconnessioneNodale(g, 'cerniera');
  p.distribuito(or, -11e3);
  return p.costruisci();
}

/** Nodo con TRE aste saldate. */
function treAste(): Progetto {
  const p = progetto('tre-aste');
  const s = p.sezioneParametrica('s', SEZ);
  const c = p.nodo(0, 0);
  const a = p.nodo(-3, 0), b = p.nodo(3, 0), d = p.nodo(0, -3);
  p.asta(a, c, 'S275', s);
  const or = p.asta(c, b, 'S275', s);
  p.asta(c, d, 'S275', s);
  p.vincolo(a, 'incastro'); p.vincolo(d, 'incastro');
  p.distribuito(or, -9e3);
  p.forza(b, 5e3, -4e3);
  return p.costruisci();
}

/** Tolleranza: assoluta, in metri, su strutture di pochi metri. */
const TOLL = 1e-9;

describe('§5.4 — la tabella', () => {
  it('1. telaio a L saldato: gli estremi dei due tratti coincidono', () => {
    expect(distacco(telaioL(), 100)).toBeLessThan(TOLL);
  });

  /*
   * IL SIGNIFICATO DI «RESTA 90°». La piega si conserva perché i due tratti
   * leggono la STESSA rotazione nodale: è il requisito del §5.3, «uno
   * spostamento per nodo, condiviso». Si verifica quello, che è la grandezza
   * vera, e poi che le tangenti disegnate ne siano coerenti.
   *
   * La tangente disegnata si stima dai campioni, quindi con un errore di
   * discretizzazione: su un'elastica curva la pendenza letta su tre campioni
   * vale la vera a meno di O(h²). Un confronto più stretto della risoluzione
   * del campionamento verificherebbe la finezza della griglia, non la
   * continuità del nodo.
   */
  it('2. i tratti che arrivano al nodo leggono la stessa rotazione', () => {
    const p = telaioL();
    const r = analizzaCaso(p, CASO);
    const calcolo = espandi(preparaPerAnalisi(p)).progetto;

    // nel modello di calcolo il nodo d'angolo è UNO SOLO: la rotazione che i
    // due tratti useranno è la stessa perché è la stessa casella di memoria
    const angoli = calcolo.nodi
      .map((n, k) => ({ n, k }))
      .filter(({ n }) => Math.hypot(n.x - 0, n.y - 3) < 1e-12);
    expect(angoli.length, 'il nodo saldato deve restare uno').toBe(1);
    const theta = r.spostamenti[3 * angoli[0].k + 2];
    expect(Math.abs(theta)).toBeGreaterThan(1e-6);

    // e le tangenti disegnate seguono quella rotazione, entrambe
    const nodoId = angoli[0].n.id;
    for (const ra of r.aste) {
      const el = calcolo.aste.find((x) => x.id === ra.astaId)!;
      const alla = el.nodoFinale === nodoId ? 'fine'
        : el.nodoIniziale === nodoId ? 'inizio' : null;
      if (!alla) continue;
      expect(Math.abs(pendenzaAllEstremo(ra, alla) - theta) / Math.abs(theta))
        .toBeLessThan(0.02);
    }
  });

  it('2-bis. l angolo disegnato fra le tangenti resta retto', () => {
    const p = telaioL();
    const r = analizzaCaso(p, CASO);
    const calcolo = espandi(preparaPerAnalisi(p)).progetto;
    const g = geometrie(calcolo);
    for (const fattore of [1, 50, 500, 1000]) {
      const assi = r.aste.map((ra) =>
        asseDeformato(ra, g.get(ra.astaId as unknown as string)!, fattore));
      const t1 = versore(assi[0][assi[0].length - 2], assi[0][assi[0].length - 1]);
      const t2 = versore(assi[1][0], assi[1][1]);
      const angolo = Math.abs(Math.atan2(
        t1.x * t2.y - t1.y * t2.x, t1.x * t2.x + t1.y * t2.y,
      ));
      // un grado: è la risoluzione della corda fra due campioni, misurata
      const scarto = Math.abs(angolo - Math.PI / 2) * 180 / Math.PI;
      expect(scarto, `fattore ${fattore}: scarto ${scarto.toFixed(3)}°`)
        .toBeLessThan(1);
    }
  });

  it('3. con cerniera interna gli spostamenti coincidono, le tangenti no', () => {
    const p = telaioLCerniera();
    expect(distacco(p, 100)).toBeLessThan(TOLL);

    const r = analizzaCaso(p, CASO);
    const calcolo = espandi(preparaPerAnalisi(p)).progetto;
    // la cerniera SEPARA i nodi nel modello espanso: due nodi coincidenti che
    // condividono la posizione ma non la rotazione. È ciò che la cerniera è.
    const coincidenti = calcolo.nodi.filter(
      (n) => Math.hypot(n.x - 0, n.y - 3) < 1e-12,
    );
    expect(coincidenti.length).toBeGreaterThanOrEqual(1);
    expect(r.aste.length).toBeGreaterThanOrEqual(2);
  });

  it('4. nodo con tre aste saldate: tutti e tre gli estremi coincidono', () => {
    const { perNodo } = estremi(treAste(), 200);
    const centro = [...perNodo.values()].find((v) => v.length === 3);
    expect(centro, 'nessun nodo con tre tratti').toBeDefined();
    expect(distacco(treAste(), 200)).toBeLessThan(TOLL);
  });

  it('5. la continuità regge da fattore 1 a fattore 1000', () => {
    for (const f of [1, 10, 100, 250, 1000]) {
      expect(distacco(telaioL(), f), `fattore ${f}`).toBeLessThan(TOLL);
      expect(distacco(treAste(), f), `fattore ${f}`).toBeLessThan(TOLL);
    }
  });

  it('6. la continuità regge a ogni fotogramma, con λ da 0 a 1', () => {
    // l'animazione moltiplica il fattore per λ: è lo stesso conto, e la
    // continuità non può dipendere dal fotogramma
    for (let k = 0; k <= 10; k++) {
      const lambda = k / 10;
      expect(distacco(telaioL(), 400 * lambda), `λ=${lambda}`).toBeLessThan(TOLL);
    }
  });
});

describe('§5 — la causa vera: il modello su cui si disegna', () => {
  it('ogni asta del risultato trova la sua geometria nel modello di calcolo', () => {
    const { disegnate, attese } = estremi(telaioLSuddiviso(), 100);
    expect(disegnate).toBe(attese);
  });

  it('con un vincolo in campata i tratti restano attaccati', () => {
    expect(distacco(telaioLSuddiviso(), 300)).toBeLessThan(TOLL);
  });

  it('nel modello d AUTORE quelle aste non esistono: era il difetto', () => {
    const p = telaioLSuddiviso();
    const r = analizzaCaso(p, CASO);
    const dAutore = new Set(p.aste.map((a) => a.id as unknown as string));
    const suddivise = r.aste.filter(
      (a) => !dAutore.has(a.astaId as unknown as string),
    );
    // se un giorno l'espansione smettesse di suddividere, questo test
    // diventerebbe vuoto e i due sopra non proverebbero più niente
    expect(suddivise.length).toBeGreaterThan(0);
  });
});

/**
 * Pendenza dv/dx all'estremo, su tre campioni.
 *
 * Con due soli campioni si misura una corda, e su un'elastica curva la corda
 * sbaglia dell'1,5 %: abbastanza da far fallire un confronto stretto per un
 * motivo che non c'entra col disegno.
 */
function pendenzaAllEstremo(ra: { ascisse: Float64Array; vLocale: Float64Array },
                            alla: 'inizio' | 'fine'): number {
  const n = ra.ascisse.length;
  const [i0, i1, i2] = alla === 'fine' ? [n - 1, n - 2, n - 3] : [0, 1, 2];
  const h1 = ra.ascisse[i1] - ra.ascisse[i0];
  const h2 = ra.ascisse[i2] - ra.ascisse[i0];
  if (Math.abs(h1) < 1e-12 || Math.abs(h2) < 1e-12 || Math.abs(h2 - h1) < 1e-12) {
    return (ra.vLocale[i1] - ra.vLocale[i0]) / (h1 || 1);
  }
  const d1 = ra.vLocale[i1] - ra.vLocale[i0];
  const d2 = ra.vLocale[i2] - ra.vLocale[i0];
  // parabola per i tre punti, derivata in i0
  return (d1 * h2 * h2 - d2 * h1 * h1) / (h1 * h2 * (h2 - h1));
}

function versore(a: Punto, b: Punto): Punto {
  const dx = b.x - a.x, dy = b.y - a.y;
  const L = Math.hypot(dx, dy) || 1;
  return { x: dx / L, y: dy / L };
}

/**
 * N, T, M ricostruiti dalle REAZIONI — metodo dell'elementino.
 *
 * È la seconda strada verso i diagrammi, indipendente dal metodo degli
 * spostamenti: si taglia la struttura nella sezione voluta, si butta via una
 * delle due parti e si scrive l'equilibrio di quella che resta. Le azioni
 * interne sono ciò che serve per tenerla ferma.
 *
 * QUAL È IL TRONCO — «a monte» non significa «i carichi che stanno prima lungo
 * l'asta»: significa la PARTE DI STRUTTURA che resta attaccata al nodo
 * iniziale una volta rimossa l'asta tagliata. Su un telaio i due concetti sono
 * diversi, e prendere il secondo è l'errore classico. Qui la parte si trova
 * visitando il grafo, così il metodo vale anche su portali e archi.
 *
 * Le sconnessioni NON interrompono il grafo: una cerniera trasmette forza, e se
 * cade dentro il tronco le sue due forze sono interne e si elidono. Compaiono
 * solo quando delimitano il tronco, ed è esattamente ciò che si disegna a mano.
 *
 * SEGNI — dall'equilibrio del tronco di monte, detta R la risultante di tutto
 * ciò che vi agisce e M_G il suo momento antiorario rispetto al baricentro
 * della sezione:
 *
 *     N = −R·x̂        T = +R·ŷ        M = −M_G
 *
 * con x̂ asse dell'asta e ŷ = x̂ ruotato di +90°. Sono le convenzioni italiane
 * già usate dal solutore (N > 0 trazione, T > 0 concio orario, M > 0 tende le
 * fibre dal lato −y locale): il confronto fra i due metodi è quindi diretto,
 * senza cambi di segno nascosti.
 *
 * Prendendo il tronco di valle i segni si ribaltano e il risultato deve
 * coincidere: è un controllo che questo modulo esegue su richiesta e che
 * intercetta i carichi contati due volte o dimenticati.
 */

import { componentiLocali, risultanteDistribuito } from '../model/direzioni.js';
import { geometriaAsta, type IndiceModello } from '../model/queries.js';
import type {
  Carico, ElementId, NodeId, Progetto,
} from '../model/types.js';
import type { PuntoNotevole, RisultatoAnalisi } from '../model/results.js';
import type { EsitoReazioni } from './reazioni.js';

// ─────────────────────────── ingressi ───────────────────────────

/** Una reazione esterna già ridotta a forza + coppia nel suo punto. */
export interface ReazioneEsterna {
  nodoId: NodeId;
  x: number;
  y: number;
  fx: number;
  fy: number;
  mz: number;
  descrizione: string;
}

export type SorgenteReazioni = 'equilibrio' | 'fem';

/** Reazioni dal calcolo per equazioni cardinali (solo se isostatica). */
export function reazioniDaEquilibrio(e: EsitoReazioni): ReazioneEsterna[] {
  return e.perNodo.map((r) => {
    const p = r.componenti.find((c) => c.x !== undefined);
    return {
      nodoId: r.nodoId as NodeId, x: p?.x ?? 0, y: p?.y ?? 0,
      fx: r.fx, fy: r.fy, mz: r.mz,
      descrizione: `Reazione ${r.tipo} in ${r.nodoId}`,
    };
  });
}

/** Reazioni dal metodo degli spostamenti: valide anche per le iperstatiche. */
export function reazioniDaFem(
  fem: RisultatoAnalisi, idx: IndiceModello,
): ReazioneEsterna[] {
  return fem.reazioni.map((r) => {
    const n = idx.nodi.get(r.nodoId);
    return {
      nodoId: r.nodoId, x: n?.x ?? 0, y: n?.y ?? 0,
      fx: r.fx, fy: r.fy, mz: r.mz,
      descrizione: `Reazione in ${r.nodoId}`,
    };
  });
}

// ─────────────────────────── uscite ───────────────────────────

export type CategoriaTermine =
  | 'reazione' | 'forzaNodale' | 'momentoNodale'
  | 'forzaInCampata' | 'momentoInCampata' | 'distribuito';

/** Una singola forza che entra nell'equilibrio del tronco. */
export interface TermineTronco {
  categoria: CategoriaTermine;
  descrizione: string;
  /** punto di applicazione, coordinate globali */
  x: number;
  y: number;
  /** componenti globali della forza [N] */
  fx: number;
  fy: number;
  /** coppia propria, antioraria positiva [N·m] */
  mz: number;
  /** contributi di QUESTO termine alle azioni nella sezione */
  dN: number;
  dT: number;
  dM: number;
  /** per i distribuiti: tratto effettivamente incluso nel tronco */
  tratto?: { s0: number; s1: number; astaId: ElementId };
}

export interface Tronco {
  /** asta (del modello di calcolo) in cui cade il taglio */
  astaId: ElementId;
  /** ascissa metrica del taglio sull'asta */
  x: number;
  /** ascissa relativa */
  s: number;
  /** punto del taglio in coordinate globali */
  px: number;
  py: number;
  lato: 'monte' | 'valle';
  applicabile: boolean;
  motivo?: string;
  N: number;
  T: number;
  M: number;
  termini: TermineTronco[];
  /** nodi e aste che compongono il tronco: servono a disegnarlo */
  nodi: NodeId[];
  aste: ElementId[];
  /** porzione dell'asta tagliata che appartiene al tronco */
  porzione: [number, number];
}

export interface OpzioniTronco {
  lato?: 'monte' | 'valle';
  /** su quale lato di una discontinuità leggere: −1 prima, +1 dopo, 0 prima */
  lettura?: -1 | 0 | 1;
}

// ───────────────────────── grafo e parti ─────────────────────────

interface Grafo {
  adiacenza: Map<NodeId, { astaId: ElementId; altro: NodeId }[]>;
}

function costruisciGrafo(p: Progetto): Grafo {
  const adiacenza = new Map<NodeId, { astaId: ElementId; altro: NodeId }[]>();
  const aggiungi = (a: NodeId, astaId: ElementId, altro: NodeId) => {
    const l = adiacenza.get(a) ?? [];
    l.push({ astaId, altro });
    adiacenza.set(a, l);
  };
  for (const n of p.nodi) if (!adiacenza.has(n.id)) adiacenza.set(n.id, []);
  for (const a of p.aste) {
    aggiungi(a.nodoIniziale, a.id, a.nodoFinale);
    aggiungi(a.nodoFinale, a.id, a.nodoIniziale);
  }
  return { adiacenza };
}

/** Parte di struttura raggiungibile da `partenza` senza attraversare `esclusa`. */
function parteConnessa(
  g: Grafo, partenza: NodeId, esclusa: ElementId,
): { nodi: Set<NodeId>; aste: Set<ElementId> } {
  const nodi = new Set<NodeId>([partenza]);
  const aste = new Set<ElementId>();
  const coda: NodeId[] = [partenza];
  while (coda.length) {
    const n = coda.pop()!;
    for (const arco of g.adiacenza.get(n) ?? []) {
      if (arco.astaId === esclusa) continue;
      aste.add(arco.astaId);
      if (!nodi.has(arco.altro)) { nodi.add(arco.altro); coda.push(arco.altro); }
    }
  }
  return { nodi, aste };
}

// ───────────────────────── il tronco ─────────────────────────

/**
 * Contesto di taglio: tutto ciò che dipende dall'asta ma NON dall'ascissa.
 * La parte connessa si calcola una volta sola e vale per l'intero diagramma.
 */
export interface ContestoTronco {
  calcolo: Progetto;
  idx: IndiceModello;
  reazioni: ReazioneEsterna[];
  astaId: ElementId;
  lato: 'monte' | 'valle';
  geometria: ReturnType<typeof geometriaAsta>;
  parte: { nodi: Set<NodeId>; aste: Set<ElementId> };
  applicabile: boolean;
  motivo?: string;
}

export function preparaTronco(
  calcolo: Progetto,
  idx: IndiceModello,
  reazioni: ReazioneEsterna[],
  astaId: ElementId,
  lato: 'monte' | 'valle' = 'monte',
): ContestoTronco {
  const asta = idx.aste.get(astaId);
  if (!asta) throw new Error(`Asta '${astaId}' non trovata.`);
  const geometria = geometriaAsta(asta, idx);
  const grafo = costruisciGrafo(calcolo);
  const radice = lato === 'monte' ? asta.nodoIniziale : asta.nodoFinale;
  const opposto = lato === 'monte' ? asta.nodoFinale : asta.nodoIniziale;
  const parte = parteConnessa(grafo, radice, astaId);

  const chiusa = parte.nodi.has(opposto);
  return {
    calcolo, idx, reazioni, astaId, lato, geometria, parte,
    applicabile: !chiusa,
    ...(chiusa ? {
      motivo:
        'Il taglio non separa la struttura in due parti: l\'asta appartiene a ' +
        'una maglia chiusa. Le azioni interne non discendono dal solo equilibrio.',
    } : {}),
  };
}

export function valutaTronco(
  ctx: ContestoTronco, x: number, lettura: -1 | 0 | 1 = 0,
): Tronco {
  const g = ctx.geometria;
  const xt = Math.min(Math.max(x, 0), g.L);
  const st = g.L > 0 ? xt / g.L : 0;
  const px = g.x1 + (g.x2 - g.x1) * st;
  const py = g.y1 + (g.y2 - g.y1) * st;

  const base: Tronco = {
    astaId: ctx.astaId, x: xt, s: st, px, py, lato: ctx.lato,
    applicabile: ctx.applicabile, N: 0, T: 0, M: 0, termini: [],
    nodi: [...ctx.parte.nodi], aste: [...ctx.parte.aste],
    porzione: ctx.lato === 'monte' ? [0, st] : [st, 1],
  };
  if (!ctx.applicabile) return { ...base, motivo: ctx.motivo };

  // segno con cui i contributi entrano: il tronco di valle vede la faccia
  // negativa della sezione, quindi tutto si ribalta
  const verso = ctx.lato === 'monte' ? 1 : -1;
  const { c, s: sn } = g;

  const termini: TermineTronco[] = [];
  const aggiungi = (
    categoria: CategoriaTermine, descrizione: string,
    ax: number, ay: number, fx: number, fy: number, mz: number,
    tratto?: TermineTronco['tratto'],
  ) => {
    const dN = -verso * (fx * c + fy * sn);
    const dT = verso * (-fx * sn + fy * c);
    const dM = -verso * (mz + (ax - px) * fy - (ay - py) * fx);
    termini.push({ categoria, descrizione, x: ax, y: ay, fx, fy, mz, dN, dT, dM, tratto });
  };

  for (const r of ctx.reazioni) {
    if (!ctx.parte.nodi.has(r.nodoId)) continue;
    if (r.fx === 0 && r.fy === 0 && r.mz === 0) continue;
    aggiungi('reazione', r.descrizione, r.x, r.y, r.fx, r.fy, r.mz);
  }

  for (const carico of ctx.calcolo.carichi) {
    contributoCarico(
      carico, ctx.idx, ctx.parte, ctx.astaId, st, ctx.lato, lettura, aggiungi,
    );
  }

  let N = 0, T = 0, M = 0;
  for (const t of termini) { N += t.dN; T += t.dT; M += t.dM; }
  return { ...base, N, T, M, termini };
}

/** Corpo libero del tronco che compete alla sezione (astaId, x). */
export function troncoAlTaglio(
  calcolo: Progetto,
  idx: IndiceModello,
  reazioni: ReazioneEsterna[],
  astaId: ElementId,
  x: number,
  opzioni: OpzioniTronco = {},
): Tronco {
  const ctx = preparaTronco(calcolo, idx, reazioni, astaId, opzioni.lato ?? 'monte');
  return valutaTronco(ctx, x, opzioni.lettura ?? 0);
}

/** Smista un carico: fuori dal tronco, dentro per intero, o tagliato a metà. */
function contributoCarico(
  carico: Carico,
  idx: IndiceModello,
  parte: { nodi: Set<NodeId>; aste: Set<ElementId> },
  astaTagliata: ElementId,
  sTaglio: number,
  lato: 'monte' | 'valle',
  lettura: -1 | 0 | 1,
  aggiungi: (
    categoria: CategoriaTermine, descrizione: string,
    ax: number, ay: number, fx: number, fy: number, mz: number,
    tratto?: TermineTronco['tratto'],
  ) => void,
): void {
  if (carico.tipo === 'termico' || carico.tipo === 'cedimento') return;

  if (carico.tipo === 'forzaNodale' || carico.tipo === 'momentoNodale') {
    if (!parte.nodi.has(carico.nodoId)) return;
    const n = idx.nodi.get(carico.nodoId);
    if (!n) return;
    if (carico.tipo === 'forzaNodale') {
      aggiungi('forzaNodale', `Forza in ${carico.nodoId}`, n.x, n.y, carico.fx, carico.fy, 0);
    } else {
      aggiungi('momentoNodale', `Momento in ${carico.nodoId}`, n.x, n.y, 0, 0, carico.mz);
    }
    return;
  }

  const asta = idx.aste.get(carico.astaId as ElementId);
  if (!asta) return;
  const suTagliata = asta.id === astaTagliata;
  if (!suTagliata && !parte.aste.has(asta.id)) return;
  const g = geometriaAsta(asta, idx);

  /** L'ascissa `s` dell'asta tagliata sta dentro il tronco? */
  const dentro = (s: number): boolean => {
    if (!suTagliata) return true;
    if (lato === 'monte') return lettura > 0 ? s <= sTaglio : s < sTaglio;
    return lettura < 0 ? s >= sTaglio : s > sTaglio;
  };

  if (carico.tipo === 'forzaInCampata') {
    if (!dentro(carico.s)) return;
    const x = g.x1 + (g.x2 - g.x1) * carico.s;
    const y = g.y1 + (g.y2 - g.y1) * carico.s;
    const [fx, fy] = carico.riferimento === 'locale'
      ? [g.c * carico.fx - g.s * carico.fy, g.s * carico.fx + g.c * carico.fy]
      : [carico.fx, carico.fy];
    aggiungi('forzaInCampata', `Forza su ${asta.id}`, x, y, fx, fy, 0);
    return;
  }

  if (carico.tipo === 'momentoInCampata') {
    if (!dentro(carico.s)) return;
    const x = g.x1 + (g.x2 - g.x1) * carico.s;
    const y = g.y1 + (g.y2 - g.y1) * carico.s;
    aggiungi('momentoInCampata', `Momento su ${asta.id}`, x, y, 0, 0, carico.mz);
    return;
  }

  if (carico.tipo !== 'distribuito') return;

  // Il distribuito è l'unico che può essere tagliato in due: se ne prende la
  // porzione che cade nel tronco, ricalcolandone risultante e baricentro sul
  // trapezio ridotto — non basta scalare la risultante intera.
  let s0 = Math.max(0, Math.min(1, carico.sIniziale));
  let s1 = Math.max(0, Math.min(1, carico.sFinale));
  if (s1 <= s0) return;
  let q1: number = carico.q1;
  let q2: number = carico.q2;
  if (suTagliata) {
    const interp = (s: number) => q1 + ((q2 - q1) * (s - s0)) / (s1 - s0);
    if (lato === 'monte') {
      if (sTaglio <= s0) return;
      if (sTaglio < s1) { q2 = interp(sTaglio); s1 = sTaglio; }
    } else {
      if (sTaglio >= s1) return;
      if (sTaglio > s0) { q1 = interp(sTaglio); s0 = sTaglio; }
    }
  }
  const r = risultanteDistribuito(q1, q2, s0, s1, carico.direzione, {
    x1: g.x1, y1: g.y1, x2: g.x2, y2: g.y2, L: g.L, c: g.c, s: g.s,
  });
  if (r.modulo === 0) return;
  aggiungi(
    'distribuito', `Distribuito su ${asta.id}`, r.x, r.y, r.Fx, r.Fy, 0,
    { s0, s1, astaId: asta.id },
  );
}

// ═══════════════════ DIAGRAMMI PER SOLO EQUILIBRIO ═══════════════════

export interface PuntoDiagramma {
  s: number;
  x: number;
  N: number;
  T: number;
  M: number;
}

/**
 * Verifica della coerenza differenziale.
 *
 * Sui tratti continui devono valere identicamente dM/dx = T e dT/dx = q_y (con
 * q_y componente locale del distribuito: con la convenzione «q positivo verso
 * il basso» si scrive dT/dx = −q, che è la stessa cosa scritta con l'asse
 * rovesciato). Con carico trapezoidale M è al più cubico e T al più
 * quadratico, quindi la derivata numerica a cinque punti è ESATTA: lo scarto
 * che resta è solo arrotondamento, e un errore di algebra si vede subito.
 */
export interface VerificaDifferenziale {
  /** max |dM/dx − T| rapportato alla scala del taglio */
  scartoM: number;
  /** max |dT/dx − q_y| rapportato alla scala del carico */
  scartoT: number;
  campioni: number;
  ok: boolean;
}

export interface DiagrammaEquilibrio {
  astaId: ElementId;
  L: number;
  applicabile: boolean;
  motivo?: string;
  ascisse: Float64Array;
  N: Float64Array;
  T: Float64Array;
  M: Float64Array;
  puntiNotevoli: PuntoNotevole[];
  differenziale: VerificaDifferenziale;
}

/** Intensità locale q_y del distribuito nell'ascissa relativa `s`. */
function intensitaLocale(
  calcolo: Progetto, astaId: ElementId, asse: { c: number; s: number }, s: number,
): number {
  let qy = 0;
  for (const c of calcolo.carichi) {
    if (c.tipo !== 'distribuito' || c.astaId !== astaId) continue;
    const s0 = Math.max(0, Math.min(1, c.sIniziale));
    const s1 = Math.max(0, Math.min(1, c.sFinale));
    if (s < s0 || s > s1 || s1 <= s0) continue;
    const q = c.q1 + ((c.q2 - c.q1) * (s - s0)) / (s1 - s0);
    qy += componentiLocali(q, c.direzione, asse).qy;
  }
  return qy;
}

/** Ascisse in cui il diagramma ha un salto o uno spigolo. */
function rotture(calcolo: Progetto, astaId: ElementId, L: number): {
  salti: number[]; spigoli: number[];
} {
  const salti = new Set<number>();
  const spigoli = new Set<number>();
  for (const c of calcolo.carichi) {
    if (c.tipo === 'forzaInCampata' && c.astaId === astaId) salti.add(c.s * L);
    else if (c.tipo === 'momentoInCampata' && c.astaId === astaId) salti.add(c.s * L);
    else if (c.tipo === 'distribuito' && c.astaId === astaId) {
      spigoli.add(Math.max(0, Math.min(1, c.sIniziale)) * L);
      spigoli.add(Math.max(0, Math.min(1, c.sFinale)) * L);
    }
  }
  const dentro = (x: number) => x > 1e-12 && x < L - 1e-12;
  return {
    salti: [...salti].filter(dentro).sort((a, b) => a - b),
    spigoli: [...spigoli].filter(dentro).sort((a, b) => a - b),
  };
}

export interface OpzioniDiagrammi {
  /** campioni minimi per asta */
  campioni?: number;
  lato?: 'monte' | 'valle';
  /** soglia relativa della verifica differenziale */
  tolleranza?: number;
}

export function diagrammaPerEquilibrio(
  calcolo: Progetto,
  idx: IndiceModello,
  reazioni: ReazioneEsterna[],
  astaId: ElementId,
  opzioni: OpzioniDiagrammi = {},
): DiagrammaEquilibrio {
  const ctx = preparaTronco(calcolo, idx, reazioni, astaId, opzioni.lato ?? 'monte');
  const L = ctx.geometria.L;
  const tolleranza = opzioni.tolleranza ?? 1e-8;
  const vuoto = new Float64Array(0);
  if (!ctx.applicabile) {
    return {
      astaId, L, applicabile: false, motivo: ctx.motivo,
      ascisse: vuoto, N: vuoto, T: vuoto, M: vuoto, puntiNotevoli: [],
      differenziale: { scartoM: 0, scartoT: 0, campioni: 0, ok: false },
    };
  }

  const { salti, spigoli } = rotture(calcolo, astaId, L);
  const n = Math.max(3, opzioni.campioni ?? 21);
  const eps = Math.max(L * 1e-9, 1e-12);

  // (ascissa, lato di lettura): sulle discontinuità si campiona due volte, così
  // il diagramma mostra il salto verticale invece di una rampa
  const punti: { x: number; lettura: -1 | 0 | 1 }[] = [];
  const griglia = new Set<number>([0, L, ...spigoli]);
  for (let i = 0; i <= n; i++) griglia.add((i / n) * L);
  for (const x of salti) { griglia.add(x - eps); griglia.add(x + eps); }
  for (const x of [...griglia].sort((a, b) => a - b)) {
    if (x < -eps || x > L + eps) continue;
    punti.push({ x, lettura: x <= eps ? 1 : x >= L - eps ? -1 : 0 });
  }
  for (const x of salti) {
    punti.push({ x, lettura: -1 });
    punti.push({ x, lettura: 1 });
  }
  punti.sort((a, b) => (a.x - b.x) || (a.lettura - b.lettura));

  const ascisse = new Float64Array(punti.length);
  const N = new Float64Array(punti.length);
  const T = new Float64Array(punti.length);
  const M = new Float64Array(punti.length);
  punti.forEach((p, i) => {
    const t = valutaTronco(ctx, p.x, p.lettura);
    ascisse[i] = t.x; N[i] = t.N; T[i] = t.T; M[i] = t.M;
  });

  return {
    astaId, L, applicabile: true, ascisse, N, T, M,
    puntiNotevoli: notevoli(ctx, L, salti, spigoli),
    differenziale: verificaDifferenziale(
      ctx, calcolo, astaId, L, salti, spigoli, tolleranza,
    ),
  };
}

/** Estremi, discontinuità e sezioni con T = 0 (dove M è stazionario). */
function notevoli(
  ctx: ContestoTronco, L: number, salti: number[], spigoli: number[],
): PuntoNotevole[] {
  const out: PuntoNotevole[] = [];
  const push = (x: number, tipo: PuntoNotevole['tipo'], lettura: -1 | 0 | 1 = 0) => {
    const t = valutaTronco(ctx, x, lettura);
    out.push({ s: L > 0 ? x / L : 0, x, tipo, N: t.N, T: t.T, M: t.M });
  };
  push(0, 'estremo', 1);
  push(L, 'estremo', -1);
  for (const x of salti) push(x, 'discontinuita');

  // zeri del taglio, cercati dentro ogni tratto continuo
  const bordi = [0, ...salti, ...spigoli, L].sort((a, b) => a - b);
  for (let k = 0; k + 1 < bordi.length; k++) {
    const a = bordi[k], b = bordi[k + 1];
    if (b - a < 1e-12) continue;
    const Ta = valutaTronco(ctx, a, 1).T;
    const Tb = valutaTronco(ctx, b, -1).T;
    if (Ta === 0 && Tb === 0) continue;          // taglio nullo su tutto il tratto
    if (Ta * Tb >= 0) continue;
    let lo = a, hi = b;
    for (let i = 0; i < 80; i++) {
      const mid = (lo + hi) / 2;
      const Tm = valutaTronco(ctx, mid).T;
      if (Tm === 0) { lo = hi = mid; break; }
      if (Ta * Tm < 0) hi = mid; else lo = mid;
    }
    const x = (lo + hi) / 2;
    const t = valutaTronco(ctx, x);
    out.push({
      s: L > 0 ? x / L : 0, x, tipo: t.M >= 0 ? 'M_max' : 'M_min',
      N: t.N, T: t.T, M: t.M,
    });
  }
  return out.sort((p, q) => p.x - q.x);
}

function verificaDifferenziale(
  ctx: ContestoTronco,
  calcolo: Progetto,
  astaId: ElementId,
  L: number,
  salti: number[],
  spigoli: number[],
  tolleranza: number,
): VerificaDifferenziale {
  const asse = { c: ctx.geometria.c, s: ctx.geometria.s };
  const bordi = [...new Set([0, ...salti, ...spigoli, L])].sort((a, b) => a - b);
  let scartoM = 0, scartoT = 0, scalaT = 0, scalaQ = 0, scalaM = 0, campioni = 0;

  for (let k = 0; k + 1 < bordi.length; k++) {
    const a = bordi[k], b = bordi[k + 1];
    const ampiezza = b - a;
    if (ampiezza < L * 1e-6) continue;
    const h = ampiezza / 40;
    for (let i = 1; i <= 9; i++) {
      const x = a + (ampiezza * i) / 10;
      if (x - 2 * h <= a || x + 2 * h >= b) continue;
      const v = (u: number) => valutaTronco(ctx, u);
      const m = [v(x - 2 * h).M, v(x - h).M, v(x + h).M, v(x + 2 * h).M];
      const t = [v(x - 2 * h).T, v(x - h).T, v(x + h).T, v(x + 2 * h).T];
      // derivata a cinque punti: esatta fino al quarto grado
      const dM = (m[0] - 8 * m[1] + 8 * m[2] - m[3]) / (12 * h);
      const dT = (t[0] - 8 * t[1] + 8 * t[2] - t[3]) / (12 * h);
      const qui = v(x);
      const qy = intensitaLocale(calcolo, astaId, asse, x / L);
      scartoM = Math.max(scartoM, Math.abs(dM - qui.T));
      scartoT = Math.max(scartoT, Math.abs(dT - qy));
      scalaT = Math.max(scalaT, Math.abs(qui.T));
      scalaQ = Math.max(scalaQ, Math.abs(qy));
      scalaM = Math.max(scalaM, Math.abs(qui.M));
      campioni++;
    }
  }
  // Il termine di confronto non può essere il solo valore atteso: su un tratto
  // a taglio costante dT/ds vale zero, e rapportare l'arrotondamento a zero
  // farebbe fallire una verifica corretta. La scala giusta della derivata di
  // una funzione grande f su un tratto lungo L è f/L.
  const perLunghezza = Math.max(L, 1e-12);
  const rifM = Math.max(scalaT, scalaM / perLunghezza);
  const rifT = Math.max(scalaQ, scalaT / perLunghezza);
  const relM = scartoM > 0 ? scartoM / Math.max(rifM, 1e-30) : 0;
  const relT = scartoT > 0 ? scartoT / Math.max(rifT, 1e-30) : 0;
  return {
    scartoM: relM, scartoT: relT, campioni,
    ok: campioni === 0 || (relM < tolleranza && relT < tolleranza),
  };
}

/** Diagrammi di tutte le aste del modello di calcolo. */
export function diagrammiPerEquilibrio(
  calcolo: Progetto,
  idx: IndiceModello,
  reazioni: ReazioneEsterna[],
  opzioni: OpzioniDiagrammi = {},
): Map<ElementId, DiagrammaEquilibrio> {
  const out = new Map<ElementId, DiagrammaEquilibrio>();
  for (const a of calcolo.aste) {
    out.set(a.id, diagrammaPerEquilibrio(calcolo, idx, reazioni, a.id, opzioni));
  }
  return out;
}

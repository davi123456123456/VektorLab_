/**
 * COSTRUZIONE DEL GRAFO — dalle linee disegnate ai tratti fra punti notevoli.
 *
 * È il procedimento che si fa a occhio davanti all'esercizio: si parte da
 * una linea e la si segue. Dove cambia direzione c'è uno spigolo; dove si
 * interrompe su un simbolo l'asta si divide; dove si interrompe senza niente
 * (un tratto a mano non chiuso) la si richiude. I pallini si leggono con
 * `pallini.ts`, e qui il loro esito diventa giunti e vincoli.
 *
 * I punti si costruiscono per UNIONE: ogni estremo nasce come punto a sé, e
 * le regole fondono quelli che sono lo stesso punto. La posizione di un punto
 * fuso è la media pesata dei suoi componenti, con i simboli che pesano più
 * degli estremi di linea: il centro di un pallino è più affidabile della
 * punta di un tratto che ci arriva vicino.
 */

import {
  agganciaAngolo, angoloDi, differenzaAngoli, distanza, distanzaSegmento, proiezione,
} from '../geometria.js';
import type { Tolleranze } from '../parametri.js';
import type {
  Avviso, GiuntoGrafo, Grafo, Primitive, Punto, SegmentoAsta, TipoCorpo, VincoloGrafo,
} from '../tipi.js';
import { leggiPallini } from './pallini.js';

const GRADI = Math.PI / 180;
const PESO_ESTREMO = 1;
const PESO_TAGLIO = 10;
const PESO_SIMBOLO = 100;

const TIPO_VINCOLO: Partial<Record<TipoCorpo, VincoloGrafo['tipo']>> = {
  triangolo: 'cerniera',
  triangoloRulli: 'carrello',
  incastro: 'incastro',
  doppioPendolo: 'bipendolo',
  pattino: 'pattino',
  biella: 'biella',
};
const TIPO_INTERNO: Partial<Record<TipoCorpo, GiuntoGrafo['tipo']>> = {
  doppioPendoloInterno: 'bipendolo',
  pattinoInterno: 'pattino',
};

/**
 * Giunto in costruzione: i gruppi sono indici di segmento, i tratti non
 * esistono ancora. Con `ognuno` ogni tratto che tocca il punto fa gruppo a
 * sé, anche le due metà di uno stesso segmento spezzato lì.
 */
interface GiuntoInSospeso { punto: number; tipo: GiuntoGrafo['tipo']; gruppi: number[][]; ognuno?: boolean }

class Punti {
  readonly pos: Punto[] = [];
  private readonly peso: number[] = [];
  private readonly padre: number[] = [];

  nuovo(p: Punto, peso: number): number {
    this.pos.push({ ...p });
    this.peso.push(peso);
    this.padre.push(this.padre.length);
    return this.padre.length - 1;
  }

  trova(i: number): number {
    while (this.padre[i] !== i) {
      this.padre[i] = this.padre[this.padre[i]];
      i = this.padre[i];
    }
    return i;
  }

  unisci(i: number, j: number): number {
    const a = this.trova(i);
    const b = this.trova(j);
    if (a === b) return a;
    const pa = this.peso[a];
    const pb = this.peso[b];
    this.pos[a] = {
      x: (this.pos[a].x * pa + this.pos[b].x * pb) / (pa + pb),
      y: (this.pos[a].y * pa + this.pos[b].y * pb) / (pa + pb),
    };
    this.peso[a] = pa + pb;
    this.padre[b] = a;
    return a;
  }

  dove(i: number): Punto { return this.pos[this.trova(i)]; }
}

export function costruisciGrafo(p: Primitive, tol: Tolleranze): Grafo {
  const segs = fondiDoppioni(p.aste);
  const lette = leggiPallini({ ...p, aste: segs }, tol);
  const punti = new Punti();
  const avvisi: Avviso[] = [];
  const estremi = segs.map((s) => [punti.nuovo(s.a, PESO_ESTREMO), punti.nuovo(s.b, PESO_ESTREMO)]);
  const consumati = new Set<string>();
  const tagli: { seg: number; t: number; punto: number }[] = [];
  const giunti: GiuntoInSospeso[] = [];
  const vincoli: { punto: number; tipo: VincoloGrafo['tipo']; angolo: number }[] = [];
  const appoggiati: number[] = [];
  const corpiUsati = new Set<number>();
  const chiave = (k: number, e: 'a' | 'b'): string => `${k}${e}`;
  const estremo = (k: number, e: 'a' | 'b'): number => estremi[k][e === 'a' ? 0 : 1];
  const tieni = (k: number, e: 'a' | 'b', punto: number): void => {
    punti.unisci(punto, estremo(k, e));
    consumati.add(chiave(k, e));
  };
  const vincola = (corpo: number | null, punto: number): void => {
    if (corpo === null) return;
    const k = p.corpi[corpo];
    const tipo = TIPO_VINCOLO[k.tipo];
    if (!tipo) return;
    corpiUsati.add(corpo);
    vincoli.push({ punto, tipo, angolo: angoloVincolo(k.angolo) });
  };

  // ── corpi interni: la linea si interrompe sul simbolo, da due parti ──
  p.corpi.forEach((k, indice) => {
    const tipo = TIPO_INTERNO[k.tipo];
    if (!tipo) return;
    const vicini: { k: number; e: 'a' | 'b'; d: Punto }[] = [];
    segs.forEach((s, ks) => {
      for (const e of ['a', 'b'] as const) {
        const q = s[e];
        if (distanza(q, k.attacco) < tol.tau + tol.raggioTipico) {
          vicini.push({ k: ks, e, d: { x: q.x - k.attacco.x, y: q.y - k.attacco.y } });
        }
      }
    });
    const opposti = vicini.some((u) => vicini.some((v) => u.d.x * v.d.x + u.d.y * v.d.y < 0));
    corpiUsati.add(indice);
    if (!opposti) {
      avvisi.push({ codice: 'simboloIsolato', messaggio: 'Vincolo interno che non interrompe nessuna asta.' });
      return;
    }
    const centro = punti.nuovo(k.attacco, PESO_SIMBOLO);
    for (const v of vicini) tieni(v.k, v.e, centro);
    giunti.push({ punto: centro, tipo, gruppi: vicini.map((v) => [v.k]) });
  });

  // ── pallini ──
  for (const l of lette) {
    const { c } = p.pallini[l.indice];
    const margine = (k: number): number => tol.tau / Math.max(distanza(segs[k].a, segs[k].b), 1e-9);
    const prosegue = l.passanti.filter((x) => x.t > margine(x.segmento) && x.t < 1 - margine(x.segmento));
    const sfiorano = l.passanti.filter((x) => !prosegue.includes(x));
    const estremoSfiorato = (x: { segmento: number; t: number }): 'a' | 'b' => (x.t < 0.5 ? 'a' : 'b');

    switch (l.esito) {
      case 'cerniera': {
        const centro = punti.nuovo(c, PESO_SIMBOLO);
        for (const e of l.terminano) tieni(e.segmento, e.estremo, centro);
        for (const x of sfiorano) tieni(x.segmento, estremoSfiorato(x), centro);
        giunti.push({
          punto: centro, tipo: 'cerniera',
          gruppi: [...l.terminano.map((e) => [e.segmento]), ...sfiorano.map((x) => [x.segmento])],
        });
        vincola(l.corpo, centro);
        break;
      }
      case 'accanto':
      case 'appoggiato': {
        const contatti = l.passanti.map((x) =>
          proiezione(c, segs[x.segmento].a, segs[x.segmento].b).punto);
        const contatto = punti.nuovo(media(contatti), PESO_SIMBOLO);
        for (const x of prosegue) tagli.push({ seg: x.segmento, t: x.t, punto: contatto });
        for (const x of sfiorano) tieni(x.segmento, estremoSfiorato(x), contatto);
        for (const e of l.terminano) tieni(e.segmento, e.estremo, contatto);
        if (l.esito === 'accanto') {
          giunti.push({
            punto: contatto, tipo: 'cerniera',
            gruppi: [
              [...prosegue.map((x) => x.segmento), ...sfiorano.map((x) => x.segmento)],
              ...l.terminano.map((e) => [e.segmento]),
            ],
          });
        } else if (l.corpo === null) {
          // un pallino su una linea continua, senza niente sotto: non può
          // essere un appoggio, e l'unica lettura sensata è una cerniera
          // disegnata sopra la linea. Si dice, perché non è certa
          giunti.push({ punto: contatto, tipo: 'cerniera', gruppi: [], ognuno: true });
          avvisi.push({
            codice: 'cernieraAmbigua',
            messaggio: 'Pallino senza vincolo su una linea continua: letto come cerniera interna.',
          });
        } else {
          appoggiati.push(contatto);
        }
        vincola(l.corpo, contatto);
        break;
      }
      case 'estremo': {
        let punto: number;
        if (l.terminano.length === 1) {
          punto = punti.nuovo(c, PESO_SIMBOLO);
          tieni(l.terminano[0].segmento, l.terminano[0].estremo, punto);
        } else {
          const x = l.passanti[0];
          punto = estremo(x.segmento, estremoSfiorato(x));
          consumati.add(chiave(x.segmento, estremoSfiorato(x)));
        }
        if (l.corpo === null) {
          avvisi.push({ codice: 'simboloIsolato', messaggio: "Pallino all'estremo libero di un'asta, senza vincolo." });
        }
        vincola(l.corpo, punto);
        break;
      }
      case 'isolato':
        avvisi.push({ codice: 'simboloIsolato', messaggio: 'Pallino che non tocca nessuna asta.' });
        break;
    }
  }

  // ── corpi esterni senza pallino: all'estremo più vicino, altrimenti in campata ──
  p.corpi.forEach((k, indice) => {
    if (corpiUsati.has(indice) || !TIPO_VINCOLO[k.tipo]) return;
    let migliore: number | null = null;
    let dMin = 2 * tol.tau;
    estremi.forEach((coppia) => coppia.forEach((q) => {
      const d = distanza(punti.dove(q), k.attacco);
      if (d < dMin) { dMin = d; migliore = q; }
    }));
    if (migliore === null) {
      let segMin = -1;
      segs.forEach((s, ks) => {
        const d = distanzaSegmento(k.attacco, s.a, s.b);
        if (d < dMin) { dMin = d; segMin = ks; }
      });
      if (segMin >= 0) {
        const pr = proiezione(k.attacco, segs[segMin].a, segs[segMin].b);
        migliore = punti.nuovo(pr.punto, PESO_TAGLIO);
        tagli.push({ seg: segMin, t: pr.t, punto: migliore });
      }
    }
    if (migliore === null) {
      avvisi.push({ codice: 'simboloIsolato', messaggio: 'Vincolo che non tocca nessuna asta.' });
      return;
    }
    vincola(indice, migliore);
  });

  // ── punti vicini sono lo stesso punto (spigoli, incroci, nodi) ──
  const tutti = [...estremi.flat(), ...tagli.map((x) => x.punto)];
  for (let i = 0; i < tutti.length; i++) {
    for (let j = i + 1; j < tutti.length; j++) {
      if (distanza(punti.dove(tutti[i]), punti.dove(tutti[j])) < tol.tau) punti.unisci(tutti[i], tutti[j]);
    }
  }

  // ── incroci a T: un estremo che cade dentro un'altra asta la spezza ──
  segs.forEach((_, k) => {
    for (const e of ['a', 'b'] as const) {
      if (consumati.has(chiave(k, e))) continue;
      const q = punti.dove(estremo(k, e));
      segs.forEach((m, km) => {
        if (km === k) return;
        const pr = proiezione(q, m.a, m.b);
        const marg = tol.tau / Math.max(distanza(m.a, m.b), 1e-9);
        if (pr.distanza >= tol.tau || pr.t <= marg || pr.t >= 1 - marg) return;
        const rad = punti.trova(estremo(k, e));
        const giaSu = tagli.some((x) => x.seg === km && punti.trova(x.punto) === rad);
        if (!giaSu) tagli.push({ seg: km, t: pr.t, punto: rad });
      });
    }
  });

  // ── buchi senza simbolo: due estremi liberi allineati si richiudono ──
  const uso = new Map<number, number>();
  const conta = (q: number): void => { const r = punti.trova(q); uso.set(r, (uso.get(r) ?? 0) + 1); };
  estremi.flat().forEach(conta);
  tagli.forEach((x) => conta(x.punto));
  vincoli.forEach((v) => conta(v.punto));
  const liberi: { k: number; e: 'a' | 'b' }[] = [];
  segs.forEach((_, k) => (['a', 'b'] as const).forEach((e) => {
    if (!consumati.has(chiave(k, e)) && uso.get(punti.trova(estremo(k, e))) === 1) liberi.push({ k, e });
  }));
  for (let i = 0; i < liberi.length; i++) {
    for (let j = i + 1; j < liberi.length; j++) {
      const u = liberi[i];
      const v = liberi[j];
      if (u.k === v.k) continue;
      const qu = punti.dove(estremo(u.k, u.e));
      const qv = punti.dove(estremo(v.k, v.e));
      const gap = distanza(qu, qv);
      if (gap >= 4 * tol.tau) continue;
      const du = uscita(segs[u.k], u.e);
      const dv = uscita(segs[v.k], v.e);
      if (differenzaAngoli(du, dv + Math.PI) > 10 * GRADI) continue;
      if (gap > 1e-9 && differenzaAngoli(angoloDi(qu, qv), du) > 10 * GRADI) continue;
      const ingombro = p.pallini.some((c) => distanzaSegmento(c.c, qu, qv) < c.r + tol.tau)
        || p.corpi.some((k) => distanzaSegmento(k.attacco, qu, qv) < tol.tau + tol.raggioTipico);
      if (!ingombro) punti.unisci(estremo(u.k, u.e), estremo(v.k, v.e));
    }
  }

  return componi(segs, punti, estremi, tagli, giunti, vincoli, appoggiati, avvisi);
}

/**
 * Spezza il tratto nel punto più vicino a `px` e restituisce l'id del punto.
 * Vicino (entro `tau`) a un estremo del tratto, restituisce quello senza
 * spezzare niente. Il pezzo che tocca un giunto resta citato dal giunto.
 */
export function inserisciPunto(g: Grafo, trattoId: string, px: Punto, tau: number): string {
  const tr = g.tratti.find((t) => t.id === trattoId);
  if (!tr) throw new Error(`Tratto ${trattoId} inesistente.`);
  const pi = g.punti.find((x) => x.id === tr.i)!.px;
  const pj = g.punti.find((x) => x.id === tr.j)!.px;
  const pr = proiezione(px, pi, pj);
  const t = Math.min(1, Math.max(0, pr.t));
  const piede = { x: pi.x + t * (pj.x - pi.x), y: pi.y + t * (pj.y - pi.y) };
  if (distanza(piede, pi) < tau) return tr.i;
  if (distanza(piede, pj) < tau) return tr.j;
  const id = nuovoId(g.punti, 'p');
  g.punti.push({ id, px: piede });
  const secondo = nuovoId(g.tratti, 't');
  g.tratti.push({ id: secondo, i: id, j: tr.j });
  for (const giunto of g.giunti) {
    if (giunto.punto !== tr.j) continue;
    giunto.gruppi = giunto.gruppi.map((gr) => gr.map((x) => (x === trattoId ? secondo : x)));
  }
  tr.j = id;
  return id;
}

export function nuovoId(elenco: readonly { id: string }[], prefisso: string): string {
  let massimo = 0;
  for (const { id } of elenco) {
    if (!id.startsWith(prefisso)) continue;
    const n = Number(id.slice(prefisso.length));
    if (Number.isFinite(n) && n > massimo) massimo = n;
  }
  return `${prefisso}${massimo + 1}`;
}

// ──────────────────────────── composizione finale ────────────────────────────

function componi(
  segs: SegmentoAsta[], punti: Punti, estremi: number[][],
  tagli: { seg: number; t: number; punto: number }[], giunti: GiuntoInSospeso[],
  vincoli: { punto: number; tipo: VincoloGrafo['tipo']; angolo: number }[],
  appoggiati: number[], avvisi: Avviso[],
): Grafo {
  const ids = new Map<number, string>();
  const g: Grafo = { punti: [], tratti: [], giunti: [], vincoli: [], carichi: [], quote: [], avvisi };
  const idDi = (q: number): string => {
    const r = punti.trova(q);
    let id = ids.get(r);
    if (!id) {
      id = `p${ids.size + 1}`;
      ids.set(r, id);
      g.punti.push({ id, px: { ...punti.pos[r] } });
    }
    return id;
  };

  const trattiDelSeg: string[][] = segs.map(() => []);
  const coppie = new Set<string>();
  segs.forEach((_, k) => {
    const sequenza = [
      { t: 0, id: idDi(estremi[k][0]) },
      { t: 1, id: idDi(estremi[k][1]) },
      ...tagli.filter((x) => x.seg === k).map((x) => ({ t: x.t, id: idDi(x.punto) })),
    ].sort((a, b) => a.t - b.t);
    const ordinati = sequenza.filter((x, i) => i === 0 || x.id !== sequenza[i - 1].id);
    for (let i = 1; i < ordinati.length; i++) {
      const [a, b] = [ordinati[i - 1].id, ordinati[i].id];
      const chiave = a < b ? `${a}|${b}` : `${b}|${a}`;
      if (coppie.has(chiave)) continue;
      coppie.add(chiave);
      const id = `t${g.tratti.length + 1}`;
      g.tratti.push({ id, i: a, j: b });
      trattiDelSeg[k].push(id);
    }
  });

  const incidenti = (punto: string, k: number): string[] =>
    trattiDelSeg[k].filter((id) => {
      const t = g.tratti.find((x) => x.id === id)!;
      return t.i === punto || t.j === punto;
    });
  for (const gs of giunti) {
    const punto = idDi(gs.punto);
    const gruppi = gs.ognuno
      ? g.tratti.filter((t) => t.i === punto || t.j === punto).map((t) => [t.id])
      : gs.gruppi
        .map((gr) => [...new Set(gr.flatMap((k) => incidenti(punto, k)))])
        .filter((gr) => gr.length > 0);
    if (gruppi.length >= 2) g.giunti.push({ punto, tipo: gs.tipo, gruppi });
  }

  for (const v of vincoli) {
    const punto = idDi(v.punto);
    if (!g.vincoli.some((x) => x.punto === punto)) g.vincoli.push({ punto, tipo: v.tipo, angolo: v.angolo });
  }

  // uno spigolo posato su un pallino: rigido o imperniato non si sa
  for (const q of new Set(appoggiati.map(idDi))) {
    const att = g.tratti.filter((t) => t.i === q || t.j === q);
    if (att.length !== 2) continue;
    const pq = g.punti.find((x) => x.id === q)!.px;
    const verso = (t: { i: string; j: string }): number => {
      const altro = g.punti.find((x) => x.id === (t.i === q ? t.j : t.i))!.px;
      return angoloDi(pq, altro);
    };
    if (differenzaAngoli(verso(att[0]), verso(att[1])) < 170 * GRADI) {
      avvisi.push({
        codice: 'cernieraAmbigua', punti: [q],
        messaggio: 'Spigolo posato su una cerniera: è rigido o imperniato? Letto come rigido.',
      });
    }
  }

  // i punti nati dall'unione che non toccano nessun tratto (simboli isolati) non servono
  const usati = new Set(g.tratti.flatMap((t) => [t.i, t.j]));
  g.punti = g.punti.filter((x) => usati.has(x.id));
  return g;
}

// ──────────────────────────── aiuti ────────────────────────────

/**
 * Segmenti quasi coincidenti — il tratto ripassato a mano, o rilevato due
 * volte — diventano uno solo, esteso all'unione dei due.
 */
function fondiDoppioni(aste: readonly SegmentoAsta[]): SegmentoAsta[] {
  const segs = aste.map((s) => ({ ...s, a: { ...s.a }, b: { ...s.b } }));
  let fuso = true;
  while (fuso) {
    fuso = false;
    for (let i = 0; i < segs.length && !fuso; i++) {
      for (let j = i + 1; j < segs.length && !fuso; j++) {
        const u = segs[i];
        const v = segs[j];
        if (differenzaAngoli(angoloDi(u.a, u.b) * 2, angoloDi(v.a, v.b) * 2) / 2 > 5 * GRADI) continue;
        const pa = proiezione(v.a, u.a, u.b);
        const pb = proiezione(v.b, u.a, u.b);
        const soglia = Math.max(u.spessore, v.spessore) + 2;
        if (pa.distanza > soglia || pb.distanza > soglia) continue;
        const t0 = Math.min(pa.t, pb.t);
        const t1 = Math.max(pa.t, pb.t);
        if (t1 <= 0 || t0 >= 1) continue;
        const lo = Math.min(0, t0);
        const hi = Math.max(1, t1);
        const a = { x: u.a.x + lo * (u.b.x - u.a.x), y: u.a.y + lo * (u.b.y - u.a.y) };
        const b = { x: u.a.x + hi * (u.b.x - u.a.x), y: u.a.y + hi * (u.b.y - u.a.y) };
        segs[i] = { ...u, a, b, confidenza: Math.max(u.confidenza, v.confidenza) };
        segs.splice(j, 1);
        fuso = true;
      }
    }
  }
  return segs;
}

/** Direzione con cui il segmento esce dal suo estremo `e`. */
function uscita(s: SegmentoAsta, e: 'a' | 'b'): number {
  return e === 'a' ? angoloDi(s.b, s.a) : angoloDi(s.a, s.b);
}

function media(ps: readonly Punto[]): Punto {
  return {
    x: ps.reduce((t, p) => t + p.x, 0) / ps.length,
    y: ps.reduce((t, p) => t + p.y, 0) / ps.length,
  };
}

/** Angolo agganciato ai 45° se vicino, al grado intero, riportato in [0, 2π). */
function angoloVincolo(a: number): number {
  const agganciato = agganciaAngolo(a, 45 * GRADI, 10 * GRADI);
  const gradi = Math.round(agganciato / GRADI);
  const normale = ((gradi % 360) + 360) % 360;
  return normale * GRADI;
}

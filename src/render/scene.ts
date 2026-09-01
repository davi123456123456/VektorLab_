/**
 * Disegno della scena su Canvas 2D.
 *
 * PERCHÉ CANVAS E NON SVG — con qualche centinaio di aste, i diagrammi
 * campionati e la deformata animata, l'albero DOM di un SVG diventa decine di
 * migliaia di nodi e il browser passa più tempo in layout che a disegnare. Su
 * canvas il costo è proporzionale a ciò che si vede, e il ridisegno completo a
 * 60 fps resta abbondantemente sotto il millisecondo per modelli di questa
 * scala.
 *
 * Il disegno è STATELESS: riceve modello, camera e stato dell'interfaccia e
 * ridisegna tutto. Niente invalidazione parziale finché non serve davvero.
 */

import type { TipoSconnessione,
  Carico, ElementId, NodeId, Progetto, Vincolo,
} from '../core/model/types.js';
import type { RisultatoAnalisi, RisultatoCinematico } from '../core/model/results.js';
import { type Camera, type Punto, mondoASchermo, vistaMondo } from './camera.js';
import { disegnaGriglia } from './grid.js';
import type { RisultatoSnap } from './snap.js';
import { leggiTema, type Tema } from './tema.js';
import {
  disegnaSconnessione, disegnaSconnessioneNodale, disegnaVincolo,
} from './simboli.js';
import { etichettaSuSfondo } from './frecce.js';
import { calcolaScala, disegnaCarichi } from './carichi.js';
import { disegnaCinematica } from './cinematica.js';
import { disegnaDiagrammi, scalaAutomatica, type Componente } from './diagrammi.js';
import { disegnaDeformata, disegnaReazioni, fattoreAutomatico } from './deformata.js';
import {
  disegnaCorpoLibero, disegnaEsploso, disegnaReazioniVincolari, disegnaRisultanti,
} from './reazioni.js';
import type { ComponenteReazione, ForzaDiSconnessione } from '../core/statica/reazioni.js';
import type { CorpoRigido } from '../core/model/results.js';
import { asteNelNodo } from '../core/model/deduzione.js';
import { gruppiSconnessione } from '../core/model/partizione.js';
import type { Tronco } from '../core/statica/elementino.js';

export interface StatoDisegno {
  progetto: Progetto;
  camera: Camera;
  selezioneNodi: ReadonlySet<NodeId>;
  selezioneAste: ReadonlySet<ElementId>;
  evidenziato: { tipo: 'nodo' | 'asta'; id: string } | null;
  /** aste messe in risalto da un pannello (non selezionate) */
  asteEvidenziate: ReadonlySet<ElementId>;
  snap: RisultatoSnap | null;
  /** anteprima dell'asta in tracciamento */
  anteprimaAsta: { da: Punto; a: Punto } | null;
  /** riquadro di selezione, in coordinate schermo */
  riquadro: { da: Punto; a: Punto } | null;
  /** anteprima della trasformazione in corso: nuove posizioni dei nodi */
  anteprimaNodi: ReadonlyMap<NodeId, Punto> | null;
  /** sigle delle aste */
  mostraNumeri: boolean;
  /** nomi dei nodi */
  mostraEtichetteNodi: boolean;
  /** carichi del caso attualmente visibile */
  carichi: Carico[];
  mostraValoriCarichi: boolean;
  caricoEvidenziato: string | null;
  /** sovrapposizione dell'analisi cinematica; null = non mostrarla */
  cinematica: RisultatoCinematico | null;
  modoMeccanismo: number;
  faseMeccanismo: number;
  /** elementi in secondo piano nella modalità corrente (opacità ridotta) */
  attenuaStruttura: boolean;
  /**
   * Partizione in corpi rigidi da colorare, o lista vuota per non colorare.
   * Un'asta con una sconnessione in campata compare in due segmenti, con due
   * tinte: è lì che il colore spiega qualcosa.
   */
  corpiColorati: { astaId: ElementId; s0: number; s1: number; corpo: number }[];
  /** risalto temporaneo su una riga del conteggio */
  enfasiConteggio: 'corpi' | 'esterni' | 'interni' | null;
  /** rotazione interattiva in corso: ghiera graduata attorno al vincolo */
  rotazioneVincolo: {
    x: number; y: number; angolo: number; agganciato: boolean;
  } | null;
  /** che cosa comparirebbe cliccando il nodo sotto il cursore */
  anteprimaVincolo: {
    nodoId: NodeId;
    /** simbolo da mostrare in trasparenza */
    vincolo?: Vincolo;
    sconnessione?: TipoSconnessione;
    /**
     * Nome esatto di ciò che verrà creato. Il simbolo da solo non basta a
     * distinguere una cerniera a telaio da una cerniera interna quando il
     * cursore le copre entrambe: il nome sì.
     */
    nome?: string;
  } | null;
  /** vincolo o sconnessione lungo un'asta evidenziato dal cursore */
  suAstaEvidenziato: string | null;
  /** vincolo o sconnessione lungo un'asta selezionato */
  suAstaSelezionato: string | null;
  /** sconnessione nodale selezionata nell'elenco */
  sconnessioneNodaleSelezionata: string | null;
  /** anteprima del trascinamento: ascissa provvisoria */
  anteprimaSuAsta: { id: string; s: number } | null;

  // ── risultati ──
  risultato: RisultatoAnalisi | null;
  diagrammiVisibili: ReadonlySet<Componente>;
  scalaDiagrammi: number;
  mostraDeformata: boolean;
  fattoreDeformata: number;
  lambdaDeformata: number;
  mostraReazioni: boolean;
  mostraValoriRisultati: boolean;
  // ── modalità reazioni ──
  /**
   * Componenti di reazione dei vincoli esterni. Non è la risultante per nodo:
   * il carrello deve mostrare una freccia sola e l'incastro tre azioni
   * distinte, e sommarle cancellerebbe la differenza fra i vincoli.
   */
  reazioniVincolari: ComponenteReazione[] | null;
  /** comparsa delle frecce in [0,1] */
  comparsaReazioni: number;
  /**
   * Collasso dei carichi distribuiti nella loro risultante: 0 disegna il
   * carico com'è, 1 solo la risultante. In mezzo si vede la trasformazione,
   * che è ciò che si vuole capire.
   */
  collassoRisultanti: number;
  /** opacità dei simboli di vincolo: scende a 0 quando compaiono le reazioni */
  opacitaVincoli: number;
  /**
   * Opacità del MODELLO — vincoli, carichi, reazioni — sotto i diagrammi.
   * Scende a 0 quando si vogliono leggere le sole curve. Moltiplica le altre
   * opacità invece di sostituirle: due motivi diversi per sfumare la stessa
   * cosa devono comporsi, non sovrascriversi.
   */
  opacitaModello: number;
  /** modello espanso: serve a disegnare corpi e tronchi, che vivono lì */
  modelloDiCalcolo: Progetto | null;
  corpiRigidi: CorpoRigido[];
  /** sconnessione aperta nella vista esplosa */
  esploso: { forza: ForzaDiSconnessione; apertura: number } | null;
  /** corpo libero della sezione interrogata */
  corpoLibero: Tronco | null;
  mostraValoriReazioni: boolean;

  /** avanzamento del tracciamento progressivo dei diagrammi, in [0,1] */
  avanzamentoDiagrammi: number;
  momentoDallaParteDelleFibreTese: boolean;
  /** apparizione per id: 1 = già comparso */
  apparizione: (id: string) => number;
}

/**
 * Entrata in scala con oltrepassamento: il valore supera 1 e ci torna.
 * È la firma percettiva di «qualcosa si è agganciato», e distingue un oggetto
 * appena creato da uno che c'era già.
 */
function rimbalzo(t: number): number {
  const c = 1.70158;
  const u = t - 1;
  return 1 + (c + 1) * u * u * u + c * u * u;
}

/** Colore dedicato a ciascuna caratteristica della sollecitazione. */
function coloreComponente(t: Tema, c: Componente): string {
  return c === 'N' ? t.sforzoNormale : c === 'T' ? t.taglio : t.momento;
}

export function disegnaScena(ctx: CanvasRenderingContext2D, s: StatoDisegno): void {
  const t = leggiTema();
  const { camera } = s;

  ctx.save();
  ctx.fillStyle = t.sfondo;
  ctx.fillRect(0, 0, camera.larghezza, camera.altezza);

  disegnaGriglia(ctx, camera, {
    fine: t.grigliaFine, media: t.grigliaMedia, asse: t.grigliaAsse,
  });

  const posizione = posizioniEffettive(s);

  // §4 — il vincolo SOLIDALE alla deformata sta ancora più sotto di quello
  // di riferimento: il rosso deve restare leggibile per intero, perché è la
  // posizione di partenza rispetto a cui si misura tutto il resto. Se fosse
  // il viola a coprire, si perderebbe proprio il termine di paragone.
  disegnaVincoliSolidali(ctx, s, t);

  // I VINCOLI STANNO SOTTO — la linea dell'asta è continua e passa sopra il
  // simbolo, mai interrotta. Un vincolo che taglia la trave in due è
  // esattamente l'errore che questo ordine di disegno impedisce: appoggiato
  // sotto la trave, il simbolo non toglie nulla alla continuità.
  disegnaVincoli(ctx, s, t, posizione);
  disegnaVincoliSuAsta(ctx, s, t, posizione);

  // Nelle modalità che non riguardano la geometria la struttura sfuma invece
  // di sparire: resta il riferimento visivo, senza competere con ciò che si
  // sta modificando.
  ctx.globalAlpha = s.attenuaStruttura ? 0.42 : 1;
  disegnaAste(ctx, s, t, posizione);
  disegnaCorpiColorati(ctx, s, posizione);
  disegnaNodi(ctx, s, t, posizione);
  ctx.globalAlpha = 1;

  // Le sconnessioni invece stanno SOPRA: interrompono davvero la continuità,
  // e devono vedersi.
  disegnaSconnessioni(ctx, s, t, posizione);
  disegnaAnteprimaVincolo(ctx, s, t, posizione);
  disegnaGhieraRotazione(ctx, s, t);
  if (s.carichi.length > 0 && s.collassoRisultanti < 0.999 && s.opacitaModello > 0.001) {
    // fuori dalla modalità Carichi restano come contesto, non come soggetto:
    // altrimenti competerebbero visivamente con ciò che si sta modificando
    ctx.globalAlpha = (s.mostraValoriCarichi ? 1 : 0.5)
      * (1 - s.collassoRisultanti) * s.opacitaModello;
    disegnaCarichi(ctx, {
      progetto: s.progetto, camera: s.camera, carichi: s.carichi,
      scala: calcolaScala(s.carichi),
      colore: t.carico, sfondo: t.sfondo, testo: t.testo,
      evidenziato: s.caricoEvidenziato,
      mostraValori: s.mostraValoriCarichi,
      apparizione: s.apparizione,
    });
    ctx.globalAlpha = 1;
  }

  if (s.cinematica && s.cinematica.labilita > 0) {
    disegnaCinematica(ctx, {
      progetto: s.progetto, camera: s.camera, cinematica: s.cinematica,
      modo: s.modoMeccanismo, fase: s.faseMeccanismo,
      colori: {
        meccanismo: t.deformata, centro: t.reazione, retta: t.vincolo,
        testo: t.testo, sfondo: t.sfondo,
      },
    });
  }

  if (s.risultato) disegnaRisultati(ctx, s, t);
  disegnaStatica(ctx, s, t);

  if (s.anteprimaAsta) disegnaAnteprimaAsta(ctx, s, t);
  if (s.snap) disegnaSnap(ctx, s, t);
  if (s.riquadro) disegnaRiquadro(ctx, s, t);

  ctx.restore();
}

function disegnaRisultati(
  ctx: CanvasRenderingContext2D, s: StatoDisegno, t: Tema,
): void {
  const r = s.risultato!;

  if (s.mostraDeformata) {
    const fattore = s.fattoreDeformata > 0
      ? s.fattoreDeformata
      : fattoreAutomatico(s.progetto, r);
    disegnaDeformata(ctx, {
      progetto: s.progetto, camera: s.camera, risultato: r,
      fattore, lambda: s.lambdaDeformata,
      colore: t.deformata, coloreIndeformata: t.asta, mostraIndeformata: true,
    });
  }

  // I diagrammi si disegnano DOPO la deformata: sono l'informazione
  // quantitativa, e non devono finire sotto una linea.
  for (const c of ['N', 'T', 'M'] as const) {
    if (!s.diagrammiVisibili.has(c)) continue;
    const scala = scalaAutomatica(s.progetto, r, c) * s.scalaDiagrammi;
    disegnaDiagrammi(ctx, {
      progetto: s.progetto, camera: s.camera, risultato: r,
      componente: c, scala,
      fibreTese: s.momentoDallaParteDelleFibreTese,
      colore: coloreComponente(t, c), sfondo: t.sfondo, testo: t.testo,
      mostraValori: s.mostraValoriRisultati,
      avanzamento: s.avanzamentoDiagrammi,
    });
  }

  if (s.mostraReazioni && s.opacitaModello > 0.001) {
    ctx.globalAlpha = s.opacitaModello;
    disegnaReazioni(ctx, {
      progetto: s.progetto, camera: s.camera, risultato: r,
      colore: t.reazione, sfondo: t.sfondo,
      mostraValori: s.mostraValoriRisultati,
    });
    ctx.globalAlpha = 1;
  }
}

/**
 * Reazioni, esploso delle sconnessioni e corpo libero.
 *
 * Vengono dopo i diagrammi perché in modalità Reazioni sono il soggetto: se
 * finissero sotto la deformata o sotto una campitura del momento l'utente
 * dovrebbe cercarle, e il senso della modalità è che siano l'unica cosa da
 * guardare.
 */
function disegnaStatica(
  ctx: CanvasRenderingContext2D, s: StatoDisegno, t: Tema,
): void {
  const colori = {
    reazione: t.reazione, sfondo: t.sfondo, testo: t.testo,
    testoAttenuato: t.testoAttenuato, asta: t.asta, accento: t.accento,
    carico: t.carico, momento: t.momento, risultante: t.snap,
  };
  if (s.collassoRisultanti > 0.001) {
    disegnaRisultanti(ctx, {
      camera: s.camera, progetto: s.progetto, carichi: s.carichi, colori,
      mostraValori: s.mostraValoriReazioni, collasso: s.collassoRisultanti,
    });
  }
  if (s.reazioniVincolari && s.reazioniVincolari.length > 0) {
    disegnaReazioniVincolari(ctx, {
      camera: s.camera, componenti: s.reazioniVincolari, colori,
      mostraValori: s.mostraValoriReazioni, comparsa: s.comparsaReazioni,
    });
  }
  if (s.esploso && s.modelloDiCalcolo) {
    disegnaEsploso(ctx, {
      camera: s.camera, calcolo: s.modelloDiCalcolo, corpi: s.corpiRigidi,
      forza: s.esploso.forza, colori, apertura: s.esploso.apertura,
      mostraValori: s.mostraValoriReazioni,
    });
  }
  if (s.corpoLibero && s.modelloDiCalcolo) {
    disegnaCorpoLibero(ctx, {
      camera: s.camera, calcolo: s.modelloDiCalcolo, tronco: s.corpoLibero,
      colori, mostraValori: s.mostraValoriReazioni, comparsa: s.comparsaReazioni,
    });
  }
}

function disegnaVincoli(
  ctx: CanvasRenderingContext2D, s: StatoDisegno, t: Tema,
  pos: (id: NodeId) => Punto,
): void {
  if (s.opacitaVincoli * s.opacitaModello <= 0.001) return;
  const enfasi = s.enfasiConteggio === 'esterni';
  const v = vistaMondo(s.camera);
  for (const n of s.progetto.nodi) {
    if (!n.vincolo) continue;
    const p = pos(n.id);
    if (p.x < v.xmin || p.x > v.xmax || p.y < v.ymin || p.y > v.ymax) continue;
    const sp = mondoASchermo(s.camera, p);
    const selezionato = s.selezioneNodi.has(n.id);
    // il simbolo entra in scala con un rimbalzo e "aggancia" il nodo
    const tApp = s.apparizione(`v:${n.id as string}`);
    const scala = (enfasi ? 1.25 : 1) * (tApp >= 1 ? 1 : rimbalzo(tApp))
      // dissolvenza + rimpicciolimento quando il vincolo cede il posto alla
      // sua reazione: il simbolo non sparisce di colpo, si trasforma
      * (0.55 + 0.45 * s.opacitaVincoli);
    ctx.globalAlpha = s.opacitaVincoli * s.opacitaModello;
    disegnaVincolo(
      ctx, sp, n.vincolo,
      selezionato || enfasi ? t.nodoSelezionato : t.vincolo,
      t.sfondo,
      enfasi || (s.evidenziato?.tipo === 'nodo' && s.evidenziato.id === (n.id as string)),
      scala,
    );
    ctx.globalAlpha = 1;
  }
}

/**
 * §4 — VINCOLI SOLIDALI ALLA DEFORMATA.
 *
 * Il simbolo rosso resta dov'è: è il riferimento, la posizione che il vincolo
 * occupa nella struttura indeformata. Quello viola segue il nodo — trasla con
 * lo spostamento e ruota con la rotazione nodale — ed è quello che rende
 * leggibile che cosa il vincolo ha davvero permesso.
 *
 * Il confronto fra i due è tutto il punto. Su un incastro i due simboli
 * restano sovrapposti, e si vede che non ha ceduto niente. Su un carrello il
 * viola scorre lungo il piano di scorrimento e resta parallelo al rosso: la
 * traslazione c'è, la rotazione del simbolo no. Su una cerniera il viola
 * ruota restando nello stesso punto. Il vincolo smette di essere un disegno
 * convenzionale e diventa la descrizione di un movimento.
 *
 * Un vincolo che si spostasse in una direzione che impedisce sarebbe un
 * errore visibile a occhio: è anche un controllo.
 */
function disegnaVincoliSolidali(
  ctx: CanvasRenderingContext2D, s: StatoDisegno, t: Tema,
): void {
  const r = s.risultato;
  if (!r || !s.mostraDeformata || s.opacitaModello <= 0.001) return;
  const fattore = s.fattoreDeformata > 0
    ? s.fattoreDeformata
    : fattoreAutomatico(s.progetto, r);
  const f = fattore * s.lambdaDeformata;
  if (Math.abs(f) < 1e-12) return;

  ctx.globalAlpha = 0.75 * s.opacitaModello;
  for (let k = 0; k < s.progetto.nodi.length; k++) {
    const n = s.progetto.nodi[k];
    if (!n.vincolo) continue;
    const ux = r.spostamenti[3 * k];
    const uy = r.spostamenti[3 * k + 1];
    const rz = r.spostamenti[3 * k + 2];
    const sp = mondoASchermo(s.camera, { x: n.x + f * ux, y: n.y + f * uy });
    // lo schermo ha la y rivolta in giù: una rotazione antioraria nel mondo
    // è oraria sullo schermo, e amplificarla con lo stesso fattore delle
    // traslazioni è ciò che tiene il simbolo attaccato all'asta deformata
    disegnaVincolo(ctx, sp, n.vincolo, t.deformata, t.sfondo, false, 1, -f * rz);
  }
  ctx.globalAlpha = 1;
}

/**
 * Tinte dei corpi rigidi.
 *
 * Sono scelte a distanza costante sulla ruota dei colori, così restano
 * distinguibili anche quando i corpi sono molti; il primo è verde perché la
 * struttura più comune ha un corpo solo e il verde non allarma.
 */
const TINTE_CORPI = [
  '#35c46a', '#4a9eff', '#ff8a3d', '#b57cff', '#ffd23f', '#00d9c0',
  '#ff5f9e', '#8bd450', '#ff7a6b', '#6ec6ff',
];

export const tintaCorpo = (i: number): string => TINTE_CORPI[i % TINTE_CORPI.length];

/** Ripassa ogni tratto d'asta con la tinta del corpo a cui appartiene. */
function disegnaCorpiColorati(
  ctx: CanvasRenderingContext2D, s: StatoDisegno, pos: (id: NodeId) => Punto,
): void {
  if (s.corpiColorati.length === 0) return;
  ctx.save();
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.globalAlpha = 0.85;
  for (const seg of s.corpiColorati) {
    const a = s.progetto.aste.find((x) => x.id === seg.astaId);
    if (!a) continue;
    const pi = pos(a.nodoIniziale), pj = pos(a.nodoFinale);
    const q = (u: number) => mondoASchermo(s.camera, {
      x: pi.x + (pj.x - pi.x) * u, y: pi.y + (pj.y - pi.y) * u,
    });
    const p1 = q(seg.s0), p2 = q(seg.s1);
    ctx.strokeStyle = tintaCorpo(seg.corpo);
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Ghiera graduata durante la rotazione di un vincolo.
 *
 * Mostra dove punta adesso e a quali angoli si aggancia: senza, ruotare
 * sarebbe un gesto al buio, con il risultato leggibile solo dopo il rilascio.
 */
function disegnaGhieraRotazione(
  ctx: CanvasRenderingContext2D, s: StatoDisegno, t: Tema,
): void {
  const r = s.rotazioneVincolo;
  if (!r) return;
  const c = mondoASchermo(s.camera, { x: r.x, y: r.y });
  const raggio = 52;

  ctx.save();
  ctx.strokeStyle = t.testoAttenuato;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(c.x, c.y, raggio, 0, Math.PI * 2);
  ctx.stroke();

  // tacche ogni 15°, più marcate sui multipli di 45°
  for (let g = 0; g < 360; g += 15) {
    const a = (g * Math.PI) / 180;
    const lunga = g % 45 === 0;
    const ux = -Math.sin(a), uy = -Math.cos(a);          // schermo: y rovesciata
    ctx.strokeStyle = lunga ? t.testoAttenuato : t.grigliaMedia;
    ctx.lineWidth = lunga ? 1.4 : 1;
    ctx.beginPath();
    ctx.moveTo(c.x + ux * (raggio - (lunga ? 8 : 4)), c.y + uy * (raggio - (lunga ? 8 : 4)));
    ctx.lineTo(c.x + ux * raggio, c.y + uy * raggio);
    ctx.stroke();
  }

  // il raggio corrente: è la direzione di puntamento del vincolo
  const ux = -Math.sin(r.angolo), uy = -Math.cos(r.angolo);
  ctx.strokeStyle = t.vincolo;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(c.x, c.y);
  ctx.lineTo(c.x + ux * raggio, c.y + uy * raggio);
  ctx.stroke();

  const gradi = Math.round((r.angolo * 180) / Math.PI) % 360;
  etichettaSuSfondo(
    ctx, `angolo = ${gradi}°${r.agganciato ? '' : '  (libero)'}`,
    c.x + ux * (raggio + 8), c.y + uy * (raggio + 8),
    t.vincolo, t.sfondo, true,
  );
  ctx.restore();
}

/**
 * Anteprima di ciò che comparirebbe cliccando.
 *
 * Trasparente e senza etichette: dice «questo», non «questo è definitivo». È
 * l'unico momento in cui la differenza fra cerniera esterna e interna si può
 * ancora correggere senza annullare nulla.
 */
function disegnaAnteprimaVincolo(
  ctx: CanvasRenderingContext2D, s: StatoDisegno, t: Tema,
  pos: (id: NodeId) => Punto,
): void {
  const a = s.anteprimaVincolo;
  if (!a) return;
  const n = s.progetto.nodi.find((x) => x.id === a.nodoId);
  if (!n) return;
  const sp = mondoASchermo(s.camera, pos(n.id));
  ctx.save();
  ctx.globalAlpha = 0.45;
  if (a.sconnessione) {
    disegnaSconnessioneNodale(ctx, sp, a.sconnessione, t.evidenziato, t.sfondo, true);
  } else if (a.vincolo) {
    disegnaVincolo(ctx, sp, a.vincolo, t.evidenziato, t.sfondo, true, 1);
  }
  ctx.restore();

  // l'etichetta sta a piena opacità: è l'unica cosa che dice senza ambiguità
  // quale delle due varianti si sta per creare
  if (a.nome) {
    etichettaSuSfondo(ctx, a.nome, sp.x + 14, sp.y - 12, t.evidenziato, t.sfondo);
  }
}

/** Punto e inclinazione di un'ascissa relativa lungo un'asta. */
function puntoSuAsta(
  s: StatoDisegno, pos: (id: NodeId) => Punto, astaId: ElementId, sRel: number,
): { p: Punto; angolo: number } | null {
  const a = s.progetto.aste.find((x) => x.id === astaId);
  if (!a) return null;
  const pi = pos(a.nodoIniziale), pj = pos(a.nodoFinale);
  return {
    p: { x: pi.x + (pj.x - pi.x) * sRel, y: pi.y + (pj.y - pi.y) * sRel },
    angolo: Math.atan2(pj.y - pi.y, pj.x - pi.x),
  };
}

/** Ascissa da disegnare: quella dell'anteprima se l'oggetto è in trascinamento. */
function ascissaDisegnata(s: StatoDisegno, id: string, valore: number): number {
  return s.anteprimaSuAsta && s.anteprimaSuAsta.id === id ? s.anteprimaSuAsta.s : valore;
}

/**
 * Vincoli esterni posati LUNGO un'asta.
 *
 * Si disegnano con lo stesso simbolo di quelli nodali — perché sono la stessa
 * cosa, solo in un altro punto — e come quelli passano SOTTO la trave, che
 * resta continua: un appoggio in campata non spezza niente.
 */
function disegnaVincoliSuAsta(
  ctx: CanvasRenderingContext2D, s: StatoDisegno, t: Tema,
  pos: (id: NodeId) => Punto,
): void {
  if (s.opacitaVincoli * s.opacitaModello <= 0.001) return;
  ctx.globalAlpha = s.opacitaVincoli * s.opacitaModello;
  for (const v of s.progetto.vincoliSuAsta ?? []) {
    const q = puntoSuAsta(s, pos, v.astaId, ascissaDisegnata(s, v.id, v.s));
    if (!q) continue;
    const sp = mondoASchermo(s.camera, q.p);
    const evidenziato = s.suAstaEvidenziato === v.id || s.suAstaSelezionato === v.id;
    disegnaVincolo(
      ctx, sp, v.vincolo,
      s.suAstaSelezionato === v.id ? t.nodoSelezionato : t.vincolo,
      t.sfondo, evidenziato,
    );
  }
  ctx.globalAlpha = 1;
}

/**
 * Sconnessioni interne: quelle poste lungo un'asta e quelle poste su un nodo.
 *
 * Restano visibili ANCHE in modalità Reazioni: la cerniera interna non è un
 * vincolo esterno da sostituire con la sua reazione, ed è il punto su cui
 * cliccare per aprire la vista esplosa.
 */
function disegnaSconnessioni(
  ctx: CanvasRenderingContext2D, s: StatoDisegno, t: Tema,
  pos: (id: NodeId) => Punto,
): void {
  for (const c of s.progetto.sconnessioni ?? []) {
    const q = puntoSuAsta(s, pos, c.astaId, ascissaDisegnata(s, c.id, c.s));
    if (!q) continue;
    const sp = mondoASchermo(s.camera, q.p);
    const evidenziato = s.suAstaEvidenziato === c.id || s.suAstaSelezionato === c.id;
    disegnaSconnessione(
      ctx, sp, c.tipo, -(c.angolo ?? q.angolo),
      s.suAstaSelezionato === c.id ? t.nodoSelezionato : t.vincolo,
      t.sfondo, evidenziato,
    );
  }

  const enfasiInterne = s.enfasiConteggio === 'interni';
  for (const v of s.progetto.vincoliInterni ?? []) {
    if (v.tipo === 'biella') continue;
    const n = s.progetto.nodi.find((x) => x.id === v.nodoId);
    if (!n) continue;
    const sp = mondoASchermo(s.camera, pos(n.id));
    const tApp = s.apparizione(`vi:${v.id}`);

    /*
     * §3.2 — la cerniera PARZIALE si sposta verso l'asta imperniata.
     *
     * Completa e parziale producono strutture diverse e vanno distinte a
     * colpo d'occhio, non aprendo un pannello. Disegnate entrambe centrate
     * sul nodo sarebbero identiche. Spostando il perno verso l'asta che
     * svincola si legge subito quale gira e quali proseguono saldate: è la
     * stessa convenzione dei disegni a mano.
     */
    const convergenti = asteNelNodo(s.progetto, v.nodoId);
    const gruppi = gruppiSconnessione(v, convergenti);
    let offset = { x: 0, y: 0 };
    if (gruppi.length === 2 && convergenti.length >= 3) {
      const soli = gruppi.find((g) => g.length === 1);
      const altra = soli?.[0];
      const asta = altra ? s.progetto.aste.find((a) => a.id === altra) : undefined;
      if (asta) {
        const altroNodo = asta.nodoIniziale === v.nodoId ? asta.nodoFinale : asta.nodoIniziale;
        const q = mondoASchermo(s.camera, pos(altroNodo));
        const d = Math.hypot(q.x - sp.x, q.y - sp.y) || 1;
        offset = { x: ((q.x - sp.x) / d) * 9, y: ((q.y - sp.y) / d) * 9 };
      }
    }

    disegnaSconnessioneNodale(
      ctx, { x: sp.x + offset.x, y: sp.y + offset.y },
      v.tipo, enfasiInterne ? t.nodoSelezionato : t.vincolo, t.sfondo,
      enfasiInterne || s.suAstaEvidenziato === v.id || s.suAstaSelezionato === v.id
        || s.sconnessioneNodaleSelezionata === v.id,
      (enfasiInterne ? 1.35 : 1) * (tApp >= 1 ? 1 : rimbalzo(tApp)),
    );
  }
}

/** Posizione da usare per ogni nodo: quella dell'anteprima se in trasformazione. */
function posizioniEffettive(s: StatoDisegno): (id: NodeId) => Punto {
  const base = new Map<NodeId, Punto>();
  for (const n of s.progetto.nodi) base.set(n.id, { x: n.x, y: n.y });
  if (s.anteprimaNodi) {
    for (const [id, p] of s.anteprimaNodi) base.set(id, p);
  }
  return (id) => base.get(id) ?? { x: 0, y: 0 };
}

function disegnaAste(
  ctx: CanvasRenderingContext2D, s: StatoDisegno, t: Tema,
  pos: (id: NodeId) => Punto,
): void {
  const v = vistaMondo(s.camera);
  const margine = 2;

  for (const a of s.progetto.aste) {
    const pi = pos(a.nodoIniziale);
    const pj = pos(a.nodoFinale);
    // culling: salta le aste completamente fuori vista
    if (Math.max(pi.x, pj.x) < v.xmin - margine || Math.min(pi.x, pj.x) > v.xmax + margine) continue;
    if (Math.max(pi.y, pj.y) < v.ymin - margine || Math.min(pi.y, pj.y) > v.ymax + margine) continue;

    const si = mondoASchermo(s.camera, pi);
    // un'asta che compare si disegna dal nodo iniziale verso quello finale:
    // è il gesto con cui l'utente l'ha tracciata, ripetuto
    const avanzamento = s.apparizione(a.id as string);
    const sjPieno = mondoASchermo(s.camera, pj);
    const sj = avanzamento >= 1 ? sjPieno : {
      x: si.x + (sjPieno.x - si.x) * avanzamento,
      y: si.y + (sjPieno.y - si.y) * avanzamento,
    };
    const selezionata = s.selezioneAste.has(a.id);
    const evidenziata = s.evidenziato?.tipo === 'asta' && s.evidenziato.id === (a.id as string);
    const daPannello = s.asteEvidenziate.has(a.id);

    // risalto chiesto da un pannello: alone tenue, senza toccare la selezione
    if (daPannello && !selezionata) {
      ctx.strokeStyle = t.accento;
      ctx.globalAlpha = 0.3;
      ctx.lineWidth = 9;
      ctx.beginPath(); ctx.moveTo(si.x, si.y); ctx.lineTo(sj.x, sj.y); ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // alone di selezione: l'informazione non è affidata al solo colore
    if (selezionata) {
      ctx.strokeStyle = t.astaSelezionata;
      ctx.globalAlpha = 0.25;
      ctx.lineWidth = 9;
      ctx.beginPath(); ctx.moveTo(si.x, si.y); ctx.lineTo(sj.x, sj.y); ctx.stroke();
      ctx.globalAlpha = 1;
    }

    ctx.strokeStyle = selezionata ? t.astaSelezionata : evidenziata ? t.evidenziato : t.asta;
    ctx.lineWidth = selezionata ? 3 : evidenziata ? 3 : 2.2;
    ctx.lineCap = 'round';
    // Un'asta con sezione o materiale SPECIFICO si tratteggia: si vede subito
    // che non segue il predefinito, che è l'informazione che altrimenti si
    // scopre solo aprendo il pannello e selezionandola.
    const specifica = a.sezioneSpecifica || a.materialeSpecifico;
    if (specifica) ctx.setLineDash([9, 4]);
    ctx.beginPath(); ctx.moveTo(si.x, si.y); ctx.lineTo(sj.x, sj.y); ctx.stroke();
    ctx.setLineDash([]);

    // tacche di svincolo: cerchietto vuoto all'estremità incernierata
    if (a.svincolo.iniziale.M) disegnaCerniera(ctx, si, sj, t);
    if (a.svincolo.finale.M) disegnaCerniera(ctx, sj, si, t);

    // L'etichetta si scrive solo se l'asta è abbastanza lunga a schermo da
    // contenerla: su una capriata fitta, decine di sigle sovrapposte sono
    // meno leggibili di nessuna sigla.
    const lunghezzaSchermo = Math.hypot(sj.x - si.x, sj.y - si.y);
    if (s.mostraNumeri && lunghezzaSchermo > 70) {
      const c = { x: (si.x + sj.x) / 2, y: (si.y + sj.y) / 2 };
      etichetta(ctx, String(a.id), c.x - 8, c.y, t.testoAttenuato, t.sfondo);
    }
  }
}

/** Il cerchietto va disegnato SPOSTATO verso l'interno dell'asta, non sul nodo:
 *  altrimenti con più aste incernierate sullo stesso nodo si sovrappongono. */
function disegnaCerniera(
  ctx: CanvasRenderingContext2D, estremo: Punto, altro: Punto, t: Tema,
): void {
  const dx = altro.x - estremo.x, dy = altro.y - estremo.y;
  const L = Math.hypot(dx, dy);
  if (L < 22) return;
  const d = 9;
  const c = { x: estremo.x + (dx / L) * d, y: estremo.y + (dy / L) * d };
  ctx.beginPath();
  ctx.arc(c.x, c.y, 3.6, 0, Math.PI * 2);
  ctx.fillStyle = t.sfondo;
  ctx.fill();
  ctx.strokeStyle = t.asta;
  ctx.lineWidth = 1.6;
  ctx.stroke();
}

function disegnaNodi(
  ctx: CanvasRenderingContext2D, s: StatoDisegno, t: Tema,
  pos: (id: NodeId) => Punto,
): void {
  const v = vistaMondo(s.camera);
  for (const n of s.progetto.nodi) {
    const p = pos(n.id);
    if (p.x < v.xmin || p.x > v.xmax || p.y < v.ymin || p.y > v.ymax) continue;
    const sp = mondoASchermo(s.camera, p);
    const selezionato = s.selezioneNodi.has(n.id);
    const evidenziato = s.evidenziato?.tipo === 'nodo' && s.evidenziato.id === (n.id as string);

    if (selezionato) {
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, 8, 0, Math.PI * 2);
      ctx.fillStyle = t.nodoSelezionato;
      ctx.globalAlpha = 0.25;
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // pulsazione alla comparsa: il nodo si annuncia e poi si acquieta
    const tApp = s.apparizione(n.id as string);
    const pulsazione = tApp < 1 ? 1 + 1.8 * Math.sin(Math.PI * tApp) : 1;
    ctx.beginPath();
    ctx.arc(sp.x, sp.y, (evidenziato ? 5 : 4) * pulsazione, 0, Math.PI * 2);
    ctx.fillStyle = selezionato ? t.nodoSelezionato : evidenziato ? t.evidenziato : t.nodo;
    ctx.fill();
    ctx.strokeStyle = t.sfondo;
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // Le etichette dei nodi compaiono solo da vicino, e comunque solo su nodi
    // selezionati o notevoli quando il modello è fitto.
    if (s.mostraEtichetteNodi) {
      etichetta(ctx, n.etichetta ?? String(n.id), sp.x + 8, sp.y - 9, t.accento, t.sfondo);
    }
  }
}

function disegnaAnteprimaAsta(ctx: CanvasRenderingContext2D, s: StatoDisegno, t: Tema): void {
  const { da, a } = s.anteprimaAsta!;
  const p1 = mondoASchermo(s.camera, da);
  const p2 = mondoASchermo(s.camera, a);
  ctx.save();
  ctx.strokeStyle = t.accento;
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);
  ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
  ctx.setLineDash([]);

  // quota della lunghezza e dell'inclinazione: l'utente deve poter disegnare
  // "a 3 metri e 30 gradi" leggendo, non indovinando
  const L = Math.hypot(a.x - da.x, a.y - da.y);
  const ang = (Math.atan2(a.y - da.y, a.x - da.x) * 180) / Math.PI;
  if (L > 1e-9) {
    etichetta(
      ctx, `${L.toFixed(3)} m   ${ang.toFixed(1)}°`,
      (p1.x + p2.x) / 2, (p1.y + p2.y) / 2 - 14, t.accento, t.sfondo,
    );
  }
  ctx.restore();
}

function disegnaSnap(ctx: CanvasRenderingContext2D, s: StatoDisegno, t: Tema): void {
  const snap = s.snap!;
  if (snap.tipo === 'nessuno') return;
  const p = mondoASchermo(s.camera, snap.punto);

  ctx.save();
  ctx.strokeStyle = t.snap;
  ctx.fillStyle = t.snap;
  ctx.lineWidth = 1.5;

  if (snap.guide) {
    ctx.setLineDash([3, 3]);
    ctx.globalAlpha = 0.55;
    for (const g of snap.guide) {
      const a = mondoASchermo(s.camera, g.da);
      const b = mondoASchermo(s.camera, g.a);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.setLineDash([]);
  }

  // ogni tipo di aggancio ha una FORMA diversa, non solo un colore diverso:
  // il simbolo dice all'utente perché il punto è stato scelto
  const r = 6;
  ctx.beginPath();
  switch (snap.tipo) {
    case 'nodo':          // quadrato
      ctx.rect(p.x - r, p.y - r, 2 * r, 2 * r);
      break;
    case 'puntoMedio':    // triangolo
      ctx.moveTo(p.x, p.y - r); ctx.lineTo(p.x + r, p.y + r); ctx.lineTo(p.x - r, p.y + r);
      ctx.closePath();
      break;
    case 'intersezione':  // croce obliqua
      ctx.moveTo(p.x - r, p.y - r); ctx.lineTo(p.x + r, p.y + r);
      ctx.moveTo(p.x + r, p.y - r); ctx.lineTo(p.x - r, p.y + r);
      break;
    case 'ortogonale':    // rombo
      ctx.moveTo(p.x, p.y - r); ctx.lineTo(p.x + r, p.y);
      ctx.lineTo(p.x, p.y + r); ctx.lineTo(p.x - r, p.y);
      ctx.closePath();
      break;
    default:              // griglia: cerchietto
      ctx.arc(p.x, p.y, r * 0.6, 0, Math.PI * 2);
  }
  ctx.stroke();

  etichetta(ctx, snap.etichetta, p.x + 12, p.y + 16, t.snap, t.sfondo);
  ctx.restore();
}

function disegnaRiquadro(ctx: CanvasRenderingContext2D, s: StatoDisegno, t: Tema): void {
  const { da, a } = s.riquadro!;
  ctx.save();
  ctx.strokeStyle = t.accento;
  ctx.fillStyle = t.accento;
  ctx.globalAlpha = 0.12;
  ctx.fillRect(da.x, da.y, a.x - da.x, a.y - da.y);
  ctx.globalAlpha = 1;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 3]);
  ctx.strokeRect(da.x, da.y, a.x - da.x, a.y - da.y);
  ctx.restore();
}

function etichetta(
  ctx: CanvasRenderingContext2D, testo: string,
  x: number, y: number, colore: string, sfondo: string,
): void {
  ctx.save();
  ctx.font = '11px ui-monospace, SF Mono, Menlo, monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const w = ctx.measureText(testo).width;
  ctx.fillStyle = sfondo;
  ctx.globalAlpha = 0.85;
  ctx.fillRect(x - 3, y - 8, w + 6, 16);
  ctx.globalAlpha = 1;
  ctx.fillStyle = colore;
  ctx.fillText(testo, x, y);
  ctx.restore();
}

/**
 * §3 e §4.3 — LA RELAZIONE: composizione del documento.
 *
 * Qui si decide che cosa va su quale pagina. La regola è quella del §3: un
 * blocco non si spezza fra due pagine se può stare intero, e i blocchi grandi
 * — i quattro diagrammi, la sezione — hanno la loro pagina.
 *
 * Nessun numero viene calcolato in questo file. Tutto arriva già pronto da
 * `core/`, e questo modulo lo dispone: se un valore del PDF non coincide con
 * quello a schermo, la causa sta nella lettura, non in un calcolo diverso.
 */

import { DocumentoPdf, misurePagina } from './pdf.js';
import { type ContenutiScelti } from './contenuti.js';
export { CONTENUTI_PREDEFINITI, type ContenutiScelti } from './contenuti.js';
import { ContestoPdf } from './contesto.js';
import { paletteDocumento, type PaletteDocumento } from './palette.js';
import { titoloBlocco, riga, paragrafo, type Riquadro } from './disegno.js';
import { disegnaSchema, altezzaSchema, TINTE_CORPI } from './blocchi/schema.js';
import {
  disegnaDiagramma, disegnaAsta, fattoreDeformata, altezzaDiagramma,
  componenteNulla, NOME_COMPONENTE, type Componente,
} from './blocchi/diagrammi.js';
import {
  bloccoDati, bloccoCinematica, tabellaReazioni, bloccoCoefficiente,
  bloccoDiagnostica, type Comune, type Contesto,
} from './blocchi/tabelle.js';
import { disegnaSezione } from '../render/sezioneDisegno.js';
import { proprietaDa } from '../core/materials/sezioniParametriche.js';
import type { RisultatoAnalisi, RisultatoCinematico } from '../core/model/results.js';
import type { EsitoCoefficiente } from '../core/checks/coefficiente.js';
import type { EsitoVerifiche } from '../core/checks/index.js';
import type { EsitoAutoverifiche } from '../core/statica/autoverifiche.js';
import type { ComponenteReazione } from '../core/statica/reazioni.js';
import type { Carico, Progetto } from '../core/model/types.js';
import { latiDelCalcolo, vistaDallaTratteggiata } from '../core/model/tratteggiata.js';
import type { Etichette } from '../state/etichette.js';
import { disegnaLogo, LARGHEZZA_LOGO } from './logo.js';

// ═══════════════════════ INGRESSO ═══════════════════════

export interface DatiRelazione {
  titolo: string;
  autore: string;
  data: string;

  progetto: Progetto;
  /** modello di calcolo: quello a cui i risultati appartengono */
  modelloRisultati: Progetto;
  carichi: Carico[];
  etichette: Etichette;

  risultato: RisultatoAnalisi;
  cinematica: RisultatoCinematico | null;
  coefficiente: EsitoCoefficiente | null;
  /** le verifiche per asta: da qui viene la distribuzione di σ e τ */
  verifiche: EsitoVerifiche | null;
  autoverifiche: EsitoAutoverifiche | null;
  componentiReazione: ComponenteReazione[];

  contenuti: ContenutiScelti;
  /** i byte dei due font, già caricati da chi chiama */
  font: { regolare: Uint8Array; grassetto: Uint8Array };
  /** avanzamento, per non lasciare l'interfaccia muta */
  avanzamento?: (frazione: number, cosa: string) => void;
}

// ═══════════════════════ COMPOSIZIONE ═══════════════════════

const MARGINE = { sopra: 52, sotto: 46, lato: 42 };

export async function componiRelazione(d: DatiRelazione): Promise<Uint8Array> {
  const p = paletteDocumento();
  const { larghezza: W, altezza: H } = misurePagina(d.contenuti.orientamento);
  const X = MARGINE.lato;
  const LARG = W - 2 * MARGINE.lato;
  const LIMITE = H - MARGINE.sotto;

  const doc = new DocumentoPdf({
    titolo: d.titolo, autore: d.autore,
    soggetto: 'Relazione di calcolo strutturale — VektorLab',
  });
  const regolare = doc.incorporaFont(d.font.regolare);
  const grassetto = doc.incorporaFont(d.font.grassetto);

  /** Le pagine composte, chiuse tutte insieme alla fine per numerarle. */
  const pagine: ContestoPdf[] = [];
  const nuovaPagina = (): ContestoPdf => {
    const c = new ContestoPdf(W, H, regolare, grassetto);
    pagine.push(c);
    return c;
  };

  const passo = async (frazione: number, cosa: string) => {
    d.avanzamento?.(frazione, cosa);
    // restituisce il controllo al browser: senza, la barra di avanzamento
    // resterebbe ferma e l'interfaccia bloccata fino alla fine
    await new Promise((r) => setTimeout(r, 0));
  };

  let c = nuovaPagina();
  let y = MARGINE.sopra;

  const acapo = (): Contesto => {
    c = nuovaPagina();
    y = MARGINE.sopra;
    return { c, y };
  };
  /** Va a pagina nuova se lo spazio rimasto non basta al blocco. */
  const spazio = (serve: number) => {
    if (y + serve > LIMITE) acapo();
  };

  /**
   * Altezza da dare a un disegno, tenendo conto della pagina.
   *
   * Un telaio alto in A4 orizzontale chiede più spazio di quanto una pagina ne
   * abbia: chiederlo comunque faceva saltare il blocco alla pagina dopo e
   * lasciava la prima con la sola intestazione. Se la pagina corrente non
   * basta si volta, e poi si prende il minimo fra ciò che il disegno vorrebbe
   * e ciò che la pagina può dare.
   */
  const altezzaDisegno = (voluta: number, contorno: number): number => {
    const disponibile = () => LIMITE - y - contorno;
    if (disponibile() < Math.min(voluta, 150)) acapo();
    return Math.max(90, Math.min(voluta, disponibile()));
  };

  /*
   * T e M si scrivono rispetto alla tratteggiata, come sullo schermo: i
   * diagrammi per asta, le espressioni e la sezione critica leggono la
   * vista; i diagrammi sulla struttura la ricavano da sé dal risultato del
   * motore, che resta quello su cui lavorano le verifiche.
   */
  const lati = latiDelCalcolo(d.progetto, d.modelloRisultati);
  const vista = vistaDallaTratteggiata(d.risultato, lati);

  const com: Comune = {
    palette: p, etichette: d.etichette, x: X, larghezza: LARG,
    limite: LIMITE,
    nuovaPagina: () => acapo(),
    lati,
  };
  const aggiorna = (r: Contesto) => { c = r.c; y = r.y; };

  // ═══ intestazione ═══
  y = intestazione(c, p, d, X, y, LARG);
  await passo(0.05, 'intestazione');

  let numero = 0;
  const titolo = (testo: string, serve = 90) => {
    numero++;
    spazio(serve);
    y = titoloBlocco(c, p, String(numero), testo, X, y + 12, LARG);
  };

  // ═══ 1. schema strutturale ═══
  if (d.contenuti.schema) {
    numero++;
    let h = altezzaDisegno(altezzaSchema(d.progetto, LARG), 70);
    y = titoloBlocco(c, p, String(numero), 'Schema strutturale', X, y + 12, LARG);
    h = Math.min(h, LIMITE - y - 34);
    disegnaSchema(c, {
      progetto: d.progetto, carichi: d.carichi, etichette: d.etichette,
      palette: p, riquadro: { x: X, y: y + 4, w: LARG, h },
    });
    y += h + 8;
    y = didascalia(c, p,
      'Aste, vincoli e carichi come nel modello. La linea tratteggiata accanto '
      + 'a ciascuna asta è la fibra di riferimento.', X, y, LARG);
    await passo(0.15, 'schema strutturale');
  }

  // ═══ 2. dati del modello ═══
  if (d.contenuti.dati) {
    titolo('Dati del modello', 120);
    aggiorna(bloccoDati({ c, y }, com, d.progetto, d.carichi));
    await passo(0.3, 'dati del modello');
  }

  // ═══ 3. classificazione cinematica ═══
  if (d.contenuti.cinematica && d.cinematica) {
    titolo('Classificazione cinematica', 170);
    aggiorna(bloccoCinematica({ c, y }, com, d.cinematica));

    // §3.3 — con più corpi rigidi, il disegno che li distingue
    if (d.cinematica.numeroCorpi > 1) {
      const h = altezzaDisegno(altezzaSchema(d.progetto, LARG, { massimo: 240 }), 30);
      disegnaSchema(c, {
        progetto: d.progetto, carichi: [], etichette: d.etichette,
        palette: p, riquadro: { x: X, y: y + 6, w: LARG, h },
        conCarichi: false, conQuote: false,
        corpi: d.cinematica.corpi,
      });
      y += h + 10;
      // la legenda dice quale colore è quale corpo: senza, i colori sono
      // decorazione invece che informazione
      const legenda = d.cinematica.corpi
        .map((_, k) => `corpo ${k + 1}`)
        .slice(0, TINTE_CORPI.length);
      c.dimensione = 7.2;
      c.base = 'middle';
      let lx = X;
      legenda.forEach((testo, k) => {
        c.strokeStyle = TINTE_CORPI[k % TINTE_CORPI.length];
        c.lineWidth = 2.4;
        c.setLineDash([]);
        c.beginPath();
        c.moveTo(lx, y + 4); c.lineTo(lx + 12, y + 4);
        c.stroke();
        c.fillStyle = p.testoAttenuato;
        c.allineamento = 'left';
        c.fillText(testo, lx + 16, y + 4);
        lx += 16 + c.misura(testo, 7.2) + 14;
      });
      y += 12;
      y = didascalia(c, p,
        `La struttura si compone di ${d.cinematica.numeroCorpi} corpi rigidi, `
        + 'colorati distintamente.', X, y, LARG);
    }
    await passo(0.4, 'classificazione cinematica');
  }

  // ═══ 4. reazioni vincolari ═══
  if (d.contenuti.reazioni) {
    numero++;
    let h = altezzaDisegno(altezzaSchema(d.progetto, LARG, { massimo: 300 }), 90);
    y = titoloBlocco(c, p, String(numero), 'Reazioni vincolari', X, y + 12, LARG);
    h = Math.min(h, LIMITE - y - 40);
    disegnaReazioni(c, p, d, { x: X, y: y + 4, w: LARG, h });
    y += h + 8;
    y = didascalia(c, p,
      'I simboli dei vincoli sono sostituiti dalle reazioni: verso reale e '
      + 'modulo. In verde le risultanti dei carichi.', X, y, LARG);
    aggiorna(tabellaReazioni({ c, y }, com, d.risultato, d.componentiReazione));
    await passo(0.55, 'reazioni vincolari');
  }

  // ═══ 5. diagrammi ═══
  if (d.contenuti.diagrammi) {
    numero++;
    const modo = d.contenuti.modoDiagrammi;
    if (modo === 'struttura' || modo === 'entrambi') {
      const componenti: Componente[] = ['N', 'T', 'M', 'D'];
      // un grafico non può essere più alto della pagina meno il suo titolo,
      // la sua didascalia e il titolo del blocco
      const hGrafico = Math.min(
        altezzaDiagramma(d.progetto, LARG),
        LIMITE - MARGINE.sopra - 74,
      );

      acapo();
      y = titoloBlocco(c, p, String(numero),
        'Diagrammi delle caratteristiche', X, y + 8, LARG);

      for (let i = 0; i < componenti.length; i++) {
        const k = componenti[i];

        /*
         * Un diagramma identicamente nullo prende una riga, non un riquadro.
         * Su una trave inflessa N è nullo, e mezza pagina bianca con sopra la
         * scritta «nullo» costa una pagina in più per non dire niente.
         */
        if (componenteNulla(d.risultato, k)) {
          if (y + 24 > LIMITE) {
            acapo();
            y = titoloBlocco(c, p, String(numero), 'Diagrammi (segue)', X, y + 8, LARG);
          }
          y = riga(c, NOME_COMPONENTE[k], X, y + 12,
            { dimensione: 9.4, grassetto: true, colore: p.testo });
          y = didascalia(c, p,
            `${NOME_COMPONENTE[k]} identicamente nullo su tutte le aste.`, X, y, LARG);
          continue;
        }

        // titolo + grafico + didascalia devono stare interi: è la regola del §3
        const serve = 14 + hGrafico + 22;
        if (y + serve > LIMITE) {
          acapo();
          y = titoloBlocco(c, p, String(numero), 'Diagrammi (segue)', X, y + 8, LARG);
        }

        y = riga(c, NOME_COMPONENTE[k], X, y + 10,
          { dimensione: 9.4, grassetto: true, colore: p.testo });
        const didasc = disegnaDiagramma(c, {
          progetto: d.progetto, risultato: d.risultato,
          modelloRisultati: d.modelloRisultati, etichette: d.etichette,
          palette: p, componente: k,
          riquadro: { x: X, y: y + 2, w: LARG, h: hGrafico },
          fattoreDeformata: k === 'D'
            ? fattoreDeformata(d.progetto, d.risultato) : undefined,
        });
        y += hGrafico + 2;
        y = didascalia(c, p, didasc, X, y, LARG);
        await passo(0.6 + 0.06 * i, `diagramma ${k}`);
      }
    }

    if (modo === 'asta' || modo === 'entrambi') {
      for (const ra of d.risultato.aste) {
        acapo();
        y = titoloBlocco(c, p, String(numero),
          `Diagrammi per asta — ${d.etichette.asta(ra.astaId)}`, X, y + 8, LARG);
        const h = 300;
        const righe = disegnaAsta(c, {
          risultato: vista, modelloRisultati: d.modelloRisultati,
          etichette: d.etichette, palette: p,
          riquadro: { x: X, y: y + 6, w: LARG, h }, astaId: ra.astaId,
        });
        y += h + 10;
        y = riga(c, 'Espressioni analitiche', X, y,
          { dimensione: 9, grassetto: true, colore: p.testo });
        for (const r of righe) {
          if (y > LIMITE - 14) { acapo(); }
          y = riga(c, r, X, y + 2,
            { dimensione: 7.4, colore: r.startsWith('   ') ? p.testoAttenuato : p.testo });
        }
      }
      await passo(0.78, 'diagrammi per asta');
    }
  }

  // ═══ 6. sezione trasversale ═══
  if (d.contenuti.sezione) {
    numero++;
    const usate = sezioniImpiegate(d.progetto);
    for (const s of usate) {
      acapo();
      y = titoloBlocco(c, p, String(numero),
        usate.length > 1 ? `Sezione trasversale — ${s.nome}` : 'Sezione trasversale',
        X, y + 8, LARG);
      y = disegnaSchedaSezione(c, p, s, d, X, y, LARG);
    }
    await passo(0.86, 'sezione trasversale');
  }

  // ═══ 7. coefficiente di sicurezza ═══
  if (d.contenuti.coefficiente && d.coefficiente) {
    titolo('Coefficiente di sicurezza', 200);
    aggiorna(bloccoCoefficiente({ c, y }, com, d.coefficiente));
    await passo(0.94, 'coefficiente di sicurezza');
  }

  // ═══ 8. diagnostica ═══
  if (d.contenuti.diagnostica && d.autoverifiche) {
    titolo('Diagnostica', 120);
    aggiorna(bloccoDiagnostica({ c, y }, com, d.autoverifiche));
  }

  // ═══ piè di pagina, quando il numero totale è noto ═══
  pagine.forEach((pag, i) => piedePagina(pag, p, d.titolo, i + 1, pagine.length, W, H));
  for (const pag of pagine) doc.aggiungiPagina(pag.contenuto(), W, H);

  await passo(1, 'documento completato');
  return doc.serializza();
}

// ═══════════════════════ PEZZI DEL DOCUMENTO ═══════════════════════

/**
 * §3 — intestazione della prima pagina, con le convenzioni.
 *
 * Le convenzioni si dichiarano UNA VOLTA per tutto il documento: ripeterle a
 * ogni diagramma sarebbe rumore, ometterle renderebbe i segni indecifrabili.
 */
function intestazione(
  c: ContestoPdf, p: PaletteDocumento, d: DatiRelazione,
  x: number, y: number, L: number,
): number {
  c.grassetto = true;
  c.dimensione = 17;
  c.fillStyle = p.testo;
  c.allineamento = 'left';
  c.base = 'alphabetic';
  c.fillText(d.titolo, x, y);
  c.grassetto = false;

  let yy = y + 16;
  c.dimensione = 9.5;
  c.fillStyle = p.testoAttenuato;
  c.fillText(`${d.autore}${d.autore && d.data ? '  ·  ' : ''}${d.data}`, x, yy);
  yy += 10;

  c.strokeStyle = p.linea;
  c.lineWidth = 0.8;
  c.beginPath();
  c.moveTo(x, yy); c.lineTo(x + L, yy);
  c.stroke();
  yy += 12;

  yy = paragrafo(c,
    'Convenzioni adottate. Unità del Sistema Internazionale: lunghezze in metri, '
    + 'forze in kN, momenti in kNm, tensioni in MPa, spostamenti in mm. '
    + 'Sforzo normale N positivo di trazione. Taglio T e momento M riferiti alla '
    + 'fibra segnata dalla linea tratteggiata accanto a ciascuna asta: il momento '
    + 'è positivo quando tende quella fibra. I diagrammi del momento sono riportati '
    + 'dalla parte delle fibre tese. Gli angoli sono misurati in gradi, positivi in '
    + 'senso antiorario dall\'asse x.',
    x, yy, L, { dimensione: 7.8, colore: p.testoAttenuato });
  return yy + 4;
}

function didascalia(
  c: ContestoPdf, p: PaletteDocumento, testo: string,
  x: number, y: number, L: number,
): number {
  return paragrafo(c, testo, x, y + 4, L, { dimensione: 7.2, colore: p.testoAttenuato });
}

/**
 * §4.3 — piè di pagina: logo a destra, numerazione a sinistra, titolo al centro.
 *
 * Si scrive alla fine, quando il totale delle pagine è noto: «pagina 3 di 12»
 * non si può scrivere mentre si compone la terza.
 */
function piedePagina(
  c: ContestoPdf, p: PaletteDocumento, titolo: string,
  numero: number, totale: number, W: number, H: number,
): void {
  const y = H - 26;
  c.strokeStyle = p.lineaTenue;
  c.lineWidth = 0.5;
  c.setLineDash([]);
  c.beginPath();
  c.moveTo(MARGINE.lato, y - 8); c.lineTo(W - MARGINE.lato, y - 8);
  c.stroke();

  c.dimensione = 7;
  c.base = 'middle';
  c.fillStyle = p.testoAttenuato;

  c.allineamento = 'left';
  c.fillText(`pagina ${numero} di ${totale}`, MARGINE.lato, y);

  c.allineamento = 'center';
  c.fillText(titolo, W / 2, y);

  disegnaLogo(c, p, W - MARGINE.lato - LARGHEZZA_LOGO, y - 5, 10);
}

// ═══════════════════════ REAZIONI: LO SCHEMA ═══════════════════════

/** Lunghezza massima di una freccia di reazione, etichetta compresa. */
const SPORTO_REAZIONI = 54;

function disegnaReazioni(
  c: ContestoPdf, p: PaletteDocumento, d: DatiRelazione, r: Riquadro,
): void {
  /*
   * La struttura si inquadra in un riquadro RIDOTTO: le frecce delle reazioni
   * partono dai vincoli e vanno verso l'esterno, con il loro valore in coda.
   * Senza riservare quello spazio, il valore di una reazione al piede finiva
   * sopra la didascalia del blocco.
   */
  const dentro: Riquadro = {
    x: r.x + SPORTO_REAZIONI, y: r.y,
    w: Math.max(40, r.w - 2 * SPORTO_REAZIONI),
    h: Math.max(40, r.h - SPORTO_REAZIONI),
  };
  // la struttura SENZA i simboli dei vincoli: al loro posto vanno le frecce
  const q = disegnaSchema(c, {
    progetto: d.progetto, carichi: d.carichi, etichette: d.etichette,
    palette: p, riquadro: dentro, conVincoli: false, conQuote: false,
  });

  const nodi = new Map(d.progetto.nodi.map((n) => [n.id, n]));
  let massimo = 0;
  for (const x of d.risultato.reazioni) massimo = Math.max(massimo, Math.hypot(x.fx, x.fy));
  if (massimo <= 0) massimo = 1;

  c.save();
  c.dimensione = 6.8;
  c.base = 'middle';
  for (const x of d.risultato.reazioni) {
    const n = nodi.get(x.nodoId);
    if (!n) continue;
    const modulo = Math.hypot(x.fx, x.fy);
    const P = q.p(n.x as unknown as number, n.y as unknown as number);

    if (modulo > 1e-9) {
      const L = 14 + (SPORTO_REAZIONI - 30) * (modulo / massimo);
      const ux = x.fx / modulo, uy = -x.fy / modulo;
      const coda = { x: P.x - ux * L, y: P.y - uy * L };
      c.strokeStyle = p.reazione;
      c.fillStyle = p.reazione;
      c.lineWidth = 1.4;
      c.setLineDash([]);
      c.beginPath();
      c.moveTo(coda.x, coda.y); c.lineTo(P.x, P.y);
      c.stroke();
      const f = 3.8, nx = -uy, ny = ux;
      c.beginPath();
      c.moveTo(P.x, P.y);
      c.lineTo(P.x - ux * f * 2 + nx * f * 0.7, P.y - uy * f * 2 + ny * f * 0.7);
      c.lineTo(P.x - ux * f * 2 - nx * f * 0.7, P.y - uy * f * 2 - ny * f * 0.7);
      c.closePath();
      c.fill();
      c.allineamento = ux >= 0 ? 'right' : 'left';
      c.fillText(`${(modulo / 1e3).toFixed(2).replace('.', ',')} kN`,
        coda.x - ux * 4, coda.y - uy * 4);
    }

    if (Math.abs(x.mz) > 1e-9) {
      c.strokeStyle = p.reazione;
      c.fillStyle = p.reazione;
      c.lineWidth = 1.2;
      c.beginPath();
      c.arc(P.x, P.y, 11, -Math.PI * 0.8, Math.PI * 0.5);
      c.stroke();
      c.allineamento = 'center';
      c.fillText(`${(x.mz / 1e3).toFixed(2).replace('.', ',')} kNm`, P.x, P.y + 18);
    }
  }
  c.restore();
}

// ═══════════════════════ SEZIONE ═══════════════════════

interface SezioneImpiegata {
  nome: string;
  parametri: NonNullable<Progetto['sezioniPersonalizzate'][number]['parametri']>;
  aste: string[];
}

function sezioniImpiegate(pr: Progetto): SezioneImpiegata[] {
  const out: SezioneImpiegata[] = [];
  for (const s of pr.sezioniPersonalizzate) {
    if (!s.parametri) continue;
    const aste = pr.aste.filter((a) => String(a.sezioneId) === String(s.id));
    if (aste.length === 0) continue;
    out.push({
      nome: s.nome ?? String(s.id),
      parametri: s.parametri,
      aste: aste.map((a) => String(a.id)),
    });
  }
  return out;
}

/**
 * §3.6 — la scheda di una sezione.
 *
 * Il disegno è quello dell'applicazione, `disegnaSezione`, che riceve il
 * contesto PDF al posto del canvas: contorno reale, asse neutro nella
 * posizione vera, campitura delle zone tese e compresse, e gli andamenti di σ
 * e τ sull'altezza. Non c'è un secondo disegno della stessa cosa.
 */
function disegnaSchedaSezione(
  c: ContestoPdf, p: PaletteDocumento, s: SezioneImpiegata,
  d: DatiRelazione, x: number, y: number, L: number,
): number {
  const q = proprietaDa(s.parametri);
  let yy = paragrafo(c,
    `Sezione «${s.nome}», forma ${s.parametri.famiglia}. `
    + `Impiegata su ${s.aste.length} ${s.aste.length === 1 ? 'asta' : 'aste'}: `
    + s.aste.map((a) => d.etichette.asta(a as never)).join(', ') + '.',
    x, y + 8, L, { dimensione: 8, colore: p.testoAttenuato });

  // le misure che definiscono la sezione
  const misure = Object.entries(s.parametri)
    .filter(([k]) => k !== 'famiglia')
    .map(([k, v]) => `${k} = ${((v as number) * 1e3).toFixed(1).replace('.', ',')} mm`);
  yy = riga(c, misure.join('   ·   '), x, yy + 4, { dimensione: 7.6, colore: p.testo });

  /*
   * LA DISTRIBUZIONE DI σ E τ viene dalla verifica dell'asta PIÙ SOLLECITATA
   * fra quelle che usano questa sezione: è quella che decide se la sezione
   * basta, ed è il diagramma che ha senso mettere accanto al disegno.
   */
  const perAsta = (d.verifiche?.perAsta ?? []).filter(
    (v) => s.aste.includes(String(v.astaId)),
  );
  const peggiore = perAsta.reduce<typeof perAsta[number] | null>(
    (a, v) => (!a || v.sfruttamento > a.sfruttamento ? v : a), null,
  );

  const H = 300;
  // `disegnaSezione` compone a partire dall'origine del contesto: si trasla,
  // invece di passargli un'origine che il canvas non gli passa mai
  c.save();
  c.translate(x, yy + 6);
  disegnaSezione(c as unknown as CanvasRenderingContext2D, {
    parametri: s.parametri,
    distribuzione: peggiore?.distribuzione ?? null,
    larghezza: L, altezza: H,
    colori: {
      sfondo: p.foglio, contorno: p.asta, riempimento: p.lineaTenue,
      sigma: p.sforzoNormale, tau: p.taglio, ideale: p.momento,
      critico: p.reazione, testo: p.testoAttenuato, griglia: p.linea,
      trazione: p.errore, compressione: p.sforzoNormale,
    },
  });
  c.restore();
  yy += H + 6;

  if (peggiore) {
    yy = paragrafo(c,
      `Andamenti riferiti all'asta ${d.etichette.asta(peggiore.astaId as never)}, `
      + `la più sollecitata fra quelle con questa sezione: `
      + `σ estrema ${(peggiore.distribuzione.fibraEstrema.sigma / 1e6).toFixed(1).replace('.', ',')} MPa, `
      + `τ massima ${(peggiore.distribuzione.taglioMassimo.tau / 1e6).toFixed(1).replace('.', ',')} MPa.`,
      x, yy, L, { dimensione: 7.4, colore: p.testoAttenuato });
  }
  return yy;
}

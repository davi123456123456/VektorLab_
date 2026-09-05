/**
 * §6 — `npm run pdf-check`.
 *
 * Genera la relazione per cinque strutture di complessità crescente e ne
 * converte le pagine in immagini, così l'esame visivo del §6 è ripetibile:
 * dopo ogni correzione si rilancia e si riguarda, invece di rifare a mano la
 * stessa sequenza di clic.
 *
 * Riporta anche, per ogni documento, il TESTO estratto dal PDF: è la prova che
 * le scritte sono testo e non pixel, e serve a confrontare i numeri con quelli
 * mostrati a schermo.
 */

import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  analizzaCaso, analizzaCinematica, analizzaStatica, espandi,
  preparaPerAnalisi, verificaStruttura,
} from '../src/core/index.js';
import { coefficienteCritico } from '../src/core/checks/coefficiente.js';
import { etichette } from '../src/state/etichette.js';
import { componiRelazione } from '../src/esporta/relazione.js';
import {
  CONTENUTI_PREDEFINITI, type ContenutiScelti,
} from '../src/esporta/contenuti.js';
import { MODELLI } from '../test/baseline/modelli.js';
import type { LoadCaseId, Progetto } from '../src/core/model/types.js';

const CASO = 'principale' as LoadCaseId;
const USCITA = 'pdf-prova';

/**
 * Le cinque strutture del §6, in ordine di complessità crescente.
 *
 * Sono prese dai modelli della linea di base: le stesse su cui è congelato il
 * motore, così un numero sbagliato nel PDF si riconosce subito perché la
 * linea di base dice quale dovrebbe essere.
 */
const PROVE: { nome: string; modello: string; contenuti?: Partial<ContenutiScelti> }[] = [
  // la mensola porta anche i diagrammi PER ASTA con le espressioni: è la sola
  // struttura abbastanza semplice perché quel blocco stia in una pagina, e
  // lascia comunque quel percorso coperto dalla prova
  { nome: '1-mensola', modello: 'mensola-forza', contenuti: { modoDiagrammi: 'entrambi' } },
  { nome: '2-appoggiata-distribuito', modello: 'appoggiata-distribuito' },
  { nome: '3-gerber', modello: 'gerber', contenuti: { diagnostica: true } },
  { nome: '4-portale-tre-cerniere', modello: 'portale-tre-cerniere' },
  {
    nome: '5-telaio-dieci-aste', modello: 'telaio-due-piani',
    contenuti: { orientamento: 'orizzontale' },
  },
];

function font() {
  return {
    regolare: new Uint8Array(readFileSync('src/esporta/font/Roboto-Regular.ttf')),
    grassetto: new Uint8Array(readFileSync('src/esporta/font/Roboto-Bold.ttf')),
  };
}

/** Raccoglie tutto ciò che serve alla relazione, come fa l'interfaccia. */
export async function generaPer(
  titolo: string, pr: Progetto, contenuti: Partial<ContenutiScelti> = {},
): Promise<Uint8Array> {
  const risultato = analizzaCaso(pr, CASO);
  const cinematica = analizzaCinematica(pr);
  const statica = analizzaStatica(pr, { tipo: 'caso', id: CASO }, {}, risultato);
  const verifiche = verificaStruttura(pr, risultato);
  const coefficiente = coefficienteCritico(pr, risultato);
  const modelloRisultati = espandi(preparaPerAnalisi(pr)).progetto;

  return componiRelazione({
    titolo,
    autore: 'Davide Berardinelli',
    data: new Date().toLocaleDateString('it-IT'),
    progetto: pr,
    modelloRisultati,
    carichi: pr.carichi.filter((k) => k.casoId === CASO),
    etichette: etichette(pr),
    risultato,
    cinematica,
    coefficiente,
    verifiche,
    autoverifiche: statica.autoverifiche,
    componentiReazione: statica.componentiEsterne,
    contenuti: { ...CONTENUTI_PREDEFINITI, ...contenuti },
    font: font(),
  });
}

async function principale(): Promise<void> {
  if (existsSync(USCITA)) rmSync(USCITA, { recursive: true, force: true });
  mkdirSync(USCITA, { recursive: true });

  process.stdout.write('\nGenerazione dei PDF di prova\n\n');
  const generati: { nome: string; file: string; byte: number }[] = [];

  for (const prova of PROVE) {
    const m = MODELLI.find((x) => x.nome === prova.modello);
    if (!m) throw new Error(`Modello «${prova.modello}» non nel catalogo.`);
    const byte = await generaPer(
      `Relazione di calcolo — ${prova.modello}`, m.progetto, prova.contenuti,
    );
    const file = join(USCITA, `${prova.nome}.pdf`);
    writeFileSync(file, byte);
    generati.push({ nome: prova.nome, file, byte: byte.length });
    process.stdout.write(
      `  ${prova.nome.padEnd(26)} ${(byte.length / 1024).toFixed(0).padStart(5)} kB\n`,
    );
  }

  // ── conversione in immagini ──
  process.stdout.write('\nConversione delle pagine in immagini\n\n');
  const { chromium } = await import('playwright');
  const { rasterizza, salvaImmagini } = await import('./rasterizza.mjs');

  const browser = await chromium.launch();
  const pagina = await browser.newPage();
  const errori: string[] = [];
  pagina.on('pageerror', (e) => errori.push(String(e)));

  // serve un'origine che possa importare pdf.js: il server di sviluppo
  const porta = process.env.PORTA_VITE ?? '5180';
  try {
    await pagina.goto(`http://localhost:${porta}`, { waitUntil: 'domcontentloaded' });
  } catch {
    process.stdout.write(
      `  Il server di sviluppo non risponde sulla porta ${porta}.\n`
      + '  Avvialo con `npm run dev` (o indica PORTA_VITE) e rilancia.\n',
    );
    await browser.close();
    process.exit(1);
  }
  await pagina.waitForTimeout(1500);

  for (const g of generati) {
    /*
     * Si ricarica prima di ogni documento. Il server di sviluppo aggiorna la
     * pagina appena un sorgente cambia, e un aggiornamento a metà conversione
     * distrugge il contesto: la prova fallirebbe per un motivo che non c'entra
     * con il PDF.
     */
    await pagina.goto(`http://localhost:${porta}`, { waitUntil: 'domcontentloaded' });
    await pagina.waitForTimeout(900);
    const r = await rasterizza(pagina, readFileSync(g.file), { scala: 2 });
    const immagini = salvaImmagini(r.immagini, join(USCITA, 'pagine'), g.nome);
    const parole = r.testi.flat().join(' ').trim();
    process.stdout.write(
      `  ${g.nome.padEnd(26)} ${String(r.pagine).padStart(2)} pagine, `
      + `${immagini.length} immagini, ${parole.length} caratteri di testo estratto\n`,
    );
    writeFileSync(join(USCITA, `${g.nome}.txt`), r.testi.map(
      (t, i) => `── pagina ${i + 1} ──\n${t.join('\n')}`,
    ).join('\n\n'));
  }

  await browser.close();
  if (errori.length > 0) {
    process.stdout.write(`\nErrori dal browser:\n  ${errori.join('\n  ')}\n`);
  }
  process.stdout.write(
    `\nFatto. PDF in ${USCITA}/, immagini in ${USCITA}/pagine/, `
    + `testo estratto in ${USCITA}/*.txt\n`,
  );
}

// eseguito direttamente, non importato
if (process.argv[1]?.endsWith('pdfCheck.ts')) {
  principale().catch((e) => {
    process.stderr.write(`\nEsportazione fallita: ${e?.message ?? e}\n`);
    process.exit(1);
  });
}

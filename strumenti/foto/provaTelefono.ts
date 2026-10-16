/**
 * PROVA SUL TELEFONO della struttura da foto, contro la build vera.
 *
 *   npm run build && npm run preview      (in un altro terminale)
 *   npm run foto:telefono
 *
 * Guida l'interfaccia come un dito: tasto fotocamera → Galleria → foto
 * sintetica di prova → riquadro → Riconosci → struttura disegnata →
 * Annulla della cronologia. Poi una foto bianca (nessuno schema) e una
 * finestra da computer, dove il tasto non deve esserci. Stampa i tempi e
 * salva le schermate in screenshots/foto-telefono/. Esce con 1 se una
 * verifica fallisce.
 */

import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Page } from 'playwright';

const BASE = process.env.URL_ANTEPRIMA ?? 'http://localhost:4173';
const radice = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const FOTO = join(radice, 'test', 'foto', 'campioni-rete', 'foto-2000201.jpg');
const BIANCA = join(radice, 'test', 'foto', 'campioni-rete', 'bianca.png');
const CARTELLA = join(radice, 'screenshots', 'foto-telefono');

const problemi: string[] = [];
const verifica = (ok: boolean, cosa: string) => {
  console.log(`${ok ? '✓' : '✗'} ${cosa}`);
  if (!ok) problemi.push(cosa);
};

async function scatta(page: Page, nome: string) {
  await page.screenshot({ path: join(CARTELLA, `${nome}.png`) });
}

async function scegliFoto(page: Page, file: string) {
  await page.getByRole('button', { name: 'Struttura da foto' }).click();
  await page.locator('input[data-prova="galleria"]').setInputFiles(file);
}

async function main() {
  rmSync(CARTELLA, { recursive: true, force: true });
  mkdirSync(CARTELLA, { recursive: true });
  const browser = await chromium.launch();

  // ── telefono ──
  const telefono = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const page = await telefono.newPage();
  page.on('pageerror', (e) => problemi.push(`errore nella pagina: ${e.message}`));
  await page.goto(BASE);
  const annulla = page.locator('.cronologia-telefono').getByRole('button', { name: 'Annulla' });
  const ripeti = page.locator('.cronologia-telefono').getByRole('button', { name: 'Ripeti' });
  verifica(await annulla.isDisabled(), 'all\'inizio non c\'è niente da annullare');

  let t = Date.now();
  await scegliFoto(page, FOTO);
  await page.getByRole('button', { name: 'Riconosci' }).waitFor({ timeout: 90_000 });
  const primaPassata = Date.now() - t;
  await scatta(page, '1-riquadro');
  verifica(await page.locator('.foto-scelta').count() === 1, 'lo schema trovato è riquadrato');

  t = Date.now();
  await page.getByRole('button', { name: 'Riconosci' }).click();
  await page.getByText('Disegnata dalla foto').waitFor({ timeout: 60_000 });
  const lettura = Date.now() - t;
  await scatta(page, '2-disegnata');
  verifica(await page.locator('.foto-velo').count() === 0, 'il pannello si chiude da solo');
  verifica(await annulla.isEnabled(), 'la struttura è entrata nel foglio come un comando annullabile');
  const titolo = page.locator('.avvisi-foto-titolo');
  if (await titolo.isEnabled()) {
    await titolo.click();
    await scatta(page, '3-da-controllare');
    await page.locator('.avvisi-foto-elenco button').first().click();
  }

  await annulla.click();
  verifica(await annulla.isDisabled() && await ripeti.isEnabled(), 'Annulla toglie tutta la struttura in un colpo');
  await scatta(page, '4-annullata');
  verifica(await page.locator('.avvisi-foto').count() === 0, 'annullata la struttura, la striscia «Da controllare» sparisce');

  // una seconda foto: la rete è già scaricata
  t = Date.now();
  await scegliFoto(page, FOTO);
  await page.getByRole('button', { name: 'Riconosci' }).waitFor({ timeout: 60_000 });
  const primaPassataCalda = Date.now() - t;
  await page.locator('.foto-azioni').getByRole('button', { name: 'Annulla' }).click();
  verifica(await page.locator('.foto-velo').count() === 0 && await annulla.isDisabled(),
    'annullare al riquadro non cambia il disegno');

  await scegliFoto(page, BIANCA);
  await page.getByText('Nella foto non ho trovato uno schema').waitFor({ timeout: 60_000 });
  await scatta(page, '5-senza-schema');
  verifica(await annulla.isDisabled(), 'senza schema il disegno resta com\'era');
  await page.getByRole('button', { name: 'Chiudi' }).first().click();

  // ── computer ──
  const computer = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await computer.goto(BASE);
  verifica(await computer.getByRole('button', { name: 'Struttura da foto' }).count() === 0, 'sul computer il tasto non c\'è');

  await browser.close();
  console.log(`\ntempi: prima foto (scaricamento + prima passata) ${primaPassata} ms, lettura ${lettura} ms, `
    + `seconda foto fino al riquadro ${primaPassataCalda} ms`);
  console.log(`schermate in ${CARTELLA}`);
  if (problemi.length > 0) {
    console.error(`\n${problemi.length} problemi:\n- ${problemi.join('\n- ')}`);
    process.exit(1);
  }
}

await main();

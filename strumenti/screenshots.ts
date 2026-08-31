/**
 * CATTURA DEGLI SCHERMI PER LA VERIFICA VISIVA.
 *
 * Serve a guardare, non a passare. Il lavoro grafico non si verifica leggendo
 * il codice che disegna: si verifica aprendo l'immagine e cercando le scritte
 * sovrapposte, il testo tagliato, gli assi senza unità, i grafici che non si
 * riadattano quando un pannello si apre.
 *
 * Guida l'interfaccia VERA — clic sui bottoni, scorciatoie da tastiera — e non
 * lo store attraverso `window.vektorlab`: quell'aggancio esiste solo in
 * sviluppo, e uno script che dipendesse da lui non proverebbe mai la build che
 * finisce in produzione.
 *
 *   npm run screenshots
 *
 * Presuppone l'app servita su http://localhost:4173 (`npm run preview`).
 */

import { chromium, type Page } from 'playwright';
import { mkdirSync, rmSync } from 'node:fs';

const BASE = process.env.URL_ANTEPRIMA ?? 'http://localhost:4173';
const CARTELLA = 'screenshots';

const VIEWPORT = [
  { nome: '1920x1080', width: 1920, height: 1080 },
  { nome: '1440x900', width: 1440, height: 900 },
  { nome: '1280x800', width: 1280, height: 800 },
];

const MODALITA = [
  'Modellazione', 'Vincoli', 'Carichi', 'Materiali', 'Analisi', 'Reazioni', 'Risultati',
] as const;

/** Un pannello laterale è aperto quando ha larghezza non nulla. */
async function larghezzaAside(page: Page, indice: number): Promise<number> {
  return page.evaluate((k) => {
    const a = document.querySelectorAll('aside')[k];
    return a ? a.getBoundingClientRect().width : 0;
  }, indice);
}

async function impostaPannello(
  page: Page, lato: 'sinistra' | 'destra', aperto: boolean,
): Promise<void> {
  const indice = lato === 'sinistra' ? 0 : 1;
  if ((await larghezzaAside(page, indice) > 4) === aperto) return;
  await page.keyboard.press(lato === 'sinistra' ? 'Control+b' : 'Control+i');
  await page.waitForTimeout(260);   // la transizione di larghezza dura 200 ms
}

async function preparaModello(page: Page): Promise<void> {
  // il portale ha aste inclinate, vincoli, carichi distribuiti e concentrati:
  // è il modello che mette più cose sotto gli occhi in una schermata sola
  await impostaPannello(page, 'sinistra', true);
  await page.getByRole('button', { name: 'Portale', exact: true }).click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'Risultati', exact: true }).click();
  await page.waitForTimeout(300);
  const calcola = page.getByRole('button', { name: /^(calcola|ricalcola)$/ });
  if (await calcola.count() > 0) {
    await calcola.first().click();
    await page.waitForTimeout(1200);   // il solutore gira nel worker
  }
}

async function main(): Promise<void> {
  rmSync(CARTELLA, { recursive: true, force: true });
  mkdirSync(CARTELLA, { recursive: true });

  const browser = await chromium.launch();
  let scattate = 0;
  const problemi: string[] = [];

  for (const v of VIEWPORT) {
    for (const aperti of [true, false]) {
      const page = await browser.newPage({
        viewport: { width: v.width, height: v.height },
        deviceScaleFactor: 2,
      });
      const errori: string[] = [];
      page.on('console', (m) => { if (m.type() === 'error') errori.push(m.text()); });
      page.on('pageerror', (e) => errori.push(String(e)));

      await page.goto(BASE, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(400);
      await preparaModello(page);

      await impostaPannello(page, 'sinistra', aperti);
      await impostaPannello(page, 'destra', aperti);

      for (const m of MODALITA) {
        await page.getByRole('button', { name: m, exact: true }).click();
        await page.waitForTimeout(450);
        const base = `${CARTELLA}/${m.toLowerCase()}-${v.nome}`
          + `-pannelli-${aperti ? 'aperti' : 'chiusi'}`;
        await page.screenshot({ path: `${base}.png` });
        scattate++;
        process.stdout.write(`  ${base}.png\n`);

        // Il pannello di destra SCORRE, e su Materiali ha 2800 px di
        // contenuto su 800 visibili: i tre quarti di ciò che disegna stanno
        // sotto la piega, ed è la parte che nessuno aveva mai guardato.
        if (aperti) {
          const passi = await page.evaluate(() => {
            // NON il primo `div.overflow-auto` del documento: quello sta nel
            // pannello di sinistra e non scorre. Serve quello che scorre
            // davvero, e lo si riconosce solo dalle sue misure.
            const box = [...document.querySelectorAll('div.overflow-auto')]
              .find((e) => e.scrollHeight > e.clientHeight + 8);
            if (!box) return 0;
            return Math.min(4, Math.ceil(box.scrollHeight / box.clientHeight));
          });
          for (let k = 1; k < passi; k++) {
            await page.evaluate((i) => {
              const box = [...document.querySelectorAll('div.overflow-auto')]
                .find((e) => e.scrollHeight > e.clientHeight + 8);
              if (box) box.scrollTop = i * box.clientHeight * 0.9;
            }, k);
            await page.waitForTimeout(400);
            await page.screenshot({ path: `${base}-giu${k}.png` });
            scattate++;
            process.stdout.write(`  ${base}-giu${k}.png\n`);
          }
          await page.evaluate(() => {
            for (const e of document.querySelectorAll('div.overflow-auto')) e.scrollTop = 0;
          });
        }
      }

      if (errori.length > 0) problemi.push(`${v.nome}: console — ${errori.join(' | ')}`);
      await page.close();
    }
  }

  await browser.close();
  process.stdout.write(`\n${scattate} immagini in ${CARTELLA}/\n`);
  if (problemi.length > 0) {
    process.stdout.write('\nRILEVATI AUTOMATICAMENTE:\n');
    for (const p of problemi) process.stdout.write(`  · ${p}\n`);
  }
}

main().catch((e: unknown) => {
  process.stderr.write(`${String(e)}\n`);
  process.exitCode = 1;
});

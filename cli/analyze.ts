#!/usr/bin/env node
/**
 * Analisi da riga di comando.
 *
 *     npm run analyze -- fixtures/portale.strut
 *     npm run analyze -- fixtures/portale.strut --json
 *     npm run analyze -- fixtures/gerber.strut --statica
 *
 * Esiste per far rispettare la regola architetturale: se `core/` dipendesse da
 * React o dal DOM, questo comando non funzionerebbe.
 */

import { readFileSync } from 'node:fs';
import { analizza, analizzaStatica, type Progetto } from '../src/core/index.js';
import type { RisultatoAnalisi } from '../src/core/model/results.js';

const kN = (v: number) => (v / 1e3).toFixed(2).padStart(10);
const mm = (v: number) => (v * 1e3).toFixed(3).padStart(10);

function main(): void {
  const args = process.argv.slice(2);
  const percorso = args.find((a) => !a.startsWith('--'));
  const soloJson = args.includes('--json');
  const conStatica = args.includes('--statica');

  if (!percorso) {
    console.error('Uso: analyze <file.strut> [--json] [--statica]');
    process.exit(1);
  }

  const progetto = JSON.parse(readFileSync(percorso, 'utf-8')) as Progetto;
  const esito = analizza(progetto);

  if (soloJson) {
    console.log(JSON.stringify({
      cinematica: {
        ...esito.cinematica,
        meccanismi: esito.cinematica.meccanismi.length,
      },
      casi: [...esito.perCaso].map(([id, r]) => ({ id, ...riassunto(r) })),
      combinazioni: [...esito.perCombinazione].map(([id, r]) => ({ id, ...riassunto(r) })),
      avvisi: esito.avvisi,
    }, null, 2));
    return;
  }

  const riga = '─'.repeat(72);
  console.log(riga);
  console.log(`  ${progetto.nome || 'modello senza nome'}`);
  console.log(riga);
  console.log(`  nodi ${progetto.nodi.length} · aste ${progetto.aste.length} · ` +
              `casi di carico ${progetto.casi.length} · combinazioni ${progetto.combinazioni.length}`);

  // ── analisi cinematica ──────────────────────────────────────────────
  const k = esito.cinematica;
  console.log(`\n  ANALISI CINEMATICA`);
  console.log(`  corpi rigidi ${k.numeroCorpi} · gradi di libertà ${k.gradiLiberta} · ` +
              `gradi di vincolo ${k.gradiVincolo} · rango ${k.rango}`);
  console.log(`  labilità ${k.labilita} · iperstaticità ${k.iperstaticita} ` +
              `→ ${k.classificazione.toUpperCase()}`);
  for (const d of k.diagnosi) {
    const segno = d.gravita === 'errore' ? '  !!' : d.gravita === 'avviso' ? '  ! ' : '    ';
    console.log(`${segno} ${d.messaggio}`);
  }

  for (const a of esito.avvisi) console.log(`  !  ${a}`);

  // ── risultati per caso e combinazione ───────────────────────────────
  const tutti: [string, RisultatoAnalisi][] = [
    ...[...esito.perCaso].map(([id, r]) => [`caso ${id}`, r] as [string, RisultatoAnalisi]),
    ...[...esito.perCombinazione].map(([id, r]) => [`combinazione ${id}`, r] as [string, RisultatoAnalisi]),
  ];

  for (const [nome, r] of tutti) {
    console.log(`\n${riga}`);
    console.log(`  ${nome.toUpperCase()}`);
    console.log(riga);
    console.log(`  spostamento massimo  ${mm(r.spostamentoMassimo)} mm`);
    console.log(`  equilibrio           ΣFx ${kN(r.equilibrio.sommaFx)} kN · ` +
                `ΣFy ${kN(r.equilibrio.sommaFy)} kN · ` +
                `residuo ${r.equilibrio.residuoRelativo.toExponential(2)} ` +
                `${r.equilibrio.soddisfatto ? '✓' : '✗ NON VERIFICATO'}`);
    if (r.diagnostica.dofSingolari.length > 0) {
      const n = r.diagnostica.dofSingolari.length;
      console.log(`  !! ${n} ${n === 1 ? 'direzione labile' : 'direzioni labili'} ` +
                  `(pivot nullo): la soluzione non è unica.`);
    }

    console.log(`\n  REAZIONI VINCOLARI                 Fx [kN]     Fy [kN]   Mz [kNm]`);
    for (const re of r.reazioni) {
      console.log(`    ${String(re.nodoId).padEnd(24)} ${kN(re.fx)}  ${kN(re.fy)}  ${kN(re.mz)}`);
    }

    console.log(`\n  SOLLECITAZIONI PER ASTA        N [kN]      T [kN]     M [kNm]`);
    for (const a of r.aste) {
      const nMax = estremo(a.estremi.Nmin, a.estremi.Nmax);
      const tMax = estremo(a.estremi.Tmin, a.estremi.Tmax);
      const mMax = estremo(a.estremi.Mmin, a.estremi.Mmax);
      console.log(`    ${String(a.astaId).padEnd(20)} ${kN(nMax)}  ${kN(tMax)}  ${kN(mMax)}`);
    }

    if (conStatica && nome.startsWith('caso ')) {
      statica(progetto, nome.slice(5).trim());
    }
  }
  console.log(`\n${riga}`);
}

/**
 * Reazioni per equazioni cardinali e autoverifiche, da riga di comando.
 *
 * Non è un di più: è la prova che la §4 è headless per davvero. Se il calcolo
 * delle reazioni dipendesse da qualcosa dell'interfaccia, questo comando non
 * potrebbe esistere.
 */
function statica(progetto: Progetto, casoId: string): void {
  const e = analizzaStatica(progetto, { tipo: 'caso', id: casoId as never });

  console.log(`\n  STATICA PER EQUILIBRIO — ${e.equilibrio.classificazione.toUpperCase()}`);
  console.log(`  ${e.equilibrio.messaggio}`);
  console.log(`  reazioni da: ${e.elementino.sorgente === 'equilibrio'
    ? 'equazioni cardinali sui corpi rigidi'
    : 'metodo degli spostamenti (congruenza)'}`);

  if (e.componentiEsterne.length > 0) {
    console.log(`\n  COMPONENTI DI REAZIONE            modulo    direzione`);
    for (const c of e.componentiEsterne) {
      const modulo = Math.abs(c.valore);
      const unita = c.componente === 'rotazione' ? 'kNm' : 'kN ';
      const verso = c.direzione
        ? `(${(c.direzione.dx * Math.sign(c.valore || 1)).toFixed(3)}, ` +
          `${(c.direzione.dy * Math.sign(c.valore || 1)).toFixed(3)})`
        : c.valore >= 0 ? 'antiorario' : 'orario';
      console.log(
        `    ${`${c.nodoId} ${c.componente}`.padEnd(26)} ` +
        `${kN(modulo)} ${unita} ${verso}`,
      );
    }
  }

  for (const s of e.equilibrio.sconnessioni) {
    console.log(`\n  SCONNESSIONE ${s.nodoId}: ` +
      `F = ${(Math.hypot(s.fx, s.fy) / 1e3).toFixed(3)} kN, ` +
      `M = ${(s.mz / 1e3).toExponential(1)} kNm`);
  }

  console.log(`\n  AUTOVERIFICHE`);
  for (const v of e.autoverifiche.verifiche) {
    const segno = !v.superata ? '✗' : v.esaminati === 0 ? '·' : '✓';
    console.log(`    ${segno} ${v.descrizione.padEnd(48)} ${v.dettaglio}`);
  }
  if (!e.autoverifiche.tutteSuperate) {
    console.log('    !! almeno un controllo è fallito: il risultato non è affidabile.');
  }
}

const estremo = (min: number, max: number) => (Math.abs(min) > Math.abs(max) ? min : max);

function riassunto(r: RisultatoAnalisi) {
  return {
    spostamentoMassimo: r.spostamentoMassimo,
    equilibrio: r.equilibrio,
    reazioni: r.reazioni,
    aste: r.aste.map((a) => ({ astaId: a.astaId, estremi: a.estremi })),
  };
}

main();

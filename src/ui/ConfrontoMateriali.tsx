/**
 * Confronto fra materiali SULLA STRUTTURA IN ESAME.
 *
 * Ogni riga si ottiene rieseguendo l'analisi con quel materiale assegnato a
 * tutte le aste: geometria, vincoli, carichi e sezioni sono quelli veri. Non
 * c'è nessun calcolo semplificato parallelo — sarebbe un secondo motore da
 * tenere allineato, e prima o poi divergerebbe da quello vero.
 *
 * PERCHÉ PRIMA SEMBRAVA NON CAMBIARE MAI. Il calcolo era già questo; era la
 * presentazione a ingannare. La vista si apriva sulla RESISTENZA, che è una
 * proprietà del materiale: 275 MPa per l'S275 su qualunque struttura, oggi e
 * domani. Allungando un'asta non cambiava nulla di ciò che si stava
 * guardando, e la conclusione naturale era che il confronto fosse finto.
 *
 * Qui le colonne sono ESITI sulla struttura — peso, tensione massima,
 * sfruttamento, coefficiente di sicurezza, freccia, costo — e cambiano tutte
 * appena si tocca il modello. Le proprietà di targa restano consultabili nel
 * suggerimento della riga, dove non si confondono con i risultati.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../state/store.js';
import { confrontaMateriali, type RigaConfronto } from '../core/checks/confronto.js';
import { MATERIALI, materialePerId } from '../core/materials/materials.js';
import { Bottone } from './Pannelli.js';
import { COLONNE, type Colonna } from './colonneConfronto.js';

interface Riga extends RigaConfronto {
  /** tensione massima raggiunta [Pa], dedotta da sfruttamento e resistenza */
  sigma: number;
  gammaM: number;
}

/**
 * σ_max dallo sfruttamento.
 *
 * `sfruttamento = σ / f_d` e `f_d = resistenza / γ_M`, quindi
 * `σ = sfruttamento · resistenza / γ_M`. Si ricava qui invece di aggiungere
 * un campo al modulo di verifica, che in questa iterazione non va toccato —
 * ed è comunque una definizione, non un calcolo nuovo.
 */
function conTensione(r: RigaConfronto): Riga {
  const m = MATERIALI.find((x) => (x.id as unknown as string) === r.materialeId);
  const gammaM = m?.gammaM ?? 1;
  return { ...r, gammaM, sigma: (r.sfruttamentoMassimo * r.resistenza) / gammaM };
}

const num = (v: number, cifre = 1): string =>
  (Number.isFinite(v) ? v.toFixed(cifre) : '—');

/*
  La freccia spazia su quattro ordini di grandezza: 12 mm per un acciaio,
  1225 mm per un PETG che non verifica. Il decimo di millimetro conta sul
  primo e non significa nulla sul secondo, dove per giunta faceva sbordare
  il numero sulla colonna del costo. Sotto i 100 mm un decimale, sopra
  nessuno.
*/
const freccia = (metri: number): string => {
  if (!Number.isFinite(metri)) return '—';
  const mm = metri * 1e3;
  return num(mm, Math.abs(mm) >= 100 ? 0 : 1);
};

export function ConfrontoMateriali() {
  const progetto = useStore((s) => s.progetto);
  const sorgente = useStore((s) => s.sorgenteRisultati);
  const materialeAssegnato = useStore((s) => s.progetto.aste[0]?.materialeId);

  const [righe, setRighe] = useState<Riga[]>([]);
  const [inCorso, setInCorso] = useState(false);
  const [ordine, setOrdine] = useState<Colonna>('utilizzo');
  const [crescente, setCrescente] = useState(true);
  const generazione = useRef(0);

  /*
   * RICALCOLO AUTOMATICO, un materiale per volta.
   *
   * Rianalizzare quindici strutture di seguito blocca l'interfaccia per
   * qualche decimo di secondo, che su un pannello che si aggiorna a ogni
   * modifica si sente. Spezzando in un materiale per `setTimeout` il thread
   * respira fra l'uno e l'altro, e le righe compaiono man mano invece che
   * tutte insieme dopo l'attesa.
   *
   * `generazione` scarta i risultati di un ciclo superato: modificando il
   * modello mentre il confronto gira, le righe vecchie non devono mescolarsi
   * a quelle nuove.
   */
  useEffect(() => {
    const mio = ++generazione.current;
    const avvio = setTimeout(() => {
      setRighe([]);
      setInCorso(true);
      let i = 0;
      const passo = () => {
        if (generazione.current !== mio) return;
        if (i >= MATERIALI.length) { setInCorso(false); return; }
        const m = MATERIALI[i++];
        try {
          const [r] = confrontaMateriali(progetto, sorgente, [m]);
          if (r) setRighe((precedenti) => [...precedenti, conTensione(r)]);
        } catch {
          // un materiale che non si riesce ad analizzare non ferma gli altri
        }
        setTimeout(passo, 0);
      };
      passo();
    }, 250);   // attesa breve: si ricalcola a modifica finita, non a ogni tasto
    return () => clearTimeout(avvio);
  }, [progetto, sorgente]);

  const ordinate = useMemo(() => {
    const chiave = (r: Riga): number | string => {
      switch (ordine) {
        case 'nome': return r.nome;
        case 'massa': return r.massa;
        case 'sigma': return r.sigma;
        case 'resistenza': return r.resistenza;
        case 'utilizzo': return r.sfruttamentoMassimo;
        case 'cs': return r.coefficienteMinimo;
        case 'spostamento': return r.spostamentoMassimo;
        // chi verifica prima, chi no dopo: è l'ordinamento utile
        case 'esito': return (r.verificato && r.stabile) ? 0 : 1;
        case 'costo': return r.costo ?? Number.POSITIVE_INFINITY;
      }
    };
    return [...righe].sort((a, b) => {
      const x = chiave(a), y = chiave(b);
      const c = typeof x === 'string' && typeof y === 'string'
        ? x.localeCompare(y)
        // i valori non calcolabili vanno in fondo in ogni caso, non in cima
        : (Number.isFinite(x as number) ? (x as number) : Infinity)
          - (Number.isFinite(y as number) ? (y as number) : Infinity);
      return crescente ? c : -c;
    });
  }, [righe, ordine, crescente]);

  const senzaResistenza = righe.filter((r) => !Number.isFinite(r.resistenza));

  const intestazione = (c: typeof COLONNE[number]) => (
    <th
      key={c.id}
      title={c.spiega}
      className={`whitespace-nowrap px-2 align-bottom font-normal leading-tight ${
        c.id === 'nome' ? 'pl-3 text-left' : 'text-right'}`}
      style={{ color: ordine === c.id ? 'var(--accento)' : 'var(--testo-debole)' }}
    >
      <button type="button" onClick={() => {
        if (ordine === c.id) setCrescente((v) => !v);
        else { setOrdine(c.id); setCrescente(true); }
      }}>
        <span className="block">
          {c.testo}{ordine === c.id ? (crescente ? ' ↑' : ' ↓') : ''}
        </span>
        {c.unita ? <span className="block opacity-60">{c.unita}</span> : null}
      </button>
    </th>
  );

  return (
    <div>
      {/*
        §3.3 — il paragrafo è diventato una riga, e la spiegazione un
        suggerimento: che l'analisi sia rifatta per ogni materiale serve
        saperlo una volta, non ogni volta che si apre il pannello.
      */}
      <p
        className="px-3 pb-1"
        title="Stessa geometria, stessi vincoli, stessi carichi, stesse sezioni: cambia solo il materiale di tutte le aste, e l'analisi viene rifatta per ciascuno. Modificando la struttura questi numeri cambiano."
        style={{ color: 'var(--testo-debole)', fontSize: 'var(--t-minuto)' }}
      >
        Analisi rifatta per ogni materiale, sulla struttura in esame.
      </p>

      <div className="flex items-center gap-2 px-3 pb-2">
        <span className="numerico text-[length:var(--t-minuto)]" style={{ color: 'var(--testo-debole)' }}>
          {inCorso ? `${righe.length}/${MATERIALI.length}…` : `${righe.length} materiali`}
        </span>
        <Bottone onClick={() => { generazione.current++; setRighe([]); setInCorso(false); }}
                 titolo="Interrompe il ricalcolo in corso">
          {inCorso ? 'ferma' : 'aggiornato'}
        </Bottone>
      </div>

      <div className="overflow-x-auto">
        {/*
          NOVE COLONNE CON L'INTESTAZIONE PER ESTESO non stanno nei 288 px del
          pannello, e stringerle le riduceva a sigle («sfrutt», «δ») che è
          proprio ciò che il §3.1 chiede di togliere. La tabella prende la
          larghezza che le serve e SCORRE dentro il suo contenitore: un nome
          leggibile che va cercato scorrendo vale più di una sigla sempre
          visibile e da interpretare.
        */}
        <table className="numerico w-max min-w-full text-[length:var(--t-minuto)]">
          <thead>
            <tr>
              {COLONNE.map(intestazione)}
            </tr>
          </thead>
          <tbody>
            {ordinate.map((r) => {
              const assegnato = r.materialeId === (materialeAssegnato as unknown as string);
              const passa = r.verificato && r.stabile;
              const motivo = !Number.isFinite(r.resistenza)
                ? 'S_y non dichiarata'
                : !r.verificato ? 'non verifica a resistenza'
                : !r.stabile ? 'instabile a compressione' : '';
              return (
                <tr key={r.materialeId}
                    title={`${r.nome} — E ${(materialePerId(r.materialeId as never).E / 1e9).toFixed(0)} GPa`
                      + ` · ρ ${r.rho} kg/m³`
                      + `${Number.isFinite(r.resistenza) ? ` · f ${(r.resistenza / 1e6).toFixed(0)} MPa` : ''}`
                      + `${motivo ? ` — ${motivo}` : ''}`}
                    style={{
                      background: assegnato ? 'var(--sfondo-elevato)' : 'transparent',
                    }}>
                  {/*
                    Il nome NON va a capo: una riga per materiale è ciò che
                    rende la tabella confrontabile a colpo d'occhio, ed è il
                    motivo per cui è una tabella e non un elenco di schede.
                  */}
                  <td className="whitespace-nowrap py-1 px-2 pl-3"
                      style={{ color: assegnato ? 'var(--accento)' : 'var(--testo-attenuato)' }}>
                    {r.nome}
                  </td>
                  <td className="px-2 text-right" style={{ color: 'var(--testo-attenuato)' }}>
                    {num(r.massa, 0)}
                  </td>
                  <td className="px-2 text-right" style={{ color: 'var(--testo-attenuato)' }}>
                    {Number.isFinite(r.sigma) ? num(r.sigma / 1e6, 0) : '—'}
                  </td>
                  <td className="px-2 text-right" style={{ color: 'var(--testo-attenuato)' }}>
                    {Number.isFinite(r.resistenza) ? num(r.resistenza / 1e6, 0) : '—'}
                  </td>
                  <td className="px-2 text-right"
                      style={{ color: r.verificato ? 'var(--testo-attenuato)' : 'var(--errore)' }}>
                    {Number.isFinite(r.sfruttamentoMassimo)
                      ? num(r.sfruttamentoMassimo * 100, 0) : '—'}
                  </td>
                  <td className="px-2 text-right"
                      style={{ color: passa ? 'var(--ok)' : 'var(--errore)' }}>
                    {Number.isFinite(r.coefficienteMinimo)
                      ? num(r.coefficienteMinimo, 2) : '—'}
                  </td>
                  <td className="px-2 text-right" style={{ color: 'var(--testo-attenuato)' }}>
                    {freccia(r.spostamentoMassimo)}
                  </td>
                  {/*
                    L'ESITO in chiaro. Prima era una crocetta davanti al nome,
                    e una crocetta non dice se il materiale non verifica o se
                    sbanda: il motivo sta nel suggerimento, la colonna dice
                    almeno quale delle due cose è.
                  */}
                  <td className="whitespace-nowrap px-2 text-right"
                      title={motivo || 'verifica a resistenza ed è stabile'}
                      style={{ color: passa ? 'var(--ok)' : 'var(--errore)' }}>
                    {passa ? '✓' : !Number.isFinite(r.resistenza) ? '— S_y'
                      : !r.verificato ? '✗ resist.' : '✗ instab.'}
                  </td>
                  <td className="px-2 pr-3 text-right" style={{ color: 'var(--testo-attenuato)' }}>
                    {r.costo !== null ? num(r.costo, 0) : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {senzaResistenza.length > 0 && (
        <p className="px-3 pt-2 text-[length:var(--t-minuto)] leading-relaxed"
           style={{ color: 'var(--errore)' }}>
          Senza tensione di snervamento, e quindi senza verifica:{' '}
          {senzaResistenza.map((r) => r.nome).join(', ')}. Il dato va inserito
          in Materiali; qui non viene inventato.
        </p>
      )}

      <p
        className="px-3 pt-2"
        title={'«resist.» non passa la verifica di resistenza, «instab.» sbanda a '
          + 'compressione. Un materiale che non verifica può essere comunque il più '
          + 'leggero o il più economico: è il motivo per cui le colonne stanno vicine.'}
        style={{ color: 'var(--testo-debole)', fontSize: 'var(--t-minuto)' }}
      >
        Riga evidenziata: il materiale assegnato. La tabella scorre in orizzontale.
      </p>
    </div>
  );
}

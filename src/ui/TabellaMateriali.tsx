/**
 * §2 — TABELLA DELLE PROPRIETÀ DEI MATERIALI.
 *
 * È la tabella dei DATI D'INGRESSO: E, ν, ρ, S_y, α — quello che il materiale
 * è, indipendentemente dalla struttura. Da non confondere con il confronto fra
 * materiali, che mostra invece l'effetto sulla struttura in esame e vive in un
 * altro pannello: le proprietà costanti stanno qui e non si ripetono là.
 *
 * LE BARRE sono la ragione per cui questa tabella esisteva ed era più chiara di
 * un elenco di numeri: normalizzate sull'insieme mostrato, dicono a colpo
 * d'occhio chi è il più rigido e chi il più leggero senza leggere una cifra.
 *
 * IL VINCOLO CHE PRIMA MANCAVA: la tabella deve STARE NELLA LARGHEZZA del
 * pannello. Una tabella che si legge trascinando di lato non si legge. Perciò
 * si mostrano poche colonne per default, l'utente ne aggiunge quante ne
 * vuole, e quando non entrano più il programma lo dice invece di far scorrere.
 * Sotto una certa larghezza la tabella diventa un elenco di schede: comprimere
 * sei colonne in duecento pixel non è una tabella, è una macchia.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../state/store.js';
import { MATERIALI } from '../core/materials/materials.js';
import type { Materiale } from '../core/model/types.js';

// ═══════════════════════ LE GRANDEZZE ═══════════════════════

export interface Grandezza {
  id: string;
  /** intestazione breve: sta in colonna */
  sigla: string;
  /** nome esteso, nel suggerimento */
  nome: string;
  unita: string;
  /** larghezza indicativa in caratteri, per dare alla colonna il suo spazio */
  cifre: number;
  colore: (t: { accento: string }) => string;
  valore: (m: Materiale) => number | null;
  scrivi: (v: number) => string;
}

const C = {
  E: 'var(--accento)',
  nu: 'var(--testo-attenuato)',
  rho: 'var(--momento)',
  fy: 'var(--ok)',
  fu: 'var(--taglio)',
  alpha: 'var(--deformata)',
  gamma: 'var(--testo-debole)',
  costo: 'var(--reazione)',
};

export const GRANDEZZE: Grandezza[] = [
  {
    id: 'E', sigla: 'E', nome: 'Modulo di Young', unita: 'GPa', cifre: 3,
    colore: () => C.E, valore: (m) => m.E / 1e9, scrivi: (v) => v.toFixed(0),
  },
  {
    id: 'fy', sigla: 'Sy', nome: 'Resistenza di snervamento', unita: 'MPa', cifre: 4,
    colore: () => C.fy,
    valore: (m) => (m.resistenze.fy !== undefined ? m.resistenze.fy / 1e6 : null),
    scrivi: (v) => v.toFixed(0),
  },
  {
    id: 'rho', sigla: 'ρ', nome: 'Densità', unita: 'kg/m³', cifre: 4,
    colore: () => C.rho, valore: (m) => m.rho, scrivi: (v) => v.toFixed(0),
  },
  {
    id: 'nu', sigla: 'ν', nome: 'Coefficiente di Poisson', unita: '', cifre: 4,
    colore: () => C.nu, valore: (m) => m.nu, scrivi: (v) => v.toFixed(2),
  },
  {
    id: 'fu', sigla: 'Su', nome: 'Resistenza a rottura', unita: 'MPa', cifre: 4,
    colore: () => C.fu,
    valore: (m) => (m.resistenze.fu !== undefined ? m.resistenze.fu / 1e6 : null),
    scrivi: (v) => v.toFixed(0),
  },
  {
    id: 'alpha', sigla: 'α', nome: 'Dilatazione termica', unita: '10⁻⁶/°C', cifre: 4,
    colore: () => C.alpha, valore: (m) => m.alpha * 1e6, scrivi: (v) => v.toFixed(1),
  },
  {
    id: 'gammaM', sigla: 'γM', nome: 'Coefficiente parziale di sicurezza',
    unita: '', cifre: 4,
    colore: () => C.gamma, valore: (m) => m.gammaM, scrivi: (v) => v.toFixed(2),
  },
  {
    id: 'costo', sigla: '€/kg', nome: 'Costo indicativo', unita: '€/kg', cifre: 4,
    colore: () => C.costo,
    valore: (m) => m.costoEuroKg ?? null, scrivi: (v) => v.toFixed(2),
  },
];

/**
 * Le colonne accese all'avvio.
 *
 * Tre: sono quelle che si guardano per prime e stanno comodamente in un
 * pannello da 288 px insieme al nome. Le altre si aggiungono, e la scelta
 * resta.
 */
const PREDEFINITE = ['E', 'fy', 'rho'];

const CHIAVE = 'vektorlab.materiali.colonne';

function leggiScelte(): string[] {
  try {
    const s = localStorage.getItem(CHIAVE);
    if (s) {
      const v = JSON.parse(s) as string[];
      const validi = v.filter((x) => GRANDEZZE.some((g) => g.id === x));
      if (validi.length > 0) return validi;
    }
  } catch { /* localStorage può essere negato */ }
  return [...PREDEFINITE];
}

// ═══════════════════════ LARGHEZZE ═══════════════════════

/**
 * Larghezza stimata di una colonna, in pixel.
 *
 * Proporzionale al CONTENUTO, non fissa: la colonna di ν porta «0,30» e non ha
 * bisogno dello spazio di ρ, che porta «7850». Sette pixel per cifra è la
 * larghezza di una cifra monospaziata a 12 px, più il posto per la barra.
 */
export function larghezzaColonna(g: Grandezza): number {
  const perCifre = g.cifre * 7 + 10;
  const perSigla = g.sigla.length * 7 + 10;
  return Math.max(46, perCifre, perSigla);
}

/**
 * Quante delle colonne scelte entrano davvero, e che cosa fare.
 *
 * È una funzione pura perché è la regola del §2.2 e va verificata come tale:
 * una tabella che sborda si scopre solo guardando, ma la decisione di NON far
 * sbordare si può mettere alla prova.
 */
export function impaginazione(
  colonne: Grandezza[], larghezza: number,
): { modo: 'tabella' | 'schede'; entrano: number; traboccano: number } {
  if (larghezza > 0 && larghezza < SOGLIA_SCHEDE) {
    return { modo: 'schede', entrano: colonne.length, traboccano: 0 };
  }
  let usata = LARGHEZZA_NOME;
  let n = 0;
  for (const g of colonne) {
    const w = larghezzaColonna(g);
    if (usata + w > larghezza) break;
    usata += w; n++;
  }
  return { modo: 'tabella', entrano: n, traboccano: colonne.length - n };
}

/** Spazio minimo che il nome del materiale deve conservare. */
export const LARGHEZZA_NOME = 92;
/** Sotto questa larghezza una tabella non è più leggibile: si passa a schede. */
export const SOGLIA_SCHEDE = 210;

// ═══════════════════════ IL COMPONENTE ═══════════════════════

export function TabellaMateriali() {
  const progetto = useStore((s) => s.progetto);
  const assegnato = (progetto.materialePredefinito as unknown as string)
    ?? (progetto.aste[0]?.materialeId as unknown as string);

  const [scelte, setScelte] = useState<string[]>(leggiScelte);
  const [apriSelettore, setApriSelettore] = useState(false);
  const contenitore = useRef<HTMLDivElement>(null);
  const [larghezza, setLarghezza] = useState(288);

  /*
   * La larghezza si MISURA, non si indovina: il pannello destro è
   * ridimensionabile, e una tabella che decide le sue colonne su una
   * larghezza presunta sborda appena qualcuno trascina il bordo.
   */
  useEffect(() => {
    const el = contenitore.current;
    if (!el) return;
    const osserva = new ResizeObserver(([e]) => {
      setLarghezza(Math.round(e.contentRect.width));
    });
    osserva.observe(el);
    setLarghezza(Math.round(el.getBoundingClientRect().width));
    return () => osserva.disconnect();
  }, []);

  const materiali = useMemo(
    () => [...MATERIALI, ...progetto.materialiPersonalizzati],
    [progetto.materialiPersonalizzati],
  );

  const colonne = useMemo(
    () => GRANDEZZE.filter((g) => scelte.includes(g.id)),
    [scelte],
  );

  const { modo, entrano, traboccano } = useMemo(
    () => impaginazione(colonne, larghezza), [colonne, larghezza],
  );

  const cambia = (id: string) => {
    const nuovo = scelte.includes(id)
      ? scelte.filter((x) => x !== id)
      : [...scelte, id];
    if (nuovo.length === 0) return;      // almeno una colonna, o non è una tabella
    setScelte(nuovo);
    try { localStorage.setItem(CHIAVE, JSON.stringify(nuovo)); } catch { /* pazienza */ }
  };

  /** Estremi per normalizzare le barre, sull'insieme MOSTRATO. */
  const estremi = useMemo(() => {
    const m = new Map<string, { min: number; max: number }>();
    for (const g of colonne) {
      const v = materiali.map(g.valore).filter((x): x is number => x !== null);
      if (v.length === 0) continue;
      m.set(g.id, { min: Math.min(...v), max: Math.max(...v) });
    }
    return m;
  }, [colonne, materiali]);

  const aSchede = modo === 'schede';

  return (
    <div ref={contenitore}>
      <Selettore
        aperto={apriSelettore}
        alterna={() => setApriSelettore((v) => !v)}
        scelte={scelte}
        cambia={cambia}
        limite={entrano}
      />

      {traboccano > 0 && !aSchede && (
        /*
          §2.2 — SI AVVISA, NON SI FA SCORRERE. Trascinare una tabella di lato
          per leggerla è il modo più veloce di renderla inutile: meglio dire
          che due colonne non ci stanno e lasciar scegliere quali togliere.
        */
        <p className="px-3 pb-1" style={{ color: 'var(--avviso)', fontSize: 'var(--t-minuto)' }}>
          {traboccano === 1 ? 'Una colonna non entra' : `${traboccano} colonne non entrano`}
          {' '}nella larghezza del pannello: togline qualcuna o allarga il pannello.
        </p>
      )}

      {aSchede
        ? <Schede materiali={materiali} colonne={colonne} assegnato={assegnato} />
        : (
          <Tabella
            materiali={materiali}
            colonne={colonne.slice(0, Math.max(1, entrano))}
            estremi={estremi}
            assegnato={assegnato}
          />
        )}
    </div>
  );
}

// ═══════════════════════ SELETTORE DELLE COLONNE ═══════════════════════

function Selettore({ aperto, alterna, scelte, cambia, limite }: {
  aperto: boolean; alterna: () => void;
  scelte: string[]; cambia: (id: string) => void; limite: number;
}) {
  return (
    <div className="px-3 pb-1">
      <button
        type="button"
        onClick={alterna}
        aria-expanded={aperto}
        className="btn btn-minore btn-piena"
        style={{ justifyContent: 'space-between' }}
      >
        <span>grandezze mostrate ({scelte.length})</span>
        <span style={{ color: 'var(--testo-debole)' }}>{aperto ? '−' : '+'}</span>
      </button>
      {aperto && (
        <div className="riga-controlli" style={{ paddingTop: 'var(--s2)' }}>
          {GRANDEZZE.map((g) => {
            const attiva = scelte.includes(g.id);
            // oltre il limite che entra, aggiungerne una farebbe traboccare:
            // il bottone resta premibile ma dice che cosa succederà
            const oltre = !attiva && scelte.length >= limite;
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => cambia(g.id)}
                aria-pressed={attiva}
                title={oltre
                  ? `${g.nome} — non entrerebbe: allarga il pannello o togli una colonna`
                  : `${g.nome}${g.unita ? ` [${g.unita}]` : ''}`}
                className={`btn btn-minore${attiva ? ' attivo' : ''}`}
                style={oltre ? { borderColor: 'var(--avviso)' } : undefined}
              >
                {g.sigla}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════ LA TABELLA ═══════════════════════

function Tabella({ materiali, colonne, estremi, assegnato }: {
  materiali: Materiale[];
  colonne: Grandezza[];
  estremi: Map<string, { min: number; max: number }>;
  assegnato: string | undefined;
}) {
  return (
    <table
      className="numerico"
      style={{
        fontSize: 'var(--t-minuto)',
        // il margine è quello dei pannelli: senza, l'ultima colonna toccava il
        // bordo e i numeri sembravano tagliati
        width: 'calc(100% - var(--s3))',
        marginLeft: 'var(--s1)',
      }}
    >
      <colgroup>
        <col />
        {colonne.map((g) => <col key={g.id} style={{ width: larghezzaColonna(g) }} />)}
      </colgroup>
      <thead>
        <tr>
          <th className="pl-3 text-left font-normal"
              style={{ color: 'var(--testo-debole)' }}>materiale</th>
          {colonne.map((g) => (
            <th
              key={g.id}
              title={`${g.nome}${g.unita ? ` — ${g.unita}` : ''}`}
              className="pr-2 text-right font-normal"
              style={{ color: g.colore({ accento: 'var(--accento)' }) }}
            >
              {g.sigla}
              {g.unita && (
                <span className="block" style={{ color: 'var(--testo-debole)', opacity: 0.8 }}>
                  {g.unita}
                </span>
              )}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {materiali.map((m) => {
          const suo = (m.id as unknown as string) === assegnato;
          return (
            <tr
              key={m.id as unknown as string}
              title={m.nome}
              style={{ background: suo ? 'var(--sfondo-elevato)' : 'transparent' }}
            >
              {/*
                Il nome NON ha una larghezza fissa: si prende quello che resta
                dopo le colonne dei numeri. Con tre grandezze accese ci sta per
                intero, con sei si tronca — ed è giusto così, perché a quel
                punto è il confronto fra numeri che si sta guardando. Il nome
                intero resta nel suggerimento della riga.
              */}
              <td
                className="truncate pl-3"
                style={{
                  color: suo ? 'var(--accento)' : 'var(--testo-attenuato)',
                  maxWidth: 0,
                  height: 'var(--h-controllo-minore)',
                }}
              >
                {m.nome}
              </td>
              {colonne.map((g) => (
                <Cella key={g.id} g={g} m={m} estremi={estremi.get(g.id)} />
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/**
 * Una cella: il numero, e sotto la barra.
 *
 * La barra è alta due pixel e sta SOTTO il valore, non dietro: dietro
 * renderebbe il numero meno leggibile proprio nelle righe che contano di più,
 * quelle con la barra piena.
 */
function Cella({ g, m, estremi }: {
  g: Grandezza; m: Materiale; estremi?: { min: number; max: number };
}) {
  const v = g.valore(m);
  const colore = g.colore({ accento: 'var(--accento)' });

  if (v === null) {
    return (
      <td className="pr-2 text-right" style={{ color: 'var(--testo-debole)' }}>—</td>
    );
  }

  /*
   * NORMALIZZAZIONE. Dal minimo al massimo dell'insieme mostrato, non da zero:
   * partendo da zero le densità dei metalli — tutte fra 2700 e 7850 — darebbero
   * barre quasi identiche, e la barra non direbbe niente. Il minimo conserva
   * comunque un filo di barra, o sembrerebbe un dato mancante.
   */
  const frazione = estremi && estremi.max > estremi.min
    ? 0.08 + 0.92 * ((v - estremi.min) / (estremi.max - estremi.min))
    : 1;

  return (
    <td className="pr-2 align-middle">
      <div className="text-right" style={{ color: 'var(--testo)' }}>{g.scrivi(v)}</div>
      <div style={{ height: 2, background: 'var(--bordo)', borderRadius: 1 }}>
        <div style={{
          width: `${Math.round(frazione * 100)}%`,
          height: '100%',
          background: colore,
          borderRadius: 1,
          marginLeft: 'auto',
        }} />
      </div>
    </td>
  );
}

// ═══════════════════════ SCHEDE, A PANNELLO STRETTO ═══════════════════════

/**
 * §2.2 punto 6 — sotto i 210 px la tabella diventa un elenco di schede.
 *
 * Comprimere quattro colonne in duecento pixel produce numeri troncati e
 * intestazioni illeggibili: una scheda per materiale occupa più righe ma
 * ciascuna resta leggibile, che è l'unica cosa che conta a quella larghezza.
 */
function Schede({ materiali, colonne, assegnato }: {
  materiali: Materiale[]; colonne: Grandezza[]; assegnato: string | undefined;
}) {
  return (
    <div className="px-3" style={{ display: 'grid', gap: 'var(--s2)' }}>
      {materiali.map((m) => {
        const suo = (m.id as unknown as string) === assegnato;
        return (
          <div
            key={m.id as unknown as string}
            className="rounded-[var(--raggio-controllo)] border"
            style={{
              borderColor: suo ? 'var(--accento)' : 'var(--bordo)',
              background: suo ? 'var(--sfondo-elevato)' : 'transparent',
              padding: 'var(--s2)',
              borderRadius: 'var(--raggio-controllo)',
            }}
          >
            <div style={{
              color: suo ? 'var(--accento)' : 'var(--testo)',
              fontSize: 'var(--t-etichetta)',
            }}>{m.nome}</div>
            <div className="numerico" style={{ fontSize: 'var(--t-minuto)' }}>
              {colonne.map((g) => {
                const v = g.valore(m);
                return (
                  <div key={g.id} className="flex justify-between"
                       style={{ color: 'var(--testo-attenuato)' }}>
                    <span title={g.nome}>{g.sigla}{g.unita ? ` [${g.unita}]` : ''}</span>
                    <span style={{ color: 'var(--testo)' }}>
                      {v === null ? '—' : g.scrivi(v)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

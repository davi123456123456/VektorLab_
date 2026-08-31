/**
 * Confronto fra materiali a struttura e carichi invariati.
 *
 * Serve a vedere un COMPROMESSO, non un vincitore: l'acciaio è resistente e
 * pesante, l'alluminio leggero e cedevole, il legno economico e poco rigido.
 * Nessun materiale vince su tutte le colonne, e il senso del pannello è
 * proprio rendere visibile dove ciascuno perde.
 *
 * DUE FAMIGLIE DI GRANDEZZE, e non vanno confuse:
 *
 *   · le PROPRIETÀ del materiale — resistenza, rigidezza, densità, prezzo —
 *     che sono dati di targa e non dipendono dalla struttura;
 *   · gli ESITI su questa struttura — peso, freccia, sfruttamento, costo —
 *     che si ottengono rifacendo l'analisi con quel materiale, perché in una
 *     struttura iperstatica la ripartizione delle sollecitazioni dipende
 *     dalle rigidezze.
 *
 * E due grandezze specifiche, che sono quelle su cui si sceglie davvero:
 * resistenza e rigidezza divise per la densità.
 *
 * IL COLORE HA UN SOLO SIGNIFICATO: verde è meglio, rosso è peggio. Quale dei
 * due estremi sia il migliore dipende dalla grandezza — per il peso vince il
 * minimo, per la resistenza il massimo — e la scala lo ribalta di
 * conseguenza. Prima il verde marcava il minimo di ogni colonna, e sulla
 * resistenza segnalava quindi il materiale peggiore.
 */

import { useState } from 'react';
import { useStore } from '../state/store.js';
import { confrontaMateriali, type RigaConfronto } from '../core/checks/confronto.js';
import { MATERIALI } from '../core/materials/materials.js';
import { Bottone } from './Pannelli.js';

interface Grandezza {
  chiave: string;
  nome: string;
  unita: string;
  /** true se un valore ALTO è preferibile */
  altoMeglio: boolean;
  valore: (r: RigaConfronto) => number;
  /** come si scrive il numero */
  scrivi: (v: number) => string;
  spiegazione: string;
}

const GRANDEZZE: Grandezza[] = [
  {
    chiave: 'resistenza', nome: 'resistenza', unita: 'MPa', altoMeglio: true,
    valore: (r) => r.resistenza / 1e6,
    scrivi: (v) => v.toFixed(0),
    spiegazione: 'Snervamento, o rottura dove lo snervamento non è definito.',
  },
  {
    chiave: 'rigidezza', nome: 'rigidezza E', unita: 'GPa', altoMeglio: true,
    valore: (r) => r.E / 1e9,
    scrivi: (v) => v.toFixed(0),
    spiegazione: 'Modulo di Young: governa la freccia, non la resistenza.',
  },
  {
    chiave: 'densita', nome: 'densità', unita: 'kg/m³', altoMeglio: false,
    valore: (r) => r.rho,
    scrivi: (v) => v.toFixed(0),
    spiegazione: 'Proprietà del materiale, indipendente dalla struttura.',
  },
  {
    chiave: 'resistenzaSpecifica', nome: 'resistenza / densità', unita: 'kNm/kg',
    altoMeglio: true,
    valore: (r) => r.resistenza / r.rho / 1e3,
    scrivi: (v) => v.toFixed(1),
    spiegazione: 'Quanto rende ogni chilo. È il criterio con cui si sceglie '
      + 'quando il peso conta: l\'alluminio batte l\'acciaio pur essendo più debole.',
  },
  {
    chiave: 'rigidezzaSpecifica', nome: 'rigidezza / densità', unita: 'MNm/kg',
    altoMeglio: true,
    valore: (r) => r.E / r.rho / 1e6,
    scrivi: (v) => v.toFixed(1),
    spiegazione: 'Quasi identica per tutti i metalli: è il motivo per cui '
      + 'cambiare lega non riduce la freccia a parità di peso.',
  },
  {
    chiave: 'prezzoKg', nome: 'prezzo', unita: '€/kg', altoMeglio: false,
    valore: (r) => r.costoEuroKg ?? NaN,
    scrivi: (v) => v.toFixed(2),
    spiegazione: 'Prezzo indicativo di materia prima, non di opera finita.',
  },
  {
    chiave: 'massa', nome: 'peso della struttura', unita: 'kg', altoMeglio: false,
    valore: (r) => r.massa,
    scrivi: (v) => v.toFixed(0),
    spiegazione: 'Con queste sezioni e questa geometria.',
  },
  {
    chiave: 'freccia', nome: 'freccia massima', unita: 'mm', altoMeglio: false,
    valore: (r) => r.spostamentoMassimo * 1e3,
    scrivi: (v) => v.toFixed(1),
    spiegazione: 'Spostamento massimo sotto i carichi correnti.',
  },
  {
    chiave: 'sfruttamento', nome: 'sfruttamento', unita: '%', altoMeglio: false,
    valore: (r) => r.sfruttamentoMassimo * 100,
    scrivi: (v) => v.toFixed(0),
    spiegazione: 'Oltre il 100 % la sezione non verifica.',
  },
  {
    chiave: 'costo', nome: 'costo della struttura', unita: '€', altoMeglio: false,
    valore: (r) => r.costo ?? NaN,
    scrivi: (v) => v.toFixed(0),
    spiegazione: 'Peso per prezzo specifico.',
  },
];

/**
 * Verde per il migliore, rosso per il peggiore, con i toni intermedi in mezzo.
 * La posizione è normalizzata sull'intervallo dei valori presenti, così la
 * scala usa tutta la sua gamma anche quando i materiali si somigliano.
 */
function tinta(posizione: number): string {
  const p = Math.min(1, Math.max(0, posizione));
  // da 140° (verde) a 8° (rosso), passando per il giallo
  const tono = 140 - 132 * p;
  return `hsl(${tono.toFixed(0)}, 62%, 58%)`;
}

export function ConfrontoMateriali() {
  const progetto = useStore((s) => s.progetto);
  const sorgente = useStore((s) => s.sorgenteRisultati);
  const [righe, setRighe] = useState<RigaConfronto[] | null>(null);
  const [inCorso, setInCorso] = useState(false);
  const [scelta, setScelta] = useState(GRANDEZZE[0].chiave);

  const calcola = () => {
    setInCorso(true);
    // il calcolo è sincrono ma pesante: si lascia respirare l'interfaccia
    setTimeout(() => {
      try {
        setRighe(confrontaMateriali(progetto, sorgente, MATERIALI));
      } finally {
        setInCorso(false);
      }
    }, 0);
  };

  const g = GRANDEZZE.find((x) => x.chiave === scelta) ?? GRANDEZZE[0];

  const misurate = (righe ?? [])
    .map((r) => ({ r, v: g.valore(r) }))
    .filter((x) => Number.isFinite(x.v));
  const senzaDato = (righe ?? []).filter((r) => !Number.isFinite(g.valore(r)));

  const valori = misurate.map((x) => x.v);
  const min = valori.length ? Math.min(...valori) : 0;
  const max = valori.length ? Math.max(...valori) : 1;
  const gamma = max - min || 1;

  // ordinate dalla migliore alla peggiore: l'ordine È l'informazione, e
  // lasciarlo alfabetico costringerebbe a leggere tutte le righe per trovarla
  const ordinate = [...misurate].sort((a, b) => (g.altoMeglio ? b.v - a.v : a.v - b.v));

  return (
    <div>
      <div className="px-3 pb-2">
        <Bottone larghezzaPiena attivo={!righe} onClick={calcola}>
          {inCorso ? 'confronto in corso…' : righe ? 'ricalcola confronto' : 'confronta i materiali'}
        </Bottone>
      </div>

      {righe && (
        <>
          <div className="flex flex-wrap gap-1 px-3 pb-1.5">
            {GRANDEZZE.map((x) => (
              <Bottone key={x.chiave} attivo={scelta === x.chiave}
                       titolo={x.spiegazione}
                       onClick={() => setScelta(x.chiave)}>
                {x.nome}
              </Bottone>
            ))}
          </div>

          <div className="px-3 pb-1">
            <div className="flex items-baseline justify-between text-[10px]">
              <span style={{ color: 'var(--testo-attenuato)' }}>
                {g.nome} <span style={{ color: 'var(--testo-debole)' }}>[{g.unita}]</span>
              </span>
              <span style={{ color: 'var(--testo-debole)' }}>
                {g.altoMeglio ? 'più alto è meglio' : 'più basso è meglio'}
              </span>
            </div>
            <p className="pt-0.5 text-[9.5px] leading-relaxed"
               style={{ color: 'var(--testo-debole)' }}>
              {g.spiegazione}
            </p>
          </div>

          <div className="space-y-[3px] px-3 pt-1">
            {ordinate.map(({ r, v }, i) => {
              // posizione nella scala: 0 = il migliore, 1 = il peggiore
              const posizione = g.altoMeglio ? (max - v) / gamma : (v - min) / gamma;
              // la barra è lunga in proporzione al VALORE, non al merito:
              // altrimenti «densità 7850» e «densità 2700» darebbero barre di
              // lunghezza invertita rispetto al numero scritto accanto
              const lunghezza = max > 0 ? Math.max(2, (v / max) * 100) : 2;
              const colore = tinta(posizione);
              const fallisce = !r.verificato || !r.stabile;
              return (
                <div key={r.materialeId}
                     title={`${r.comportamento}`
                       + (r.errore ? ` — ${r.errore}` : '')
                       + (!r.verificato ? ' — non verifica a resistenza' : '')
                       + (!r.stabile ? ' — instabile a compressione' : '')}>
                  <div className="flex items-baseline justify-between gap-2 text-[10px]">
                    <span className="truncate"
                          style={{ color: i === 0 ? 'var(--testo)' : 'var(--testo-attenuato)' }}>
                      {fallisce && (
                        <span style={{ color: 'var(--errore)' }} title="non verifica">✗ </span>
                      )}
                      {r.nome}
                    </span>
                    <span className="numerico shrink-0" style={{ color: colore }}>
                      {g.scrivi(v)}
                    </span>
                  </div>
                  <div className="h-[3px] w-full rounded-full"
                       style={{ background: 'var(--sfondo-elevato)' }}>
                    <div className="h-full rounded-full"
                         style={{ width: `${lunghezza}%`, background: colore }} />
                  </div>
                </div>
              );
            })}
          </div>

          {senzaDato.length > 0 && (
            <p className="px-3 pt-2 text-[9.5px] leading-relaxed"
               style={{ color: 'var(--testo-debole)' }}>
              Senza dato per questa grandezza:{' '}
              {senzaDato.map((r) => r.nome).join(', ')}.
            </p>
          )}

          <p className="px-3 pt-2 text-[9.5px] leading-relaxed"
             style={{ color: 'var(--testo-debole)' }}>
            Verde il migliore, rosso il peggiore. La croce rossa marca i
            materiali che non verificano o che sbandano a compressione: possono
            comunque risultare i più leggeri o i più economici, ed è
            esattamente il motivo per cui le due informazioni stanno vicine.
          </p>
        </>
      )}
    </div>
  );
}

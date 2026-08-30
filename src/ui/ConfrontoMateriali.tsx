/**
 * Confronto fra materiali a struttura e carichi invariati.
 *
 * Le colonne sono scelte per mostrare il COMPROMESSO, non un vincitore: peso,
 * freccia, sfruttamento e costo tirano in direzioni diverse, e quasi nessun
 * materiale vince su tutte.
 */

import { useState } from 'react';
import { useStore } from '../state/store.js';
import { confrontaMateriali, type RigaConfronto } from '../core/checks/confronto.js';
import { MATERIALI } from '../core/materials/materials.js';
import { Bottone } from './Pannelli.js';

export function ConfrontoMateriali() {
  const progetto = useStore((s) => s.progetto);
  const sorgente = useStore((s) => s.sorgenteRisultati);
  const [righe, setRighe] = useState<RigaConfronto[] | null>(null);
  const [inCorso, setInCorso] = useState(false);
  const [ordine, setOrdine] = useState<keyof RigaConfronto>('massa');

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

  const ordinate = righe
    ? [...righe].sort((a, b) => {
        const x = a[ordine], y = b[ordine];
        if (typeof x === 'number' && typeof y === 'number') {
          const ax = Number.isFinite(x) ? x : Infinity;
          const ay = Number.isFinite(y) ? y : Infinity;
          return ax - ay;
        }
        return String(x).localeCompare(String(y));
      })
    : [];

  const minimo = (f: (r: RigaConfronto) => number) =>
    ordinate.length ? Math.min(...ordinate.map(f).filter(Number.isFinite)) : 0;
  const massaMin = minimo((r) => r.massa);
  const frecciaMin = minimo((r) => r.spostamentoMassimo);

  return (
    <div>
      <p className="px-3 pb-2 text-[10px] leading-relaxed" style={{ color: 'var(--testo-debole)' }}>
        Stessa geometria, stesse sezioni, stessi carichi: cambia solo il
        materiale di tutte le aste. L'analisi viene rifatta per ciascuno, perché
        in una struttura iperstatica la ripartizione delle sollecitazioni dipende
        dalle rigidezze.
      </p>
      <div className="px-3 pb-2">
        <Bottone larghezzaPiena attivo={!righe} onClick={calcola}>
          {inCorso ? 'confronto in corso…' : righe ? 'ricalcola confronto' : 'confronta i materiali'}
        </Bottone>
      </div>

      {righe && (
        <>
          <div className="flex flex-wrap gap-1 px-3 pb-1">
            {([
              ['massa', 'peso'], ['spostamentoMassimo', 'freccia'],
              ['sfruttamentoMassimo', 'sfruttamento'], ['costo', 'costo'],
            ] as const).map(([k, etichetta]) => (
              <Bottone key={k} attivo={ordine === k}
                       onClick={() => setOrdine(k as keyof RigaConfronto)}>
                {etichetta}
              </Bottone>
            ))}
          </div>

          <div className="overflow-x-auto px-3">
            <table className="numerico w-full text-[10px]">
              <thead>
                <tr style={{ color: 'var(--testo-debole)' }}>
                  <th className="text-left font-normal">materiale</th>
                  <th className="text-right font-normal">kg</th>
                  <th className="text-right font-normal">δ mm</th>
                  <th className="text-right font-normal">sfrutt.</th>
                  <th className="text-right font-normal">€</th>
                </tr>
              </thead>
              <tbody>
                {ordinate.map((r) => {
                  const ok = r.verificato && r.stabile;
                  return (
                    <tr key={r.materialeId}
                        title={`${r.comportamento}${r.errore ? ` — ${r.errore}` : ''}` +
                               (!r.stabile ? ' — instabile a compressione' : '')}>
                      <td className="py-0.5 pr-2"
                          style={{ color: ok ? 'var(--testo-attenuato)' : 'var(--errore)' }}>
                        {r.nome}
                      </td>
                      <td className="py-0.5 text-right"
                          style={{ color: r.massa <= massaMin * 1.05 ? 'var(--ok)' : 'var(--testo-attenuato)' }}>
                        {r.massa.toFixed(0)}
                      </td>
                      <td className="py-0.5 text-right"
                          style={{ color: r.spostamentoMassimo <= frecciaMin * 1.05
                            ? 'var(--ok)' : 'var(--testo-attenuato)' }}>
                        {Number.isFinite(r.spostamentoMassimo)
                          ? (r.spostamentoMassimo * 1000).toFixed(1) : '—'}
                      </td>
                      <td className="py-0.5 text-right"
                          style={{ color: r.verificato ? 'var(--testo-attenuato)' : 'var(--errore)' }}>
                        {Number.isFinite(r.sfruttamentoMassimo)
                          ? `${(r.sfruttamentoMassimo * 100).toFixed(0)} %` : '—'}
                      </td>
                      <td className="py-0.5 text-right" style={{ color: 'var(--testo-attenuato)' }}>
                        {r.costo !== null ? r.costo.toFixed(0) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="px-3 pt-2 text-[10px] leading-relaxed" style={{ color: 'var(--testo-debole)' }}>
            In verde il minimo di ciascuna colonna. In rosso i materiali che non
            verificano a resistenza o che sbandano a compressione. Passa il
            puntatore su una riga per il comportamento del materiale.
          </p>
        </>
      )}
    </div>
  );
}

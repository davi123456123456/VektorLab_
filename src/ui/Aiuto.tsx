/** Elenco delle scorciatoie, richiamabile con `?`. */

import { SCORCIATOIE } from './shortcuts/useScorciatoie.js';

export function Aiuto({ onChiudi }: { onChiudi: () => void }) {
  const categorie = [...new Set(SCORCIATOIE.map((s) => s.categoria))];
  return (
    <div
      className="absolute inset-0 z-20 flex items-center justify-center p-8"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={onChiudi}
    >
      <div
        className="max-h-full w-full max-w-3xl overflow-auto rounded-lg border p-5"
        style={{ background: 'var(--sfondo-pannello)', borderColor: 'var(--bordo-chiaro)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">Scorciatoie</h2>
          <button type="button" onClick={onChiudi}
                  className="rounded px-2 py-0.5 text-[12px]"
                  style={{ background: 'var(--sfondo-elevato)', color: 'var(--testo-attenuato)' }}>
            chiudi
          </button>
        </div>
        <div className="grid grid-cols-2 gap-x-8 gap-y-4">
          {categorie.map((cat) => (
            <div key={cat}>
              <h3 className="mb-1 text-[10px] font-semibold uppercase tracking-wider"
                  style={{ color: 'var(--testo-debole)' }}>{cat}</h3>
              <table className="w-full text-[12px]">
                <tbody>
                  {SCORCIATOIE.filter((s) => s.categoria === cat).map((s) => (
                    <tr key={s.tasti}>
                      <td className="numerico whitespace-nowrap py-0.5 pr-3 align-top"
                          style={{ color: 'var(--accento)' }}>{s.tasti}</td>
                      <td className="py-0.5" style={{ color: 'var(--testo-attenuato)' }}>
                        {s.descrizione}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
        <p className="mt-4 border-t pt-3 text-[11px] leading-relaxed"
           style={{ borderColor: 'var(--bordo)', color: 'var(--testo-debole)' }}>
          Durante una trasformazione si può digitare il valore esatto:
          <span className="numerico" style={{ color: 'var(--accento)' }}> G X 2.5 Invio </span>
          sposta di 2,5 m lungo l'asse x. Senza asse vincolato il numero è la
          distanza nella direzione corrente.
        </p>
      </div>
    </div>
  );
}

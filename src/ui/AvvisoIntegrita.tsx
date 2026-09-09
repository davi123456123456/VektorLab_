/**
 * Segnalazione delle anomalie di integrità.
 *
 * Compare solo quando c'è qualcosa da dire, e quando c'è va detto: il
 * controllo RIMUOVE le entità che puntano al nulla, e una rimozione
 * silenziosa sarebbe peggio del difetto che corregge. L'utente deve poter
 * sapere che nel suo modello c'era qualcosa che non aveva messo — o che non
 * c'è più qualcosa che credeva di avere.
 */

import { useState } from 'react';
import { useStore } from '../state/store.js';

export function AvvisoIntegrita() {
  const anomalie = useStore((s) => s.anomalieIntegrita);
  const [aperto, setAperto] = useState(false);
  if (anomalie.length === 0) return null;

  const rimosse = anomalie.filter((a) => a.rimossa).length;

  return (
    <div className="border-b p-2" style={{ borderColor: 'var(--bordo)' }}>
      <button
        type="button"
        onClick={() => setAperto((v) => !v)}
        className="flex w-full items-baseline justify-between gap-2 text-left"
      >
        <span className="text-[length:var(--t-minuto)] font-semibold uppercase tracking-wider"
              style={{ color: 'var(--attenzione)' }}>
          Integrità del modello
        </span>
        <span className="numerico text-[length:var(--t-minuto)]" style={{ color: 'var(--testo-debole)' }}>
          {aperto ? '−' : '+'}
        </span>
      </button>

      <p className="mt-1 text-[length:var(--t-minuto)]" style={{ color: 'var(--testo-debole)' }}>
        {rimosse > 0
          ? `${rimosse} ${rimosse === 1 ? 'entità rimossa' : 'entità rimosse'}`
            + ': riferimenti a nodi o aste che non esistono.'
          : `${anomalie.length} ${anomalie.length === 1 ? 'segnalazione' : 'segnalazioni'}.`}
      </p>

      {aperto && (
        <ul className="mt-2 space-y-1">
          {anomalie.map((a, i) => (
            <li key={`${a.id}-${i}`} className="text-[length:var(--t-minuto)] leading-relaxed"
                style={{ color: a.rimossa ? 'var(--errore)' : 'var(--testo-debole)' }}>
              {a.messaggio}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

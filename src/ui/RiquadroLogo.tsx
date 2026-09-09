/**
 * Il riquadro che si apre cliccando il marchio.
 *
 * Non fa niente: è una firma. Per questo non blocca il lavoro, non chiede
 * conferme e si chiude in tre modi diversi — Esc, clic fuori, la X — perché
 * chi lo apre per sbaglio deve poterne uscire senza pensarci.
 */

import { useEffect, useRef, useState } from 'react';
import { NOME } from './Logo.js';

const TELEFONO = '+393201191509';
const TELEFONO_SCRITTO = '320 119 1509';

/**
 * Cinque righe, senza righe vuote in mezzo: gli a capo sono quelli e basta.
 * L'ultima porta il numero, che è l'unica parte cliccabile.
 */
const RIGHE = [
  'Fuck your 9 to 5',
  'i do this shit for the love of the game',
  'È una beta e lo rimarrà per sempre,',
  'quindi se hai dei problemi scrivimi al',
];

export function RiquadroLogo({ onChiudi }: { onChiudi: () => void }) {
  const [entrato, setEntrato] = useState(false);
  const [copiato, setCopiato] = useState(false);
  const riquadro = useRef<HTMLDivElement>(null);

  // la scalatura parte al primo fotogramma dopo il montaggio: impostarla
  // subito farebbe partire l'elemento già alla dimensione finale
  useEffect(() => {
    const id = requestAnimationFrame(() => setEntrato(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    const giu = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onChiudi(); }
    };
    window.addEventListener('keydown', giu, true);
    return () => window.removeEventListener('keydown', giu, true);
  }, [onChiudi]);

  const copia = () => {
    try {
      void navigator.clipboard?.writeText(TELEFONO);
      setCopiato(true);
      setTimeout(() => setCopiato(false), 1600);
    } catch {
      // niente appunti disponibili: il numero resta comunque leggibile e
      // cliccabile, che è la cosa che serve davvero
    }
  };

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) onChiudi(); }}
      style={{
        background: 'rgba(8, 10, 14, 0.55)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        opacity: entrato ? 1 : 0,
        transition: 'opacity 200ms ease-out',
      }}
    >
      <div
        ref={riquadro}
        role="dialog"
        aria-label={`Informazioni su ${NOME}`}
        className="relative mx-4 max-w-[30rem] rounded-[var(--raggio-pannello)] border px-8 py-8"
        style={{
          background: 'var(--sfondo-pannello)',
          borderColor: 'var(--bordo)',
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.55)',
          transform: `scale(${entrato ? 1 : 0.96})`,
          transition: 'transform 220ms cubic-bezier(0.2, 0.9, 0.25, 1)',
        }}
      >
        <button
          type="button"
          onClick={onChiudi}
          aria-label="Chiudi"
          className="absolute right-3 top-3 rounded-[var(--raggio-controllo)] px-2 py-1 text-[length:var(--t-corpo)] leading-none"
          style={{ color: 'var(--testo-debole)' }}
        >
          ✕
        </button>

        <div className="italic" style={{ color: 'var(--testo)', lineHeight: 1.9 }}>
          {RIGHE.map((r, i) => (
            <p key={i} className="text-[length:var(--t-titolo)]">{r || ' '}</p>
          ))}
          <p className="text-[length:var(--t-titolo)]">
            <a
              href={`tel:${TELEFONO}`}
              className="underline decoration-dotted underline-offset-4"
              style={{ color: 'var(--accento)' }}
            >
              {TELEFONO_SCRITTO}
            </a>.
            <button
              type="button"
              onClick={copia}
              className="ml-3 rounded-[var(--raggio-controllo)] border px-2 py-[2px] align-middle text-[length:var(--t-minuto)] not-italic"
              style={{
                borderColor: copiato ? 'var(--carico)' : 'var(--bordo)',
                color: copiato ? 'var(--carico)' : 'var(--testo-debole)',
              }}
            >
              {copiato ? 'copiato' : 'copia'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

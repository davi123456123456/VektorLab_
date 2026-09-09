/** Componenti di base condivisi dai pannelli. */

import type { ReactNode } from 'react';

export function Pannello({ titolo, azione, children }: {
  titolo: string; azione?: ReactNode; children: ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex items-center justify-between border-b px-3 py-2"
           style={{ borderColor: 'var(--bordo)' }}>
        <span className="text-[length:var(--t-minuto)] font-semibold uppercase tracking-wider"
              style={{ color: 'var(--testo-attenuato)' }}>{titolo}</span>
        {azione}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </div>
  );
}

export function Riga({ etichetta, children }: { etichetta: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-3 py-1">
      <span className="w-28 shrink-0 text-[length:var(--t-minuto)]" style={{ color: 'var(--testo-attenuato)' }}>
        {etichetta}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function CampoNumero({ valore, onChange, passo = 0.1, suffisso, disabilitato }: {
  valore: number; onChange: (v: number) => void; passo?: number;
  suffisso?: string; disabilitato?: boolean;
}) {
  return (
    <div className="flex items-center gap-1">
      <input
        type="number"
        step={passo}
        value={Number.isFinite(valore) ? valore : 0}
        disabled={disabilitato}
        onChange={(e) => {
          const v = Number.parseFloat(e.target.value);
          if (Number.isFinite(v)) onChange(v);
        }}
        className="numerico campo w-full outline-none disabled:opacity-40"
      />
      {suffisso && (
        <span className="shrink-0 text-[length:var(--t-minuto)]" style={{ color: 'var(--testo-debole)' }}>
          {suffisso}
        </span>
      )}
    </div>
  );
}

export function Selettore<T extends string>({ valore, opzioni, onChange }: {
  valore: T; opzioni: { valore: T; etichetta: string }[]; onChange: (v: T) => void;
}) {
  return (
    <select
      value={valore}
      onChange={(e) => onChange(e.target.value as T)}
      className="tendina w-full outline-none"
    >
      {opzioni.map((o) => (
        <option key={o.valore} value={o.valore}>{o.etichetta}</option>
      ))}
    </select>
  );
}

export function Interruttore({ attivo, onChange, etichetta }: {
  attivo: boolean; onChange: (v: boolean) => void; etichetta: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 px-3 py-1 text-[length:var(--t-etichetta)]">
      <input
        type="checkbox"
        checked={attivo}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3 w-3 accent-[var(--accento)]"
      />
      <span style={{ color: attivo ? 'var(--testo)' : 'var(--testo-attenuato)' }}>
        {etichetta}
      </span>
    </label>
  );
}

/**
 * §1 — IL BOTTONE, uno solo per tutta l'applicazione.
 *
 * Forma, altezza e stati stanno nella classe `.btn` del foglio di stile: qui
 * non si scrive nessuna misura. È la condizione perché «alza i bottoni di
 * quattro pixel» sia una modifica in un punto e non in venti.
 *
 * `minore` è per i controlli che non sono azioni — una crocetta, un «+» — e
 * resta comunque sopra la soglia di un dito.
 */
export function Bottone({
  children, onClick, attivo, titolo, larghezzaPiena, minore, disabilitato,
}: {
  children: ReactNode; onClick: () => void; attivo?: boolean;
  titolo?: string; larghezzaPiena?: boolean; minore?: boolean;
  disabilitato?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={titolo}
      disabled={disabilitato}
      aria-pressed={attivo === undefined ? undefined : attivo}
      className={`btn${minore ? ' btn-minore' : ''}`
        + `${larghezzaPiena ? ' btn-piena' : ''}${attivo ? ' attivo' : ''}`}
    >
      {children}
    </button>
  );
}

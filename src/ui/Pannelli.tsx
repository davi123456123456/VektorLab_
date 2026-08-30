/** Componenti di base condivisi dai pannelli. */

import type { ReactNode } from 'react';

export function Pannello({ titolo, azione, children }: {
  titolo: string; azione?: ReactNode; children: ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex items-center justify-between border-b px-3 py-1.5"
           style={{ borderColor: 'var(--bordo)' }}>
        <span className="text-[11px] font-semibold uppercase tracking-wider"
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
      <span className="w-28 shrink-0 text-[11px]" style={{ color: 'var(--testo-attenuato)' }}>
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
        className="numerico w-full rounded border px-1.5 py-0.5 text-[12px] outline-none
                   focus:border-[var(--accento)] disabled:opacity-40"
        style={{
          background: 'var(--sfondo)', borderColor: 'var(--bordo)', color: 'var(--testo)',
        }}
      />
      {suffisso && (
        <span className="shrink-0 text-[10px]" style={{ color: 'var(--testo-debole)' }}>
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
      className="w-full rounded border px-1.5 py-0.5 text-[12px] outline-none
                 focus:border-[var(--accento)]"
      style={{ background: 'var(--sfondo)', borderColor: 'var(--bordo)', color: 'var(--testo)' }}
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
    <label className="flex cursor-pointer items-center gap-2 px-3 py-0.5 text-[12px]">
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

export function Bottone({ children, onClick, attivo, titolo, larghezzaPiena }: {
  children: ReactNode; onClick: () => void; attivo?: boolean;
  titolo?: string; larghezzaPiena?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={titolo}
      className={`rounded border px-2 py-1 text-[11px] transition-colors
                  ${larghezzaPiena ? 'w-full' : ''}`}
      style={{
        background: attivo ? 'var(--accento-scuro)' : 'var(--sfondo-elevato)',
        borderColor: attivo ? 'var(--accento)' : 'var(--bordo)',
        color: attivo ? '#fff' : 'var(--testo)',
      }}
    >
      {children}
    </button>
  );
}

/**
 * SCHEDE DEI FOGLI DI LAVORO.
 *
 * Ogni scheda è un documento indipendente. La barra sta sotto la barra delle
 * modalità e sopra l'area di lavoro, perché è lì che si legge la gerarchia
 * giusta: prima QUALE struttura, poi che cosa ci si sta facendo.
 *
 * Con un foglio solo la barra scompare del tutto: mostrare una scheda unica
 * significherebbe occupare una riga di schermo per non dire niente.
 */

import { useEffect, useRef, useState } from 'react';
import { useFogli } from '../state/fogli.js';

export function BarraFogli() {
  const fogli = useFogli((s) => s.fogli);
  const attivo = useFogli((s) => s.attivo);
  const attiva = useFogli((s) => s.attiva);
  const nuovo = useFogli((s) => s.nuovo);
  const chiudi = useFogli((s) => s.chiudi);
  const rinomina = useFogli((s) => s.rinomina);
  const duplica = useFogli((s) => s.duplica);
  const [inModifica, setInModifica] = useState<string | null>(null);

  // Ctrl/Cmd + T apre un foglio, Ctrl/Cmd + W lo chiude: sono le scorciatoie
  // delle schede che chiunque abbia usato un browser conosce già
  useEffect(() => {
    const giu = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 't') { e.preventDefault(); nuovo(); }
      else if (k === 'w') { e.preventDefault(); chiudi(useFogli.getState().attivo); }
      else if (/^[1-9]$/.test(e.key)) {
        // Ctrl+1…9 salta al foglio n-esimo, ma solo se esiste
        const f = useFogli.getState().fogli[Number(e.key) - 1];
        if (f) { e.preventDefault(); attiva(f.id); }
      }
    };
    window.addEventListener('keydown', giu);
    return () => window.removeEventListener('keydown', giu);
  }, [nuovo, chiudi, attiva]);

  if (fogli.length <= 1) return null;

  return (
    <div className="flex items-stretch gap-px overflow-x-auto border-b px-1"
         style={{ borderColor: 'var(--bordo)', background: 'var(--sfondo-pannello)' }}>
      {fogli.map((f, i) => (
        <Scheda
          key={f.id} nome={f.nome} indice={i + 1}
          attiva={f.id === attivo}
          inModifica={inModifica === f.id}
          chiudibile={fogli.length > 1}
          onAttiva={() => attiva(f.id)}
          onModifica={() => setInModifica(f.id)}
          onNome={(n) => { rinomina(f.id, n); setInModifica(null); }}
          onAnnullaModifica={() => setInModifica(null)}
          onChiudi={() => chiudi(f.id)}
          onDuplica={() => duplica(f.id)}
        />
      ))}
      <button
        type="button" onClick={() => nuovo()}
        title="Nuovo foglio (Ctrl+T)"
        className="shrink-0 px-2 text-sm transition-colors hover:bg-[var(--sfondo-attivo)]"
        style={{ color: 'var(--testo-debole)' }}
      >+</button>
    </div>
  );
}

function Scheda({
  nome, indice, attiva, inModifica, chiudibile,
  onAttiva, onModifica, onNome, onAnnullaModifica, onChiudi, onDuplica,
}: {
  nome: string; indice: number; attiva: boolean; inModifica: boolean;
  chiudibile: boolean;
  onAttiva: () => void; onModifica: () => void; onNome: (n: string) => void;
  onAnnullaModifica: () => void; onChiudi: () => void; onDuplica: () => void;
}) {
  const campo = useRef<HTMLInputElement>(null);
  useEffect(() => { if (inModifica) campo.current?.select(); }, [inModifica]);

  if (inModifica) {
    return (
      <input
        ref={campo} defaultValue={nome} autoFocus
        onBlur={(e) => onNome(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onNome(e.currentTarget.value);
          else if (e.key === 'Escape') onAnnullaModifica();
        }}
        className="w-28 shrink-0 rounded-t border-b-2 bg-transparent px-2 py-1 text-[11px]
                   outline-none"
        style={{ borderColor: 'var(--accento)', color: 'var(--testo)' }}
      />
    );
  }

  return (
    <div
      className="group flex shrink-0 items-center gap-1 rounded-t border-b-2 px-2 py-1
                 transition-colors"
      style={{
        borderColor: attiva ? 'var(--accento)' : 'transparent',
        background: attiva ? 'var(--sfondo)' : 'transparent',
      }}
    >
      <button
        type="button"
        onClick={onAttiva}
        onDoubleClick={onModifica}
        title={`${nome} — doppio clic per rinominare (Ctrl+${indice})`}
        className="max-w-[10rem] truncate text-[11px]"
        style={{ color: attiva ? 'var(--testo)' : 'var(--testo-debole)' }}
      >{nome}</button>
      <button
        type="button" onClick={onDuplica} title="Duplica il foglio"
        className="opacity-0 transition-opacity group-hover:opacity-100"
        style={{ color: 'var(--testo-debole)', fontSize: '10px' }}
      >⧉</button>
      {chiudibile && (
        <button
          type="button" onClick={onChiudi} title="Chiudi il foglio (Ctrl+W)"
          className="opacity-0 transition-opacity group-hover:opacity-100"
          style={{ color: 'var(--testo-debole)', fontSize: '11px' }}
        >×</button>
      )}
    </div>
  );
}

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
  const chiudiLeAltre = useFogli((s) => s.chiudiLeAltre);
  const [inModifica, setInModifica] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);

  // §4.4 — chiudere una scheda con del lavoro dentro chiede conferma. La
  // domanda non compare su un foglio vuoto: lì non c'è niente da perdere.
  const chiudiConConferma = (id: string) => {
    const f = useFogli.getState().fogli.find((x) => x.id === id);
    if (f && useFogli.getState().modificato(id)) {
      const ok = globalThis.confirm?.(
        `Chiudere «${f.nome}»? Le modifiche non salvate andranno perse.`);
      if (ok === false) return;
    }
    chiudi(id);
  };

  // Ctrl/Cmd + T apre un foglio, Ctrl/Cmd + W lo chiude: sono le scorciatoie
  // delle schede che chiunque abbia usato un browser conosce già
  useEffect(() => {
    const giu = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 't') { e.preventDefault(); nuovo(); }
      else if (k === 'w') { e.preventDefault(); chiudiConConferma(useFogli.getState().attivo); }
      else if (/^[1-9]$/.test(e.key)) {
        // Ctrl+1…9 salta al foglio n-esimo, ma solo se esiste
        const f = useFogli.getState().fogli[Number(e.key) - 1];
        if (f) { e.preventDefault(); attiva(f.id); }
      }
    };
    window.addEventListener('keydown', giu);
    return () => window.removeEventListener('keydown', giu);
  }, [nuovo, chiudi, attiva]);

  // Con un foglio solo la barra sparisce: una scheda unica occuperebbe una
  // riga di schermo per non dire niente. Il `+` per aprirne un altro non sta
  // qui dentro, sta accanto al nome del modello, dove resta sempre visibile.
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
          onChiudi={() => chiudiConConferma(f.id)}
          onDuplica={() => duplica(f.id)}
          onMenu={(x, y) => setMenu({ id: f.id, x, y })}
        />
      ))}
      <button
        type="button" onClick={() => nuovo()}
        title="Nuovo foglio (Ctrl+T)"
        className="shrink-0 px-2 text-sm transition-colors hover:bg-[var(--sfondo-attivo)]"
        style={{ color: 'var(--testo-debole)' }}
      >+</button>

      {menu && (
        <MenuScheda
          x={menu.x} y={menu.y}
          onChiudiMenu={() => setMenu(null)}
          voci={[
            ['rinomina', () => setInModifica(menu.id)],
            ['duplica', () => duplica(menu.id)],
            ['chiudi', () => chiudiConConferma(menu.id)],
            ['chiudi le altre', () => chiudiLeAltre(menu.id)],
          ]}
        />
      )}
    </div>
  );
}

/** Menu contestuale della scheda: si chiude al primo clic fuori o con Esc. */
function MenuScheda({ x, y, voci, onChiudiMenu }: {
  x: number; y: number;
  voci: [string, () => void][];
  onChiudiMenu: () => void;
}) {
  useEffect(() => {
    const via = () => onChiudiMenu();
    const tasto = (e: KeyboardEvent) => { if (e.key === 'Escape') onChiudiMenu(); };
    // il timeout evita che il clic che ha APERTO il menu lo chiuda subito
    const id = setTimeout(() => window.addEventListener('pointerdown', via), 0);
    window.addEventListener('keydown', tasto);
    return () => {
      clearTimeout(id);
      window.removeEventListener('pointerdown', via);
      window.removeEventListener('keydown', tasto);
    };
  }, [onChiudiMenu]);

  return (
    <div
      className="fixed z-50 min-w-[9rem] rounded border py-1 text-[11px] shadow-lg"
      style={{
        left: x, top: y,
        background: 'var(--sfondo-pannello)',
        borderColor: 'var(--bordo)',
      }}
    >
      {voci.map(([nome, azione]) => (
        <button
          key={nome}
          type="button"
          onClick={() => { azione(); onChiudiMenu(); }}
          className="block w-full px-3 py-1 text-left transition-colors
                     hover:bg-[var(--sfondo-elevato)]"
          style={{ color: 'var(--testo-attenuato)' }}
        >{nome}</button>
      ))}
    </div>
  );
}

function Scheda({
  nome, indice, attiva, inModifica, chiudibile,
  onAttiva, onModifica, onNome, onAnnullaModifica, onChiudi, onDuplica, onMenu,
}: {
  nome: string; indice: number; attiva: boolean; inModifica: boolean;
  chiudibile: boolean;
  onAttiva: () => void; onModifica: () => void; onNome: (n: string) => void;
  onAnnullaModifica: () => void; onChiudi: () => void; onDuplica: () => void;
  onMenu: (x: number, y: number) => void;
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
        // sulla scheda ATTIVA il clic rinomina, su una inattiva la porta in
        // primo piano: è l'unico modo di far convivere le due cose senza
        // chiedere all'utente di indovinare quale delle due otterrà
        onClick={() => (attiva ? onModifica() : onAttiva())}
        onDoubleClick={onModifica}
        onContextMenu={(e) => { e.preventDefault(); onMenu(e.clientX, e.clientY); }}
        title={`${nome} — clic per rinominare (Ctrl+${indice})`}
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

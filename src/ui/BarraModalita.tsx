/**
 * Barra superiore: modalità operative, strumenti, opzioni di aggancio.
 * Le modalità sono quelle dei "mode" di Blender: cambiano che cosa si può
 * toccare, non che cosa si vede.
 */

import { MODALITA, useStore, type Modalita, type Strumento } from '../state/store.js';
import { useFogli } from '../state/fogli.js';
import { Bottone } from './Pannelli.js';
import { Logo } from './Logo.js';

const STRUMENTI: { id: Strumento; nome: string; tasto: string; suggerimento: string }[] = [
  { id: 'seleziona', nome: 'Seleziona', tasto: 'Q', suggerimento: 'click, Shift+click, riquadro, Alt+click per la catena' },
  { id: 'nodo', nome: 'Nodo', tasto: 'N', suggerimento: 'click per posare un nodo' },
  { id: 'asta', nome: 'Asta', tasto: 'L', suggerimento: 'click iniziale e finale; prosegue a catena, Esc per terminare' },
];

export function BarraModalita({ onAiuto, onLogo }: {
  onAiuto: () => void;
  onLogo: () => void;
}) {
  const modalita = useStore((s) => s.modalita);
  const impostaModalita = useStore((s) => s.impostaModalita);
  const strumento = useStore((s) => s.strumento);
  const impostaStrumento = useStore((s) => s.impostaStrumento);
  const snap = useStore((s) => s.snap);
  const impostaSnap = useStore((s) => s.impostaSnap);
  const nome = useStore((s) => s.progetto.nome);
  const animazioni = useStore((s) => s.animazioni);
  const alternaAnimazioni = useStore((s) => s.alternaAnimazioni);

  return (
    <div className="flex min-h-10 shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b px-3 py-1"
         style={{ borderColor: 'var(--bordo)', background: 'var(--sfondo-pannello)' }}>
      <Logo onClick={onLogo} />
      <span className="max-w-[24ch] truncate text-[12px]"
            style={{ color: 'var(--testo-attenuato)' }}>{nome}</span>
      {/*
        §4 — il `+` sta QUI, accanto al nome del modello, e non dentro la barra
        delle schede: quella si nasconde quando il foglio è uno solo, e il
        pulsante per aprirne un secondo finiva nascosto insieme a lei. Era il
        motivo per cui i fogli multipli sembravano non esserci.
      */}
      <button
        type="button"
        onClick={() => useFogli.getState().nuovo()}
        title="Nuovo foglio di lavoro (Ctrl+T)"
        className="-ml-1 rounded px-1.5 text-[13px] leading-none transition-colors
                   hover:bg-[var(--sfondo-elevato)]"
        style={{ color: 'var(--testo-debole)' }}
      >+</button>

      <div className="flex overflow-hidden rounded border" style={{ borderColor: 'var(--bordo)' }}>
        {MODALITA.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => impostaModalita(m.id as Modalita)}
            title={`${m.nome} (${m.tasto})`}
            className="px-2.5 py-1 text-[11px] transition-colors"
            style={{
              background: modalita === m.id ? 'var(--accento-scuro)' : 'transparent',
              color: modalita === m.id ? '#fff' : 'var(--testo-attenuato)',
            }}
          >
            {m.nome}
          </button>
        ))}
      </div>

      <div className="flex gap-1">
        {STRUMENTI.map((s) => (
          <Bottone key={s.id} attivo={strumento === s.id} titolo={s.suggerimento}
                   onClick={() => impostaStrumento(s.id)}>
            {s.nome} <span className="opacity-50">{s.tasto}</span>
          </Bottone>
        ))}
      </div>

      <div className="ml-auto flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-wider"
              style={{ color: 'var(--testo-debole)' }}>aggancio</span>
        {([
          ['griglia', 'griglia'], ['nodi', 'nodi'], ['puntiMedi', 'punti medi'],
          ['intersezioni', 'intersez.'], ['ortogonale', 'ortogonale'],
        ] as const).map(([chiave, etichetta]) => (
          <Bottone
            key={chiave}
            attivo={snap[chiave]}
            onClick={() => impostaSnap({ [chiave]: !snap[chiave] })}
            titolo="Ctrl tenuto premuto inverte temporaneamente l'aggancio"
          >
            {etichetta}
          </Bottone>
        ))}
        <Bottone
          attivo={animazioni}
          onClick={alternaAnimazioni}
          titolo={animazioni
            ? 'Animazioni attive. Spegnendole ogni transizione salta al valore finale.'
            : 'Animazioni spente: tutto è mostrato allo stato finale.'}
        >
          {animazioni ? 'animazioni' : 'statico'}
        </Bottone>
        <Bottone onClick={onAiuto} titolo="Elenco delle scorciatoie (?)">?</Bottone>
      </div>
    </div>
  );
}

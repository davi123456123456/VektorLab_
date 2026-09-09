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
    <div className="flex shrink-0 flex-wrap items-center border-b"
         style={{
           borderColor: 'var(--bordo)', background: 'var(--sfondo-pannello)',
           gap: 'var(--s2)', padding: 'var(--s2) var(--s3)',
         }}>
      <Logo onClick={onLogo} />
      <span className="max-w-[24ch] truncate"
            style={{
              color: 'var(--testo-attenuato)', fontSize: 'var(--t-etichetta)',
              marginRight: 'var(--s1)',
            }}>{nome}</span>
      {/*
        §4 — il `+` sta QUI, accanto al nome del modello, e non dentro la barra
        delle schede: quella si nasconde quando il foglio è uno solo, e il
        pulsante per aprirne un secondo finiva nascosto insieme a lei. Era il
        motivo per cui i fogli multipli sembravano non esserci.
      */}
      <Bottone minore titolo="Nuovo foglio di lavoro (Ctrl+T)"
               onClick={() => useFogli.getState().nuovo()}>+</Bottone>

      {/* le modalità sono UNA scelta: stanno in un gruppo, non in sette bottoni */}
      <div className="btn-gruppo" role="group" aria-label="Modalità">
        {MODALITA.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => impostaModalita(m.id as Modalita)}
            title={`${m.nome} (${m.tasto})`}
            aria-pressed={modalita === m.id}
            className={`btn${modalita === m.id ? ' attivo' : ''}`}
          >
            {m.nome}
          </button>
        ))}
      </div>

      <div className="btn-gruppo" role="group" aria-label="Strumento">
        {STRUMENTI.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => impostaStrumento(s.id)}
            title={s.suggerimento}
            aria-pressed={strumento === s.id}
            className={`btn${strumento === s.id ? ' attivo' : ''}`}
          >
            {s.nome} <span className="opacity-50">{s.tasto}</span>
          </button>
        ))}
      </div>

      <div className="riga-controlli" style={{ marginLeft: 'auto' }}>
        {/*
          La parola «AGGANCIO» è sparita: il gruppo la dichiara già a chi usa
          un lettore di schermo, e a chi guarda la dicevano i nomi dentro —
          «griglia», «nodi», «punti medi» non possono essere altro. Settanta
          pixel recuperati sono, a 1440, la differenza fra una riga e due.
        */}
        {/*
          Gli agganci sono SEI INTERRUTTORI DELLO STESSO INSIEME: raccolti in un
          gruppo occupano quaranta pixel in meno di sei bottoni separati — che a
          1440 è la differenza fra una riga e due — e si leggono come una scelta
          sola invece che come sei azioni indipendenti.
        */}
        <div className="btn-gruppo" role="group" aria-label="Aggancio">
          {([
            ['griglia', 'griglia'], ['nodi', 'nodi'], ['puntiMedi', 'punti medi'],
            ['intersezioni', 'intersez.'], ['ortogonale', 'ortogonale'],
          ] as const).map(([chiave, etichetta]) => (
            <button
              key={chiave}
              type="button"
              onClick={() => impostaSnap({ [chiave]: !snap[chiave] })}
              title="Ctrl tenuto premuto inverte temporaneamente l'aggancio"
              aria-pressed={snap[chiave]}
              className={`btn${snap[chiave] ? ' attivo' : ''}`}
            >
              {etichetta}
            </button>
          ))}
        </div>
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

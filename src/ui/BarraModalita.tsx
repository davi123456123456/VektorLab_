/**
 * Barra superiore: modalità operative, strumenti, opzioni di aggancio.
 * Le modalità sono quelle dei "mode" di Blender: cambiano che cosa si può
 * toccare, non che cosa si vede.
 */

import { useState } from 'react';
import { MODALITA, useStore, type Modalita, type Strumento } from '../state/store.js';
import { useFogli } from '../state/fogli.js';
import { Bottone } from './Pannelli.js';
import { Logo } from './Logo.js';

/**
 * L'ICONA DI OGNI MODALITÀ, per lo schermo stretto.
 *
 * Su un telefono i sette nomi delle modalità occupano da soli più della
 * larghezza dello schermo. Sono disegni di una riga — il glifo che un
 * ingegnere riconosce senza leggere: il triangolo del vincolo, la freccia del
 * carico, la curva del diagramma — e il nome resta nel suggerimento e per chi
 * usa un lettore di schermo.
 */
const ICONA_MODALITA: Record<string, string> = {
  modellazione: '╱',
  vincoli: '△',
  carichi: '↓',
  materiali: '▤',
  analisi: '⚙',
  reazioni: '↥',
  risultati: '∿',
};

const ICONA_STRUMENTO: Record<string, string> = {
  seleziona: '⬉',
  nodo: '•',
  asta: '╱',
};

const STRUMENTI: { id: Strumento; nome: string; tasto: string; suggerimento: string }[] = [
  { id: 'seleziona', nome: 'Seleziona', tasto: 'Q', suggerimento: 'click, Shift+click, riquadro, Alt+click per la catena' },
  { id: 'nodo', nome: 'Nodo', tasto: 'N', suggerimento: 'click per posare un nodo' },
  { id: 'asta', nome: 'Asta', tasto: 'L', suggerimento: 'click iniziale e finale; prosegue a catena, Esc per terminare' },
];

export function BarraModalita({ onAiuto, onLogo }: {
  onAiuto: () => void;
  onLogo: () => void;
}) {
  /*
   * SU SCHERMO STRETTO gli agganci stanno dietro un «⋯».
   *
   * Diciannove comandi a quarantaquattro pixel su un telefono da 390 sono
   * cinque righe di barra, cioè un quarto dello schermo speso prima di vedere
   * la struttura. Le modalità e gli strumenti restano — sono la navigazione —
   * e le opzioni di aggancio, che si toccano di rado, entrano in un menu.
   */
  const [menuAperto, setMenuAperto] = useState(false);
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
    <div className="barra-alta flex shrink-0 flex-wrap items-center border-b"
         style={{
           borderColor: 'var(--bordo)', background: 'var(--sfondo-pannello)',
           gap: 'var(--s1)', padding: 'var(--s1) var(--s2)',
         }}>
      <Logo onClick={onLogo} />
      <span className="solo-largo max-w-[24ch] truncate"
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
      <div className="btn-gruppo gruppo-modalita" role="group" aria-label="Modalità">
        {MODALITA.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => impostaModalita(m.id as Modalita)}
            title={`${m.nome} (${m.tasto})`}
            aria-pressed={modalita === m.id}
            aria-label={m.nome}
            className={`btn${modalita === m.id ? ' attivo' : ''}`}
          >
            <span className="nome-modalita">{m.nome}</span>
            <span aria-hidden className="solo-stretto">{ICONA_MODALITA[m.id]}</span>
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
            aria-label={s.nome}
            className={`btn${strumento === s.id ? ' attivo' : ''}`}
          >
            <span className="nome-modalita">{s.nome}</span>
            <span aria-hidden className="solo-stretto">{ICONA_STRUMENTO[s.id]}</span>
            <span className="tasto-scorciatoia opacity-50">{s.tasto}</span>
          </button>
        ))}
      </div>

      <button
        type="button"
        className="btn solo-stretto-blocco"
        aria-expanded={menuAperto}
        aria-label="Altre opzioni"
        onClick={() => setMenuAperto((v) => !v)}
        style={{ marginLeft: 'auto' }}
      >⋯</button>

      <div
        className={`riga-controlli opzioni-barra${menuAperto ? ' aperto' : ''}`}
        style={{ marginLeft: 'auto' }}
      >
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
              aria-label={`aggancio ${etichetta}`}
              className={`btn${snap[chiave] ? ' attivo' : ''}`}
            >
              <span className="nome-modalita">{etichetta}</span>
              <span aria-hidden className="solo-stretto">
                {etichetta.slice(0, 1).toUpperCase()}
              </span>
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

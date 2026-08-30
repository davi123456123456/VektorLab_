/**
 * Guscio dell'applicazione.
 *
 * Struttura: barra modalità in alto, canvas al centro, pannelli laterali,
 * barra di stato in basso. I pannelli si possono nascondere (P e T) perché su
 * schermi piccoli il canvas è la cosa che conta.
 */

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { CanvasView } from './CanvasView.js';
import { BarraModalita } from './BarraModalita.js';
import { BarraStato } from './BarraStato.js';
import { Outliner } from './Outliner.js';
import { Ispettore } from './Ispettore.js';
import { PannelloVincoli } from './PannelloVincoli.js';
import { PannelloCarichi } from './PannelloCarichi.js';
import { PannelloCinematica } from './PannelloCinematica.js';
import { PannelloRisultati } from './PannelloRisultati.js';
import { PannelloReazioni } from './PannelloReazioni.js';
import { PannelloConteggio } from './PannelloConteggio.js';
import { PannelloTopologia } from './PannelloTopologia.js';
import { PannelloSezioni } from './PannelloSezioni.js';
import { Aiuto } from './Aiuto.js';
import { RiquadroLogo } from './RiquadroLogo.js';
import { useScorciatoie } from './shortcuts/useScorciatoie.js';
import { useStore } from '../state/store.js';
import { esempi } from '../state/esempi.js';
import { Bottone } from './Pannelli.js';
import { usaPannelloLaterale, type PannelloLaterale } from './usaPannelloLaterale.js';
import { BarraFogli } from './BarraFogli.js';
import { useFogli } from '../state/fogli.js';

export function App() {
  const [aiuto, setAiuto] = useState(false);
  const [informazioni, setInformazioni] = useState(false);
  // I due pannelli partono CHIUSI: si apre sul canvas pulito, con tutta
  // l'area di disegno. Il default vale solo al primo avvio, poi vince la
  // scelta dell'utente, ricordata in localStorage.
  const sinistra = usaPannelloLaterale('outliner', 256, false, { min: 200, max: 420 });
  // Il pannello di destra vive nello store del foglio: larghezza e apertura
  // sono sue, non dell'applicazione. Due fogli affiancati nel tempo possono
  // volerlo di due misure diverse, e imporre la stessa a entrambi sarebbe
  // arbitrario.
  const destra = usaPannelloDestro();
  const generazione = useFogli((s) => s.generazione);
  const messaggia = useStore((s) => s.messaggia);
  const messaggio = useStore((s) => s.messaggio);

  useScorciatoie({
    alternaAiuto: useCallback(() => setAiuto((v) => !v), []),
    alternaIspettore: destra.alterna,
    alternaOutliner: sinistra.alterna,
  });

  // Ctrl/Cmd + B è la scorciatoia che tutti si aspettano per la barra laterale
  useEffect(() => {
    const giu = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'b' || e.key === 'B')) {
        e.preventDefault();
        sinistra.alterna();
      }
    };
    window.addEventListener('keydown', giu);
    return () => window.removeEventListener('keydown', giu);
  }, [sinistra]);

  // Il pannello di destra porta le tavolozze — tipi di vincolo, tipi di
  // carico, sezioni — che in quelle modalità sono indispensabili. Con il
  // pannello chiuso sarebbero irraggiungibili, quindi entrando in una modalità
  // diversa da Modellazione si apre da sé. In Modellazione resta come l'utente
  // l'ha lasciato: lì il canvas è tutto.
  const modalita = useStore((s) => s.modalita);
  useEffect(() => {
    if (modalita !== 'modellazione') destra.apri();
  }, [modalita, destra]);

  // il messaggio di stato si dissolve da solo: resta utile senza diventare rumore
  useEffect(() => {
    if (!messaggio) return;
    const t = setTimeout(() => messaggia(null), 4000);
    return () => clearTimeout(t);
  }, [messaggio, messaggia]);

  return (
    <div className="flex h-full flex-col" style={{ background: 'var(--sfondo)' }}>
      <BarraModalita onAiuto={() => setAiuto((v) => !v)}
                     onLogo={() => setInformazioni(true)} />
      <BarraFogli />

      {/*
        La `key` è la parte che fa funzionare i fogli. Cambiando foglio cambia
        anche lo store, e i componenti montati resterebbero abbonati a quello
        di prima: rimontare l'area di lavoro li fa riabbonare tutti al foglio
        giusto. È un rimontaggio vero, e va bene così — cambiare documento non
        deve conservare niente dello stato effimero del precedente.
      */}
      <div key={generazione} className="relative flex min-h-0 flex-1">
        <Laterale lato="sinistra" stato={sinistra} etichetta="struttura">
          <Esempi />
          <PannelloConteggio />
          <div className="min-h-0 flex-1"><Outliner /></div>
        </Laterale>

        <main className="relative min-w-0 flex-1">
          <CanvasView />
        </main>

        <Laterale lato="destra" stato={destra} etichetta="proprietà">
          <PannelloDiModalita />
        </Laterale>

        {aiuto && <Aiuto onChiudi={() => setAiuto(false)} />}
        {informazioni && <RiquadroLogo onChiudi={() => setInformazioni(false)} />}
      </div>

      <BarraStato />
    </div>
  );
}

/**
 * Il pannello laterale segue la modalità: mostrare tutto sempre riempirebbe la
 * colonna di controlli inattivi, e cercare quello giusto costerebbe più che
 * cambiare modalità.
 */
function PannelloDiModalita() {
  const modalita = useStore((s) => s.modalita);
  switch (modalita) {
    case 'vincoli': return <PannelloVincoli />;
    case 'carichi': return <PannelloCarichi />;
    case 'analisi': return (
      <>
        <PannelloCinematica />
        <PannelloTopologia />
      </>
    );
    case 'reazioni': return <PannelloReazioni />;
    case 'risultati': return <PannelloRisultati />;
    case 'materiali': return <PannelloSezioni />;
    default: return <Ispettore />;
  }
}

function Esempi() {
  const caricaProgetto = useStore((s) => s.caricaProgetto);
  const inquadraTutto = useStore((s) => s.inquadraTutto);
  return (
    <div className="border-b p-2" style={{ borderColor: 'var(--bordo)' }}>
      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider"
           style={{ color: 'var(--testo-debole)' }}>Esempi</div>
      <div className="flex flex-wrap gap-1">
        {esempi.map((e) => (
          <Bottone key={e.nome} titolo={e.descrizione}
                   onClick={() => { caricaProgetto(e.costruisci()); setTimeout(inquadraTutto, 0); }}>
            {e.nome}
          </Bottone>
        ))}
      </div>
    </div>
  );
}


/**
 * Un pannello laterale che si ritrae per intero.
 *
 * Il comando resta visibile anche a pannello chiuso — una linguetta sul bordo,
 * con la freccia che ruota — perché un pannello che sparisce senza lasciare
 * traccia di come riaprirlo è un pannello perso.
 *
 * La larghezza si regola trascinando il bordo; durante il trascinamento la
 * transizione si spegne, altrimenti il pannello inseguirebbe il mouse con un
 * quinto di secondo di ritardo.
 */
/** Adatta il pannello destro dello store all'interfaccia di `Laterale`. */
function usaPannelloDestro(): PannelloLaterale {
  const stato = useStore((s) => s.pannelloDestro);
  const alterna = useStore((s) => s.alternaPannelloDestro);
  const apri = useStore((s) => s.apriPannelloDestro);
  const impostaLarghezza = useStore((s) => s.impostaLarghezzaPannelloDestro);
  const chiudi = useCallback(() => {
    if (useStore.getState().pannelloDestro.aperto) alterna();
  }, [alterna]);
  return {
    aperto: stato.aperto, larghezza: stato.larghezza,
    alterna, apri, chiudi, impostaLarghezza,
  };
}

function Laterale({ lato, stato, etichetta, children }: {
  lato: 'sinistra' | 'destra';
  stato: PannelloLaterale;
  etichetta: string;
  children: ReactNode;
}) {
  const [trascinando, setTrascinando] = useState(false);
  const sinistra = lato === 'sinistra';

  useEffect(() => {
    if (!trascinando) return;
    const muovi = (e: PointerEvent) => {
      stato.impostaLarghezza(sinistra ? e.clientX : window.innerWidth - e.clientX);
    };
    const su = () => setTrascinando(false);
    window.addEventListener('pointermove', muovi);
    window.addEventListener('pointerup', su);
    return () => {
      window.removeEventListener('pointermove', muovi);
      window.removeEventListener('pointerup', su);
    };
  }, [trascinando, sinistra, stato]);

  return (
    <>
      <aside
        className={`relative flex shrink-0 flex-col overflow-hidden
                    ${sinistra ? 'border-r' : 'border-l'}`}
        style={{
          width: stato.aperto ? stato.larghezza : 0,
          borderColor: 'var(--bordo)',
          background: 'var(--sfondo-pannello)',
          transition: trascinando ? 'none' : 'width 200ms cubic-bezier(0.2, 0.8, 0.3, 1)',
        }}
      >
        <div className={`flex min-h-0 flex-1 flex-col ${sinistra ? '' : 'overflow-auto'}`}
             style={{ width: stato.larghezza }}>
          {children}
        </div>
        {stato.aperto && (
          <div
            onPointerDown={(e) => { e.preventDefault(); setTrascinando(true); }}
            title="Trascina per cambiare larghezza"
            className={`absolute top-0 h-full w-1.5 cursor-col-resize
                        ${sinistra ? 'right-0' : 'left-0'}`}
            style={{ background: trascinando ? 'var(--accento)' : 'transparent' }}
          />
        )}
      </aside>

      <button
        type="button"
        onClick={stato.alterna}
        title={`${stato.aperto ? 'Nascondi' : 'Mostra'} ${etichetta}`
          + (sinistra ? ' (Ctrl+B)' : ' (Ctrl+I)')}
        className="z-10 flex w-3.5 shrink-0 items-center justify-center border-r text-[10px]"
        style={{
          borderColor: 'var(--bordo)',
          background: 'var(--sfondo-pannello)',
          color: 'var(--testo-debole)',
        }}
      >
        <span style={{
          display: 'inline-block',
          transition: 'transform 200ms ease',
          transform: `rotate(${(sinistra === stato.aperto) ? 180 : 0}deg)`,
        }}>▸</span>
      </button>
    </>
  );
}

/**
 * AZIONI SULLA SELEZIONE — la barra che rende l'applicazione usabile a dito.
 *
 * Su un computer si seleziona e si preme Canc. Su un telefono non c'è Canc, e
 * fino a qui non c'era nessun altro modo di eliminare un'asta o un vincolo:
 * si poteva disegnare ma non correggere, che è metà del lavoro in meno.
 *
 * La barra compare SOLO quando c'è qualcosa di selezionato, galleggia sopra il
 * disegno in basso al centro, e dice che cosa è selezionato prima di offrire
 * di cancellarlo — «elimina» da solo, senza sapere che cosa, è il modo più
 * rapido di perdere il lavoro.
 *
 * Serve anche col mouse: chi non conosce la scorciatoia trova un bottone.
 */

import { useEffect, useState } from 'react';
import { useStore, contaSelezione } from '../state/store.js';
import { eliminaSelezione, duplicaSelezione } from '../state/azioni.js';
import { etichette } from '../state/etichette.js';
import { geometriaAsta, impostaGeometriaAsta, impostaVincolo } from '../state/commands.js';
import type { ElementId } from '../core/model/types.js';
import { usaTelefono } from './usaTelefono.js';

export function BarraSelezione() {
  const selezione = useStore((s) => s.selezione);
  const suAsta = useStore((s) => s.suAstaSelezionato);
  const sconnessione = useStore((s) => s.sconnessioneNodaleSelezionata);
  const carico = useStore((s) => s.caricoSelezionato);
  const progetto = useStore((s) => s.progetto);
  const svuota = useStore((s) => s.svuotaSelezione);
  const selezionaSuAsta = useStore((s) => s.selezionaSuAsta);
  const selezionaSconnessione = useStore((s) => s.selezionaSconnessioneNodale);
  const selezionaCarico = useStore((s) => s.selezionaCarico);
  const modalita = useStore((s) => s.modalita);
  const telefono = usaTelefono();

  const quanti = contaSelezione(selezione)
    + (suAsta ? 1 : 0) + (sconnessione ? 1 : 0) + (carico ? 1 : 0);
  if (quanti === 0) return null;

  /*
   * CHE COSA è selezionato, in parole. Un contatore nudo — «3 elementi» — non
   * dice se stai per cancellare tre aste o tre carichi, e la differenza è
   * fra un ritocco e un modello da rifare.
   */
  const eti = etichette(progetto);
  const pezzi: string[] = [];
  const nAste = selezione.aste.size, nNodi = selezione.nodi.size;
  if (nAste > 0) {
    pezzi.push(nAste === 1
      ? `asta ${eti.asta([...selezione.aste][0])}`
      : `${nAste} aste`);
  }
  if (nNodi > 0) {
    pezzi.push(nNodi === 1
      ? `nodo ${eti.nodo([...selezione.nodi][0])}`
      : `${nNodi} nodi`);
  }
  if (suAsta) pezzi.push('1 vincolo');
  if (sconnessione) pezzi.push('1 sconnessione');
  if (carico) pezzi.push('1 carico');

  const deseleziona = () => {
    svuota();
    selezionaSuAsta(null);
    selezionaSconnessione(null);
    selezionaCarico(null);
  };

  const soloGeometria = nAste + nNodi > 0;

  /*
   * SUL TELEFONO, UN'ASTA SOLA: lunghezza e inclinazione al posto di
   * «duplica» e «deseleziona».
   *
   * Col dito un'asta si disegna a occhio; qui la si porta alla misura
   * giusta scrivendola. Duplicare a dito serve di rado, e per deselezionare
   * basta toccare il vuoto. Solo in Disegna: nelle altre modalità la
   * geometria non si tocca.
   */
  const astaDaMisurare = telefono && modalita === 'modellazione'
    && nAste === 1 && nNodi === 0 && !suAsta && !sconnessione && !carico
    ? [...selezione.aste][0] : null;

  /*
   * TOGLIERE IL VINCOLO SENZA TOGLIERE IL NODO.
   *
   * Un vincolo posato su un nodo non è un oggetto selezionabile a sé: vive
   * sul nodo. Col mouse lo si toglie dall'elenco laterale; a dito quell'elenco
   * è dietro un pannello, e l'unica alternativa era cancellare il nodo — che
   * porta via anche le aste che ci arrivano. Qui c'è la via diretta.
   */
  const nodiVincolati = [...selezione.nodi].filter(
    (id) => progetto.nodi.find((n) => n.id === id)?.vincolo !== undefined,
  );

  return (
    <div
      className="barra-selezione"
      role="toolbar"
      aria-label="Azioni sulla selezione"
    >
      <span className="barra-selezione-cosa">{pezzi.join(' · ')}</span>

      {nodiVincolati.length > 0 && (
        <button
          type="button"
          className="btn btn-minore"
          onClick={() => useStore.getState().esegui(
            impostaVincolo(nodiVincolati as never[], undefined),
          )}
          title="Toglie il vincolo lasciando il nodo dov'è"
        >
          {nodiVincolati.length === 1 ? 'togli vincolo' : `togli ${nodiVincolati.length} vincoli`}
        </button>
      )}
      {astaDaMisurare ? <MisureAsta astaId={astaDaMisurare} /> : (
        <>
          {soloGeometria && (
            <button
              type="button"
              className="btn btn-minore"
              onClick={duplicaSelezione}
              title="Duplica e sposta (D)"
            >
              duplica
            </button>
          )}
          <button
            type="button"
            className="btn btn-minore"
            onClick={deseleziona}
            title="Annulla la selezione (Esc)"
          >
            deseleziona
          </button>
        </>
      )}
      <button
        type="button"
        className="btn btn-minore barra-selezione-elimina"
        onClick={eliminaSelezione}
        title="Elimina la selezione (Canc)"
      >
        elimina
      </button>
    </div>
  );
}

/**
 * Lunghezza e inclinazione dell'asta selezionata, scrivibili.
 *
 * Il valore si applica alla conferma — Invio o uscendo dal campo — e non a
 * ogni cifra: scrivendo «3.5» l'asta non deve passare per 3 e per 3.
 * Il nodo iniziale resta fermo, si sposta il finale (`impostaGeometriaAsta`).
 */
function MisureAsta({ astaId }: { astaId: ElementId }) {
  const progetto = useStore((s) => s.progetto);
  const g = geometriaAsta(progetto, astaId);
  if (!g) return null;

  const applica = (lunghezza: number, gradi: number) => {
    const st = useStore.getState();
    const cmd = impostaGeometriaAsta(st.progetto, astaId, lunghezza, gradi);
    if (cmd) st.esegui(cmd);
    else st.messaggia('La lunghezza deve essere maggiore di zero.');
  };

  return (
    <>
      <CampoMisura etichetta="L" suffisso="m" valore={g.lunghezza} cifre={3}
                   tastiera="decimal" onConferma={(v) => applica(v, g.gradi)} />
      {/*
        L'inclinazione può essere negativa, e il tastierino decimale di iOS
        non ha il meno: qui serve la tastiera normale.
      */}
      <CampoMisura etichetta="α" suffisso="°" valore={g.gradi} cifre={1}
                   tastiera="text" onConferma={(v) => applica(g.lunghezza, v)} />
    </>
  );
}

function CampoMisura({ etichetta, suffisso, valore, cifre, tastiera, onConferma }: {
  etichetta: string;
  suffisso: string;
  valore: number;
  cifre: number;
  tastiera: 'decimal' | 'text';
  onConferma: (v: number) => void;
}) {
  const scritto = valore.toFixed(cifre);
  const [testo, setTesto] = useState(scritto);
  // il modello è cambiato altrove (annulla, trascinamento): il campo lo segue
  useEffect(() => { setTesto(scritto); }, [scritto]);

  const conferma = () => {
    // la virgola è il separatore decimale italiano: si accetta anche quella
    const v = Number.parseFloat(testo.replace(',', '.'));
    if (Number.isFinite(v) && v.toFixed(cifre) !== scritto) onConferma(v);
    else setTesto(scritto);
  };

  return (
    <label className="campo-misura">
      <span className="campo-misura-nome">{etichetta}</span>
      <input
        type="text"
        inputMode={tastiera}
        enterKeyHint="done"
        value={testo}
        onChange={(e) => setTesto(e.target.value)}
        onBlur={conferma}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
        onFocus={(e) => e.currentTarget.select()}
        className="numerico campo-misura-valore"
        aria-label={etichetta === 'L' ? 'Lunghezza in metri' : 'Inclinazione in gradi'}
      />
      <span className="campo-misura-unita">{suffisso}</span>
    </label>
  );
}

/**
 * I COMANDI A DITO, sopra il disegno: quelli che al computer stanno sulla
 * tastiera.
 *
 * GLI STRUMENTI — Seleziona, Nodo, Asta — stanno in colonna in basso a
 * sinistra, dove arriva il pollice tenendo il telefono con una mano, e in
 * colonna perché in riga si sarebbero presi metà della larghezza che serve
 * alla barra delle azioni sulla selezione, che sta in basso anche lei.
 * Compaiono solo in Disegna: nelle altre modalità il clic posa un vincolo o
 * un carico, e lo strumento scelto non cambia niente (vedi `CanvasView`).
 *
 * Mentre si traccia una catena di aste, in cima alla colonna compare ✓ per
 * chiuderla: al computer è Invio, e senza tastiera non c'era altro modo.
 *
 * LA CRONOLOGIA — annulla e ripeti — sta in alto a destra e c'è in ogni
 * modalità, perché si annulla anche un vincolo o un carico, non solo
 * un'asta.
 */

import { useStore } from '../state/store.js';
import { annullaOperazione, annullaSegmento, terminaCatena } from '../state/azioni.js';
import { STRUMENTI } from './BarraModalita.js';
import { Icona } from './icone.js';

export function StrumentiTelefono() {
  const strumento = useStore((s) => s.strumento);
  const impostaStrumento = useStore((s) => s.impostaStrumento);
  const tracciando = useStore((s) => s.operazione.tipo === 'disegnaAsta');
  return (
    <div className="strumenti-telefono" role="group" aria-label="Strumento">
      {tracciando && (
        <button
          type="button"
          onClick={terminaCatena}
          aria-label="Termina la catena di aste"
          title="Termina la catena"
          className="tasto-strumento tasto-termina"
        >
          <Icona nome="termina" dimensione={24} />
        </button>
      )}
      {STRUMENTI.map((s) => (
        <button
          key={s.id}
          type="button"
          onClick={() => impostaStrumento(s.id)}
          aria-pressed={strumento === s.id}
          aria-label={s.nome}
          title={s.nome}
          className="tasto-strumento"
        >
          <Icona nome={s.id} dimensione={22} />
        </button>
      ))}
    </div>
  );
}

/**
 * ↶ durante il tracciamento toglie l'ultimo segmento e lascia continuare,
 * come Backspace al computer: chiudere la catena per correggere un tratto
 * costringerebbe a ricominciarla dal nodo giusto.
 */
function annulla(): void {
  const st = useStore.getState();
  if (st.operazione.tipo === 'disegnaAsta') annullaSegmento();
  else if (st.operazione.tipo !== 'nessuna') annullaOperazione();
  else st.annulla();
}

function ripeti(): void {
  const st = useStore.getState();
  if (st.operazione.tipo !== 'nessuna') st.impostaOperazione({ tipo: 'nessuna' });
  st.rifai();
}

export function CronologiaTelefono() {
  const tracciando = useStore((s) => s.operazione.tipo === 'disegnaAsta');
  const puoAnnullare = useStore((s) => s.passato.length > 0) || tracciando;
  const puoRipetere = useStore((s) => s.futuro.length > 0);
  return (
    <div className="cronologia-telefono" role="group" aria-label="Cronologia">
      <button type="button" onClick={annulla} disabled={!puoAnnullare}
              aria-label="Annulla" title="Annulla" className="tasto-cronologia">
        <Icona nome="annulla" dimensione={22} />
      </button>
      <button type="button" onClick={ripeti} disabled={!puoRipetere}
              aria-label="Ripeti" title="Ripeti" className="tasto-cronologia">
        <Icona nome="ripeti" dimensione={22} />
      </button>
    </div>
  );
}

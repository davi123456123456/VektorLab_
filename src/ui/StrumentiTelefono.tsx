/**
 * GLI STRUMENTI SUL TELEFONO: Seleziona, Nodo, Asta, in colonna in basso a
 * sinistra sopra il disegno.
 *
 * Stanno lì perché è dove arriva il pollice tenendo il telefono con una mano,
 * e in colonna perché in riga si sarebbero presi metà della larghezza che
 * serve alla barra delle azioni sulla selezione, che sta in basso anche lei.
 *
 * Compaiono solo in Disegna: nelle altre modalità il clic posa un vincolo o
 * un carico, e lo strumento scelto non cambia niente (vedi `CanvasView`).
 * Tre tasti che non fanno nulla sarebbero tre tasti da capire per niente.
 */

import { useStore } from '../state/store.js';
import { STRUMENTI } from './BarraModalita.js';
import { Icona } from './icone.js';

export function StrumentiTelefono() {
  const strumento = useStore((s) => s.strumento);
  const impostaStrumento = useStore((s) => s.impostaStrumento);
  return (
    <div className="strumenti-telefono" role="group" aria-label="Strumento">
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

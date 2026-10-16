/**
 * DA CONTROLLARE — dopo il disegno dalla foto, ciò che la lettura non ha
 * potuto decidere da sola. Una striscia in basso, che si apre in elenco;
 * toccando una voce si selezionano i nodi e le aste che riguarda. Vive solo
 * qui: non entra nel progetto, nel .vektor o nella cronologia.
 */

import { useEffect, useState } from 'react';
import { ETICHETTA } from '../foto/app/disegna.js';
import type { AvvisoApp } from '../foto/app/avvisi.js';
import { useStore } from '../state/store.js';

export function AvvisiFoto({ avvisi, chiudi }: { avvisi: AvvisoApp[]; chiudi: () => void }) {
  const [aperto, setAperto] = useState(false);
  const seleziona = useStore((s) => s.seleziona);
  // annullata la struttura dalla foto, le sue voci non hanno più senso
  const disegnata = useStore((s) => s.passato.some((c) => c.etichetta === ETICHETTA));
  useEffect(() => { if (!disegnata) chiudi(); }, [disegnata, chiudi]);
  return (
    <div className="avvisi-foto" role="status">
      <div className="avvisi-foto-riga">
        <button type="button" className="avvisi-foto-titolo" onClick={() => setAperto((v) => !v)}
                aria-expanded={aperto} disabled={avvisi.length === 0}>
          Disegnata dalla foto · {avvisi.length === 0 ? 'niente da segnalare' : `Da controllare: ${avvisi.length}`}
        </button>
        <button type="button" className="avvisi-foto-chiudi" aria-label="Chiudi" onClick={chiudi}>✕</button>
      </div>
      {aperto && (
        <ul className="avvisi-foto-elenco">
          {avvisi.map((a, k) => (
            <li key={k}>
              <button type="button" onClick={() => seleziona({ nodi: new Set(a.nodi), aste: new Set(a.aste) })}>{a.messaggio}</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

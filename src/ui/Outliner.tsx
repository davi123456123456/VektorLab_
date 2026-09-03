/**
 * Albero degli oggetti, sincronizzato con la selezione sul canvas.
 * Serve soprattutto quando la geometria è fitta e cliccare l'oggetto giusto
 * diventa difficile: qui si seleziona per nome.
 */

import { useState } from 'react';
import { etichette } from '../state/etichette.js';
import { useStore } from '../state/store.js';
import { Pannello } from './Pannelli.js';

export function Outliner() {
  const progetto = useStore((s) => s.progetto);
  const selezione = useStore((s) => s.selezione);
  const seleziona = useStore((s) => s.seleziona);
  const eti = etichette(progetto);
  const [apertoNodi, setApertoNodi] = useState(true);
  const [aperteAste, setAperteAste] = useState(true);

  const stileVoce = (attiva: boolean) => ({
    background: attiva ? 'var(--accento-scuro)' : 'transparent',
    color: attiva ? '#fff' : 'var(--testo-attenuato)',
  });

  return (
    <Pannello titolo="Struttura">
      <div className="py-1 text-[12px]">
        <Gruppo
          etichetta={`Nodi (${progetto.nodi.length})`}
          aperto={apertoNodi}
          onToggle={() => setApertoNodi((v) => !v)}
        />
        {apertoNodi && progetto.nodi.map((n) => (
          <button
            key={n.id}
            type="button"
            onClick={(e) => seleziona({ nodi: new Set([n.id]) }, e.shiftKey)}
            className="numerico flex w-full items-center gap-2 whitespace-nowrap px-5 py-[3px]
                       text-left text-[11px] hover:brightness-125"
            style={stileVoce(selezione.nodi.has(n.id))}
          >
            <span className="w-16 shrink-0 truncate" title={String(n.id)}>
              {eti.nodo(n.id)}
            </span>
            <span className="shrink-0 opacity-60">
              {n.x.toFixed(2)}, {n.y.toFixed(2)}
            </span>
            {n.vincolo && (
              <span className="ml-auto shrink-0 text-[10px]" style={{ color: 'var(--vincolo)' }}>
                {n.vincolo.tipo.slice(0, 4)}
              </span>
            )}
          </button>
        ))}

        <Gruppo
          etichetta={`Aste (${progetto.aste.length})`}
          aperto={aperteAste}
          onToggle={() => setAperteAste((v) => !v)}
        />
        {aperteAste && progetto.aste.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={(e) => seleziona({ aste: new Set([a.id]) }, e.shiftKey)}
            className="numerico flex w-full items-center gap-2 whitespace-nowrap px-5 py-[3px]
                       text-left text-[11px] hover:brightness-125"
            style={stileVoce(selezione.aste.has(a.id))}
          >
            <span className="w-8 shrink-0">{eti.asta(a.id)}</span>
            <span className="min-w-0 flex-1 truncate opacity-60"
                  title={`${a.nodoIniziale} → ${a.nodoFinale}`}>
              {a.nodoIniziale} → {a.nodoFinale}
            </span>
            {(a.svincolo.iniziale.M || a.svincolo.finale.M) && (
              <span className="shrink-0 text-[10px]" style={{ color: 'var(--accento)' }}
                    title="cerniera interna">⌾</span>
            )}
          </button>
        ))}

        {progetto.nodi.length === 0 && (
          <p className="px-3 py-4 text-[11px] leading-relaxed"
             style={{ color: 'var(--testo-debole)' }}>
            Il modello è vuoto. Premi <b>L</b> per lo strumento asta e traccia la
            prima campata, oppure <b>N</b> per posare singoli nodi.
          </p>
        )}
      </div>
    </Pannello>
  );
}

function Gruppo({ etichetta, aperto, onToggle }: {
  etichetta: string; aperto: boolean; onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center gap-1 px-2 py-1 text-left text-[11px] font-semibold
                 uppercase tracking-wide hover:brightness-125"
      style={{ color: 'var(--testo-debole)' }}
    >
      <span className="inline-block w-3">{aperto ? '▾' : '▸'}</span>
      {etichetta}
    </button>
  );
}

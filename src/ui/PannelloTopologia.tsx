/**
 * Diagnostica della topologia: il grafo, nodo per nodo.
 *
 * Esiste perché il bug del collegamento mancato deve poter essere VISTO. Il
 * disegno non lo mostra — due segmenti coincidenti in un punto sembrano
 * uniti — e il conteggio dei corpi rigidi ne è solo la conseguenza. Qui si
 * legge la sola cosa che conta: quali segmenti referenziano lo stesso id di
 * nodo.
 *
 * Le due condizioni che generano il bug — nodi coincidenti non fusi, e
 * riferimenti a nodi inesistenti — sono in rosso in cima, non sepolte
 * nell'elenco.
 */

import { useStore } from '../state/store.js';
import { Pannello } from './Pannelli.js';
import { tintaCorpo } from '../render/scene.js';
import type { NodoTopologico } from '../core/kinematics/topologia.js';
import type { ElementId } from '../core/model/types.js';

const ROMANI = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
const romano = (i: number) => ROMANI[i] ?? `${i + 1}`;

export function PannelloTopologia() {
  const t = useStore((s) => s.topologia);
  const norm = useStore((s) => s.normalizzazione);
  const calcolo = useStore((s) => s.normalizzazione?.progetto ?? s.progetto);
  const evidenzia = useStore((s) => s.evidenziaCorpo);
  const evidenziato = useStore((s) => s.corpoEvidenziato);

  if (!t) {
    return (
      <Pannello titolo="Topologia">
        <p className="px-3 py-3 text-[11px]" style={{ color: 'var(--testo-attenuato)' }}>
          Nessun modello da ispezionare.
        </p>
      </Pannello>
    );
  }

  const posizione = new Map(calcolo.nodi.map((n) => [n.id as unknown as string, n]));

  return (
    <Pannello titolo="Topologia">
      <div className="pb-3">
        <Anomalie />

        <div className="border-b px-3 py-2" style={{ borderColor: 'var(--bordo)' }}>
          <div className="numerico grid grid-cols-2 gap-x-3 text-[10.5px]"
               style={{ color: 'var(--testo-attenuato)' }}>
            <span>nodi</span><span>{calcolo.nodi.length}</span>
            <span>segmenti</span><span>{calcolo.aste.length}</span>
            <span>corpi rigidi</span><span>{t.n}</span>
            <span>anelli chiusi</span><span>{t.anelliTotali}</span>
          </div>
        </div>

        <div className="border-b px-3 py-2" style={{ borderColor: 'var(--bordo)' }}>
          <div className="pb-1 text-[10px] font-semibold uppercase tracking-wider"
               style={{ color: 'var(--testo-debole)' }}>
            Corpi rigidi
          </div>
          {t.asteDelCorpo.map((aste, i) => (
            <button
              key={i}
              type="button"
              onMouseEnter={() => evidenzia(i)}
              onMouseLeave={() => evidenzia(null)}
              onClick={() => evidenzia(evidenziato === i ? null : i)}
              className="numerico flex w-full items-start gap-2 py-[2px] text-left text-[10.5px]"
              style={{ background: evidenziato === i ? 'var(--accento-scuro)' : undefined }}
            >
              <span className="mt-[3px] h-2 w-2 shrink-0 rounded-sm"
                    style={{ background: tintaCorpo(i) }} />
              <span className="w-6 shrink-0" style={{ color: 'var(--testo)' }}>
                {romano(i)}
              </span>
              <span className="min-w-0 flex-1" style={{ color: 'var(--testo-attenuato)' }}>
                {aste.map((a) => a as unknown as string).join(', ')}
              </span>
            </button>
          ))}
        </div>

        <div className="px-3 py-2">
          <div className="pb-1 text-[10px] font-semibold uppercase tracking-wider"
               style={{ color: 'var(--testo-debole)' }}>
            Nodi ({t.nodi.length})
          </div>
          {t.nodi.map((n) => (
            <Nodo
              key={n.nodoId as unknown as string}
              nodo={n}
              x={posizione.get(n.nodoId as unknown as string)?.x ?? 0}
              y={posizione.get(n.nodoId as unknown as string)?.y ?? 0}
              corpo={corpoDelNodo(n, t.corpoDiAsta)}
            />
          ))}
        </div>
      </div>
    </Pannello>
  );
}

function corpoDelNodo(
  n: NodoTopologico, corpoDiAsta: ReadonlyMap<ElementId, number>,
): number | null {
  const primo = n.gruppoRigido[0];
  if (!primo) return null;
  return corpoDiAsta.get(primo.astaId) ?? null;
}

function Nodo({ nodo, x, y, corpo }: {
  nodo: NodoTopologico; x: number; y: number; corpo: number | null;
}) {
  const sconnesso = nodo.svincolate.length > 0;
  return (
    <div className="numerico py-[3px] text-[10px] leading-relaxed">
      <div className="flex gap-2">
        <span style={{ color: 'var(--testo)' }}>{nodo.nodoId as unknown as string}</span>
        <span style={{ color: 'var(--testo-debole)' }}>
          x={x.toFixed(2)} y={y.toFixed(2)}
        </span>
      </div>
      <div className="pl-3" style={{ color: 'var(--testo-attenuato)' }}>
        segmenti: {nodo.estremita.length === 0 ? '—' : nodo.estremita.map(
          (e) => `${e.astaId as unknown as string}(${e.estremo === 'iniziale' ? 'inizio' : 'fine'})`,
        ).join(', ')}
      </div>
      <div className="pl-3" style={{ color: sconnesso ? 'var(--momento)' : 'var(--carico)' }}>
        {sconnesso
          ? `sconnessione: ${nodo.svincolate.length} `
            + `${nodo.svincolate.length === 1 ? 'segmento svincolato' : 'segmenti svincolati'}`
            + ` → ${nodo.gradiVincolo} gradi`
          : 'sconnessione: nessuna → NODO RIGIDO'}
      </div>
      {corpo !== null && (
        <div className="flex items-center gap-1.5 pl-3" style={{ color: 'var(--testo-debole)' }}>
          <span className="h-2 w-2 rounded-sm" style={{ background: tintaCorpo(corpo) }} />
          corpo rigido {romano(corpo)}
        </div>
      )}
    </div>
  );
}

/**
 * Le due condizioni che generano il bug. Se compaiono qui, il conteggio dei
 * corpi rigidi è giusto ma sta contando un modello sbagliato.
 */
function Anomalie() {
  const n = useStore((s) => s.normalizzazione);
  if (!n) return null;
  const nulla = n.fusioni.size === 0 && n.asteScartate.length === 0
    && n.nodiSuAsta.length === 0;

  if (nulla) {
    return (
      <div className="border-b px-3 py-2 text-[10.5px]"
           style={{ borderColor: 'var(--bordo)', color: 'var(--carico)' }}>
        Grafo integro: nessun nodo coincidente, nessun riferimento rotto.
      </div>
    );
  }

  return (
    <div className="border-b px-3 py-2" style={{ borderColor: 'var(--bordo)' }}>
      {n.fusioni.size > 0 && (
        <p className="text-[10.5px] leading-relaxed" style={{ color: 'var(--vincolo)' }}>
          <b>{n.fusioni.size} nodi coincidenti</b> fusi in fase di analisi: nel
          modello ci sono punti diversi alle stesse coordinate. Il disegno sembra
          collegato, il grafo no.
        </p>
      )}
      {n.asteScartate.length > 0 && (
        <p className="pt-1 text-[10.5px] leading-relaxed" style={{ color: 'var(--vincolo)' }}>
          <b>{n.asteScartate.length} segmenti scartati</b>:{' '}
          {n.asteScartate.map((a) => `${a.astaId as unknown as string} (${a.motivo})`).join(', ')}
        </p>
      )}
      {n.nodiSuAsta.length > 0 && (
        <p className="pt-1 text-[10.5px] leading-relaxed" style={{ color: 'var(--momento)' }}>
          <b>{n.nodiSuAsta.length} nodi appoggiati su un'asta</b> che non li
          referenzia:{' '}
          {n.nodiSuAsta.map(
            (s) => `${s.nodoId as unknown as string} su ${s.astaId as unknown as string}`,
          ).join(', ')}. Se dovevano essere collegati, l'asta va spezzata; se si
          incrociano soltanto, va bene così.
        </p>
      )}
    </div>
  );
}

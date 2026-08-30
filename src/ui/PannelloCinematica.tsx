/**
 * Analisi cinematica.
 *
 * Il pannello mostra il conteggio classico ACCANTO al rango, perché è proprio
 * il confronto fra i due a essere istruttivo: 3n − Σv dice «isostatica»,
 * il rango dice «labile e iperstatica», e la differenza si legge in una riga.
 */

import { useStore } from '../state/store.js';
import { Bottone, Pannello } from './Pannelli.js';
import type { Classificazione, Diagnosi } from '../core/model/results.js';

const COLORE_CLASSE: Record<Classificazione, string> = {
  isostatica: 'var(--ok)',
  iperstatica: 'var(--accento)',
  labile: 'var(--errore)',
  'labile e iperstatica': 'var(--errore)',
};

export function PannelloCinematica() {
  const cinematica = useStore((s) => s.cinematica);
  const aggiorna = useStore((s) => s.aggiornaCinematica);
  const modo = useStore((s) => s.modoMeccanismo);
  const impostaModo = useStore((s) => s.impostaModoMeccanismo);
  const anima = useStore((s) => s.animaMeccanismo);
  const alternaAnimazione = useStore((s) => s.alternaAnimazione);
  const nAste = useStore((s) => s.progetto.aste.length);

  if (!cinematica) {
    return (
      <Pannello titolo="Analisi cinematica">
        <div className="space-y-3 p-3">
          <p className="text-[11px] leading-relaxed" style={{ color: 'var(--testo-debole)' }}>
            L'analisi cinematica classifica la struttura come isostatica,
            iperstatica o labile, e individua i cinematismi. È indipendente dai
            carichi: dipende solo da geometria e vincoli.
          </p>
          <Bottone larghezzaPiena onClick={aggiorna} attivo>
            {nAste === 0 ? 'nessuna asta da analizzare' : 'esegui analisi cinematica'}
          </Bottone>
        </div>
      </Pannello>
    );
  }

  const k = cinematica;
  const conteggioIngenuo = k.gradiLiberta - k.gradiVincolo;
  const ingannevole = conteggioIngenuo !== k.labilita - k.iperstaticita * 0 &&
                      k.labilita > 0 && conteggioIngenuo <= 0;

  return (
    <Pannello titolo="Analisi cinematica">
      <div className="space-y-3 p-3">
        <div className="rounded border px-2 py-1.5 text-center"
             style={{ borderColor: COLORE_CLASSE[k.classificazione] }}>
          <div className="text-[13px] font-semibold uppercase tracking-wide"
               style={{ color: COLORE_CLASSE[k.classificazione] }}>
            {k.classificazione}
          </div>
        </div>

        <table className="numerico w-full text-[11px]">
          <tbody>
            <Voce etichetta="corpi rigidi  n" valore={k.numeroCorpi} />
            <Voce etichetta="gradi di libertà  3n" valore={k.gradiLiberta} />
            <Voce etichetta="gradi di vincolo  v" valore={k.gradiVincolo} />
            <Voce etichetta="rango della matrice" valore={k.rango} evidenzia />
            <Voce etichetta="labilità  3n − rango" valore={k.labilita}
                  colore={k.labilita > 0 ? 'var(--errore)' : undefined} />
            <Voce etichetta="iperstaticità  v − rango" valore={k.iperstaticita} />
          </tbody>
        </table>

        {ingannevole && (
          <div className="rounded border px-2 py-1.5 text-[10px] leading-relaxed"
               style={{ borderColor: 'var(--avviso)', color: 'var(--avviso)' }}>
            Il conteggio 3n − v darebbe <b>{conteggioIngenuo}</b>, cioè
            «{conteggioIngenuo === 0 ? 'isostatica' : 'iperstatica'}». È il rango
            a rivelare che i vincoli sono mal disposti.
          </div>
        )}

        <div>
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider"
               style={{ color: 'var(--testo-debole)' }}>Diagnosi</div>
          <div className="space-y-1.5">
            {k.diagnosi.map((d, i) => <MessaggioDiagnosi key={i} d={d} />)}
          </div>
        </div>

        {k.labilita > 0 && k.meccanismi.length > 0 && (
          <div className="border-t pt-2" style={{ borderColor: 'var(--bordo)' }}>
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider"
                 style={{ color: 'var(--testo-debole)' }}>
              Cinematismi ({k.meccanismi.length})
            </div>
            <div className="flex flex-wrap gap-1">
              {k.meccanismi.map((_, i) => (
                <Bottone key={i} attivo={modo === i} onClick={() => impostaModo(i)}>
                  modo {i + 1}
                </Bottone>
              ))}
              <Bottone attivo={anima} onClick={alternaAnimazione}
                       titolo="L'ampiezza dell'animazione non ha significato fisico: conta la direzione del moto">
                {anima ? 'in movimento' : 'fermo'}
              </Bottone>
            </div>
            <div className="mt-2 space-y-0.5">
              {k.meccanismi[modo]?.cir.map((c, i) => (
                <div key={i} className="numerico text-[10px]"
                     style={{ color: 'var(--testo-attenuato)' }}>
                  {k.corpi.length > 1 ? `corpo ${i + 1}: ` : ''}
                  {c.tipo === 'proprio'
                    ? `C (${c.x.toFixed(3)}, ${c.y.toFixed(3)})`
                    : c.tipo === 'improprio'
                      ? `C∞ direzione ${((c.direzione * 180) / Math.PI).toFixed(1)}°`
                      : 'fermo'}
                </div>
              ))}
            </div>
          </div>
        )}

        {k.valoriSingolari.length > 0 && (
          <details className="text-[10px]" style={{ color: 'var(--testo-debole)' }}>
            <summary className="cursor-pointer">valori singolari</summary>
            <p className="mt-1 leading-relaxed">
              Il rango conta quanti sono significativamente diversi da zero. Un
              valore molto piccolo ma non nullo segnala una struttura
              <i> quasi</i> labile: formalmente regge, in pratica è pessima.
            </p>
            <div className="numerico mt-1 break-all">
              {k.valoriSingolari.map((s) => s.toExponential(2)).join('  ')}
            </div>
          </details>
        )}

        <Bottone larghezzaPiena onClick={aggiorna}>ricalcola</Bottone>
      </div>
    </Pannello>
  );
}

function Voce({ etichetta, valore, colore, evidenzia }: {
  etichetta: string; valore: number; colore?: string; evidenzia?: boolean;
}) {
  return (
    <tr>
      <td className="py-0.5" style={{ color: 'var(--testo-attenuato)' }}>{etichetta}</td>
      <td className="py-0.5 text-right font-semibold"
          style={{ color: colore ?? (evidenzia ? 'var(--accento)' : 'var(--testo)') }}>
        {valore}
      </td>
    </tr>
  );
}

function MessaggioDiagnosi({ d }: { d: Diagnosi }) {
  const colore = d.gravita === 'errore' ? 'var(--errore)'
    : d.gravita === 'avviso' ? 'var(--avviso)' : 'var(--testo-attenuato)';
  return (
    <div className="rounded px-2 py-1 text-[10px] leading-relaxed"
         style={{ background: 'var(--sfondo-elevato)', color: colore }}>
      {d.messaggio}
    </div>
  );
}

/**
 * Ispettore contestuale: mostra e modifica le proprietà della selezione.
 * Le modifiche passano dai comandi, quindi sono annullabili come tutto il resto.
 */

import { useStore } from '../state/store.js';
import { dividiAsta, modificaAste, ricongiungiNodo } from '../state/commands.js';
import { Bottone, CampoNumero, Pannello, Riga, Selettore } from './Pannelli.js';
import type { Asta, ElementId, NodeId } from '../core/model/types.js';

export function Ispettore() {
  const progetto = useStore((s) => s.progetto);
  const selezione = useStore((s) => s.selezione);
  const esegui = useStore((s) => s.esegui);

  const asteSelezionate = progetto.aste.filter((a) => selezione.aste.has(a.id));
  const nodiSelezionati = progetto.nodi.filter((n) => selezione.nodi.has(n.id));


  // niente selezionato: in Modellazione si definisce la GEOMETRIA, e le
  // proprietà meccaniche stanno dove si governano — in Materiali
  if (asteSelezionate.length === 0 && nodiSelezionati.length === 0) {
    return (
      <Pannello titolo="Proprietà">
        <div className="py-2">
          <p className="px-3 pb-2 text-[length:var(--t-minuto)] leading-relaxed"
             style={{ color: 'var(--testo-debole)' }}>
            Nessuna selezione. Disegna la struttura: materiale e sezione si
            assegnano in <b>Materiali</b>, e valgono per tutte le aste finché
            non se ne assegna una specifica.
          </p>
        </div>
      </Pannello>
    );
  }

  const modifica = (patch: Partial<Asta>) => {
    esegui(modificaAste(asteSelezionate.map((a) => a.id), patch));
  };

  const prima = asteSelezionate[0];
  const tutteUguali = <T,>(f: (a: Asta) => T): T | null => {
    if (asteSelezionate.length === 0) return null;
    const v = f(asteSelezionate[0]);
    return asteSelezionate.every((a) => f(a) === v) ? v : null;
  };

  return (
    <Pannello titolo={`Proprietà — ${nodiSelezionati.length} nodi, ${asteSelezionate.length} aste`}>
      <Azioni aste={asteSelezionate.map((a) => a.id)}
              nodi={nodiSelezionati.map((n) => n.id)} />
      <div className="space-y-1 py-2">
        {nodiSelezionati.length === 1 && (
          <>
            <Intestazione testo={`Nodo ${nodiSelezionati[0].id}`} />
            <Riga etichetta="x">
              <CampoNumero valore={nodiSelezionati[0].x} suffisso="m"
                           onChange={() => { /* modifica da tastiera: usa G */ }}
                           disabilitato />
            </Riga>
            <Riga etichetta="y">
              <CampoNumero valore={nodiSelezionati[0].y} suffisso="m"
                           onChange={() => { /* modifica da tastiera: usa G */ }}
                           disabilitato />
            </Riga>
            <p className="px-3 text-[length:var(--t-minuto)]" style={{ color: 'var(--testo-debole)' }}>
              Per spostarlo con precisione: <b>G</b> <b>X</b> valore <b>Invio</b>.
            </p>
          </>
        )}

        {asteSelezionate.length > 0 && prima && (
          <>
            <Intestazione testo={asteSelezionate.length === 1
              ? `Asta ${prima.id}` : `${asteSelezionate.length} aste`} />
            <SolaLettura
              etichetta="Materiale"
              valore={tutteUguali((a) => a.materialeId as string)}
              specifica={asteSelezionate.some((a) => a.materialeSpecifico)}
            />
            <SolaLettura
              etichetta="Sezione"
              valore={tutteUguali((a) => a.sezioneId as string)}
              specifica={asteSelezionate.some((a) => a.sezioneSpecifica)}
            />
            <div className="px-3 pb-1 pt-1">
              <Bottone
                titolo="Porta alla modalità Materiali con queste aste già selezionate"
                onClick={() => useStore.getState().impostaModalita('materiali')}
              >
                modifica in Materiali →
              </Bottone>
            </div>
            <Riga etichetta="Teoria">
              <Selettore
                valore={(tutteUguali((a) => a.teoria ?? 'auto') ?? 'auto') as string}
                opzioni={[
                  { valore: 'auto', etichetta: 'automatica (L/h < 10 → Timoshenko)' },
                  { valore: 'eulero-bernoulli', etichetta: 'Eulero-Bernoulli' },
                  { valore: 'timoshenko', etichetta: 'Timoshenko' },
                ]}
                onChange={(v) => modifica({ teoria: v as Asta['teoria'] })}
              />
            </Riga>

            <Intestazione testo="Svincoli di estremità" />
            <p className="px-3 pb-1 text-[length:var(--t-minuto)] leading-relaxed"
               style={{ color: 'var(--testo-debole)' }}>
              Spuntare significa <b>non trasmesso</b>. M svincolato = cerniera interna.
            </p>
            <SvincoloRiga
              etichetta="iniziale"
              valore={prima.svincolo.iniziale}
              onChange={(s) => modifica({
                svincolo: { iniziale: s, finale: prima.svincolo.finale },
              })}
            />
            <SvincoloRiga
              etichetta="finale"
              valore={prima.svincolo.finale}
              onChange={(s) => modifica({
                svincolo: { iniziale: prima.svincolo.iniziale, finale: s },
              })}
            />
          </>
        )}
      </div>
    </Pannello>
  );
}

function Intestazione({ testo }: { testo: string }) {
  return (
    <div className="mt-2 border-t px-3 pb-1 pt-2 text-[length:var(--t-minuto)] font-semibold uppercase tracking-wider"
         style={{ borderColor: 'var(--bordo)', color: 'var(--testo-debole)' }}>
      {testo}
    </div>
  );
}

function SvincoloRiga({ etichetta, valore, onChange }: {
  etichetta: string;
  valore: { N: boolean; T: boolean; M: boolean };
  onChange: (v: { N: boolean; T: boolean; M: boolean }) => void;
}) {
  return (
    <Riga etichetta={etichetta}>
      <div className="flex gap-3">
        {(['N', 'T', 'M'] as const).map((k) => (
          <label key={k} className="flex cursor-pointer items-center gap-1 text-[length:var(--t-minuto)]">
            <input
              type="checkbox"
              checked={valore[k]}
              onChange={(e) => onChange({ ...valore, [k]: e.target.checked })}
              className="h-3 w-3 accent-[var(--accento)]"
            />
            <span className="numerico">{k}</span>
          </label>
        ))}
      </div>
    </Riga>
  );
}


/**
 * Le due operazioni di comodo sulla geometria.
 *
 * Dividere serve ad avere nodi dove appendere qualcosa; ricongiungere serve a
 * disfare una divisione che non serve più. Nessuna delle due cambia la
 * struttura — e se il nodo porta qualcosa, il ricongiungimento si rifiuta
 * invece di cambiarla di nascosto.
 */
function Azioni({ aste, nodi }: { aste: ElementId[]; nodi: NodeId[] }) {
  const esegui = useStore((s) => s.esegui);
  const messaggia = useStore((s) => s.messaggia);
  if (aste.length === 0 && nodi.length === 0) return null;

  return (
    <div className="border-b px-3 py-2" style={{ borderColor: 'var(--bordo)' }}>
      {aste.length === 1 && (
        <div className="flex items-center gap-1">
          <span className="text-[length:var(--t-minuto)]" style={{ color: 'var(--testo-debole)' }}>
            dividi in
          </span>
          {[2, 3, 4].map((k) => (
            <Bottone key={k} titolo={`Inserisce ${k - 1} nodi equidistanti`}
                     onClick={() => {
                       esegui(dividiAsta(aste[0], k));
                       messaggia(`asta divisa in ${k} parti`);
                     }}>
              {k}
            </Bottone>
          ))}
        </div>
      )}
      {nodi.length === 1 && (
        <div className="pt-2">
          <Bottone
            larghezzaPiena
            titolo="Toglie il nodo e ricongiunge le due aste, se non porta nulla"
            onClick={() => {
              const cmd = ricongiungiNodo(nodi[0]);
              esegui(cmd);
              messaggia(cmd.possibile
                ? 'nodo rimosso, aste ricongiunte'
                : 'il nodo porta vincoli, carichi o sconnessioni: non si può ricongiungere');
            }}
          >
            ricongiungi le aste
          </Bottone>
        </div>
      )}
    </div>
  );
}


/**
 * Materiale e sezione dell'asta, in SOLA LETTURA.
 *
 * In Modellazione si definisce la geometria. Le proprietà meccaniche si
 * governano dove stanno le loro conseguenze — in Materiali — e mostrarle qui
 * modificabili significherebbe avere due posti in cui cambiarle, con la
 * distinzione fra assegnazione predefinita e specifica visibile in uno solo.
 */
function SolaLettura({ etichetta, valore, specifica }: {
  etichetta: string; valore: string | null; specifica: boolean;
}) {
  return (
    <Riga etichetta={etichetta}>
      <div className="flex items-center gap-2">
        <span className="numerico truncate text-[length:var(--t-minuto)]"
              style={{ color: 'var(--testo-attenuato)' }}>
          {valore ?? '— valori diversi —'}
        </span>
        {specifica && (
          <span className="shrink-0 rounded-[var(--raggio-controllo)] px-1 text-[length:var(--t-minuto)]"
                style={{ background: 'var(--accento-scuro)', color: '#fff' }}
                title="Assegnazione specifica: non segue il predefinito del modello">
            specifica
          </span>
        )}
      </div>
    </Riga>
  );
}

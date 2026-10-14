/**
 * Analisi cinematica.
 *
 * §3 — IL VERDETTO STA IN DUE RIGHE.
 *
 * Prima questo pannello stampava sempre: un paragrafo introduttivo, una
 * tabella di sei righe, un riquadro sul conteggio ingannevole, un elenco di
 * diagnosi. Chi lo apre la decima volta non ha bisogno che gli si rispieghi
 * che cos'è l'analisi cinematica: ha bisogno di sapere com'è venuta.
 *
 * Quindi: una riga di verdetto, una riga di numeri, e — solo se la struttura
 * è labile o mal vincolata — UNA frase che dica cosa non va, perché quella è
 * un'informazione su cui si agisce. Il resto — il conteggio riga per riga, le
 * diagnosi, i valori singolari — sta nel blocco che si espande.
 */

import { useStore } from '../state/store.js';
import { Bottone, Pannello } from './Pannelli.js';
import type {
  Classificazione, Diagnosi, RisultatoCinematico,
} from '../core/model/results.js';
import { SoloComputer } from './SoloComputer.js';

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
        <div className="p-3">
          {/*
            §3.3 — niente paragrafo introduttivo. Il bottone dice già che cosa
            fa, e che l'analisi non dipenda dai carichi si legge nel
            suggerimento la prima volta che serve.
          */}
          <Bottone
            larghezzaPiena onClick={aggiorna} attivo
            titolo="Classifica la struttura e individua i cinematismi. Dipende solo da geometria e vincoli, non dai carichi."
          >
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
    /*
      «ricalcola» sta nell'INTESTAZIONE, non in fondo al corpo: il corpo
      scorre, e un bottone in fondo a un'area che scorre si trova tagliato dal
      bordo — è come si presentava, mezzo visibile sotto il pannello seguente.
      In intestazione resta sempre raggiungibile.
    */
    <Pannello
      titolo="Analisi cinematica"
      azione={<Bottone minore onClick={aggiorna} titolo="Rifà l'analisi cinematica">
        ricalcola
      </Bottone>}
    >
      <div className="p-3" style={{ display: 'grid', gap: 'var(--s2)' }}>
        <Verdetto k={k} />

        {/*
          §3.1 — il dettaglio del conteggio è DISPONIBILE, non stampato. Chi
          vuole vedere come si arriva al rango lo apre; chi guarda il verdetto
          non se lo trova addosso ogni volta.
        */}
        <details className="text-[length:var(--t-minuto)]">
          <summary className="riga-elenco cursor-pointer"
                   style={{ color: 'var(--testo-debole)', fontSize: 'var(--t-minuto)' }}>
            dettaglio del conteggio
          </summary>
          <table className="numerico w-full" style={{ fontSize: 'var(--t-minuto)' }}>
            <tbody>
              <Voce etichetta="corpi rigidi  n" valore={k.numeroCorpi} />
              <Voce etichetta="gradi di libertà  3n" valore={k.gradiLiberta} />
              <Voce etichetta="vincoli esterni" valore={k.gradiVincoloEsterni} />
              <Voce etichetta="vincoli interni" valore={k.gradiVincoloInterni} />
              <Voce etichetta="gradi di vincolo  v" valore={k.gradiVincolo} />
              <Voce etichetta="rango della matrice" valore={k.rango} evidenzia />
              <Voce etichetta="labilità  3n − rango" valore={k.labilita}
                    colore={k.labilita > 0 ? 'var(--errore)' : undefined} />
              <Voce etichetta="iperstaticità  v − rango" valore={k.iperstaticita} />
            </tbody>
          </table>

          {ingannevole && (
            <p style={{ color: 'var(--avviso)', fontSize: 'var(--t-minuto)' }}>
              Il conteggio 3n − v darebbe {conteggioIngenuo}: è il rango a
              rivelare che i vincoli sono mal disposti.
            </p>
          )}

          <SoloComputer>
          {k.diagnosi.length > 0 && (
            <div style={{ display: 'grid', gap: 'var(--s1)', paddingTop: 'var(--s1)' }}>
              {k.diagnosi.map((d, i) => <MessaggioDiagnosi key={i} d={d} />)}
            </div>
          )}
          </SoloComputer>
        </details>

        {/* sul telefono l'analisi è il verdetto e il conteggio: nient'altro */}
        <SoloComputer>
        {k.labilita > 0 && k.meccanismi.length > 0 && (
          <div className="border-t pt-2" style={{ borderColor: 'var(--bordo)' }}>
            <div className="mb-1 text-[length:var(--t-minuto)] font-semibold uppercase tracking-wider"
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
                <div key={i} className="numerico text-[length:var(--t-minuto)]"
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
          <details style={{ color: 'var(--testo-debole)', fontSize: 'var(--t-minuto)' }}>
            <summary
              className="riga-elenco cursor-pointer"
              title="Il rango conta quanti sono significativamente diversi da zero. Uno molto piccolo ma non nullo segnala una struttura quasi labile: formalmente regge, in pratica è pessima."
            >valori singolari</summary>
            <div className="numerico break-all">
              {k.valoriSingolari.map((s) => s.toExponential(2)).join('  ')}
            </div>
          </details>
        )}
        </SoloComputer>

      </div>
    </Pannello>
  );
}

/**
 * §3.1 — IL VERDETTO: una riga in evidenza, una riga di numeri.
 *
 *     ISOSTATICA
 *     3 corpi · 9 gdl · 9 gdv · rango 9
 *
 * Il titolo dichiara anche il GRADO quando ce n'è uno — «IPERSTATICA 2 volte»,
 * «LABILE 1 grado» — perché il numero è la prima cosa che si cerca dopo la
 * parola, e farlo cercare in tabella è una riga di lettura in più.
 */
function Verdetto({ k }: { k: RisultatoCinematico }) {
  const colore = COLORE_CLASSE[k.classificazione];
  const titolo = intestazione(k);

  /*
   * §3.2 — l'UNICA frase ammessa, e solo quando serve.
   *
   * Una struttura labile o mal vincolata ha qualcosa che si può correggere, e
   * dirlo è utile. Su una struttura sana non c'è niente da aggiungere: la
   * parola «ISOSTATICA» ha già detto tutto. La frase è la prima diagnosi di
   * gravità più alta, che è quella che il modulo cinematico ordina per prima.
   */
  const problema = k.labilita > 0 || k.iperstaticita > 0
    ? k.diagnosi.find((d) => d.gravita === 'errore')
      ?? k.diagnosi.find((d) => d.gravita === 'avviso')
    : undefined;
  const frase = problema ? unaFrase(problema.messaggio) : null;

  return (
    <div>
      <div
        className="rounded-[var(--raggio-controllo)] text-center font-semibold tracking-wide"
        style={{
          border: `1px solid ${colore}`,
          borderRadius: 'var(--raggio-controllo)',
          color: colore,
          fontSize: 'var(--t-titolo)',
          padding: 'var(--s2)',
        }}
      >
        {titolo}
      </div>
      <div
        className="numerico text-center"
        style={{
          color: 'var(--testo-attenuato)',
          fontSize: 'var(--t-minuto)',
          paddingTop: 'var(--s1)',
        }}
      >
        {k.numeroCorpi} {k.numeroCorpi === 1 ? 'corpo' : 'corpi'}
        {' · '}{k.gradiLiberta} gdl
        {' · '}{k.gradiVincolo} gdv
        {' · '}rango {k.rango}
      </div>
      {problema && frase && (
        <p
          title={problema.messaggio}
          style={{
            color: problema.gravita === 'errore' ? 'var(--errore)' : 'var(--avviso)',
            fontSize: 'var(--t-minuto)',
            paddingTop: 'var(--s2)',
          }}
        >
          {frase}
        </p>
      )}
    </div>
  );
}

/**
 * §3.2 — UNA FRASE, non un paragrafo.
 *
 * Il modulo cinematico scrive diagnosi complete, ed è giusto che lo faccia:
 * servono nel blocco espandibile e nel PDF. Qui però va la sola frase
 * AZIONABILE, e si scarta quella che ripete il conteggio — «3 gradi di
 * vincolo, 3 gradi di libertà, rango 2: la struttura è LABILE» dice quello che
 * le due righe sopra hanno già detto, e occupa tre righe per dirlo.
 *
 * Il messaggio intero resta nel suggerimento, e per esteso nel dettaglio.
 */
function unaFrase(messaggio: string): string {
  const frasi = messaggio
    .split(/(?<=\.)\s+/)
    .map((f) => f.trim())
    .filter(Boolean);
  const ripetizione = /grad[oi] di (vincolo|libert)|rango \d/i;
  const utile = frasi.find((f) => !ripetizione.test(f)) ?? frasi[frasi.length - 1] ?? '';
  // se anche l'unica frase disponibile è lunghissima, si tronca: una riga di
  // verdetto seguita da otto righe di testo non è un verdetto
  return utile.length > 160 ? `${utile.slice(0, 157)}…` : utile;
}

/** «LABILE 1 grado · IPERSTATICA 1 volta», o la sola parola quando basta. */
function intestazione(k: RisultatoCinematico): string {
  const pezzi: string[] = [];
  if (k.labilita > 0) {
    pezzi.push(`LABILE ${k.labilita} grad${k.labilita === 1 ? 'o' : 'i'}`);
  }
  if (k.iperstaticita > 0) {
    pezzi.push(`IPERSTATICA ${k.iperstaticita} volt${k.iperstaticita === 1 ? 'a' : 'e'}`);
  }
  return pezzi.length > 0 ? pezzi.join(' · ') : 'ISOSTATICA';
}

function Voce({ etichetta, valore, colore, evidenzia }: {
  etichetta: string; valore: number; colore?: string; evidenzia?: boolean;
}) {
  return (
    <tr>
      <td className="py-1" style={{ color: 'var(--testo-attenuato)' }}>{etichetta}</td>
      <td className="py-1 text-right font-semibold"
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
    <div className="rounded-[var(--raggio-controllo)] px-2 py-1 leading-relaxed"
         style={{
           background: 'var(--sfondo-elevato)', color: colore,
           fontSize: 'var(--t-minuto)', borderRadius: 'var(--raggio-controllo)',
         }}>
      {d.messaggio}
    </div>
  );
}

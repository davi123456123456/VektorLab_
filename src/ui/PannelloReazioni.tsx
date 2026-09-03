/**
 * Pannello della modalità REAZIONI VINCOLARI.
 *
 * L'ordine non è casuale: prima COME È FATTA la struttura (isostatica,
 * iperstatica, labile), poi da dove vengono i numeri, poi i numeri. Chi legge
 * deve sapere che cosa sta guardando prima di guardarlo — la stessa tabella di
 * reazioni significa cose diverse su una isostatica e su una iperstatica.
 */

import { etichette } from '../state/etichette.js';
import { useStore } from '../state/store.js';
import { Bottone, Interruttore, Pannello } from './Pannelli.js';
import type { ComponenteReazione } from '../core/statica/reazioni.js';
import type { Tronco } from '../core/statica/elementino.js';
import { DisegnoConcio } from './DisegnoConcio.js';

const NOME_COMPONENTE: Record<ComponenteReazione['componente'], string> = {
  x: 'orizzontale',
  y: 'verticale',
  normale: 'normale al piano',
  assiale: 'lungo l\'asse',
  rotazione: 'momento',
};

/**
 * Nome leggibile del punto in cui agisce una reazione. I nodi nati
 * dall'espansione si chiamano `_n1`: un identificatore interno non deve mai
 * comparire in una tabella che l'utente copia in una relazione.
 */
function usaNomePunto(): (nodoId: string) => string {
  const statico = useStore((s) => s.statico);
  const eti = etichette(useStore((s) => s.progetto));
  return (nodoId: string) => {
    if (!statico) return eti.nodo(nodoId as never);
    const v = statico.modello.espansione.nodiVincolo.get(nodoId as never);
    if (v) {
      return `${eti.asta(v.astaId)} · ${(v.s * 100).toFixed(0)} %`;
    }
    const c = statico.modello.espansione.nodiSconnessione.get(nodoId as never);
    if (c) {
      return `${eti.asta(c.astaId)} · ${(c.s * 100).toFixed(0)} %`;
    }
    // un nodo del modello di CALCOLO non ha un'etichetta d'autore: si mostra
    // com'è, perché inventargliene una lo confonderebbe con un nodo disegnato
    return eti.nodo(nodoId as never);
  };
}

export function PannelloReazioni() {
  const statico = useStore((s) => s.statico);
  const calcoloInCorso = useStore((s) => s.calcoloInCorso);
  const mostraValori = useStore((s) => s.mostraValoriReazioni);
  const alternaValori = useStore((s) => s.alternaValoriReazioni);
  const troncoScelto = useStore((s) => s.troncoScelto);
  const sconnessioneEsplosa = useStore((s) => s.sconnessioneEsplosa);

  if (!statico) {
    return (
      <Pannello titolo="Reazioni vincolari">
        <p className="px-3 py-3 text-[11px]" style={{ color: 'var(--testo-attenuato)' }}>
          {calcoloInCorso ? 'Calcolo in corso…' : 'Nessun risultato disponibile.'}
        </p>
      </Pannello>
    );
  }

  const e = statico.equilibrio;
  const labile = e.classificazione === 'labile';

  return (
    <Pannello titolo="Reazioni vincolari">
      <div className="pb-3">
        <Classificazione />

        {labile ? <NienteNumeri /> : (
          <>
            <Interruttore attivo={mostraValori} onChange={alternaValori}
                          etichetta="valori accanto alle frecce" />
            <Tabella componenti={statico.componentiEsterne} />
            {e.sconnessioni.length > 0 && <Sconnessioni />}
            {troncoScelto && <CorpoLibero />}
            {!troncoScelto && !sconnessioneEsplosa && <Istruzioni />}
          </>
        )}

        <Autoverifiche />
      </div>
    </Pannello>
  );
}

/**
 * §6 — la distinzione fra isostatica, iperstatica e labile non è un dettaglio
 * diagnostico: è il concetto che decide se le reazioni si possono calcolare
 * per solo equilibrio, e va detto per esteso.
 */
function Classificazione() {
  const statico = useStore((s) => s.statico)!;
  const e = statico.equilibrio;
  const colore = e.classificazione === 'isostatica' ? 'var(--carico)'
    : e.classificazione === 'iperstatica' ? 'var(--momento)'
    : 'var(--vincolo)';

  return (
    <div className="border-b px-3 py-2" style={{ borderColor: 'var(--bordo)' }}>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-[13px] font-semibold" style={{ color: colore }}>
          {e.classificazione}
        </span>
        {e.labilita > 0 && (
          <span className="text-[11px]" style={{ color: 'var(--testo-attenuato)' }}>
            {e.labilita} {e.labilita === 1 ? 'grado' : 'gradi'} di labilità
          </span>
        )}
        {e.iperstaticita > 0 && (
          <span className="text-[11px]" style={{ color: 'var(--testo-attenuato)' }}>
            {e.labilita > 0 ? 'e ' : ''}
            {e.iperstaticita} {e.iperstaticita === 1 ? 'volta' : 'volte'} iperstatica
          </span>
        )}
      </div>

      <p className="pt-1 text-[10.5px] leading-relaxed"
         style={{ color: 'var(--testo-attenuato)' }}>
        {e.messaggio}
      </p>

      {statico.elementino.sorgente === 'fem' && e.classificazione === 'iperstatica' && (
        <p className="mt-1.5 rounded border px-2 py-1.5 text-[10.5px] leading-relaxed"
           style={{ borderColor: 'var(--momento)', color: 'var(--testo)' }}>
          Le reazioni mostrate sono calcolate <b>per congruenza</b> dal metodo
          degli spostamenti: dipendono dalle rigidezze EA ed EI degli elementi.
          Cambiando materiale o sezione i valori cambieranno. La vista per corpi
          rigidi con le sole equazioni cardinali non è risolvibile qui.
        </p>
      )}

      <div className="numerico grid grid-cols-2 gap-x-3 pt-2 text-[10.5px]"
           style={{ color: 'var(--testo-debole)' }}>
        <span>corpi rigidi</span><span>{e.corpi.length}</span>
        <span>equazioni</span><span>{e.numeroEquazioni}</span>
        <span>incognite</span><span>{e.numeroIncognite}</span>
        <span>rango</span><span>{e.rango}</span>
      </div>
    </div>
  );
}

/**
 * §6 — su una struttura labile non si mostra alcun numero. Il metodo degli
 * spostamenti ne restituirebbe comunque, ma sarebbero il risultato di come è
 * stata trattata una matrice singolare, non di una condizione fisica.
 */
function NienteNumeri() {
  const impostaModalita = useStore((s) => s.impostaModalita);
  return (
    <div className="border-b px-3 py-3" style={{ borderColor: 'var(--bordo)' }}>
      <p className="text-[11px] leading-relaxed" style={{ color: 'var(--testo)' }}>
        Nessuna reazione viene mostrata: <b>non esiste</b>. I carichi applicati
        mettono in moto la struttura invece di essere equilibrati, e qualunque
        numero apparisse qui sarebbe un artefatto del calcolo.
      </p>
      <p className="pt-1.5 text-[10.5px] leading-relaxed"
         style={{ color: 'var(--testo-attenuato)' }}>
        Il controllo «somma di carichi e reazioni nulla» fallisce per la stessa
        ragione, ed è la conferma della diagnosi, non un errore del programma.
      </p>
      <div className="pt-2">
        <Bottone onClick={() => impostaModalita('analisi')}
                 titolo="Mostra il meccanismo e i centri di rotazione">
          vedi il meccanismo
        </Bottone>
      </div>
    </div>
  );
}

function Tabella({ componenti }: { componenti: ComponenteReazione[] }) {
  const nome = usaNomePunto();
  const righe = componenti.filter((c) => Math.abs(c.valore) > 1e-9 || c.esterno);

  const testo = () => {
    const capi = ['vincolo', 'tipo', 'componente', 'modulo', 'unita', 'dir_x', 'dir_y'];
    const corpo = righe.map((c) => [
      nome(c.nodoId), c.tipo, NOME_COMPONENTE[c.componente],
      (Math.abs(c.valore) / 1e3).toFixed(4),
      c.componente === 'rotazione' ? 'kNm' : 'kN',
      c.direzione ? (c.direzione.dx * Math.sign(c.valore || 1)).toFixed(6) : '',
      c.direzione ? (c.direzione.dy * Math.sign(c.valore || 1)).toFixed(6) : '',
    ].join('\t'));
    return [capi.join('\t'), ...corpo].join('\n');
  };

  const copia = () => {
    void navigator.clipboard?.writeText(testo());
    useStore.getState().messaggia('tabella delle reazioni copiata');
  };

  const esporta = () => {
    const csv = testo().split('\n').map((r) => r.split('\t').join(';')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'reazioni.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="border-b pb-2 pt-1" style={{ borderColor: 'var(--bordo)' }}>
      <div className="flex items-center justify-between px-3 pb-1">
        <span className="text-[10px] font-semibold uppercase tracking-wider"
              style={{ color: 'var(--testo-debole)' }}>
          Reazioni ({righe.length})
        </span>
        <div className="flex gap-1">
          <Bottone onClick={copia} titolo="Copia negli appunti, separata da tabulazioni">copia</Bottone>
          <Bottone onClick={esporta} titolo="Scarica un file CSV">csv</Bottone>
        </div>
      </div>
      {righe.length === 0 && (
        <p className="px-3 text-[11px]" style={{ color: 'var(--testo-attenuato)' }}>
          Nessuna reazione: la struttura non è vincolata.
        </p>
      )}
      <table className="numerico w-full text-[10.5px]">
        <tbody>
          {righe.map((c) => (
            <tr key={`${c.nodoId}-${c.indice}`}>
              <td className="px-3 py-[2px]" style={{ color: 'var(--testo-attenuato)' }}>
                {nome(c.nodoId)}
              </td>
              <td className="py-[2px]" style={{ color: 'var(--testo-debole)' }}>
                {NOME_COMPONENTE[c.componente]}
              </td>
              <td className="px-2 py-[2px] text-right" style={{ color: 'var(--reazione)' }}>
                {(Math.abs(c.valore) / 1e3).toFixed(2)}
              </td>
              <td className="pr-3 py-[2px]" style={{ color: 'var(--testo-debole)' }}>
                {c.componente === 'rotazione' ? 'kNm' : 'kN'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="px-3 pt-1 text-[10px] leading-relaxed"
         style={{ color: 'var(--testo-debole)' }}>
        I moduli sono positivi: il verso è quello disegnato dalla freccia.
      </p>
    </div>
  );
}

function Sconnessioni() {
  const statico = useStore((s) => s.statico)!;
  const nome = usaNomePunto();
  const esplosa = useStore((s) => s.sconnessioneEsplosa);
  const esplodi = useStore((s) => s.esplodiSconnessione);

  return (
    <div className="border-b px-3 py-2" style={{ borderColor: 'var(--bordo)' }}>
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider"
           style={{ color: 'var(--testo-debole)' }}>
        Sconnessioni interne
      </div>
      <p className="pb-1.5 text-[10px] leading-relaxed" style={{ color: 'var(--testo-debole)' }}>
        Non compaiono fra le reazioni esterne. Aprine una per vedere le due
        forze che i tronchi si scambiano.
      </p>
      <div className="flex flex-wrap gap-1">
        {statico.equilibrio.sconnessioni.map((s) => (
          <Bottone
            key={s.nodoId}
            attivo={esplosa === s.nodoId}
            onClick={() => esplodi(esplosa === s.nodoId ? null : s.nodoId)}
            titolo={`F = ${(Math.hypot(s.fx, s.fy) / 1e3).toFixed(2)} kN, M = 0`}
          >
            {nome(s.nodoId)}
          </Bottone>
        ))}
      </div>
      {esplosa && (() => {
        const s = statico.equilibrio.sconnessioni.find((x) => x.nodoId === esplosa);
        if (!s) return null;
        return (
          <div className="numerico grid grid-cols-2 gap-x-3 pt-2 text-[10.5px]"
               style={{ color: 'var(--testo-attenuato)' }}>
            <span>modulo</span><span>{(Math.hypot(s.fx, s.fy) / 1e3).toFixed(3)} kN</span>
            <span>componente x</span><span>{(s.fx / 1e3).toFixed(3)} kN</span>
            <span>componente y</span><span>{(s.fy / 1e3).toFixed(3)} kN</span>
            <span>momento</span><span>{(s.mz / 1e3).toFixed(6)} kNm</span>
          </div>
        );
      })()}
    </div>
  );
}

function Istruzioni() {
  return (
    <div className="px-3 py-2 text-[10.5px] leading-relaxed"
         style={{ color: 'var(--testo-debole)' }}>
      Clicca un punto qualunque di un'asta per vedere il <b>corpo libero</b> del
      tronco che compete a quella sezione, con tutte le forze considerate e i
      valori di N, T ed M.
    </div>
  );
}

/** Inclinazione dell'asta del modello di calcolo, per il disegno del concio. */
function usaAngoloAsta(): (astaId: string) => number {
  const statico = useStore((s) => s.statico);
  return (astaId: string) => {
    if (!statico) return 0;
    const a = statico.modello.calcolo.aste.find(
      (x) => (x.id as unknown as string) === astaId);
    if (!a) return 0;
    const ni = statico.modello.calcolo.nodi.find((n) => n.id === a.nodoIniziale);
    const nj = statico.modello.calcolo.nodi.find((n) => n.id === a.nodoFinale);
    if (!ni || !nj) return 0;
    return Math.atan2(nj.y - ni.y, nj.x - ni.x);
  };
}

function CorpoLibero() {
  const tronco = useStore((s) => s.tronco);
  const scelto = useStore((s) => s.troncoScelto)!;
  const alterna = useStore((s) => s.alternaLatoTronco);
  const chiudi = useStore((s) => s.scegliTronco);
  const angoloAsta = usaAngoloAsta();
  if (!tronco) return null;

  return (
    <div className="border-b px-3 py-2" style={{ borderColor: 'var(--bordo)' }}>
      <div className="flex items-center justify-between pb-1">
        <span className="text-[10px] font-semibold uppercase tracking-wider"
              style={{ color: 'var(--testo-debole)' }}>
          Corpo libero · {scelto.astaId} · s = {(scelto.s * 100).toFixed(0)} %
        </span>
        <div className="flex gap-1">
          <Bottone onClick={alterna} titolo="Taglia dall'altra parte: il risultato deve coincidere">
            {tronco.lato}
          </Bottone>
          <Bottone onClick={() => chiudi(null)}>×</Bottone>
        </div>
      </div>

      {!tronco.applicabile ? (
        <p className="text-[10.5px] leading-relaxed" style={{ color: 'var(--vincolo)' }}>
          {tronco.motivo}
        </p>
      ) : (
        <>
          <Azioni tronco={tronco} />
          <DisegnoConcio
            N={tronco.N} T={tronco.T} M={tronco.M}
            angolo={angoloAsta(tronco.astaId as unknown as string)}
          />
          <div className="pt-1.5 text-[10px] font-semibold uppercase tracking-wider"
               style={{ color: 'var(--testo-debole)' }}>
            Forze sul tronco ({tronco.termini.length})
          </div>
          <table className="numerico w-full text-[10px]">
            <tbody>
              {tronco.termini.map((t, i) => (
                <tr key={i}>
                  <td className="py-[1px] pr-1" style={{ color: 'var(--testo-attenuato)' }}>
                    {t.descrizione}
                  </td>
                  <td className="py-[1px] text-right" style={{ color: 'var(--testo)' }}>
                    {Math.hypot(t.fx, t.fy) > 1e-9
                      ? `${(Math.hypot(t.fx, t.fy) / 1e3).toFixed(2)} kN`
                      : `${(t.mz / 1e3).toFixed(2)} kNm`}
                  </td>
                  <td className="py-[1px] pl-2 text-right" style={{ color: 'var(--momento)' }}>
                    {(t.dM / 1e3).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="pt-1 text-[10px] leading-relaxed" style={{ color: 'var(--testo-debole)' }}>
            L'ultima colonna è il contributo di ciascuna forza al momento nella
            sezione: la loro somma è M.
          </p>
        </>
      )}
    </div>
  );
}

function Azioni({ tronco }: { tronco: Tronco }) {
  const voci: [string, number, string, string][] = [
    ['N', tronco.N, 'kN', 'var(--sforzo-normale)'],
    ['T', tronco.T, 'kN', 'var(--taglio)'],
    ['M', tronco.M, 'kNm', 'var(--momento)'],
  ];
  return (
    <div className="numerico flex gap-3 pt-1">
      {voci.map(([nome, v, u, colore]) => (
        <div key={nome} className="flex items-baseline gap-1">
          <span className="text-[10px]" style={{ color: 'var(--testo-debole)' }}>{nome}</span>
          <span className="text-[12px] font-semibold" style={{ color: colore }}>
            {(v / 1e3).toFixed(2)}
          </span>
          <span className="text-[9px]" style={{ color: 'var(--testo-debole)' }}>{u}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Le autoverifiche non sono un pannello di debug: sono la ragione per cui i
 * numeri sopra si possono usare. Un controllo che non ha esaminato nulla è
 * segnalato come tale, perché «superato» e «non eseguito» non sono la stessa
 * cosa.
 */
function Autoverifiche() {
  const statico = useStore((s) => s.statico)!;
  const v = statico.autoverifiche;
  return (
    <div className="px-3 pt-2">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider"
              style={{ color: 'var(--testo-debole)' }}>Autoverifiche</span>
        <span className="text-[10px]"
              style={{ color: v.tutteSuperate ? 'var(--carico)' : 'var(--vincolo)' }}>
          {v.verifiche.filter((x) => x.superata).length}/{v.verifiche.length}
        </span>
      </div>
      {v.verifiche.map((x) => (
        <div key={x.codice} className="flex items-start gap-1.5 py-[2px]">
          <span className="mt-[3px] h-2 w-2 shrink-0 rounded-full"
                style={{
                  background: !x.superata ? 'var(--vincolo)'
                    : x.esaminati === 0 ? 'var(--testo-debole)' : 'var(--carico)',
                }} />
          <div className="min-w-0">
            <div className="text-[10.5px]" style={{ color: 'var(--testo-attenuato)' }}>
              {x.descrizione}
            </div>
            <div className="numerico text-[9.5px]" style={{ color: 'var(--testo-debole)' }}>
              {x.dettaglio}
            </div>
          </div>
        </div>
      ))}
      <p className="pt-1.5 text-[10px] leading-relaxed" style={{ color: 'var(--testo-debole)' }}>
        Pallino grigio: il controllo non ha trovato nulla da esaminare in questo
        modello — non è un errore, ma non è nemmeno una conferma.
      </p>
    </div>
  );
}

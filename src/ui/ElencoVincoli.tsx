/**
 * §4.1 — TUTTI i vincoli del modello, in un elenco solo.
 *
 * Prima l'elenco mostrava soltanto ciò che era posato lungo le aste: i
 * vincoli sui nodi e le sconnessioni nodali non c'erano, e un vincolo che non
 * compare in nessuna lista è un vincolo che si può solo cancellare
 * ridisegnando. Qui ci sono tutte e quattro le famiglie, e il conto delle
 * righe coincide sempre con quello del modello — `verificaIntegrita` lo
 * controlla.
 *
 * L'elenco è anche il posto dove si corregge la PARTIZIONE di una
 * sconnessione nodale (§3.2): quali aste restano saldate fra loro e quali
 * sono imperniate. Correggerla qui evita di dover cancellare e rifare.
 */

import { useStore } from '../state/store.js';
import { Bottone, CampoNumero, Riga } from './Pannelli.js';
import {
  eliminaSconnessioneNodale, eliminaSuAsta, impostaGruppiSconnessione,
  impostaVincolo, spostaSuAsta,
} from '../state/commands.js';
import { asteNelNodo } from '../core/model/deduzione.js';
import { contaVincoli } from '../core/model/integrita.js';
import { etichette } from '../state/etichette.js';
import { gruppiSconnessione } from '../core/model/partizione.js';
import { nomeVincolo } from '../render/simboli.js';
import { orientamentoVincolo } from '../core/model/orientamento.js';
import { CATALOGO_VINCOLI } from '../core/model/catalogoVincoli.js';
import type { ElementId, NodeId } from '../core/model/types.js';

const gradiDi = (tipo: string): string =>
  CATALOGO_VINCOLI.find((v) => v.icona.genere === 'telaio' && v.icona.tipo === tipo)?.gdv
  ?? '—';

export function ElencoVincoli() {
  const progetto = useStore((s) => s.progetto);
  const eti = etichette(progetto);
  const suAstaSel = useStore((s) => s.suAstaSelezionato);
  const nodaleSel = useStore((s) => s.sconnessioneNodaleSelezionata);
  const selezione = useStore((s) => s.selezione);
  const esegui = useStore((s) => s.esegui);

  const suAsta = progetto.vincoliSuAsta ?? [];
  const sconnessioni = progetto.sconnessioni ?? [];
  const interni = progetto.vincoliInterni ?? [];
  const suNodo = progetto.nodi.filter((n) => n.vincolo);
  // il totale viene dal MODELLO, non contando le righe: è così che le due
  // cose non possono divergere
  const totale = contaVincoli(progetto).totale;

  if (totale === 0) return null;

  const evidenzia = (nodo: NodeId | null) =>
    useStore.getState().impostaEvidenziato(nodo ? { tipo: 'nodo', id: nodo as unknown as string } : null);

  return (
    <div className="mt-3 border-t pt-2" style={{ borderColor: 'var(--bordo)' }}>
      <div className="px-3 pb-1 text-[length:var(--t-minuto)] font-semibold uppercase tracking-wider"
           style={{ color: 'var(--testo-debole)' }}>
        Vincoli inseriti ({totale})
      </div>

      <div className="px-3">
        {/* ── sui nodi ── */}
        {suNodo.map((n) => {
          const scelto = selezione.nodi.has(n.id) && selezione.nodi.size === 1;
          return (
            <Riga2
              key={`n:${n.id as unknown as string}`}
              scelto={scelto}
              onEntra={() => evidenzia(n.id)}
              onEsci={() => evidenzia(null)}
              onClic={() => useStore.getState().seleziona({ nodi: new Set([n.id]) })}
              nome={nomeVincolo(n.vincolo!.tipo, 'esterno')}
              dove={eti.nodo(n.id)}
              angolo={orientamentoVincolo(n.vincolo!.angolo).gradi}
              gdv={gradiDi(n.vincolo!.tipo)}
            />
          );
        })}

        {/* ── in campata ── */}
        {suAsta.map((v) => (
          <Riga2
            key={v.id}
            scelto={suAstaSel === v.id}
            onEntra={() => useStore.getState().evidenziaSuAsta(v.id)}
            onEsci={() => useStore.getState().evidenziaSuAsta(null)}
            onClic={() => useStore.getState().selezionaSuAsta(suAstaSel === v.id ? null : v.id)}
            nome={nomeVincolo(v.vincolo.tipo, 'esterno')}
            dove={`${eti.asta(v.astaId)} · ${(v.s * 100).toFixed(0)} %`}
            angolo={orientamentoVincolo(v.vincolo.angolo).gradi}
            gdv={gradiDi(v.vincolo.tipo)}
          />
        ))}

        {/* ── sconnessioni in campata ── */}
        {sconnessioni.map((c) => (
          <Riga2
            key={c.id}
            scelto={suAstaSel === c.id}
            onEntra={() => useStore.getState().evidenziaSuAsta(c.id)}
            onEsci={() => useStore.getState().evidenziaSuAsta(null)}
            onClic={() => useStore.getState().selezionaSuAsta(suAstaSel === c.id ? null : c.id)}
            nome={nomeVincolo(c.tipo, 'interno')}
            dove={`${eti.asta(c.astaId)} · ${(c.s * 100).toFixed(0)} %`}
            angolo={null}
            gdv="2"
          />
        ))}

        {/* ── sconnessioni nodali ── */}
        {interni.map((v) => {
          const convergenti = asteNelNodo(progetto, v.nodoId);
          const gruppi = gruppiSconnessione(v, convergenti);
          const nodo = progetto.nodi.find((n) => n.id === v.nodoId);
          return (
            <div key={v.id}>
              <Riga2
                scelto={nodaleSel === v.id}
                onEntra={() => evidenzia(v.nodoId)}
                onEsci={() => evidenzia(null)}
                onClic={() => useStore.getState().selezionaSconnessioneNodale(
                  nodaleSel === v.id ? null : v.id)}
                nome={nomeVincolo(v.tipo, 'interno')}
                dove={eti.nodo(v.nodoId)}
                angolo={null}
                gdv={`${2 * Math.max(0, gruppi.length - 1)}`}
              />
              {nodaleSel === v.id && convergenti.length >= 3 && (
                <Gruppi id={v.id} gruppi={gruppi} />
              )}
            </div>
          );
        })}
      </div>

      <Dettaglio />
    </div>
  );
}

/**
 * §3.2 — le aste convergenti, raggruppate.
 *
 * Ogni asta ha un bottone che dice a quale gruppo appartiene; cliccandolo
 * passa al successivo, e l'ultimo passo crea un gruppo nuovo. Il conteggio
 * sotto si aggiorna mentre si guarda, così la scelta si fa vedendone l'esito
 * invece di doverlo prevedere.
 */
function Gruppi({ id, gruppi }: { id: string; gruppi: ElementId[][] }) {
  const esegui = useStore((s) => s.esegui);
  const eti = etichette(useStore((s) => s.progetto));

  const indiceDi = (asta: ElementId) =>
    gruppi.findIndex((g) => g.includes(asta));

  const sposta = (asta: ElementId) => {
    const da = indiceDi(asta);
    // il gruppo successivo, oppure uno nuovo se era già nell'ultimo
    const a = (da + 1) % (gruppi.length + 1);
    const nuovi = gruppi
      .map((g, i) => (i === a ? [...g, asta] : g.filter((x) => x !== asta)))
      .filter((g) => g.length > 0);
    if (a >= gruppi.length) nuovi.push([asta]);
    if (nuovi.length === 0) return;
    esegui(impostaGruppiSconnessione(id, nuovi));
  };

  return (
    <div className="mb-1 ml-2 rounded-[var(--raggio-controllo)] border px-2 py-2"
         style={{ borderColor: 'var(--bordo)' }}>
      <div className="pb-1 text-[length:var(--t-minuto)]" style={{ color: 'var(--testo-debole)' }}>
        aste saldate fra loro nello stesso gruppo · clic per spostarle
      </div>
      {gruppi.map((g, i) => (
        <div key={i} className="flex flex-wrap items-baseline gap-1 py-[2px]">
          <span className="numerico w-14 shrink-0 text-[length:var(--t-minuto)]"
                style={{ color: 'var(--testo-debole)' }}>gruppo {i + 1}</span>
          {g.map((a) => (
            <button
              key={a as unknown as string}
              type="button"
              onClick={() => sposta(a)}
              title="Spostala nel gruppo successivo"
              className="numerico rounded-[var(--raggio-controllo)] border px-2 text-[length:var(--t-minuto)]"
              style={{
                borderColor: 'var(--bordo)',
                background: 'var(--sfondo-elevato)',
                color: 'var(--testo-attenuato)',
              }}
            >{eti.asta(a)}</button>
          ))}
        </div>
      ))}
      <div className="pt-1 text-[length:var(--t-minuto)]" style={{ color: 'var(--testo-debole)' }}>
        {gruppi.length} {gruppi.length === 1 ? 'gruppo' : 'gruppi'} ·{' '}
        {2 * Math.max(0, gruppi.length - 1)} gradi di vincolo
      </div>
    </div>
  );
}

/** Ascissa e cancellazione dell'elemento selezionato. */
function Dettaglio() {
  const progetto = useStore((s) => s.progetto);
  const suAstaSel = useStore((s) => s.suAstaSelezionato);
  const nodaleSel = useStore((s) => s.sconnessioneNodaleSelezionata);
  const esegui = useStore((s) => s.esegui);

  const corrente = [...(progetto.vincoliSuAsta ?? []), ...(progetto.sconnessioni ?? [])]
    .find((x) => x.id === suAstaSel);

  if (corrente) {
    return (
      <div className="px-3 pt-1">
        <Riga etichetta="Ascissa">
          <CampoNumero
            valore={Number((corrente.s * 100).toFixed(2))}
            passo={5}
            suffisso="%"
            onChange={(v) => esegui(spostaSuAsta(corrente.id, v / 100))}
          />
        </Riga>
        <Bottone larghezzaPiena onClick={() => {
          esegui(eliminaSuAsta(corrente.id));
          useStore.getState().selezionaSuAsta(null);
        }}>elimina {corrente.id}</Bottone>
      </div>
    );
  }

  if (nodaleSel) {
    return (
      <div className="px-3 pt-1">
        <Bottone larghezzaPiena onClick={() => {
          esegui(eliminaSconnessioneNodale(nodaleSel));
          useStore.getState().selezionaSconnessioneNodale(null);
        }}>elimina {nodaleSel}</Bottone>
      </div>
    );
  }
  return null;
}

function Riga2({ nome, dove, angolo, gdv, scelto, onEntra, onEsci, onClic }: {
  nome: string; dove: string; angolo: number | null; gdv: string;
  scelto: boolean;
  onEntra: () => void; onEsci: () => void; onClic: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClic}
      onMouseEnter={onEntra}
      onMouseLeave={onEsci}
      className="riga-elenco flex w-full items-baseline gap-2  text-left text-[length:var(--t-minuto)]"
      style={{ color: scelto ? 'var(--accento)' : 'var(--testo-attenuato)' }}
    >
      <span className="min-w-0 flex-1 truncate">{nome}</span>
      <span className="numerico shrink-0" style={{ color: 'var(--testo-debole)' }}>{dove}</span>
      {angolo !== null && (
        <span className="numerico w-9 shrink-0 text-right"
              style={{ color: 'var(--testo-debole)' }}>{angolo}°</span>
      )}
      <span className="numerico w-8 shrink-0 text-right"
            style={{ color: 'var(--testo-debole)' }}>{gdv}</span>
    </button>
  );
}

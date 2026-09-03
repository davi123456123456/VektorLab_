/**
 * COEFFICIENTE DI SICUREZZA NEL PUNTO PIÙ SOLLECITATO.
 *
 * Il numero da solo non serve a niente: quello che serve è il procedimento,
 * scritto come lo si scriverebbe a mano, con i valori già sostituiti. Chi
 * legge deve poter rifare il conto sul foglio e ritrovare le stesse cifre —
 * e se non le ritrova, deve poter vedere a quale riga si sono separate.
 *
 * Quando manca un dato non si inventa un valore plausibile: si dice quale
 * dato manca e dove metterlo. Il resto dei risultati — reazioni, N/T/M,
 * deformata — non dipende da S_y e resta perfettamente valido.
 */

import { useMemo } from 'react';
import { useStore } from '../state/store.js';
import { coefficienteCritico, type EsitoCoefficiente, type SezioneCritica }
  from '../core/checks/coefficiente.js';
import { Bottone, Riga, Selettore } from './Pannelli.js';
import { etichette } from '../state/etichette.js';
import type { RisultatoAnalisi } from '../core/model/results.js';

export function BloccoCoefficiente({ r }: { r: RisultatoAnalisi }) {
  const progetto = useStore((s) => s.progetto);
  const modoTaglio = useStore((s) => s.modoTaglio);
  const opzioni = useStore((s) => s.impostaOpzioniRisultati);
  const selezionaStore = useStore((s) => s.seleziona);
  const seleziona = (ids: string[]) =>
    selezionaStore({ aste: ids as never });

  const nomeAsta = etichette(progetto).asta;
  const c = useMemo(
    () => coefficienteCritico(progetto, r, {
      modoTaglio,
      materialiExtra: progetto.materialiPersonalizzati,
      sezioniExtra: progetto.sezioniPersonalizzate,
    }),
    [progetto, r, modoTaglio],
  );

  if (!c.massimaTensione && c.errori.length === 0) return null;

  return (
    <div>
      {c.errori.map((e) => (
        <ErroreDato key={e.codice} codice={e.codice} messaggio={e.messaggio}
                    aste={e.aste} onSeleziona={seleziona} />
      ))}

      {c.massimaTensione && (
        <>
          <Sezioni c={c} onSeleziona={seleziona} />

          <div className="px-3 pb-1 pt-2">
            <Riga etichetta="τ">
              <Selettore
                valore={modoTaglio}
                opzioni={[
                  { valore: 'media', etichetta: 'T/A — media' },
                  { valore: 'massima', etichetta: 'T·S/(I·b) — massima' },
                ]}
                onChange={(v) => opzioni({ modoTaglio: v as typeof modoTaglio })}
              />
            </Riga>
          </div>

          <ol className="space-y-1.5 px-3 pb-2">
            {c.passi.map((p) => (
              <li key={p.numero} className="text-[10px]">
                <div className="flex gap-1.5">
                  <span className="numerico shrink-0"
                        style={{ color: 'var(--testo-debole)' }}>{p.numero}.</span>
                  <div className="min-w-0 flex-1">
                    <div className="mb-0.5 font-semibold"
                         style={{ color: 'var(--testo)' }}>{p.titolo}</div>
                    {p.righe.map((riga, i) => (
                      <div key={i} className="flex justify-between gap-2 leading-relaxed">
                        <span style={{ color: 'var(--testo-debole)' }}>{riga.formula}</span>
                        <span className="numerico shrink-0 text-right"
                              style={{ color: 'var(--testo)' }}>
                          {riga.formula === 'asta'
                            ? conEtichetta(riga.valore, nomeAsta)
                            : riga.valore}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </li>
            ))}
          </ol>

          <Esito c={c} />
          <Progetto c={c} />
        </>
      )}
    </div>
  );
}

/**
 * §1 — l'id interno non arriva sotto gli occhi dell'utente.
 *
 * Il passo 1 del procedimento nasce nel modulo di calcolo, che di etichette
 * non sa niente e non deve saperne: là un'asta è il suo id. La traduzione si
 * fa qui, dove si disegna, sostituendo il primo token della riga — che è
 * l'identificatore — con l'etichetta corrispondente.
 */
function conEtichetta(valore: string, nome: (id: never) => string): string {
  const spazio = valore.search(/[^A-Za-z0-9_-]/);
  if (spazio <= 0) return valore;
  const id = valore.slice(0, spazio);
  // il marcatore di lato (− oppure +) resta attaccato all'etichetta
  const grezzo = id.replace(/[−+]$/, '');
  const lato = id.slice(grezzo.length);
  return `${nome(grezzo as never)}${lato}${valore.slice(spazio)}`;
}

/** Le due sezioni candidate, e se coincidono. */
function Sezioni({ c, onSeleziona }: {
  c: EsitoCoefficiente; onSeleziona: (ids: string[]) => void;
}) {
  const m = c.massimoMomento;
  const t = c.massimaTensione!;
  return (
    <div className="space-y-1 px-3 pb-1 text-[10px]">
      {m && (
        <Candidata etichetta="massimo momento" s={m}
                   valore={`M = ${(m.M / 1e3).toFixed(2)} kNm`}
                   onClick={() => onSeleziona([m.astaId])} />
      )}
      <Candidata etichetta="massima tensione" s={t}
                 valore={`σ_VM = ${(c.sigmaIdeale / 1e6).toFixed(1)} MPa`}
                 onClick={() => onSeleziona([t.astaId])} />
      {!c.coincidono && (
        <p style={{ color: 'var(--attenzione)' }}>
          Le due sezioni non coincidono: governa quella a tensione massima.
        </p>
      )}
      {m?.salto && (
        <p style={{ color: 'var(--testo-debole)' }}>
          M discontinuo:{' '}
          <span className="numerico">{(m.salto.sinistra / 1e3).toFixed(2)}</span> /{' '}
          <span className="numerico">{(m.salto.destra / 1e3).toFixed(2)}</span> kNm
        </p>
      )}
    </div>
  );
}

function Candidata({ etichetta, s, valore, onClick }: {
  etichetta: string; s: SezioneCritica; valore: string; onClick: () => void;
}) {
  const nome = etichette(useStore((x) => x.progetto)).asta;
  return (
    <button type="button" onClick={onClick}
            className="flex w-full items-baseline justify-between gap-2 rounded px-1 py-0.5
                       text-left transition-colors hover:bg-[var(--sfondo-attivo)]">
      <span style={{ color: 'var(--testo-debole)' }}>
        {etichetta} — <span className="numerico">{nome(s.astaId as never)}{s.lato}</span>
        {' '}a <span className="numerico">{s.x.toFixed(3)}</span> m
      </span>
      <span className="numerico shrink-0" style={{ color: 'var(--testo)' }}>{valore}</span>
    </button>
  );
}

function Esito({ c }: { c: EsitoCoefficiente }) {
  if (!Number.isFinite(c.coefficiente)) return null;
  const ok = c.verificato;
  const colore = ok ? 'var(--ok)' : 'var(--errore)';
  return (
    <div className="mx-3 mb-2 rounded border px-2 py-1.5" style={{ borderColor: colore }}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10px] uppercase tracking-wider" style={{ color: colore }}>
          C.S.
        </span>
        <span className="numerico text-sm font-semibold" style={{ color: colore }}>
          {c.coefficiente.toFixed(2)}
        </span>
      </div>
      {c.fibraGovernante && (
        <p className="mt-0.5 text-[9.5px]" style={{ color: 'var(--testo-debole)' }}>
          fibra {c.fibraGovernante}
          {c.compressa && ' · asta compressa: verificare anche la stabilità'}
        </p>
      )}
    </div>
  );
}

/** Che cosa servirebbe perché C.S. = 1. */
function Progetto({ c }: { c: EsitoCoefficiente }) {
  if (!c.suggerimenti) return null;
  const s = c.suggerimenti;
  return (
    <div className="px-3 pb-2 text-[10px]" style={{ color: 'var(--testo-debole)' }}>
      <div className="mb-0.5 font-semibold" style={{ color: 'var(--testo)' }}>
        Per avere C.S. = 1
      </div>
      <div className="flex justify-between gap-2">
        <span>S_y minima, a sezione invariata</span>
        <span className="numerico" style={{ color: 'var(--testo)' }}>
          {(s.syMinimo / 1e6).toFixed(1)} MPa
        </span>
      </div>
      {s.dimensione && Number.isFinite(s.fattoreScala) && (
        <div className="flex justify-between gap-2">
          <span>{s.dimensione.nome} minimo, a materiale invariato</span>
          <span className="numerico" style={{ color: 'var(--testo)' }}>
            {s.fattoreScala > 1
              // la sezione non basta: si dice quanto dovrebbe crescere
              ? `${(s.dimensione.minima * 1e3).toFixed(1)} mm`
              // la sezione basta già, e allora il minimo è più PICCOLO di
              // quello attuale: dire «minimo 240 mm» quando 240 è la misura
              // in opera farebbe credere di essere al limite
              : `sotto ${(s.dimensione.attuale * 1e3).toFixed(1)} mm attuali`}
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * §9.5 — il dato manca, e si dice quale.
 *
 * Nessun valore inventato, nessun risultato bloccato: solo la riga che manca
 * e il bottone che porta dove si compila.
 */
function ErroreDato({ codice, messaggio, aste, onSeleziona }: {
  codice: string; messaggio: string; aste: string[];
  onSeleziona: (ids: string[]) => void;
}) {
  const vaiA = useStore((s) => s.impostaModalita);
  return (
    <div className="mx-3 mb-2 rounded border px-2 py-1.5 text-[10px]"
         style={{ borderColor: 'var(--errore)' }}>
      <div className="font-semibold" style={{ color: 'var(--errore)' }}>{messaggio}</div>
      <p className="mt-0.5" style={{ color: 'var(--testo-debole)' }}>
        {codice === 'SY_MANCANTE'
          ? 'Nessun valore inventato. Il resto dei risultati resta valido.'
          : 'Aste escluse dal calcolo delle tensioni.'}
      </p>
      {aste.length > 0 && (
        <button type="button" onClick={() => onSeleziona(aste)}
                className="numerico mt-1 underline underline-offset-2"
                style={{ color: 'var(--testo-debole)' }}>
          {aste.length === 1 ? `asta ${aste[0]}` : `${aste.length} aste: ${aste.join(', ')}`}
        </button>
      )}
      <div className="mt-1.5">
        <Bottone larghezzaPiena onClick={() => vaiA('materiali')}>
          Vai a Materiali →
        </Bottone>
      </div>
    </div>
  );
}

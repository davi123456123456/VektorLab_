/**
 * Modalità Materiali: sezioni, materiali e verifica di resistenza.
 *
 * Le tre cose stanno insieme perché rispondono alla stessa domanda — «questa
 * sezione, di questo materiale, regge?» — e separarle costringerebbe a saltare
 * fra pannelli per rispondere.
 */

import { useEffect, useRef, useState } from 'react';
import { useStore } from '../state/store.js';
import {
  aggiungiMateriale, aggiungiSezione, assegnaSpecifica, eliminaSezione,
  impostaMaterialePredefinito, impostaSezionePredefinita, modificaAste,
  modificaMateriale, modificaSezione, ripristinaPredefinita,
} from '../state/commands.js';
import { EditorSezione, parametriPredefiniti } from './EditorSezione.js';
import { Bottone, Pannello, Riga, Selettore } from './Pannelli.js';
import { MATERIALI } from '../core/materials/materials.js';
import { EditorMateriale, materialiDisponibili } from './EditorMateriale.js';
import { NOME_CRITERIO, type EsitoVerifica } from '../core/checks/index.js';
import { disegnaSezione } from '../render/sezioneDisegno.js';
import { ConfrontoMateriali } from './ConfrontoMateriali.js';
import { DettaglioFibre } from './DettaglioFibre.js';
import { proprietaDa } from '../core/materials/sezioniParametriche.js';
import type { Asta, ParametriSezione, Sezione } from '../core/index.js';

const MPa = (v: number) => (v / 1e6).toFixed(1);

export function PannelloSezioni() {
  const progetto = useStore((s) => s.progetto);
  const esegui = useStore((s) => s.esegui);
  const selezione = useStore((s) => s.selezione);
  const verifiche = useStore((s) => s.verifiche);
  const criterio = useStore((s) => s.criterioPreferito);
  const impostaCriterio = useStore((s) => s.impostaCriterio);
  const inModifica = useStore((s) => s.sezioneInModifica);
  const selezionaInModifica = useStore((s) => s.selezionaSezioneInModifica);
  const calcola = useStore((s) => s.calcolaRisultati);

  const sezioni = progetto.sezioniPersonalizzate;
  const sezioneCorrente = sezioni.find((s) => (s.id as string) === inModifica) ?? sezioni[0];
  const asteSelezionate = progetto.aste.filter((a) => selezione.aste.has(a.id));


  const nuovoId = () => {
    let n = 1;
    while (sezioni.some((s) => (s.id as string) === `sez${n}`)) n++;
    return `sez${n}`;
  };

  return (
    <Pannello titolo="Sezioni, materiali e verifica">
      <div className="space-y-2 py-2">

        {/* ───────────── materiale del modello ───────────── */}
        <MaterialeDelModello />

        {/* ───────────── sezioni del progetto ───────────── */}
        <Blocco titolo={`Sezioni (${sezioni.length})`}>
          <div className="space-y-0.5">
            {sezioni.map((s) => {
              const usata = progetto.aste.filter((a) => a.sezioneId === s.id).length;
              const attiva = (s.id as string) === (sezioneCorrente?.id as string);
              const predefinita = (progetto.sezionePredefinita as unknown as string)
                === (s.id as unknown as string);
              return (
                <button
                  key={s.id as string}
                  type="button"
                  onClick={() => selezionaInModifica(s.id as string)}
                  onMouseEnter={() => useStore.getState().evidenziaAste(
                    progetto.aste.filter((x) => x.sezioneId === s.id).map((x) => x.id))}
                  onMouseLeave={() => useStore.getState().evidenziaAste([])}
                  className="numerico flex w-full items-center gap-2 whitespace-nowrap px-3
                             py-[3px] text-left text-[11px] hover:brightness-125"
                  style={{
                    background: attiva ? 'var(--accento-scuro)' : 'transparent',
                    color: attiva ? '#fff' : 'var(--testo-attenuato)',
                  }}
                >
                  <span className="min-w-0 flex-1 truncate">
                    {s.nome}{predefinita ? ' — predefinita' : ''}
                  </span>
                  <span className="shrink-0 opacity-70">{usata} aste</span>
                </button>
              );
            })}
            {sezioni.length === 0 && (
              <p className="px-3 text-[11px]" style={{ color: 'var(--testo-debole)' }}>
                Nessuna sezione definita per misure. Creane una: senza le misure
                la verifica tensionale non è possibile.
              </p>
            )}
          </div>

          <p className="px-3 pt-1.5 text-[10px] leading-relaxed"
             style={{ color: 'var(--testo-debole)' }}>
            La sezione <b>predefinita</b> vale per tutte le aste. Con{' '}
            <b>+ sezione</b> se ne crea una assegnata soltanto alle aste
            selezionate, che da lì in poi non seguono più il predefinito.
          </p>

          <div className="flex flex-wrap gap-1 px-3 pt-2">
            {sezioneCorrente && (
              <Bottone
                attivo={(progetto.sezionePredefinita as unknown as string)
                  === (sezioneCorrente.id as unknown as string)}
                titolo="Assegna questa sezione a tutte le aste senza assegnazione specifica"
                onClick={() => esegui(
                  impostaSezionePredefinita(sezioneCorrente.id as unknown as string))}
              >
                rendi predefinita
              </Bottone>
            )}
            <Bottone
              titolo={asteSelezionate.length > 0
                ? `Nuova sezione, assegnata alle ${asteSelezionate.length} aste selezionate`
                : 'Nuova sezione: selezionane prima le aste per assegnargliela'}
              onClick={() => {
                const id = nuovoId();
                esegui(aggiungiSezione(parametriPredefiniti('rettangolarePiena'), id));
                if (asteSelezionate.length > 0) {
                  esegui(assegnaSpecifica(asteSelezionate.map((a) => a.id), { sezioneId: id }));
                }
                selezionaInModifica(id);
              }}
            >+ sezione</Bottone>
            {asteSelezionate.some((a) => a.sezioneSpecifica) && (
              <Bottone
                titolo="Le aste tornano a seguire la sezione predefinita del modello"
                onClick={() => esegui(ripristinaPredefinita(
                  asteSelezionate.map((a) => a.id), { sezione: true }))}
              >ripristina predefinita</Bottone>
            )}
            {sezioneCorrente && asteSelezionate.length > 0 && (
              <Bottone
                attivo
                onClick={() => esegui(assegnaSpecifica(
                  asteSelezionate.map((a) => a.id),
                  { sezioneId: sezioneCorrente.id as unknown as string },
                ))}
              >
                assegna a {asteSelezionate.length} aste
              </Bottone>
            )}
            {sezioneCorrente && (
              <BottoneElimina
                disabilitato={sezioni.length <= 1
                  || (progetto.sezionePredefinita as unknown as string)
                     === (sezioneCorrente.id as unknown as string)}
                motivo={sezioni.length <= 1
                  ? 'Il modello deve avere almeno una sezione'
                  : 'La sezione predefinita non si può eliminare: rendine predefinita un\'altra'}
                quante={progetto.aste.filter((a) => a.sezioneId === sezioneCorrente.id).length}
                onElimina={() => {
                  const ripiego = (progetto.sezionePredefinita as unknown as string)
                    ?? (sezioni.find((x) => x.id !== sezioneCorrente.id)!.id as unknown as string);
                  esegui(eliminaSezione(sezioneCorrente.id as string, ripiego));
                  selezionaInModifica(ripiego);
                }}
              />
            )}
          </div>
        </Blocco>

        {/* ───────────── editor della sezione ───────────── */}
        {sezioneCorrente?.parametri && (
          <Blocco titolo={`Misure — ${sezioneCorrente.nome}`}>
            <EditorSezione
              parametri={sezioneCorrente.parametri}
              onChange={(p: ParametriSezione) => {
                esegui(modificaSezione(sezioneCorrente.id as string, p));
              }}
            />
          </Blocco>
        )}

        {/* ───── materiale specifico per le aste selezionate ───── */}
        {asteSelezionate.length > 0 && (
          <Blocco titolo={`Materiale specifico — ${asteSelezionate.length} aste`}>
            <Riga etichetta="Materiale">
              <Selettore
                valore={asteSelezionate[0].materialeId as string}
                opzioni={materialiDisponibili(progetto.materialiPersonalizzati)}
                onChange={(v) => esegui(assegnaSpecifica(
                  asteSelezionate.map((a) => a.id), { materialeId: v },
                ))}
              />
            </Riga>
            {asteSelezionate.some((a) => a.materialeSpecifico) && (
              <div className="px-3 pt-1">
                <Bottone onClick={() => esegui(ripristinaPredefinita(
                  asteSelezionate.map((a) => a.id), { materiale: true }))}>
                  ripristina il materiale predefinito
                </Bottone>
              </div>
            )}
            <MaterialeInEvidenza asteSelezionate={asteSelezionate} />
          </Blocco>
        )}

        {/* ───────────── verifica ───────────── */}
        <Blocco titolo="Verifica di resistenza">
          <div className="flex gap-1 px-3 pb-2">
            <Bottone attivo={criterio === 'vonMises'}
                     onClick={() => impostaCriterio('vonMises')}>von Mises</Bottone>
            <Bottone attivo={criterio === 'tresca'}
                     onClick={() => impostaCriterio('tresca')}>Tresca</Bottone>
            <Bottone onClick={() => void calcola()}>ricalcola</Bottone>
          </div>
          {!verifiche && (
            <p className="px-3 text-[11px]" style={{ color: 'var(--testo-debole)' }}>
              Serve prima un'analisi. Premi «ricalcola».
            </p>
          )}
          {verifiche && <RisultatoVerifiche v={verifiche} sezioni={sezioni} />}
        </Blocco>

        <Blocco titolo="Confronto fra materiali">
          <ConfrontoMateriali />
        </Blocco>
      </div>
    </Pannello>
  );
}

function Blocco({ titolo, children }: { titolo: string; children: React.ReactNode }) {
  return (
    <div className="border-t pt-2" style={{ borderColor: 'var(--bordo)' }}>
      <div className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider"
           style={{ color: 'var(--testo-debole)' }}>{titolo}</div>
      {children}
    </div>
  );
}

function RisultatoVerifiche({ v, sezioni }: {
  v: NonNullable<ReturnType<typeof useStore.getState>['verifiche']>;
  sezioni: Sezione[];
}) {
  const selezione = useStore((s) => s.selezione);
  const progetto = useStore((s) => s.progetto);
  const [apertaId, setApertaId] = useState<string | null>(null);

  // l'asta selezionata sul canvas ha la precedenza su quella aperta a mano
  const idSelezionata = [...selezione.aste][0] as string | undefined;
  const dettaglioId = idSelezionata ?? apertaId ?? v.peggiore?.astaId ?? null;
  const dettaglio = v.perAsta.find((x) => x.astaId === dettaglioId) ?? v.peggiore;

  return (
    <div className="space-y-2">
      <div className="mx-3 rounded border px-2 py-1.5 text-[10px]"
           style={{ borderColor: v.tutteVerificate ? 'var(--ok)' : 'var(--errore)' }}>
        <span style={{ color: v.tutteVerificate ? 'var(--ok)' : 'var(--errore)' }}>
          {v.tutteVerificate
            ? `tutte le ${v.perAsta.length} aste verificano`
            : `${v.perAsta.filter((x) => !x.verificato).length} aste NON verificano`}
        </span>
        {v.peggiore && (
          <div className="numerico mt-0.5" style={{ color: 'var(--testo-debole)' }}>
            peggiore: {v.peggiore.astaId} — sfruttamento{' '}
            {(v.peggiore.sfruttamento * 100).toFixed(1)} %
          </div>
        )}
        {v.instabilita.size > 0 && (
          <div className="mt-0.5"
               style={{ color: v.tutteStabili ? 'var(--ok)' : 'var(--errore)' }}>
            {v.tutteStabili
              ? `${v.instabilita.size} aste compresse, tutte stabili`
              : `INSTABILITÀ: ${[...v.instabilita.values()].filter((x) => !x.verificato).length} ` +
                `aste sbandano pur potendo passare la resistenza`}
          </div>
        )}
        {!v.tutteInEsercizio && (
          <div className="mt-0.5" style={{ color: 'var(--avviso)' }}>
            alcune aste superano il limite di freccia
          </div>
        )}
      </div>

      {v.nonVerificabili.length > 0 && (
        <div className="mx-3 rounded border px-2 py-1 text-[10px]"
             style={{ borderColor: 'var(--avviso)', color: 'var(--avviso)' }}>
          {v.nonVerificabili.length} aste non verificabili: {v.nonVerificabili[0].motivo}
        </div>
      )}

      <div className="px-3">
        <table className="numerico w-full text-[10px]">
          <thead>
            <tr style={{ color: 'var(--testo-debole)' }}>
              <th className="text-left font-normal">asta</th>
              <th className="text-right font-normal">σid MPa</th>
              <th className="text-right font-normal">γ</th>
              <th className="text-right font-normal">sfrutt.</th>
            </tr>
          </thead>
          <tbody>
            {v.perAsta.map((x) => {
              const attiva = x.astaId === dettaglioId;
              return (
                <tr key={x.astaId}
                    onClick={() => setApertaId(x.astaId)}
                    className="cursor-pointer"
                    style={{
                      background: attiva ? 'var(--accento-scuro)' : 'transparent',
                      color: attiva ? '#fff'
                        : x.verificato ? 'var(--testo-attenuato)' : 'var(--errore)',
                    }}>
                  <td className="py-0.5">{x.astaId}</td>
                  <td className="py-0.5 text-right">{MPa(x.sigmaIdeale)}</td>
                  <td className="py-0.5 text-right">
                    {Number.isFinite(x.coefficienteSicurezza)
                      ? x.coefficienteSicurezza.toFixed(2) : '∞'}
                  </td>
                  <td className="py-0.5 text-right">
                    {(x.sfruttamento * 100).toFixed(0)} %
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {dettaglio && <Dettaglio v={dettaglio} progetto={progetto} sezioni={sezioni} />}
    </div>
  );
}

/** Dettaglio completo dell'asta: numeri, formule collegate e disegno della sezione. */
function Dettaglio({ v, progetto, sezioni }: {
  v: EsitoVerifica; progetto: ReturnType<typeof useStore.getState>['progetto'];
  sezioni: Sezione[];
}) {
  const asta = progetto.aste.find((a) => (a.id as string) === v.astaId);
  const sezione = sezioni.find((s) => s.id === asta?.sezioneId);
  const c = v.critico;

  return (
    <div className="mt-1 border-t pt-2" style={{ borderColor: 'var(--bordo)' }}>
      <div className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider"
           style={{ color: 'var(--testo-debole)' }}>
        Dettaglio — asta {v.astaId}
      </div>

      <div className="px-3 pb-1 text-[10px] leading-relaxed"
           style={{ color: 'var(--testo-debole)' }}>
        Sezione verificata: quella con <b>|M| massimo</b>, a x = {v.sezione.x.toFixed(3)} m.
      </div>

      <table className="numerico w-full px-3 text-[10px]">
        <tbody style={{ color: 'var(--testo-attenuato)' }}>
          <Voce n="N" v={`${(v.sezione.N / 1e3).toFixed(2)} kN`} />
          <Voce n="T" v={`${(v.sezione.T / 1e3).toFixed(2)} kN`} />
          <Voce n="M" v={`${(v.sezione.M / 1e3).toFixed(2)} kNm`} />
          <Voce n="" v="" separatore />
          <Voce n="y critico" v={`${(c.y * 1000).toFixed(1)} mm dal baricentro`} />
          <Voce n="σ" v={`${MPa(c.sigma)} MPa`} />
          <Voce n="τ" v={`${MPa(c.tau)} MPa`} />
          <Voce n="σ₁" v={`${MPa(c.sigma1)} MPa`} />
          <Voce n="σ₂" v={`${MPa(c.sigma2)} MPa`} />
          <Voce n="τ max" v={`${MPa(c.tauMax)} MPa`} />
          <Voce n="θp" v={`${((c.thetaP * 180) / Math.PI).toFixed(1)}°`} />
          <Voce n="" v="" separatore />
          <Voce n="von Mises" v={`${MPa(v.vonMisesMax)} MPa`} evidenzia />
          <Voce n="Tresca" v={`${MPa(v.trescaMax)} MPa`} />
          <Voce n="" v="" separatore />
          <Voce n="criterio" v={NOME_CRITERIO[v.criterio]} />
          <Voce n="resistenza" v={`${MPa(v.resistenza)} MPa`} />
          <Voce n="γ_M" v={v.gammaM.toFixed(2)} />
          <Voce n="di progetto" v={`${MPa(v.resistenzaProgetto)} MPa`} />
        </tbody>
      </table>

      <div className="mx-3 mt-2 rounded border px-2 py-1.5"
           style={{ borderColor: v.verificato ? 'var(--ok)' : 'var(--errore)' }}>
        <div className="numerico flex justify-between text-[11px]">
          <span style={{ color: 'var(--testo-attenuato)' }}>coefficiente di sicurezza</span>
          <span className="font-semibold"
                style={{ color: v.verificato ? 'var(--ok)' : 'var(--errore)' }}>
            {Number.isFinite(v.coefficienteSicurezza)
              ? v.coefficienteSicurezza.toFixed(2) : '∞'}
          </span>
        </div>
        {/*
          L'etichetta lunga mandava a capo il valore, e «68.0» finiva su una
          riga e «%» su quella dopo. Un numero separato dalla sua unità non è
          più un numero: si accorcia l'etichetta e si impedisce al valore di
          spezzarsi.
        */}
        <div className="numerico flex justify-between gap-2 text-[10px]"
             style={{ color: 'var(--testo-debole)' }}>
          <span title="rapporto fra tensione ideale e resistenza di progetto">
            sfruttamento
          </span>
          <span className="shrink-0 whitespace-nowrap">
            {(v.sfruttamento * 100).toFixed(1)} %
          </span>
        </div>
      </div>

      {v.avvisoSezione && (
        <div className="mx-3 mt-2 rounded border px-2 py-1 text-[10px] leading-relaxed"
             style={{ borderColor: 'var(--avviso)', color: 'var(--avviso)' }}>
          {v.avvisoSezione}
        </div>
      )}
      {v.note.map((n, i) => (
        <p key={i} className="px-3 pt-1.5 text-[10px] leading-relaxed"
           style={{ color: 'var(--testo-debole)' }}>{n}</p>
      ))}

      {sezione?.parametri && (
        <div className="mt-2 px-2">
          <DisegnoSezione v={v} parametri={sezione.parametri} />
        </div>
      )}

      {sezione?.parametri && asta && (
        <div className="mt-2 border-t pt-2" style={{ borderColor: 'var(--bordo)' }}>
          <div className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider"
               style={{ color: 'var(--testo-debole)' }}>
            Che cosa succede alle fibre
          </div>
          <FibreDellAsta v={v} sezione={sezione} materialeId={asta.materialeId as string} />
        </div>
      )}

      <AltreVerifiche astaId={v.astaId} />
    </div>
  );
}

/**
 * Instabilità e deformabilità. Stanno accanto alla resistenza perché sono
 * verifiche INDIPENDENTI: un'asta può passare la resistenza e sbandare, e
 * quello è l'errore che si fa più spesso.
 */
function AltreVerifiche({ astaId }: { astaId: string }) {
  const verifiche = useStore((s) => s.verifiche);
  const inst = verifiche?.instabilita.get(astaId);
  const eser = verifiche?.esercizio.get(astaId);

  return (
    <>
      <div className="mt-2 border-t pt-2" style={{ borderColor: 'var(--bordo)' }}>
        <div className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider"
             style={{ color: 'var(--testo-debole)' }}>Instabilità</div>
        {!inst && (
          <p className="px-3 text-[10px]" style={{ color: 'var(--testo-debole)' }}>
            L'asta non è compressa: la verifica non si applica.
          </p>
        )}
        {inst && (
          <>
            <table className="numerico w-full text-[10px]">
              <tbody style={{ color: 'var(--testo-attenuato)' }}>
                <Voce n="N compressione" v={`${(inst.NEd / 1e3).toFixed(1)} kN`} />
                <Voce n="L₀ = β·L" v={`${inst.L0.toFixed(3)} m  (β ${inst.beta})`} />
                <Voce n="snellezza λ" v={inst.lambda.toFixed(0)} />
                <Voce n="λ̄" v={inst.lambdaBarra.toFixed(3)} />
                <Voce n="N critico" v={`${(inst.Ncr / 1e3).toFixed(1)} kN`} />
                <Voce n={`curva ${inst.curva}  χ`} v={inst.chi.toFixed(3)} />
                <Voce n="N b,Rd" v={`${(inst.NbRd / 1e3).toFixed(1)} kN`} />
              </tbody>
            </table>
            <div className="mx-3 mt-1 rounded border px-2 py-1 text-[10px]"
                 style={{ borderColor: inst.verificato ? 'var(--ok)' : 'var(--errore)',
                          color: inst.verificato ? 'var(--ok)' : 'var(--errore)' }}>
              {inst.verificato ? 'stabile' : 'INSTABILE'} — sfruttamento{' '}
              {(inst.sfruttamento * 100).toFixed(1)} %
            </div>
            {inst.note.map((n, i) => (
              <p key={i} className="px-3 pt-1 text-[10px] leading-relaxed"
                 style={{ color: 'var(--testo-debole)' }}>{n}</p>
            ))}
          </>
        )}
      </div>

      {eser && (
        <div className="mt-2 border-t pt-2" style={{ borderColor: 'var(--bordo)' }}>
          <div className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider"
               style={{ color: 'var(--testo-debole)' }}>Deformabilità</div>
          <table className="numerico w-full text-[10px]">
            <tbody style={{ color: 'var(--testo-attenuato)' }}>
              <Voce n="freccia" v={`${(eser.frecciaMassima * 1000).toFixed(2)} mm`} />
              <Voce n="a x" v={`${eser.xFreccia.toFixed(3)} m`} />
              <Voce n="rapporto" v={Number.isFinite(eser.rapporto)
                ? `L/${eser.rapporto.toFixed(0)}` : 'L/∞'} />
              <Voce n="limite" v={`L/${eser.limite} = ${(eser.frecciaAmmessa * 1000).toFixed(2)} mm`} />
            </tbody>
          </table>
          <div className="mx-3 mt-1 rounded border px-2 py-1 text-[10px]"
               style={{ borderColor: eser.verificato ? 'var(--ok)' : 'var(--avviso)',
                        color: eser.verificato ? 'var(--ok)' : 'var(--avviso)' }}>
            {eser.verificato ? 'entro il limite' : 'FRECCIA ECCESSIVA'} — sfruttamento{' '}
            {(eser.sfruttamento * 100).toFixed(0)} %
          </div>
        </div>
      )}
    </>
  );
}

function Voce({ n, v, evidenzia, separatore }: {
  n: string; v: string; evidenzia?: boolean; separatore?: boolean;
}) {
  if (separatore) {
    return <tr><td colSpan={2} className="py-1"><div className="border-t"
      style={{ borderColor: 'var(--bordo)' }} /></td></tr>;
  }
  return (
    <tr>
      <td className="py-0.5 pl-3">{n}</td>
      <td className="py-0.5 pr-3 text-right"
          style={evidenzia ? { color: 'var(--momento)', fontWeight: 600 } : undefined}>
        {v}
      </td>
    </tr>
  );
}

function DisegnoSezione({ v, parametri }: {
  v: EsitoVerifica; parametri: ParametriSezione;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const W = 264, H = 210;
    const dpr = window.devicePixelRatio || 1;
    c.width = W * dpr; c.height = H * dpr;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const st = getComputedStyle(document.documentElement);
    const col = (n: string, f: string) => st.getPropertyValue(n).trim() || f;
    disegnaSezione(ctx, {
      parametri,
      distribuzione: v.distribuzione,
      larghezza: W, altezza: H,
      colori: {
        sfondo: col('--sfondo', '#14171c'),
        contorno: col('--asta', '#c8d0dc'),
        riempimento: col('--sfondo-elevato', '#232830'),
        sigma: col('--sforzo-normale', '#4a9eff'),
        tau: col('--taglio', '#35c46a'),
        ideale: col('--momento', '#ff8a3d'),
        critico: col('--reazione', '#ffd23f'),
        testo: col('--testo-attenuato', '#9aa3b2'),
        griglia: col('--bordo-chiaro', '#3d4552'),
        // le stesse tinte delle fibre: teso e compresso devono avere lo
        // stesso colore ovunque compaiano, o il confronto fra le due figure
        // costa più di quanto valga
        trazione: col('--errore', '#ff5f56'),
        compressione: col('--sforzo-normale', '#4a9eff'),
      },
    });
  }, [v, parametri]);
  return (
    <>
      <canvas ref={canvas} style={{ width: 264, height: 210 }} />
      <p className="px-1 text-[10px] leading-relaxed" style={{ color: 'var(--testo-debole)' }}>
        Sezione, andamento di σ e di τ sull'altezza. La linea gialla marca la
        quota in cui la tensione ideale è massima.
      </p>
    </>
  );
}


/**
 * Mostra e permette di modificare il materiale in uso. Se è di libreria si
 * vede in sola lettura con la possibilità di duplicarlo; se è del progetto si
 * modifica direttamente — ed è lì che si inserisce lo snervamento di un
 * acciaio di cui non si conosce la designazione.
 */
function MaterialeInEvidenza({ asteSelezionate }: { asteSelezionate: Asta[] }) {
  const progetto = useStore((s) => s.progetto);
  const idMateriale = asteSelezionate[0]?.materialeId as string | undefined;
  const personalizzati = progetto.materialiPersonalizzati;

  const scelto = idMateriale
    ? personalizzati.find((m) => (m.id as string) === idMateriale)
      ?? MATERIALI.find((m) => (m.id as string) === idMateriale)
    : personalizzati[0];

  if (!scelto) {
    return (
      <p className="px-3 text-[11px] leading-relaxed" style={{ color: 'var(--testo-debole)' }}>
        Seleziona un'asta per vederne il materiale. Per un acciaio di cui
        conosci solo lo snervamento, scegli <b>Acciaio generico</b> e creane una
        copia modificabile.
      </p>
    );
  }

  const personalizzato = personalizzati.some((m) => m.id === scelto.id);
  return <EditorMateriale materiale={scelto} personalizzato={personalizzato} />;
}


/** Ricava E·I ed E·A dell'asta e passa il tutto al disegno delle fibre. */
function FibreDellAsta({ v, sezione, materialeId }: {
  v: EsitoVerifica; sezione: Sezione; materialeId: string;
}) {
  const progetto = useStore((s) => s.progetto);
  const materiale = progetto.materialiPersonalizzati.find((m) => (m.id as string) === materialeId)
    ?? MATERIALI.find((m) => (m.id as string) === materialeId);
  if (!materiale || !sezione.parametri) return null;
  const q = proprietaDa(sezione.parametri);
  return (
    <DettaglioFibre
      v={v}
      EI={materiale.E * q.I}
      EA={materiale.E * q.A}
      altezza={q.H}
      ySup={q.ySup}
      yInf={q.yInf}
    />
  );
}


/**
 * Il materiale del modello, con il campo che manca sempre.
 *
 * `S_y` — la tensione di snervamento — è l'unico dato che il programma non può
 * inventare: E vale 210 GPa per qualunque acciaio da costruzione, la
 * resistenza no, e dipende da composizione e trattamento. Il campo resta
 * VUOTO finché non lo si dichiara, e la sua assenza blocca soltanto il
 * coefficiente di sicurezza: reazioni, N/T/M e deformata dipendono da E, A e
 * I e continuano a funzionare.
 */
function MaterialeDelModello() {
  const progetto = useStore((s) => s.progetto);
  const esegui = useStore((s) => s.esegui);
  const personalizzati = progetto.materialiPersonalizzati;
  const idCorrente = (progetto.materialePredefinito as unknown as string)
    ?? (progetto.aste[0]?.materialeId as unknown as string)
    ?? 'ACCIAIO_GENERICO';

  const suMisura = personalizzati.find((m) => (m.id as unknown as string) === idCorrente);
  const materiale = suMisura ?? MATERIALI.find(
    (m) => (m.id as unknown as string) === idCorrente) ?? MATERIALI[0];
  const fy = materiale.resistenze.fy;

  /** Scrivere S_y su un materiale di libreria significa crearne una copia. */
  const scriviSnervamento = (mpa: number | null) => {
    const valore = mpa === null || !Number.isFinite(mpa) || mpa <= 0 ? undefined : mpa * 1e6;
    if (suMisura) {
      esegui(modificaMateriale(suMisura.id as unknown as string, {
        resistenze: { ...suMisura.resistenze, ...(valore ? { fy: valore } : { fy: undefined }) },
      }));
      return;
    }
    const id = `${idCorrente}_sy`;
    esegui(aggiungiMateriale({
      ...materiale,
      id: id as never,
      nome: `${materiale.nome} · S_y dichiarato`,
      resistenze: { ...materiale.resistenze, ...(valore ? { fy: valore } : {}) },
    }));
    esegui(impostaMaterialePredefinito(id));
  };

  return (
    <Blocco titolo="Materiale del modello">
      <Riga etichetta="Materiale">
        <Selettore
          valore={idCorrente}
          opzioni={materialiDisponibili(personalizzati)}
          onChange={(v) => esegui(impostaMaterialePredefinito(v))}
        />
      </Riga>
      <p className="px-3 pt-0.5 text-[10px] leading-relaxed"
         style={{ color: 'var(--testo-debole)' }}>
        Vale per tutte le aste senza assegnazione specifica.
      </p>

      <div className="mx-3 mt-2 rounded border px-2 py-2"
           style={{
             borderColor: fy === undefined ? 'var(--vincolo)' : 'var(--bordo)',
           }}>
        <div className="text-[11px] font-semibold" style={{ color: 'var(--testo)' }}>
          Inserisci il coefficiente di snervamento S_y
        </div>
        <div className="flex items-center gap-2 pt-1.5">
          <input
            type="number"
            min={1}
            step={5}
            value={fy === undefined ? '' : Math.round(fy / 1e6)}
            placeholder="—"
            onChange={(e) => {
              const v = e.target.value.trim();
              scriviSnervamento(v === '' ? null : Number.parseFloat(v));
            }}
            className="numerico w-24 rounded border px-1.5 py-0.5 text-[12px] outline-none
                       focus:border-[var(--accento)]"
            style={{
              background: 'var(--sfondo)',
              borderColor: fy === undefined ? 'var(--vincolo)' : 'var(--bordo)',
              color: 'var(--testo)',
            }}
          />
          <span className="text-[11px]" style={{ color: 'var(--testo-attenuato)' }}>MPa</span>
        </div>
        <p className="pt-1 text-[10px] leading-relaxed"
           style={{ color: fy === undefined ? 'var(--vincolo)' : 'var(--testo-debole)' }}>
          {fy === undefined
            ? 'Senza S_y il coefficiente di sicurezza non è calcolabile. Tutto il '
              + 'resto — reazioni, N/T/M, deformata — non ne dipende e funziona.'
            : `Resistenza dichiarata: ${(fy / 1e6).toFixed(0)} MPa. `
              + 'Scegliendo un materiale di libreria il campo si precompila.'}
        </p>
      </div>

      <div className="numerico grid grid-cols-2 gap-x-3 px-3 pt-2 text-[10px]"
           style={{ color: 'var(--testo-debole)' }}>
        <span>E</span><span>{(materiale.E / 1e9).toFixed(0)} GPa</span>
        <span>ν</span><span>{materiale.nu.toFixed(2)}</span>
        <span>ρ</span><span>{materiale.rho.toFixed(0)} kg/m³</span>
        <span>α</span><span>{(materiale.alpha * 1e6).toFixed(1)}·10⁻⁶ 1/°C</span>
      </div>
    </Blocco>
  );
}

/**
 * Eliminazione: contorno rosso, e mai silenziosa.
 *
 * Le aste che usavano la voce tornano alla predefinita — non restano senza
 * sezione, che sarebbe un modello incalcolabile — e se la voce è in uso lo si
 * dice prima, con quante aste ne saranno toccate.
 */
function BottoneElimina({ disabilitato, motivo, quante, onElimina }: {
  disabilitato: boolean; motivo: string; quante: number; onElimina: () => void;
}) {
  const [conferma, setConferma] = useState(false);
  if (disabilitato) {
    return (
      <button
        type="button"
        disabled
        title={motivo}
        className="rounded border px-2 py-1 text-[11px] opacity-40"
        style={{ borderColor: 'var(--vincolo)', color: 'var(--vincolo)' }}
      >
        Elimina
      </button>
    );
  }
  if (conferma) {
    return (
      <div className="flex items-center gap-1">
        <span className="text-[10px]" style={{ color: 'var(--vincolo)' }}>
          {quante > 0
            ? `${quante} aste torneranno alla predefinita.`
            : 'Nessuna asta la usa.'}
        </span>
        <button
          type="button"
          onClick={() => { setConferma(false); onElimina(); }}
          className="rounded px-2 py-1 text-[11px]"
          style={{ background: 'var(--vincolo)', color: '#fff' }}
        >
          conferma
        </button>
        <Bottone onClick={() => setConferma(false)}>annulla</Bottone>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={() => (quante > 0 ? setConferma(true) : onElimina())}
      title="Elimina la voce; le aste che la usavano tornano alla predefinita"
      className="rounded border px-2 py-1 text-[11px] transition-colors
                 hover:bg-[var(--vincolo)] hover:text-white"
      style={{ borderColor: 'var(--vincolo)', color: 'var(--vincolo)', background: 'transparent' }}
    >
      Elimina
    </button>
  );
}

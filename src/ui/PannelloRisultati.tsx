/**
 * Sezione Risultati.
 *
 * Scritta togliendo. Il difetto di prima non era che mancasse qualcosa: era
 * che c'era troppo, e l'informazione che serviva stava sepolta fra paragrafi
 * che spiegavano il metodo, numeri ripetuti in tre posti e conferme del tipo
 * «calcolo completato con successo».
 *
 * Tre regole, e sono la stessa regola vista da tre lati:
 *
 *   · ogni numero compare UNA VOLTA SOLA, nel blocco che gli compete;
 *   · la convenzione di segno si dichiara in cima, non si ricorda a ogni
 *     blocco;
 *   · tabelle, non frasi — unità nell'intestazione di colonna, non in ogni
 *     cella.
 *
 * In cima resta una striscia che si legge in un colpo d'occhio; sotto, quattro
 * blocchi richiudibili, chiusi tranne il primo. Con tutto chiuso la sezione
 * sta in una schermata senza scorrimento, che è l'obiettivo concreto.
 */

import { useState } from 'react';
import { useStore } from '../state/store.js';
import { Bottone, Interruttore, Pannello, Riga, Selettore } from './Pannelli.js';
import { ETICHETTA_COMPONENTE, type Componente } from '../render/diagrammi.js';
import { fattoreAutomatico } from '../render/deformata.js';
import { BloccoCoefficiente } from './BloccoCoefficiente.js';
import { coefficienteCritico } from '../core/checks/coefficiente.js';
import { invertiTratteggiata } from '../state/commands.js';
import type { RisultatoAnalisi } from '../core/model/results.js';

/**
 * Cifre significative, non decimali fissi: 0.00123 e 123000 vanno scritti
 * entrambi con tre cifre che contano, e un numero di decimali fisso ne
 * darebbe zero al primo e sei di troppo al secondo.
 */
function sig(v: number, cifre: number): string {
  if (!Number.isFinite(v)) return '—';
  if (v === 0) return '0';
  const a = Math.abs(v);
  if (a >= 1e6 || a < 1e-4) return v.toExponential(Math.max(0, cifre - 1));
  const arrotondato = Number(v.toPrecision(cifre));
  return String(arrotondato);
}

export function PannelloRisultati() {
  const progetto = useStore((s) => s.progetto);
  const risultato = useStore((s) => s.risultato);
  const sorgente = useStore((s) => s.sorgenteRisultati);
  const impostaSorgente = useStore((s) => s.impostaSorgenteRisultati);
  const calcola = useStore((s) => s.calcolaRisultati);
  const inCorso = useStore((s) => s.calcoloInCorso);
  const errore = useStore((s) => s.erroreCalcolo);

  const opzioniSorgente = [
    ...progetto.casi.map((c) => ({ valore: `caso:${c.id}`, etichetta: `Caso — ${c.nome}` })),
    ...progetto.combinazioni.map((c) => ({
      valore: `comb:${c.id}`, etichetta: `Combinazione — ${c.nome}`,
    })),
  ];
  const valoreSorgente = `${sorgente.tipo === 'caso' ? 'caso' : 'comb'}:${sorgente.id}`;

  return (
    <Pannello titolo="Risultati">
      <div className="space-y-1.5 py-2">
        <Riga etichetta="Sorgente">
          <Selettore
            valore={valoreSorgente}
            opzioni={opzioniSorgente}
            onChange={(v) => {
              const [tipo, id] = v.split(':');
              impostaSorgente(tipo === 'caso'
                ? { tipo: 'caso', id: id as never }
                : { tipo: 'combinazione', id: id as never });
            }}
          />
        </Riga>

        <div className="px-3">
          <Bottone larghezzaPiena attivo={!risultato} onClick={() => void calcola()}>
            {inCorso ? 'calcolo in corso…' : risultato ? 'ricalcola' : 'calcola'}
          </Bottone>
        </div>

        {errore && (
          <div className="mx-3 rounded border px-2 py-1 text-[10px]"
               style={{ borderColor: 'var(--errore)', color: 'var(--errore)' }}>
            {errore}
          </div>
        )}

        {risultato && (
          <>
            <Sintesi r={risultato} />
            <Componenti />
            {/*
              §5 — eccezione dichiarata alla regola «tutti chiusi tranne il
              primo»: questi non sono dati da consultare, sono i comandi con
              cui si decide cosa guardare. Servono subito, e tenerli chiusi
              costava un clic prima di ogni lettura.
            */}
            <Blocco titolo="Vista" aperto>
              <ControlliVista r={risultato} />
            </Blocco>
            <Blocco titolo={`Reazioni vincolari (${risultato.reazioni.length})`} aperto>
              <TabellaReazioni r={risultato} />
            </Blocco>
            <Blocco titolo="Valori notevoli">
              <ValoriNotevoli r={risultato} />
            </Blocco>
            <Blocco titolo="Coefficiente di sicurezza">
              <BloccoCoefficiente r={risultato} />
            </Blocco>
            <Blocco titolo="Diagnostica">
              <Diagnostica r={risultato} />
            </Blocco>
          </>
        )}
      </div>
    </Pannello>
  );
}

/**
 * La striscia di sintesi: cinque numeri e una classificazione, leggibili
 * senza aprire niente. Sono gli unici valori che compaiono qui; nei blocchi
 * sotto non si ripetono.
 */
function Sintesi({ r }: { r: RisultatoAnalisi }) {
  const cifre = useStore((s) => s.cifreRisultati);
  const cinematica = useStore((s) => s.cinematica);
  const progetto = useStore((s) => s.progetto);

  let nMax = 0, tMax = 0, mMax = 0;
  for (const a of r.aste) {
    nMax = Math.max(nMax, Math.abs(a.estremi.Nmin), Math.abs(a.estremi.Nmax));
    tMax = Math.max(tMax, Math.abs(a.estremi.Tmin), Math.abs(a.estremi.Tmax));
    mMax = Math.max(mMax, Math.abs(a.estremi.Mmin), Math.abs(a.estremi.Mmax));
  }

  const cs = coefficienteCritico(progetto, r, {
    materialiExtra: progetto.materialiPersonalizzati,
    sezioniExtra: progetto.sezioniPersonalizzate,
  });

  const classe = cinematica === null ? null
    : cinematica.labilita > 0 ? { testo: 'LABILE', colore: 'var(--vincolo)' }
    : cinematica.iperstaticita > 0 ? { testo: 'IPERSTATICA', colore: 'var(--momento)' }
    : { testo: 'ISOSTATICA', colore: 'var(--carico)' };

  const celle: [string, string, string?][] = [
    ['|N|max', `${sig(nMax / 1e3, cifre)} kN`],
    ['|T|max', `${sig(tMax / 1e3, cifre)} kN`],
    ['|M|max', `${sig(mMax / 1e3, cifre)} kNm`],
    ['δmax', `${sig(r.spostamentoMassimo * 1e3, cifre)} mm`],
  ];
  if (Number.isFinite(cs.coefficiente)) {
    celle.push([
      'C.S.',
      `${sig(cs.coefficiente, cifre)} ${cs.verificato ? '✓' : '✗'}`,
      cs.verificato ? 'var(--ok)' : 'var(--errore)',
    ]);
  }

  return (
    <div className="mx-3 rounded border px-2 py-1.5"
         style={{ borderColor: 'var(--bordo)', background: 'var(--sfondo-elevato)' }}>
      {classe && (
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider"
             style={{ color: classe.colore }}>{classe.testo}</div>
      )}
      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
        {celle.map(([nome, valore, colore]) => (
          <div key={nome} className="flex items-baseline justify-between gap-2">
            <span className="text-[10px]" style={{ color: 'var(--testo-debole)' }}>{nome}</span>
            <span className="numerico text-[11px]"
                  style={{ color: colore ?? 'var(--testo)' }}>{valore}</span>
          </div>
        ))}
      </div>
      <p className="mt-1 text-[9.5px]" style={{ color: 'var(--testo-debole)' }}>
        N&gt;0 trazione · T&gt;0 fa ruotare il concio in senso orario ·
        M&gt;0 tende le fibre inferiori
      </p>
    </div>
  );
}

/** Le componenti da disegnare: una riga sola, sempre visibile. */
function Componenti() {
  const visibili = useStore((s) => s.diagrammiVisibili);
  const alterna = useStore((s) => s.alternaDiagramma);
  const mostraDeformata = useStore((s) => s.mostraDeformata);
  const mostraReazioni = useStore((s) => s.mostraReazioni);
  const opzioni = useStore((s) => s.impostaOpzioniRisultati);

  return (
    <div className="flex gap-1 px-3">
      {(['N', 'T', 'M'] as const).map((c) => (
        <Bottone key={c} attivo={visibili.has(c)} onClick={() => alterna(c)}
                 titolo={ETICHETTA_COMPONENTE[c as Componente]}>
          {c}
        </Bottone>
      ))}
      <Bottone attivo={mostraDeformata} titolo="deformata"
               onClick={() => opzioni({ mostraDeformata: !mostraDeformata })}>D</Bottone>
      <Bottone attivo={mostraReazioni} titolo="reazioni vincolari"
               onClick={() => opzioni({ mostraReazioni: !mostraReazioni })}>R</Bottone>
    </div>
  );
}

function ControlliVista({ r }: { r: RisultatoAnalisi }) {
  const progetto = useStore((s) => s.progetto);
  const scala = useStore((s) => s.scalaDiagrammi);
  const impostaScala = useStore((s) => s.impostaScalaDiagrammi);
  const fattoreDeformata = useStore((s) => s.fattoreDeformata);
  const lambda = useStore((s) => s.lambdaDeformata);
  const mostraValori = useStore((s) => s.mostraValoriRisultati);
  const mostraModello = useStore((s) => s.mostraModelloNeiDiagrammi);
  const mostraTratteggiata = useStore((s) => s.mostraTratteggiata);
  const cifre = useStore((s) => s.cifreRisultati);
  const opzioni = useStore((s) => s.impostaOpzioniRisultati);
  const riproduci = useStore((s) => s.riproduciDeformata);
  const alternaRiproduzione = useStore((s) => s.alternaRiproduzione);

  const fattore = fattoreDeformata > 0 ? fattoreDeformata : fattoreAutomatico(progetto, r);

  return (
    <>
      <Riga etichetta={`Scala diagrammi ×${scala.toFixed(2)}`}>
        <input type="range" min={0.1} max={4} step={0.05} value={scala}
               onChange={(e) => impostaScala(Number.parseFloat(e.target.value))}
               className="w-full accent-[var(--accento)]" />
      </Riga>
      <Riga etichetta={`Deformata ×${fattore.toFixed(0)}`}>
        <input type="range" min={0} max={5} step={0.05}
               value={fattoreDeformata > 0 ? Math.log10(fattoreDeformata) : 0}
               onChange={(e) => opzioni({
                 fattoreDeformata: 10 ** Number.parseFloat(e.target.value),
               })}
               className="w-full accent-[var(--accento)]" />
      </Riga>
      <Riga etichetta={`Carico λ = ${lambda.toFixed(2)}`}>
        <input type="range" min={0} max={1} step={0.01} value={lambda}
               onChange={(e) => opzioni({ lambdaDeformata: Number.parseFloat(e.target.value) })}
               className="w-full accent-[var(--accento)]" />
      </Riga>
      <div className="px-3 pb-1">
        <Bottone larghezzaPiena attivo={riproduci} onClick={alternaRiproduzione}>
          {riproduci ? 'ferma' : '▶ applica il carico'}
        </Bottone>
      </div>
      <Interruttore attivo={mostraModello} etichetta="vincoli, carichi e reazioni"
                    onChange={(v) => opzioni({ mostraModelloNeiDiagrammi: v })} />
      <Interruttore attivo={mostraValori} etichetta="valori numerici sul disegno"
                    onChange={(v) => opzioni({ mostraValoriRisultati: v })} />
      <Interruttore attivo={mostraTratteggiata} etichetta="tratteggiata di riferimento"
                    onChange={(v) => opzioni({ mostraTratteggiata: v })} />
      <InvertiTratteggiata />
      <Riga etichetta="Cifre significative">
        <Selettore
          valore={String(cifre)}
          opzioni={[3, 4, 5, 6].map((n) => ({ valore: String(n), etichetta: String(n) }))}
          onChange={(v) => opzioni({ cifreRisultati: Number(v) })}
        />
      </Riga>
    </>
  );
}

/**
 * Le colonne hanno bisogno d'aria: senza spaziatura «6.46 70.4 −2.4 70.7 ∠85»
 * si legge come un numero unico, e la tabella smette di essere una tabella.
 */
function TabellaReazioni({ r }: { r: RisultatoAnalisi }) {
  const cifre = useStore((s) => s.cifreRisultati);
  const progetto = useStore((s) => s.progetto);
  if (r.reazioni.length === 0) return null;

  return (
    <table className="numerico w-full text-[10px]">
      <thead>
        <tr style={{ color: 'var(--testo-debole)' }}>
          <th className="pl-3 pr-2 text-left font-normal">vincolo</th>
          <th className="pr-2 text-left font-normal">nodo</th>
          <th className="pr-2 text-right font-normal">Rx kN</th>
          <th className="pr-2 text-right font-normal">Ry kN</th>
          <th className="pr-2 text-right font-normal">M kNm</th>
          <th className="pr-3 text-right font-normal">|R| ∠°</th>
        </tr>
      </thead>
      <tbody>
        {r.reazioni.map((x) => {
          const nodo = progetto.nodi.find((n) => n.id === x.nodoId);
          const modulo = Math.hypot(x.fx, x.fy);
          const angolo = modulo > 1e-9
            ? ((Math.atan2(x.fy, x.fx) * 180) / Math.PI + 360) % 360 : 0;
          return (
            <tr key={x.nodoId as string} style={{ color: 'var(--testo-attenuato)' }}>
              <td className="pl-3 pr-2">{nodo?.vincolo?.tipo ?? '—'}</td>
              <td className="pr-2 truncate">{x.nodoId as string}</td>
              <td className="py-0.5 pr-2 text-right">{sig(x.fx / 1e3, cifre)}</td>
              <td className="py-0.5 pr-2 text-right">{sig(x.fy / 1e3, cifre)}</td>
              <td className="py-0.5 pr-2 text-right">{sig(x.mz / 1e3, cifre)}</td>
              <td className="whitespace-nowrap pr-3 text-right">
                {sig(modulo / 1e3, cifre)} ∠{angolo.toFixed(0)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/**
 * Non l'intero campionamento: solo gli estremi e i punti singolari. Su
 * un'asta con cinquanta ascisse, le righe che dicono qualcosa sono quattro.
 */
function ValoriNotevoli({ r }: { r: RisultatoAnalisi }) {
  const cifre = useStore((s) => s.cifreRisultati);
  const selezione = useStore((s) => s.selezione);
  const aste = selezione.aste.size > 0
    ? r.aste.filter((a) => selezione.aste.has(a.astaId))
    : r.aste;
  if (aste.length === 0) return null;

  return (
    <div className="space-y-2">
      {aste.map((a) => (
        <div key={a.astaId as string}>
          <div className="numerico px-3 text-[10px]" style={{ color: 'var(--testo-debole)' }}>
            {a.astaId as string} · L = {sig(a.lunghezza, cifre)} m
          </div>
          <table className="numerico w-full text-[10px]">
            <thead>
              <tr style={{ color: 'var(--testo-debole)' }}>
                <th className="pl-3 text-left font-normal">x m</th>
                <th className="text-left font-normal">punto</th>
                <th className="text-right font-normal">N kN</th>
                <th className="text-right font-normal">T kN</th>
                <th className="pr-3 text-right font-normal">M kNm</th>
              </tr>
            </thead>
            <tbody>
              {a.puntiNotevoli.map((p, i) => (
                <tr key={i} style={{ color: 'var(--testo-attenuato)' }}>
                  <td className="pl-3">{sig(p.x, cifre)}</td>
                  <td>{p.tipo}</td>
                  <td className="py-0.5 text-right">{sig(p.N / 1e3, cifre)}</td>
                  <td className="py-0.5 text-right">{sig(p.T / 1e3, cifre)}</td>
                  <td className="pr-3 text-right">{sig(p.M / 1e3, cifre)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

/**
 * Le autoverifiche, una riga ciascuna. Il dettaglio si apre al clic: chi
 * guarda questa lista vuole sapere SE è andata bene, e solo dopo perché.
 */
function Diagnostica({ r }: { r: RisultatoAnalisi }) {
  const cifre = useStore((s) => s.cifreRisultati);
  const anomalie = useStore((s) => s.anomalieIntegrita);
  const eq = r.equilibrio;

  const righe: { nome: string; ok: boolean; dettaglio: string }[] = [
    {
      nome: 'equilibrio globale',
      ok: eq.soddisfatto,
      dettaglio: `ΣFx = ${sig(eq.sommaFx, cifre)} N · ΣFy = ${sig(eq.sommaFy, cifre)} N · `
        + `ΣMz = ${sig(eq.sommaMz, cifre)} Nm · residuo relativo `
        + `${sig(eq.residuoRelativo, cifre)}`,
    },
    {
      nome: 'matrice non singolare',
      ok: r.diagnostica.dofSingolari.length === 0,
      dettaglio: r.diagnostica.dofSingolari.length === 0
        ? `pivot minimo ${sig(r.diagnostica.pivotMinimo, cifre)}`
        : `${r.diagnostica.dofSingolari.length} gradi di libertà singolari: `
          + 'la struttura è labile in quelle direzioni',
    },
    {
      nome: 'integrità del modello',
      ok: anomalie.length === 0,
      dettaglio: anomalie.length === 0
        ? 'nessun riferimento pendente'
        : anomalie.map((a) => a.messaggio).join(' '),
    },
  ];

  return (
    <div className="px-3">
      {righe.map((x) => <RigaDiagnostica key={x.nome} {...x} />)}
      <div className="numerico pt-1 text-[9.5px]" style={{ color: 'var(--testo-debole)' }}>
        {r.diagnostica.numeroDofLiberi} / {r.diagnostica.numeroDof} gdl liberi ·
        {' '}{sig(r.diagnostica.tempoMs, cifre)} ms
      </div>
    </div>
  );
}

function RigaDiagnostica({ nome, ok, dettaglio }: {
  nome: string; ok: boolean; dettaglio: string;
}) {
  const [aperto, setAperto] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setAperto((v) => !v)}
        className="flex w-full items-baseline gap-2 py-[2px] text-left text-[10px]"
      >
        <span style={{ color: ok ? 'var(--ok)' : 'var(--errore)' }}>{ok ? '✓' : '✗'}</span>
        <span className="flex-1" style={{ color: 'var(--testo-attenuato)' }}>{nome}</span>
      </button>
      {aperto && (
        <p className="numerico pb-1 pl-4 text-[9.5px]" style={{ color: 'var(--testo-debole)' }}>
          {dettaglio}
        </p>
      )}
    </div>
  );
}

/**
 * §2.2 — il comando che ribalta la fibra di riferimento.
 *
 * Compare solo con delle aste selezionate, perché è su quelle che agisce.
 * Dice anche che cosa cambia: chi lo preme si aspetta che qualcosa si muova,
 * e ciò che si muove sono i segni — il disegno resta identico salvo la
 * posizione dei trattini.
 */
function InvertiTratteggiata() {
  const selezione = useStore((s) => s.selezione);
  const esegui = useStore((s) => s.esegui);
  const quante = selezione.aste.size;
  if (quante === 0) return null;
  return (
    <div className="px-3 py-0.5">
      <Bottone
        larghezzaPiena
        titolo="Sposta la tratteggiata dall'altro lato: T e M cambiano segno, N no"
        onClick={() => esegui(invertiTratteggiata([...selezione.aste]))}
      >
        inverti tratteggiata ({quante} {quante === 1 ? 'asta' : 'aste'})
      </Bottone>
    </div>
  );
}

/** Blocco richiudibile. Chiuso per default, tranne quello che apre la sezione. */
function Blocco({ titolo, aperto: apertoIniziale = false, children }: {
  titolo: string; aperto?: boolean; children: React.ReactNode;
}) {
  const [aperto, setAperto] = useState(apertoIniziale);
  return (
    <div className="border-t pt-1" style={{ borderColor: 'var(--bordo)' }}>
      <button
        type="button"
        onClick={() => setAperto((v) => !v)}
        className="flex w-full items-baseline justify-between px-3 py-1 text-left"
      >
        <span className="text-[10px] font-semibold uppercase tracking-wider"
              style={{ color: 'var(--testo-debole)' }}>{titolo}</span>
        <span className="numerico text-[10px]" style={{ color: 'var(--testo-debole)' }}>
          {aperto ? '−' : '+'}
        </span>
      </button>
      {aperto && <div className="pb-2">{children}</div>}
    </div>
  );
}

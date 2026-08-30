/**
 * Controlli e tabelle dei risultati.
 *
 * La verifica di EQUILIBRIO è in cima e non in fondo: se non torna, tutto il
 * resto è da buttare, e va saputo prima di leggere qualunque numero.
 */

import { useStore } from '../state/store.js';
import { Bottone, Interruttore, Pannello, Riga, Selettore } from './Pannelli.js';
import { ETICHETTA_COMPONENTE, UNITA_COMPONENTE, type Componente } from '../render/diagrammi.js';
import { fattoreAutomatico } from '../render/deformata.js';
import type { RisultatoAsta } from '../core/model/results.js';
import { BloccoCoefficiente } from './BloccoCoefficiente.js';

const kN = (v: number) => (v / 1e3).toFixed(2);
const mm = (v: number) => (v * 1e3).toFixed(3);

export function PannelloRisultati() {
  const progetto = useStore((s) => s.progetto);
  const risultato = useStore((s) => s.risultato);
  const sorgente = useStore((s) => s.sorgenteRisultati);
  const impostaSorgente = useStore((s) => s.impostaSorgenteRisultati);
  const calcola = useStore((s) => s.calcolaRisultati);
  const inCorso = useStore((s) => s.calcoloInCorso);
  const tempo = useStore((s) => s.tempoCalcolo);
  const errore = useStore((s) => s.erroreCalcolo);
  const visibili = useStore((s) => s.diagrammiVisibili);
  const alterna = useStore((s) => s.alternaDiagramma);
  const scala = useStore((s) => s.scalaDiagrammi);
  const impostaScala = useStore((s) => s.impostaScalaDiagrammi);
  const mostraDeformata = useStore((s) => s.mostraDeformata);
  const fattoreDeformata = useStore((s) => s.fattoreDeformata);
  const lambda = useStore((s) => s.lambdaDeformata);
  const mostraReazioni = useStore((s) => s.mostraReazioni);
  const mostraValori = useStore((s) => s.mostraValoriRisultati);
  const mostraModello = useStore((s) => s.mostraModelloNeiDiagrammi);
  const opzioni = useStore((s) => s.impostaOpzioniRisultati);
  const selezione = useStore((s) => s.selezione);
  const riproduci = useStore((s) => s.riproduciDeformata);
  const alternaRiproduzione = useStore((s) => s.alternaRiproduzione);

  const opzioniSorgente = [
    ...progetto.casi.map((c) => ({ valore: `caso:${c.id}`, etichetta: `Caso — ${c.nome}` })),
    ...progetto.combinazioni.map((c) => ({
      valore: `comb:${c.id}`, etichetta: `Combinazione — ${c.nome}`,
    })),
  ];
  const valoreSorgente = `${sorgente.tipo === 'caso' ? 'caso' : 'comb'}:${sorgente.id}`;

  const fattoreEffettivo = risultato
    ? (fattoreDeformata > 0 ? fattoreDeformata : fattoreAutomatico(progetto, risultato))
    : 1;

  return (
    <Pannello titolo="Risultati">
      <div className="space-y-2 py-2">
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

        {!risultato && !errore && (
          <p className="px-3 text-[11px] leading-relaxed" style={{ color: 'var(--testo-debole)' }}>
            Il calcolo gira in un worker separato: l'interfaccia resta reattiva
            anche su modelli grandi.
          </p>
        )}

        {risultato && (
          <>
            <VerificaEquilibrio r={risultato} tempo={tempo} />

            <Sezione titolo="Diagrammi">
              <div className="flex gap-1 px-3">
                {(['N', 'T', 'M'] as const).map((c) => (
                  <Bottone key={c} attivo={visibili.has(c)} onClick={() => alterna(c)}
                           titolo={ETICHETTA_COMPONENTE[c]}>
                    {c}
                  </Bottone>
                ))}
              </div>
              <Riga etichetta={`Scala ×${scala.toFixed(2)}`}>
                <input
                  type="range" min={0.1} max={4} step={0.05} value={scala}
                  onChange={(e) => impostaScala(Number.parseFloat(e.target.value))}
                  className="w-full accent-[var(--accento)]"
                />
              </Riga>
              <Interruttore
                attivo={mostraModello}
                etichetta="mostra vincoli, carichi e reazioni"
                onChange={(v) => opzioni({ mostraModelloNeiDiagrammi: v })} />
              <p className="px-3 text-[10px] leading-relaxed" style={{ color: 'var(--testo-debole)' }}>
                {progetto.impostazioni.momentoDallaParteDelleFibreTese
                  ? 'Il momento è riportato dalla parte delle fibre tese (convenzione italiana).'
                  : 'Il momento è riportato dal lato positivo dell\'asse locale y.'}
                {' '}Spegnendo il modello restano soltanto le curve: serve quando due
                componenti sovrapposte vanno confrontate senza rumore intorno.
              </p>
            </Sezione>

            <Sezione titolo="Deformata">
              <Interruttore attivo={mostraDeformata} etichetta="mostra deformata"
                            onChange={(v) => opzioni({ mostraDeformata: v })} />
              <Riga etichetta={`Amplificazione ×${fattoreEffettivo.toFixed(0)}`}>
                <input
                  type="range" min={0} max={5} step={0.05}
                  value={fattoreDeformata > 0 ? Math.log10(fattoreDeformata) : 0}
                  onChange={(e) => {
                    const v = Number.parseFloat(e.target.value);
                    opzioni({ fattoreDeformata: v === 0 ? 0 : Math.pow(10, v) });
                  }}
                  className="w-full accent-[var(--accento)]"
                />
              </Riga>
              <Riga etichetta={`Carico λ = ${lambda.toFixed(2)}`}>
                <input
                  type="range" min={0} max={1} step={0.01} value={lambda}
                  disabled={riproduci}
                  onChange={(e) => opzioni({ lambdaDeformata: Number.parseFloat(e.target.value) })}
                  className="w-full accent-[var(--accento)] disabled:opacity-40"
                />
              </Riga>
              <div className="px-3 pb-1">
                <Bottone larghezzaPiena attivo={riproduci} onClick={alternaRiproduzione}
                         titolo="Applica e rimuove ciclicamente i carichi">
                  {riproduci ? '⏸  ferma l\'applicazione del carico' : '▶  applica il carico'}
                </Bottone>
              </div>
              <p className="px-3 text-[10px] leading-relaxed" style={{ color: 'var(--testo-debole)' }}>
                Il parametro λ scala tutti i carichi insieme, da zero al valore
                pieno: si vede la struttura deformarsi <i>sotto quei carichi</i>
                invece di trovarla già deformata.
              </p>
              <p className="px-3 text-[10px] leading-relaxed" style={{ color: 'var(--testo-debole)' }}>
                La linea è l'elastica vera, ottenuta integrando due volte la
                curvatura χ = M/EI: non è un'interpolazione grafica.
              </p>
            </Sezione>

            <Sezione titolo="Altro">
              <Interruttore attivo={mostraReazioni} etichetta="reazioni vincolari"
                            onChange={(v) => opzioni({ mostraReazioni: v })} />
              <Interruttore attivo={mostraValori} etichetta="valori numerici sul disegno"
                            onChange={(v) => opzioni({ mostraValoriRisultati: v })} />
            </Sezione>

            <BloccoCoefficiente r={risultato} />
            <TabellaReazioni r={risultato} />
            <TabellaAste r={risultato} selezionate={selezione.aste} />
            <TabellaSpostamenti r={risultato} />
          </>
        )}
      </div>
    </Pannello>
  );
}

function Sezione({ titolo, children }: { titolo: string; children: React.ReactNode }) {
  return (
    <div className="border-t pt-2" style={{ borderColor: 'var(--bordo)' }}>
      <div className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider"
           style={{ color: 'var(--testo-debole)' }}>{titolo}</div>
      {children}
    </div>
  );
}

/**
 * La somma di carichi e reazioni deve annullarsi. È un controllo indipendente
 * dal solutore: se fallisce, il modello o i dati hanno un problema, e nessuno
 * dei numeri sotto è utilizzabile.
 */
function VerificaEquilibrio({ r, tempo }: {
  r: NonNullable<ReturnType<typeof useStore.getState>['risultato']>; tempo: number;
}) {
  const eq = r.equilibrio;
  const ok = eq.soddisfatto;
  return (
    <div className="mx-3 rounded border px-2 py-1.5 text-[10px]"
         style={{ borderColor: ok ? 'var(--ok)' : 'var(--errore)' }}>
      <div className="flex items-center justify-between">
        <span style={{ color: ok ? 'var(--ok)' : 'var(--errore)' }}>
          {ok ? 'equilibrio verificato' : 'EQUILIBRIO NON VERIFICATO'}
        </span>
        <span className="numerico" style={{ color: 'var(--testo-debole)' }}>
          {tempo.toFixed(1)} ms
        </span>
      </div>
      <div className="numerico mt-0.5" style={{ color: 'var(--testo-debole)' }}>
        ΣFx {kN(eq.sommaFx)} · ΣFy {kN(eq.sommaFy)} kN · residuo{' '}
        {eq.residuoRelativo.toExponential(1)}
      </div>
      {r.diagnostica.dofSingolari.length > 0 && (
        <div className="mt-1" style={{ color: 'var(--errore)' }}>
          {r.diagnostica.dofSingolari.length}{' '}
          {r.diagnostica.dofSingolari.length === 1 ? 'direzione labile' : 'direzioni labili'}:
          la soluzione non è unica.
        </div>
      )}
    </div>
  );
}

function TabellaReazioni({ r }: { r: NonNullable<ReturnType<typeof useStore.getState>['risultato']> }) {
  if (r.reazioni.length === 0) return null;
  return (
    <Sezione titolo={`Reazioni vincolari (${r.reazioni.length})`}>
      <div className="overflow-x-auto px-3">
        <table className="numerico w-full text-[10px]">
          <thead>
            <tr style={{ color: 'var(--testo-debole)' }}>
              <th className="text-left font-normal">nodo</th>
              <th className="text-right font-normal">Fx kN</th>
              <th className="text-right font-normal">Fy kN</th>
              <th className="text-right font-normal">Mz kNm</th>
            </tr>
          </thead>
          <tbody style={{ color: 'var(--testo-attenuato)' }}>
            {r.reazioni.map((x) => (
              <tr key={x.nodoId as string}>
                <td className="py-0.5">{x.nodoId}</td>
                <td className="py-0.5 text-right">{kN(x.fx)}</td>
                <td className="py-0.5 text-right">{kN(x.fy)}</td>
                <td className="py-0.5 text-right">{kN(x.mz)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Sezione>
  );
}

function TabellaAste({ r, selezionate }: {
  r: NonNullable<ReturnType<typeof useStore.getState>['risultato']>;
  selezionate: ReadonlySet<string>;
}) {
  const estremo = (min: number, max: number) => (Math.abs(min) > Math.abs(max) ? min : max);
  return (
    <Sezione titolo={`Sollecitazioni per asta (${r.aste.length})`}>
      <div className="overflow-x-auto px-3">
        <table className="numerico w-full text-[10px]">
          <thead>
            <tr style={{ color: 'var(--testo-debole)' }}>
              <th className="text-left font-normal">asta</th>
              <th className="text-right font-normal">N kN</th>
              <th className="text-right font-normal">T kN</th>
              <th className="text-right font-normal">M kNm</th>
            </tr>
          </thead>
          <tbody>
            {r.aste.map((a) => {
              const acceso = selezionate.has(a.astaId as string);
              return (
                <tr key={a.astaId as string}
                    style={{
                      background: acceso ? 'var(--accento-scuro)' : 'transparent',
                      color: acceso ? '#fff' : 'var(--testo-attenuato)',
                    }}>
                  <td className="py-0.5">{a.astaId}</td>
                  <td className="py-0.5 text-right">{kN(estremo(a.estremi.Nmin, a.estremi.Nmax))}</td>
                  <td className="py-0.5 text-right">{kN(estremo(a.estremi.Tmin, a.estremi.Tmax))}</td>
                  <td className="py-0.5 text-right">{kN(estremo(a.estremi.Mmin, a.estremi.Mmax))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {[...selezionate].length === 1 && (
        <PuntiNotevoli a={r.aste.find((x) => (x.astaId as string) === [...selezionate][0])} />
      )}
    </Sezione>
  );
}

/**
 * Punti notevoli dell'asta selezionata: estremi, zeri del taglio (dove il
 * momento è massimo) e discontinuità. Sono i valori che finiscono in una
 * relazione di calcolo, e sono esatti perché ricavati per bisezione, non
 * scegliendo il massimo del campionamento.
 */
function PuntiNotevoli({ a }: { a: RisultatoAsta | undefined }) {
  if (!a) return null;
  const nome: Record<string, string> = {
    estremo: 'estremo', M_max: 'M max', M_min: 'M min',
    T_zero: 'T = 0', discontinuita: 'salto',
  };
  return (
    <div className="mt-2 px-3">
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider"
           style={{ color: 'var(--testo-debole)' }}>
        Punti notevoli — {a.astaId}
      </div>
      <table className="numerico w-full text-[10px]">
        <thead>
          <tr style={{ color: 'var(--testo-debole)' }}>
            <th className="text-left font-normal">x m</th>
            <th className="text-left font-normal">tipo</th>
            <th className="text-right font-normal">N</th>
            <th className="text-right font-normal">T</th>
            <th className="text-right font-normal">M</th>
          </tr>
        </thead>
        <tbody style={{ color: 'var(--testo-attenuato)' }}>
          {a.puntiNotevoli.map((p, i) => (
            <tr key={i}>
              <td className="py-0.5">{p.x.toFixed(3)}</td>
              <td className="py-0.5">{nome[p.tipo] ?? p.tipo}</td>
              <td className="py-0.5 text-right">{kN(p.N)}</td>
              <td className="py-0.5 text-right">{kN(p.T)}</td>
              <td className="py-0.5 text-right">{kN(p.M)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TabellaSpostamenti({ r }: {
  r: NonNullable<ReturnType<typeof useStore.getState>['risultato']>;
}) {
  const progetto = useStore((s) => s.progetto);
  return (
    <Sezione titolo="Spostamenti nodali">
      <div className="px-3 pb-1 text-[10px]" style={{ color: 'var(--testo-debole)' }}>
        massimo {mm(r.spostamentoMassimo)} mm
      </div>
      <div className="max-h-48 overflow-auto px-3">
        <table className="numerico w-full text-[10px]">
          <thead>
            <tr style={{ color: 'var(--testo-debole)' }}>
              <th className="text-left font-normal">nodo</th>
              <th className="text-right font-normal">ux mm</th>
              <th className="text-right font-normal">uy mm</th>
              <th className="text-right font-normal">θz mrad</th>
            </tr>
          </thead>
          <tbody style={{ color: 'var(--testo-attenuato)' }}>
            {progetto.nodi.map((n, k) => (
              <tr key={n.id as string}>
                <td className="py-0.5">{n.etichetta ?? n.id}</td>
                <td className="py-0.5 text-right">{mm(r.spostamenti[3 * k])}</td>
                <td className="py-0.5 text-right">{mm(r.spostamenti[3 * k + 1])}</td>
                <td className="py-0.5 text-right">{mm(r.spostamenti[3 * k + 2])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Sezione>
  );
}

/**
 * Tavolozza dei carichi e gestione dei casi di carico.
 *
 * I casi sono in cima e non in fondo perché sono il CONTESTO di tutto il
 * resto: ogni carico che si applica finisce nel caso selezionato, e vedere
 * quale sia evita l'errore più comune — mettere il vento fra i permanenti.
 */

import { useStore } from '../state/store.js';
import { eliminaCaricoSelezionato } from '../state/azioni.js';
import { aggiungiCaso, eliminaCarichi, eliminaCaso, modificaCarico } from '../state/commands.js';
import { Bottone, CampoNumero, Interruttore, Pannello, Riga, Selettore } from './Pannelli.js';
import type { ElementId,
  Carico, LoadCaseId, ModoRiferimento, NaturaCarico, Progetto,
} from '../core/model/types.js';
import { MODI_RIFERIMENTO, risultanteDistribuito } from '../core/index.js';

const TIPI: { id: 'forza' | 'momento' | 'distribuito' | 'termico' | 'cedimento';
              nome: string; bersaglio: string }[] = [
  { id: 'forza', nome: 'Forza', bersaglio: 'nodo' },
  { id: 'momento', nome: 'Momento', bersaglio: 'nodo' },
  { id: 'distribuito', nome: 'Distribuito', bersaglio: 'asta' },
  { id: 'termico', nome: 'Termico', bersaglio: 'asta' },
  { id: 'cedimento', nome: 'Cedimento', bersaglio: 'nodo' },
];

const NATURE: { id: NaturaCarico; nome: string }[] = [
  { id: 'G1', nome: 'Permanenti strutturali' },
  { id: 'G2', nome: 'Permanenti non strutturali' },
  { id: 'Q', nome: 'Variabili' },
  { id: 'neve', nome: 'Neve' },
  { id: 'vento', nome: 'Vento' },
  { id: 'sisma', nome: 'Sisma' },
  { id: 'termico', nome: 'Termico' },
  { id: 'cedimenti', nome: 'Cedimenti' },
];

export function PannelloCarichi() {
  const progetto = useStore((s) => s.progetto);
  const casoCorrente = useStore((s) => s.casoCorrente);
  const impostaCasoCorrente = useStore((s) => s.impostaCasoCorrente);
  const caricoCorrente = useStore((s) => s.caricoCorrente);
  const impostaCaricoCorrente = useStore((s) => s.impostaCaricoCorrente);
  const valoreForza = useStore((s) => s.valoreForza);
  const direzioneForza = useStore((s) => s.direzioneForza);
  const impostaValori = useStore((s) => s.impostaValoriCarico);
  const esegui = useStore((s) => s.esegui);
  const caricoSelezionato = useStore((s) => s.caricoSelezionato);
  const selezionaCarico = useStore((s) => s.selezionaCarico);
  const evidenziaCarico = useStore((s) => s.evidenziaCarico);

  const delCaso = progetto.carichi.filter((c) => c.casoId === casoCorrente);
  const tipoScelto = TIPI.find((t) => t.id === caricoCorrente)!;

  return (
    <Pannello titolo="Carichi">
      <div className="py-2">
        {/* ── casi di carico ── */}
        <Riga etichetta="Caso">
          <Selettore
            valore={casoCorrente as string}
            opzioni={progetto.casi.map((c) => ({
              valore: c.id as string, etichetta: `${c.nome} · ${c.natura}`,
            }))}
            onChange={(v) => impostaCasoCorrente(v as LoadCaseId)}
          />
        </Riga>
        <div className="flex gap-1 px-3 pb-2 pt-1">
          <Bottone onClick={() => {
            const n = progetto.casi.length + 1;
            const id = `caso${n}`;
            esegui(aggiungiCaso(id, `Caso ${n}`, 'Q'));
            impostaCasoCorrente(id as LoadCaseId);
          }}>+ caso</Bottone>
          {progetto.casi.length > 1 && (
            <Bottone
              titolo="Elimina il caso e tutti i suoi carichi"
              onClick={() => {
                esegui(eliminaCaso(casoCorrente));
                const resto = progetto.casi.find((c) => c.id !== casoCorrente);
                if (resto) impostaCasoCorrente(resto.id);
              }}
            >− caso</Bottone>
          )}
          {delCaso.length > 0 && (
            <Bottone
              titolo="Svuota il caso corrente"
              onClick={() => esegui(eliminaCarichi(delCaso.map((c) => c.id)))}
            >svuota</Bottone>
          )}
        </div>

        {/* ── tipo di carico ── */}
        <div className="border-t px-3 pt-2" style={{ borderColor: 'var(--bordo)' }}>
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider"
               style={{ color: 'var(--testo-debole)' }}>Tipo</div>
          <div className="flex flex-wrap gap-1">
            {TIPI.map((t) => (
              <Bottone key={t.id} attivo={caricoCorrente === t.id}
                       titolo={`si applica a un ${t.bersaglio}`}
                       onClick={() => impostaCaricoCorrente(t.id)}>
                {t.nome}
              </Bottone>
            ))}
          </div>
          <p className="pt-1.5 text-[10px]" style={{ color: 'var(--testo-debole)' }}>
            Clicca su un <b>{tipoScelto.bersaglio}</b> per applicarlo.
          </p>
        </div>

        {/* ── valori ── */}
        <div className="mt-2 border-t pt-2" style={{ borderColor: 'var(--bordo)' }}>
          {caricoCorrente === 'forza' && (
            <>
              <Riga etichetta="Intensità">
                <CampoNumero valore={valoreForza / 1e3} passo={1} suffisso="kN"
                             onChange={(v) => impostaValori({ valoreForza: v * 1e3 })} />
              </Riga>
              <Riga etichetta="Direzione">
                <CampoNumero valore={(direzioneForza * 180) / Math.PI} passo={15} suffisso="°"
                             onChange={(v) => impostaValori({ direzioneForza: (v * Math.PI) / 180 })} />
              </Riga>
              <p className="px-3 text-[10px]" style={{ color: 'var(--testo-debole)' }}>
                −90° = verso il basso. Il verso segue gli assi globali (y in alto).
              </p>
            </>
          )}
          {caricoCorrente === 'momento' && <ValoriMomento />}
          {caricoCorrente === 'distribuito' && <ValoriDistribuito />}
          {caricoCorrente === 'termico' && (
            <p className="px-3 text-[10px] leading-relaxed" style={{ color: 'var(--testo-debole)' }}>
              Applica ΔT = +30 K uniforme. Modifica il valore nell'elenco qui sotto
              dopo averlo applicato.
            </p>
          )}
          {caricoCorrente === 'cedimento' && (
            <p className="px-3 text-[10px] leading-relaxed" style={{ color: 'var(--testo-debole)' }}>
              Applica un abbassamento di 10 mm. Ha effetto solo sui gradi di
              libertà effettivamente vincolati del nodo.
            </p>
          )}
        </div>

        {/* ── elenco dei carichi del caso ── */}
        <div className="mt-2 border-t pt-2" style={{ borderColor: 'var(--bordo)' }}>
          <div className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider"
               style={{ color: 'var(--testo-debole)' }}>
            Carichi del caso ({delCaso.length})
          </div>
          {delCaso.length === 0 && (
            <p className="px-3 pb-2 text-[11px]" style={{ color: 'var(--testo-debole)' }}>
              Nessun carico in questo caso.
            </p>
          )}
          {delCaso.map((c) => (
            <button
              key={c.id}
              type="button"
              onMouseEnter={() => evidenziaCarico(c.id)}
              onMouseLeave={() => evidenziaCarico(null)}
              onClick={() => selezionaCarico(caricoSelezionato === c.id ? null : c.id)}
              className="numerico flex w-full items-center gap-2 whitespace-nowrap px-3 py-[3px]
                         text-left text-[11px] hover:brightness-125"
              style={{
                background: caricoSelezionato === c.id ? 'var(--accento-scuro)' : 'transparent',
                color: caricoSelezionato === c.id ? '#fff' : 'var(--testo-attenuato)',
              }}
            >
              <span className="w-8 shrink-0">{c.id}</span>
              <span className="min-w-0 flex-1 truncate">{descrivi(c)}</span>
            </button>
          ))}
          {caricoSelezionato && (
            <div className="px-3 pt-2">
              <Bottone larghezzaPiena onClick={eliminaCaricoSelezionato}>
                elimina carico selezionato
              </Bottone>
            </div>
          )}
        </div>

        {caricoSelezionato && <Proprieta />}
      </div>
    </Pannello>
  );
}

function descrivi(c: Carico): string {
  const kN = (v: number) => (v / 1e3).toFixed(1);
  switch (c.tipo) {
    case 'forzaNodale':
      return `F ${kN(Math.hypot(c.fx, c.fy))} kN su ${c.nodoId}`;
    case 'momentoNodale':
      return `M ${kN(c.mz)} kNm su ${c.nodoId}`;
    case 'distribuito':
      return `q ${kN(Math.max(Math.abs(c.q1), Math.abs(c.q2)))} kN/m su ${c.astaId}`;
    case 'forzaInCampata':
      return `F ${kN(Math.hypot(c.fx, c.fy))} kN in campata di ${c.astaId}`;
    case 'momentoInCampata':
      return `M ${kN(c.mz)} kNm in campata di ${c.astaId}`;
    case 'termico':
      return `ΔT ${c.deltaTUniforme} K su ${c.astaId}`;
    case 'cedimento':
      return `δ ${(c.uy * 1000).toFixed(1)} mm su ${c.nodoId}`;
  }
}

// ═══════════════ tavolozza: valori dei nuovi carichi ═══════════════

/**
 * Il verso si sceglie come si vede, non come si scrive. Internamente il
 * momento positivo è antiorario; chiedere all'utente il SEGNO invece del VERSO
 * significa chiedergli di ricordare una convenzione per usare un programma che
 * dovrebbe insegnargliela.
 */
function ValoriMomento() {
  const valore = useStore((s) => s.valoreMomento);
  const verso = useStore((s) => s.versoMomento);
  const imposta = useStore((s) => s.impostaValoriCarico);
  return (
    <>
      <Riga etichetta="Momento">
        <CampoNumero valore={Math.abs(valore) / 1e3} passo={1} suffisso="kNm"
                     onChange={(v) => imposta({ valoreMomento: Math.abs(v) * 1e3 })} />
      </Riga>
      <Riga etichetta="Verso">
        <div className="flex gap-1">
          <Bottone attivo={verso === 'antiorario'}
                   titolo="Concorde con l'asse z uscente: segno interno positivo"
                   onClick={() => imposta({ versoMomento: 'antiorario' })}>
            ↺ antiorario
          </Bottone>
          <Bottone attivo={verso === 'orario'}
                   titolo="Segno interno negativo"
                   onClick={() => imposta({ versoMomento: 'orario' })}>
            ↻ orario
          </Bottone>
        </div>
      </Riga>
      <p className="px-3 text-[10px]" style={{ color: 'var(--testo-debole)' }}>
        Segno interno: {verso === 'orario' ? '−' : '+'}{(Math.abs(valore) / 1e3).toFixed(1)} kNm.
      </p>
    </>
  );
}

/** Descrizione a parole del verso, dato il modo e il segno dell'intensità. */
/**
 * Angolo assoluto perpendicolare a un'asta.
 *
 * §5 ha tolto il modo «locale ortogonale» perché legava il carico all'asta:
 * ruotandola, la direzione cambiava di nascosto. Questo comando fa lo stesso
 * conto UNA VOLTA e scrive un numero assoluto, che da quel momento non
 * dipende più da niente. La comodità resta, il legame no.
 */
function perpendicolareA(p: Progetto, astaId: ElementId | null): number | null {
  if (!astaId) return null;
  const a = p.aste.find((x) => x.id === astaId);
  if (!a) return null;
  const i = p.nodi.find((n) => n.id === a.nodoIniziale);
  const j = p.nodi.find((n) => n.id === a.nodoFinale);
  if (!i || !j) return null;
  return Math.atan2(j.y - i.y, j.x - i.x) + Math.PI / 2;
}

function versoDescritto(modo: ModoRiferimento, q: number, alpha: number): string {
  const positivo = q >= 0;
  switch (modo) {
    case 'globaleY': return positivo ? 'verso l\'alto' : 'verso il basso';
    case 'globaleX': return positivo ? 'verso destra' : 'verso sinistra';
    case 'localeOrtogonale':
      return positivo
        ? 'ortogonale all\'asta, verso il suo lato sinistro (percorrendola da i a j)'
        : 'ortogonale all\'asta, verso il suo lato destro';
    case 'localeAssiale':
      return positivo ? 'lungo l\'asta, da i verso j' : 'lungo l\'asta, da j verso i';
    case 'angolo': {
      const g = ((alpha * 180) / Math.PI).toFixed(0);
      return positivo ? `a ${g}° dall'asse x` : `a ${g}° dall'asse x, verso opposto`;
    }
  }
}

function ValoriDistribuito() {
  const q1 = useStore((s) => s.valoreDistribuito);
  const q2 = useStore((s) => s.valoreDistribuito2);
  const trapezoidale = useStore((s) => s.trapezoidale);
  const s0 = useStore((s) => s.sInizialeCarico);
  const s1 = useStore((s) => s.sFinaleCarico);
  const modo = useStore((s) => s.modoCarico);
  const alpha = useStore((s) => s.angoloCarico);
  const perProiezione = useStore((s) => s.perProiezione);
  const imposta = useStore((s) => s.impostaValoriCarico);
  const globale = modo === 'globaleX' || modo === 'globaleY' || modo === 'angolo';

  return (
    <>
      <div className="px-3 pb-1">
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider"
             style={{ color: 'var(--testo-debole)' }}>Riferimento</div>
        <div className="flex flex-wrap gap-1">
          {MODI_RIFERIMENTO.map((m) => (
            <Bottone key={m.modo} attivo={modo === m.modo} titolo={m.descrizione}
                     onClick={() => imposta({ modoCarico: m.modo })}>
              {m.nome}
            </Bottone>
          ))}
        </div>
      </div>

      {modo === 'angolo' && (
        <>
          <Riga etichetta="Angolo α">
            <CampoNumero valore={(alpha * 180) / Math.PI} passo={15} suffisso="°"
                         onChange={(v) => imposta({ angoloCarico: (v * Math.PI) / 180 })} />
          </Riga>
          <PerpendicolareAllAsta
            onCalcolato={(rad) => imposta({ angoloCarico: rad })} />
        </>
      )}

      <Riga etichetta={trapezoidale ? 'q iniziale' : 'Intensità'}>
        <CampoNumero valore={q1 / 1e3} passo={1} suffisso="kN/m"
                     onChange={(v) => imposta({ valoreDistribuito: v * 1e3 })} />
      </Riga>
      {trapezoidale && (
        <Riga etichetta="q finale">
          <CampoNumero valore={q2 / 1e3} passo={1} suffisso="kN/m"
                       onChange={(v) => imposta({ valoreDistribuito2: v * 1e3 })} />
        </Riga>
      )}
      <div className="flex items-center gap-1 px-3 py-0.5">
        <Bottone onClick={() => imposta({
          valoreDistribuito: -q1, valoreDistribuito2: -q2,
        })} titolo="Cambia segno a entrambe le intensità">inverti verso</Bottone>
        <span className="text-[10px]" style={{ color: 'var(--testo-debole)' }}>
          {versoDescritto(modo, q1, alpha)}
        </span>
      </div>

      <Interruttore attivo={trapezoidale} etichetta="trapezoidale (q₁ ≠ q₂)"
                    onChange={(v) => imposta({ trapezoidale: v })} />

      {globale && (
        <>
          <Interruttore
            attivo={perProiezione}
            etichetta="misurato in proiezione (neve)"
            onChange={(v) => imposta({ perProiezione: v })}
          />
          <p className="px-3 pb-1 text-[10px] leading-relaxed"
             style={{ color: 'var(--testo-debole)' }}>
            {perProiezione
              ? 'Risultante = q · L · |sin(asta, direzione)|: l\'intensità è per unità di proiezione, come la neve misurata in pianta.'
              : 'Risultante = q · L: l\'intensità è per unità di lunghezza dell\'asta, come il peso proprio.'}
          </p>
        </>
      )}

      <Riga etichetta="Tratto">
        <div className="flex items-center gap-1">
          <CampoNumero valore={s0} passo={0.05}
                       onChange={(v) => imposta({ sInizialeCarico: Math.min(Math.max(v, 0), s1) })} />
          <span className="text-[10px]" style={{ color: 'var(--testo-debole)' }}>→</span>
          <CampoNumero valore={s1} passo={0.05}
                       onChange={(v) => imposta({ sFinaleCarico: Math.max(Math.min(v, 1), s0) })} />
        </div>
      </Riga>
      <p className="px-3 pb-1 text-[10px]" style={{ color: 'var(--testo-debole)' }}>
        Ascisse relative: 0 → 1 copre tutta l'asta.
      </p>
    </>
  );
}

// ═══════════════ proprietà del carico selezionato ═══════════════

/**
 * Il pannello mostra la RISULTANTE calcolata e il suo punto di applicazione.
 * È il controllo più rapido che l'utente possa fare: se ha sbagliato modo di
 * riferimento o verso, il numero e la posizione lo dicono subito, senza
 * bisogno di lanciare un'analisi e interpretare un diagramma.
 */
function Proprieta() {
  const progetto = useStore((s) => s.progetto);
  const id = useStore((s) => s.caricoSelezionato);
  const esegui = useStore((s) => s.esegui);
  const carico = progetto.carichi.find((c) => c.id === id);
  if (!carico) return null;

  const modifica = (patch: Record<string, unknown>) =>
    esegui(modificaCarico(carico.id, patch as never));

  return (
    <div className="border-t pt-2" style={{ borderColor: 'var(--bordo)' }}>
      <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider"
           style={{ color: 'var(--testo-debole)' }}>
        Carico {carico.id as string}
      </div>

      {carico.tipo === 'momentoNodale' && (
        <>
          <Riga etichetta="Momento">
            <CampoNumero valore={Math.abs(carico.mz) / 1e3} passo={1} suffisso="kNm"
                         onChange={(v) => modifica({
                           mz: Math.sign(carico.mz || 1) * Math.abs(v) * 1e3,
                         })} />
          </Riga>
          <Riga etichetta="Verso">
            <div className="flex gap-1">
              <Bottone attivo={carico.mz >= 0}
                       onClick={() => modifica({ mz: Math.abs(carico.mz) })}>↺ antiorario</Bottone>
              <Bottone attivo={carico.mz < 0}
                       onClick={() => modifica({ mz: -Math.abs(carico.mz) })}>↻ orario</Bottone>
            </div>
          </Riga>
        </>
      )}

      {carico.tipo === 'forzaNodale' && (
        <>
          <Riga etichetta="Intensità">
            <CampoNumero valore={Math.hypot(carico.fx, carico.fy) / 1e3} passo={1} suffisso="kN"
                         onChange={(v) => {
                           const a = Math.atan2(carico.fy, carico.fx);
                           modifica({ fx: v * 1e3 * Math.cos(a), fy: v * 1e3 * Math.sin(a) });
                         }} />
          </Riga>
          <Riga etichetta="Direzione">
            <CampoNumero valore={(Math.atan2(carico.fy, carico.fx) * 180) / Math.PI}
                         passo={15} suffisso="°"
                         onChange={(v) => {
                           const m = Math.hypot(carico.fx, carico.fy);
                           const a = (v * Math.PI) / 180;
                           modifica({ fx: m * Math.cos(a), fy: m * Math.sin(a) });
                         }} />
          </Riga>
        </>
      )}

      {carico.tipo === 'distribuito' && (
        <ProprietaDistribuito carico={carico} progetto={progetto} modifica={modifica} />
      )}
    </div>
  );
}

function ProprietaDistribuito({ carico, progetto, modifica }: {
  carico: Extract<Carico, { tipo: 'distribuito' }>;
  progetto: Progetto;
  modifica: (patch: Record<string, unknown>) => void;
}) {
  const asta = progetto.aste.find((a) => a.id === carico.astaId);
  const ni = asta && progetto.nodi.find((n) => n.id === asta.nodoIniziale);
  const nj = asta && progetto.nodi.find((n) => n.id === asta.nodoFinale);
  const globale = carico.direzione.modo !== 'localeOrtogonale'
    && carico.direzione.modo !== 'localeAssiale';

  let risultante: ReturnType<typeof risultanteDistribuito> | null = null;
  if (ni && nj) {
    const dx = nj.x - ni.x, dy = nj.y - ni.y;
    const L = Math.hypot(dx, dy) || 1;
    risultante = risultanteDistribuito(
      carico.q1, carico.q2, carico.sIniziale, carico.sFinale, carico.direzione,
      { x1: ni.x, y1: ni.y, x2: nj.x, y2: nj.y, L, c: dx / L, s: dy / L },
    );
  }

  return (
    <>
      <div className="px-3 pb-1">
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider"
             style={{ color: 'var(--testo-debole)' }}>Riferimento</div>
        <div className="flex flex-wrap gap-1">
          {MODI_RIFERIMENTO.map((m) => (
            <Bottone key={m.modo} attivo={carico.direzione.modo === m.modo}
                     titolo={m.descrizione}
                     onClick={() => modifica({
                       direzione: { ...carico.direzione, modo: m.modo },
                     })}>
              {m.nome}
            </Bottone>
          ))}
        </div>
      </div>

      {carico.direzione.modo === 'angolo' && (
        <>
          <Riga etichetta="Angolo α">
            <CampoNumero valore={((carico.direzione.alpha ?? 0) * 180) / Math.PI}
                         passo={15} suffisso="°"
                         onChange={(v) => modifica({
                           direzione: { ...carico.direzione, alpha: (v * Math.PI) / 180 },
                         })} />
          </Riga>
          <PerpendicolareAllAsta
            astaId={carico.astaId}
            onCalcolato={(rad) => modifica({
              direzione: { ...carico.direzione, alpha: rad as never },
            })} />
        </>
      )}

      <Riga etichetta="q iniziale">
        <CampoNumero valore={carico.q1 / 1e3} passo={1} suffisso="kN/m"
                     onChange={(v) => modifica({ q1: v * 1e3 })} />
      </Riga>
      <Riga etichetta="q finale">
        <CampoNumero valore={carico.q2 / 1e3} passo={1} suffisso="kN/m"
                     onChange={(v) => modifica({ q2: v * 1e3 })} />
      </Riga>
      <Riga etichetta="Tratto">
        <div className="flex items-center gap-1">
          <CampoNumero valore={carico.sIniziale} passo={0.05}
                       onChange={(v) => modifica({
                         sIniziale: Math.min(Math.max(v, 0), carico.sFinale),
                       })} />
          <span className="text-[10px]" style={{ color: 'var(--testo-debole)' }}>→</span>
          <CampoNumero valore={carico.sFinale} passo={0.05}
                       onChange={(v) => modifica({
                         sFinale: Math.max(Math.min(v, 1), carico.sIniziale),
                       })} />
        </div>
      </Riga>

      {globale && (
        <Interruttore
          attivo={carico.direzione.perProiezione === true}
          etichetta="misurato in proiezione (neve)"
          onChange={(v) => modifica({
            direzione: { ...carico.direzione, perProiezione: v },
          })}
        />
      )}

      {risultante && (
        <div className="mx-3 mt-1.5 rounded border px-2 py-1.5"
             style={{ borderColor: 'var(--bordo)' }}>
          <div className="text-[10px] font-semibold uppercase tracking-wider"
               style={{ color: 'var(--testo-debole)' }}>Risultante</div>
          <div className="numerico grid grid-cols-2 gap-x-2 text-[10.5px]"
               style={{ color: 'var(--testo-attenuato)' }}>
            <span>modulo</span>
            <span>{(Math.abs(risultante.modulo) / 1e3).toFixed(2)} kN</span>
            <span>componenti</span>
            <span>{(risultante.Fx / 1e3).toFixed(2)}, {(risultante.Fy / 1e3).toFixed(2)} kN</span>
            <span>applicata in</span>
            <span>{risultante.x.toFixed(3)}, {risultante.y.toFixed(3)} m</span>
            <span>tratto caricato</span>
            <span>{risultante.lunghezzaCaricata.toFixed(3)} m</span>
          </div>
        </div>
      )}
    </>
  );
}


/**
 * Scrive nell'angolo il valore perpendicolare all'asta indicata — o a quella
 * selezionata, se non se ne passa una. Calcola e dimentica: ciò che resta nel
 * modello è un angolo assoluto come tutti gli altri.
 */
function PerpendicolareAllAsta({ astaId, onCalcolato }: {
  astaId?: ElementId;
  onCalcolato: (radianti: number) => void;
}) {
  const progetto = useStore((s) => s.progetto);
  const selezione = useStore((s) => s.selezione);
  const bersaglio = astaId ?? ([...selezione.aste][0] as ElementId | undefined) ?? null;
  const valore = perpendicolareA(progetto, bersaglio);
  if (valore === null) return null;

  const gradi = ((((valore * 180) / Math.PI) % 360) + 360) % 360;
  return (
    <div className="px-3 py-0.5">
      <Bottone
        onClick={() => onCalcolato(valore)}
        titolo={`Scrive ${gradi.toFixed(0)}°, perpendicolare a `
          + `${bersaglio as unknown as string}. Il valore resta assoluto: `
          + "ruotando l'asta non cambia."}
      >
        perpendicolare all'asta ({gradi.toFixed(0)}°)
      </Bottone>
    </div>
  );
}

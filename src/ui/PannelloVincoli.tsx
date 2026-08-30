/**
 * Tavolozza dei vincoli.
 *
 * Ogni voce riporta i GRADI DI VINCOLO che introduce: è il numero che serve
 * per il conteggio, e averlo sotto gli occhi mentre si vincola la struttura
 * insegna più di qualunque tabella in coda al manuale.
 */

import { useStore } from '../state/store.js';
import { applicaVincolo, eliminaSuAstaSelezionato } from '../state/azioni.js';
import {
  SCONNESSIONI_DISPONIBILI, VINCOLI_DISPONIBILI, disegnaSconnessione, disegnaVincolo,
} from '../render/simboli.js';
import { eliminaSconnessioneNodale, spostaSuAsta } from '../state/commands.js';
import {
  PRESET_ANGOLI, normalizzaGradi, orientamentoVincolo,
} from '../core/model/orientamento.js';
import { Bottone, CampoNumero, Pannello, Riga } from './Pannelli.js';
import { useEffect, useRef } from 'react';
import type { TipoVincolo } from '../core/model/types.js';

export function PannelloVincoli() {
  const vincoloCorrente = useStore((s) => s.vincoloCorrente);
  const impostaVincoloCorrente = useStore((s) => s.impostaVincoloCorrente);
  const angolo = useStore((s) => s.angoloVincolo);
  const impostaAngolo = useStore((s) => s.impostaAngoloVincolo);
  const selezione = useStore((s) => s.selezione);
  const progetto = useStore((s) => s.progetto);

  const scelto = VINCOLI_DISPONIBILI.find((v) => v.tipo === vincoloCorrente)!;
  const gradiTotali = progetto.nodi.reduce((acc, n) => {
    if (!n.vincolo) return acc;
    const v = VINCOLI_DISPONIBILI.find((x) => x.tipo === n.vincolo!.tipo);
    return acc + (v?.gradi ?? 0);
  }, 0);

  return (
    <Pannello titolo="Vincoli">
      <div className="py-2">
        <p className="px-3 pb-2 text-[11px] leading-relaxed"
           style={{ color: 'var(--testo-debole)' }}>
          Clicca un <b>nodo</b> per applicare il vincolo scelto, oppure un punto
          qualunque di un'<b>asta</b> per posarlo lì. I simboli sull'asta si
          trascinano; <b>F</b> li ribalta dall'altra parte.
        </p>

        <div className="grid grid-cols-2 gap-1.5 px-3">
          {VINCOLI_DISPONIBILI.map((v) => (
            <button
              key={v.tipo}
              type="button"
              title={v.descrizione}
              onClick={() => impostaVincoloCorrente(v.tipo)}
              className="flex flex-col items-center gap-1 rounded border py-2 transition-colors"
              style={{
                background: vincoloCorrente === v.tipo ? 'var(--accento-scuro)' : 'var(--sfondo-elevato)',
                borderColor: vincoloCorrente === v.tipo ? 'var(--accento)' : 'var(--bordo)',
              }}
            >
              <AnteprimaVincolo tipo={v.tipo} angolo={0} />
              <span className="text-[10px] leading-tight"
                    style={{ color: vincoloCorrente === v.tipo ? '#fff' : 'var(--testo-attenuato)' }}>
                {v.nome}
              </span>
              <span className="numerico text-[9px]" style={{ color: 'var(--testo-debole)' }}>
                {v.gradi} {v.gradi === 1 ? 'grado' : 'gradi'}
              </span>
            </button>
          ))}
        </div>

        <div className="mt-3 border-t pt-2" style={{ borderColor: 'var(--bordo)' }}>
          <Orientamento />
          <p className="px-3 pt-1 text-[10px] leading-relaxed"
             style={{ color: 'var(--testo-debole)' }}>
            {scelto.descrizione}
          </p>
        </div>

        <SuNodo />
        <SuAsta />
        <Interne />

        <div className="mt-3 border-t px-3 pt-2 text-[11px]"
             style={{ borderColor: 'var(--bordo)' }}>
          <div className="flex justify-between">
            <span style={{ color: 'var(--testo-attenuato)' }}>gradi di vincolo esterni</span>
            <span className="numerico" style={{ color: 'var(--testo)' }}>{gradiTotali}</span>
          </div>
          {selezione.nodi.size > 0 && (
            <button
              type="button"
              onClick={() => applicaVincolo([...selezione.nodi])}
              className="mt-2 w-full rounded border py-1 text-[11px]"
              style={{ background: 'var(--sfondo-elevato)', borderColor: 'var(--bordo)' }}
            >
              applica ai {selezione.nodi.size} nodi selezionati
            </button>
          )}
        </div>
      </div>
    </Pannello>
  );
}

/** Miniatura del simbolo, disegnata con lo stesso codice del canvas. */
function AnteprimaVincolo({ tipo, angolo }: { tipo: TipoVincolo; angolo: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = 46 * dpr; c.height = 34 * dpr;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, 46, 34);
    const stile = getComputedStyle(document.documentElement);
    disegnaVincolo(
      ctx, { x: 23, y: 9 },
      { tipo, angolo: angolo as never },
      stile.getPropertyValue('--vincolo').trim() || '#ff5f56',
      stile.getPropertyValue('--sfondo-elevato').trim() || '#232830',
      false, 0.72,
    );
  }, [tipo, angolo]);
  return <canvas ref={canvas} style={{ width: 46, height: 34 }} />;
}


/**
 * Che cosa si posa cliccando su un'asta.
 *
 * La distinzione fra vincolo intermedio e sconnessione è il punto in cui si
 * sbaglia più facilmente, e non si può dedurre dal disegno: entrambi stanno in
 * mezzo alla trave. Qui è una scelta esplicita, con scritto accanto che cosa
 * comporta.
 */
function SuAsta() {
  const posa = useStore((s) => s.posaSuAsta);
  const impostaPosa = useStore((s) => s.impostaPosaSuAsta);
  const sconnessione = useStore((s) => s.sconnessioneCorrente);
  const impostaSconnessione = useStore((s) => s.impostaSconnessioneCorrente);
  const progetto = useStore((s) => s.progetto);
  const selezionato = useStore((s) => s.suAstaSelezionato);
  const esegui = useStore((s) => s.esegui);

  const vincoli = progetto.vincoliSuAsta ?? [];
  const sconnessioni = progetto.sconnessioni ?? [];
  const corrente = [...vincoli, ...sconnessioni].find((x) => x.id === selezionato);
  const scelta = SCONNESSIONI_DISPONIBILI.find((x) => x.tipo === sconnessione)!;

  return (
    <div className="mt-3 border-t pt-2" style={{ borderColor: 'var(--bordo)' }}>
      <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider"
           style={{ color: 'var(--testo-debole)' }}>
        Cliccando su un'asta
      </div>
      <div className="flex gap-1 px-3">
        <Bottone attivo={posa === 'vincolo'} onClick={() => impostaPosa('vincolo')}
                 titolo="Vincolo esterno intermedio: la trave resta un corpo solo, la rotazione è continua">
          vincolo esterno
        </Bottone>
        <Bottone attivo={posa === 'sconnessione'} onClick={() => impostaPosa('sconnessione')}
                 titolo="Sconnessione interna: divide la struttura in due corpi rigidi">
          sconnessione
        </Bottone>
      </div>

      {posa === 'sconnessione' ? (
        <>
          <div className="grid grid-cols-3 gap-1.5 px-3 pt-2">
            {SCONNESSIONI_DISPONIBILI.map((x) => (
              <button
                key={x.tipo}
                type="button"
                title={x.descrizione}
                onClick={() => impostaSconnessione(x.tipo)}
                className="flex flex-col items-center gap-1 rounded border py-2 transition-colors"
                style={{
                  background: sconnessione === x.tipo ? 'var(--accento-scuro)' : 'var(--sfondo-elevato)',
                  borderColor: sconnessione === x.tipo ? 'var(--accento)' : 'var(--bordo)',
                }}
              >
                <AnteprimaSconnessione tipo={x.tipo} />
                <span className="text-[9.5px] leading-tight"
                      style={{ color: sconnessione === x.tipo ? '#fff' : 'var(--testo-attenuato)' }}>
                  {x.nome.replace(' interna', '').replace(' interno', '')}
                </span>
              </button>
            ))}
          </div>
          <p className="px-3 pt-1.5 text-[10px] leading-relaxed"
             style={{ color: 'var(--testo-debole)' }}>
            Trasmette {scelta.trasmette}. {scelta.descrizione}
          </p>
        </>
      ) : (
        <p className="px-3 pt-1.5 text-[10px] leading-relaxed"
           style={{ color: 'var(--testo-debole)' }}>
          Il vincolo posato in mezzeria <b>non interrompe</b> la trave: resta un
          unico corpo rigido e la rotazione passa attraverso quel punto. È il
          caso della trave continua su tre appoggi, una volta iperstatica.
        </p>
      )}

      {(vincoli.length > 0 || sconnessioni.length > 0) && (
        <div className="px-3 pt-2">
          <div className="pb-1 text-[10px] font-semibold uppercase tracking-wider"
               style={{ color: 'var(--testo-debole)' }}>
            Sull'asta ({vincoli.length + sconnessioni.length})
          </div>
          {[...vincoli.map((v) => ({
            id: v.id, astaId: v.astaId, s: v.s,
            nome: v.vincolo.tipo, interno: false,
          })), ...sconnessioni.map((c) => ({
            id: c.id, astaId: c.astaId, s: c.s, nome: c.tipo, interno: true,
          }))].map((x) => (
            <button
              key={x.id}
              type="button"
              onClick={() => useStore.getState().selezionaSuAsta(
                selezionato === x.id ? null : x.id)}
              onMouseEnter={() => useStore.getState().evidenziaSuAsta(x.id)}
              onMouseLeave={() => useStore.getState().evidenziaSuAsta(null)}
              className="numerico flex w-full items-center gap-2 px-0 py-[3px] text-left text-[10.5px]"
              style={{
                color: selezionato === x.id ? 'var(--accento)' : 'var(--testo-attenuato)',
              }}
            >
              <span className="w-8 shrink-0">{x.id}</span>
              <span className="flex-1 truncate">
                {x.nome}{x.interno ? ' interna' : ''} su {x.astaId as unknown as string}
              </span>
              <span>{(x.s * 100).toFixed(0)} %</span>
            </button>
          ))}
        </div>
      )}

      {corrente && (
        <div className="px-3 pt-1">
          <Riga etichetta="Ascissa">
            <CampoNumero
              valore={Number((corrente.s * 100).toFixed(2))}
              passo={5}
              suffisso="%"
              onChange={(v) => esegui(spostaSuAsta(corrente.id, v / 100))}
            />
          </Riga>
          <Bottone larghezzaPiena onClick={eliminaSuAstaSelezionato}>
            elimina {corrente.id}
          </Bottone>
        </div>
      )}
    </div>
  );
}

/** Miniatura della sconnessione, con lo stesso codice del canvas. */
function AnteprimaSconnessione({ tipo }: {
  tipo: 'cerniera' | 'bipendolo' | 'pattino';
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = 40 * dpr; c.height = 24 * dpr;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, 40, 24);
    const stile = getComputedStyle(document.documentElement);
    const colore = stile.getPropertyValue('--asta').trim() || '#c8d0dc';
    // il pezzo d'asta sotto il simbolo: senza, la cerniera vuota non si
    // capisce che cosa stia interrompendo
    ctx.strokeStyle = colore;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(4, 12); ctx.lineTo(36, 12);
    ctx.stroke();
    disegnaSconnessione(
      ctx, { x: 20, y: 12 }, tipo, 0,
      stile.getPropertyValue('--vincolo').trim() || '#ff5f56',
      stile.getPropertyValue('--sfondo-elevato').trim() || '#232830',
      false, 1,
    );
  }, [tipo]);
  return <canvas ref={canvas} style={{ width: 40, height: 24 }} />;
}


/**
 * Cerniera esterna o interna cliccando su un nodo.
 *
 * Sono due cose opposte che si disegnano nello stesso punto: una lega la
 * struttura a terra, l'altra la divide in due corpi. La scelta automatica
 * indovina quasi sempre, ma quel «quasi» va lasciato nelle mani dell'utente,
 * e soprattutto mostrato prima del clic.
 */
function SuNodo() {
  const modo = useStore((s) => s.modoCerniera);
  const imposta = useStore((s) => s.impostaModoCerniera);
  const anteprima = useStore((s) => s.anteprimaVincolo);
  const tipo = useStore((s) => s.vincoloCorrente);
  const sconnettibile = tipo === 'cerniera' || tipo === 'bipendolo' || tipo === 'pattino';

  return (
    <div className="mt-3 border-t pt-2" style={{ borderColor: 'var(--bordo)' }}>
      <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider"
           style={{ color: 'var(--testo-debole)' }}>
        Cliccando su un nodo
      </div>
      <div className="flex gap-1 px-3">
        {([
          ['auto', 'automatico', 'Esterno sugli estremi, interno dove convergono due o più aste'],
          ['esterno', 'esterno', 'Sempre vincolo a terra'],
          ['interno', 'interno', 'Sempre sconnessione fra le aste che convergono'],
        ] as const).map(([id, nome, aiuto]) => (
          <Bottone key={id} attivo={modo === id} titolo={aiuto}
                   onClick={() => imposta(id)}>
            {nome}
          </Bottone>
        ))}
      </div>
      {!sconnettibile && (
        <p className="px-3 pt-1.5 text-[10px] leading-relaxed"
           style={{ color: 'var(--testo-debole)' }}>
          Un {tipo} non ha versione interna: sconnettono solo cerniera,
          bipendolo e pattino.
        </p>
      )}
      <p className="px-3 pt-1.5 text-[10px] leading-relaxed"
         style={{ color: anteprima ? 'var(--testo-attenuato)' : 'var(--testo-debole)' }}>
        {anteprima
          ? `${anteprima.nodoId as unknown as string}: ${anteprima.azione.motivo ?? ''}`
          : 'Passa sopra un nodo per vedere che cosa comparirà.'}
      </p>
    </div>
  );
}

/** Elenco delle sconnessioni interne poste sui nodi. */
function Interne() {
  const progetto = useStore((s) => s.progetto);
  const esegui = useStore((s) => s.esegui);
  const interne = (progetto.vincoliInterni ?? []).filter((v) => v.tipo !== 'biella');
  if (interne.length === 0) return null;

  return (
    <div className="mt-3 border-t px-3 pt-2" style={{ borderColor: 'var(--bordo)' }}>
      <div className="pb-1 text-[10px] font-semibold uppercase tracking-wider"
           style={{ color: 'var(--testo-debole)' }}>
        Sconnessioni sui nodi ({interne.length})
      </div>
      {interne.map((v) => (
        <div key={v.id} className="numerico flex items-center gap-2 py-[3px] text-[10.5px]"
             style={{ color: 'var(--testo-attenuato)' }}>
          <span className="w-8 shrink-0">{v.id}</span>
          <span className="flex-1 truncate">
            {v.tipo} in {v.nodoId as unknown as string}
            {v.asteSvincolate && v.asteSvincolate.length > 0 ? ' (parziale)' : ''}
          </span>
          <button
            type="button"
            onClick={() => esegui(eliminaSconnessioneNodale(v.id))}
            className="px-1"
            title="Rimuove la sconnessione: i corpi rigidi tornano a fondersi"
            style={{ color: 'var(--testo-debole)' }}
          >×</button>
        </div>
      ))}
    </div>
  );
}


/**
 * L'orientamento del vincolo: un solo numero, tutto il giro.
 *
 * La ghiera mostra dove PUNTA il vincolo — è la stessa direzione che il
 * simbolo disegna e che la reazione segue — e il campo accetta qualunque
 * valore fra 0 e 359, normalizzando modulo 360: −90 diventa 270, 450 diventa
 * 90. Non c'è un secondo parametro per il lato, perché il lato è mezzo giro.
 */
function Orientamento() {
  const angolo = useStore((s) => s.angoloVincolo);
  const imposta = useStore((s) => s.impostaAngoloVincolo);
  const o = orientamentoVincolo(angolo);
  const daGradi = (g: number) => imposta((normalizzaGradi(g) * Math.PI) / 180);

  return (
    <>
      <Riga etichetta="Orientamento">
        <div className="flex items-center gap-2">
          <CampoNumero
            valore={o.gradi}
            passo={1}
            suffisso="°"
            onChange={(v) => daGradi(v)}
          />
          <Ghiera gradi={o.gradi} onChange={daGradi} />
        </div>
      </Riga>
      <div className="flex flex-wrap gap-1 px-3 pt-1">
        {PRESET_ANGOLI.map((a) => (
          <Bottone key={a} attivo={o.gradi === a} onClick={() => daGradi(a)}>
            {a}°
          </Bottone>
        ))}
      </div>
      <p className="px-3 pt-1.5 text-[10px] leading-relaxed"
         style={{ color: 'var(--testo-debole)' }}>
        L'angolo è la direzione verso cui <b>punta</b> il vincolo, misurata in
        assoluto: 0° in alto, 90° a sinistra, 180° in basso, 270° a destra. Il
        simbolo si disegna dalla parte opposta e la reazione segue la stessa
        direzione. <b>F</b> ribalta di 180°.
      </p>
    </>
  );
}

/** Ghiera: si clicca o si trascina dove deve puntare il vincolo. */
function Ghiera({ gradi, onChange }: {
  gradi: number; onChange: (g: number) => void;
}) {
  const raggio = 17;
  const dal = (e: { clientX: number; clientY: number }, el: SVGSVGElement) => {
    const r = el.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    // û = (−sin α, cos α) in coordinate mondo; sullo schermo y è rovesciata
    onChange((Math.atan2(-dx, -dy) * 180) / Math.PI);
  };
  const a = (gradi * Math.PI) / 180;
  const px = -Math.sin(a) * raggio;
  const py = -Math.cos(a) * raggio;

  return (
    <svg
      width={42} height={42} viewBox="-21 -21 42 42"
      className="shrink-0 cursor-crosshair"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        dal(e, e.currentTarget);
      }}
      onPointerMove={(e) => {
        if (e.buttons === 1) dal(e, e.currentTarget);
      }}
    >
      <circle r={raggio} fill="none" stroke="var(--bordo)" strokeWidth={1} />
      {PRESET_ANGOLI.map((g) => {
        const t = (g * Math.PI) / 180;
        return (
          <line
            key={g}
            x1={-Math.sin(t) * (raggio - 3)} y1={-Math.cos(t) * (raggio - 3)}
            x2={-Math.sin(t) * raggio} y2={-Math.cos(t) * raggio}
            stroke="var(--testo-debole)" strokeWidth={1}
          />
        );
      })}
      <line x1={0} y1={0} x2={px} y2={py} stroke="var(--vincolo)" strokeWidth={2} />
      <circle cx={px} cy={py} r={2.6} fill="var(--vincolo)" />
    </svg>
  );
}

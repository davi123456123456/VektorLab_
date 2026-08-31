/**
 * Tavolozza dei vincoli.
 *
 * Ogni voce riporta i GRADI DI VINCOLO che introduce: è il numero che serve
 * per il conteggio, e averlo sotto gli occhi mentre si vincola la struttura
 * insegna più di qualunque tabella in coda al manuale.
 */

import { HA_VARIANTE_INTERNA, useStore } from '../state/store.js';
import { applicaVincolo, eliminaSuAstaSelezionato } from '../state/azioni.js';
import {
  VINCOLI_DISPONIBILI, disegnaSconnessione, disegnaVincolo, nomeVincolo,
} from '../render/simboli.js';
import { asteNelNodo } from '../core/model/deduzione.js';
import { eliminaSconnessioneNodale, spostaSuAsta } from '../state/commands.js';
import {
  PRESET_ANGOLI, normalizzaGradi, orientamentoVincolo,
} from '../core/model/orientamento.js';
import { Bottone, CampoNumero, Pannello, Riga } from './Pannelli.js';
import { useEffect, useRef, useState } from 'react';
import type { TipoVincolo } from '../core/model/types.js';

export function PannelloVincoli() {
  const vincoloCorrente = useStore((s) => s.vincoloCorrente);
  const impostaVincoloCorrente = useStore((s) => s.impostaVincoloCorrente);
  const ambitoGrezzo = useStore((s) => s.modoCerniera);
  const impostaAmbito = useStore((s) => s.impostaAmbitoVincolo);
  const selezione = useStore((s) => s.selezione);
  const progetto = useStore((s) => s.progetto);
  const [aiuto, setAiuto] = useState(false);

  const ambito: 'esterno' | 'interno' = ambitoGrezzo === 'interno' ? 'interno' : 'esterno';
  const haInterno = HA_VARIANTE_INTERNA.has(vincoloCorrente);

  // §3.3 — l'interno esiste solo dove c'è qualcosa da sconnettere. Se nel
  // modello non c'è un solo nodo con due aste, l'opzione va spenta: offrirla
  // significherebbe promettere un clic che non può funzionare.
  const nodiSconnettibili = progetto.nodi.filter(
    (n) => asteNelNodo(progetto, n.id).length >= 2);
  const selezionati = [...selezione.nodi];
  const internoPossibile = haInterno && (
    selezionati.length > 0
      ? selezionati.some((id) => asteNelNodo(progetto, id).length >= 2)
      : nodiSconnettibili.length > 0
  );

  // §3.3 — l'angolo si nasconde quando non ha effetto, invece di restare lì
  // inerte: un campo che accetta un numero e non cambia niente insegna che i
  // campi di questo pannello non sono affidabili.
  const angoloUtile = ambito === 'esterno' && vincoloCorrente !== 'cerniera';

  const gradiTotali = progetto.nodi.reduce((acc, n) => {
    if (!n.vincolo) return acc;
    const v = VINCOLI_DISPONIBILI.find((x) => x.tipo === n.vincolo!.tipo);
    return acc + (v?.gradi ?? 0);
  }, 0);

  return (
    <Pannello titolo="Vincoli">
      <div className="py-2">
        <div className="grid grid-cols-2 gap-1.5 px-3">
          {VINCOLI_DISPONIBILI.map((v) => (
            <button
              key={v.tipo}
              type="button"
              title={nomeVincolo(v.tipo, HA_VARIANTE_INTERNA.has(v.tipo) ? ambito : 'esterno')}
              onClick={() => impostaVincoloCorrente(v.tipo)}
              className="flex flex-col items-center gap-1 rounded border py-2 transition-colors"
              style={{
                background: vincoloCorrente === v.tipo ? 'var(--accento-scuro)' : 'var(--sfondo-elevato)',
                borderColor: vincoloCorrente === v.tipo ? 'var(--accento)' : 'var(--bordo)',
              }}
            >
              {HA_VARIANTE_INTERNA.has(v.tipo) && ambito === 'interno'
                ? <AnteprimaSconnessione tipo={v.tipo as 'cerniera' | 'bipendolo' | 'pattino'} />
                : <AnteprimaVincolo tipo={v.tipo} angolo={0} />}
              <span className="text-[10px] leading-tight"
                    style={{ color: vincoloCorrente === v.tipo ? '#fff' : 'var(--testo-attenuato)' }}>
                {nomeVincolo(v.tipo, HA_VARIANTE_INTERNA.has(v.tipo) ? ambito : 'esterno')}
              </span>
              <span className="numerico text-[9px]" style={{ color: 'var(--testo-debole)' }}>
                {HA_VARIANTE_INTERNA.has(v.tipo) && ambito === 'interno'
                  ? (v.tipo === 'cerniera' ? '2(m−1)' : '2')
                  : `${v.gradi} ${v.gradi === 1 ? 'grado' : 'gradi'}`}
              </span>
            </button>
          ))}
        </div>

        {haInterno && (
          <div className="flex gap-1 px-3 pt-2">
            <Bottone attivo={ambito === 'esterno'} onClick={() => impostaAmbito('esterno')}>
              esterno
            </Bottone>
            <button
              type="button"
              disabled={!internoPossibile}
              title={internoPossibile ? undefined : 'Serve un nodo con almeno due aste'}
              onClick={() => impostaAmbito('interno')}
              className="rounded border px-2 py-1 text-[11px] transition-colors
                         disabled:cursor-not-allowed disabled:opacity-40"
              style={{
                background: ambito === 'interno' ? 'var(--accento-scuro)' : 'var(--sfondo-elevato)',
                borderColor: ambito === 'interno' ? 'var(--accento)' : 'var(--bordo)',
                color: ambito === 'interno' ? '#fff' : 'var(--testo-attenuato)',
              }}
            >
              interno
            </button>
          </div>
        )}

        {angoloUtile && (
          <div className="mt-3 border-t pt-2" style={{ borderColor: 'var(--bordo)' }}>
            <Orientamento />
          </div>
        )}

        <ElencoSuAsta />

        <div className="mt-3 border-t px-3 pt-2 text-[11px]"
             style={{ borderColor: 'var(--bordo)' }}>
          <div className="flex items-baseline justify-between">
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

        {/*
          §2 — nessun paragrafo permanente nel pannello. Le spiegazioni non
          spariscono, si spostano: stanno dietro questa icona, chiusa per
          default, dove chi le vuole le trova e chi non le vuole non le legge
          ogni volta che apre il pannello.
        */}
        <div className="px-3 pt-2">
          <button
            type="button"
            onClick={() => setAiuto((v) => !v)}
            aria-label="Spiegazione dei vincoli"
            className="rounded-full border px-1.5 text-[10px] leading-tight"
            style={{
              borderColor: aiuto ? 'var(--accento)' : 'var(--bordo)',
              color: aiuto ? 'var(--accento)' : 'var(--testo-debole)',
            }}
          >?</button>
          {aiuto && (
            <div className="mt-1.5 rounded border p-2 text-[10px] leading-relaxed"
                 style={{ borderColor: 'var(--bordo)', color: 'var(--testo-debole)' }}>
              <p>
                Clicca un <b>nodo</b> per applicare il vincolo scelto, o un punto
                qualunque di un'<b>asta</b> per posarlo lì.
              </p>
              <p className="mt-1.5">
                <b>Esterno</b> lega la struttura a terra e non separa mai i corpi
                rigidi. <b>Interno</b> è una sconnessione: divide la struttura in
                due corpi, e il conteggio cambia solo in questo caso.
              </p>
              <p className="mt-1.5">
                L'angolo è la direzione verso cui <b>punta</b> il vincolo, in
                assoluto: 0° in alto, 90° a sinistra, 180° in basso, 270° a
                destra. <b>F</b> ribalta di 180°.
              </p>
            </div>
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
 * Elenco di ciò che è posato sulle aste.
 *
 * Solo l'elenco: quale tipo posare si sceglie in cima, con le icone, e se sia
 * esterno o interno lo dice il selettore. Qui si vede che cosa c'è, lo si
 * seleziona, se ne sposta l'ascissa e lo si toglie.
 */
function ElencoSuAsta() {
  const progetto = useStore((s) => s.progetto);
  const selezionato = useStore((s) => s.suAstaSelezionato);
  const esegui = useStore((s) => s.esegui);

  const vincoli = progetto.vincoliSuAsta ?? [];
  const sconnessioni = progetto.sconnessioni ?? [];
  const corrente = [...vincoli, ...sconnessioni].find((x) => x.id === selezionato);
  if (vincoli.length === 0 && sconnessioni.length === 0) return null;

  return (
    <div className="mt-3 border-t pt-2" style={{ borderColor: 'var(--bordo)' }}>
      <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider"
           style={{ color: 'var(--testo-debole)' }}>
        Sull'asta ({vincoli.length + sconnessioni.length})
      </div>
      <div className="px-3">
        {[...vincoli.map((v) => ({
          id: v.id, astaId: v.astaId, s: v.s,
          nome: nomeVincolo(v.vincolo.tipo, 'esterno'),
        })), ...sconnessioni.map((c) => ({
          id: c.id, astaId: c.astaId, s: c.s, nome: nomeVincolo(c.tipo, 'interno'),
        }))].map((x) => (
          <button
            key={x.id}
            type="button"
            onClick={() => useStore.getState().selezionaSuAsta(
              selezionato === x.id ? null : x.id)}
            onMouseEnter={() => useStore.getState().evidenziaSuAsta(x.id)}
            onMouseLeave={() => useStore.getState().evidenziaSuAsta(null)}
            className="numerico flex w-full items-center gap-2 py-[3px] text-left text-[10.5px]"
            style={{
              color: selezionato === x.id ? 'var(--accento)' : 'var(--testo-attenuato)',
            }}
          >
            <span className="w-8 shrink-0">{x.id}</span>
            <span className="flex-1 truncate">
              {x.nome} su {x.astaId as unknown as string}
            </span>
            <span>{(x.s * 100).toFixed(0)} %</span>
          </button>
        ))}
      </div>

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

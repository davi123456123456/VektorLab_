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
  VINCOLI_DISPONIBILI, disegnaCernieraSconnessa, disegnaSconnessione,
  disegnaVincolo, nomeVincolo,
} from '../render/simboli.js';
import {
  definizioneVincolo, vincoliDi, type IconaVincolo as TipoIconaVincolo,
} from '../core/model/catalogoVincoli.js';
import { eliminaSconnessioneNodale, spostaSuAsta } from '../state/commands.js';
import {
  PRESET_ANGOLI, normalizzaGradi, orientamentoVincolo,
} from '../core/model/orientamento.js';
import { Bottone, CampoNumero, Pannello, Riga } from './Pannelli.js';
import { useEffect, useRef, useState } from 'react';
import type { TipoVincolo } from '../core/model/types.js';

export function PannelloVincoli() {
  const sceltoId = useStore((s) => s.vincoloSceltoId);
  const scegli = useStore((s) => s.scegliVincolo);
  const filtro = useStore((s) => s.filtroVincoli);
  const impostaFiltro = useStore((s) => s.impostaFiltroVincoli);
  const selezione = useStore((s) => s.selezione);
  const progetto = useStore((s) => s.progetto);
  const [aiuto, setAiuto] = useState(false);

  const voci = vincoliDi(filtro);
  const scelto = definizioneVincolo(sceltoId);

  const gradiTotali = progetto.nodi.reduce((acc, n) => {
    if (!n.vincolo) return acc;
    const v = VINCOLI_DISPONIBILI.find((x) => x.tipo === n.vincolo!.tipo);
    return acc + (v?.gradi ?? 0);
  }, 0);

  return (
    <Pannello titolo="Vincoli">
      <div className="py-2">
        {/*
          §3.3 — il filtro sta IN CIMA e c'è sempre. Non è un attributo del
          vincolo già scelto: dice quali icone si vedono. Le due famiglie sono
          disgiunte — carrello, incastro, biella e molla esistono solo a
          telaio — e mostrarle insieme era il motivo per cui la tavolozza
          sembrava contenere doppioni.
        */}
        <div className="flex gap-1 px-3 pb-2">
          <Bottone attivo={filtro === 'telaio'} onClick={() => impostaFiltro('telaio')}
                   titolo="Collegano la struttura al terreno e producono reazioni. Non separano mai i corpi rigidi.">
            esterni
          </Bottone>
          <Bottone attivo={filtro === 'interno'} onClick={() => impostaFiltro('interno')}
                   titolo="Interrompono la continuità fra le aste. Separano i corpi rigidi.">
            interni
          </Bottone>
        </div>

        <div className="grid grid-cols-2 gap-1.5 px-3">
          {voci.map((v) => (
            <button
              key={v.id}
              type="button"
              // la voce c'è nel catalogo — l'elenco è quello definitivo — ma
              // il suo comportamento nel modello arriva col passo successivo.
              // Meglio un bottone spento che dichiara di esserlo, che uno
              // acceso che posa un vincolo diverso da quello che mostra.
              disabled={v.id === 'cernieraSconnessa'}
              title={v.id === 'cernieraSconnessa'
                ? `${v.descrizione}\n\nNon ancora applicabile.`
                : v.descrizione}
              onClick={() => scegli(v.id)}
              className="flex flex-col items-center gap-1 rounded border py-2 transition-colors
                         disabled:cursor-not-allowed disabled:opacity-45"
              style={{
                background: sceltoId === v.id ? 'var(--accento-scuro)' : 'var(--sfondo-elevato)',
                borderColor: sceltoId === v.id ? 'var(--accento)' : 'var(--bordo)',
              }}
            >
              <IconaVincolo icona={v.icona} />
              <span className="text-[10px] leading-tight"
                    style={{ color: sceltoId === v.id ? '#fff' : 'var(--testo-attenuato)' }}>
                {v.nome}
              </span>
              <span className="numerico text-[9px]" style={{ color: 'var(--testo-debole)' }}>
                {v.gdv === 'elastico' ? 'elastico'
                  : /^\d+$/.test(v.gdv)
                    ? `${v.gdv} ${v.gdv === '1' ? 'grado' : 'gradi'}`
                    : `${v.gdv} gradi`}
              </span>
            </button>
          ))}
        </div>

        {scelto?.orientabile && (
          <div className="mt-3 border-t pt-2" style={{ borderColor: 'var(--bordo)' }}>
            <Orientamento />
            {scelto.soloDisegno && (
              <p className="px-3 pt-1 text-[9.5px] leading-relaxed"
                 style={{ color: 'var(--testo-debole)' }}>
                Qui l'angolo orienta il simbolo: le reazioni non ne dipendono.
              </p>
            )}
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
                <b>Esterni</b> collegano a terra e non separano mai i corpi rigidi,
                nemmeno posati in campata. <b>Interni</b> interrompono la
                continuità fra le aste, e il conteggio cambia solo in quel caso.
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

/** Icona generata dal catalogo: nome e simbolo non possono più sfasarsi. */
function IconaVincolo({ icona }: { icona: TipoIconaVincolo }) {
  if (icona.genere === 'telaio') return <AnteprimaVincolo tipo={icona.tipo} angolo={0} />;
  if (icona.genere === 'sconnessione') return <AnteprimaSconnessione tipo={icona.tipo} />;
  return <AnteprimaCernieraSconnessa />;
}

/**
 * Miniatura della cerniera che sconnette: stesso simbolo a terra della
 * cerniera a telaio, ma coi due mozziconi d'asta che si FERMANO sul perno. È
 * l'unico modo di distinguere le due voci in un'icona di quarantasei pixel.
 */
function AnteprimaCernieraSconnessa() {
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
    disegnaCernieraSconnessa(
      ctx, { x: 23, y: 9 }, 0,
      stile.getPropertyValue('--vincolo').trim() || '#ff5f56',
      stile.getPropertyValue('--sfondo-elevato').trim() || '#232830',
      stile.getPropertyValue('--asta').trim() || '#c8d0dc',
      false, 0.72, true,
    );
  }, []);
  return <canvas ref={canvas} style={{ width: 46, height: 34 }} />;
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

/**
 * Ghiera: si clicca o si trascina dove deve puntare il vincolo.
 *
 * Il trascinamento è CONTINUO — qualunque valore fra 0 e 359 — e `Shift`
 * aggancia ai quindici gradi. È l'inverso della convenzione più diffusa, dove
 * il modificatore libera invece di vincolare, ma qui la regolazione fine è il
 * gesto normale: la ghiera esiste per orientare una cerniera esattamente come
 * la si vede, e i valori tondi hanno già i loro bottoni.
 */
function Ghiera({ gradi, onChange }: {
  gradi: number; onChange: (g: number) => void;
}) {
  const raggio = 24;
  const dal = (e: {
    clientX: number; clientY: number; shiftKey: boolean;
  }, el: SVGSVGElement) => {
    const r = el.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    // û = (−sin α, cos α) in coordinate mondo; sullo schermo y è rovesciata
    const grezzo = (Math.atan2(-dx, -dy) * 180) / Math.PI;
    onChange(e.shiftKey ? Math.round(grezzo / 15) * 15 : grezzo);
  };
  const a = (gradi * Math.PI) / 180;
  const px = -Math.sin(a) * raggio;
  const py = -Math.cos(a) * raggio;

  return (
    <svg
      width={56} height={56} viewBox="-28 -28 56 56"
      className="shrink-0 cursor-crosshair"
      // il titolo è l'unico posto in cui la scorciatoia si può scoprire:
      // uno snap che esiste e non si annuncia è uno snap che non esiste
      role="slider"
      aria-label="Orientamento del vincolo"
      aria-valuenow={Math.round(gradi)}
      aria-valuemin={0}
      aria-valuemax={359}
    >
      <title>Trascina per orientare · Shift aggancia a 15°</title>
      <circle r={raggio} fill="none" stroke="var(--bordo)" strokeWidth={1} />

      {/* tacche fini ogni 15°, marcate ogni 45° */}
      {PRESET_ANGOLI.map((g) => {
        const t = (g * Math.PI) / 180;
        const grande = g % 45 === 0;
        const dentro = raggio - (grande ? 5 : 2.5);
        return (
          <line
            key={g}
            x1={-Math.sin(t) * dentro} y1={-Math.cos(t) * dentro}
            x2={-Math.sin(t) * raggio} y2={-Math.cos(t) * raggio}
            stroke={grande ? 'var(--testo-debole)' : 'var(--bordo-chiaro)'}
            strokeWidth={1}
          />
        );
      })}

      <line x1={0} y1={0} x2={px} y2={py} stroke="var(--vincolo)" strokeWidth={2} />
      <circle cx={px} cy={py} r={3.4} fill="var(--vincolo)" />

      {/*
        La zona sensibile sta SOPRA il disegno e copre tutto il riquadro: sui
        raggi corti il puntatore cadeva fra le tacche e il trascinamento non
        partiva.
      */}
      <rect
        x={-28} y={-28} width={56} height={56} fill="transparent"
        onPointerDown={(e) => {
          e.currentTarget.ownerSVGElement?.setPointerCapture(e.pointerId);
          dal(e, e.currentTarget.ownerSVGElement!);
        }}
        onPointerMove={(e) => {
          if (e.buttons === 1) dal(e, e.currentTarget.ownerSVGElement!);
        }}
      />
    </svg>
  );
}

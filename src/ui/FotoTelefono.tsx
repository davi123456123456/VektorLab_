/**
 * STRUTTURA DA FOTO, SUL TELEFONO.
 *
 * Scatta o scegli dalla galleria → la rete trova lo schema nel foglio → lo
 * studente tocca quello giusto o ne ritocca il riquadro → «Riconosci» → la
 * struttura si disegna nel piano di lavoro al posto di quella che c'era
 * (Annulla la rimette). Solo sul telefono: sul computer non si monta.
 *
 * La foto non si salva mai (R2): si decodifica qui, al più a 2400 px, la
 * bitmap si chiude subito, i byte del grigio passano al worker trasferiti
 * (non copiati) e lui li dimentica dopo la lettura o all'annullamento.
 * Resta solo un'anteprima rimpicciolita nel canvas di questo pannello, che
 * si svuota alla chiusura.
 */

import { useEffect, useRef, useState, type PointerEvent as PE } from 'react';
import { avvisiApp, type AvvisoApp } from '../foto/app/avvisi.js';
import { decodificaRidotta, dimensioniDecodifica } from '../foto/app/decodifica.js';
import { disegnaDaFoto } from '../foto/app/disegna.js';
import { PonteFoto } from '../foto/app/ponte.js';
import type { Risposta } from '../foto/app/protocollo.js';
import type { Figura, Riquadro } from '../foto/rete/figura.js';
import { grigioDaRGBA } from '../foto/rete/ingresso.js';
import { storeAttivo } from '../state/store.js';
import { Icona } from './icone.js';

export const SENZA_SCHEMA = 'Nella foto non ho trovato uno schema';
const PRIVACY = 'La foto resta sul telefono e non viene salvata.';

/** Uno solo per l'app: la rete scaricata resta pronta per la foto dopo. */
let ponte: PonteFoto | null = null;
const ilPonte = () => (ponte ??= new PonteFoto());
/** numeri delle richieste: il pannello ascolta solo la risposta alla sua */
let prossimaRichiesta = 1;

type Passo =
  | { tipo: 'scegli'; errore?: string }
  | { tipo: 'attendo'; fase: 'decodifico' | 'scarico' | 'cerco' | 'leggo'; fatto?: number; totale?: number }
  | { tipo: 'riquadro'; figure: Figura[]; scelta: number; riquadro: Riquadro };

const SCRITTE_ATTESA = {
  decodifico: 'Preparo la foto…',
  scarico: 'Scarico il riconoscitore (solo la prima volta)…',
  cerco: 'Cerco lo schema…',
  leggo: 'Leggo lo schema…',
};

export function FotoTelefono({ chiudi, disegnato }: {
  chiudi: () => void;
  disegnato: (avvisi: AvvisoApp[]) => void;
}) {
  const [passo, setPasso] = useState<Passo>({ tipo: 'scegli' });
  // la cornice dell'anteprima: la foto intera nello spazio libero, con le sue proporzioni
  const spazio = useRef<HTMLDivElement>(null);
  const [cornice, setCornice] = useState({ larghezza: 0, altezza: 0 });
  const anteprima = useRef<HTMLCanvasElement>(null);
  const foto = useRef({ larghezza: 1, altezza: 1 });
  const scatta = useRef<HTMLInputElement>(null);
  const galleria = useRef<HTMLInputElement>(null);
  // le richiamate in ref: l'abbonamento al worker va fatto una volta sola,
  // perché la sua pulizia fa dimenticare la foto al worker
  const fuori = useRef({ chiudi, disegnato });
  fuori.current = { chiudi, disegnato };
  /** la richiesta di cui si aspetta la risposta; le altre si ignorano */
  const richiesta = useRef<number | null>(null);
  /** falso dopo la chiusura: una decodifica in corso si ferma senza inviare */
  const aperto = useRef(true);

  useEffect(() => {
    aperto.current = true;
    const tela = anteprima.current;
    const via = ilPonte().ascolta((r: Risposta) => {
      if (r.id !== richiesta.current) return;
      if (r.tipo === 'avanzamento') setPasso({ tipo: 'attendo', fase: r.fase, fatto: r.fatto, totale: r.totale });
      else if (r.tipo === 'figure') {
        setPasso({ tipo: 'riquadro', figure: r.figure, scelta: r.scelta, riquadro: r.figure[r.scelta].riquadro });
      } else if (r.tipo === 'nessunoSchema') setPasso({ tipo: 'scegli', errore: SENZA_SCHEMA });
      else if (r.tipo === 'errore') setPasso({ tipo: 'scegli', errore: r.messaggio });
      else if (r.tipo === 'letto') {
        disegnaDaFoto(storeAttivo(), r.progetto);
        fuori.current.disegnato(avvisiApp(r.avvisi, r.elementiDaPunti));
        fuori.current.chiudi();
      }
    });
    return () => {
      aperto.current = false;
      richiesta.current = null;
      via();
      // chiudendo, in qualunque momento, il worker dimentica la foto
      ilPonte().invia({ tipo: 'dimentica' });
      if (tela) { tela.width = 0; tela.height = 0; }
    };
  }, []);

  useEffect(() => {
    const el = spazio.current;
    if (!el || passo.tipo !== 'riquadro') return;
    const adatta = () => {
      const { larghezza, altezza } = foto.current;
      const s = Math.min((el.clientWidth - 16) / larghezza, (el.clientHeight - 16) / altezza);
      setCornice({ larghezza: Math.floor(larghezza * s), altezza: Math.floor(altezza * s) });
    };
    adatta();
    const o = new ResizeObserver(adatta);
    o.observe(el);
    return () => o.disconnect();
  }, [passo.tipo]);

  async function usa(file: File | undefined) {
    if (!file) return;
    setPasso({ tipo: 'attendo', fase: 'decodifico' });
    try {
      const bitmap = await decodificaRidotta(file);
      if (!aperto.current) { bitmap.close(); return; }
      const { larghezza, altezza } = dimensioniDecodifica(bitmap.width, bitmap.height);
      const tela = document.createElement('canvas');
      tela.width = larghezza;
      tela.height = altezza;
      const ctx = tela.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(bitmap, 0, 0, larghezza, altezza);
      bitmap.close();
      const g = grigioDaRGBA(ctx.getImageData(0, 0, larghezza, altezza).data, larghezza, altezza);
      foto.current = { larghezza, altezza };
      const c = anteprima.current;
      if (c) {
        const s = Math.min(1, 900 / Math.max(larghezza, altezza));
        c.width = Math.round(larghezza * s);
        c.height = Math.round(altezza * s);
        c.getContext('2d')!.drawImage(tela, 0, 0, c.width, c.height);
      }
      tela.width = 0;
      tela.height = 0;
      if (!aperto.current) return;
      const id = prossimaRichiesta++;
      richiesta.current = id;
      ilPonte().invia({ tipo: 'foto', id, dati: g.dati, larghezza, altezza }, [g.dati.buffer]);
    } catch {
      if (aperto.current) setPasso({ tipo: 'scegli', errore: 'Non riesco ad aprire questa immagine' });
    }
  }

  const annulla = () => chiudi();

  return (
    <div className="foto-velo" role="dialog" aria-label="Struttura da foto">
      <div className="foto-testata">
        <span className="foto-titolo">Struttura da foto</span>
        <button type="button" className="foto-chiudi" aria-label="Chiudi" onClick={annulla}>✕</button>
      </div>

      <input ref={scatta} type="file" accept="image/*" capture="environment" hidden
             onChange={(e) => { void usa(e.target.files?.[0]); e.target.value = ''; }} />
      <input ref={galleria} type="file" accept="image/*" hidden data-prova="galleria"
             onChange={(e) => { void usa(e.target.files?.[0]); e.target.value = ''; }} />

      {passo.tipo === 'scegli' && (
        <div className="foto-scegli">
          {passo.errore && <p className="foto-errore" role="alert">{passo.errore}</p>}
          <button type="button" className="foto-grande" onClick={() => scatta.current?.click()}>
            <Icona nome="fotocamera" dimensione={28} /> Scatta
          </button>
          <button type="button" className="foto-grande" onClick={() => galleria.current?.click()}>
            Galleria
          </button>
          <p className="foto-nota">Inquadra un esercizio alla volta, il più dritto possibile.</p>
          <p className="foto-nota">{PRIVACY}</p>
        </div>
      )}

      {passo.tipo === 'attendo' && (
        <div className="foto-attesa" aria-live="polite">
          <p>{SCRITTE_ATTESA[passo.fase]}</p>
          {passo.fase === 'scarico' && passo.totale ? (
            <div className="foto-barra"><div style={{ width: `${Math.min(100, Math.round((100 * (passo.fatto ?? 0)) / passo.totale))}%` }} /></div>
          ) : <div className="foto-barra foto-barra-indefinita"><div /></div>}
        </div>
      )}

      <div ref={spazio} className="foto-anteprima" hidden={passo.tipo !== 'riquadro'}>
        <div className="foto-quadro" style={{ width: cornice.larghezza, height: cornice.altezza }}>
          <canvas ref={anteprima} />
          {passo.tipo === 'riquadro' && (
            <Riquadri passo={passo} foto={foto.current} cambia={(p) => setPasso(p)} />
          )}
        </div>
      </div>

      {passo.tipo === 'riquadro' && (
        <div className="foto-azioni">
          <p className="foto-nota">Tocca lo schema da leggere; trascina gli angoli per ritoccarlo.</p>
          <div className="foto-riga">
            <button type="button" className="foto-secondario" onClick={annulla}>Annulla</button>
            <button type="button" className="foto-primario"
                    onClick={() => {
                      // subito in attesa: un secondo tocco non trova più il bottone
                      const id = prossimaRichiesta++;
                      richiesta.current = id;
                      setPasso({ tipo: 'attendo', fase: 'leggo' });
                      ilPonte().invia({ tipo: 'leggi', id, riquadro: passo.riquadro });
                    }}>
              Riconosci
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Le figure trovate sopra l'anteprima: un tocco ne sceglie una, gli angoli la ritoccano. */
function Riquadri({ passo, foto, cambia }: {
  passo: Extract<Passo, { tipo: 'riquadro' }>;
  foto: { larghezza: number; altezza: number };
  cambia: (p: Passo) => void;
}) {
  const quadro = useRef<HTMLDivElement>(null);
  const angolo = useRef<number | null>(null);
  const { riquadro: r } = passo;
  const minimo = 0.03 * Math.max(foto.larghezza, foto.altezza);

  const muovi = (e: PE) => {
    if (angolo.current === null) return;
    const b = quadro.current!.getBoundingClientRect();
    const x = ((e.clientX - b.left) / b.width) * foto.larghezza;
    const y = ((e.clientY - b.top) / b.height) * foto.altezza;
    const k = angolo.current;
    const n = { ...r };
    if (k === 0 || k === 3) n.x0 = Math.max(0, Math.min(x, r.x1 - minimo)); else n.x1 = Math.min(foto.larghezza, Math.max(x, r.x0 + minimo));
    if (k === 0 || k === 1) n.y0 = Math.max(0, Math.min(y, r.y1 - minimo)); else n.y1 = Math.min(foto.altezza, Math.max(y, r.y0 + minimo));
    cambia({ ...passo, riquadro: n });
  };
  const pc = (v: number, tot: number) => `${(100 * v) / tot}%`;
  const angoli = [[r.x0, r.y0], [r.x1, r.y0], [r.x1, r.y1], [r.x0, r.y1]];

  return (
    <div ref={quadro} className="foto-sopra" onPointerMove={muovi} onPointerUp={() => { angolo.current = null; }}>
      <svg viewBox={`0 0 ${foto.larghezza} ${foto.altezza}`} preserveAspectRatio="none">
        {passo.figure.map((f, k) => k !== passo.scelta && (
          <rect key={k} x={f.riquadro.x0} y={f.riquadro.y0} width={f.riquadro.x1 - f.riquadro.x0}
                height={f.riquadro.y1 - f.riquadro.y0} className="foto-figura" vectorEffect="non-scaling-stroke"
                onClick={() => cambia({ ...passo, scelta: k, riquadro: f.riquadro })} />
        ))}
        <rect x={r.x0} y={r.y0} width={r.x1 - r.x0} height={r.y1 - r.y0} className="foto-scelta" vectorEffect="non-scaling-stroke" />
      </svg>
      {angoli.map(([x, y], k) => (
        <div key={k} className="foto-maniglia" style={{ left: pc(x, foto.larghezza), top: pc(y, foto.altezza) }}
             onPointerDown={(e) => { angolo.current = k; quadro.current!.setPointerCapture(e.pointerId); }} />
      ))}
    </div>
  );
}

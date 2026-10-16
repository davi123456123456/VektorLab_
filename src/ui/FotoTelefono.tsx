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
import { dimensioniDecodifica } from '../foto/app/decodifica.js';
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
  const anteprima = useRef<HTMLCanvasElement>(null);
  const foto = useRef({ larghezza: 1, altezza: 1 });
  const scatta = useRef<HTMLInputElement>(null);
  const galleria = useRef<HTMLInputElement>(null);
  // le richiamate in ref: l'abbonamento al worker va fatto una volta sola,
  // perché la sua pulizia fa dimenticare la foto al worker
  const fuori = useRef({ chiudi, disegnato });
  fuori.current = { chiudi, disegnato };

  useEffect(() => {
    const via = ilPonte().ascolta((r: Risposta) => {
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
      via();
      // chiudendo, in qualunque momento, il worker dimentica la foto
      ilPonte().invia({ tipo: 'dimentica' });
      const c = anteprima.current;
      if (c) { c.width = 0; c.height = 0; }
    };
  }, []);

  async function usa(file: File | undefined) {
    if (!file) return;
    setPasso({ tipo: 'attendo', fase: 'decodifico' });
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
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
      ilPonte().invia({ tipo: 'foto', dati: g.dati, larghezza, altezza }, [g.dati.buffer]);
    } catch {
      setPasso({ tipo: 'scegli', errore: 'Non riesco ad aprire questa immagine' });
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
            <div className="foto-barra"><div style={{ width: `${Math.round((100 * (passo.fatto ?? 0)) / passo.totale)}%` }} /></div>
          ) : <div className="foto-barra foto-barra-indefinita"><div /></div>}
        </div>
      )}

      <div className="foto-anteprima" hidden={passo.tipo !== 'riquadro'}>
        <canvas ref={anteprima} />
        {passo.tipo === 'riquadro' && (
          <Riquadri passo={passo} foto={foto.current} cambia={(p) => setPasso(p)} />
        )}
      </div>

      {passo.tipo === 'riquadro' && (
        <div className="foto-azioni">
          <p className="foto-nota">Tocca lo schema da leggere; trascina gli angoli per ritoccarlo.</p>
          <div className="foto-riga">
            <button type="button" className="foto-secondario" onClick={annulla}>Annulla</button>
            <button type="button" className="foto-primario"
                    onClick={() => ilPonte().invia({ tipo: 'leggi', riquadro: passo.riquadro })}>
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
  const svg = useRef<SVGSVGElement>(null);
  const angolo = useRef<number | null>(null);
  const { riquadro: r } = passo;
  const maniglia = 0.035 * Math.max(foto.larghezza, foto.altezza);

  const inFoto = (e: PE) => {
    const b = svg.current!.getBoundingClientRect();
    return { x: ((e.clientX - b.left) / b.width) * foto.larghezza, y: ((e.clientY - b.top) / b.height) * foto.altezza };
  };
  const muovi = (e: PE) => {
    if (angolo.current === null) return;
    const p = inFoto(e);
    const k = angolo.current;
    const n = { ...r };
    if (k === 0 || k === 3) n.x0 = Math.min(p.x, r.x1 - maniglia); else n.x1 = Math.max(p.x, r.x0 + maniglia);
    if (k === 0 || k === 1) n.y0 = Math.min(p.y, r.y1 - maniglia); else n.y1 = Math.max(p.y, r.y0 + maniglia);
    cambia({ ...passo, riquadro: n });
  };
  const angoli = [[r.x0, r.y0], [r.x1, r.y0], [r.x1, r.y1], [r.x0, r.y1]];

  return (
    <svg ref={svg} viewBox={`0 0 ${foto.larghezza} ${foto.altezza}`} preserveAspectRatio="none"
         onPointerMove={muovi} onPointerUp={() => { angolo.current = null; }}>
      {passo.figure.map((f, k) => k !== passo.scelta && (
        <rect key={k} x={f.riquadro.x0} y={f.riquadro.y0} width={f.riquadro.x1 - f.riquadro.x0}
              height={f.riquadro.y1 - f.riquadro.y0} className="foto-figura"
              onClick={() => cambia({ ...passo, scelta: k, riquadro: f.riquadro })} />
      ))}
      <rect x={r.x0} y={r.y0} width={r.x1 - r.x0} height={r.y1 - r.y0} className="foto-scelta" />
      {angoli.map(([x, y], k) => (
        <circle key={k} cx={x} cy={y} r={maniglia} className="foto-maniglia"
                onPointerDown={(e) => { angolo.current = k; (e.target as Element).setPointerCapture(e.pointerId); }} />
      ))}
    </svg>
  );
}

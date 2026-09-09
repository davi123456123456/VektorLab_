/**
 * Editor di una sezione parametrica.
 *
 * Si modificano le MISURE; A, I, W, S e il peso al metro si ricalcolano e si
 * mostrano in sola lettura. I profili commerciali sono PRESET che precompilano
 * i campi: dopo averli scelti, ogni misura resta liberamente modificabile —
 * un profilo tabellato è un punto di partenza, non una gabbia.
 */

import { useEffect, useMemo, useRef } from 'react';
import {
  FAMIGLIE, PRESET, contornoInterno, contornoSezione, nomePredefinito,
  parametriPredefiniti, preset, proprietaDa,
  type FamigliaParametrica, type ParametriSezione,
} from '../core/materials/sezioniParametriche.js';
import { CampoNumero, Riga, Selettore } from './Pannelli.js';

/** Millimetri senza la coda binaria della conversione da metri. */
const arrotonda = (mm: number): number => Number(mm.toFixed(3));

export function EditorSezione({ parametri, densita, onChange }: {
  parametri: ParametriSezione;
  /** densità del materiale, per il peso al metro */
  densita?: number;
  onChange: (p: ParametriSezione) => void;
}) {
  const descrizione = FAMIGLIE.find((f) => f.famiglia === parametri.famiglia)!;

  const { proprieta, errore } = useMemo(() => {
    try {
      return { proprieta: proprietaDa(parametri), errore: null as string | null };
    } catch (e) {
      return { proprieta: null, errore: (e as Error).message };
    }
  }, [parametri]);

  const presetCompatibili = PRESET.filter(
    (x) => x.parametri.famiglia === parametri.famiglia,
  );

  const cambiaMisura = (chiave: string, valore: number) => {
    onChange({ ...parametri, [chiave]: valore } as ParametriSezione);
  };

  return (
    <div className="space-y-1">
      <Riga etichetta="Forma">
        <Selettore
          valore={parametri.famiglia}
          opzioni={FAMIGLIE.map((f) => ({ valore: f.famiglia, etichetta: f.nome }))}
          onChange={(v) => onChange(parametriPredefiniti(v as FamigliaParametrica))}
        />
      </Riga>

      {presetCompatibili.length > 0 && (
        <>
          <Riga etichetta="Preset">
            <Selettore
              valore=""
              opzioni={[
                { valore: '', etichetta: '— misure libere —' },
                ...presetCompatibili.map((x) => ({ valore: x.nome, etichetta: x.nome })),
              ]}
              onChange={(v) => { if (v) onChange(preset(v)); }}
            />
          </Riga>
          <p className="px-3 text-[length:var(--t-minuto)] leading-relaxed" style={{ color: 'var(--testo-debole)' }}>
            Il preset compila i campi con le misure del profilo commerciale.
            Restano tutti modificabili.
          </p>
        </>
      )}

      {descrizione.misure.map((m) => (
        <Riga key={m.chiave} etichetta={`${m.etichetta}  ${m.simbolo}`}>
          <CampoNumero
            /*
              Il valore si ARROTONDA prima di andare nel campo. Le misure sono
              in metri e si mostrano in millimetri: 0.0062 × 1000 non fa 6.2,
              fa 6.200000000000001, e quella coda finiva dentro la casella di
              testo. Tre decimali sul millimetro sono il micrometro, che è
              oltre qualunque misura di un profilo.
            */
            valore={arrotonda(
              ((parametri as unknown as Record<string, number>)[m.chiave] ?? 0) * 1000,
            )}
            passo={1}
            suffisso="mm"
            onChange={(v) => cambiaMisura(m.chiave, v / 1000)}
          />
        </Riga>
      ))}

      {descrizione.note && (
        <p className="px-3 text-[length:var(--t-minuto)] leading-relaxed" style={{ color: 'var(--testo-debole)' }}>
          {descrizione.note}
        </p>
      )}

      {errore && (
        <div className="mx-3 rounded-[var(--raggio-controllo)] border px-2 py-1 text-[length:var(--t-minuto)]"
             style={{ borderColor: 'var(--errore)', color: 'var(--errore)' }}>
          {errore}
        </div>
      )}

      {proprieta && (
        <>
          <div className="flex justify-center py-1">
            <AnteprimaSezione parametri={parametri} />
          </div>
          <table className="numerico w-full text-[length:var(--t-minuto)]">
            <tbody style={{ color: 'var(--testo-attenuato)' }}>
              <Prop nome="A" valore={`${(proprieta.A * 1e4).toFixed(2)} cm²`} />
              <Prop nome="I_y" valore={`${(proprieta.I * 1e8).toFixed(0)} cm⁴`} />
              <Prop nome="I_z" valore={`${(proprieta.Iz * 1e8).toFixed(0)} cm⁴`} />
              {descrizione.asimmetrica ? (
                <>
                  <Prop nome="W sup" valore={`${(proprieta.Wsup * 1e6).toFixed(1)} cm³`} />
                  <Prop nome="W inf" valore={`${(proprieta.Winf * 1e6).toFixed(1)} cm³`} />
                  <Prop nome="baricentro" valore={`${(proprieta.yInf * 1000).toFixed(1)} mm dal basso`} />
                </>
              ) : (
                <Prop nome="W_y" valore={`${(proprieta.W * 1e6).toFixed(1)} cm³`} />
              )}
              <Prop nome="S_y" valore={`${(proprieta.Smax * 1e6).toFixed(1)} cm³`} />
              <Prop nome="A taglio" valore={`${(proprieta.Av * 1e4).toFixed(2)} cm²`} />
              <Prop nome="i_y" valore={`${(proprieta.i * 1000).toFixed(1)} mm`} />
              {densita !== undefined && (
                <Prop nome="peso" valore={`${(proprieta.A * densita).toFixed(1)} kg/m`} />
              )}
            </tbody>
          </table>
          <p className="px-3 pt-1 text-[length:var(--t-minuto)]" style={{ color: 'var(--testo-debole)' }}>
            Nome automatico: <b>{nomePredefinito(parametri)}</b>
          </p>
        </>
      )}
    </div>
  );
}

function Prop({ nome, valore }: { nome: string; valore: string }) {
  return (
    <tr>
      <td className="py-1 pl-3">{nome}</td>
      <td className="py-1 pr-3 text-right">{valore}</td>
    </tr>
  );
}

/** Anteprima in scala, aggiornata mentre si modificano i parametri. */
function AnteprimaSezione({ parametri }: { parametri: ParametriSezione }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const W = 130, H = 100;
    c.width = W * dpr; c.height = H * dpr;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    let esterno: { y: number; z: number }[];
    let interno: { y: number; z: number }[];
    try {
      esterno = contornoSezione(parametri);
      interno = contornoInterno(parametri);
    } catch { return; }

    const zs = esterno.map((p) => p.z), ys = esterno.map((p) => p.y);
    const dz = Math.max(...zs) - Math.min(...zs) || 1;
    const dy = Math.max(...ys) - Math.min(...ys) || 1;
    const k = Math.min((W * 0.7) / dz, (H * 0.78) / dy);
    const cx = W / 2, cy = H / 2;

    const stile = getComputedStyle(document.documentElement);
    const percorso = (punti: { y: number; z: number }[]) => {
      ctx.beginPath();
      punti.forEach((p, i) => {
        const x = cx + p.z * k, y = cy - p.y * k;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.closePath();
    };
    percorso(esterno);
    if (interno.length) percorso(interno);
    ctx.fillStyle = stile.getPropertyValue('--accento-scuro').trim() || 'var(--accento-scuro)';
    ctx.globalAlpha = 0.45;
    ctx.fill('evenodd');
    ctx.globalAlpha = 1;
    ctx.strokeStyle = stile.getPropertyValue('--accento').trim() || 'var(--accento)';
    ctx.lineWidth = 1.3;
    percorso(esterno); ctx.stroke();
    if (interno.length) { percorso(interno); ctx.stroke(); }

    // asse baricentrico: su T e L non sta a metà altezza, e si vede
    ctx.strokeStyle = stile.getPropertyValue('--testo-debole').trim() || 'var(--testo-debole)';
    ctx.setLineDash([4, 3]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(6, cy); ctx.lineTo(W - 6, cy);
    ctx.stroke();
    ctx.setLineDash([]);
  }, [parametri]);
  return <canvas ref={canvas} style={{ width: 130, height: 100 }} />;
}

export { parametriPredefiniti };

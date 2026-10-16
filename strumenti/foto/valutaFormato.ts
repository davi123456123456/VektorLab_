/**
 * Formato di `npm run foto:valuta`: la tabella stampata e le sovrapposizioni
 * SVG. Le sovrapposizioni richiamano la foto originale con un percorso
 * relativo: la foto non si copia.
 */

import type { Categoria } from '../../src/foto/confronto.js';
import type { Riconoscimento } from '../../src/foto/rete/riconosci.js';
import type { Punto } from '../../src/foto/tipi.js';

export interface RigaValuta {
  nome: string;
  meta: 'sviluppo' | 'prova' | 'sintetico';
  esito: 'ok' | 'nessunoSchema' | 'errore';
  correzioni: number;
  perfetto: boolean;
  perCategoria: Record<Categoria, { attesi: number; trovati: number; giusti: number }>;
  differenze: string[];
  avvisi: string[];
  ms: number;
}

const due = (x: number) => x.toFixed(2);

export function tabella(righe: RigaValuta[]): string {
  const out: string[] = [];
  for (const meta of ['sviluppo', 'prova', 'sintetico'] as const) {
    const r = righe.filter((x) => x.meta === meta);
    if (r.length === 0) continue;
    out.push(`\n${meta}`);
    out.push('foto   esito          correzioni  aste    vincoli  sconn.  carichi   ms');
    for (const x of r) {
      const c = (k: Categoria) => `${x.perCategoria[k].giusti}/${x.perCategoria[k].attesi}`.padEnd(8);
      out.push(`${x.nome.padEnd(7)}${x.esito.padEnd(15)}${String(x.correzioni).padEnd(12)}`
        + `${c('aste')}${c('vincoli')}${c('sconnessioni')}${c('carichi')}${x.ms}`);
    }
    const media = r.reduce((s, x) => s + x.correzioni, 0) / r.length;
    const perfetti = r.filter((x) => x.perfetto).length;
    out.push(`${meta}: media ${due(media)} correzioni, perfetti ${perfetti}/${r.length}, `
      + `schema non trovato ${r.filter((x) => x.esito !== 'ok').length}`);
  }
  return out.join('\n');
}

const n = (x: number) => String(Math.round(x * 10) / 10);

export function svg(foto: string, larghezza: number, altezza: number, r: Riconoscimento): string {
  const el: string[] = [`<image href="${foto}" width="${larghezza}" height="${altezza}"/>`];
  for (const f of r.figure) {
    el.push(`<rect class="figura" x="${n(f.x0)}" y="${n(f.y0)}" width="${n(f.x1 - f.x0)}" height="${n(f.y1 - f.y0)}" fill="none" stroke="#999" stroke-dasharray="6 4"/>`);
  }
  if (r.esito === 'ok') {
    const q = r.riquadro;
    el.push(`<rect class="riquadro" x="${n(q.x0)}" y="${n(q.y0)}" width="${n(q.x1 - q.x0)}" height="${n(q.y1 - q.y0)}" fill="none" stroke="#f80" stroke-width="2"/>`);
    const p = r.primitive;
    const { origine, scala } = r.ritaglio;
    const cx = p.larghezza / 2, cy = p.altezza / 2, c = Math.cos(r.angolo), s = Math.sin(r.angolo);
    // ritaglio (y su, raddrizzato) → foto: si rimette la rotazione, si ribalta y, si scala e si sposta
    const F = (z: Punto) => {
      const x = cx + (z.x - cx) * c - (z.y - cy) * s, y = cy + (z.x - cx) * s + (z.y - cy) * c;
      return { x: origine.x + x / scala, y: origine.y + (p.altezza - y) / scala };
    };
    const verso = (a: number) => ({ x: Math.cos(a + r.angolo), y: -Math.sin(a + r.angolo) });
    for (const a of p.aste) {
      const u = F(a.a), v = F(a.b);
      el.push(`<line class="asta" x1="${n(u.x)}" y1="${n(u.y)}" x2="${n(v.x)}" y2="${n(v.y)}" stroke="#e00" stroke-width="3"/>`);
    }
    for (const k of p.pallini) {
      const u = F(k.c);
      el.push(`<circle class="pallino" cx="${n(u.x)}" cy="${n(u.y)}" r="${n(k.r / scala)}" fill="none" stroke="#06f" stroke-width="2"/>`);
    }
    for (const k of p.corpi) {
      const u = F(k.attacco);
      el.push(`<g class="corpo"><rect x="${n(u.x - 4)}" y="${n(u.y - 4)}" width="8" height="8" fill="#00a"/>`
        + `<text x="${n(u.x + 6)}" y="${n(u.y + 14)}" font-size="12" fill="#00a">${k.tipo}</text></g>`);
    }
    for (const f of p.frecce) {
      const u = F(f.punta), d = verso(f.direzione), l = f.lunghezza / scala;
      el.push(`<line class="freccia" x1="${n(u.x - d.x * l)}" y1="${n(u.y - d.y * l)}" x2="${n(u.x)}" y2="${n(u.y)}" stroke="#080" stroke-width="2"/>`);
    }
    for (const m of p.momenti) {
      const u = F(m.centro);
      el.push(`<g class="momento"><circle cx="${n(u.x)}" cy="${n(u.y)}" r="${n(m.raggio / scala)}" fill="none" stroke="#c0a" stroke-dasharray="3 3"/>`
        + `<text x="${n(u.x)}" y="${n(u.y)}" font-size="12" fill="#c0a">${m.verso}</text></g>`);
    }
    for (const t of p.scritte) {
      const u = F(t.centro);
      const v = t.valore.famiglia === 'L' ? `${t.valore.valore}L` : t.valore.famiglia === 'altro' ? '?' : `${t.valore.coefficiente}${t.valore.famiglia}`;
      el.push(`<text class="scritta" x="${n(u.x)}" y="${n(u.y)}" font-size="13" fill="#b60">${v}</text>`);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${larghezza}" height="${altezza}" viewBox="0 0 ${larghezza} ${altezza}">\n${el.join('\n')}\n</svg>\n`;
}

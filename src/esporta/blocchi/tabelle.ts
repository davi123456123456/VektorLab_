/**
 * §3.2, §3.3, §3.4, §3.7, §3.8 — i blocchi fatti di numeri.
 *
 * Nessuno di questi calcola qualcosa: leggono ciò che il motore ha già
 * prodotto e lo mettono in colonna. Le cifre significative sono quelle
 * mostrate a schermo, e le unità stanno nell'intestazione, mai nelle celle —
 * una colonna di «12,4 kN» costa tre caratteri per riga per dire una cosa
 * sola.
 */

import type {
  RisultatoAnalisi, RisultatoCinematico,
} from '../../core/model/results.js';
import type { EsitoCoefficiente } from '../../core/checks/coefficiente.js';
import type { EsitoAutoverifiche } from '../../core/statica/autoverifiche.js';
import type { ComponenteReazione } from '../../core/statica/reazioni.js';
import type { Carico, Progetto } from '../../core/model/types.js';
import { materialePerId } from '../../core/materials/materials.js';
import { proprietaDa } from '../../core/materials/sezioniParametriche.js';
import type { Etichette } from '../../state/etichette.js';
import type { ContestoPdf } from '../contesto.js';
import type { PaletteDocumento } from '../palette.js';
import {
  paragrafo, riga, tabella, type ColonnaTabella,
} from '../disegno.js';

const f = (v: number, c = 2): string =>
  (Number.isFinite(v) ? v.toFixed(c).replace('.', ',').replace(/^-/, '−') : '—');

export interface Contesto {
  c: ContestoPdf;
  y: number;
}

export interface Comune {
  palette: PaletteDocumento;
  etichette: Etichette;
  x: number;
  larghezza: number;
  limite: number;
  nuovaPagina: () => Contesto;
}

// ═══════════════════════ §3.2 — DATI DEL MODELLO ═══════════════════════

export function bloccoDati(
  ct: Contesto, com: Comune, pr: Progetto, carichi: Carico[],
): Contesto {
  const p = com.palette;
  const L = com.larghezza;
  let { c, y } = ct;
  const avanti = (r: Contesto) => { c = r.c; y = r.y; };

  const sotto = (titolo: string) => {
    y = riga(c, titolo, com.x, y + 6, { dimensione: 9, grassetto: true, colore: p.testo });
  };

  // ── nodi ──
  sotto('Nodi');
  avanti(tabella(c, p, [
    { testo: 'nodo', larghezza: L * 0.2 },
    { testo: 'x', unita: 'm', larghezza: L * 0.2, allinea: 'right' },
    { testo: 'y', unita: 'm', larghezza: L * 0.2, allinea: 'right' },
    { testo: 'vincolo', larghezza: L * 0.4 },
  ], pr.nodi.map((n) => [
    com.etichette.nodo(n.id),
    f(n.x as unknown as number, 3),
    f(n.y as unknown as number, 3),
    n.vincolo ? `${n.vincolo.tipo}${n.vincolo.angolo ? ` a ${f((n.vincolo.angolo as unknown as number) * 180 / Math.PI, 0)}°` : ''}` : '—',
  ]), com.x, y, { limite: com.limite, nuovaPagina: com.nuovaPagina }));

  // ── aste ──
  sotto('Aste');
  avanti(tabella(c, p, [
    { testo: 'asta', larghezza: L * 0.12 },
    { testo: 'da', larghezza: L * 0.14 },
    { testo: 'a', larghezza: L * 0.14 },
    { testo: 'lunghezza', unita: 'm', larghezza: L * 0.16, allinea: 'right' },
    { testo: 'inclinazione', unita: '°', larghezza: L * 0.14, allinea: 'right' },
    { testo: 'materiale', larghezza: L * 0.15 },
    { testo: 'sezione', larghezza: L * 0.15 },
  ], pr.aste.map((a) => {
    const i = pr.nodi.find((n) => n.id === a.nodoIniziale);
    const j = pr.nodi.find((n) => n.id === a.nodoFinale);
    const dx = ((j?.x ?? 0) as unknown as number) - ((i?.x ?? 0) as unknown as number);
    const dy = ((j?.y ?? 0) as unknown as number) - ((i?.y ?? 0) as unknown as number);
    return [
      com.etichette.asta(a.id),
      i ? com.etichette.nodo(i.id) : '—',
      j ? com.etichette.nodo(j.id) : '—',
      f(Math.hypot(dx, dy), 3),
      f((Math.atan2(dy, dx) * 180) / Math.PI, 1),
      String(a.materialeId),
      String(a.sezioneId),
    ];
  }), com.x, y, { limite: com.limite, nuovaPagina: com.nuovaPagina }));

  // ── materiali ──
  const usati = [...new Set(pr.aste.map((a) => String(a.materialeId)))];
  sotto('Materiali');
  avanti(tabella(c, p, [
    { testo: 'materiale', larghezza: L * 0.3 },
    { testo: 'E', unita: 'GPa', larghezza: L * 0.15, allinea: 'right' },
    { testo: 'ν', larghezza: L * 0.13, allinea: 'right' },
    { testo: 'ρ', unita: 'kg/m³', larghezza: L * 0.17, allinea: 'right' },
    { testo: 'S_y', unita: 'MPa', larghezza: L * 0.15, allinea: 'right' },
    { testo: 'γ_M', larghezza: L * 0.1, allinea: 'right' },
  ], usati.map((id) => {
    const m = [...pr.materialiPersonalizzati].find((x) => String(x.id) === id)
      ?? materialePerId(id as never);
    // il campo che il §3.2 chiama S_y: nel modello sta in `resistenze.fy`
    const sy = m?.resistenze?.fy as unknown as number | undefined;
    return [
      m?.nome ?? id,
      f((m?.E ?? 0) / 1e9, 0),
      f((m?.nu as unknown as number) ?? 0, 2),
      f((m?.rho as unknown as number) ?? 0, 0),
      sy !== undefined && Number.isFinite(sy) ? f(sy / 1e6, 0) : '—',
      f(m?.gammaM ?? 1, 2),
    ];
  }), com.x, y, { limite: com.limite, nuovaPagina: com.nuovaPagina }));

  // ── sezioni ──
  const sezioniUsate = [...new Set(pr.aste.map((a) => String(a.sezioneId)))];
  sotto('Sezioni');
  avanti(tabella(c, p, [
    { testo: 'sezione', larghezza: L * 0.24 },
    { testo: 'forma', larghezza: L * 0.2 },
    { testo: 'A', unita: 'mm²', larghezza: L * 0.16, allinea: 'right' },
    { testo: 'I', unita: 'mm⁴', larghezza: L * 0.18, allinea: 'right' },
    { testo: 'W', unita: 'cm³', larghezza: L * 0.14, allinea: 'right' },
    { testo: 'h', unita: 'mm', larghezza: L * 0.08, allinea: 'right' },
  ], sezioniUsate.map((id) => {
    const s = pr.sezioniPersonalizzate.find((x) => String(x.id) === id);
    if (!s?.parametri) return [id, '—', '—', '—', '—', '—'];
    const q = proprietaDa(s.parametri);
    return [
      s.nome ?? id,
      s.parametri.famiglia,
      f(q.A * 1e6, 0),
      (q.I * 1e12).toExponential(2).replace('.', ','),
      f(q.W * 1e9, 1),
      f(q.H * 1e3, 0),
    ];
  }), com.x, y, { limite: com.limite, nuovaPagina: com.nuovaPagina }));

  // ── carichi ──
  sotto('Carichi');
  const descrizione = (k: Carico): string[] => {
    switch (k.tipo) {
      case 'forzaNodale': return ['forza nodale',
        com.etichette.nodo(k.nodoId),
        `${f((k.fx as unknown as number) / 1e3, 2)} ; ${f((k.fy as unknown as number) / 1e3, 2)}`, 'kN'];
      case 'momentoNodale': return ['momento nodale',
        com.etichette.nodo(k.nodoId), f((k.mz as unknown as number) / 1e3, 2), 'kNm'];
      case 'distribuito': return ['distribuito',
        `${com.etichette.asta(k.astaId)}  s ${f(k.sIniziale, 2)}…${f(k.sFinale, 2)}`,
        Math.abs((k.q1 as unknown as number) - (k.q2 as unknown as number)) < 1e-9
          ? f((k.q1 as unknown as number) / 1e3, 2)
          : `${f((k.q1 as unknown as number) / 1e3, 2)} → ${f((k.q2 as unknown as number) / 1e3, 2)}`,
        `kN/m ${k.direzione.modo}`];
      case 'forzaInCampata': return ['forza in campata',
        `${com.etichette.asta(k.astaId)}  s ${f(k.s, 2)}`,
        `${f((k.fx as unknown as number) / 1e3, 2)} ; ${f((k.fy as unknown as number) / 1e3, 2)}`,
        `kN ${k.riferimento}`];
      case 'momentoInCampata': return ['momento in campata',
        `${com.etichette.asta(k.astaId)}  s ${f(k.s, 2)}`,
        f((k.mz as unknown as number) / 1e3, 2), 'kNm'];
      case 'termico': return ['termico', com.etichette.asta(k.astaId),
        `${f(k.deltaTUniforme as unknown as number, 1)} ; ${f(k.deltaTGradiente as unknown as number, 1)}`, '°C'];
      case 'cedimento': return ['cedimento', com.etichette.nodo(k.nodoId),
        `${f((k.ux as unknown as number) * 1e3, 2)} ; ${f((k.uy as unknown as number) * 1e3, 2)}`, 'mm'];
    }
  };
  if (carichi.length === 0) {
    y = riga(c, 'Nessun carico nel caso corrente.', com.x, y + 4,
      { dimensione: 8, colore: p.testoAttenuato });
  } else {
    avanti(tabella(c, p, [
      { testo: 'tipo', larghezza: L * 0.26 },
      { testo: 'posizione', larghezza: L * 0.28 },
      { testo: 'valore', larghezza: L * 0.26, allinea: 'right' },
      { testo: 'unità e riferimento', larghezza: L * 0.2 },
    ], carichi.map(descrizione), com.x, y,
    { limite: com.limite, nuovaPagina: com.nuovaPagina }));
  }
  return { c, y };
}

// ═══════════════════════ §3.3 — CLASSIFICAZIONE CINEMATICA ═══════════════════════

export function bloccoCinematica(
  ct: Contesto, com: Comune, k: RisultatoCinematico,
): Contesto {
  const p = com.palette;
  const L = com.larghezza;
  const righe: [string, string][] = [
    ['corpi rigidi', `n = ${k.numeroCorpi}`],
    ['gradi di libertà', `3n = ${k.gradiLiberta}`],
    ['gradi di vincolo esterni', String(k.gradiVincoloEsterni)],
    ['gradi di vincolo interni', String(k.gradiVincoloInterni)],
    ['gradi di vincolo totali', `v = ${k.gradiVincolo}`],
    ['rango della matrice cinematica', `r = ${k.rango}`],
    ['labilità', `3n − r = ${k.labilita}`],
    ['iperstaticità', `v − r = ${k.iperstaticita}`],
  ];
  if (k.anelliChiusi > 0) {
    righe.push(['anelli chiusi', String(k.anelliChiusi)]);
    righe.push(['iperstaticità interna', `3 · anelli = ${k.iperstaticitaInterna}`]);
  }

  const out = tabella(ct.c, p, [
    { testo: 'grandezza', larghezza: L * 0.62 },
    { testo: 'valore', larghezza: L * 0.38, allinea: 'right' },
  ], righe.map(([a, b]) => [a, b]), com.x, ct.y,
  { limite: com.limite, nuovaPagina: com.nuovaPagina });

  const c = out.c;
  const colore = k.classificazione === 'isostatica' ? p.ok
    : k.classificazione.includes('labile') ? p.errore : p.avviso;
  let y = out.y + 6;
  c.grassetto = true;
  c.dimensione = 10;
  c.fillStyle = colore;
  c.allineamento = 'left';
  c.base = 'alphabetic';
  c.fillText(`Struttura ${k.classificazione.toUpperCase()}`, com.x, y + 8);
  c.grassetto = false;
  y += 16;

  if (k.diagnosi.length > 0) {
    for (const d of k.diagnosi.slice(0, 6)) {
      y = paragrafo(c, `· ${d.messaggio}`, com.x, y + 4, L,
        { dimensione: 7.6, colore: d.gravita === 'errore' ? p.errore : p.testoAttenuato });
    }
  }
  return { c, y };
}

// ═══════════════════════ §3.4 — REAZIONI ═══════════════════════

export function tabellaReazioni(
  ct: Contesto, com: Comune, r: RisultatoAnalisi, componenti: ComponenteReazione[],
): Contesto {
  const p = com.palette;
  const L = com.larghezza;

  const vincolati = r.reazioni.filter(
    (x) => Math.abs(x.fx) + Math.abs(x.fy) + Math.abs(x.mz) > 1e-9,
  );
  const colonne: ColonnaTabella[] = [
    { testo: 'nodo', larghezza: L * 0.18 },
    { testo: 'Rx', unita: 'kN', larghezza: L * 0.16, allinea: 'right' },
    { testo: 'Ry', unita: 'kN', larghezza: L * 0.16, allinea: 'right' },
    { testo: 'M', unita: 'kNm', larghezza: L * 0.16, allinea: 'right' },
    { testo: 'modulo', unita: 'kN', larghezza: L * 0.17, allinea: 'right' },
    { testo: 'angolo', unita: '°', larghezza: L * 0.17, allinea: 'right' },
  ];
  const righe = vincolati.map((x) => {
    const modulo = Math.hypot(x.fx, x.fy);
    return [
      com.etichette.nodo(x.nodoId),
      f(x.fx / 1e3, 2), f(x.fy / 1e3, 2), f(x.mz / 1e3, 2),
      f(modulo / 1e3, 2),
      modulo > 1e-9 ? f((Math.atan2(x.fy, x.fx) * 180) / Math.PI, 1) : '—',
    ];
  });

  let out = tabella(ct.c, p, colonne, righe, com.x, ct.y,
    { limite: com.limite, nuovaPagina: com.nuovaPagina });

  /*
   * LE COMPONENTI DECOMPOSTE, quando il vincolo ne esplica una sola.
   *
   * Un carrello dà una reazione in una direzione sola, e mostrarla come coppia
   * Rx/Ry costringe il lettore a ricomporla per capire che è una freccia unica.
   * Questa tabella dice che cosa ciascun vincolo può davvero esplicare.
   */
  if (componenti.length > 0) {
    let y = riga(out.c, 'Componenti secondo la natura di ciascun vincolo',
      com.x, out.y + 8, { dimensione: 9, grassetto: true, colore: p.testo });
    out = tabella(out.c, p, [
      { testo: 'nodo', larghezza: L * 0.22 },
      { testo: 'vincolo', larghezza: L * 0.28 },
      { testo: 'componente', larghezza: L * 0.28 },
      { testo: 'valore', unita: 'kN o kNm', larghezza: L * 0.22, allinea: 'right' },
    ], componenti.map((x) => [
      com.etichette.nodo(x.nodoId as never),
      x.tipo,
      String(x.componente),
      f(x.valore / 1e3, 2),
    ]), com.x, y, { limite: com.limite, nuovaPagina: com.nuovaPagina });
  }

  // ── verifica di equilibrio globale, che è già stata fatta dal motore ──
  const e = r.equilibrio;
  const y = riga(out.c,
    `Equilibrio globale: ΣFx = ${f(e.sommaFx / 1e3, 3)} kN · `
    + `ΣFy = ${f(e.sommaFy / 1e3, 3)} kN · ΣMz = ${f(e.sommaMz / 1e3, 3)} kNm`,
    com.x, out.y + 8, { dimensione: 7.6, colore: e.soddisfatto ? p.ok : p.errore });
  return { c: out.c, y };
}

// ═══════════════════════ §3.7 — COEFFICIENTE DI SICUREZZA ═══════════════════════

/**
 * Sostituisce gli id interni delle aste con le etichette visibili.
 *
 * Gli id non ripartono da uno quando il modello si svuota — è la regola
 * dell'iterazione 11 §1 — e quindi non coincidono con ciò che l'utente legge.
 * I passaggi arrivano dal modulo di calcolo con dentro gli id: qui si
 * traducono, senza toccare i numeri.
 */
function conEtichette(testo: string, com: Comune): string {
  return testo.replace(/\ba\d+\b/g, (id) => {
    const e = com.etichette.asta(id as never);
    return e || id;
  });
}

export function bloccoCoefficiente(
  ct: Contesto, com: Comune, e: EsitoCoefficiente,
): Contesto {
  const p = com.palette;
  const L = com.larghezza;
  let { c, y } = ct;

  if (!e.disponibile) {
    for (const err of e.errori) {
      y = paragrafo(c, err.messaggio, com.x, y + 6, L,
        { dimensione: 8, colore: p.errore });
    }
    return { c, y };
  }

  const sc = e.massimaTensione ?? e.massimoMomento;
  if (sc) {
    y = paragrafo(c,
      `Sezione critica: asta ${com.etichette.asta(sc.astaId as never)}, `
      + `ascissa x = ${f(sc.x, 3)} m${sc.lato ? ` (lato ${sc.lato})` : ''}. `
      + `In quella sezione N = ${f(sc.N / 1e3, 2)} kN, T = ${f(sc.T / 1e3, 2)} kN, `
      + `M = ${f(sc.M / 1e3, 2)} kNm. `
      + (e.coincidono
        ? 'Il massimo momento e la massima tensione cadono nella stessa sezione.'
        : 'Attenzione: la massima tensione NON cade dove il momento è massimo.'),
      com.x, y + 6, L, { dimensione: 8, colore: p.testoAttenuato });

    /*
     * Quando le due sezioni non coincidono si riporta ANCHE quella del massimo
     * momento, che è il numero che si cerca per primo e che lo schermo mostra
     * accanto all'altro: dare solo la sezione di massima tensione lascerebbe
     * il lettore a chiedersi dove sia finito il momento massimo.
     */
    if (!e.coincidono && e.massimoMomento) {
      const mm = e.massimoMomento;
      y = paragrafo(c,
        `Massimo momento: asta ${com.etichette.asta(mm.astaId as never)}, `
        + `x = ${f(mm.x, 3)} m, M = ${f(mm.M / 1e3, 2)} kNm.`,
        com.x, y + 2, L, { dimensione: 8, colore: p.testoAttenuato });
    }
  }

  /*
   * I CINQUE PASSAGGI, come sullo schermo.
   *
   * Due accorgimenti. Gli id interni delle aste vanno tradotti nelle etichette
   * visibili: il modulo di calcolo lavora sugli id e scrive «a5» dove il resto
   * del documento dice «a2», e un lettore non ha modo di sapere che sono la
   * stessa asta. E un passaggio non si spezza: titolo e righe restano insieme,
   * o si legge un titolo in fondo a una pagina e i suoi numeri nell'altra.
   */
  for (const passo of e.passi) {
    const serve = 16 + passo.righe.length * 14 + 16;
    if (y + serve > com.limite) { const n = com.nuovaPagina(); c = n.c; y = n.y; }
    y = riga(c, `${passo.numero}. ${passo.titolo}`, com.x, y + 8,
      { dimensione: 8.6, grassetto: true, colore: p.testo });
    const out = tabella(c, p, [
      { testo: 'formula', larghezza: L * 0.58 },
      { testo: 'valore', larghezza: L * 0.42, allinea: 'right' },
    ], passo.righe.map((r) => [
      conEtichette(r.formula, com), conEtichette(r.valore, com),
    ]), com.x, y,
    { limite: com.limite, nuovaPagina: com.nuovaPagina, dimensione: 7.4 });
    c = out.c; y = out.y;
  }

  // ── l'esito, in evidenza ──
  const passa = e.verificato;
  const colore = passa ? p.ok : p.errore;
  const testo = `C.S. = ${f(e.coefficiente, 2)} — ${passa ? 'verificato' : 'NON verificato'}`;
  c.strokeStyle = colore;
  c.lineWidth = 1;
  c.setLineDash([]);
  c.strokeRect(com.x, y + 6, L, 22);
  c.grassetto = true;
  c.dimensione = 11;
  c.fillStyle = colore;
  c.allineamento = 'center';
  c.base = 'middle';
  c.fillText(testo, com.x + L / 2, y + 17);
  c.grassetto = false;
  c.allineamento = 'left';
  c.base = 'alphabetic';
  y += 34;

  if (e.compressa) {
    y = paragrafo(c,
      'L\'asta critica è compressa: la verifica di resistenza non basta, '
      + 'la stabilità va controllata a parte.',
      com.x, y + 2, L, { dimensione: 7.6, colore: p.avviso });
  }
  return { c, y };
}

// ═══════════════════════ §3.8 — DIAGNOSTICA ═══════════════════════

export function bloccoDiagnostica(
  ct: Contesto, com: Comune, a: EsitoAutoverifiche,
): Contesto {
  const p = com.palette;
  const L = com.larghezza;
  const out = tabella(ct.c, p, [
    { testo: 'verifica', larghezza: L * 0.42 },
    { testo: 'esito', larghezza: L * 0.14 },
    { testo: 'scarto', larghezza: L * 0.16, allinea: 'right' },
    { testo: 'tolleranza', larghezza: L * 0.16, allinea: 'right' },
    { testo: 'esaminati', larghezza: L * 0.12, allinea: 'right' },
  ], a.verifiche.map((v) => [
    v.descrizione,
    v.superata ? 'passata' : 'FALLITA',
    v.scarto.toExponential(2).replace('.', ','),
    v.tolleranza.toExponential(1).replace('.', ','),
    String((v as { esaminati?: number }).esaminati ?? '—'),
  ]), com.x, ct.y, {
    limite: com.limite, nuovaPagina: com.nuovaPagina, dimensione: 7.2,
    evidenzia: (i) => (a.verifiche[i]?.superata ? null : '#ffe9e7'),
  });

  const y = riga(out.c,
    a.tutteSuperate
      ? 'Tutte le autoverifiche sono state superate.'
      : 'Alcune autoverifiche NON sono state superate: i risultati vanno letti con cautela.',
    com.x, out.y + 6,
    { dimensione: 8, colore: a.tutteSuperate ? p.ok : p.errore, grassetto: !a.tutteSuperate });
  return { c: out.c, y };
}

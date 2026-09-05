/**
 * §0.1 — I MODELLI DI RIFERIMENTO DELLA LINEA DI BASE.
 *
 * Sono presi dal catalogo dell'iterazione 10 §10.1 e servono a un solo scopo:
 * fotografare i risultati PRIMA di un'iterazione di sola interfaccia, per poter
 * dimostrare alla fine che nessun numero è cambiato.
 *
 * REGOLA: questo file è congelato. Aggiungere un modello va bene — invalida
 * solo il suo file JSON, che va rigenerato — ma MODIFICARNE uno esistente
 * cambia la linea di base e ne annulla il valore di prova. Se un modello
 * dev'essere corretto, va detto esplicitamente e la sua istantanea rigenerata
 * con la ragione scritta nel commit.
 *
 * I nomi sono usati come nome del file JSON: vanno tenuti stabili.
 */

import { progetto } from '../../src/core/builder.js';
import { preset } from '../../src/core/materials/sezioniParametriche.js';
import type { ParametriSezione, Progetto } from '../../src/core/index.js';

const IPE300 = preset('IPE 300');
const HEA200 = preset('HEA 200');
const TUBO: ParametriSezione = { famiglia: 'circolareCava', D: 0.1937, s: 0.008 };

export interface ModelloDiRiferimento {
  /** stabile: dà il nome al file JSON */
  nome: string;
  /** che cosa questo modello mette alla prova, e perché sta nell'elenco */
  scopo: string;
  progetto: Progetto;
}

// ── 1. mensola con forza in punta ────────────────────────────────────
function mensolaForza(): Progetto {
  const p = progetto('mensola-forza');
  const s = p.sezioneParametrica('s', IPE300);
  const a = p.nodo(0, 0), b = p.nodo(3, 0);
  p.asta(a, b, 'S275', s, { teoria: 'eulero-bernoulli' });
  p.vincolo(a, 'incastro');
  p.forza(b, 0, -12e3);
  return p.costruisci();
}

// ── 2. mensola con carico distribuito ────────────────────────────────
function mensolaDistribuito(): Progetto {
  const p = progetto('mensola-distribuito');
  const s = p.sezioneParametrica('s', IPE300);
  const a = p.nodo(0, 0), b = p.nodo(4, 0);
  const el = p.asta(a, b, 'S275', s, { teoria: 'eulero-bernoulli' });
  p.vincolo(a, 'incastro');
  p.distribuito(el, -8e3);
  return p.costruisci();
}

// ── 3. appoggiata con distribuito ────────────────────────────────────
function appoggiataDistribuito(): Progetto {
  const p = progetto('appoggiata-distribuito');
  const s = p.sezioneParametrica('s', IPE300);
  const a = p.nodo(0, 0), b = p.nodo(6, 0);
  const el = p.asta(a, b, 'S275', s, { teoria: 'eulero-bernoulli' });
  p.vincolo(a, 'cerniera'); p.vincolo(b, 'carrello');
  p.distribuito(el, -10e3);
  return p.costruisci();
}

// ── 4. appoggiata con forza fuori mezzeria ───────────────────────────
function appoggiataForzaEccentrica(): Progetto {
  const p = progetto('appoggiata-forza-eccentrica');
  const s = p.sezioneParametrica('s', IPE300);
  const a = p.nodo(0, 0), b = p.nodo(5, 0);
  const el = p.asta(a, b, 'S275', s, { teoria: 'eulero-bernoulli' });
  p.vincolo(a, 'cerniera'); p.vincolo(b, 'carrello');
  // s = 0.37: un'ascissa che non è una frazione tonda, così un errore
  // di indicizzazione non si nasconde dietro la simmetria
  p.forzaInCampata(el, 0.37, 0, -25e3, 'globale');
  return p.costruisci();
}

// ── 5. trave con sbalzo ──────────────────────────────────────────────
function traveConSbalzo(): Progetto {
  const p = progetto('trave-con-sbalzo');
  const s = p.sezioneParametrica('s', IPE300);
  const a = p.nodo(0, 0), b = p.nodo(4, 0), c = p.nodo(6, 0);
  const e1 = p.asta(a, b, 'S275', s, { teoria: 'eulero-bernoulli' });
  const e2 = p.asta(b, c, 'S275', s, { teoria: 'eulero-bernoulli' });
  p.vincolo(a, 'cerniera'); p.vincolo(b, 'carrello');
  p.distribuito(e1, -9e3); p.distribuito(e2, -9e3);
  p.forza(c, 0, -5e3);
  return p.costruisci();
}

// ── 6. Gerber a due campate ──────────────────────────────────────────
function gerber(): Progetto {
  const p = progetto('gerber');
  const s = p.sezioneParametrica('s', IPE300);
  const a = p.nodo(0, 0), b = p.nodo(6, 0), c = p.nodo(12, 0);
  const e1 = p.asta(a, b, 'S275', s, { teoria: 'eulero-bernoulli' });
  const e2 = p.asta(b, c, 'S275', s, { teoria: 'eulero-bernoulli' });
  p.vincolo(a, 'incastro'); p.vincolo(c, 'cerniera');
  p.sconnessione(e1, 0.7, 'cerniera');
  p.distribuito(e1, -7e3); p.distribuito(e2, -7e3);
  return p.costruisci();
}

// ── 7. arco a tre cerniere ───────────────────────────────────────────
function arcoTreCerniere(): Progetto {
  const p = progetto('arco-tre-cerniere');
  const s = p.sezioneParametrica('s', HEA200);
  const a = p.nodo(0, 0), c = p.nodo(4, 3), b = p.nodo(8, 0);
  p.asta(a, c, 'S275', s); p.asta(c, b, 'S275', s);
  p.vincolo(a, 'cerniera'); p.vincolo(b, 'cerniera');
  p.sconnessioneNodale(c, 'cerniera');
  p.forza(c, 0, -30e3);
  return p.costruisci();
}

// ── 8. portale incastrato al piede ───────────────────────────────────
function portale(): Progetto {
  const p = progetto('portale');
  const s = p.sezioneParametrica('s', HEA200);
  const ps = p.nodo(0, 0), ts = p.nodo(0, 4);
  const td = p.nodo(6, 4), pd = p.nodo(6, 0);
  p.asta(ps, ts, 'S275', s);
  const tr = p.asta(ts, td, 'S275', s);
  p.asta(td, pd, 'S275', s);
  p.vincolo(ps, 'incastro'); p.vincolo(pd, 'incastro');
  p.distribuito(tr, -15e3);
  p.forza(ts, 8e3, 0);
  return p.costruisci();
}

// ── 9. portale a tre cerniere ────────────────────────────────────────
function portaleTreCerniere(): Progetto {
  const p = progetto('portale-tre-cerniere');
  const s = p.sezioneParametrica('s', HEA200);
  const ps = p.nodo(0, 0), ts = p.nodo(0, 4);
  const m = p.nodo(3, 4), td = p.nodo(6, 4), pd = p.nodo(6, 0);
  p.asta(ps, ts, 'S275', s);
  const t1 = p.asta(ts, m, 'S275', s);
  const t2 = p.asta(m, td, 'S275', s);
  p.asta(td, pd, 'S275', s);
  p.vincolo(ps, 'cerniera'); p.vincolo(pd, 'cerniera');
  p.sconnessioneNodale(m, 'cerniera');
  p.distribuito(t1, -12e3); p.distribuito(t2, -12e3);
  return p.costruisci();
}

// ── 10. telaio a L, piega a 90°, saldato ─────────────────────────────
function telaioL(): Progetto {
  const p = progetto('telaio-l');
  const s = p.sezioneParametrica('s', HEA200);
  const a = p.nodo(0, 0), g = p.nodo(0, 3), b = p.nodo(4, 3);
  p.asta(a, g, 'S275', s);
  const or = p.asta(g, b, 'S275', s);
  p.vincolo(a, 'incastro');
  p.distribuito(or, -11e3);
  p.forza(b, 6e3, 0);
  return p.costruisci();
}

// ── 11. telaio a L con cerniera interna nella piega ──────────────────
function telaioLCerniera(): Progetto {
  const p = progetto('telaio-l-cerniera');
  const s = p.sezioneParametrica('s', HEA200);
  const a = p.nodo(0, 0), g = p.nodo(0, 3), b = p.nodo(4, 3);
  p.asta(a, g, 'S275', s);
  const or = p.asta(g, b, 'S275', s);
  p.vincolo(a, 'incastro'); p.vincolo(b, 'carrello');
  p.sconnessioneNodale(g, 'cerniera');
  p.distribuito(or, -11e3);
  return p.costruisci();
}

// ── 12. pilastro con carico orizzontale distribuito ──────────────────
function pilastroVento(): Progetto {
  const p = progetto('pilastro-vento');
  const s = p.sezioneParametrica('s', HEA200);
  const a = p.nodo(0, 0), b = p.nodo(0, 5);
  const el = p.asta(a, b, 'S275', s);
  p.vincolo(a, 'incastro');
  p.distribuito(el, 3.5e3, { modo: 'globaleX' });
  return p.costruisci();
}

// ── 13. asta inclinata, angolo non notevole, carico obliquo ──────────
function astaInclinata(): Progetto {
  const p = progetto('asta-inclinata');
  const s = p.sezioneParametrica('s', TUBO);
  // 3-4-5 ruotato di un angolo qualunque: nessun seno o coseno tondo
  const a = p.nodo(0, 0), b = p.nodo(3.7, 2.3);
  const el = p.asta(a, b, 'S275', s);
  p.vincolo(a, 'cerniera'); p.vincolo(b, 'carrello', Math.PI / 7);
  p.distribuito(el, -6e3);
  p.forza(b, 4e3, -2e3);
  return p.costruisci();
}

// ── 14. capriata reticolare, aste incernierate ───────────────────────
function capriata(): Progetto {
  const p = progetto('capriata');
  const s = p.sezioneParametrica('s', TUBO);
  const b = { svincoloIniziale: { M: true }, svincoloFinale: { M: true } };
  const n1 = p.nodo(0, 0), n2 = p.nodo(2, 0), n3 = p.nodo(4, 0);
  const n4 = p.nodo(6, 0), n5 = p.nodo(8, 0);
  const m1 = p.nodo(2, 1.5), m2 = p.nodo(4, 2.2), m3 = p.nodo(6, 1.5);
  for (const [i, j] of [[n1, n2], [n2, n3], [n3, n4], [n4, n5],
                        [n1, m1], [m1, m2], [m2, m3], [m3, n5],
                        [n2, m1], [n3, m1], [n3, m2], [n3, m3], [n4, m3]] as const) {
    p.asta(i, j, 'S275', s, b);
  }
  p.vincolo(n1, 'cerniera'); p.vincolo(n5, 'carrello');
  p.forza(m1, 0, -14e3); p.forza(m2, 0, -20e3); p.forza(m3, 0, -14e3);
  return p.costruisci();
}

// ── 15. telaio a due campate e due piani: oltre dieci aste ───────────
function telaioDuePiani(): Progetto {
  const p = progetto('telaio-due-piani');
  const s = p.sezioneParametrica('s', HEA200);
  const q = (x: number, y: number) => p.nodo(x, y);
  const b0 = [q(0, 0), q(5, 0), q(10, 0)];
  const b1 = [q(0, 3.5), q(5, 3.5), q(10, 3.5)];
  const b2 = [q(0, 7), q(5, 7), q(10, 7)];
  for (let k = 0; k < 3; k++) {
    p.asta(b0[k], b1[k], 'S275', s);
    p.asta(b1[k], b2[k], 'S275', s);
  }
  const travi = [
    p.asta(b1[0], b1[1], 'S275', s), p.asta(b1[1], b1[2], 'S275', s),
    p.asta(b2[0], b2[1], 'S275', s), p.asta(b2[1], b2[2], 'S275', s),
  ];
  for (const n of b0) p.vincolo(n, 'incastro');
  for (const t of travi) p.distribuito(t, -18e3);
  p.forza(b1[0], 20e3, 0); p.forza(b2[0], 30e3, 0);
  return p.costruisci();
}

// ── 16. trave continua su tre appoggi: iperstatica ───────────────────
function traveContinua(): Progetto {
  const p = progetto('trave-continua');
  const s = p.sezioneParametrica('s', IPE300);
  const a = p.nodo(0, 0), b = p.nodo(5, 0), c = p.nodo(10, 0);
  const e1 = p.asta(a, b, 'S275', s, { teoria: 'eulero-bernoulli' });
  const e2 = p.asta(b, c, 'S275', s, { teoria: 'eulero-bernoulli' });
  p.vincolo(a, 'cerniera'); p.vincolo(b, 'carrello'); p.vincolo(c, 'carrello');
  p.distribuito(e1, -14e3); p.distribuito(e2, -14e3);
  return p.costruisci();
}

// ── 17. carrello inclinato e momento concentrato ─────────────────────
function carrelloInclinato(): Progetto {
  const p = progetto('carrello-inclinato');
  const s = p.sezioneParametrica('s', IPE300);
  const a = p.nodo(0, 0), b = p.nodo(4.5, 0);
  const el = p.asta(a, b, 'S275', s);
  p.vincolo(a, 'cerniera');
  p.vincolo(b, 'carrello', Math.PI / 5);
  p.momentoInCampata(el, 0.4, 18e3);
  p.distribuito(el, -5e3);
  return p.costruisci();
}

// ── 18. sezione a T, asimmetrica: y_max diverso sopra e sotto ────────
function mensolaSezioneT(): Progetto {
  const p = progetto('mensola-sezione-t');
  const s = p.sezioneParametrica('s', {
    famiglia: 'aT', H: 0.2, B: 0.15, s1: 0.012, s2: 0.01,
  });
  const a = p.nodo(0, 0), b = p.nodo(2.5, 0);
  const el = p.asta(a, b, 'S275', s, { teoria: 'eulero-bernoulli' });
  p.vincolo(a, 'incastro');
  p.distribuito(el, -4e3);
  p.forza(b, -30e3, 0);
  return p.costruisci();
}

export const MODELLI: ModelloDiRiferimento[] = [
  { nome: 'mensola-forza', scopo: 'M lineare, T costante: il caso più semplice', progetto: mensolaForza() },
  { nome: 'mensola-distribuito', scopo: 'M parabolico su schema isostatico', progetto: mensolaDistribuito() },
  { nome: 'appoggiata-distribuito', scopo: 'la parabola simmetrica di riferimento', progetto: appoggiataDistribuito() },
  { nome: 'appoggiata-forza-eccentrica', scopo: 'discontinuità di T fuori dalla mezzeria', progetto: appoggiataForzaEccentrica() },
  { nome: 'trave-con-sbalzo', scopo: 'momento negativo sull appoggio, due aste', progetto: traveConSbalzo() },
  { nome: 'gerber', scopo: 'sconnessione in campata: M nullo dove sta la cerniera', progetto: gerber() },
  { nome: 'arco-tre-cerniere', scopo: 'spinta orizzontale, aste inclinate', progetto: arcoTreCerniere() },
  { nome: 'portale', scopo: 'telaio iperstatico con nodi rigidi', progetto: portale() },
  { nome: 'portale-tre-cerniere', scopo: 'telaio isostatico con sconnessione nodale', progetto: portaleTreCerniere() },
  { nome: 'telaio-l', scopo: 'piega a 90° saldata: il caso del §5', progetto: telaioL() },
  { nome: 'telaio-l-cerniera', scopo: 'stessa piega con cerniera interna', progetto: telaioLCerniera() },
  { nome: 'pilastro-vento', scopo: 'asta verticale, carico globaleX', progetto: pilastroVento() },
  { nome: 'asta-inclinata', scopo: 'angolo non notevole, carrello ruotato', progetto: astaInclinata() },
  { nome: 'capriata', scopo: 'reticolare a tredici aste, solo sforzo normale', progetto: capriata() },
  { nome: 'telaio-due-piani', scopo: 'dieci aste e oltre, molto iperstatico', progetto: telaioDuePiani() },
  { nome: 'trave-continua', scopo: 'iperstatica: le reazioni vengono dal FEM', progetto: traveContinua() },
  { nome: 'carrello-inclinato', scopo: 'vincolo orientato e momento concentrato', progetto: carrelloInclinato() },
  { nome: 'mensola-sezione-t', scopo: 'sezione asimmetrica: asse neutro fuori mezzeria', progetto: mensolaSezioneT() },
];

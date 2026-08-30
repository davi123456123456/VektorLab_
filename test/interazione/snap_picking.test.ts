import { describe, it, expect } from 'vitest';
import { progetto } from '../../src/core/builder.js';
import { cameraIniziale, mondoASchermo } from '../../src/render/camera.js';
import { calcolaSnap, SNAP_PREDEFINITO } from '../../src/render/snap.js';
import { passoGriglia } from '../../src/render/grid.js';
import { catenaCollineare, colpisci, dentroRiquadro } from '../../src/render/picking.js';
import type { Progetto } from '../../src/core/model/types.js';

const cam = { ...cameraIniziale(1000, 600), cx: 3, cy: 2, zoom: 60 };

function telaio(): Progetto {
  const p = progetto('telaio');
  const a = p.nodo(0, 0);
  const b = p.nodo(0, 4);
  const c = p.nodo(6, 4);
  const d = p.nodo(6, 0);
  p.asta(a, b, 'S275', 'IPE 300');
  p.asta(b, c, 'S275', 'IPE 300');
  p.asta(c, d, 'S275', 'IPE 300');
  return p.costruisci();
}

/** Coordinate schermo di un punto del mondo, con un piccolo scostamento in pixel. */
const vicino = (x: number, y: number, dx = 0, dy = 0) => {
  const s = mondoASchermo(cam, { x, y });
  return { x: s.x + dx, y: s.y + dy };
};

describe('aggancio', () => {
  const p = telaio();

  it('aggancia i nodi esistenti con priorità massima', () => {
    const r = calcolaSnap(p, cam, vicino(0, 4, 3, -3), SNAP_PREDEFINITO);
    expect(r.tipo).toBe('nodo');
    expect(r.punto.x).toBeCloseTo(0, 10);
    expect(r.punto.y).toBeCloseTo(4, 10);
    expect(r.nodoId).toBeDefined();
  });

  it('aggancia i punti medi delle aste', () => {
    const r = calcolaSnap(p, cam, vicino(3, 4, 2, 2), SNAP_PREDEFINITO);
    expect(r.tipo).toBe('puntoMedio');
    expect(r.punto.x).toBeCloseTo(3, 10);
    expect(r.punto.y).toBeCloseTo(4, 10);
  });

  it('aggancia le intersezioni fra aste', () => {
    // le aste sono volutamente ASIMMETRICHE: se l'incrocio coincidesse con un
    // punto medio vincerebbe quello, che ha priorità più alta
    const q = progetto('croce');
    const a = q.nodo(-2, 0), b = q.nodo(3, 0);
    const c = q.nodo(0, -1), d = q.nodo(0, 4);
    q.asta(a, b, 'S275', 'IPE 300');
    q.asta(c, d, 'S275', 'IPE 300');
    const prog = q.costruisci();
    const r = calcolaSnap(prog, cam, vicino(0, 0, 3, 3), SNAP_PREDEFINITO);
    expect(r.tipo).toBe('intersezione');
    expect(r.punto.x).toBeCloseTo(0, 9);
    expect(r.punto.y).toBeCloseTo(0, 9);
  });

  it('aggancia gli angoli notevoli rispetto all\'origine dell\'operazione', () => {
    const origine = { x: 0, y: 0 };
    // punto quasi a 45°, spostato di poco
    const r = calcolaSnap(p, cam, vicino(2.0, 1.97), SNAP_PREDEFINITO, origine);
    expect(r.tipo).toBe('ortogonale');
    // l'etichetta è quella "viva" del tracciamento: lunghezza e angolo
    expect(r.etichetta).toMatch(/α 45° \(ass\)/);
    expect(r.etichetta).toMatch(/^L /);
    // l'angolo è esatto...
    expect(Math.atan2(r.punto.y, r.punto.x)).toBeCloseTo(Math.PI / 4, 9);
    // ...e la lunghezza è arrotondata al passo EFFETTIVO della griglia a
    // questo zoom, non a un valore fisso
    const passo = passoGriglia(cam.zoom);
    const L = Math.hypot(r.punto.x, r.punto.y);
    expect(Math.abs(L / passo - Math.round(L / passo))).toBeLessThan(1e-9);
  });

  it('aggancia i multipli di 15°, non solo quelli di 45°', () => {
    // 30° non era raggiungibile con il passo di 45°: è il caso che il passo
    // più fitto esiste per coprire
    const r = calcolaSnap(p, cam, vicino(2.6, 1.48), SNAP_PREDEFINITO, { x: 0, y: 0 });
    expect(r.tipo).toBe('ortogonale');
    expect(Math.atan2(r.punto.y, r.punto.x) * 180 / Math.PI).toBeCloseTo(30, 6);
  });

  it('aggancia anche RELATIVAMENTE al segmento precedente', () => {
    // segmento precedente a 20°, piega di 45°: l'angolo assoluto 65° non è
    // multiplo di 15 e nessun aggancio assoluto potrebbe darlo
    const g = (x: number) => (x * Math.PI) / 180;
    const L = 3;
    const p2 = { x: L * Math.cos(g(63.5)), y: L * Math.sin(g(63.5)) };
    const r = calcolaSnap(
      p, cam, vicino(p2.x, p2.y), { ...SNAP_PREDEFINITO, griglia: false },
      { x: 0, y: 0 }, new Set(), g(20),
    );
    expect(r.tipo).toBe('angolo');
    expect(Math.atan2(r.punto.y, r.punto.x) * 180 / Math.PI).toBeCloseTo(65, 6);
    expect(r.etichetta).toMatch(/Δ 45° \(rel\)/);
  });

  it('aggancia i quarti e i terzi di un\'asta', () => {
    const q = progetto('quarti');
    const a = q.nodo(0, 0);
    const b = q.nodo(4, 0);
    q.asta(a, b, 'S275', 'IPE 300');
    const prog = q.costruisci();
    const unQuarto = calcolaSnap(prog, cam, vicino(1.02, 0.01), SNAP_PREDEFINITO);
    expect(unQuarto.tipo).toBe('lungoAsta');
    expect(unQuarto.punto.x).toBeCloseTo(1, 9);
    const unTerzo = calcolaSnap(prog, cam, vicino(1.34, 0.01), SNAP_PREDEFINITO);
    expect(unTerzo.tipo).toBe('lungoAsta');
    expect(unTerzo.punto.x).toBeCloseTo(4 / 3, 9);
  });

  it('proietta ortogonalmente su un\'asta quando non c\'è di meglio', () => {
    const q = progetto('proiezione');
    const a = q.nodo(0, 0);
    const b = q.nodo(4, 0);
    q.asta(a, b, 'S275', 'IPE 300');
    const prog = q.costruisci();
    const r = calcolaSnap(prog, cam, vicino(2.63, 0.02), {
      ...SNAP_PREDEFINITO, griglia: false, puntiMedi: false,
    });
    expect(r.tipo).toBe('lungoAsta');
    expect(r.punto.y).toBeCloseTo(0, 9);
    expect(r.punto.x).toBeCloseTo(2.63, 6);
  });

  it('ripiega sulla griglia e infine sul punto libero', () => {
    const passo = passoGriglia(cam.zoom);
    const conGriglia = calcolaSnap(p, cam, vicino(1.49, 2.51), SNAP_PREDEFINITO);
    expect(conGriglia.tipo).toBe('griglia');
    expect(conGriglia.punto.x).toBeCloseTo(Math.round(1.49 / passo) * passo, 9);
    expect(conGriglia.punto.y).toBeCloseTo(Math.round(2.51 / passo) * passo, 9);

    const senza = calcolaSnap(p, cam, vicino(1.37, 2.43), {
      ...SNAP_PREDEFINITO, griglia: false, nodi: false,
      puntiMedi: false, intersezioni: false, ortogonale: false,
    });
    expect(senza.tipo).toBe('nessuno');
    expect(senza.punto.x).toBeCloseTo(1.37, 6);
  });

  it('la tolleranza è in pixel: non cambia con lo zoom', () => {
    for (const zoom of [10, 60, 400]) {
      const c = { ...cam, zoom };
      const s = mondoASchermo(c, { x: 0, y: 4 });
      const r = calcolaSnap(p, c, { x: s.x + 6, y: s.y + 6 }, SNAP_PREDEFINITO);
      expect(r.tipo).toBe('nodo');
    }
  });
});

describe('selezione', () => {
  const p = telaio();

  it('colpisce i nodi prima delle aste', () => {
    const b = colpisci(p, cam, mondoASchermo(cam, { x: 0, y: 4 }));
    expect(b?.tipo).toBe('nodo');
  });

  it('colpisce un\'asta cliccando lontano dalle estremità', () => {
    const b = colpisci(p, cam, mondoASchermo(cam, { x: 3, y: 4 }));
    expect(b?.tipo).toBe('asta');
  });

  it('non colpisce nulla nel vuoto', () => {
    expect(colpisci(p, cam, mondoASchermo(cam, { x: 3, y: 1.5 }))).toBeNull();
  });

  it('il riquadro prende le aste solo se ENTRAMBI i nodi sono dentro', () => {
    const a = mondoASchermo(cam, { x: -1, y: 5 });
    const b = mondoASchermo(cam, { x: 7, y: -1 });
    const tutto = dentroRiquadro(p, cam, a, b);
    expect(tutto.nodi.length).toBe(4);
    expect(tutto.aste.length).toBe(3);

    // riquadro sulla sola metà sinistra: prende 2 nodi e 1 asta
    const c = mondoASchermo(cam, { x: -1, y: 5 });
    const d = mondoASchermo(cam, { x: 1, y: -1 });
    const meta = dentroRiquadro(p, cam, c, d);
    expect(meta.nodi.length).toBe(2);
    expect(meta.aste.length).toBe(1);
  });
});

describe('catena di aste collineari', () => {
  it('percorre la catena e si ferma agli incroci', () => {
    const q = progetto('catena');
    const n = [0, 1, 2, 3, 4].map((i) => q.nodo(i, 0));
    const ramo = q.nodo(2, 2);
    const aste = [];
    for (let i = 0; i < 4; i++) aste.push(q.asta(n[i], n[i + 1], 'S275', 'IPE 300'));
    q.asta(n[2], ramo, 'S275', 'IPE 300');   // incrocio a metà
    const prog = q.costruisci();

    // partendo dalla prima asta la catena si ferma al nodo n[2], che è un incrocio
    const catena = catenaCollineare(prog, aste[0]);
    expect(catena.length).toBe(2);
    expect(catena).toContain(aste[0]);
    expect(catena).toContain(aste[1]);
  });

  it('percorre l\'intera catena quando non ci sono incroci', () => {
    const q = progetto('dritta');
    const n = [0, 1, 2, 3].map((i) => q.nodo(i, 0));
    const aste = [];
    for (let i = 0; i < 3; i++) aste.push(q.asta(n[i], n[i + 1], 'S275', 'IPE 300'));
    const catena = catenaCollineare(q.costruisci(), aste[1]);
    expect(catena.length).toBe(3);
  });

  it('non prosegue oltre un cambio di direzione', () => {
    const q = progetto('gomito');
    const a = q.nodo(0, 0), b = q.nodo(2, 0), c = q.nodo(2, 2);
    const a1 = q.asta(a, b, 'S275', 'IPE 300');
    q.asta(b, c, 'S275', 'IPE 300');
    expect(catenaCollineare(q.costruisci(), a1).length).toBe(1);
  });
});

/**
 * REGRESSIONE — il residuo di equilibrio ignorava ΣMz, e la sua scala di
 * riferimento contava le sole forze.
 *
 * Due conseguenze opposte, entrambe sbagliate: uno squilibrio di momento non
 * compariva nel controllo, e su una struttura caricata da coppie il
 * denominatore tendeva a zero, così un residuo di 1e-11 N diventava un «64 %»
 * che bocciava una soluzione corretta.
 *
 * Trovato dalla campagna casuale del §10.2, seme 9019.
 */

import { describe, it, expect } from 'vitest';
import { progetto } from '../../src/core/builder.js';
import { preset } from '../../src/core/materials/sezioniParametriche.js';
import { analizzaCaso } from '../../src/core/index.js';
import type { LoadCaseId } from '../../src/core/model/types.js';

const CASO = 'principale' as LoadCaseId;

describe('equilibrio con carichi di solo momento', () => {
  it('una struttura caricata da una sola coppia è in equilibrio', () => {
    const b = progetto('coppia');
    const s = b.sezioneParametrica('s', preset('IPE 200'));
    const a = b.nodo(0, 0), c = b.nodo(5, 0);
    b.asta(a, c, 'S275', s, { teoria: 'eulero-bernoulli' });
    b.vincolo(a, 'cerniera'); b.vincolo(c, 'carrello');
    b.momento(c, 25e3);
    const r = analizzaCaso(b.costruisci(), CASO);

    expect(r.equilibrio.soddisfatto).toBe(true);
    expect(r.equilibrio.residuoRelativo).toBeLessThan(1e-8);
  });

  it('e la mensola con la sola coppia in punta, dove le forze si annullano', () => {
    // caso limite: le reazioni di forza sono NULLE, resta il solo momento
    // reattivo. Con la scala basata sulle sole forze il denominatore era zero.
    const b = progetto('mensola-coppia');
    const s = b.sezioneParametrica('s', preset('IPE 200'));
    const a = b.nodo(0, 0), c = b.nodo(4, 0);
    b.asta(a, c, 'S275', s, { teoria: 'eulero-bernoulli' });
    b.vincolo(a, 'incastro');
    b.momento(c, 30e3);
    const r = analizzaCaso(b.costruisci(), CASO);

    expect(Math.abs(r.reazioni[0].fx)).toBeLessThan(1e-6);
    expect(Math.abs(r.reazioni[0].fy)).toBeLessThan(1e-6);
    expect(Math.abs(r.reazioni[0].mz)).toBeCloseTo(30e3, 3);
    expect(r.equilibrio.soddisfatto).toBe(true);
  });

  it('ΣMz entra davvero nel residuo: uno squilibrio di momento si vede', () => {
    // si costruisce a mano un esito squilibrato per verificare che il
    // controllo lo intercetti — prima lo avrebbe lasciato passare
    const b = progetto('m');
    const s = b.sezioneParametrica('s', preset('IPE 200'));
    const a = b.nodo(0, 0), c = b.nodo(4, 0);
    b.asta(a, c, 'S275', s, { teoria: 'eulero-bernoulli' });
    b.vincolo(a, 'incastro');
    b.forza(c, 0, -10e3);
    const r = analizzaCaso(b.costruisci(), CASO);
    // la soluzione vera è equilibrata
    expect(r.equilibrio.soddisfatto).toBe(true);
    expect(Math.abs(r.equilibrio.sommaMz)).toBeLessThan(1e-6);
  });
});

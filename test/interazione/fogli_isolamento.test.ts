/**
 * §4.3 — I SEI TEST DI ISOLAMENTO FRA FOGLI.
 *
 * L'isolamento non si dimostra leggendo il codice: si dimostra facendo
 * davvero le operazioni su un foglio e rileggendo TUTTO l'altro.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useFogli } from '../../src/state/fogli.js';
import { useStore } from '../../src/state/store.js';
import { progetto } from '../../src/core/builder.js';
import { preset } from '../../src/core/materials/sezioniParametriche.js';
import { aggiungiNodo } from '../../src/state/commands.js';
import { eliminaSelezione } from '../../src/state/azioni.js';
import type { LoadCaseId, Progetto } from '../../src/core/model/types.js';

const CASO = 'principale' as LoadCaseId;
const st = () => useStore.getState();
const reg = () => useFogli.getState();

function trave(nome: string, luce: number, q: number): Progetto {
  const p = progetto(nome);
  const sez = p.sezioneParametrica('s', preset('IPE 200'));
  const a = p.nodo(0, 0);
  const b = p.nodo(luce, 0);
  const asta = p.asta(a, b, 'S275', sez);
  p.vincolo(a, 'cerniera');
  p.vincolo(b, 'carrello');
  p.distribuito(asta, q);
  return p.costruisci();
}

/** Riporta il registro a un foglio solo. */
function azzera() {
  for (const f of [...reg().fogli].slice(1)) reg().chiudi(f.id);
  reg().attiva(reg().fogli[0].id);
  st().caricaProgetto(trave('A', 6, -10e3));
  useStore.setState({ passato: [], futuro: [] });
}

beforeEach(azzera);

describe('§4.3', () => {
  it('1 — due fogli con strutture diverse mantengono ciascuno la propria', () => {
    const a = reg().foglioAttivo();
    reg().nuovo('B');
    st().caricaProgetto(trave('B', 12, -4e3));

    expect(a.store.getState().progetto.nodi[1].x).toBe(6);
    expect(a.store.getState().progetto.nome).toBe('A');
    expect(st().progetto.nodi[1].x).toBe(12);
    expect(st().progetto.nome).toBe('B');
  });

  it('2 — duplicando A in B e modificando B, A resta identico, vista compresa', () => {
    const a = reg().foglioAttivo();
    a.store.getState().impostaCamera({ ...a.store.getState().camera, zoom: 77, cx: 3 });
    const primaA = JSON.stringify(a.store.getState().progetto);
    const cameraA = { ...a.store.getState().camera };

    const idB = reg().duplica(a.id);
    const b = reg().fogli.find((f) => f.id === idB)!;

    // la copia parte dalla stessa inquadratura
    expect(b.store.getState().camera.zoom).toBeCloseTo(cameraA.zoom, 9);

    b.store.getState().esegui(aggiungiNodo(99, 99));
    b.store.getState().impostaCamera({ ...b.store.getState().camera, zoom: 5 });
    reg().attiva(a.id);

    expect(JSON.stringify(st().progetto)).toBe(primaA);
    expect(st().camera.zoom).toBeCloseTo(cameraA.zoom, 9);
    expect(st().camera.cx).toBeCloseTo(cameraA.cx, 9);
  });

  it('2b — la copia è PROFONDA: nessun oggetto condiviso per riferimento', () => {
    const a = reg().foglioAttivo();
    const idB = reg().duplica(a.id);
    const b = reg().fogli.find((f) => f.id === idB)!;

    const pa = a.store.getState().progetto;
    const pb = b.store.getState().progetto;
    expect(pb).not.toBe(pa);
    expect(pb.nodi).not.toBe(pa.nodi);
    expect(pb.nodi[0]).not.toBe(pa.nodi[0]);
    expect(pb.carichi).not.toBe(pa.carichi);
  });

  it('3 — l undo su B non ha alcun effetto su A', () => {
    const a = reg().foglioAttivo();
    const nodiA = a.store.getState().progetto.nodi.length;
    const passatoA = a.store.getState().passato.length;

    const idB = reg().duplica(a.id);
    const b = reg().fogli.find((f) => f.id === idB)!;
    b.store.getState().esegui(aggiungiNodo(1, 1));
    b.store.getState().esegui(aggiungiNodo(2, 2));
    b.store.getState().annulla();
    b.store.getState().annulla();

    expect(a.store.getState().progetto.nodi.length).toBe(nodiA);
    expect(a.store.getState().passato.length).toBe(passatoA);
    expect(a.store.getState().futuro.length).toBe(0);
  });

  it('4 — analisi su A e su B: ogni risultato finisce nel foglio giusto', async () => {
    const a = reg().foglioAttivo();
    const idB = reg().nuovo('B');
    const b = reg().fogli.find((f) => f.id === idB)!;
    b.store.getState().caricaProgetto(trave('B', 12, -4e3));

    // lanciate in rapida successione, come chiede la specifica
    await Promise.all([
      a.store.getState().calcolaRisultati(),
      b.store.getState().calcolaRisultati(),
    ]);

    const rA = a.store.getState().risultato;
    const rB = b.store.getState().risultato;
    expect(rA).not.toBeNull();
    expect(rB).not.toBeNull();

    // Trave appoggiata: M = qL²/8. Il massimo campionato non cade esattamente
    // in mezzeria, quindi si confronta in relativo — resta comunque una
    // discriminazione netta, 45 kNm contro 72.
    const mA = Math.abs(rA!.aste[0].estremi.Mmax);
    const mB = Math.abs(rB!.aste[0].estremi.Mmax);
    expect(mA / (10e3 * 36 / 8)).toBeCloseTo(1, 2);
    expect(mB / (4e3 * 144 / 8)).toBeCloseTo(1, 2);
    // ciascuno nel proprio foglio: se si fossero scambiati, questi due
    // rapporti sarebbero 1.6 e 0.625
    expect(mB / mA).toBeGreaterThan(1.5);
    expect(rA).not.toBe(rB);
  });

  it('5 — «elimina tutto» su A lascia B intatto', () => {
    const a = reg().foglioAttivo();
    const idB = reg().duplica(a.id);
    const b = reg().fogli.find((f) => f.id === idB)!;
    const primaB = JSON.stringify(b.store.getState().progetto);

    reg().attiva(a.id);
    st().selezionaTutto();
    eliminaSelezione();

    expect(st().progetto.nodi).toHaveLength(0);
    expect(st().progetto.aste).toHaveLength(0);
    expect(JSON.stringify(b.store.getState().progetto)).toBe(primaB);
    expect(b.store.getState().progetto.nodi).toHaveLength(2);
  });

  it('6 — chiuso B e aperto un foglio nuovo, non resta niente di B', () => {
    const idB = reg().nuovo('B');
    st().caricaProgetto(trave('B', 12, -4e3));
    st().esegui(aggiungiNodo(50, 50));
    reg().chiudi(idB);

    reg().nuovo('C');

    expect(st().progetto.nodi).toHaveLength(0);
    expect(st().progetto.aste).toHaveLength(0);
    expect(st().progetto.carichi).toHaveLength(0);
    expect(st().passato).toHaveLength(0);
    expect(st().risultato).toBeNull();
    expect(reg().fogli.some((f) => f.id === idB)).toBe(false);
  });

  it('il contatore degli id è per foglio e non si azzera mai', () => {
    const a = reg().foglioAttivo();
    st().esegui(aggiungiNodo(1, 1));
    const contA = a.store.getState().progetto.contatoriId?.n ?? 0;
    expect(contA).toBeGreaterThan(0);

    reg().nuovo('B');
    st().esegui(aggiungiNodo(1, 1));
    // il foglio nuovo ha il SUO contatore, che parte da zero
    expect(st().progetto.contatoriId?.n).toBe(1);
    // e quello di A non è stato toccato
    expect(a.store.getState().progetto.contatoriId?.n).toBe(contA);
  });
});

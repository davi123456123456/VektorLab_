/**
 * ISOLAMENTO FRA FOGLI DI LAVORO.
 *
 * È l'unica proprietà che conta davvero: qualunque cosa si faccia in un
 * foglio non deve arrivare agli altri. Non si verifica leggendo il codice —
 * si verifica facendo davvero le operazioni su un foglio e rileggendo tutto
 * l'altro.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useFogli } from '../../src/state/fogli.js';
import { useStore, storeAttivo } from '../../src/state/store.js';
import { progetto } from '../../src/core/builder.js';
import { aggiungiNodo } from '../../src/state/commands.js';
import { preset } from '../../src/core/materials/sezioniParametriche.js';
import type { LoadCaseId } from '../../src/core/model/types.js';

function trave(nome: string, luce: number) {
  const p = progetto(nome);
  const sez = p.sezioneParametrica('s', preset('IPE 200'));
  const a = p.nodo(0, 0);
  const b = p.nodo(luce, 0);
  const asta = p.asta(a, b, 'S275', sez);
  p.vincolo(a, 'cerniera');
  p.vincolo(b, 'carrello');
  p.distribuito(asta, -10e3);
  return p.costruisci();
}

/** Riporta il registro a un solo foglio vuoto. */
function azzera() {
  const r = useFogli.getState();
  for (const f of [...r.fogli].slice(1)) r.chiudi(f.id);
  useFogli.getState().attiva(useFogli.getState().fogli[0].id);
  useStore.getState().caricaProgetto(trave('A', 6));
}

describe('registro dei fogli', () => {
  beforeEach(azzera);

  it('parte con un foglio solo, che adotta lo store già esistente', () => {
    expect(useFogli.getState().fogli.length).toBe(1);
    expect(useFogli.getState().fogli[0].store).toBe(storeAttivo());
  });

  it('un foglio nuovo diventa quello attivo', () => {
    const id = useFogli.getState().nuovo();
    expect(useFogli.getState().attivo).toBe(id);
    expect(useFogli.getState().fogli.length).toBe(2);
  });

  it('cambiare foglio incrementa la generazione che rimonta l albero', () => {
    const g0 = useFogli.getState().generazione;
    const b = useFogli.getState().nuovo();
    const g1 = useFogli.getState().generazione;
    expect(g1).toBeGreaterThan(g0);
    useFogli.getState().attiva(useFogli.getState().fogli[0].id);
    expect(useFogli.getState().generazione).toBeGreaterThan(g1);
    expect(useFogli.getState().attivo).not.toBe(b);
  });

  it('l ultimo foglio non si chiude', () => {
    useFogli.getState().chiudi(useFogli.getState().fogli[0].id);
    expect(useFogli.getState().fogli.length).toBe(1);
  });

  it('chiudendo il foglio attivo si passa al vicino, non al primo', () => {
    const r = useFogli.getState();
    r.nuovo('B'); const c = r.nuovo('C'); r.nuovo('D');
    useFogli.getState().attiva(c);
    useFogli.getState().chiudi(c);
    expect(useFogli.getState().foglioAttivo().nome).toBe('D');
  });

  it('i nomi non collidono', () => {
    const r = useFogli.getState();
    r.nuovo(); r.nuovo(); r.nuovo();
    const nomi = useFogli.getState().fogli.map((f) => f.nome);
    expect(new Set(nomi).size).toBe(nomi.length);
  });
});

describe('§3.2 — isolamento', () => {
  beforeEach(azzera);

  it('il modello di un foglio non arriva all altro', () => {
    const a = useFogli.getState().foglioAttivo();
    expect(useStore.getState().progetto.nodi.length).toBe(2);

    const idB = useFogli.getState().nuovo();
    useStore.getState().caricaProgetto(trave('B', 12));
    // il foglio nuovo ha la sua trave
    expect(useStore.getState().progetto.nodi[1].x).toBe(12);

    // quello vecchio è rimasto identico
    expect(a.store.getState().progetto.nodi[1].x).toBe(6);
    expect(a.store.getState().progetto.nome).toBe('A');

    // e tornandoci lo si ritrova com'era
    useFogli.getState().attiva(a.id);
    expect(useStore.getState().progetto.nodi[1].x).toBe(6);
    expect(idB).not.toBe(a.id);
  });

  it('la cronologia di undo è separata', () => {
    const a = useFogli.getState().foglioAttivo();
    // nel foglio A si fa una modifica, quindi c'è qualcosa da annullare
    useStore.getState().esegui(aggiungiNodo(3, 3));
    const passatoA = a.store.getState().passato.length;
    expect(passatoA).toBeGreaterThan(0);

    useFogli.getState().nuovo();
    // il foglio nuovo nasce senza passato
    expect(useStore.getState().passato.length).toBe(0);

    // annullare qui non tocca il foglio A
    useStore.getState().annulla();
    expect(a.store.getState().passato.length).toBe(passatoA);
    expect(a.store.getState().progetto.nodi.length).toBe(3);
  });

  it('annullare in un foglio non cambia il modello dell altro', () => {
    const a = useFogli.getState().foglioAttivo();
    const nodiA = a.store.getState().progetto.nodi.length;

    useFogli.getState().nuovo();
    useStore.getState().caricaProgetto(trave('B', 12));
    useStore.getState().esegui(aggiungiNodo(1, 1));
    useStore.getState().esegui(aggiungiNodo(2, 2));
    useStore.getState().annulla();

    expect(useStore.getState().progetto.nodi.length).toBe(3);
    expect(a.store.getState().progetto.nodi.length).toBe(nodiA);
  });

  it('la selezione è separata', () => {
    const a = useFogli.getState().foglioAttivo();
    const nodo = useStore.getState().progetto.nodi[0].id;
    useStore.getState().seleziona({ nodi: new Set([nodo]) });
    expect(a.store.getState().selezione.nodi.size).toBe(1);

    useFogli.getState().nuovo();
    expect(useStore.getState().selezione.nodi.size).toBe(0);
    useStore.getState().selezionaTutto();

    expect(a.store.getState().selezione.nodi.size).toBe(1);
  });

  it('l inquadratura è separata', () => {
    const a = useFogli.getState().foglioAttivo();
    const zoomA = a.store.getState().camera.zoom;

    useFogli.getState().nuovo();
    useStore.setState({ camera: { ...useStore.getState().camera, zoom: zoomA * 3 } });

    expect(useStore.getState().camera.zoom).toBeCloseTo(zoomA * 3, 9);
    expect(a.store.getState().camera.zoom).toBeCloseTo(zoomA, 9);
  });

  it('i risultati sono separati', async () => {
    const a = useFogli.getState().foglioAttivo();
    await useStore.getState().calcolaRisultati();
    const rA = a.store.getState().risultato;
    expect(rA).not.toBeNull();

    useFogli.getState().nuovo();
    // il foglio nuovo non ha ancora risultati, pur essendo passato in primo piano
    expect(useStore.getState().risultato).toBeNull();

    useStore.getState().caricaProgetto(trave('B', 12));
    await useStore.getState().calcolaRisultati();
    const rB = useStore.getState().risultato!;

    // due travi di luce diversa: i momenti non possono coincidere
    expect(rB).not.toBe(rA);
    expect(Math.abs(rB.aste[0].estremi.Mmax))
      .not.toBeCloseTo(Math.abs(rA!.aste[0].estremi.Mmax), 0);
    // e il foglio A conserva i suoi
    expect(a.store.getState().risultato).toBe(rA);
  });

  it('le opzioni di vista sono separate', () => {
    const a = useFogli.getState().foglioAttivo();
    useStore.getState().impostaOpzioniRisultati({ mostraModelloNeiDiagrammi: false });
    expect(a.store.getState().mostraModelloNeiDiagrammi).toBe(false);

    useFogli.getState().nuovo();
    expect(useStore.getState().mostraModelloNeiDiagrammi).toBe(true);
    expect(a.store.getState().mostraModelloNeiDiagrammi).toBe(false);
  });

  it('la modalità è separata', () => {
    const a = useFogli.getState().foglioAttivo();
    useStore.getState().impostaModalita('vincoli');
    useFogli.getState().nuovo();
    expect(useStore.getState().modalita).toBe('modellazione');
    expect(a.store.getState().modalita).toBe('vincoli');
  });

  it('duplicare copia il modello ma non la cronologia', () => {
    const a = useFogli.getState().foglioAttivo();
    useStore.getState().esegui(aggiungiNodo(9, 9));
    expect(a.store.getState().passato.length).toBeGreaterThan(0);

    const idCopia = useFogli.getState().duplica(a.id);
    const copia = useFogli.getState().fogli.find((f) => f.id === idCopia)!;

    expect(copia.store.getState().progetto.nodi.length)
      .toBe(a.store.getState().progetto.nodi.length);
    expect(copia.store.getState().passato.length).toBe(0);
    expect(copia.nome).toContain('copia');

    // e sono due modelli distinti: toccare la copia non tocca l'originale
    copia.store.getState().esegui(aggiungiNodo(20, 20));
    expect(copia.store.getState().progetto.nodi.length)
      .toBe(a.store.getState().progetto.nodi.length + 1);
  });

  it('nessun foglio condivide l oggetto store con un altro', () => {
    const r = useFogli.getState();
    r.nuovo(); r.nuovo(); r.nuovo();
    const store = useFogli.getState().fogli.map((f) => f.store);
    expect(new Set(store).size).toBe(store.length);
  });

  it('§8 — il pannello di destra è per foglio', () => {
    const a = useFogli.getState().foglioAttivo();
    expect(useStore.getState().pannelloDestro.aperto).toBe(true);
    useStore.getState().impostaLarghezzaPannelloDestro(400);
    useStore.getState().alternaPannelloDestro();
    expect(a.store.getState().pannelloDestro).toEqual({ aperto: false, larghezza: 400 });

    useFogli.getState().nuovo();
    // il foglio nuovo eredita l'ultima larghezza scelta
    expect(useStore.getState().pannelloDestro.larghezza).toBe(400);
    useStore.getState().impostaLarghezzaPannelloDestro(250);
    expect(useStore.getState().pannelloDestro.larghezza).toBe(250);
    expect(a.store.getState().pannelloDestro.larghezza).toBe(400);
  });

  it('§8 — la larghezza resta dentro i limiti', () => {
    useStore.getState().impostaLarghezzaPannelloDestro(10);
    expect(useStore.getState().pannelloDestro.larghezza).toBe(220);
    useStore.getState().impostaLarghezzaPannelloDestro(9000);
    expect(useStore.getState().pannelloDestro.larghezza).toBe(480);
  });

  it('useStore imperativo segue sempre il foglio in primo piano', () => {
    const a = useFogli.getState().foglioAttivo();
    const idB = useFogli.getState().nuovo();
    const b = useFogli.getState().fogli.find((f) => f.id === idB)!;

    expect(useStore.getState()).toBe(b.store.getState());
    useFogli.getState().attiva(a.id);
    expect(useStore.getState()).toBe(a.store.getState());
  });
});

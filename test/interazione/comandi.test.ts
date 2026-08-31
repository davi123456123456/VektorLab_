/**
 * Comandi e cronologia. La proprietà che conta è l'INVERTIBILITÀ ESATTA:
 * dopo annulla, il progetto deve essere identico a prima, campo per campo.
 * Un undo "quasi" giusto è peggio di nessun undo.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { progetto } from '../../src/core/builder.js';
import {
  aggiungiAsta, aggiungiNodo, duplica, elimina, estrudi, impostaVincolo,
  modificaAste, trasformaNodi, type Comando,
} from '../../src/state/commands.js';
import { progettoVuoto, useStore } from '../../src/state/store.js';
import type { ElementId, NodeId, Progetto } from '../../src/core/model/types.js';

const istantanea = (p: Progetto) => JSON.stringify(p);

function telaio(): Progetto {
  const p = progetto('telaio');
  const a = p.nodo(0, 0);
  const b = p.nodo(0, 4);
  const c = p.nodo(6, 4);
  const d = p.nodo(6, 0);
  p.asta(a, b, 'S275', 'IPE 300');
  p.asta(b, c, 'S275', 'IPE 300');
  p.asta(c, d, 'S275', 'IPE 300');
  p.vincolo(a, 'incastro');
  p.vincolo(d, 'incastro');
  return p.costruisci();
}

/**
 * Esegue il comando e verifica che l'annullamento riporti esattamente indietro.
 *
 * Con UN'ECCEZIONE: il contatore degli id. Quello non deve tornare indietro,
 * mai — è la garanzia che un id speso non venga riassegnato a un'entità
 * diversa. Se l'annullamento lo riavvolgesse, disegnare un nodo, annullare e
 * ridisegnarne un altro produrrebbe due entità distinte con lo stesso id, che
 * è precisamente il difetto da cui nascevano i vincoli fantasma.
 */
function verificaInvertibilita(p: Progetto, c: Comando): Progetto {
  const prima = istantanea(p);
  const dopo = c.esegui(p);
  const tornato = c.annulla(dopo);
  expect(istantanea(ordina(senzaContatori(tornato))))
    .toBe(istantanea(ordina(senzaContatori(JSON.parse(prima) as Progetto))));

  // e il contatore, appunto, resta avanti
  for (const [k, v] of Object.entries(dopo.contatoriId ?? {})) {
    expect(tornato.contatoriId?.[k] ?? 0).toBeGreaterThanOrEqual(v);
  }
  return dopo;
}

function senzaContatori(p: Progetto): Progetto {
  const { contatoriId: _ignorato, ...resto } = p;
  return resto as Progetto;
}

/** L'ordine degli array non è significativo: l'annullamento può riaccodare. */
function ordina(p: Progetto): Progetto {
  return {
    ...p,
    nodi: [...p.nodi].sort((a, b) => (a.id as string).localeCompare(b.id as string)),
    aste: [...p.aste].sort((a, b) => (a.id as string).localeCompare(b.id as string)),
    carichi: [...p.carichi].sort((a, b) => (a.id as string).localeCompare(b.id as string)),
  };
}

describe('invertibilità dei comandi', () => {
  it('aggiungi nodo', () => {
    verificaInvertibilita(telaio(), aggiungiNodo(3, 7));
  });

  it('aggiungi asta', () => {
    const p = telaio();
    verificaInvertibilita(p, aggiungiAsta(
      p.nodi[0].id, p.nodi[2].id, 'S275', 'IPE 300',
    ));
  });

  it('estrudi crea nodo e asta insieme, e li toglie insieme', () => {
    const p = telaio();
    const c = estrudi(p.nodi[1].id, 3, 8, 'S275', 'IPE 300');
    const dopo = verificaInvertibilita(p, c);
    expect(dopo.nodi.length).toBe(p.nodi.length + 1);
    expect(dopo.aste.length).toBe(p.aste.length + 1);
  });

  it('elimina, riportando anche le aste travolte e i carichi', () => {
    const p = progetto('con carichi');
    const a = p.nodo(0, 0), b = p.nodo(4, 0), c = p.nodo(8, 0);
    const a1 = p.asta(a, b, 'S275', 'IPE 300');
    p.asta(b, c, 'S275', 'IPE 300');
    p.vincolo(a, 'cerniera');
    p.forza(b, 0, -1000);
    p.distribuito(a1, -2000);
    const prog = p.costruisci();

    // eliminando il nodo b spariscono ENTRAMBE le aste che vi convergono
    const cmd = elimina([b], []);
    const dopo = verificaInvertibilita(prog, cmd);
    expect(dopo.nodi.length).toBe(2);
    expect(dopo.aste.length).toBe(0);
    expect(dopo.carichi.length).toBe(0);   // anche il distribuito su a1
  });

  it('duplica', () => {
    const p = telaio();
    const c = duplica(p.nodi.map((n) => n.id), p.aste.map((a) => a.id), 10, 0);
    const dopo = verificaInvertibilita(p, c);
    expect(dopo.nodi.length).toBe(8);
    expect(dopo.aste.length).toBe(6);
    // i duplicati sono traslati e collegati fra loro, non agli originali
    const nuovi = [...c.mappaNodi.values()];
    for (const asta of dopo.aste.filter((a) => c.nuoveAste.includes(a.id))) {
      expect(nuovi).toContain(asta.nodoIniziale);
      expect(nuovi).toContain(asta.nodoFinale);
    }
  });

  it('trasforma nodi', () => {
    const p = telaio();
    const ids = p.nodi.map((n) => n.id);
    const prima = new Map(p.nodi.map((n) => [n.id, { x: n.x, y: n.y }]));
    const dopo = new Map([...prima].map(([id, q]) => [id, { x: q.x + 2, y: q.y }]));
    const r = verificaInvertibilita(p, trasformaNodi(ids, dopo, 'sposta', prima));
    expect(r.nodi[0].x).toBe(2);
  });

  it('modifica aste', () => {
    const p = telaio();
    verificaInvertibilita(p, modificaAste(
      [p.aste[0].id], { sezioneId: 'HEB 300' as ElementId as never },
    ));
  });

  it('imposta e rimuove vincolo', () => {
    const p = telaio();
    verificaInvertibilita(p, impostaVincolo([p.nodi[1].id], {
      tipo: 'carrello', angolo: 0 as never,
    }));
    verificaInvertibilita(p, impostaVincolo([p.nodi[0].id], undefined));
  });
});

describe('cronologia dello store', () => {
  beforeEach(() => {
    useStore.setState({
      progetto: telaio(), passato: [], futuro: [],
      selezione: { nodi: new Set(), aste: new Set() },
    });
  });

  it('annulla e ripete in sequenza', () => {
    const s = useStore.getState();
    s.esegui(aggiungiNodo(1, 1));
    s.esegui(aggiungiNodo(2, 2));
    expect(useStore.getState().progetto.nodi.length).toBe(6);

    useStore.getState().annulla();
    expect(useStore.getState().progetto.nodi.length).toBe(5);
    useStore.getState().annulla();
    expect(useStore.getState().progetto.nodi.length).toBe(4);
    useStore.getState().annulla();   // niente altro da annullare
    expect(useStore.getState().progetto.nodi.length).toBe(4);

    useStore.getState().rifai();
    useStore.getState().rifai();
    expect(useStore.getState().progetto.nodi.length).toBe(6);
  });

  it('una nuova azione cancella il futuro', () => {
    const s = useStore.getState();
    s.esegui(aggiungiNodo(1, 1));
    useStore.getState().annulla();
    expect(useStore.getState().futuro.length).toBe(1);
    useStore.getState().esegui(aggiungiNodo(9, 9));
    expect(useStore.getState().futuro.length).toBe(0);
  });

  it('la selezione viene ripulita dagli oggetti scomparsi', () => {
    const s = useStore.getState();
    const cmd = aggiungiNodo(5, 5);
    s.esegui(cmd);
    const nuovo = cmd.id!;
    useStore.getState().seleziona({ nodi: new Set([nuovo]) });
    expect(useStore.getState().selezione.nodi.size).toBe(1);
    useStore.getState().annulla();
    expect(useStore.getState().selezione.nodi.size).toBe(0);
  });

  it('gli identificatori restano stabili attraverso annulla e ripeti', () => {
    const s = useStore.getState();
    const cmd = aggiungiNodo(5, 5);
    s.esegui(cmd);
    const id1 = useStore.getState().progetto.nodi.at(-1)!.id;
    useStore.getState().annulla();
    useStore.getState().rifai();
    expect(useStore.getState().progetto.nodi.at(-1)!.id).toBe(id1);
  });

  it('re-inquadra alla prima misura reale della viewport', () => {
    // sequenza reale: il progetto arriva prima che il canvas sia dimensionato
    useStore.setState({
      camera: { cx: 0, cy: 0, zoom: 60, larghezza: 0, altezza: 0 },
      viewportMisurata: false,
    });
    useStore.getState().caricaProgetto(telaio());
    // senza dimensioni l'inquadratura è stata saltata
    expect(useStore.getState().camera.zoom).toBe(60);

    useStore.getState().ridimensiona(1000, 600);
    const c = useStore.getState().camera;
    expect(c.larghezza).toBe(1000);
    // ora il telaio 6×4 è inquadrato: centro in (3,2) e zoom ragionevole
    expect(c.cx).toBeCloseTo(3, 6);
    expect(c.cy).toBeCloseTo(2, 6);
    expect(c.zoom).toBeGreaterThan(60);

    // una misura successiva NON deve re-inquadrare: sposterebbe la vista
    // dell'utente a ogni ridimensionamento della finestra
    useStore.getState().panning(100, 0);
    const cx = useStore.getState().camera.cx;
    useStore.getState().ridimensiona(1200, 700);
    expect(useStore.getState().camera.cx).toBeCloseTo(cx, 10);
  });

  it('caricare un progetto azzera la cronologia', () => {
    const s = useStore.getState();
    s.esegui(aggiungiNodo(1, 1));
    useStore.getState().caricaProgetto(progettoVuoto());
    expect(useStore.getState().passato.length).toBe(0);
    expect(useStore.getState().futuro.length).toBe(0);
  });
});

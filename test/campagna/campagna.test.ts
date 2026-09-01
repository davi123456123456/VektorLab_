/**
 * §10.2 — CAMPAGNA CASUALE CON ORACOLI.
 *
 * Genera strutture isostatiche a caso e applica gli invarianti. Nessun valore
 * atteso tabellato: si verifica che la soluzione abbia le proprietà che
 * qualunque soluzione corretta deve avere.
 */

import { describe, it, expect } from 'vitest';
import { generaIsostatica } from './generatore.js';
import {
  CASO, verificaLinearita, verificaRotazione, verificaScala,
} from './invarianti.js';
import { analizzaCaso } from '../../src/core/index.js';

interface Esito {
  provati: number; isostatici: number;
  falliti: { seme: number; prova: string; dettaglio: string }[];
}

function campagna(
  semi: number[], opzioni: Parameters<typeof generaIsostatica>[1],
): Esito {
  const esito: Esito = { provati: 0, isostatici: 0, falliti: [] };
  for (const seme of semi) {
    esito.provati++;
    const p = generaIsostatica(seme, opzioni);
    if (!p) continue;
    esito.isostatici++;

    const prove: [string, () => { nome: string; scarto: number }[]][] = [
      ['rotazione 0.7 rad', () => verificaRotazione(p, 0.7)],
      ['rotazione -2.3 rad', () => verificaRotazione(p, -2.3)],
      ['linearità ×2', () => verificaLinearita(p, 2)],
      ['linearità ×-3', () => verificaLinearita(p, -3)],
      ['scala ×2', () => verificaScala(p, 2)],
    ];
    for (const [nome, esegui] of prove) {
      let fuori;
      try {
        fuori = esegui();
      } catch (e) {
        esito.falliti.push({ seme, prova: nome, dettaglio: String(e) });
        continue;
      }
      if (fuori.length > 0) {
        const peggiore = fuori.reduce((a, b) => (a.scarto > b.scarto ? a : b));
        esito.falliti.push({
          seme, prova: nome,
          dettaglio: `${fuori.length} scostamenti, peggiore ${peggiore.nome} `
            + `scarto ${peggiore.scarto.toExponential(2)}`,
        });
      }
    }

    // §9.2 — equilibrio globale, su ogni struttura generata
    const r = analizzaCaso(p, CASO);
    if (!r.equilibrio.soddisfatto) {
      esito.falliti.push({
        seme, prova: 'equilibrio globale',
        dettaglio: `residuo ${r.equilibrio.residuoRelativo.toExponential(2)}`,
      });
    }
  }
  return esito;
}

function riporta(nome: string, e: Esito): void {
  const righe = e.falliti.slice(0, 8)
    .map((f) => `  seme ${f.seme} · ${f.prova} · ${f.dettaglio}`).join('\n');
  // eslint-disable-next-line no-console
  console.log(`${nome}: ${e.isostatici}/${e.provati} isostatiche, `
    + `${e.falliti.length} fallimenti${righe ? `\n${righe}` : ''}`);
}

describe('§10.2 — travi e telai semplici, angoli notevoli', () => {
  const semi = Array.from({ length: 120 }, (_, i) => 1000 + i);
  const e = campagna(semi, { aste: 2, angoliIrregolari: false, sconnessioni: false });

  it('genera abbastanza casi isostatici da essere significativa', () => {
    riporta('semplici', e);
    expect(e.isostatici).toBeGreaterThan(15);
  });

  it('nessun invariante violato', () => {
    expect(e.falliti).toEqual([]);
  });
});

describe('§10.2 — angoli irregolari', () => {
  const semi = Array.from({ length: 120 }, (_, i) => 5000 + i);
  const e = campagna(semi, { aste: 3, angoliIrregolari: true, sconnessioni: false });

  it('genera abbastanza casi', () => {
    riporta('angoli irregolari', e);
    expect(e.isostatici).toBeGreaterThan(5);
  });

  it('nessun invariante violato', () => {
    expect(e.falliti).toEqual([]);
  });
});

describe('§10.2 — con sconnessioni interne', () => {
  const semi = Array.from({ length: 150 }, (_, i) => 9000 + i);
  const e = campagna(semi, { aste: 3, angoliIrregolari: true, sconnessioni: true });

  it('genera abbastanza casi', () => {
    riporta('con sconnessioni', e);
    expect(e.isostatici).toBeGreaterThan(5);
  });

  it('nessun invariante violato', () => {
    expect(e.falliti).toEqual([]);
  });
});

/*
 * §10.3 — la campagna precedente passa, quindi si alza la complessità: più
 * aste, angoli tutti irregolari, sconnessioni. È il ciclo che il documento
 * chiede, e il senso è che una struttura più articolata mette sotto sforzo
 * la propagazione attraverso pieghe e nodi ramificati, che è dove il calcolo
 * a mano sbaglia e dove il codice ha più modi di sbagliare.
 */
describe('§10.3 — strutture articolate: sei aste', () => {
  const semi = Array.from({ length: 200 }, (_, i) => 20000 + i);
  const e = campagna(semi, { aste: 6, angoliIrregolari: true, sconnessioni: true });

  it('genera abbastanza casi', () => {
    riporta('sei aste', e);
    expect(e.isostatici).toBeGreaterThan(10);
  });

  it('nessun invariante violato', () => {
    expect(e.falliti).toEqual([]);
  });
});

describe('§10.3 — strutture articolate: dodici aste', () => {
  const semi = Array.from({ length: 200 }, (_, i) => 40000 + i);
  const e = campagna(semi, { aste: 12, angoliIrregolari: true, sconnessioni: true });

  it('genera abbastanza casi', () => {
    riporta('dodici aste', e);
    expect(e.isostatici).toBeGreaterThan(5);
  });

  it('nessun invariante violato', () => {
    expect(e.falliti).toEqual([]);
  });
});


/*
 * §5.1 — LE RAMIFICAZIONI, che il documento indica come punto fragile insieme
 * alle pieghe. Un nodo con tre o più aste rende indefinito «accumulare lungo
 * il percorso», e una spezzata aperta non ne produce mai: vanno generate
 * apposta, altrimenti la campagna gira dove il calcolo è facile.
 */
describe('§10.3 — nodi ramificati, tre o più aste convergenti', () => {
  const semi = Array.from({ length: 250 }, (_, i) => 60000 + i);
  const e = campagna(semi, {
    aste: 4, angoliIrregolari: true, sconnessioni: false, ramificazioni: true,
  });

  it('genera abbastanza casi ramificati', () => {
    riporta('ramificate', e);
    expect(e.isostatici).toBeGreaterThan(10);
  });

  it('nessun invariante violato', () => {
    expect(e.falliti).toEqual([]);
  });
});

describe('§10.3 — ramificate CON sconnessioni interne', () => {
  const semi = Array.from({ length: 250 }, (_, i) => 80000 + i);
  const e = campagna(semi, {
    aste: 5, angoliIrregolari: true, sconnessioni: true, ramificazioni: true,
  });

  it('genera abbastanza casi', () => {
    riporta('ramificate + sconnessioni', e);
    expect(e.isostatici).toBeGreaterThan(10);
  });

  it('nessun invariante violato', () => {
    expect(e.falliti).toEqual([]);
  });
});


describe('§10.3 — maglie chiuse rese isostatiche da cerniere', () => {
  const semi = Array.from({ length: 300 }, (_, i) => 100000 + i);
  const e = campagna(semi, {
    aste: 3, angoliIrregolari: true, sconnessioni: true, anello: true,
  });

  it('genera qualche anello isostatico', () => {
    riporta('anelli a tre cerniere', e);
    expect(e.isostatici).toBeGreaterThan(2);
  });

  it('nessun invariante violato', () => {
    expect(e.falliti).toEqual([]);
  });
});

/*
 * §1 — il carrello interno è il vincolo appena aggiunto, ed è l'unico interno
 * da un grado. Passarlo dalla campagna è il modo di scoprire subito se la sua
 * combinazione di rilasci — rotazione E scorrimento — regge sulle strutture
 * generate, invece di fidarsi dell'unico caso scritto a mano.
 */
describe('§10.3 — con doppio pendolo, pattino e carrello interno', () => {
  for (const tipo of ['bipendolo', 'pattino', 'carrelloInterno'] as const) {
    const semi = Array.from({ length: 200 }, (_, i) => 200000 + i);
    const e = campagna(semi, {
      aste: 3, angoliIrregolari: true, sconnessioni: true, tipoSconnessione: tipo,
    });

    it(`${tipo}: genera casi e non viola invarianti`, () => {
      riporta(tipo, e);
      expect(e.isostatici).toBeGreaterThan(3);
      expect(e.falliti).toEqual([]);
    });
  }
});

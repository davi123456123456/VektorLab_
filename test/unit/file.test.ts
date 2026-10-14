import { describe, it, expect } from 'vitest';
import { serializza, deserializza } from '../../src/state/file.js';
import { esempi } from '../../src/state/esempi.js';
import { migra } from '../../src/core/model/migrazione.js';
import { verificaIntegrita } from '../../src/core/model/integrita.js';

describe('file .vektor', () => {
  it('andata e ritorno: si riapre lo stesso progetto', () => {
    const p = esempi[0].costruisci();
    const esito = deserializza(serializza(p));
    expect('progetto' in esito).toBe(true);
    if ('progetto' in esito) expect(esito.progetto).toEqual(verificaIntegrita(migra(p)).progetto);
  });

  it('un testo che non è JSON non è un progetto', () => {
    expect(deserializza('ciao')).toEqual({ errore: 'Il file non è un progetto VektorLab' });
  });

  it('un JSON con i campi del tipo sbagliato non è un progetto, e non lancia', () => {
    expect(deserializza('{"nodi":[],"aste":[],"vincoliInterni":{}}'))
      .toEqual({ errore: 'Il file non è un progetto VektorLab' });
    expect(deserializza('{"nodi":[1],"aste":[{}]}'))
      .toEqual({ errore: 'Il file non è un progetto VektorLab' });
  });

  it('un JSON senza nodi né aste non è un progetto', () => {
    expect(deserializza('{"nome": "x"}')).toEqual({ errore: 'Il file non è un progetto VektorLab' });
  });
});

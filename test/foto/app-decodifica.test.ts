import { describe, expect, it } from 'vitest';
import { dimensioniDecodifica } from '../../src/foto/app/decodifica.js';

describe('dimensioni della foto decodificata', () => {
  it('una foto enorme si decodifica a 2400 px di lato lungo', () => {
    expect(dimensioniDecodifica(8000, 6000)).toEqual({ larghezza: 2400, altezza: 1800 });
    expect(dimensioniDecodifica(3000, 9000)).toEqual({ larghezza: 800, altezza: 2400 });
  });

  it('una foto piccola resta com\'è', () => {
    expect(dimensioniDecodifica(1000, 800)).toEqual({ larghezza: 1000, altezza: 800 });
  });
});

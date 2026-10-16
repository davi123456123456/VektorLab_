import { describe, expect, it } from 'vitest';
import { decodificaRidotta, dimensioniDecodifica } from '../../src/foto/app/decodifica.js';

describe('dimensioni della foto decodificata', () => {
  it('una foto enorme si decodifica a 2400 px di lato lungo', () => {
    expect(dimensioniDecodifica(8000, 6000)).toEqual({ larghezza: 2400, altezza: 1800 });
    expect(dimensioniDecodifica(3000, 9000)).toEqual({ larghezza: 800, altezza: 2400 });
  });

  it('una foto piccola resta com\'è', () => {
    expect(dimensioniDecodifica(1000, 800)).toEqual({ larghezza: 1000, altezza: 800 });
  });
});

describe('decodifica già ridotta (foto da 48 MP)', () => {
  type Opz = { resizeWidth?: number; resizeHeight?: number; imageOrientation?: string };
  const bitmap = (width: number, height: number) => ({ width, height, chiusa: false, close() { this.chiusa = true; } });

  it('foto orizzontale: una sola decodifica, larga 2400', async () => {
    const chiamate: Opz[] = [];
    const crea = async (_f: Blob, o: Opz = {}) => { chiamate.push(o); return bitmap(o.resizeWidth ?? 8000, o.resizeWidth ? 1800 : 6000); };
    const b = await decodificaRidotta(new Blob(), crea as never);
    expect([b.width, b.height]).toEqual([2400, 1800]);
    expect(chiamate).toEqual([{ imageOrientation: 'from-image', resizeQuality: 'high', resizeWidth: 2400 }]);
  });

  it('foto verticale: la seconda decodifica è limitata in altezza, la prima si chiude', async () => {
    const fatte: ReturnType<typeof bitmap>[] = [];
    const crea = async (_f: Blob, o: Opz = {}) => {
      const b = o.resizeWidth ? bitmap(2400, 3200) : bitmap(1800, 2400);
      fatte.push(b);
      return b;
    };
    const b = await decodificaRidotta(new Blob(), crea as never);
    expect([b.width, b.height]).toEqual([1800, 2400]);
    expect(fatte[0].chiusa).toBe(true);
  });

  it('un browser che non conosce le opzioni non rifiuta la foto', async () => {
    const crea = async (_f: Blob, o?: Opz) => {
      if (o && Object.keys(o).length > 0) throw new TypeError('opzione sconosciuta');
      return bitmap(4000, 3000);
    };
    const b = await decodificaRidotta(new Blob(), crea as never);
    expect([b.width, b.height]).toEqual([4000, 3000]);
  });
});

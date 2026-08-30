/**
 * §2 — inquadratura animata al doppio clic sul vuoto.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../../src/state/store.js';
import { progetto } from '../../src/core/builder.js';
import { preset } from '../../src/core/materials/sezioniParametriche.js';

function modello(luce = 10) {
  const p = progetto('t');
  const sez = p.sezioneParametrica('s', preset('IPE 200'));
  const a = p.nodo(0, 0);
  const b = p.nodo(luce, 0);
  p.asta(a, b, 'S275', sez);
  p.vincolo(a, 'cerniera');
  p.vincolo(b, 'carrello');
  return p.costruisci();
}

beforeEach(() => {
  useStore.setState({ transizioneCamera: null, animazioni: true });
  useStore.getState().caricaProgetto(modello());
  useStore.setState({
    camera: { ...useStore.getState().camera, larghezza: 800, altezza: 600 },
  });
});

describe('inquadratura animata', () => {
  it('parte solo se c è davvero da muoversi', () => {
    useStore.getState().inquadraTutto();
    useStore.getState().inquadraTuttoAnimato();
    expect(useStore.getState().transizioneCamera).toBeNull();
  });

  it('da una camera lontana avvia una transizione di 300 ms', () => {
    const c = useStore.getState().camera;
    useStore.setState({ camera: { ...c, zoom: c.zoom / 8, cx: c.cx + 40 } });
    useStore.getState().inquadraTuttoAnimato();
    const t = useStore.getState().transizioneCamera!;
    expect(t).not.toBeNull();
    expect(t.durata).toBe(300);
  });

  it('arriva esattamente sul bersaglio e poi si spegne', () => {
    const c = useStore.getState().camera;
    useStore.setState({ camera: { ...c, zoom: c.zoom / 8, cx: c.cx + 40 } });
    useStore.getState().inquadraTuttoAnimato();
    const t = useStore.getState().transizioneCamera!;

    useStore.getState().avanzaTransizioneCamera(t.inizio + 301);
    expect(useStore.getState().transizioneCamera).toBeNull();
    const finale = useStore.getState().camera;
    expect(finale.zoom).toBeCloseTo(t.a.zoom, 9);
    expect(finale.cx).toBeCloseTo(t.a.cx, 9);
    expect(finale.cy).toBeCloseTo(t.a.cy, 9);
  });

  it('lo zoom si interpola in scala logaritmica', () => {
    const c = useStore.getState().camera;
    useStore.setState({ camera: { ...c, zoom: c.zoom / 100, cx: c.cx } });
    useStore.getState().inquadraTuttoAnimato();
    const t = useStore.getState().transizioneCamera!;
    useStore.getState().avanzaTransizioneCamera(t.inizio + 150);
    // a metà del tempo l'easing vale 0.5, quindi lo zoom è la MEDIA
    // GEOMETRICA fra i due estremi, non quella aritmetica
    const atteso = Math.sqrt(t.da.zoom * t.a.zoom);
    const aritmetica = (t.da.zoom + t.a.zoom) / 2;
    expect(useStore.getState().camera.zoom).toBeCloseTo(atteso, 6);
    expect(useStore.getState().camera.zoom).toBeLessThan(aritmetica * 0.9);
  });

  it('non esce mai dal segmento fra partenza e arrivo', () => {
    const c = useStore.getState().camera;
    useStore.setState({ camera: { ...c, zoom: c.zoom / 8, cx: c.cx + 40 } });
    useStore.getState().inquadraTuttoAnimato();
    const t = useStore.getState().transizioneCamera!;
    const lo = Math.min(t.da.zoom, t.a.zoom), hi = Math.max(t.da.zoom, t.a.zoom);
    for (let ms = 0; ms <= 300; ms += 10) {
      useStore.getState().avanzaTransizioneCamera(t.inizio + ms);
      const z = useStore.getState().camera.zoom;
      expect(z).toBeGreaterThanOrEqual(lo - 1e-9);
      expect(z).toBeLessThanOrEqual(hi + 1e-9);
    }
  });

  it('senza animazioni salta direttamente al bersaglio', () => {
    const c = useStore.getState().camera;
    useStore.setState({ animazioni: false, camera: { ...c, zoom: c.zoom / 8 } });
    useStore.getState().inquadraTuttoAnimato();
    expect(useStore.getState().transizioneCamera).toBeNull();
    expect(useStore.getState().camera.zoom).toBeCloseTo(c.zoom, 6);
  });

  it('lascia il 10% di margine per lato', () => {
    const c = useStore.getState().camera;
    useStore.setState({ camera: { ...c, zoom: c.zoom / 8 } });
    useStore.getState().inquadraTuttoAnimato();
    const a = useStore.getState().transizioneCamera!.a;
    // la trave lunga 10 m deve occupare l'80% della larghezza utile
    expect((10 * a.zoom) / a.larghezza).toBeCloseTo(0.8, 6);
  });

  it('su un modello vuoto non fa niente', () => {
    useStore.getState().caricaProgetto(progetto('vuoto').costruisci());
    const prima = useStore.getState().camera;
    useStore.getState().inquadraTuttoAnimato();
    expect(useStore.getState().transizioneCamera).toBeNull();
    expect(useStore.getState().camera).toEqual(prima);
  });
});

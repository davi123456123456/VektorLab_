/**
 * Camera 2D: conversione fra coordinate del MONDO (metri, y verso l'alto) e
 * coordinate dello SCHERMO (pixel, y verso il basso).
 *
 * Il ribaltamento dell'asse y vive qui e solo qui. `core/` ragiona in
 * coordinate ingegneristiche e non sa che esiste uno schermo.
 */

export interface Punto {
  x: number;
  y: number;
}

export interface Camera {
  /** coordinate mondo del centro della vista */
  cx: number;
  cy: number;
  /** pixel per metro */
  zoom: number;
  /** dimensioni della viewport in pixel CSS */
  larghezza: number;
  altezza: number;
}

export const cameraIniziale = (larghezza = 800, altezza = 600): Camera => ({
  cx: 5, cy: 2, zoom: 60, larghezza, altezza,
});

export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 20000;

export function mondoASchermo(c: Camera, p: Punto): Punto {
  return {
    x: (p.x - c.cx) * c.zoom + c.larghezza / 2,
    y: c.altezza / 2 - (p.y - c.cy) * c.zoom,
  };
}

export function schermoAMondo(c: Camera, p: Punto): Punto {
  return {
    x: (p.x - c.larghezza / 2) / c.zoom + c.cx,
    y: c.cy - (p.y - c.altezza / 2) / c.zoom,
  };
}

/** Zoom mantenendo fermo il punto sotto il cursore. */
export function zoomVersoPuntatore(c: Camera, puntatore: Punto, fattore: number): Camera {
  const prima = schermoAMondo(c, puntatore);
  const zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, c.zoom * fattore));
  const dopo = schermoAMondo({ ...c, zoom }, puntatore);
  return { ...c, zoom, cx: c.cx + (prima.x - dopo.x), cy: c.cy + (prima.y - dopo.y) };
}

export function trasla(c: Camera, dxPixel: number, dyPixel: number): Camera {
  return { ...c, cx: c.cx - dxPixel / c.zoom, cy: c.cy + dyPixel / c.zoom };
}

/** Inquadra un rettangolo del mondo con un margine relativo. */
export function inquadra(
  c: Camera,
  xmin: number, ymin: number, xmax: number, ymax: number,
  margine = 0.15,
): Camera {
  // Se la viewport non è ancora stata misurata, inquadrare non ha senso: si
  // otterrebbe uno zoom assurdo, poi bloccato dal limite inferiore. Meglio
  // lasciare la camera com'è e riprovare quando le dimensioni arrivano.
  if (c.larghezza <= 1 || c.altezza <= 1) return c;

  const larghezzaMondo = Math.max(xmax - xmin, 1e-6);
  const altezzaMondo = Math.max(ymax - ymin, 1e-6);
  const zx = (c.larghezza * (1 - 2 * margine)) / larghezzaMondo;
  const zy = (c.altezza * (1 - 2 * margine)) / altezzaMondo;
  const zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.min(zx, zy)));
  return { ...c, zoom, cx: (xmin + xmax) / 2, cy: (ymin + ymax) / 2 };
}

/** Rettangolo del mondo attualmente visibile (per il culling del disegno). */
export function vistaMondo(c: Camera) {
  const a = schermoAMondo(c, { x: 0, y: 0 });
  const b = schermoAMondo(c, { x: c.larghezza, y: c.altezza });
  return {
    xmin: Math.min(a.x, b.x), xmax: Math.max(a.x, b.x),
    ymin: Math.min(a.y, b.y), ymax: Math.max(a.y, b.y),
  };
}

export const distanza = (a: Punto, b: Punto): number => Math.hypot(b.x - a.x, b.y - a.y);

/**
 * Stato dei pannelli laterali, con memoria fra una sessione e l'altra.
 *
 * Il valore predefinito è CHIUSO: si apre sul foglio pulito, con tutta l'area
 * di disegno disponibile. Il default vale solo al primo avvio; dopo, vince
 * quello che l'utente ha scelto l'ultima volta.
 *
 * Ogni accesso a localStorage è protetto: in navigazione privata alcuni
 * browser lanciano un'eccezione al solo tentativo di lettura, e una schermata
 * bianca all'avvio per una preferenza di larghezza sarebbe un pessimo scambio.
 */

import { useCallback, useEffect, useState } from 'react';

function leggi<T>(chiave: string, riserva: T): T {
  try {
    const grezzo = window.localStorage.getItem(chiave);
    return grezzo === null ? riserva : (JSON.parse(grezzo) as T);
  } catch {
    return riserva;
  }
}

function scrivi(chiave: string, valore: unknown): void {
  try {
    window.localStorage.setItem(chiave, JSON.stringify(valore));
  } catch {
    // preferenza non memorizzabile: pazienza, l'applicazione funziona uguale
  }
}

export interface PannelloLaterale {
  aperto: boolean;
  larghezza: number;
  alterna: () => void;
  apri: () => void;
  chiudi: () => void;
  impostaLarghezza: (v: number) => void;
}

export function usaPannelloLaterale(
  chiave: string,
  larghezzaPredefinita: number,
  apertoPredefinito = false,
  limiti: { min: number; max: number } = { min: 180, max: 460 },
): PannelloLaterale {
  const [aperto, setAperto] = useState(
    () => leggi(`vektorlab.${chiave}.aperto`, apertoPredefinito));
  const [larghezza, setLarghezza] = useState(
    () => leggi(`vektorlab.${chiave}.larghezza`, larghezzaPredefinita));

  useEffect(() => { scrivi(`vektorlab.${chiave}.aperto`, aperto); }, [chiave, aperto]);
  useEffect(() => { scrivi(`vektorlab.${chiave}.larghezza`, larghezza); }, [chiave, larghezza]);

  const impostaLarghezza = useCallback((v: number) => {
    setLarghezza(Math.min(limiti.max, Math.max(limiti.min, Math.round(v))));
  }, [limiti.min, limiti.max]);

  return {
    aperto,
    larghezza,
    alterna: useCallback(() => setAperto((v) => !v), []),
    apri: useCallback(() => setAperto(true), []),
    chiudi: useCallback(() => setAperto(false), []),
    impostaLarghezza,
  };
}

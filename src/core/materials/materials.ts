/**
 * Database dei materiali. Valori in unità SI.
 *
 * `comportamento` non è un'etichetta descrittiva: seleziona il CRITERIO DI
 * VERIFICA applicato in `checks/`.
 *   duttile   → von Mises (o Tresca), resistenza simmetrica a trazione e compressione
 *   fragile   → massima tensione normale / Mohr-Coulomb, con f_t ≠ f_c
 *   ortotropo → verifica combinata con proprietà dipendenti dall'angolo di fibratura
 */

import type { Materiale, MaterialId } from '../model/types.js';

const id = (s: string): MaterialId => s as MaterialId;

/** G ricavato da E e ν per materiali isotropi. */
const Giso = (E: number, nu: number): number => E / (2 * (1 + nu));

export const MATERIALI: Materiale[] = [
  /**
   * Acciaio generico: da usare quando la designazione esatta non è nota.
   *
   * Per il calcolo elastico serve pochissimo: E ≈ 210 GPa vale per TUTTI gli
   * acciai da costruzione — dal S235 all'inox — perché il modulo elastico
   * dipende dal reticolo del ferro e non dagli elementi di lega, che in tenore
   * ridotto lo lasciano praticamente invariato. Cambia invece molto la
   * RESISTENZA ALLO SNERVAMENTO, che dipende da composizione e trattamento:
   * è il solo dato che l'utente deve procurarsi, e qui si inserisce a mano.
   *
   * `fy` è deliberatamente ASSENTE. Un valore predefinito — anche cautelativo
   * — verrebbe usato senza accorgersene, e un coefficiente di sicurezza
   * calcolato su una resistenza che nessuno ha dichiarato è peggio di un
   * coefficiente che manca: il secondo si vede, il primo no. Finché non c'è,
   * la verifica di resistenza si dichiara impossibile; tutto il resto —
   * cinematica, reazioni, N/T/M, deformata — dipende da E, A e I e continua a
   * funzionare.
   */
  {
    id: id('ACCIAIO_GENERICO'), nome: 'Acciaio generico',
    famiglia: 'acciaio', comportamento: 'duttile',
    E: 210e9, G: Giso(210e9, 0.3), nu: 0.3, rho: 7850, alpha: 12e-6,
    resistenze: {}, gammaM: 1.05, curvaInstabilita: 'b',
    costoEuroKg: 1.2,
    riferimentoNormativo: 'E = 210 GPa vale per tutti gli acciai da costruzione; ' +
      'la tensione di snervamento va presa dal certificato del materiale.',
  },

  // ── acciai da carpenteria ────────────────────────────────────────────
  {
    id: id('S235'), nome: 'Acciaio S235', famiglia: 'acciaio', comportamento: 'duttile',
    E: 210e9, G: Giso(210e9, 0.3), nu: 0.3, rho: 7850, alpha: 12e-6,
    resistenze: { fy: 235e6, fu: 360e6 }, gammaM: 1.05, curvaInstabilita: 'b',
    costoEuroKg: 1.2, riferimentoNormativo: 'EN 10025-2 / NTC2018',
  },
  {
    id: id('S275'), nome: 'Acciaio S275', famiglia: 'acciaio', comportamento: 'duttile',
    E: 210e9, G: Giso(210e9, 0.3), nu: 0.3, rho: 7850, alpha: 12e-6,
    resistenze: { fy: 275e6, fu: 430e6 }, gammaM: 1.05, curvaInstabilita: 'b',
    costoEuroKg: 1.25, riferimentoNormativo: 'EN 10025-2 / NTC2018',
  },
  {
    id: id('S355'), nome: 'Acciaio S355', famiglia: 'acciaio', comportamento: 'duttile',
    E: 210e9, G: Giso(210e9, 0.3), nu: 0.3, rho: 7850, alpha: 12e-6,
    resistenze: { fy: 355e6, fu: 510e6 }, gammaM: 1.05, curvaInstabilita: 'b',
    costoEuroKg: 1.35, riferimentoNormativo: 'EN 10025-2 / NTC2018',
  },
  {
    id: id('AISI304'), nome: 'Acciaio inox AISI 304', famiglia: 'acciaio inossidabile',
    comportamento: 'duttile',
    E: 193e9, G: Giso(193e9, 0.3), nu: 0.3, rho: 8000, alpha: 17.3e-6,
    resistenze: { fy: 210e6, fu: 520e6 }, gammaM: 1.1, curvaInstabilita: 'c',
    costoEuroKg: 4.5, riferimentoNormativo: 'EN 1993-1-4',
  },

  // ── leghe leggere ────────────────────────────────────────────────────
  {
    id: id('AL6061T6'), nome: 'Alluminio 6061-T6', famiglia: 'alluminio',
    comportamento: 'duttile',
    E: 69e9, G: Giso(69e9, 0.33), nu: 0.33, rho: 2700, alpha: 23.6e-6,
    resistenze: { fy: 240e6, fu: 290e6 }, gammaM: 1.1, curvaInstabilita: 'b',
    costoEuroKg: 4.0, riferimentoNormativo: 'EN 1999-1-1',
  },
  {
    id: id('AL7075T6'), nome: 'Alluminio 7075-T6', famiglia: 'alluminio',
    comportamento: 'duttile',
    E: 71.7e9, G: Giso(71.7e9, 0.33), nu: 0.33, rho: 2810, alpha: 23.6e-6,
    resistenze: { fy: 460e6, fu: 540e6 }, gammaM: 1.1, curvaInstabilita: 'b',
    costoEuroKg: 9.0, riferimentoNormativo: 'ASTM B209',
  },
  {
    id: id('TI6AL4V'), nome: 'Titanio Ti-6Al-4V', famiglia: 'titanio',
    comportamento: 'duttile',
    E: 114e9, G: Giso(114e9, 0.34), nu: 0.34, rho: 4430, alpha: 8.6e-6,
    resistenze: { fy: 880e6, fu: 950e6 }, gammaM: 1.1, curvaInstabilita: 'b',
    costoEuroKg: 40, riferimentoNormativo: 'ASTM B265',
  },

  // ── materiali fragili ────────────────────────────────────────────────
  {
    id: id('GJL250'), nome: 'Ghisa grigia EN-GJL-250', famiglia: 'ghisa',
    comportamento: 'fragile',
    E: 110e9, G: Giso(110e9, 0.26), nu: 0.26, rho: 7200, alpha: 11e-6,
    resistenze: { ft: 250e6, fc: 850e6, fu: 250e6 }, gammaM: 1.5,
    costoEuroKg: 1.8, riferimentoNormativo: 'EN 1561',
  },
  {
    id: id('C25_30'), nome: 'Calcestruzzo C25/30', famiglia: 'calcestruzzo',
    comportamento: 'fragile',
    E: 31e9, G: Giso(31e9, 0.2), nu: 0.2, rho: 2500, alpha: 10e-6,
    resistenze: { ft: 2.6e6, fc: 25e6 }, gammaM: 1.5,
    costoEuroKg: 0.1, riferimentoNormativo: 'EN 1992-1-1 / NTC2018',
  },
  {
    id: id('C25_30_FESS'), nome: 'C.A. C25/30 (sezione fessurata)',
    famiglia: 'calcestruzzo armato', comportamento: 'fragile',
    // rigidezza ridotta convenzionalmente al 50 % per tener conto della fessurazione
    E: 15.5e9, G: Giso(15.5e9, 0.2), nu: 0.2, rho: 2500, alpha: 10e-6,
    resistenze: { ft: 0, fc: 25e6 }, gammaM: 1.5,
    costoEuroKg: 0.15, riferimentoNormativo: 'EN 1992-1-1 §7.4',
  },
  {
    id: id('VETRO'), nome: 'Vetro strutturale ricotto', famiglia: 'vetro',
    comportamento: 'fragile',
    E: 70e9, G: Giso(70e9, 0.23), nu: 0.23, rho: 2500, alpha: 9e-6,
    resistenze: { ft: 45e6, fc: 500e6 }, gammaM: 2.0,
    costoEuroKg: 3.0, riferimentoNormativo: 'EN 572 / CNR-DT 210',
  },

  // ── ortotropi ────────────────────────────────────────────────────────
  {
    id: id('GL24H'), nome: 'Legno lamellare GL24h', famiglia: 'legno',
    comportamento: 'ortotropo',
    E: 11.5e9, E2: 300e6, G: 650e6, nu: 0.35, rho: 420, alpha: 5e-6,
    resistenze: { fm: 24e6, ft: 19.2e6, fc: 24e6 }, gammaM: 1.45,
    costoEuroKg: 2.2, riferimentoNormativo: 'EN 14080 / EN 1995-1-1',
  },
  {
    id: id('C24'), nome: 'Legno massiccio C24', famiglia: 'legno',
    comportamento: 'ortotropo',
    E: 11e9, E2: 370e6, G: 690e6, nu: 0.35, rho: 420, alpha: 5e-6,
    resistenze: { fm: 24e6, ft: 14e6, fc: 21e6 }, gammaM: 1.5,
    costoEuroKg: 1.0, riferimentoNormativo: 'EN 338 / EN 1995-1-1',
  },
  {
    id: id('CFRP_UD'), nome: 'CFRP unidirezionale', famiglia: 'composito',
    comportamento: 'ortotropo',
    E: 135e9, E2: 10e9, G: 5e9, nu: 0.3, rho: 1600, alpha: -0.5e-6,
    resistenze: { ft: 1500e6, fc: 1200e6, fm: 1500e6 }, gammaM: 1.35,
    costoEuroKg: 40, riferimentoNormativo: 'CNR-DT 200',
  },
  {
    id: id('GFRP'), nome: 'GFRP', famiglia: 'composito', comportamento: 'ortotropo',
    E: 40e9, E2: 8e9, G: 4e9, nu: 0.28, rho: 1900, alpha: 6e-6,
    resistenze: { ft: 800e6, fc: 600e6, fm: 800e6 }, gammaM: 1.5,
    costoEuroKg: 8, riferimentoNormativo: 'CNR-DT 205',
  },

  // ── polimeri da stampa 3D ────────────────────────────────────────────
  {
    id: id('PLA'), nome: 'PLA (stampa 3D)', famiglia: 'polimero',
    comportamento: 'fragile',
    E: 3.5e9, G: Giso(3.5e9, 0.36), nu: 0.36, rho: 1250, alpha: 68e-6,
    resistenze: { ft: 50e6, fc: 70e6 }, gammaM: 2.0,
    costoEuroKg: 20, riferimentoNormativo: 'dato indicativo, dipende da riempimento e orientamento layer',
  },
  {
    id: id('PETG'), nome: 'PETG (stampa 3D)', famiglia: 'polimero',
    comportamento: 'duttile',
    E: 2.1e9, G: Giso(2.1e9, 0.4), nu: 0.4, rho: 1270, alpha: 70e-6,
    resistenze: { fy: 45e6, fu: 50e6 }, gammaM: 2.0,
    costoEuroKg: 22, riferimentoNormativo: 'dato indicativo, dipende da riempimento e orientamento layer',
  },
];

export const MATERIALE_PER_ID = new Map(MATERIALI.map((m) => [m.id, m]));

export function materialePerId(k: string): Materiale {
  const m = MATERIALE_PER_ID.get(k as MaterialId);
  if (!m) throw new Error(`Materiale sconosciuto: '${k}'`);
  return m;
}

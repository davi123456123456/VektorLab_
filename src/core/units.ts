/**
 * UNITÀ DI MISURA — regola fondamentale del progetto
 * ===================================================
 * `core/` lavora ESCLUSIVAMENTE nel Sistema Internazionale:
 *
 *   lunghezze  m        forze      N        momenti   N·m
 *   tensioni   Pa       angoli     rad      masse     kg
 *   temperature K (differenze)     densità  kg/m³
 *
 * Il file di progetto `.vektor` salva in SI. La conversione verso le unità
 * comode per l'utente (kN, kN·m, mm, MPa, gradi) avviene SOLO nei formatter
 * di `ui/`. Un unico punto di conversione = un unico posto dove sbagliare.
 *
 * TIPI BRANDATI
 * -------------
 * I tipi sotto sono "branded": `Metri` non è assegnabile a `Newton` anche se
 * entrambi sono `number` a runtime. Sono usati AL CONFINE del nucleo (modello
 * dati, proprietà di materiali e sezioni, risultati esposti).
 *
 * Dentro il kernel numerico (`linalg/`, `fem/`) si usa `number` puro: brandare
 * l'algebra lineare renderebbe illeggibile ogni prodotto matrice-vettore senza
 * aggiungere sicurezza reale, perché lì i numeri sono componenti di vettori
 * eterogenei per costruzione (un vettore di DOF mescola metri e radianti).
 */

declare const UNIT: unique symbol;
export type Unit<T extends string> = { readonly [UNIT]: T };

export type Metri = number & Unit<'m'>;
export type Newton = number & Unit<'N'>;
export type NewtonM = number & Unit<'N·m'>;
export type NewtonSuM = number & Unit<'N/m'>;
export type Pascal = number & Unit<'Pa'>;
export type Radianti = number & Unit<'rad'>;
export type Area = number & Unit<'m2'>;
export type Inerzia = number & Unit<'m4'>;
export type ModuloResistenza = number & Unit<'m3'>;
export type MomentoStatico = number & Unit<'m3s'>;
export type Densita = number & Unit<'kg/m3'>;
export type PerKelvin = number & Unit<'1/K'>;
export type DeltaT = number & Unit<'K'>;

/** Costruttori espliciti: rendono visibile nel codice dove si entra in SI. */
export const m = (v: number): Metri => v as Metri;
export const N = (v: number): Newton => v as Newton;
export const Nm = (v: number): NewtonM => v as NewtonM;
export const NsuM = (v: number): NewtonSuM => v as NewtonSuM;
export const Pa = (v: number): Pascal => v as Pascal;
export const rad = (v: number): Radianti => v as Radianti;
export const area = (v: number): Area => v as Area;
export const inerzia = (v: number): Inerzia => v as Inerzia;
export const modW = (v: number): ModuloResistenza => v as ModuloResistenza;
export const momS = (v: number): MomentoStatico => v as MomentoStatico;
export const densita = (v: number): Densita => v as Densita;
export const perK = (v: number): PerKelvin => v as PerKelvin;
export const dT = (v: number): DeltaT => v as DeltaT;

/** Toglie il brand: da usare all'ingresso del kernel numerico. */
export const raw = (v: number): number => v;

// ── fattori di conversione (usati SOLO da ui/, mai da core/) ────────────────
export const CONV = {
  mm_per_m: 1000,
  cm_per_m: 100,
  kN_per_N: 1e-3,
  kNm_per_Nm: 1e-3,
  MPa_per_Pa: 1e-6,
  GPa_per_Pa: 1e-9,
  gradi_per_rad: 180 / Math.PI,
} as const;

/** Accelerazione di gravità usata per il peso proprio [m/s²]. */
export const G_GRAVITA = 9.80665;

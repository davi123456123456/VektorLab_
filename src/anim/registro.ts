/**
 * Registro centrale delle animazioni.
 *
 * Vive fuori da React e viene fatto avanzare una volta per fotogramma dal
 * ciclo di disegno. Il renderer gli CHIEDE dei valori (quanto è comparsa
 * quest'asta? a che punto è il tracciamento del diagramma?) invece di
 * calcolarseli: così l'animazione è un livello a sé, e disattivarla non
 * richiede di toccare il codice di disegno.
 *
 * RISPETTO DELL'UTENTE — `prefers-reduced-motion` e l'interruttore globale
 * portano istantaneamente ogni animazione al suo valore finale. Non le
 * rallentano: le tolgono. Un'animazione lenta a chi soffre di vertigini è
 * peggio di nessuna animazione.
 */

import { Molla, MOLLE, Progressione, type ParametriMolla } from './molla.js';

/** Categorie di oggetti che possono comparire con un'animazione. */
export type TipoApparso = 'asta' | 'nodo' | 'vincolo' | 'carico';

interface Apparizione {
  tipo: TipoApparso;
  /** istante di comparsa, in secondi dall'avvio */
  istante: number;
  /** ritardo aggiuntivo, per gli effetti a cascata */
  ritardo: number;
}

/** Durate in secondi. Valori scelti per essere percepibili ma non attesi. */
export const DURATE = {
  apparizioneAsta: 0.28,
  apparizioneVincolo: 0.34,
  apparizioneCarico: 0.30,
  /** ritardo fra un carico e il successivo in una cascata */
  cascataCarico: 0.02,
  tracciamentoDiagramma: 0.55,
  transizioneRisultati: 0.45,
} as const;

export class RegistroAnimazioni {
  private tempo = 0;
  private ultimoIstante = 0;
  private apparizioni = new Map<string, Apparizione>();
  private molle = new Map<string, Molla>();
  private progressioni = new Map<string, Progressione>();
  /** quando false, ogni animazione è già al valore finale */
  private attive = true;

  // ── ciclo ──────────────────────────────────────────────────────────
  /** @param ora `performance.now()` in millisecondi */
  avanza(ora: number): number {
    const dt = this.ultimoIstante === 0
      ? 1 / 60
      : Math.min((ora - this.ultimoIstante) / 1000, 1 / 20);
    this.ultimoIstante = ora;
    this.tempo += dt;
    for (const m of this.molle.values()) m.aggiorna(dt);
    for (const p of this.progressioni.values()) p.aggiorna(dt);
    return dt;
  }

  get abilitate(): boolean { return this.attive; }

  imposta(attive: boolean): void {
    this.attive = attive;
    if (!attive) {
      // portare tutto al valore finale, non congelare a metà
      for (const m of this.molle.values()) m.imposta(m.obiettivo);
      for (const p of this.progressioni.values()) p.completa();
      this.apparizioni.clear();
    }
  }

  // ── apparizioni ────────────────────────────────────────────────────
  /**
   * Segnala che un oggetto è comparso. Chiamata dal confronto fra il modello
   * di questo fotogramma e quello precedente: nessuno deve ricordarsi di
   * notificare le animazioni quando crea qualcosa.
   */
  segnalaApparizione(id: string, tipo: TipoApparso, indiceCascata = 0): void {
    if (!this.attive || this.apparizioni.has(id)) return;
    this.apparizioni.set(id, {
      tipo, istante: this.tempo, ritardo: indiceCascata * DURATE.cascataCarico,
    });
  }

  /** Avanzamento dell'apparizione, in [0,1]. 1 se non sta comparendo. */
  apparizione(id: string): number {
    if (!this.attive) return 1;
    const a = this.apparizioni.get(id);
    if (!a) return 1;
    const durata = a.tipo === 'asta' ? DURATE.apparizioneAsta
      : a.tipo === 'vincolo' ? DURATE.apparizioneVincolo
      : a.tipo === 'carico' ? DURATE.apparizioneCarico
      : DURATE.apparizioneAsta;
    const t = (this.tempo - a.istante - a.ritardo) / durata;
    if (t >= 1) { this.apparizioni.delete(id); return 1; }
    return Math.max(0, t);
  }

  /** Dimentica gli oggetti spariti, così un id riusato ri-anima. */
  potaApparizioni(idPresenti: ReadonlySet<string>): void {
    for (const id of [...this.apparizioni.keys()]) {
      if (!idPresenti.has(id)) this.apparizioni.delete(id);
    }
  }

  // ── molle ──────────────────────────────────────────────────────────
  molla(chiave: string, iniziale: number, parametri: ParametriMolla = MOLLE.precisa): Molla {
    let m = this.molle.get(chiave);
    if (!m) { m = new Molla(iniziale, iniziale, parametri); this.molle.set(chiave, m); }
    return m;
  }

  /** Muove una molla verso un bersaglio; se le animazioni sono spente, salta. */
  verso(chiave: string, bersaglio: number, parametri?: ParametriMolla): number {
    const m = this.molla(chiave, bersaglio, parametri);
    if (!this.attive) { m.imposta(bersaglio); return bersaglio; }
    if (m.obiettivo !== bersaglio) m.vaiA(bersaglio, parametri);
    return m.valore;
  }

  // ── progressioni ───────────────────────────────────────────────────
  progressione(chiave: string, durata: number): Progressione {
    let p = this.progressioni.get(chiave);
    if (!p) { p = new Progressione(durata); p.completa(); this.progressioni.set(chiave, p); }
    return p;
  }

  avviaTracciamento(chiave: string, durata: number = DURATE.tracciamentoDiagramma): void {
    const p = this.progressione(chiave, durata);
    if (!this.attive) { p.completa(); return; }
    p.avvia();
  }

  avanzamento(chiave: string): number {
    if (!this.attive) return 1;
    return this.progressioni.get(chiave)?.valore ?? 1;
  }

  /** Tempo trascorso, per le animazioni cicliche (meccanismi, pulsazioni). */
  get orologio(): number { return this.tempo; }

  azzera(): void {
    this.apparizioni.clear();
    this.molle.clear();
    this.progressioni.clear();
  }
}

export const registro = new RegistroAnimazioni();

/** L'utente ha chiesto meno movimento a livello di sistema operativo? */
export function preferisceMenoMovimento(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

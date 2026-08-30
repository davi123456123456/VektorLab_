/**
 * Animazione a molla (spring physics).
 *
 * PERCHÉ NON UN EASING A DURATA FISSA — un easing è una funzione del tempo:
 * se il bersaglio cambia a metà transizione bisogna decidere se ripartire da
 * capo (scatto) o accodare (ritardo). Una molla è invece un sistema fisico con
 * posizione e VELOCITÀ: quando il bersaglio cambia, la velocità corrente resta
 * e il moto prosegue senza discontinuità. È ciò che rende le transizioni
 * interrompibili, che è la condizione perché non diano fastidio.
 *
 * Il moto è quello di un oscillatore smorzato:
 *
 *     ẍ = ω²·(bersaglio − x) − 2ζω·ẋ
 *
 * con ω = √(k/m) pulsazione e ζ = c/(2√(km)) smorzamento adimensionale.
 * ζ = 1 è lo smorzamento critico: raggiunge il bersaglio nel minor tempo
 * possibile senza oltrepassarlo. Sotto 1 rimbalza, ed è ciò che serve quando
 * l'animazione deve dire «è comparso qualcosa».
 */

export interface ParametriMolla {
  /** rigidezza: quanto tira verso il bersaglio */
  rigidezza: number;
  /** smorzamento adimensionale ζ; 1 = critico, <1 rimbalza */
  smorzamento: number;
  /**
   * Soglia di arresto, RELATIVA all'ampiezza del bersaglio.
   * Una soglia assoluta sarebbe sbagliata: la stessa molla può animare un
   * fattore di scala attorno a 1 o uno zoom attorno a 5000, e nel secondo caso
   * continuerebbe a iterare all'infinito per una differenza invisibile.
   */
  tolleranza?: number;
}

/** Preimpostazioni con un carattere riconoscibile. */
export const MOLLE = {
  /** transizione decisa, senza rimbalzo: per i valori numerici */
  precisa: { rigidezza: 170, smorzamento: 1 },
  /** morbida: per pan, zoom e scale */
  morbida: { rigidezza: 90, smorzamento: 0.9 },
  /** con rimbalzo: per gli elementi che compaiono */
  elastica: { rigidezza: 220, smorzamento: 0.55 },
  /** lenta e didattica: per la deformata che si inflette */
  didattica: { rigidezza: 45, smorzamento: 1 },
} as const satisfies Record<string, ParametriMolla>;

export class Molla {
  private velocita = 0;
  private parametri: ParametriMolla;

  constructor(
    private valoreCorrente: number,
    private bersaglio = valoreCorrente,
    parametri: ParametriMolla = MOLLE.precisa,
  ) {
    this.parametri = parametri;
  }

  get valore(): number { return this.valoreCorrente; }
  get obiettivo(): number { return this.bersaglio; }
  get inMovimento(): boolean {
    const relativa = this.parametri.tolleranza ?? 1e-4;
    const scala = Math.max(1, Math.abs(this.bersaglio));
    const toll = relativa * scala;
    return Math.abs(this.bersaglio - this.valoreCorrente) > toll
      || Math.abs(this.velocita) > toll;
  }

  /** Cambia il bersaglio conservando la velocità: la transizione non scatta. */
  vaiA(bersaglio: number, parametri?: ParametriMolla): void {
    this.bersaglio = bersaglio;
    if (parametri) this.parametri = parametri;
  }

  /** Salta al valore senza animare: per i reset e per prefers-reduced-motion. */
  imposta(valore: number): void {
    this.valoreCorrente = valore;
    this.bersaglio = valore;
    this.velocita = 0;
  }

  /**
   * Avanza di `dt` secondi. L'integrazione è semi-implicita (Euler
   * simplettico): con passi variabili come quelli di requestAnimationFrame
   * resta stabile dove l'Euler esplicito diverge.
   */
  aggiorna(dt: number): number {
    if (!this.inMovimento) {
      this.valoreCorrente = this.bersaglio;
      this.velocita = 0;
      return this.valoreCorrente;
    }
    // un fotogramma perso non deve far esplodere la simulazione
    const passo = Math.min(dt, 1 / 30);
    const omega = Math.sqrt(this.parametri.rigidezza);
    const zeta = this.parametri.smorzamento;

    const accelerazione =
      omega * omega * (this.bersaglio - this.valoreCorrente)
      - 2 * zeta * omega * this.velocita;
    this.velocita += accelerazione * passo;
    this.valoreCorrente += this.velocita * passo;
    return this.valoreCorrente;
  }
}

/**
 * Progressione 0 → 1 con durata fissa, per le animazioni di TRACCIAMENTO
 * (un diagramma che si disegna). Qui la molla sarebbe sbagliata: il
 * tracciamento deve essere monotono e finire, non oscillare attorno alla fine.
 */
export class Progressione {
  private trascorso = 0;
  private attiva = false;

  constructor(private durata: number) {}

  avvia(): void { this.trascorso = 0; this.attiva = true; }
  completa(): void { this.trascorso = this.durata; this.attiva = false; }
  get inCorso(): boolean { return this.attiva; }

  aggiorna(dt: number): number {
    if (this.attiva) {
      this.trascorso += dt;
      if (this.trascorso >= this.durata) { this.trascorso = this.durata; this.attiva = false; }
    }
    return this.valore;
  }

  /** Valore addolcito agli estremi: parte e finisce senza strappi. */
  get valore(): number {
    const t = this.durata > 0 ? Math.min(1, this.trascorso / this.durata) : 1;
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }

  get lineare(): number {
    return this.durata > 0 ? Math.min(1, this.trascorso / this.durata) : 1;
  }
}

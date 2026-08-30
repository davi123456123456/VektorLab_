/**
 * Costruttore fluente del modello. Non è indispensabile al nucleo, ma rende
 * leggibili i test e gli esempi: un caso di prova deve somigliare allo schema
 * strutturale che rappresenta, altrimenti verificarlo è più difficile che
 * scriverlo.
 */

import {
  IMPOSTAZIONI_DEFAULT, NESSUNO_SVINCOLO,
  type Asta, type Carico, type CasoDiCarico, type Combinazione, type ElementId,
  type ImpostazioniAnalisi, type LoadCaseId, type Materiale, type NodeId,
  type Progetto, type Sezione, type SvincoloEstremita, type TipoVincolo,
  type Riferimento, type CaricoDati, type LoadId,
  type DirezioneCarico, type ModoRiferimento, type Radianti,
  type VincoloSuAsta, type SconnessioneSuAsta, type VincoloInterno,
} from './model/types.js';
import {
  sezioneDaParametri, type ParametriSezione,
} from './materials/sezioniParametriche.js';
import { normalizzaVincolo } from './model/orientamento.js';

/**
 * Il costruttore accetta numeri semplici e li marca qui, in un unico punto:
 * è il confine fra "l'utente scrive 5000" e "il nucleo lavora in SI branded".
 */
const q = <T>(v: number): T => v as unknown as T;

export interface OpzioniAsta {
  svincoloIniziale?: Partial<SvincoloEstremita>;
  svincoloFinale?: Partial<SvincoloEstremita>;
  teoria?: Asta['teoria'];
  pesoProprio?: boolean;
  betaInstabilita?: number;
}

const sv = (p?: Partial<SvincoloEstremita>): SvincoloEstremita => ({
  N: p?.N ?? false, T: p?.T ?? false, M: p?.M ?? false,
});

export class CostruttoreProgetto {
  private nodi: Progetto['nodi'] = [];
  private aste: Asta[] = [];
  private carichi: Carico[] = [];
  private casi: CasoDiCarico[] = [];
  private combinazioni: Combinazione[] = [];
  private materiali: Materiale[] = [];
  private sezioni: Sezione[] = [];
  private vincoliSuAsta: VincoloSuAsta[] = [];
  private sconnessioni: SconnessioneSuAsta[] = [];
  private vincoliInterni: VincoloInterno[] = [];
  private impostazioni: ImpostazioniAnalisi = { ...IMPOSTAZIONI_DEFAULT };
  private contatore = 0;
  private casoCorrente: LoadCaseId;

  constructor(private nome = 'modello') {
    this.casoCorrente = 'principale' as LoadCaseId;
    this.casi.push({ id: this.casoCorrente, nome: 'Caso principale', natura: 'Q' });
  }

  private nuovoId(prefisso: string): string {
    return `${prefisso}${++this.contatore}`;
  }

  nodo(x: number, y: number, etichetta?: string): NodeId {
    const id = (etichetta ?? this.nuovoId('n')) as NodeId;
    this.nodi.push({ id, x: q(x), y: q(y), ...(etichetta ? { etichetta } : {}) });
    return id;
  }

  asta(
    i: NodeId, j: NodeId, materialeId: string, sezioneId: string, o: OpzioniAsta = {},
  ): ElementId {
    const id = this.nuovoId('a') as ElementId;
    this.aste.push({
      id, nodoIniziale: i, nodoFinale: j,
      materialeId: materialeId as Asta['materialeId'],
      sezioneId: sezioneId as Asta['sezioneId'],
      svincolo: { iniziale: sv(o.svincoloIniziale), finale: sv(o.svincoloFinale) },
      ...(o.teoria ? { teoria: o.teoria } : {}),
      ...(o.pesoProprio !== undefined ? { pesoProprio: o.pesoProprio } : {}),
      ...(o.betaInstabilita !== undefined ? { betaInstabilita: o.betaInstabilita } : {}),
    });
    return id;
  }

  /**
   * Vincolo esterno in un punto qualsiasi dell'asta. NON la interrompe: la
   * rotazione resta continua e la trave un solo corpo rigido.
   */
  vincoloSuAsta(
    astaId: ElementId, s: number, tipo: TipoVincolo, angolo = 0,
  ): string {
    const id = this.nuovoId('vs');
    this.vincoliSuAsta.push({
      id, astaId, s, vincolo: { tipo, angolo: q(angolo) },
    });
    return id;
  }

  /**
   * Sconnessione interna in un punto qualsiasi dell'asta: la divide in due
   * corpi rigidi. Nella cerniera il momento è nullo per definizione.
   */
  sconnessione(
    astaId: ElementId, s: number,
    tipo: 'cerniera' | 'bipendolo' | 'pattino' = 'cerniera', angolo?: number,
  ): string {
    const id = this.nuovoId('sc');
    this.sconnessioni.push({
      id, astaId, s, tipo,
      ...(angolo !== undefined ? { angolo: q<Radianti>(angolo) } : {}),
    });
    return id;
  }

  /**
   * Sconnessione interna su un NODO: riguarda tutte le aste che vi convergono,
   * oppure solo quelle elencate (sconnessione parziale).
   *
   * È il gesto che l'utente compie cliccando su un nodo interno: non deve
   * scegliere su quale asta mettere il rilascio, quello lo decide l'espansione.
   */
  sconnessioneNodale(
    nodoId: NodeId,
    tipo: 'cerniera' | 'bipendolo' | 'pattino' = 'cerniera',
    opzioni: { astaMaster?: ElementId; asteSvincolate?: ElementId[] } = {},
  ): string {
    const id = this.nuovoId('vi');
    this.vincoliInterni.push({
      id, tipo, nodoId,
      ...(opzioni.astaMaster ? { astaMaster: opzioni.astaMaster } : {}),
      ...(opzioni.asteSvincolate ? { asteSvincolate: opzioni.asteSvincolate } : {}),
    });
    return id;
  }

  vincolo(nodoId: NodeId, tipo: TipoVincolo, angolo = 0,
          rigidezza?: { kx: number | null; ky: number | null; krz: number | null }): this {
    const n = this.nodi.find((k) => k.id === nodoId);
    if (!n) throw new Error(`Nodo ${nodoId} non trovato.`);
    n.vincolo = normalizzaVincolo({
      tipo, angolo: q(angolo), ...(rigidezza ? { rigidezza } : {}),
    });
    return this;
  }

  private aggiungi(dati: CaricoDati): this {
    const id = this.nuovoId('c') as unknown as LoadId;
    this.carichi.push({ ...dati, id, casoId: this.casoCorrente } as Carico);
    return this;
  }

  forza(nodoId: NodeId, fx: number, fy: number): this {
    return this.aggiungi({ tipo: 'forzaNodale', nodoId, fx: q(fx), fy: q(fy) });
  }
  momento(nodoId: NodeId, mz: number): this {
    return this.aggiungi({ tipo: 'momentoNodale', nodoId, mz: q(mz) });
  }
  /**
   * Carico distribuito. Il verso è nel SEGNO di `q`; la direzione nel modo.
   * Il modo predefinito è `globaleY`, che è ciò che si intende scrivendo
   * `distribuito(asta, -10e3)`: dieci kilonewton al metro verso il basso.
   */
  distribuito(
    astaId: ElementId, q1: number,
    o: {
      q2?: number; s1?: number; s2?: number;
      modo?: ModoRiferimento; alpha?: number; perProiezione?: boolean;
    } = {},
  ): this {
    const direzione: DirezioneCarico = {
      modo: o.modo ?? 'globaleY',
      ...(o.alpha !== undefined ? { alpha: q<Radianti>(o.alpha) } : {}),
      ...(o.perProiezione ? { perProiezione: true } : {}),
    };
    return this.aggiungi({
      tipo: 'distribuito', astaId, direzione,
      sIniziale: o.s1 ?? 0, sFinale: o.s2 ?? 1,
      q1: q(q1), q2: q(o.q2 ?? q1),
    });
  }
  forzaInCampata(astaId: ElementId, s: number, fx: number, fy: number,
                 riferimento: Riferimento = 'locale'): this {
    return this.aggiungi({
      tipo: 'forzaInCampata', astaId, s, fx: q(fx), fy: q(fy), riferimento,
    });
  }
  momentoInCampata(astaId: ElementId, s: number, mz: number): this {
    return this.aggiungi({ tipo: 'momentoInCampata', astaId, s, mz: q(mz) });
  }
  termico(astaId: ElementId, uniforme: number, gradiente = 0): this {
    return this.aggiungi({
      tipo: 'termico', astaId,
      deltaTUniforme: q(uniforme), deltaTGradiente: q(gradiente),
    });
  }
  cedimento(nodoId: NodeId, ux: number, uy: number, rz = 0): this {
    return this.aggiungi({
      tipo: 'cedimento', nodoId, ux: q(ux), uy: q(uy), rz: q(rz),
    });
  }

  caso(id: string, nome: string, natura: CasoDiCarico['natura'] = 'Q'): this {
    const cid = id as LoadCaseId;
    if (!this.casi.some((c) => c.id === cid)) this.casi.push({ id: cid, nome, natura });
    this.casoCorrente = cid;
    return this;
  }

  combinazione(id: string, nome: string, tipo: Combinazione['tipo'],
               termini: { casoId: string; coefficiente: number }[]): this {
    this.combinazioni.push({
      id: id as Combinazione['id'], nome, tipo,
      termini: termini.map((t) => ({ casoId: t.casoId as LoadCaseId, coefficiente: t.coefficiente })),
    });
    return this;
  }

  materiale(m: Materiale): this { this.materiali.push(m); return this; }
  sezione(s: Sezione): this { this.sezioni.push(s); return this; }

  /**
   * Sezione definita per MISURE. È la forma da preferire: porta con sé i
   * parametri, quindi la verifica tensionale può ricavare b(y) e S(y).
   */
  sezioneParametrica(id: string, parametri: ParametriSezione, nome?: string): string {
    this.sezioni.push(sezioneDaParametri(parametri, id, nome));
    return id;
  }
  imposta(p: Partial<ImpostazioniAnalisi>): this {
    this.impostazioni = { ...this.impostazioni, ...p };
    return this;
  }

  costruisci(): Progetto {
    // il caso predefinito viene scartato se è rimasto vuoto e ne esistono altri:
    // altrimenti i report mostrerebbero un caso di carico fantasma
    const usati = new Set(this.carichi.map((c) => c.casoId));
    const casi = this.casi.length > 1
      ? this.casi.filter((c) => usati.has(c.id))
      : this.casi;

    return {
      versioneFormato: 1, nome: this.nome,
      nodi: this.nodi, aste: this.aste, vincoliInterni: this.vincoliInterni,
      vincoliSuAsta: this.vincoliSuAsta, sconnessioni: this.sconnessioni,
      carichi: this.carichi, casi, combinazioni: this.combinazioni,
      materialiPersonalizzati: this.materiali, sezioniPersonalizzate: this.sezioni,
      impostazioni: this.impostazioni,
    };
  }
}

export const progetto = (nome?: string): CostruttoreProgetto =>
  new CostruttoreProgetto(nome);

export { NESSUNO_SVINCOLO };

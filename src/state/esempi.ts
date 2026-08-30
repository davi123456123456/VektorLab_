/**
 * Modelli di esempio precaricati.
 *
 * Servono a due cose: dare qualcosa da toccare a chi apre il programma per la
 * prima volta, e fornire casi di prova riproducibili durante lo sviluppo.
 * Sono geometrie classiche riconoscibili da chiunque abbia dato Scienza delle
 * Costruzioni.
 */

import { progetto } from '../core/builder.js';
import type { Progetto } from '../core/model/types.js';
import {
  preset, type ParametriSezione,
} from '../core/materials/sezioniParametriche.js';

export interface Esempio {
  nome: string;
  descrizione: string;
  costruisci: () => Progetto;
}

const MAT = 'S275';

/**
 * Gli esempi definiscono sezioni PER MISURE, non per nome tabellato: solo
 * così la verifica tensionale può ricavare b(y) e S(y) e calcolare la
 * tensione ideale al raccordo anima-ala.
 */
const IPE = (profilo: string): ParametriSezione => preset(profilo);
const TUBO = (D: number, s: number): ParametriSezione =>
  ({ famiglia: 'circolareCava', D, s });
const RETT = (B: number, H: number): ParametriSezione =>
  ({ famiglia: 'rettangolarePiena', B, H });

export const esempi: Esempio[] = [
  {
    nome: 'Portale',
    descrizione: 'Telaio a portale 6×4 m, piedi incastrati, carico sul traverso e vento in testa',
    costruisci() {
      const p = progetto('Portale 6×4 m');
      const colonna = p.sezioneParametrica('sezColonna', IPE('IPE 240'));
      const traverso = p.sezioneParametrica('sezTraverso', IPE('IPE 330'));
      const p1 = p.nodo(0, 0, 'piede-sx');
      const t1 = p.nodo(0, 4, 'testa-sx');
      const t2 = p.nodo(6, 4, 'testa-dx');
      const p2 = p.nodo(6, 0, 'piede-dx');
      p.asta(p1, t1, MAT, colonna);
      const trave = p.asta(t1, t2, MAT, traverso);
      p.asta(t2, p2, MAT, colonna);
      p.vincolo(p1, 'incastro');
      p.vincolo(p2, 'incastro');
      p.distribuito(trave, -25000);
      p.forza(t1, 15000, 0);
      return p.costruisci();
    },
  },
  {
    nome: 'Gerber',
    descrizione: 'Trave Gerber su tre appoggi con cerniera interna: isostatica',
    costruisci() {
      const p = progetto('Trave Gerber');
      const sez = p.sezioneParametrica('sezTrave', IPE('IPE 400'));
      const a = p.nodo(0, 0, 'A');
      const g = p.nodo(6, 0, 'G');
      const b = p.nodo(8, 0, 'B');
      const c = p.nodo(12, 0, 'C');
      const a1 = p.asta(a, g, MAT, sez);
      const a2 = p.asta(g, b, MAT, sez, { svincoloIniziale: { M: true } });
      const a3 = p.asta(b, c, MAT, sez);
      p.vincolo(a, 'cerniera');
      p.vincolo(b, 'carrello');
      p.vincolo(c, 'carrello');
      for (const x of [a1, a2, a3]) p.distribuito(x, -15000);
      return p.costruisci();
    },
  },
  {
    nome: 'Capriata',
    descrizione: 'Capriata reticolare a 6 campi, luce 12 m',
    costruisci() {
      const p = progetto('Capriata 12 m');
      const luce = 12, altezza = 2.2, campi = 6;
      const passo = luce / campi;
      const inf = Array.from({ length: campi + 1 }, (_, i) => p.nodo(i * passo, 0));
      const sup = Array.from({ length: campi - 1 }, (_, i) =>
        p.nodo((i + 1) * passo, altezza * (1 - Math.abs((i + 1) - campi / 2) / (campi / 2)) + 0.6));
      const corrente = p.sezioneParametrica('sezCorrente', TUBO(0.168, 0.010),
                                            'Tubo Ø168×10 (correnti)');
      const anima = p.sezioneParametrica('sezAnima', TUBO(0.114, 0.006),
                                         'Tubo Ø114×6 (anime)');
      for (let i = 0; i < campi; i++) p.asta(inf[i], inf[i + 1], MAT, corrente);
      for (let i = 0; i < sup.length - 1; i++) p.asta(sup[i], sup[i + 1], MAT, corrente);
      p.asta(inf[0], sup[0], MAT, corrente);
      p.asta(sup[sup.length - 1], inf[campi], MAT, corrente);
      for (let i = 0; i < sup.length; i++) {
        p.asta(inf[i + 1], sup[i], MAT, anima);
        if (i < sup.length - 1) p.asta(sup[i], inf[i + 2], MAT, anima);
      }
      p.vincolo(inf[0], 'cerniera');
      p.vincolo(inf[campi], 'carrello');
      for (let i = 1; i < campi; i++) p.forza(inf[i], 0, -20000);
      return p.costruisci();
    },
  },
  {
    nome: 'Arco 3 cerniere',
    descrizione: 'Arco a tre cerniere, luce 10 m, freccia 3 m',
    costruisci() {
      const p = progetto('Arco a tre cerniere');
      const luce = 10, freccia = 3;
      const n = 8;
      const sinistra = [];
      for (let i = 0; i <= n; i++) {
        const x = (luce / 2) * (i / n);
        const y = freccia * Math.sin((Math.PI * x) / luce);
        sinistra.push(p.nodo(x, y));
      }
      const destra = [];
      for (let i = 1; i <= n; i++) {
        const x = luce / 2 + (luce / 2) * (i / n);
        const y = freccia * Math.sin((Math.PI * x) / luce);
        destra.push(p.nodo(x, y));
      }
      const sez = p.sezioneParametrica('sezArco', RETT(0.25, 0.40));
      const aste = [];
      for (let i = 0; i < n; i++) aste.push(p.asta(sinistra[i], sinistra[i + 1], MAT, sez));
      aste.push(p.asta(sinistra[n], destra[0], MAT, sez, { svincoloIniziale: { M: true } }));
      for (let i = 0; i < destra.length - 1; i++) {
        aste.push(p.asta(destra[i], destra[i + 1], MAT, sez));
      }
      p.vincolo(sinistra[0], 'cerniera');
      p.vincolo(destra[destra.length - 1], 'cerniera');
      // carico verticale misurato IN PROIEZIONE, come la neve: su un arco è la
      // misura che conta, e senza un carico l'arco non mostrerebbe la spinta
      // orizzontale, che è la ragione per cui lo si guarda
      for (const a of aste) {
        p.distribuito(a, -5000, { modo: 'globaleY', perProiezione: true });
      }
      return p.costruisci();
    },
  },
  {
    nome: 'Concorrenti',
    descrizione: 'Tre bielle le cui rette d\'azione concorrono in un punto: labile, e il conteggio non se ne accorge',
    costruisci() {
      const p = progetto('Reazioni concorrenti');
      // triangolo rigido; ogni biella è diretta lungo la congiungente
      // nodo–origine, quindi le tre rette d'azione passano tutte per l'origine
      const a = p.nodo(0, 4);
      const b = p.nodo(-3, -2);
      const c = p.nodo(3, -2);
      const sez = p.sezioneParametrica('sezTriangolo', TUBO(0.15, 0.008));
      p.asta(a, b, MAT, sez);
      p.asta(b, c, MAT, sez);
      p.asta(c, a, MAT, sez);
      // l'angolo è il PUNTAMENTO: û = (−sin α, cos α). Per una biella diretta
      // lungo θ si scrive α = θ − 90°.
      p.vincolo(a, 'biella', Math.atan2(4, 0) - Math.PI / 2);
      p.vincolo(b, 'biella', Math.atan2(-2, -3) - Math.PI / 2);
      p.vincolo(c, 'biella', Math.atan2(-2, 3) - Math.PI / 2);
      p.forza(a, 12000, 0);
      return p.costruisci();
    },
  },
  {
    nome: 'Arco degenere',
    descrizione: 'Arco a tre cerniere con le cerniere ALLINEATE: il caso limite in cui la spinta diverge',
    costruisci() {
      const p = progetto('Tre cerniere allineate');
      const a = p.nodo(0, 0);
      const c = p.nodo(5, 0);
      const b = p.nodo(10, 0);
      const sez = p.sezioneParametrica('sezArco', RETT(0.25, 0.40));
      p.asta(a, c, MAT, sez);
      p.asta(c, b, MAT, sez, { svincoloIniziale: { M: true } });
      p.vincolo(a, 'cerniera');
      p.vincolo(b, 'cerniera');
      p.forza(c, 0, -20000);
      return p.costruisci();
    },
  },
  {
    nome: 'Labile',
    descrizione: 'Tre carrelli paralleli: il conteggio dice isostatica, il rango dice labile',
    costruisci() {
      const p = progetto('Tre carrelli paralleli');
      const n0 = p.nodo(0, 0);
      const n1 = p.nodo(3, 0);
      const n2 = p.nodo(6, 0);
      const sez = p.sezioneParametrica('sezTrave', IPE('IPE 300'));
      p.asta(n0, n1, MAT, sez);
      p.asta(n1, n2, MAT, sez);
      p.vincolo(n0, 'carrello', 0);
      p.vincolo(n1, 'carrello', 0);
      p.vincolo(n2, 'carrello', 0);
      p.forza(n1, 5000, -10000);
      return p.costruisci();
    },
  },
];

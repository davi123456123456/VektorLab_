/**
 * Confronto fra materiali a struttura e carichi invariati.
 *
 * È la funzione più istruttiva del programma: mostra che scegliere un
 * materiale non è scegliere «il più resistente». A parità di geometria,
 * l'alluminio pesa un terzo dell'acciaio ma si deforma tre volte tanto,
 * perché E scende più di quanto scenda ρ; il legno lamellare è competitivo in
 * rapporto resistenza/peso e disastroso in rigidezza; il titanio risolve tutto
 * e costa quaranta volte. Il compromesso si vede solo mettendo le colonne una
 * accanto all'altra.
 *
 * Il calcolo rifà l'analisi per ogni materiale: le sollecitazioni cambiano
 * davvero in una struttura iperstatica, perché la ripartizione dipende dalle
 * rigidezze relative. Superporre o riscalare i risultati sarebbe sbagliato.
 */

import { analizzaCaso, analizzaCombinazione } from '../index.js';
import { G_GRAVITA } from '../units.js';
import type { CombinationId, LoadCaseId, Materiale, Progetto } from '../model/types.js';
import { verificaStruttura } from './index.js';

export interface RigaConfronto {
  materialeId: string;
  nome: string;
  comportamento: Materiale['comportamento'];
  /** massa totale della struttura [kg] */
  massa: number;
  /** peso [N] */
  peso: number;
  /** spostamento nodale massimo [m] */
  spostamentoMassimo: number;
  /** sfruttamento massimo a resistenza */
  sfruttamentoMassimo: number;
  /** coefficiente di sicurezza minimo */
  coefficienteMinimo: number;
  /** true se tutte le aste verificano a resistenza */
  verificato: boolean;
  /** true se tutte le aste compresse verificano a instabilità */
  stabile: boolean;
  /** costo indicativo [€] */
  costo: number | null;
  /** errore, se l'analisi non è riuscita */
  errore?: string;
}

export type SorgenteConfronto =
  | { tipo: 'caso'; id: LoadCaseId }
  | { tipo: 'combinazione'; id: CombinationId };

export function massaStruttura(p: Progetto, materiale: Materiale): number {
  const nodi = new Map(p.nodi.map((n) => [n.id, n]));
  const sezioni = new Map(p.sezioniPersonalizzate.map((s) => [s.id, s]));
  let massa = 0;
  for (const a of p.aste) {
    const ni = nodi.get(a.nodoIniziale), nj = nodi.get(a.nodoFinale);
    const sez = sezioni.get(a.sezioneId);
    if (!ni || !nj || !sez) continue;
    const L = Math.hypot(nj.x - ni.x, nj.y - ni.y);
    massa += materiale.rho * sez.A * L;
  }
  return massa;
}

export function confrontaMateriali(
  progetto: Progetto,
  sorgente: SorgenteConfronto,
  materiali: Materiale[],
): RigaConfronto[] {
  const righe: RigaConfronto[] = [];

  for (const m of materiali) {
    // stessa geometria, stesse sezioni, stessi carichi: cambia solo il materiale
    const variante: Progetto = {
      ...progetto,
      aste: progetto.aste.map((a) => ({ ...a, materialeId: m.id })),
    };
    const massa = massaStruttura(variante, m);

    try {
      const r = sorgente.tipo === 'caso'
        ? analizzaCaso(variante, sorgente.id, {
            sezioniExtra: variante.sezioniPersonalizzate,
            materialiExtra: variante.materialiPersonalizzati,
          })
        : analizzaCombinazione(variante, sorgente.id, {
            sezioniExtra: variante.sezioniPersonalizzate,
            materialiExtra: variante.materialiPersonalizzati,
          });

      const v = verificaStruttura(variante, r, {
        sezioniExtra: variante.sezioniPersonalizzate,
        materialiExtra: variante.materialiPersonalizzati,
      });

      const sfruttamenti = v.perAsta.map((x) => x.sfruttamento);
      const coefficienti = v.perAsta.map((x) => x.coefficienteSicurezza);

      righe.push({
        materialeId: m.id as string,
        nome: m.nome,
        comportamento: m.comportamento,
        massa,
        peso: massa * G_GRAVITA,
        spostamentoMassimo: r.spostamentoMassimo,
        sfruttamentoMassimo: sfruttamenti.length ? Math.max(...sfruttamenti) : 0,
        coefficienteMinimo: coefficienti.length ? Math.min(...coefficienti) : Infinity,
        verificato: v.tutteVerificate && v.perAsta.length > 0,
        stabile: v.tutteStabili,
        costo: m.costoEuroKg !== undefined ? massa * m.costoEuroKg : null,
      });
    } catch (e) {
      righe.push({
        materialeId: m.id as string, nome: m.nome, comportamento: m.comportamento,
        massa, peso: massa * G_GRAVITA,
        spostamentoMassimo: NaN, sfruttamentoMassimo: NaN,
        coefficienteMinimo: NaN, verificato: false, stabile: false,
        costo: null, errore: (e as Error).message,
      });
    }
  }

  return righe;
}

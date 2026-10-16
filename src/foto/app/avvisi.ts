/**
 * Le voci «Da controllare» dopo il disegno dalla foto: il messaggio della
 * lettura e gli elementi del progetto che cita, da selezionare con un tocco.
 * Vivono solo nell'interfaccia: non entrano nel progetto né nel .vektor.
 */

import type { ElementId, NodeId } from '../../core/model/types.js';
import type { Avviso } from '../tipi.js';
import type { ElementiDaPunti } from '../traduci.js';

export interface AvvisoApp { messaggio: string; nodi: NodeId[]; aste: ElementId[] }

export function avvisiApp(avvisi: Avviso[], elementi: ElementiDaPunti): AvvisoApp[] {
  return avvisi.map((a) => {
    const nodi = new Set<NodeId>(), aste = new Set<ElementId>();
    for (const p of a.punti ?? []) {
      elementi[p]?.nodi.forEach((n) => nodi.add(n));
      elementi[p]?.aste.forEach((x) => aste.add(x));
    }
    return { messaggio: a.messaggio, nodi: [...nodi], aste: [...aste] };
  });
}

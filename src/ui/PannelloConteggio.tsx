/**
 * Il conteggio, sempre visibile.
 *
 * È il pannello che risponde alla domanda che uno studente si pone davvero:
 * questa struttura sta in piedi, e perché. Sta a sinistra e non dentro una
 * modalità perché il numero dei corpi rigidi cambia MENTRE si disegna, ed è in
 * quel momento — non dopo — che serve vederlo cambiare.
 *
 * La riga che conta è il RANGO. Il conteggio 3n − v da solo dichiara
 * isostatiche strutture labili con vincoli mal disposti (tre carrelli
 * paralleli, tre cerniere allineate): labilità e iperstaticità possono
 * coesistere, e solo il rango le distingue.
 */

import { useStore } from '../state/store.js';

export function PannelloConteggio() {
  const c = useStore((s) => s.cinematica);
  const evidenzia = useStore((s) => s.impostaEvidenziaConteggio);
  const coloraCorpi = useStore((s) => s.coloraCorpi);
  const alternaColori = useStore((s) => s.alternaColoraCorpi);
  const nAste = useStore((s) => s.progetto.aste.length);

  if (!c) {
    return (
      <div className="border-b px-3 py-2" style={{ borderColor: 'var(--bordo)' }}>
        <Titolo />
        <p className="text-[length:var(--t-minuto)]" style={{ color: 'var(--testo-debole)' }}>
          {nAste === 0
            ? 'Disegna la prima asta e il conteggio comincia.'
            : 'Modello troppo grande per il conteggio continuo: usa la modalità Analisi.'}
        </p>
      </div>
    );
  }

  const colore = c.labilita > 0 ? 'var(--vincolo)'
    : c.iperstaticita > 0 ? 'var(--momento)' : 'var(--carico)';

  return (
    <div className="border-b px-3 py-2" style={{ borderColor: 'var(--bordo)' }}>
      <Titolo />
      <table className="numerico w-full text-[length:var(--t-minuto)]">
        <tbody>
          <Riga
            etichetta="corpi rigidi"
            valore={`n = ${c.numeroCorpi}`}
            coda={`gdl ${c.gradiLiberta}`}
            onHover={() => evidenzia('corpi')}
            onLeave={() => evidenzia(null)}
            onClick={alternaColori}
            attivo={coloraCorpi}
            aiuto="Clicca per colorare ogni corpo rigido con una tinta distinta"
          />
          <Riga
            etichetta="vincoli esterni"
            valore={String(c.gradiVincoloEsterni)}
            onHover={() => evidenzia('esterni')}
            onLeave={() => evidenzia(null)}
            aiuto="Gradi di vincolo dei vincoli a terra"
          />
          <Riga
            etichetta="vincoli interni"
            valore={String(c.gradiVincoloInterni)}
            onHover={() => evidenzia('interni')}
            onLeave={() => evidenzia(null)}
            aiuto="Gradi di vincolo delle sconnessioni: 2(m−1) per una cerniera fra m aste"
          />
          <Riga etichetta="gradi di vincolo" valore={`v = ${c.gradiVincolo}`} bordoSopra />
          <Riga
            etichetta="rango"
            valore={String(c.rango)}
            aiuto="È il rango, non la differenza 3n − v, a dire come stanno le cose: intercetta i vincoli mal disposti, e labilità e iperstaticità possono coesistere"
          />
          <Riga etichetta="labilità" valore={`3n − r = ${c.labilita}`} bordoSopra />
          <Riga etichetta="iperstaticità" valore={`v − r = ${c.iperstaticita}`} />
        </tbody>
      </table>

      <div className="pt-1 text-[length:var(--t-minuto)] font-semibold uppercase tracking-wide"
           style={{ color: colore }}>
        {c.classificazione}
      </div>

      {c.anelliChiusi > 0 && (
        <p className="pt-1 text-[length:var(--t-minuto)] leading-relaxed" style={{ color: 'var(--momento)' }}>
          {c.anelliChiusi === 1 ? 'Un anello chiuso' : `${c.anelliChiusi} anelli chiusi`}:
          {' '}altre {c.iperstaticitaInterna} iperstaticità <b>interne</b>, che questo
          bilancio non vede. Le sollecitazioni vanno calcolate col FEM.
        </p>
      )}
    </div>
  );
}

function Titolo() {
  return (
    <div className="mb-1 text-[length:var(--t-minuto)] font-semibold uppercase tracking-wider"
         style={{ color: 'var(--testo-debole)' }}>
      Conteggio
    </div>
  );
}

function Riga({
  etichetta, valore, coda, onHover, onLeave, onClick, attivo, aiuto, bordoSopra,
}: {
  etichetta: string; valore: string; coda?: string;
  onHover?: () => void; onLeave?: () => void; onClick?: () => void;
  attivo?: boolean; aiuto?: string; bordoSopra?: boolean;
}) {
  return (
    <tr
      title={aiuto}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      onClick={onClick}
      className={onClick ? 'cursor-pointer' : undefined}
      style={{
        background: attivo ? 'var(--accento-scuro)' : undefined,
        borderTop: bordoSopra ? '1px solid var(--bordo)' : undefined,
      }}
    >
      <td className="whitespace-nowrap py-[1px] pr-1" style={{ color: 'var(--testo-attenuato)' }}>
        {etichetta}
      </td>
      <td className="whitespace-nowrap py-[1px] text-right" style={{ color: 'var(--testo)' }}>
        {valore}
      </td>
      <td className="whitespace-nowrap py-[1px] pl-1 text-right"
          style={{ color: 'var(--testo-debole)' }}>
        {coda ?? ''}
      </td>
    </tr>
  );
}

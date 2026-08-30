/**
 * Il marchio, in un componente solo.
 *
 * Sta qui e non sparso nell'interfaccia perché un nome cambia — questo l'ha
 * già fatto una volta — e quando succede deve cambiare in un punto, non in
 * dodici. Anche il titolo della finestra e i documenti esportati leggono
 * `NOME` da qui.
 */

export const NOME = 'VektorLab';
export const ESTENSIONE_PROGETTO = '.vektor';

export function Logo({ compatto = false, onClick }: {
  compatto?: boolean;
  onClick?: () => void;
}) {
  if (!onClick) {
    return (
      <span
        className="font-semibold tracking-tight"
        style={{ color: 'var(--accento)', fontSize: compatto ? '12px' : undefined }}
      >
        {NOME}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${NOME} — informazioni`}
      className="font-semibold tracking-tight transition-opacity hover:opacity-80"
      style={{ color: 'var(--accento)', fontSize: compatto ? '12px' : undefined }}
    >
      {NOME}
    </button>
  );
}

/**
 * Editor di un materiale personalizzato.
 *
 * IL DATO CHE CONTA — per l'analisi elastica basta E, e per l'acciaio E ≈ 210
 * GPa vale sempre: il modulo dipende dal reticolo del ferro, non dagli
 * elementi di lega. Quello che cambia da acciaio ad acciaio è lo SNERVAMENTO,
 * ed è l'unico numero che va cercato sul certificato. Per questo f_y è in cima
 * e in evidenza, e il resto sta sotto.
 */

import { useStore } from '../state/store.js';
import { aggiungiMateriale, eliminaMateriale, modificaMateriale } from '../state/commands.js';
import { MATERIALI } from '../core/materials/materials.js';
import { Bottone, CampoNumero, Riga, Selettore } from './Pannelli.js';
import type { Materiale, MaterialId } from '../core/model/types.js';

export function EditorMateriale({ materiale, personalizzato }: {
  materiale: Materiale; personalizzato: boolean;
}) {
  const esegui = useStore((s) => s.esegui);
  const progetto = useStore((s) => s.progetto);

  const modifica = (patch: Partial<Materiale>) => {
    esegui(modificaMateriale(materiale.id as string, patch));
  };

  /** Duplica il materiale della libreria in una copia modificabile. */
  const rendiModificabile = () => {
    let n = 1;
    while (progetto.materialiPersonalizzati.some((m) => (m.id as string) === `mat${n}`)) n++;
    const id = `mat${n}` as MaterialId;
    esegui(aggiungiMateriale({
      ...materiale, id,
      nome: `${materiale.nome} (personalizzato)`,
    }));
  };

  if (!personalizzato) {
    return (
      <div className="space-y-1">
        <ProprietaSolaLettura m={materiale} />
        <div className="px-3 pt-1">
          <Bottone larghezzaPiena onClick={rendiModificabile}
                   titolo="Crea una copia modificabile di questo materiale">
            crea copia modificabile
          </Bottone>
        </div>
        {/* §3.3 — la ragione sta nel suggerimento, non stampata ogni volta */}
        <p
          className="px-3 pt-1"
          title={'I materiali della libreria hanno valori normati: cambiarli renderebbe '
            + 'irriproducibile qualunque verifica. La copia si può adattare a un '
            + 'certificato di prova.'}
          style={{ color: 'var(--testo-debole)', fontSize: 'var(--t-minuto)' }}
        >
          La libreria non si modifica: cambiando un valore si crea una copia.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <Riga etichetta="Nome">
        <input
          type="text"
          value={materiale.nome}
          onChange={(e) => modifica({ nome: e.target.value })}
          className="w-full rounded-[var(--raggio-controllo)] border px-2 py-1 text-[length:var(--t-etichetta)] outline-none
                     focus:border-[var(--accento)]"
          style={{ background: 'var(--sfondo)', borderColor: 'var(--bordo)',
                   color: 'var(--testo)' }}
        />
      </Riga>

      <div className="mx-3 my-1 rounded-[var(--raggio-controllo)] border px-2 py-2"
           style={{ borderColor: 'var(--accento)' }}>
        <div className="mb-1 text-[length:var(--t-minuto)] font-semibold uppercase tracking-wider"
             style={{ color: 'var(--accento)' }}>
          Snervamento — il dato che serve
        </div>
        <Riga etichetta="f_y">
          <CampoNumero
            valore={(materiale.resistenze.fy ?? 0) / 1e6}
            passo={5}
            suffisso="MPa"
            onChange={(v) => modifica({ resistenze: { ...materiale.resistenze, fy: v * 1e6 } })}
          />
        </Riga>
        <p
          className="pt-1"
          title={'È l\'unico valore che distingue un acciaio da un altro nel calcolo '
            + 'elastico. Sotto i 235 MPa non scende nessun acciaio da costruzione: è '
            + 'l\'ipotesi cautelativa se il valore non è noto.'}
          style={{ color: 'var(--testo-debole)', fontSize: 'var(--t-minuto)' }}
        >
          Se non lo conosci, 235 MPa è cautelativo.
        </p>
      </div>

      <Riga etichetta="Rottura f_u">
        <CampoNumero
          valore={(materiale.resistenze.fu ?? 0) / 1e6} passo={10} suffisso="MPa"
          onChange={(v) => modifica({ resistenze: { ...materiale.resistenze, fu: v * 1e6 } })}
        />
      </Riga>
      <Riga etichetta="Modulo E">
        <CampoNumero
          valore={materiale.E / 1e9} passo={5} suffisso="GPa"
          onChange={(v) => modifica({
            E: v * 1e9, G: (v * 1e9) / (2 * (1 + materiale.nu)),
          })}
        />
      </Riga>
      <Riga etichetta="Poisson ν">
        <CampoNumero
          valore={materiale.nu} passo={0.01}
          onChange={(v) => modifica({ nu: v, G: materiale.E / (2 * (1 + v)) })}
        />
      </Riga>
      <Riga etichetta="Densità ρ">
        <CampoNumero
          valore={materiale.rho} passo={50} suffisso="kg/m³"
          onChange={(v) => modifica({ rho: v })}
        />
      </Riga>
      <Riga etichetta="Dilatazione α">
        <CampoNumero
          valore={materiale.alpha * 1e6} passo={1} suffisso="µm/m·K"
          onChange={(v) => modifica({ alpha: v / 1e6 })}
        />
      </Riga>
      <Riga etichetta="γ_M">
        <CampoNumero
          valore={materiale.gammaM} passo={0.05}
          onChange={(v) => modifica({ gammaM: Math.max(1, v) })}
        />
      </Riga>
      <Riga etichetta="Curva instab.">
        <Selettore
          valore={materiale.curvaInstabilita ?? 'c'}
          opzioni={[
            { valore: 'a0', etichetta: 'a0 — α 0.13 (la più favorevole)' },
            { valore: 'a', etichetta: 'a — α 0.21' },
            { valore: 'b', etichetta: 'b — α 0.34 (profili laminati usuali)' },
            { valore: 'c', etichetta: 'c — α 0.49' },
            { valore: 'd', etichetta: 'd — α 0.76 (la più sfavorevole)' },
          ]}
          onChange={(v) => modifica({ curvaInstabilita: v as Materiale['curvaInstabilita'] })}
        />
      </Riga>
      <Riga etichetta="Costo">
        <CampoNumero
          valore={materiale.costoEuroKg ?? 0} passo={0.1} suffisso="€/kg"
          onChange={(v) => modifica({ costoEuroKg: v })}
        />
      </Riga>

      <div className="px-3 pt-1">
        <Bottone
          larghezzaPiena
          titolo="Le aste che lo usano tornano all'acciaio generico"
          onClick={() => esegui(eliminaMateriale(
            materiale.id as string, 'ACCIAIO_GENERICO',
          ))}
        >
          elimina materiale
        </Bottone>
      </div>
    </div>
  );
}

function ProprietaSolaLettura({ m }: { m: Materiale }) {
  const r = m.resistenze;
  const MPa = (v?: number) => (v === undefined ? '—' : `${(v / 1e6).toFixed(0)} MPa`);
  return (
    <table className="numerico w-full text-[length:var(--t-minuto)]">
      <tbody style={{ color: 'var(--testo-attenuato)' }}>
        <Voce n="comportamento" v={m.comportamento} />
        <Voce n="E" v={`${(m.E / 1e9).toFixed(0)} GPa`} />
        <Voce n="f_y" v={MPa(r.fy)} evidenzia={r.fy !== undefined} />
        <Voce n="f_u" v={MPa(r.fu)} />
        {r.ft !== undefined && <Voce n="f_t" v={MPa(r.ft)} />}
        {r.fc !== undefined && <Voce n="f_c" v={MPa(r.fc)} />}
        {r.fm !== undefined && <Voce n="f_m" v={MPa(r.fm)} />}
        <Voce n="ρ" v={`${m.rho} kg/m³`} />
        <Voce n="γ_M" v={m.gammaM.toFixed(2)} />
        <Voce n="curva" v={m.curvaInstabilita ?? '—'} />
      </tbody>
    </table>
  );
}

function Voce({ n, v, evidenzia }: { n: string; v: string; evidenzia?: boolean }) {
  return (
    <tr>
      <td className="py-1 pl-3">{n}</td>
      <td className="py-1 pr-3 text-right"
          style={evidenzia ? { color: 'var(--accento)', fontWeight: 600 } : undefined}>
        {v}
      </td>
    </tr>
  );
}

/** Elenco completo: libreria più materiali del progetto. */
export function materialiDisponibili(
  personalizzati: Materiale[],
): { valore: string; etichetta: string }[] {
  return [
    ...personalizzati.map((m) => ({
      valore: m.id as string, etichetta: `★ ${m.nome}`,
    })),
    ...MATERIALI.map((m) => ({
      valore: m.id as string, etichetta: `${m.nome} · ${m.comportamento}`,
    })),
  ];
}

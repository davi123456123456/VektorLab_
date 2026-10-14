/**
 * SALVA e APRI un file `.vektor`.
 *
 * Il foglio vive nella memoria del browser; questi due tasti sono il modo di
 * portarlo fuori — per tenerlo, per mandarlo a qualcuno, o per annotare la
 * soluzione di un esercizio. Aprire un file apre un foglio NUOVO: il lavoro
 * in corso non si sovrascrive mai.
 */

import { useRef } from 'react';
import { deserializza, serializza } from '../state/file.js';
import { useFogli } from '../state/fogli.js';
import { useStore } from '../state/store.js';
import { ESTENSIONE_PROGETTO } from './Logo.js';
import { Bottone } from './Pannelli.js';

export function FileProgetto() {
  const scelta = useRef<HTMLInputElement>(null);

  const salva = () => {
    const { fogli, attivo } = useFogli.getState();
    const nome = fogli.find((f) => f.id === attivo)?.nome ?? 'progetto';
    const blob = new Blob([serializza(useStore.getState().progetto)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${nome}${ESTENSIONE_PROGETTO}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const apri = async (file: File | undefined) => {
    if (!file) return;
    const esito = deserializza(await file.text());
    if ('errore' in esito) {
      useStore.getState().messaggia(esito.errore);
      return;
    }
    const nome = file.name.replace(/\.[^.]+$/, '');
    useFogli.getState().nuovo(nome, esito.progetto);
  };

  return (
    <>
      <Bottone minore titolo={`Salva il foglio in un file ${ESTENSIONE_PROGETTO}`} onClick={salva}>
        Salva
      </Bottone>
      <Bottone minore titolo={`Apri un file ${ESTENSIONE_PROGETTO} in un foglio nuovo`}
               onClick={() => scelta.current?.click()}>
        Apri
      </Bottone>
      <input
        ref={scelta} type="file" accept={`${ESTENSIONE_PROGETTO},application/json`} hidden
        onChange={(e) => { void apri(e.target.files?.[0]); e.target.value = ''; }}
      />
    </>
  );
}

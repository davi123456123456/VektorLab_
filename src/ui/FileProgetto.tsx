/**
 * SALVA e APRI un file `.vektor`.
 *
 * Il foglio vive nella memoria del browser; questi due tasti sono il modo di
 * portarlo fuori — per tenerlo, per mandarlo a qualcuno, o per annotare la
 * soluzione di un esercizio. Aprire un file apre un foglio NUOVO: il lavoro
 * in corso non si sovrascrive mai.
 *
 * SALVA SI COMPORTA COME IN UN PROGRAMMA DA SCRIVANIA. La prima volta è
 * «salva con nome»: si sceglie dove e come chiamare il file. Dalla seconda
 * sovrascrive quel file, senza chiedere, e lo dice con «Salvato» per un
 * secondo. Un foglio aperto da un file è già «salvato»: Salva riscrive il
 * file da cui viene.
 *
 * Sovrascrivere un file del disco si può solo dove il browser offre l'accesso
 * ai file (Chrome, Edge). Altrove — Safari, Firefox — il browser non lascia
 * toccare un file esistente: la prima volta si chiede il nome, e ogni
 * salvataggio successivo scarica di nuovo il file con quel nome.
 */

import { useEffect, useRef, useState } from 'react';
import { deserializza, serializza } from '../state/file.js';
import { useFogli } from '../state/fogli.js';
import { useStore } from '../state/store.js';
import { ESTENSIONE_PROGETTO } from './Logo.js';
import { Bottone } from './Pannelli.js';

/** Quel poco dell'accesso ai file che serve qui (non è ancora in lib.dom). */
interface ManigliaFile {
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<{ write(dati: string): Promise<void>; close(): Promise<void> }>;
}
interface TipoFile { description: string; accept: Record<string, string[]> }
interface AccessoFile {
  showSaveFilePicker?: (o: { suggestedName: string; types: TipoFile[] }) => Promise<ManigliaFile>;
  showOpenFilePicker?: (o: { types: TipoFile[]; multiple: false }) => Promise<ManigliaFile[]>;
}

const TIPI: TipoFile[] = [{
  description: 'Progetto VektorLab',
  accept: { 'application/json': [ESTENSIONE_PROGETTO] },
}];

/*
 * Il file di ogni foglio, per id del foglio. Sta in memoria e non nel foglio
 * salvato in localStorage: una maniglia sul disco non sopravvive a una
 * ricarica senza chiedere di nuovo il permesso, e dopo una ricarica Salva
 * torna a essere «salva con nome», che è la cosa onesta da fare.
 */
const maniglie = new Map<string, ManigliaFile>();
/** Senza accesso ai file: il nome scelto la prima volta, per id del foglio. */
const nomiScelti = new Map<string, string>();

const senzaEstensione = (nome: string) => nome.replace(/\.[^.]+$/, '');
const annullatoDallUtente = (e: unknown) => e instanceof DOMException && e.name === 'AbortError';

async function scrivi(maniglia: ManigliaFile, testo: string): Promise<void> {
  const flusso = await maniglia.createWritable();
  await flusso.write(testo);
  await flusso.close();
}

function scarica(testo: string, nome: string): void {
  const url = URL.createObjectURL(new Blob([testo], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${nome}${ESTENSIONE_PROGETTO}`;
  a.click();
  URL.revokeObjectURL(url);
}

export function FileProgetto() {
  const scelta = useRef<HTMLInputElement>(null);
  const [annuncio, setAnnuncio] = useState(false);

  // «Salvato» resta un secondo: abbastanza per vederlo, non per ingombrare
  useEffect(() => {
    if (!annuncio) return;
    const t = setTimeout(() => setAnnuncio(false), 1000);
    return () => clearTimeout(t);
  }, [annuncio]);

  const salva = async () => {
    const { fogli, attivo, rinomina } = useFogli.getState();
    const nomeFoglio = fogli.find((f) => f.id === attivo)?.nome ?? 'progetto';
    const testo = serializza(useStore.getState().progetto);
    const accesso = window as unknown as AccessoFile;

    // già salvato: si sovrascrive lo stesso file
    const maniglia = maniglie.get(attivo);
    if (maniglia) {
      try {
        await scrivi(maniglia, testo);
        setAnnuncio(true);
      } catch {
        // permesso revocato o file spostato: la prossima volta si richiede
        maniglie.delete(attivo);
        useStore.getState().messaggia(
          `Non riesco a scrivere «${maniglia.name}». Premi di nuovo Salva per sceglierlo.`);
      }
      return;
    }

    // prima volta, con accesso ai file: salva con nome
    if (accesso.showSaveFilePicker) {
      try {
        const nuova = await accesso.showSaveFilePicker({
          suggestedName: `${nomeFoglio}${ESTENSIONE_PROGETTO}`, types: TIPI,
        });
        await scrivi(nuova, testo);
        maniglie.set(attivo, nuova);
        rinomina(attivo, senzaEstensione(nuova.name));
      } catch (e) {
        if (!annullatoDallUtente(e)) useStore.getState().messaggia('Salvataggio non riuscito.');
      }
      return;
    }

    // senza accesso ai file: si chiede il nome una volta, poi si riscarica
    const giaScelto = nomiScelti.get(attivo);
    if (giaScelto) {
      scarica(testo, giaScelto);
      setAnnuncio(true);
      return;
    }
    const scritto = window.prompt('Salva con nome', nomeFoglio)?.trim();
    if (!scritto) return;
    const nome = senzaEstensione(scritto);
    scarica(testo, nome);
    nomiScelti.set(attivo, nome);
    rinomina(attivo, nome);
  };

  /** Il file letto diventa un foglio nuovo; con la maniglia, già «salvato». */
  const apriTesto = (testo: string, nomeFile: string, maniglia?: ManigliaFile) => {
    const esito = deserializza(testo);
    if ('errore' in esito) {
      useStore.getState().messaggia(esito.errore);
      return;
    }
    const nome = senzaEstensione(nomeFile);
    const id = useFogli.getState().nuovo(nome, esito.progetto);
    if (maniglia) maniglie.set(id, maniglia);
    else nomiScelti.set(id, nome);
  };

  const apri = async () => {
    const accesso = window as unknown as AccessoFile;
    if (!accesso.showOpenFilePicker) { scelta.current?.click(); return; }
    try {
      const [maniglia] = await accesso.showOpenFilePicker({ types: TIPI, multiple: false });
      const file = await maniglia.getFile();
      apriTesto(await file.text(), file.name, maniglia);
    } catch (e) {
      if (!annullatoDallUtente(e)) useStore.getState().messaggia('Apertura non riuscita.');
    }
  };

  return (
    <>
      <span className="relative inline-flex">
        <Bottone minore onClick={() => void salva()}
                 titolo={`Salva il foglio in un file ${ESTENSIONE_PROGETTO}: la prima volta `
                   + 'si sceglie il nome, poi si sovrascrive lo stesso file'}>
          Salva
        </Bottone>
        {annuncio && <span className="annuncio-salvato" role="status">Salvato</span>}
      </span>
      <Bottone minore titolo={`Apri un file ${ESTENSIONE_PROGETTO} in un foglio nuovo`}
               onClick={() => void apri()}>
        Apri
      </Bottone>
      <input
        ref={scelta} type="file" accept={`${ESTENSIONE_PROGETTO},application/json`} hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void file.text().then((t) => apriTesto(t, file.name));
        }}
      />
    </>
  );
}

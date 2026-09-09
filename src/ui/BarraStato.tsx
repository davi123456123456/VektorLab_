/**
 * Barra di stato: coordinate, aggancio attivo, operazione in corso, scala.
 *
 * È l'unico posto in cui l'utente legge il FEEDBACK NUMERICO continuo. Durante
 * una trasformazione mostra il valore corrente e ciò che è stato digitato: è
 * quello che rende usabile l'inserimento `G X 2.5 Invio` senza finestre di
 * dialogo.
 */

import { useEffect, useState } from 'react';
import { useStore } from '../state/store.js';
import { schermoAMondo } from '../render/camera.js';
import { indicatoreScala, passoGriglia } from '../render/grid.js';
import { calcolaAnteprima } from '../state/operazioni.js';
import { leggiPuntatore } from '../state/puntatore.js';
import { contaSelezione } from '../state/store.js';

/**
 * Che cosa fa il clic, adesso.
 *
 * Un'interfaccia modale — dove lo stesso gesto fa cose diverse a seconda della
 * modalità — è comoda solo se in ogni istante è scritto da qualche parte che
 * cosa succederà. Questa riga è quel posto: cambia con lo strumento e con la
 * modalità, e toglie la necessità di provare per scoprirlo.
 */
function Cosa() {
  const modalita = useStore((s) => s.modalita);
  const strumento = useStore((s) => s.strumento);
  const operazione = useStore((s) => s.operazione);
  const vincolo = useStore((s) => s.vincoloCorrente);
  const posa = useStore((s) => s.posaSuAsta);
  const carico = useStore((s) => s.caricoCorrente);
  if (operazione.tipo !== 'nessuna') return null;

  let testo: string;
  switch (modalita) {
    case 'modellazione':
      testo = strumento === 'nodo' ? 'clic: posa un nodo'
        : strumento === 'asta' ? 'clic: inizia o prosegue un\'asta'
        : 'clic: seleziona · trascina: riquadro · Alt+clic: catena di aste';
      break;
    case 'vincoli':
      testo = `clic su un nodo: ${vincolo} · clic su un'asta: `
        + `${posa === 'vincolo' ? vincolo : 'sconnessione'} in campata · F ribalta`;
      break;
    case 'carichi':
      testo = `clic: applica ${carico}`;
      break;
    case 'analisi':
      testo = 'M: cinematismo successivo · Invio: ricalcola';
      break;
    case 'reazioni':
      testo = 'clic su un\'asta: corpo libero · clic su una cerniera: esploso · Esc chiude';
      break;
    case 'risultati':
      testo = 'N T M: diagrammi · D: deformata · Spazio: applica il carico';
      break;
    default:
      testo = '';
  }
  return (
    <span className="max-w-[52ch] truncate" style={{ color: 'var(--testo-debole)' }}
          title={testo}>
      {testo}
    </span>
  );
}

export function BarraStato() {
  const camera = useStore((s) => s.camera);
  const selezione = useStore((s) => s.selezione);
  const messaggio = useStore((s) => s.messaggio);
  const operazione = useStore((s) => s.operazione);
  const snapInvertito = useStore((s) => s.snapInvertito);
  const passato = useStore((s) => s.passato);
  const futuro = useStore((s) => s.futuro);

  // le coordinate si aggiornano fuori dal ciclo di render di React
  const [coordinate, setCoordinate] = useState('0.000, 0.000');
  const [descrizione, setDescrizione] = useState<string | null>(null);
  useEffect(() => {
    let attivo = true;
    const passo = () => {
      if (!attivo) return;
      const st = useStore.getState();
      /*
       * §5.3 — SI MOSTRA IL PUNTO AGGANCIATO, non la posizione del puntatore.
       *
       * Prima si leggeva `schermoAMondo(camera, puntatore)`, cioè dove sta il
       * mouse. Ma il vertice non nasce lì: nasce dove lo snap lo porta, e i
       * due valori differiscono di tutta la tolleranza di aggancio. Chi
       * leggeva «3.017» e otteneva un nodo in 3.000 concludeva, con ragione,
       * che le coordinate erano sbagliate.
       *
       * I decimali seguono il passo della griglia: scrivere tre cifre quando
       * il passo è di un metro suggerisce una precisione che non c'è.
       */
      const grezzo = schermoAMondo(st.camera, leggiPuntatore());
      const m = st.ultimoSnap && st.ultimoSnap.tipo !== 'nessuno'
        ? st.ultimoSnap.punto : grezzo;
      const passoDellaGriglia = passoGriglia(st.camera.zoom);
      const decimali = Math.max(
        0, Math.min(4, Math.ceil(-Math.log10(passoDellaGriglia)) + 1));
      setCoordinate(`${m.x.toFixed(decimali)}, ${m.y.toFixed(decimali)}`);
      const a = calcolaAnteprima(st.operazione, m);
      setDescrizione(a ? a.descrizione : null);
      setTimeout(passo, 60);   // 16 fps bastano per un testo: non serve un rAF
    };
    passo();
    return () => { attivo = false; };
  }, []);

  const scala = indicatoreScala(camera);
  const snap = useStore((s) => s.ultimoSnap);

  return (
    <div className="flex h-7 shrink-0 items-center gap-4 border-t px-3 text-[length:var(--t-minuto)]"
         style={{ borderColor: 'var(--bordo)', background: 'var(--sfondo-pannello)' }}>
      <span className="numerico" style={{ color: 'var(--testo-attenuato)' }}>
        {coordinate} m
      </span>

      <div className="flex items-center gap-1.5">
        <div className="h-2 border-l border-r"
             style={{ width: `${Math.min(120, scala.pixel)}px`,
                      borderColor: 'var(--testo-debole)' }} />
        <span className="numerico" style={{ color: 'var(--testo-debole)' }}>
          {scala.etichetta}
        </span>
      </div>

      {snap && snap.tipo !== 'nessuno' && (
        <span style={{ color: 'var(--snap)' }}>⊹ {snap.etichetta}</span>
      )}
      {snapInvertito && (
        <span style={{ color: 'var(--avviso)' }}>aggancio: solo nodi</span>
      )}

      {descrizione && (
        <span className="numerico font-semibold" style={{ color: 'var(--accento)' }}>
          {descrizione} — Invio conferma, Esc annulla
        </span>
      )}

      {operazione.tipo === 'disegnaAsta' && (
        <span style={{ color: 'var(--accento)' }}>
          tracciamento — Invio termina · Backspace torna indietro · Ctrl libera l'angolo
        </span>
      )}

      <Cosa />

      <span className="ml-auto" style={{ color: 'var(--testo-debole)' }}>
        selezione: {contaSelezione(selezione)}
      </span>
      <span className="numerico" style={{ color: 'var(--testo-debole)' }}
            title={passato.length > 0
              ? `Annulla: ${passato[passato.length - 1].etichetta}`
              : 'niente da annullare'}>
        cronologia {passato.length}/{passato.length + futuro.length}
        {passato.length > 0 && (
          <span className="pl-2" style={{ color: 'var(--testo-attenuato)' }}>
            ↶ {passato[passato.length - 1].etichetta}
          </span>
        )}
      </span>
      {messaggio && (
        <span className="max-w-[38ch] truncate" style={{ color: 'var(--testo-attenuato)' }}
              title={messaggio}>
          {messaggio}
        </span>
      )}
    </div>
  );
}

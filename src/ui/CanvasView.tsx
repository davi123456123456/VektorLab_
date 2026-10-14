/**
 * Vista del canvas: rendering e interazione.
 *
 * RENDERING — ciclo continuo su requestAnimationFrame che legge lo stato con
 * `useStore.getState()` invece di sottoscriverlo. Il componente React non si
 * ri-renderizza mai per un movimento del mouse: si ri-disegna solo il canvas.
 * È ciò che permette di restare a 60 fps durante trascinamenti e anteprime.
 *
 * INTERAZIONE — lo stato transitorio (pulsante premuto, ultimo puntatore) vive
 * in `useRef`: metterlo nello store causerebbe una cascata di render a ogni
 * evento di movimento.
 */

import { useEffect, useRef } from 'react';
import { disegnaScena, type StatoDisegno } from '../render/scene.js';
import { distanza, mondoASchermo, schermoAMondo, type Punto } from '../render/camera.js';
import { calcolaSnap } from '../render/snap.js';
import {
  ascissaSuAsta, catenaCollineare, colpisci, colpisciSuAsta, dentroRiquadro,
} from '../render/picking.js';
import { useStore } from '../state/store.js';
import { calcolaAnteprima } from '../state/operazioni.js';
import {
  annullaOperazione, anteprimaSuNodo, applicaCaricoAsta, applicaCaricoNodale,
  applicaVincolo, concludiTrascinamentoSuAsta, confermaOperazione, posaSuAsta,
} from '../state/azioni.js';
import { nomeVincolo } from '../render/simboli.js';
import { BarraSelezione } from './BarraSelezione.js';
import { usaTelefono } from './usaTelefono.js';
import { etichette } from '../state/etichette.js';
import {
  leggiPuntatore, puntatorePresente, scriviPuntatore, segnaPuntatorePresente,
} from '../state/puntatore.js';
import { DURATE, registro } from '../anim/registro.js';
import { MOLLE } from '../anim/molla.js';
import { mescolaRisultati } from '../anim/interpolazione.js';
import {
  aggiungiAsta, estrudi, nodoCollegato,
} from '../state/commands.js';
import type { ElementId, NodeId } from '../core/model/types.js';
import {
  normalizzaAngolo, PASSO_SNAP_ANGOLO,
} from '../core/model/orientamento.js';

/**
 * Quanto aspetta un dito prima di agire, nel caso ne arrivi un secondo.
 * Le due dita di un gesto toccano a qualche centesimo di secondo l'una
 * dall'altra; un decimo le copre, e su un tocco singolo non si percepisce.
 */
const ATTESA_SECONDO_DITO = 100;

export function CanvasView() {
  const contenitore = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const premuto = useRef<{ tasto: number; da: Punto; trascinato: boolean } | null>(null);
  const spazio = useRef(false);
  /** simbolo su asta in trascinamento; l'ascissa definitiva si scrive al rilascio */
  const trascinaSuAsta = useRef<{ id: string; astaId: ElementId } | null>(null);
  /** timer della pressione prolungata che avvia la rotazione di un vincolo */
  const attesaRotazione = useRef<ReturnType<typeof setTimeout> | null>(null);
  // due dita: le dita a contatto, il primo tocco in attesa del secondo, e se
  // è in corso una navigazione (dal secondo dito finché non si alzano tutte)
  const dita = useRef(new Map<number, Punto>());
  const inAttesa = useRef<{
    giu: React.PointerEvent; timer: ReturnType<typeof setTimeout>;
  } | null>(null);
  const pizzicando = useRef(false);
  // letto dal ciclo di disegno, che non passa da React: serve un ref
  const telefono = usaTelefono();
  const telefonoRef = useRef(telefono);
  telefonoRef.current = telefono;
  // un tocco in attesa non deve scattare su un foglio che non c'è più
  useEffect(() => () => {
    if (inAttesa.current) clearTimeout(inAttesa.current.timer);
  }, []);

  // ── ridimensionamento ────────────────────────────────────────────────
  useEffect(() => {
    const el = contenitore.current;
    if (!el) return;
    const osservatore = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      useStore.getState().ridimensiona(r.width, r.height);
    });
    osservatore.observe(el);
    const r = el.getBoundingClientRect();
    useStore.getState().ridimensiona(r.width, r.height);
    return () => osservatore.disconnect();
  }, []);

  // ── ciclo di disegno ─────────────────────────────────────────────────
  useEffect(() => {
    let attivo = true;
    const disegna = () => {
      if (!attivo) return;
      // il registro avanza una volta per fotogramma, prima del disegno:
      // così tutti i valori animati sono coerenti fra loro
      const ora = performance.now();
      registro.avanza(ora);
      // la transizione d'inquadratura avanza PRIMA di leggere lo stato:
      // altrimenti si disegnerebbe con la camera del fotogramma precedente
      useStore.getState().avanzaTransizioneCamera(ora);
      const c = canvas.current;
      const st = useStore.getState();
      if (c) {
        const dpr = window.devicePixelRatio || 1;
        const w = Math.max(1, Math.round(st.camera.larghezza * dpr));
        const h = Math.max(1, Math.round(st.camera.altezza * dpr));
        if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
        const ctx = c.getContext('2d');
        if (ctx) {
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          ctx.clearRect(0, 0, st.camera.larghezza, st.camera.altezza);
          disegnaScena(ctx, componiStato());
        }
      }
      requestAnimationFrame(disegna);
    };
    const id = requestAnimationFrame(disegna);
    return () => { attivo = false; cancelAnimationFrame(id); };
  }, []);

  /** Costruisce lo stato di disegno dal contenuto corrente dello store. */
  function componiStato(): StatoDisegno {
    const st = useStore.getState();
    const mondo = schermoAMondo(st.camera, leggiPuntatore());
    rilevaApparizioni(st);

    let anteprimaNodi: Map<NodeId, Punto> | null = null;
    const a = calcolaAnteprima(st.operazione, mondo);
    if (a) anteprimaNodi = a.posizioni;

    // col dito alzato non c'è un punto da seguire: niente elastico né aggancio
    const presente = puntatorePresente();
    let anteprimaAsta: { da: Punto; a: Punto } | null = null;
    if (presente && st.operazione.tipo === 'disegnaAsta' && st.operazione.daPunto) {
      const p = st.ultimoSnap?.punto ?? mondo;
      anteprimaAsta = { da: st.operazione.daPunto, a: p };
    }

    let riquadro: { da: Punto; a: Punto } | null = null;
    if (st.operazione.tipo === 'riquadro') {
      riquadro = { da: st.operazione.da, a: st.operazione.a };
    }

    // I carichi mostrati sono quelli del caso corrente. Mostrarli tutti
    // insieme sarebbe illeggibile e, peggio, farebbe credere che agiscano
    // simultaneamente: i casi di carico sono alternativi per definizione.
    const carichi = st.progetto.carichi.filter((c) => c.casoId === st.casoCorrente);

    // l'animazione del cinematismo è una sinusoide: parte e torna, senza scatti
    const fase = st.animaMeccanismo
      ? Math.sin((performance.now() / 1000) * 1.6)
      : 1;

    return {
      progetto: conRotazioneViva(st),
      camera: st.camera,
      selezioneNodi: st.selezione.nodi,
      selezioneAste: st.selezione.aste,
      evidenziato: st.evidenziato,
      asteEvidenziate: st.asteEvidenziate,
      snap: st.modalita === 'modellazione' && presente ? st.ultimoSnap : null,
      anteprimaAsta,
      etichetteLontane: telefonoRef.current,
      riquadro,
      anteprimaNodi,
      mostraNumeri: st.camera.zoom > 25 && st.modalita === 'modellazione',
      // il nome del nodo occupa spazio: si mostra solo da vicino, oppure
      // quando i nodi sono pochi e non rischiano di sovrapporsi
      mostraEtichetteNodi: st.camera.zoom > 25 && st.progetto.nodi.length <= 12,
      carichi: st.modalita === 'materiali' ? [] : carichi,
      mostraValoriCarichi: st.modalita === 'carichi',
      caricoEvidenziato: st.caricoEvidenziato,
      cinematica: st.modalita === 'analisi' ? st.cinematica : null,
      modoMeccanismo: st.modoMeccanismo,
      faseMeccanismo: fase,
      attenuaStruttura: st.modalita !== 'modellazione',
      corpiColorati: st.corpoEvidenziato !== null
        ? st.partizioneCorpi.filter((x) => x.corpo === st.corpoEvidenziato)
        : st.coloraCorpi || st.evidenziaConteggio === 'corpi'
          ? st.partizioneCorpi : [],
      enfasiConteggio: st.evidenziaConteggio,
      anteprimaVincolo: anteprimaDaStato(st),
      rotazioneVincolo: st.rotazioneVincolo,
      suAstaEvidenziato: st.suAstaEvidenziato,
      suAstaSelezionato: st.suAstaSelezionato,
      sconnessioneNodaleSelezionata: st.sconnessioneNodaleSelezionata,
      anteprimaSuAsta: st.anteprimaSuAsta,
      apparizione: (id) => registro.apparizione(id),

      modelloRisultati: st.modelloDiCalcolo,
      risultato: st.modalita === 'risultati'
        ? mescolaRisultati(
            st.risultatoPrecedente, st.risultato!,
            registro.avanzamento('transizione'),
          )
        : null,
      diagrammiVisibili: st.diagrammiVisibili,
      scalaDiagrammi: st.scalaDiagrammi,
      mostraDeformata: st.mostraDeformata,
      fattoreDeformata: st.fattoreDeformata,
      // in riproduzione il parametro di carico oscilla fra 0 e 1: la trave si
      // inflette e torna, che è il modo più diretto di mostrare l'effetto dei
      // carichi su quella struttura
      lambdaDeformata: st.riproduciDeformata && registro.abilitate
        ? 0.5 - 0.5 * Math.cos(registro.orologio * 1.5)
        : st.lambdaDeformata,
      mostraReazioni: st.mostraReazioni,
      mostraValoriRisultati: st.mostraValoriRisultati,
      mostraTratteggiata: st.mostraTratteggiata,
      etichette: etichette(st.progetto),
      // §5 — sotto i diagrammi il modello si può togliere di mezzo. La
      // dissolvenza è breve (~200 ms) e interrompibile: chi accende e spegne
      // la spunta per confrontare due letture non deve aspettare.
      opacitaModello: registro.verso(
        'modello:opacita',
        st.modalita === 'risultati' && !st.mostraModelloNeiDiagrammi ? 0 : 1,
        MOLLE.precisa,
      ),
      ...statica(st),
      avanzamentoDiagrammi: registro.avanzamento('diagrammi'),
      momentoDallaParteDelleFibreTese:
        st.progetto.impostazioni.momentoDallaParteDelleFibreTese,
    };
  }

  /**
   * Il modello come si deve VEDERE adesso: durante una rotazione interattiva
   * il vincolo si disegna già all'angolo che segue il puntatore, mentre il
   * modello vero cambia solo al rilascio. Ruotare non deve riempire la
   * cronologia di un comando per fotogramma.
   */
  function conRotazioneViva(
    st: ReturnType<typeof useStore.getState>,
  ): typeof st.progetto {
    const r = st.rotazioneVincolo;
    if (!r) return st.progetto;
    const angolo = r.angolo as never;
    if (r.bersaglio.tipo === 'nodo') {
      return {
        ...st.progetto,
        nodi: st.progetto.nodi.map((n) => (
          n.id === r.bersaglio.id && n.vincolo
            ? { ...n, vincolo: { ...n.vincolo, angolo } }
            : n
        )),
      };
    }
    return {
      ...st.progetto,
      vincoliSuAsta: (st.progetto.vincoliSuAsta ?? []).map((v) => (
        v.id === r.bersaglio.id ? { ...v, vincolo: { ...v.vincolo, angolo } } : v
      )),
    };
  }

  /** Traduce l'azione dedotta nel simbolo da mostrare in trasparenza. */
  function anteprimaDaStato(st: ReturnType<typeof useStore.getState>) {
    const a = st.anteprimaVincolo;
    if (!a || st.modalita !== 'vincoli') return null;
    const azione = a.azione;
    if (azione.azione === 'sconnessioneInterna') {
      return {
        nodoId: a.nodoId,
        sconnessione: azione.tipo,
        nome: nomeVincolo(azione.tipo, 'interno'),
      };
    }
    if (azione.azione === 'vincoloEsterno') {
      return {
        nodoId: a.nodoId,
        vincolo: { tipo: azione.tipo, angolo: st.angoloVincolo as never },
        nome: nomeVincolo(azione.tipo, 'esterno'),
      };
    }
    return null;
  }

  /**
   * Parte dello stato di disegno che riguarda la modalità Reazioni.
   *
   * La dissolvenza dei simboli di vincolo e la comparsa delle frecce sono
   * guidate da molle: entrando e uscendo dalla modalità la transizione è
   * interrompibile, e cambiare idea a metà non produce scatti.
   */
  function statica(st: ReturnType<typeof useStore.getState>) {
    const attiva = st.modalita === 'reazioni' && st.statico !== null;
    const opacitaVincoli = registro.verso(
      'vincoli:opacita', attiva ? 0 : 1, MOLLE.morbida,
    );
    const comparsaReazioni = registro.verso(
      'reazioni:comparsa', attiva ? 1 : 0, MOLLE.morbida,
    );
    const apertura = registro.verso(
      'esploso:apertura', st.sconnessioneEsplosa ? 1 : 0, MOLLE.morbida,
    );
    // entrando in Reazioni le frecce del distribuito collassano nella loro
    // risultante: è la trasformazione che l'equilibrio dei corpi rigidi fa,
    // e vederla evita di credere che valga anche dentro il tratto caricato
    const collassoRisultanti = registro.verso(
      'risultanti:collasso', attiva ? 1 : 0, MOLLE.morbida,
    );

    const forza = st.statico && st.sconnessioneEsplosa
      ? st.statico.equilibrio.sconnessioni.find(
          (x) => x.nodoId === st.sconnessioneEsplosa)
      : undefined;

    return {
      // mentre si guarda un corpo libero le reazioni globali si tolgono di
      // mezzo: quelle che contano sono già disegnate sul tronco, e mostrarle
      // due volte sovrapposte confonde invece di rassicurare
      reazioniVincolari: attiva && !st.tronco ? st.statico!.componentiEsterne : null,
      comparsaReazioni,
      opacitaVincoli,
      modelloDiCalcolo: st.statico?.modello.calcolo ?? null,
      corpiRigidi: st.statico?.equilibrio.corpi ?? [],
      esploso: forza && apertura > 0.001 ? { forza, apertura } : null,
      corpoLibero: attiva ? st.tronco : null,
      collassoRisultanti,
      mostraValoriReazioni: st.mostraValoriReazioni,
    };
  }

  /**
   * Rileva gli oggetti comparsi confrontando il modello con quello del
   * fotogramma precedente. Farlo qui invece che nei comandi significa che
   * nessuno deve ricordarsi di notificare l'animazione quando crea qualcosa —
   * comprese le importazioni e gli annullamenti.
   */
  const idPrecedenti = useRef<Set<string>>(new Set());
  const risultatoPrecedenteVisto = useRef<unknown>(null);

  function rilevaApparizioni(st: ReturnType<typeof useStore.getState>): void {
    const presenti = new Set<string>();
    for (const n of st.progetto.nodi) {
      presenti.add(n.id as string);
      if (n.vincolo) presenti.add(`v:${n.id as string}`);
    }
    for (const a of st.progetto.aste) presenti.add(a.id as string);
    for (const c of st.progetto.carichi) presenti.add(`c:${c.id as string}`);

    if (idPrecedenti.current.size > 0) {
      let cascata = 0;
      for (const id of presenti) {
        if (idPrecedenti.current.has(id)) continue;
        const tipo = id.startsWith('v:') ? 'vincolo'
          : id.startsWith('c:') ? 'carico'
          : st.progetto.aste.some((a) => (a.id as string) === id) ? 'asta' : 'nodo';
        registro.segnalaApparizione(id, tipo, tipo === 'carico' ? cascata++ : 0);
      }
    }
    idPrecedenti.current = presenti;
    registro.potaApparizioni(presenti);

    // un risultato nuovo avvia il tracciamento e la transizione
    if (st.risultato && st.risultato !== risultatoPrecedenteVisto.current) {
      risultatoPrecedenteVisto.current = st.risultato;
      registro.avviaTracciamento('diagrammi', DURATE.tracciamentoDiagramma);
      registro.avviaTracciamento('transizione', DURATE.transizioneRisultati);
    }
  }

  // ── utilità ──────────────────────────────────────────────────────────
  const posizioneLocale = (e: { clientX: number; clientY: number }): Punto => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  /** Aggancio attivo: Ctrl inverte temporaneamente l'impostazione. */
  const snapEffettivo = () => {
    const st = useStore.getState();
    const invertito = st.snapInvertito;
    return invertito
      ? { ...st.snap, griglia: false, nodi: true, puntiMedi: false,
          intersezioni: false, ortogonale: false }
      : st.snap;
  };

  function aggiornaSnap(p: Punto): void {
    const st = useStore.getState();
    let origine: Punto | null = null;
    let precedente: number | null = null;
    const esclusi = new Set<string>();
    if (st.operazione.tipo === 'disegnaAsta' && st.operazione.daPunto) {
      origine = st.operazione.daPunto;
      precedente = st.operazione.direzionePrecedente ?? null;
    }
    const s = calcolaSnap(
      st.progetto, st.camera, p, snapEffettivo(), origine, esclusi, precedente,
    );
    st.impostaUltimoSnap(s);
  }

  // ── eventi ───────────────────────────────────────────────────────────
  /**
   * §2 — doppio clic sul VUOTO: inquadra tutto.
   *
   * Sul vuoto e basta. Doppio clic su un nodo, un'asta, un carico o un
   * simbolo significa già altro, e rubare quel gesto per muovere la camera
   * renderebbe imprevedibile l'unica cosa che deve essere prevedibile.
   */
  function onDoubleClick(e: React.MouseEvent): void {
    if (e.button !== 0) return;
    const st = useStore.getState();
    if (st.operazione.tipo !== 'nessuna') return;
    const p = posizioneLocale(e as unknown as React.PointerEvent);
    if (colpisci(st.progetto, st.camera, p)) return;
    if (colpisciSuAsta(st.progetto, st.camera, p)) return;
    e.preventDefault();
    st.inquadraTuttoAnimato();
  }

  function onPointerDown(e: React.PointerEvent): void {
    // un tocco confermato al rilascio (vedi «due dita») ha il dito già
    // alzato, e catturare un puntatore che non c'è più è un errore
    try { (e.target as HTMLElement).setPointerCapture(e.pointerId); } catch { /* già rilasciato */ }
    const p = posizioneLocale(e);
    scriviPuntatore(p);
    premuto.current = { tasto: e.button, da: p, trascinato: false };
    const st = useStore.getState();

    // pan: tasto centrale, oppure spazio premuto
    if (e.button === 1 || spazio.current) return;

    // conferma dell'operazione modale in corso
    if (st.operazione.tipo === 'sposta' || st.operazione.tipo === 'ruota'
        || st.operazione.tipo === 'scala') {
      if (e.button === 0) confermaOperazione();
      else annullaOperazione();
      return;
    }

    if (e.button === 2) return;   // il tasto destro annulla, gestito in up

    // in modalità Vincoli un simbolo posato su un'asta si può TRASCINARE: la
    // suddivisione interna e il calcolo seguono, e vedere il momento cambiare
    // mentre l'appoggio scorre è il modo più diretto di capire a che cosa
    // serve la sua posizione
    if (st.modalita === 'vincoli') {
      const b = colpisciSuAsta(st.progetto, st.camera, p);
      if (b) {
        st.selezionaSuAsta(b.id);
        trascinaSuAsta.current = { id: b.id, astaId: b.astaId };
        if (b.tipo === 'vincolo') avviaAttesaRotazione({ tipo: 'suAsta', id: b.id });
        return;
      }
      // pressione prolungata su un nodo vincolato: rotazione interattiva
      const n = colpisci(st.progetto, st.camera, p);
      if (n?.tipo === 'nodo') {
        const nodo = st.progetto.nodi.find((x) => x.id === n.id);
        if (nodo?.vincolo) avviaAttesaRotazione({ tipo: 'nodo', id: n.id });
      }
    }

    // gli strumenti di disegno agiscono solo in modellazione: in modalità
    // vincoli un click deve applicare un vincolo, non creare un nodo
    if (st.modalita !== 'modellazione') return;

    if (st.strumento === 'nodo') {
      const s = calcolaSnap(st.progetto, st.camera, p, snapEffettivo());
      // se il punto sta SU un'asta, il nodo la spezza e la fa passare per sé:
      // altrimenti resterebbero due cose coincidenti e scollegate
      st.esegui(nodoCollegato(s.punto.x, s.punto.y, s.suAste));
      return;
    }

    if (st.strumento === 'asta' || st.operazione.tipo === 'disegnaAsta') {
      // a dito il punto si posa al RILASCIO (vedi `onPointerUp`): appoggiato
      // il dito si striscia, si guarda dove aggancia, e si stacca lì
      if (e.pointerType === 'touch') return;
      gestisciDisegnoAsta(p);
      return;
    }
  }

  function onPointerMove(e: React.PointerEvent): void {
    const p = posizioneLocale(e);
    const precedente = leggiPuntatore();
    scriviPuntatore(p);
    const st = useStore.getState();

    // rotazione in corso: l'angolo insegue il puntatore
    if (st.rotazioneVincolo) {
      const mondo = schermoAMondo(st.camera, p);
      const dx = mondo.x - st.rotazioneVincolo.x;
      const dy = mondo.y - st.rotazioneVincolo.y;
      if (Math.hypot(dx, dy) > 1e-9) {
        // û = (−sin α, cos α) ⇒ α = atan2(−dx, dy)
        const grezzo = Math.atan2(-dx, dy);
        const libero = e.ctrlKey || e.metaKey;
        const passo = PASSO_SNAP_ANGOLO;
        const agganciato = libero
          ? grezzo
          : Math.round(grezzo / passo) * passo;
        st.aggiornaRotazioneVincolo(normalizzaAngolo(agganciato), !libero);
      }
      return;
    }

    // pan
    if (premuto.current && (premuto.current.tasto === 1 || spazio.current)) {
      st.panning(p.x - precedente.x, p.y - precedente.y);
      premuto.current.trascinato = true;
      return;
    }

    if (premuto.current) {
      const d = Math.hypot(p.x - premuto.current.da.x, p.y - premuto.current.da.y);
      if (d > 4) premuto.current.trascinato = true;
    }

    // trascinamento di un simbolo lungo la propria asta
    if (trascinaSuAsta.current) {
      const t = trascinaSuAsta.current;
      st.impostaAnteprimaSuAsta({
        id: t.id, s: ascissaSuAsta(st.progetto, st.camera, t.astaId, p),
      });
      if (premuto.current) premuto.current.trascinato = true;
      return;
    }

    // riquadro di selezione
    if (st.operazione.tipo === 'riquadro') {
      st.impostaOperazione({ ...st.operazione, a: p });
      return;
    }
    if (premuto.current?.tasto === 0 && premuto.current.trascinato
        && st.strumento === 'seleziona'
        && st.operazione.tipo === 'nessuna') {
      st.impostaOperazione({ tipo: 'riquadro', da: premuto.current.da, a: p });
      return;
    }

    aggiornaSnap(p);

    // evidenziazione sotto il cursore
    if (st.modalita === 'vincoli' || st.modalita === 'reazioni') {
      const su = colpisciSuAsta(st.progetto, st.camera, p);
      if ((su?.id ?? null) !== st.suAstaEvidenziato) st.evidenziaSuAsta(su?.id ?? null);
    }
    if (st.modalita === 'vincoli') {
      const b = colpisci(st.progetto, st.camera, p);
      const nodo = b?.tipo === 'nodo' ? b.id : null;
      const attuale = st.anteprimaVincolo?.nodoId ?? null;
      if (nodo !== attuale) {
        st.impostaAnteprimaVincolo(
          nodo ? { nodoId: nodo, azione: anteprimaSuNodo(nodo) } : null,
        );
      }
    }
    if (st.operazione.tipo === 'nessuna') {
      const b = colpisci(st.progetto, st.camera, p);
      const nuovo = b ? { tipo: b.tipo, id: b.id as string } : null;
      const vecchio = st.evidenziato;
      if (nuovo?.id !== vecchio?.id || nuovo?.tipo !== vecchio?.tipo) {
        st.impostaEvidenziato(nuovo);
      }
    }
  }

  function onPointerUp(e: React.PointerEvent): void {
    const p = posizioneLocale(e);
    const info = premuto.current;
    premuto.current = null;
    const st = useStore.getState();
    annullaAttesaRotazione();

    if (st.rotazioneVincolo) {
      st.concludiRotazioneVincolo(true);
      return;
    }

    // fine del trascinamento lungo l'asta: UN SOLO comando in cronologia,
    // non uno per fotogramma
    if (trascinaSuAsta.current) {
      const t = trascinaSuAsta.current;
      trascinaSuAsta.current = null;
      const anteprima = st.anteprimaSuAsta;
      st.impostaAnteprimaSuAsta(null);
      if (anteprima && info?.trascinato) concludiTrascinamentoSuAsta(t.id, anteprima.s);
      return;
    }

    if (st.operazione.tipo === 'riquadro') {
      const sel = dentroRiquadro(st.progetto, st.camera, st.operazione.da, st.operazione.a);
      st.seleziona({ nodi: new Set(sel.nodi), aste: new Set(sel.aste) }, e.shiftKey);
      st.impostaOperazione({ tipo: 'nessuna' });
      return;
    }

    /*
     * L'ASTA A DITO SI CONFERMA STACCANDO.
     *
     * Col mouse il punto si posa alla pressione, perché il cursore si vede
     * prima di premere. Il dito invece copre proprio il punto che vuole
     * toccare: lo si appoggia, si striscia guardando l'aggancio e l'asta
     * elastica, e il punto vale dove il dito si stacca — anche dopo uno
     * strisciamento lungo, che col mouse sarebbe un trascinamento.
     */
    if (e.pointerType === 'touch' && info && info.tasto === 0
        && st.modalita === 'modellazione'
        && (st.strumento === 'asta' || st.operazione.tipo === 'disegnaAsta')) {
      gestisciDisegnoAsta(p);
      return;
    }

    if (!info || info.trascinato) return;
    if (info.tasto === 1 || spazio.current) return;

    if (info.tasto === 2) {
      // tasto destro: annulla l'operazione o svuota la selezione
      if (st.operazione.tipo !== 'nessuna') annullaOperazione();
      return;
    }

    // ── modalità VINCOLI: il click applica o rimuove il vincolo corrente ──
    if (st.modalita === 'vincoli') {
      const b = colpisci(st.progetto, st.camera, p);
      if (b?.tipo === 'nodo') {
        const bersagli = st.selezione.nodi.has(b.id) && st.selezione.nodi.size > 1
          ? [...st.selezione.nodi]
          : [b.id];
        applicaVincolo(bersagli);
        st.selezionaSuAsta(null);
      } else if (b?.tipo === 'asta') {
        // un click sull'asta posa il simbolo NEL PUNTO cliccato: è lì che
        // l'utente ha indicato di volerlo, non a metà per convenzione
        posaSuAsta(b.id, ascissaSuAsta(st.progetto, st.camera, b.id, p));
      } else if (!b && !e.shiftKey) {
        st.svuotaSelezione();
        st.selezionaSuAsta(null);
      }
      return;
    }

    // ── modalità REAZIONI: click su una sconnessione = esploso, su un'asta
    //    = corpo libero della sezione, altrove = si richiude tutto ──
    if (st.modalita === 'reazioni') {
      gestisciClickReazioni(p);
      return;
    }

    // ── modalità CARICHI: il click applica il carico corrente ──
    if (st.modalita === 'carichi') {
      const b = colpisci(st.progetto, st.camera, p);
      if (b?.tipo === 'nodo') applicaCaricoNodale(b.id);
      else if (b?.tipo === 'asta') applicaCaricoAsta(b.id);
      else if (!e.shiftKey) st.svuotaSelezione();
      return;
    }

    if (st.strumento !== 'seleziona') return;

    // selezione con click
    const b = colpisci(st.progetto, st.camera, p);
    if (!b) {
      if (!e.shiftKey) st.svuotaSelezione();
      return;
    }
    if (b.tipo === 'asta' && e.altKey) {
      const catena = catenaCollineare(st.progetto, b.id);
      st.seleziona({ aste: new Set(catena) }, e.shiftKey);
      return;
    }
    if (b.tipo === 'nodo') {
      const gia = st.selezione.nodi.has(b.id);
      if (e.shiftKey && gia) {
        const n = new Set(st.selezione.nodi); n.delete(b.id);
        st.seleziona({ nodi: n, aste: st.selezione.aste });
      } else {
        st.seleziona({ nodi: new Set([b.id]) }, e.shiftKey);
      }
    } else {
      const gia = st.selezione.aste.has(b.id);
      if (e.shiftKey && gia) {
        const a = new Set(st.selezione.aste); a.delete(b.id);
        st.seleziona({ nodi: st.selezione.nodi, aste: a });
      } else {
        st.seleziona({ aste: new Set([b.id]) }, e.shiftKey);
      }
    }
  }

  /**
   * In modalità Reazioni il click interroga invece di modificare: apre la
   * cerniera più vicina, oppure taglia l'asta nel punto cliccato e mostra il
   * corpo libero del tronco. Nessun comando entra nella cronologia.
   */
  function gestisciClickReazioni(p: Punto): void {
    const st = useStore.getState();
    const statico = st.statico;
    if (!statico) return;

    // 1) una sconnessione entro 18 px?
    let vicina: { nodoId: string; d: number } | null = null;
    for (const sc of statico.equilibrio.sconnessioni) {
      const q = mondoASchermo(st.camera, { x: sc.x, y: sc.y });
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d < 18 && (!vicina || d < vicina.d)) vicina = { nodoId: sc.nodoId, d };
    }
    if (vicina) {
      st.esplodiSconnessione(
        st.sconnessioneEsplosa === vicina.nodoId ? null : vicina.nodoId,
      );
      return;
    }

    // 2) un'asta del modello d'autore: si taglia dove si è cliccato
    const b = colpisci(st.progetto, st.camera, p);
    if (b?.tipo === 'asta') {
      const asta = st.progetto.aste.find((a) => a.id === b.id);
      const ni = asta && st.progetto.nodi.find((n) => n.id === asta.nodoIniziale);
      const nj = asta && st.progetto.nodi.find((n) => n.id === asta.nodoFinale);
      if (ni && nj) {
        const mondo = schermoAMondo(st.camera, p);
        const dx = nj.x - ni.x, dy = nj.y - ni.y;
        const L2 = dx * dx + dy * dy;
        const s = L2 > 0
          ? Math.min(1, Math.max(0, ((mondo.x - ni.x) * dx + (mondo.y - ni.y) * dy) / L2))
          : 0;
        st.scegliTronco({ astaId: b.id as unknown as string, s, lato: 'monte' });
        return;
      }
    }

    // 3) altrove: si richiude tutto
    st.esplodiSconnessione(null);
    st.scegliTronco(null);
  }

  /**
   * La pressione prolungata (200 ms) distingue «voglio ruotare questo
   * vincolo» da «volevo solo selezionarlo»: un clic normale resta un clic.
   */
  function avviaAttesaRotazione(
    bersaglio: { tipo: 'nodo'; id: NodeId } | { tipo: 'suAsta'; id: string },
  ): void {
    annullaAttesaRotazione();
    attesaRotazione.current = setTimeout(() => {
      const st = useStore.getState();
      const dati = datiVincolo(st, bersaglio);
      if (!dati) return;
      trascinaSuAsta.current = null;
      st.avviaRotazioneVincolo({
        bersaglio, tipoVincolo: dati.tipo,
        x: dati.x, y: dati.y,
        angoloIniziale: dati.angolo, angolo: dati.angolo,
        agganciato: true,
      });
      st.messaggia('rotazione: trascina per orientare, Ctrl libera lo snap, Esc annulla');
    }, 200);
  }

  function annullaAttesaRotazione(): void {
    if (attesaRotazione.current !== null) {
      clearTimeout(attesaRotazione.current);
      attesaRotazione.current = null;
    }
  }

  /** Posizione, tipo e angolo del vincolo da ruotare. */
  function datiVincolo(
    st: ReturnType<typeof useStore.getState>,
    b: { tipo: 'nodo'; id: NodeId } | { tipo: 'suAsta'; id: string },
  ): { x: number; y: number; angolo: number; tipo: string } | null {
    if (b.tipo === 'nodo') {
      const n = st.progetto.nodi.find((x) => x.id === b.id);
      if (!n?.vincolo) return null;
      return { x: n.x, y: n.y, angolo: n.vincolo.angolo, tipo: n.vincolo.tipo };
    }
    const v = (st.progetto.vincoliSuAsta ?? []).find((x) => x.id === b.id);
    if (!v) return null;
    const a = st.progetto.aste.find((x) => x.id === v.astaId);
    const ni = a && st.progetto.nodi.find((x) => x.id === a.nodoIniziale);
    const nj = a && st.progetto.nodi.find((x) => x.id === a.nodoFinale);
    if (!ni || !nj) return null;
    return {
      x: ni.x + (nj.x - ni.x) * v.s,
      y: ni.y + (nj.y - ni.y) * v.s,
      angolo: v.vincolo.angolo,
      tipo: v.vincolo.tipo,
    };
  }

  function onWheel(e: React.WheelEvent): void {
    const p = posizioneLocale(e);
    const fattore = Math.pow(1.0015, -e.deltaY);
    useStore.getState().zoomPuntatore(p, fattore);
    aggiornaSnap(p);
  }

  // ── due dita ─────────────────────────────────────────────────────────
  /*
   * NAVIGAZIONE A DUE DITA, in ogni modalità e con ogni strumento: trascinare
   * sposta la vista, allargare e stringere la ingrandisce.
   *
   * La difficoltà è che due dita non arrivano mai insieme. Il primo tocco
   * arriva qualche centesimo di secondo prima del secondo, e fino a qui
   * agiva subito: con lo strumento Nodo ogni tentativo di spostare la vista
   * posava un nodo. Per questo un dito, e SOLO un dito — il mouse resta
   * immediato — aspetta `ATTESA_SECONDO_DITO` prima di agire. Se in quel
   * tempo arriva il secondo, il primo tocco non è mai esistito; se il dito
   * si alza o si sposta prima, il tocco parte subito e nessuno se ne accorge.
   *
   * Alzato un dito, quello che resta giù non conta più finché non si alza
   * anche lui: chi finisce un ingrandimento non vuole che il dito rimasto
   * disegni qualcosa.
   */
  function giu(e: React.PointerEvent): void {
    if (e.pointerType !== 'touch') { segnaPuntatorePresente(true); onPointerDown(e); return; }
    dita.current.set(e.pointerId, posizioneLocale(e));
    if (pizzicando.current) return;
    if (dita.current.size >= 2) { avviaPizzico(); return; }
    inAttesa.current = { giu: e, timer: setTimeout(confermaTocco, ATTESA_SECONDO_DITO) };
  }

  function muovi(e: React.PointerEvent): void {
    if (e.pointerType !== 'touch') { segnaPuntatorePresente(true); onPointerMove(e); return; }
    if (!dita.current.has(e.pointerId)) return;
    const p = posizioneLocale(e);
    if (pizzicando.current) {
      const [ia, ib] = [...dita.current.keys()];
      const a0 = dita.current.get(ia)!;
      const b0 = ib !== undefined ? dita.current.get(ib)! : null;
      dita.current.set(e.pointerId, p);
      if (b0) {
        useStore.getState().pizzico(
          a0, b0, dita.current.get(ia)!, dita.current.get(ib)!);
      }
      return;
    }
    dita.current.set(e.pointerId, p);
    if (inAttesa.current) {
      // un dito non sta mai fermo del tutto: sotto qualche pixel si aspetta
      if (distanza(posizioneLocale(inAttesa.current.giu), p) < 6) return;
      confermaTocco();
    }
    onPointerMove(e);
  }

  function su(e: React.PointerEvent): void {
    if (e.pointerType !== 'touch') { onPointerUp(e); return; }
    dita.current.delete(e.pointerId);
    if (pizzicando.current) {
      if (dita.current.size === 0) pizzicando.current = false;
      return;
    }
    if (inAttesa.current) confermaTocco();
    onPointerUp(e);
    ditoAlzato();
  }

  function toccoInterrotto(e: React.PointerEvent): void {
    if (e.pointerType !== 'touch') return;
    dita.current.delete(e.pointerId);
    scartaAttesa();
    if (dita.current.size === 0) pizzicando.current = false;
    ditoAlzato();
  }

  /*
   * Col dito alzato non c'è più un punto indicato: né l'elastico né
   * l'aggancio hanno qualcosa da seguire. L'ultimo aggancio si cancella
   * anche dallo store, o la barra di stato continuerebbe a descriverlo.
   */
  function ditoAlzato(): void {
    segnaPuntatorePresente(false);
    useStore.getState().impostaUltimoSnap(null);
  }

  /** Il primo dito ha aspettato abbastanza: il suo tocco è un tocco. */
  function confermaTocco(): void {
    const attesa = inAttesa.current;
    if (!attesa) return;
    scartaAttesa();
    segnaPuntatorePresente(true);
    onPointerDown(attesa.giu);
  }

  function scartaAttesa(): void {
    if (inAttesa.current) clearTimeout(inAttesa.current.timer);
    inAttesa.current = null;
  }

  function avviaPizzico(): void {
    pizzicando.current = true;
    ditoAlzato();
    if (inAttesa.current) { scartaAttesa(); return; }
    // Il primo dito aveva già cominciato qualcosa — il secondo è arrivato in
    // ritardo. Quello che era in corso si lascia cadere; ciò che era già
    // fatto, come un nodo posato, resta e si toglie con annulla.
    const st = useStore.getState();
    annullaAttesaRotazione();
    premuto.current = null;
    if (st.rotazioneVincolo) st.concludiRotazioneVincolo(false);
    if (trascinaSuAsta.current) {
      trascinaSuAsta.current = null;
      st.impostaAnteprimaSuAsta(null);
    }
    if (st.operazione.tipo === 'riquadro') st.impostaOperazione({ tipo: 'nessuna' });
  }

  // ── disegno delle aste ───────────────────────────────────────────────
  function gestisciDisegnoAsta(p: Punto): void {
    const st = useStore.getState();
    const s = calcolaSnap(
      st.progetto, st.camera, p, snapEffettivo(),
      st.operazione.tipo === 'disegnaAsta' ? st.operazione.daPunto : null,
      new Set(),
      st.operazione.tipo === 'disegnaAsta'
        ? st.operazione.direzionePrecedente ?? null : null,
    );

    // punto di partenza
    if (st.operazione.tipo !== 'disegnaAsta' || st.operazione.daPunto === null) {
      let nodoId = s.nodoId;
      if (!nodoId) {
        const cmd = nodoCollegato(s.punto.x, s.punto.y, s.suAste);
        st.esegui(cmd);
        nodoId = cmd.id!;
      }
      st.impostaOperazione({ tipo: 'disegnaAsta', daNodo: nodoId, daPunto: s.punto });
      return;
    }

    // punto di arrivo: si crea l'asta e si prosegue a catena dal nuovo nodo
    const daNodo = st.operazione.daNodo!;
    if (s.nodoId && s.nodoId === daNodo) return;   // asta di lunghezza nulla

    const da = st.operazione.daPunto;
    const direzionePrecedente = Math.atan2(s.punto.y - da.y, s.punto.x - da.x);
    const catena = [
      ...(st.operazione.catena ?? []),
      {
        punto: da, nodo: daNodo,
        direzione: st.operazione.direzionePrecedente ?? null,
      },
    ];

    if (s.nodoId) {
      st.esegui(aggiungiAsta(daNodo, s.nodoId, st.materialeCorrente, st.sezioneCorrente));
      st.impostaOperazione({
        tipo: 'disegnaAsta', daNodo: s.nodoId, daPunto: s.punto,
        direzionePrecedente, catena,
      });
    } else {
      const cmd = estrudi(daNodo, s.punto.x, s.punto.y, st.materialeCorrente, st.sezioneCorrente);
      st.esegui(cmd);
      st.impostaOperazione({
        tipo: 'disegnaAsta', daNodo: cmd.idNodo!, daPunto: s.punto,
        direzionePrecedente, catena,
      });
    }
  }

  // ── tasti che devono essere noti al canvas ───────────────────────────
  useEffect(() => {
    const giu = (e: KeyboardEvent) => {
      // in Risultati lo spazio comanda la riproduzione del carico, non il pan:
      // senza questa eccezione trascinare dopo averlo premuto sposterebbe la
      // vista mentre si guarda un diagramma
      if (e.code === 'Space' && useStore.getState().modalita !== 'risultati') {
        spazio.current = true;
      }
      if (e.key === 'Control' || e.key === 'Meta') {
        useStore.getState().impostaSnapInvertito(true);
      }
    };
    const su = (e: KeyboardEvent) => {
      if (e.code === 'Space') spazio.current = false;
      if (e.key === 'Control' || e.key === 'Meta') {
        useStore.getState().impostaSnapInvertito(false);
      }
    };
    window.addEventListener('keydown', giu);
    window.addEventListener('keyup', su);
    return () => {
      window.removeEventListener('keydown', giu);
      window.removeEventListener('keyup', su);
    };
  }, []);

  return (
    <div ref={contenitore} className="relative h-full w-full overflow-hidden">
      {/*
        Senza tastiera non c'era modo di eliminare né di deselezionare: la
        barra è l'unica via su un telefono, e una comodità col mouse.
      */}
      <BarraSelezione />
      <canvas
        ref={canvas}
        className="h-full w-full"
        style={{ cursor: 'crosshair' }}
        onPointerDown={giu}
        onPointerMove={muovi}
        onPointerUp={su}
        onPointerCancel={toccoInterrotto}
        onWheel={onWheel}
        onDoubleClick={onDoubleClick}
        onContextMenu={(e) => e.preventDefault()}
      />
    </div>
  );
}

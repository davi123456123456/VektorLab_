/**
 * IL PANNELLO DI DESTRA, SUL TELEFONO: un cassetto che si tira col dito.
 *
 * Si apre scorrendo dal bordo destro verso sinistra — o toccando la linguetta
 * sul bordo — e si chiude scorrendolo verso destra o toccando il disegno che
 * resta scoperto a sinistra. Mentre il dito si muove il pannello lo segue,
 * e al rilascio decide: aperto se è stato tirato per almeno un terzo, o
 * lanciato con un colpo deciso.
 *
 * Prima era un foglio a tutto schermo che copriva anche la maniglia con cui
 * lo si era aperto: una volta dentro, non c'era modo di uscirne.
 *
 * Sul pannello aperto il gesto si riconosce solo dopo dieci pixel, e solo se
 * è orizzontale e verso destra: in verticale il pannello deve scorrere, e un
 * tocco su un bottone deve restare un tocco.
 */

import { useRef, useState, type ReactNode } from 'react';

interface Gesto {
  x0: number;
  y0: number;
  t0: number;
  da: 'bordo' | 'pannello';
  deciso: boolean;
  trascinato: boolean;
}

const limita = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export function CassettoTelefono({ aperto, apri, chiudi, children }: {
  aperto: boolean;
  apri: () => void;
  chiudi: () => void;
  children: ReactNode;
}) {
  const pannello = useRef<HTMLDivElement>(null);
  const gesto = useRef<Gesto | null>(null);
  const appenaTrascinato = useRef(false);
  const toccoSulVelo = useRef(false);
  // di quanto il pannello è spostato verso destra mentre il dito lo tiene;
  // null quando nessuno lo tocca e vale lo stato aperto/chiuso
  const [spostamento, setSpostamento] = useState<number | null>(null);

  const larghezza = () => pannello.current?.offsetWidth ?? 320;

  const inizia = (e: React.PointerEvent, da: Gesto['da']) => {
    // un trascinamento senza clic finale non deve inghiottire il tocco dopo
    appenaTrascinato.current = false;
    gesto.current = {
      x0: e.clientX, y0: e.clientY, t0: e.timeStamp, da,
      // dal bordo ogni movimento è il gesto; sul pannello va prima capito
      deciso: da === 'bordo', trascinato: false,
    };
    if (da === 'bordo') e.currentTarget.setPointerCapture(e.pointerId);
  };

  const muovi = (e: React.PointerEvent) => {
    const g = gesto.current;
    if (!g) return;
    const dx = e.clientX - g.x0;
    const dy = e.clientY - g.y0;
    if (!g.deciso) {
      if (Math.hypot(dx, dy) < 10) return;
      // verticale o verso sinistra: non è per noi, il pannello scorre
      if (Math.abs(dx) <= Math.abs(dy) || dx < 0) { gesto.current = null; return; }
      g.deciso = true;
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    if (Math.abs(dx) > 6) g.trascinato = true;
    const L = larghezza();
    setSpostamento(g.da === 'bordo' ? limita(L + dx, 0, L) : limita(dx, 0, L));
  };

  const finisci = (e: React.PointerEvent) => {
    const g = gesto.current;
    gesto.current = null;
    setSpostamento(null);
    if (!g || !g.deciso) return;
    const dx = e.clientX - g.x0;
    const velocita = dx / Math.max(1, e.timeStamp - g.t0);   // px/ms
    const soglia = larghezza() / 3;
    if (g.da === 'bordo') {
      // un tocco sulla linguetta apre come un trascinamento
      if (!g.trascinato || -dx > soglia || velocita < -0.4) apri();
    } else {
      appenaTrascinato.current = g.trascinato;
      if (dx > soglia || velocita > 0.4) chiudi();
    }
  };

  const annullaGesto = () => { gesto.current = null; setSpostamento(null); };

  const L = pannello.current?.offsetWidth ?? 0;
  const trasformazione = spostamento !== null
    ? `translateX(${spostamento}px)`
    : aperto ? 'translateX(0)' : 'translateX(calc(100% + 16px))';
  const velo = spostamento !== null && L > 0 ? 1 - spostamento / L : aperto ? 1 : 0;

  return (
    <>
      <div
        className="cassetto-velo"
        style={{
          opacity: velo,
          pointerEvents: aperto ? 'auto' : 'none',
          transition: spostamento !== null ? 'none' : undefined,
        }}
        // chiude solo un tocco COMINCIATO sul velo: il clic che il browser
        // genera dopo il gesto che apre il cassetto cadrebbe proprio qui,
        // perché il velo compare sotto il dito, e lo richiuderebbe subito
        onPointerDown={() => { toccoSulVelo.current = true; }}
        onClick={() => {
          if (toccoSulVelo.current) chiudi();
          toccoSulVelo.current = false;
        }}
        aria-hidden="true"
      />

      {/* a cassetto aperto la linguetta resta sotto di lui e sotto il velo */}
      <div
        className="cassetto-bordo"
        onPointerDown={(e) => inizia(e, 'bordo')}
        onPointerMove={muovi}
        onPointerUp={finisci}
        onPointerCancel={annullaGesto}
        role="button"
        aria-label="Apri il pannello delle proprietà"
        aria-hidden={aperto}
      >
        <span className="cassetto-linguetta" />
      </div>

      <aside
        ref={pannello}
        className="cassetto"
        aria-hidden={!aperto}
        style={{
          transform: trasformazione,
          transition: spostamento !== null ? 'none' : undefined,
        }}
        onPointerDown={(e) => { if (aperto) inizia(e, 'pannello'); }}
        onPointerMove={muovi}
        onPointerUp={finisci}
        onPointerCancel={annullaGesto}
        // il rilascio dopo un trascinamento non deve valere come tocco sul
        // bottone da cui il dito era partito
        onClickCapture={(e) => {
          if (appenaTrascinato.current) {
            appenaTrascinato.current = false;
            e.stopPropagation();
            e.preventDefault();
          }
        }}
      >
        <div className="flex min-h-0 flex-1 flex-col overflow-auto">{children}</div>
      </aside>
    </>
  );
}

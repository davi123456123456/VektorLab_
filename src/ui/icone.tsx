/**
 * LE ICONE DELL'INTERFACCIA.
 *
 * Disegni a tratto da Tabler Icons (licenza MIT, tabler.io/icons), copiati qui
 * come percorsi SVG invece di aggiungere una dipendenza: sono una quindicina,
 * e un pacchetto da cinquemila icone per usarne quindici non vale il peso.
 *
 * Sono SVG e non caratteri Unicode perché i caratteri li disegna il font del
 * sistema: su iPhone `⚙` e `↥` diventavano emoji colorate, ognuna di una
 * misura diversa. Un SVG a tratto è identico su ogni schermo e prende il
 * colore del testo che lo circonda.
 */

const TRATTI = {
  // le modalità
  modellazione: ['M4 20h4l10.5 -10.5a2.828 2.828 0 1 0 -4 -4l-10.5 10.5v4', 'M13.5 6.5l4 4'],
  vincoli: ['M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.87l-8.106 -13.536a1.914 1.914 0 0 0 -3.274 0z'],
  carichi: [
    'M15 12h3.586a1 1 0 0 1 .707 1.707l-6.586 6.586a1 1 0 0 1 -1.414 0l-6.586 -6.586a1 1 0 0 1 .707 -1.707h3.586v-3h6v3z',
    'M15 3h-6', 'M15 6h-6',
  ],
  materiali: ['M12 4l-8 4l8 4l8 -4l-8 -4', 'M4 12l8 4l8 -4', 'M4 16l8 4l8 -4'],
  analisi: [
    'M4 3m0 2a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2z',
    'M8 7m0 1a1 1 0 0 1 1 -1h6a1 1 0 0 1 1 1v1a1 1 0 0 1 -1 1h-6a1 1 0 0 1 -1 -1z',
    'M8 14l0 .01', 'M12 14l0 .01', 'M16 14l0 .01',
    'M8 17l0 .01', 'M12 17l0 .01', 'M16 17l0 .01',
  ],
  reazioni: ['M12 4l0 10', 'M12 4l4 4', 'M12 4l-4 4', 'M4 20l16 0'],
  risultati: ['M4 19l16 0', 'M4 15l4 -6l4 2l4 -5l4 4'],

  // gli strumenti
  seleziona: ['M7.904 17.563a1.2 1.2 0 0 0 2.228 .308l2.09 -3.093l4.907 4.907a1.067 1.067 0 0 0 1.509 0l1.047 -1.047a1.067 1.067 0 0 0 0 -1.509l-4.907 -4.907l3.113 -2.09a1.2 1.2 0 0 0 -.309 -2.228l-13.582 -3.904l3.904 13.563z'],
  nodo: ['M12 12m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0'],
  asta: [
    'M6 18m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0',
    'M18 6m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0',
    'M7.5 16.5l9 -9',
  ],

  // la cronologia e la fine della catena
  annulla: ['M9 14l-4 -4l4 -4', 'M5 10h11a4 4 0 1 1 0 8h-1'],
  ripeti: ['M15 14l4 -4l-4 -4', 'M19 10h-11a4 4 0 1 0 0 8h1'],
  termina: ['M5 12l5 5l10 -10'],

  fotocamera: [
    'M5 7h1a2 2 0 0 0 2 -2a1 1 0 0 1 1 -1h6a1 1 0 0 1 1 1a2 2 0 0 0 2 2h1a2 2 0 0 1 2 2v9a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-9a2 2 0 0 1 2 -2',
    'M9 13a3 3 0 1 0 6 0a3 3 0 0 0 -6 0',
  ],
} as const;

export type NomeIcona = keyof typeof TRATTI;

export function Icona({ nome, dimensione = 20 }: { nome: NomeIcona; dimensione?: number }) {
  return (
    <svg
      width={dimensione} height={dimensione} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={1.75}
      strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true" focusable="false"
      style={{ display: 'block', flexShrink: 0 }}
    >
      {TRATTI[nome].map((d) => <path key={d} d={d} />)}
    </svg>
  );
}

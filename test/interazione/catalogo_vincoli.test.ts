/**
 * §3.0 — l'elenco definitivo dei vincoli, bloccato.
 *
 * Il catalogo è l'unica fonte di verità della tavolozza: nome, icona, gradi
 * di vincolo e comportamento stanno nello stesso oggetto, e questo test fissa
 * che restino nell'ordine e nella composizione stabiliti.
 */

import { describe, it, expect } from 'vitest';
import {
  CATALOGO_VINCOLI, definizioneVincolo, vincoliDi,
} from '../../src/core/model/catalogoVincoli.js';

describe('elenco degli esterni (a telaio)', () => {
  const esterni = vincoliDi('telaio');

  it('sono esattamente sette, in quest ordine', () => {
    expect(esterni.map((v) => v.nome)).toEqual([
      'Cerniera a telaio',
      'Carrello',
      'Incastro',
      'Doppio pendolo a telaio',
      'Pattino a telaio',
      'Biella',
      'Molla',
    ]);
  });

  it('con questi gradi di vincolo', () => {
    expect(esterni.map((v) => v.gdv)).toEqual(['2', '1', '3', '2', '2', '1', 'elastico']);
  });

  it('NESSUNO separa i corpi rigidi, nemmeno posato in campata', () => {
    expect(esterni.every((v) => !v.separa)).toBe(true);
  });

  it('tutti hanno il simbolo orientabile: l angolo esiste sempre', () => {
    expect(esterni.every((v) => v.orientabile)).toBe(true);
  });

  it('cerniera e incastro orientano il disegno ma non le reazioni', () => {
    const soloDisegno = esterni.filter((v) => v.soloDisegno).map((v) => v.id);
    expect(soloDisegno).toEqual(['cerniera', 'incastro']);
  });
});

describe('elenco degli interni', () => {
  const interni = vincoliDi('interno');

  it('sono esattamente cinque, in quest ordine', () => {
    expect(interni.map((v) => v.nome)).toEqual([
      'Cerniera interna',
      'Cerniera',
      'Doppio pendolo interno',
      'Pattino interno',
      'Carrello interno',
    ]);
  });

  it('con questi gradi di vincolo', () => {
    expect(interni.map((v) => v.gdv)).toEqual(['2(g−1)', '2m', '2', '2', '1']);
  });

  it('il carrello interno è l unico interno da un grado', () => {
    const daUno = interni.filter((v) => v.gdv === '1');
    expect(daUno.map((v) => v.id)).toEqual(['carrelloInterno']);
  });

  it('TUTTI separano i corpi rigidi', () => {
    expect(interni.every((v) => v.separa)).toBe(true);
  });

  it('incastro, biella e molla non compaiono fra gli interni', () => {
    // il CARRELLO invece sì, ma solo nella variante interna: quella a telaio
    // e quella interna sono due vincoli diversi, e i loro nomi lo dicono
    const nomi = interni.map((v) => v.nome.toLowerCase()).join(' ');
    for (const assente of ['incastro', 'biella', 'molla']) {
      expect(nomi).not.toContain(assente);
    }
    expect(nomi).toContain('carrello interno');
    expect(interni.some((v) => v.nome === 'Carrello')).toBe(false);
  });

  it('orientabili sono la «Cerniera» e il carrello interno', () => {
    // la prima perché ha il simbolo a terra, il secondo perché l'angolo
    // definisce il piano di scorrimento
    expect(interni.filter((v) => v.orientabile).map((v) => v.id))
      .toEqual(['cernieraSconnessa', 'carrelloInterno']);
  });
});

describe('integrità del catalogo', () => {
  it('gli id sono unici', () => {
    const ids = CATALOGO_VINCOLI.map((v) => v.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('i nomi sono unici: due voci con lo stesso nome sarebbero indistinguibili', () => {
    const nomi = CATALOGO_VINCOLI.map((v) => v.nome);
    expect(new Set(nomi).size).toBe(nomi.length);
  });

  it('dodici voci in tutto: sette a telaio, cinque interne', () => {
    expect(CATALOGO_VINCOLI).toHaveLength(12);
    expect(vincoliDi('telaio')).toHaveLength(7);
    expect(vincoliDi('interno')).toHaveLength(5);
  });

  it('ogni voce porta la PROPRIA icona: nome e simbolo non possono sfasarsi', () => {
    // è la proprietà strutturale che sostituisce due array paralleli
    for (const v of CATALOGO_VINCOLI) {
      expect(v.icona).toBeDefined();
      expect(definizioneVincolo(v.id)?.icona).toBe(v.icona);
      expect(definizioneVincolo(v.id)?.nome).toBe(v.nome);
    }
  });

  it('«Cerniera a telaio» e «Cerniera» sono due voci distinte', () => {
    const telaio = definizioneVincolo('cerniera')!;
    const sconnessa = definizioneVincolo('cernieraSconnessa')!;
    expect(telaio.categoria).toBe('telaio');
    expect(sconnessa.categoria).toBe('interno');
    // la differenza che conta: una separa i corpi, l'altra no
    expect(telaio.separa).toBe(false);
    expect(sconnessa.separa).toBe(true);
    // e hanno icone diverse, altrimenti sarebbero indistinguibili a schermo
    expect(telaio.icona.genere).not.toBe(sconnessa.icona.genere);
  });
});

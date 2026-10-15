/**
 * Contratto del percorso COMPLETO del generatore: foglio, prospettiva, piega,
 * e primitive portate nella foto con la stessa trasformazione
 * (test/foto/campioni-foto, rigenerabili con
 * `python -m generatore --solo-json --seme 1 --n 10`).
 *
 * La campagna principale usa le primitive ideali della scena; questa prova
 * che anche quelle della foto arrivano a `leggi()` nel verso giusto: un asse
 * ribaltato o un angolo col segno sbagliato farebbero crollare il conteggio.
 * Non tutte si leggono perfette — la prospettiva inclina le aste corte, ed è
 * compito della Fase 4 raddrizzare il foglio — ma la grande maggioranza sì.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { confronta } from '../../src/foto/confronto.js';
import { leggi } from '../../src/foto/index.js';
import { schemaInProgetto, type SchemaGenerato } from '../../src/foto/schema.js';
import type { Primitive } from '../../src/foto/tipi.js';

const cartella = join(dirname(fileURLToPath(import.meta.url)), 'campioni-foto');

describe('campioni completi del generatore (foto)', () => {
  it('almeno 8 su 10 si leggono esattamente, e nessuno fa fallire la lettura', () => {
    const file = readdirSync(cartella).filter((f) => f.endsWith('.json')).sort();
    expect(file).toHaveLength(10);
    let perfetti = 0;
    for (const nome of file) {
      const { primitive, schema } = JSON.parse(readFileSync(join(cartella, nome), 'utf8')) as {
        primitive: Primitive; schema: SchemaGenerato;
      };
      const esito = leggi(primitive);
      expect(esito.avvisi.map((a) => a.codice)).not.toContain('erroreLettura');
      if (confronta(esito.progetto, schemaInProgetto(schema)).perfetto) perfetti++;
    }
    expect(perfetti).toBeGreaterThanOrEqual(8);
  });
});

/**
 * Campioni del generatore sintetico (test/foto/campioni, rigenerabili con
 * `python -m generatore --solo-etichette --seme 1 --n 40`): primitive ideali
 * di schemi casuali disegnati con le convenzioni dei fogli d'esame. Ognuno
 * deve leggersi esattamente.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { confronta } from '../../src/foto/confronto.js';
import { leggi } from '../../src/foto/index.js';
import { schemaInProgetto, type SchemaGenerato } from '../../src/foto/schema.js';
import type { Primitive } from '../../src/foto/tipi.js';

const cartella = join(dirname(fileURLToPath(import.meta.url)), 'campioni');
const campioni = readdirSync(cartella).filter((f) => f.endsWith('.json')).sort();

describe('campagna sui campioni del generatore', () => {
  it('ci sono i campioni', () => expect(campioni.length).toBe(40));

  it.each(campioni)('%s si legge esattamente', (nome) => {
    const { primitive, schema } = JSON.parse(readFileSync(join(cartella, nome), 'utf8')) as {
      primitive: Primitive; schema: SchemaGenerato;
    };
    const c = confronta(leggi(primitive).progetto, schemaInProgetto(schema));
    expect(c.differenze).toEqual([]);
  });
});

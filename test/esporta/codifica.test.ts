/**
 * §4.2 — LA CODIFICA DEL TESTO.
 *
 * Il testo del PDF deve restare testo: selezionabile, ricercabile, e senza
 * caratteri persi. WinAnsi non contiene le lettere greche né i simboli
 * matematici, che in una relazione di calcolo ci sono a ogni riga: qui si
 * verifica che ognuno abbia una sostituzione dichiarata, e che le sostituzioni
 * non si saldino alle parole vicine.
 */

import { describe, it, expect } from 'vitest';
import { codificaWinAnsi, letteraleWinAnsi } from '../../src/esporta/pdf.js';

describe('§4.2 — accenti e punteggiatura passano intatti', () => {
  for (const t of [
    'àèìòù ÀÈÌÒÙ', '«virgolette»', 'trattino — lungo', 'gradi 30°',
    'metri quadri mm²', 'metri cubi mm³', 'più o meno ±', 'sezione n° 3',
  ]) {
    it(JSON.stringify(t), () => {
      const { testo, sostituiti } = codificaWinAnsi(t);
      expect(sostituiti).toEqual([]);
      expect(testo).toBe(t);
    });
  }
});

describe('§4.2 — i simboli fuori tavola hanno una sostituzione', () => {
  /* Ogni carattere che una relazione di calcolo può contenere. Se uno di
     questi diventa «?», nel PDF si legge un dato in meno. */
  const simboli = 'σinduced τ χ θ λ γ δ ρ α β ν Δ Σ φ ω π ε η μ × − – — ≤ ≥ ≠ ≈ ∞ √ ∑ ⊥ ∥ ∫ ∂ ⁴ ⁵ ₀ ₁ ₂ ↑ ↓ ‰ ⌀';
  for (const c of [...simboli].filter((x) => x.trim() && x.codePointAt(0)! > 127)) {
    it(`«${c}» non diventa un punto interrogativo`, () => {
      const { testo } = codificaWinAnsi(c);
      expect(testo).not.toContain('?');
      expect(testo.length).toBeGreaterThan(0);
    });
  }
});

describe('§4.2 — una sostituzione lunga non si salda alla parola vicina', () => {
  it('σid diventa «sigma id», non «sigmaid»', () => {
    expect(codificaWinAnsi('σid').testo).toBe('sigma id');
  });
  it('e σ_VM resta separato dal trattino basso', () => {
    expect(codificaWinAnsi('σ_VM').testo).toBe('sigma_VM');
  });
  it('mentre ⁴ resta attaccato: mm⁴ diventa mm4', () => {
    expect(codificaWinAnsi('mm⁴').testo).toBe('mm4');
  });
  it('e τ da solo resta una parola sola', () => {
    expect(codificaWinAnsi('τ max').testo).toBe('tau max');
  });
});

describe('§4.2 — la stringa letterale protegge i caratteri speciali', () => {
  it('parentesi e barra rovesciata', () => {
    expect(letteraleWinAnsi('a(b)c\\d')).toBe('(a\\(b\\)c\\\\d)');
  });
  it('gli accenti diventano ottali, non byte crudi', () => {
    expect(letteraleWinAnsi('à')).toBe('(\\340)');
  });
});

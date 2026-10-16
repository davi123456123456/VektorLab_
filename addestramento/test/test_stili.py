from __future__ import annotations

import numpy as np

from generatore.stili import scegli_stile


def test_i_simboli_dei_vincoli_cambiano_proporzioni():
    stili = [scegli_stile(np.random.default_rng(s)) for s in range(60)]
    for campo in ("dim_vincolo", "tratteggio", "base_terreno"):
        valori = [getattr(s, campo) for s in stili]
        assert max(valori) / min(valori) > 1.4, campo
    assert {s.righe_tratteggio for s in stili} >= {3, 4, 5, 6, 7}
    assert {s.verso_tratteggio for s in stili} == {-1, 1}

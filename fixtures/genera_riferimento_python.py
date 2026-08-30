"""
Genera il riferimento incrociato usando il pacchetto Python `fem2d`, che è
verificato indipendentemente contro le soluzioni analitiche.

Due implementazioni scritte in linguaggi e stili diversi che convergono sugli
stessi numeri sono una garanzia molto più forte del solo confronto con le
formule di manuale: intercettano gli errori sistematici di convenzione.

Uso:  python3 fixtures/genera_riferimento_python.py > fixtures/riferimento_python.json
"""
import json
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')))

from fem2d import Model, Material, Section, Frame2D

E = 210e9
NU = 0.3
MAT = Material(E=E, nu=NU, rho=0.0)
SEZ = Section.rectangle(b=0.10, h=0.20)     # A=0.02, I=6.6667e-5

casi = {}

# ── 1. portale a piedi incastrati con carico distribuito sul traverso ──
L, H, q = 6.0, 4.0, 25000.0
m = Model()
p1 = m.add_node(0.0, 0.0)
t1 = m.add_node(0.0, H)
t2 = m.add_node(L, H)
p2 = m.add_node(L, 0.0)
m.add_element(Frame2D(p1, t1, MAT, SEZ))
m.add_element(Frame2D(t1, t2, MAT, SEZ, qy=-q))
m.add_element(Frame2D(t2, p2, MAT, SEZ))
m.add_support(p1, ux=True, uy=True, rz=True)
m.add_support(p2, ux=True, uy=True, rz=True)
res = m.solve()
casi['portale_incastrato'] = {
    'descrizione': 'portale L=6 H=4, piedi incastrati, q=-25 kN/m sul traverso',
    'L': L, 'H': H, 'q': -q,
    'spostamenti': [
        [res.displacement(n).get('UX', 0.0),
         res.displacement(n).get('UY', 0.0),
         res.displacement(n).get('RZ', 0.0)] for n in (p1, t1, t2, p2)
    ],
    'reazioni': [
        [res.reaction(n).get('UX', 0.0),
         res.reaction(n).get('UY', 0.0),
         res.reaction(n).get('RZ', 0.0)] for n in (p1, p2)
    ],
    'momenti_estremita': [
        [float(res.element(e.id)['M'][0]), float(res.element(e.id)['M'][-1])]
        for e in m.elements
    ],
}

# ── 2. telaio a due campate con carichi misti ──────────────────────────
m2 = Model()
a = m2.add_node(0.0, 0.0)
b = m2.add_node(0.0, 3.5)
c = m2.add_node(5.0, 3.5)
d = m2.add_node(9.0, 3.5)
e_ = m2.add_node(9.0, 0.0)
m2.add_element(Frame2D(a, b, MAT, SEZ))
m2.add_element(Frame2D(b, c, MAT, SEZ, qy=-18000.0))
m2.add_element(Frame2D(c, d, MAT, SEZ, qy=-12000.0))
m2.add_element(Frame2D(d, e_, MAT, SEZ))
m2.add_support(a, ux=True, uy=True, rz=True)
m2.add_support(e_, ux=True, uy=True)
m2.add_nodal_load(b, fx=15000.0)
res2 = m2.solve()
casi['telaio_due_campate'] = {
    'descrizione': 'telaio asimmetrico, incastro + cerniera, carichi distribuiti e forza orizzontale',
    'nodi': [[0, 0], [0, 3.5], [5, 3.5], [9, 3.5], [9, 0]],
    'q_traversi': [-18000.0, -12000.0],
    'forza_orizzontale': 15000.0,
    'spostamenti': [
        [res2.displacement(n).get('UX', 0.0),
         res2.displacement(n).get('UY', 0.0),
         res2.displacement(n).get('RZ', 0.0)] for n in (a, b, c, d, e_)
    ],
    'reazioni': [
        [res2.reaction(n).get('UX', 0.0),
         res2.reaction(n).get('UY', 0.0),
         res2.reaction(n).get('RZ', 0.0)] for n in (a, e_)
    ],
    'momenti_estremita': [
        [float(res2.element(el.id)['M'][0]), float(res2.element(el.id)['M'][-1])]
        for el in m2.elements
    ],
}

print(json.dumps({
    'generatoDa': 'fem2d (Python) — solutore verificato indipendentemente',
    'materiale': {'E': E, 'nu': NU},
    'sezione': {'b': 0.10, 'h': 0.20, 'A': SEZ.A, 'I': SEZ.I},
    'casi': casi,
}, indent=2))

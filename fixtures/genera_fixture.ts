import { writeFileSync } from 'node:fs';
import { progetto, rettangolare, IPE } from '../src/core/index.js';

const ipe300 = IPE.find((s) => s.nome === 'IPE 300')!;
const hea200 = rettangolare(0.2, 0.2, 'COLONNA');

// portale con due casi di carico e una combinazione SLU
const p = progetto('Portale 6×4 m — acciaio S275');
const p1 = p.nodo(0, 0, 'piede-sx');
const t1 = p.nodo(0, 4, 'testa-sx');
const t2 = p.nodo(6, 4, 'testa-dx');
const p2 = p.nodo(6, 0, 'piede-dx');
p.asta(p1, t1, 'S275', 'COLONNA');
const trave = p.asta(t1, t2, 'S275', 'IPE 300');
p.asta(t2, p2, 'S275', 'COLONNA');
p.sezione(hea200);
p.vincolo(p1, 'incastro');
p.vincolo(p2, 'incastro');

p.caso('G', 'Permanenti', 'G1');
p.distribuito(trave, -12000);
p.caso('Q', 'Variabili', 'Q');
p.distribuito(trave, -20000);
p.caso('W', 'Vento', 'vento');
p.forza(t1, 15000, 0);

p.combinazione('SLU1', 'SLU — variabile dominante Q', 'SLU', [
  { casoId: 'G', coefficiente: 1.3 },
  { casoId: 'Q', coefficiente: 1.5 },
  { casoId: 'W', coefficiente: 0.9 },
]);
p.combinazione('SLE1', 'SLE rara', 'SLE_rara', [
  { casoId: 'G', coefficiente: 1.0 },
  { casoId: 'Q', coefficiente: 1.0 },
]);

writeFileSync('fixtures/portale.strut', JSON.stringify(p.costruisci(), null, 2));

// trave Gerber
const g = progetto('Trave Gerber — 3 appoggi con cerniera');
const A = g.nodo(0, 0, 'A');
const G = g.nodo(6, 0, 'G-cerniera');
const B = g.nodo(8, 0, 'B');
const C = g.nodo(12, 0, 'C');
const g1 = g.asta(A, G, 'S275', 'IPE 300');
const g2 = g.asta(G, B, 'S275', 'IPE 300', { svincoloIniziale: { M: true } });
const g3 = g.asta(B, C, 'S275', 'IPE 300');
g.vincolo(A, 'cerniera');
g.vincolo(B, 'carrello');
g.vincolo(C, 'carrello');
for (const a of [g1, g2, g3]) g.distribuito(a, -15000);
writeFileSync('fixtures/gerber.strut', JSON.stringify(g.costruisci(), null, 2));

// caso patologico: tre carrelli paralleli
const l = progetto('Tre carrelli paralleli — vincoli mal disposti');
const n0 = l.nodo(0, 0), n1 = l.nodo(3, 0), n2 = l.nodo(6, 0);
l.asta(n0, n1, 'S275', 'IPE 300');
l.asta(n1, n2, 'S275', 'IPE 300');
l.vincolo(n0, 'carrello', 0);
l.vincolo(n1, 'carrello', 0);
l.vincolo(n2, 'carrello', 0);
l.forza(n1, 5000, -10000);
writeFileSync('fixtures/labile_carrelli_paralleli.strut', JSON.stringify(l.costruisci(), null, 2));

console.log('fixture generate');

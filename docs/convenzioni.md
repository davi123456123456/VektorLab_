# Convenzioni — StrutLab

Documento normativo del progetto. Ogni scelta qui elencata è implementata in
`core/` e verificata dai test: modificarla significa modificare i test.

## 1. Unità di misura

`core/` lavora **esclusivamente in SI**:

| grandezza | unità | grandezza | unità |
|---|---|---|---|
| lunghezze | m | forze | N |
| momenti | N·m | carichi distribuiti | N/m |
| tensioni, moduli | Pa | angoli | rad |
| masse | kg | densità | kg/m³ |
| variazioni termiche | K | dilatazione termica | 1/K |

Il file di progetto `.strut` salva in SI. La conversione verso kN, kN·m, mm,
MPa, gradi avviene **solo** nei formatter di `ui/`.

I tipi in `core/units.ts` sono *branded*: `Metri` non è assegnabile a `Newton`.
Sono usati al **confine** del nucleo (modello dati, materiali, sezioni,
risultati). Dentro il kernel numerico (`linalg/`, `fem/`) si usa `number`
semplice: un vettore di gradi di libertà mescola per costruzione metri e
radianti, e brandarlo non aggiungerebbe sicurezza.

## 2. Assi e rotazioni

* **Assi globali**: x verso destra, y verso l'**alto**, z uscente dal piano.
* **Rotazioni** θz positive **antiorarie**.
* Il canvas 2D ha y verso il basso: il ribaltamento avviene **solo** in
  `render/`. `core/` non sa che esiste uno schermo.

### Assi locali dell'asta

* x locale dal `nodoIniziale` al `nodoFinale`;
* y locale = x locale ruotato di **+90° antiorario**.

Ordine dei gradi di libertà di elemento: `[u₁, v₁, θ₁, u₂, v₂, θ₂]`.

## 3. Caratteristiche della sollecitazione

Convenzione **italiana**:

| grandezza | positiva quando |
|---|---|
| **N** | **trazione** (le facce del concio si allontanano) |
| **T** | fa ruotare il concio in senso **orario** |
| **M** | tende le fibre dal lato **−y locale** (concavità verso l'alto) |

Relazioni differenziali rispettate identicamente dalla ricostruzione analitica:

```
dM/dx = T          dT/dx = q_y
```

con `q_y` intensità del carico distribuito lungo +y locale.

**Disegno**: il diagramma del momento si traccia **dalla parte delle fibre
tese** (M > 0 → sotto l'asse). Commutabile con
`impostazioni.momentoDallaParteDelleFibreTese`.

### Forze d'estremità

`s = k_locale · d_locale − f_eq` sono le forze che i **nodi esercitano
sull'elemento**. Da esse:

```
N(x) = −s₀ − ∫₀ˣ q_x dt − Σ F_x,k
T(x) =  s₁ + ∫₀ˣ q_y dt + Σ F_y,k
M(x) = −s₂ + s₁·x + ∫₀ˣ (x−t)·q_y dt + Σ F_y,k·(x−x_k) − Σ M_k
```

esatte per carichi trapezoidali, concentrati e momenti applicati.

## 4. Carichi nodali equivalenti

`f_eq = ∫ Nᵀ q dx` è ciò che si **somma** al vettore dei carichi globale. Le
classiche "forze di incastro perfetto" sono il suo opposto, `−f_eq`.

Per carico uniforme `q_y` sull'intera asta:

```
f_eq = [0, q_y·L/2, q_y·L²/12, 0, q_y·L/2, −q_y·L²/12]
```

I trapezi su tratto parziale sono integrati con Gauss a 3 punti: le funzioni di
forma sono cubiche e il carico lineare, quindi la quadratura è **esatta**.

## 5. Vincoli — significato dell'angolo

È l'unica ambiguità pericolosa dell'interfaccia, quindi va ripetuta ovunque:

| tipo | `angolo` indica | blocca | gradi |
|---|---|---|---|
| `carrello` | il **piano di scorrimento** | traslazione **normale** al piano | 1 |
| `biella` | l'**asse della biella** | traslazione **lungo** l'asse | 1 |
| `bipendolo` | il piano di scorrimento | normale al piano + rotazione | 2 |
| `pattino` | il piano di scorrimento | normale al piano + rotazione | 2 |
| `cerniera` | *ignorato* | entrambe le traslazioni | 2 |
| `incastro` | *ignorato* | tutto | 3 |
| `molla` | riferimento delle rigidezze | *nulla rigidamente* | 0 |

`bipendolo` e `pattino` sono **cinematicamente identici**: cambiano solo il
simbolo grafico e la tradizione d'uso.

I vincoli obliqui sono trattati ruotando i gradi di libertà del nodo nel
riferimento del vincolo (*nodal coordinate transformation*), non con
moltiplicatori di Lagrange né con penalità: è esatto e non ha parametri.

## 6. Svincoli interni

**Unica fonte di verità: gli svincoli di estremità delle aste**
(`asta.svincolo.iniziale/finale`, con i flag `N`, `T`, `M`). `VincoloInterno`
è un oggetto di sola *authoring*: quando l'utente piazza una cerniera interna,
l'editor scrive gli svincoli sulle estremità delle aste elencate.

Regola del **master**: in un nodo, almeno un'estremità resta rigidamente
connessa. È necessaria sia nel FEM (altrimenti il grado di libertà rotazionale
del nodo resterebbe indeterminato) sia nel conteggio dei gradi di vincolo.

Nel FEM gli svincoli sono realizzati per **condensazione statica** della
matrice di elemento, con la corrispondente correzione dei carichi equivalenti.

## 7. Conteggio dei gradi di vincolo

L'analisi cinematica genera **una riga per ciascuna componente non rilasciata**
di ogni estremità svincolata. Questo riproduce esattamente la tabella classica:

| vincolo interno | gradi |
|---|---|
| cerniera fra *m* aste | 2(m−1) |
| bipendolo interno | 2 |
| pattino interno | 2 |
| biella | 1 |

perché una cerniera (M rilasciato) trasmette N e T, cioè 2 equazioni.

## 8. Classificazione della struttura

```
gradi di labilità      = 3n − rango(A)
gradi di iperstaticità = v  − rango(A)
```

con *n* numero di corpi rigidi, *v* numero di equazioni di vincolo, **A**
matrice cinematica. Il rango è calcolato per **SVD con tolleranza relativa**:
il conteggio `3n − v` da solo non distingue una struttura isostatica da una
labile per vincoli mal disposti.

Le colonne di rotazione di **A** sono scalate per la dimensione caratteristica
del modello, altrimenti il rango numerico dipenderebbe dall'unità di misura.

## 9. Casi di carico e combinazioni

L'analisi è lineare, ma le **verifiche non lo sono**: von Mises, Mohr-Coulomb e
instabilità vanno valutate **sulla combinazione**, mai superposte fra casi. Per
non lasciare quella trappola nel codice, una combinazione viene risolta sui
**carichi combinati**, non superponendo i risultati.

## 10. Segno delle grandezze termiche

* `deltaTUniforme` > 0 = riscaldamento. Su asta bloccata produce
  **N = −E·A·α·ΔT** (compressione).
* `deltaTGradiente` = T(fibra +y locale) − T(fibra −y locale). Su asta a
  estremi bloccati produce il momento costante **M = +E·I·α·ΔT/h**: se la fibra
  superiore è più calda e non può allungarsi, va in compressione, cioè momento
  positivo.

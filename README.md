# MNSR — Multilateral Netting and Systemic Risk Engine
### Fundamentals of Graph Theory Lab (26B16CS320)
**Jaypee Institute of Information Technology**

> **Group Members:**
> - Shivang Garg (2401200041)
> - Arpit Jha (2401200056)
> - Harshit Shukla (2401200047)
> - Kripansh Upadhyay (2401200042)

---

## 🏛️ Project Motivation (NPCI / UPI Inspiration)

In retail and interbank payment systems like NPCI's UPI (Unified Payments Interface) and RTGS, millions of transactions occur daily between banks (SBI, HDFC, ICICI, etc.).
- If every payment were settled bilaterally in gross real time, institutions would require tens of thousands of crores in idle cash reserves (liquidity trap).
- **Multilateral Netting** compresses the obligation network: circular debt loops (A owes B, B owes C, C owes A) are discovered through graph theory and cancelled. The net balance of every bank remains identical, but gross settlement volume collapses by 50%–80%.
- Simultaneously, this obligation network is an interbank contagion channel. If a distressed bank defaults, its creditors absorb losses. **DebtRank** and default cascades simulate financial systemic risk.

---

## 🚀 Quick Start (Running the Live Demo)

### 1. Build C++ Logic Engine (one time)
```bash
cd cpp
mkdir -p build && cd build
cmake .. -DCMAKE_BUILD_TYPE=Release
make
# Binary compiled to: cpp/build/mnsr_engine
```

### 2. Start the Backend & Dashboard
```bash
cd backend
npm install
npm start
```
The server will start at: **`http://localhost:3000`**

Open **`http://localhost:3000`** in your browser!

---

## 📊 Live Demonstration Walkthrough (For Your Teacher)

| Step | Tab / Action | What Teacher Sees on Screen | Underlying Graph Algorithm |
|:---|:---|:---|:---|
| **1** | **Network Topology** | Realistic network of 8 Indian banks (SBI, HDFC, ICICI, Axis...) with 14 gross obligations (₹8,400 Cr). | Directed weighted graph `G = (V, E, w)`, Adjacency list & matrix representation |
| **2** | **Add Obligation** | Pick `SBI` → `Axis` ₹400 Cr in dropdown and click *Inject Transaction*. Edge instantly appears and links in real time. | Dynamic graph modification, edge weight addition |
| **3** | **Multilateral Netting** | Click *Run Multilateral Netting*. Cycles pulse red, edge weights decrement with counters, zeroed debts disappear. Gross volume drops by ~69% while Net Balances stay invariant! | DFS cycle detection, greedy cycle cancellation, net position invariance verification |
| **4** | **Settlement & Gridlock** | Click *Execute Topological Settlement*. Banks light up vibrant green one by one in feasible payment order. | Kahn's Algorithm (in-degree reduction). If gross cycles exist, Tarjan's SCC flags gridlock |
| **5** | **Liquidity & Flow** | Select Source (e.g. `SBI`) and Sink (e.g. `Canara`). Click *Compute Max Flow* to animate fluid routing. Click *Highlight Min-Cut* to expose bottleneck edges in dashed red. | Edmonds-Karp (BFS augmenting paths) Max Flow, Min-Cut Theorem |
| **6** | **Crisis Simulator** | Click *Trigger Default Cascade* on `Yes_Bank` (or click the node). Round 1 defaults spread to creditors; creditors with thin buffers default in Round 2. Click *DebtRank* for systemic importance leaderboard. | BFS default cascade propagation, PageRank-style recursive DebtRank, Tarjan Articulation Points & Bridges |
| **7** | **Regulator Toolkit** | Click *Compute Supervision Cover* to highlight minimal bank set (Vertex Cover). Use slider to partition into *Regional Clearing Groups (Min k-Cut)*. | 2-Approximation Vertex Cover (Maximal Matching), Karger's Randomized Min k-Cut |

---

## 🏗️ System Architecture

```
MNSR/
├── cpp/                           # Core C++17 Graph Theory Engine
│   ├── include/
│   │   ├── graph.h                # Directed graph, BFS, DFS, connectivity
│   │   ├── netting.h              # Multilateral & bilateral netting algorithms
│   │   ├── settlement.h           # Kahn's topo sort & Tarjan SCC
│   │   ├── liquidity.h            # Edmonds-Karp Max Flow, Min-Cut, Dijkstra
│   │   ├── contagion.h            # Default cascade, DebtRank, Articulation/Bridges, MST
│   │   ├── regulator.h            # 2-approx Vertex Cover, Min k-Cut
│   │   └── json_helper.h          # Lightweight high-performance JSON parser
│   ├── src/
│   │   ├── main.cpp               # JSON I/O dispatcher for backend IPC
│   │   ├── graph.cpp
│   │   ├── netting.cpp
│   │   ├── settlement.cpp
│   │   ├── liquidity.cpp
│   │   ├── contagion.cpp
│   │   └── regulator.cpp
│   └── CMakeLists.txt
│
├── backend/                       # Node.js + Express + WebSocket Bridge
│   ├── server.js                  # Express server on port 3000 + WebSocket
│   ├── engine.js                  # Subprocess IPC bridge to C++ binary
│   ├── routes/api.js              # RESTful API routing layer
│   └── scenarios/                 # Realistic market scenarios (Normal, Pre-Crisis, 2008)
│
└── frontend/                      # Interactive Financial Terminal Dashboard
    ├── index.html                 # Single page application
    ├── css/style.css              # Dark Bloomberg-style terminal theme
    └── js/
        ├── app.js                 # UI Controller & state management
        ├── viz.js                 # D3.js force-directed physics graph
        ├── api.js                 # API client & INR currency formatting
        └── modules/               # Modular panels (Netting, Settlement, Liquidity, Contagion, Regulator)
```

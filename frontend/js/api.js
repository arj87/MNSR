// API Client for MNSR Backend
const BASE_URL = '/api';

const API = {
  // Scenario & Graph
  getScenarios: () => fetch(`${BASE_URL}/graph/scenarios`).then(r => r.json()),
  loadScenario: (name) => fetch(`${BASE_URL}/graph/scenario/${name}`).then(r => r.json()),
  loadGraph: (data) => post('/graph/load', data),
  generateGraph: (params) => post('/graph/generate', { params }),
  getGraphStats: (data) => post('/graph/load', data),
  bfs: (data, source) => post('/graph/bfs', { ...data, params: { source } }),
  dfs: (data, source) => post('/graph/dfs', { ...data, params: { source } }),

  // Netting
  runNetting: (data) => post('/netting/run', data),
  runBilateral: (data) => post('/netting/bilateral', data),
  getNetPositions: (data) => post('/netting/positions', data),

  // Settlement
  topoSort: (data) => post('/settlement/toposort', data),
  findSCC: (data) => post('/settlement/scc', data),

  // Liquidity
  maxFlow: (data, source, sink) => post('/liquidity/maxflow', { ...data, params: { source, sink } }),
  minCut: (data, source, sink) => post('/liquidity/mincut', { ...data, params: { source, sink } }),
  dijkstra: (data, source) => post('/liquidity/dijkstra', { ...data, params: { source } }),
  bellman: (data, source) => post('/liquidity/bellman', { ...data, params: { source } }),

  // Contagion
  simulateCascade: (data, defaultedNode, rounds = 10) =>
    post('/contagion/simulate', { ...data, params: { defaultedNode, rounds } }),
  debtRank: (data, maxIter = 20) => post('/contagion/debtrank', { ...data, params: { maxIter } }),
  articulationPoints: (data) => post('/contagion/articulation', data),
  bridges: (data) => post('/contagion/bridges', data),
  mst: (data) => post('/contagion/mst', data),

  // Regulator
  vertexCover: (data) => post('/regulator/vertexcover', data),
  kCut: (data, k = 2) => post('/regulator/kcut', { ...data, params: { k } }),
};

async function post(path, body) {
  try {
    const res = await fetch(BASE_URL + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const json = await res.json();
    return json;
  } catch (err) {
    console.error(`API Error on POST ${path}:`, err);
    return { status: 'error', error: err.message, result: null, steps: [] };
  }
}

// Indian Rupee formatting (e.g. ₹8,400 Cr)
function formatINR(val, isCrores = true) {
  if (val === undefined || val === null || isNaN(val)) return '₹0';
  const num = Math.round(val);
  const str = Math.abs(num).toString();
  let lastThree = str.substring(str.length - 3);
  const otherNumbers = str.substring(0, str.length - 3);
  if (otherNumbers !== '') lastThree = ',' + lastThree;
  const res = otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + lastThree;
  const sign = num < 0 ? '-' : '';
  return `${sign}₹${res}${isCrores ? ' Cr' : ''}`;
}

window.API = API;
window.formatINR = formatINR;

'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const engine = require('../engine');

const router = express.Router();
const scenariosDir = path.join(__dirname, '../scenarios');

// ---------------------------------------------------------------------------
// Helper: build engine command and forward, then broadcast steps via WS
// ---------------------------------------------------------------------------
async function forwardToEngine(res, commandStr, body) {
  const { nodes = [], edges = [], params = {} } = body;
  const commandObj = { command: commandStr, nodes, edges, params };

  try {
    const result = await engine.runCommand(commandObj);

    // Broadcast steps to WebSocket clients (attached to app by server.js)
    if (result.steps && result.steps.length > 0) {
      const app = res.app;
      if (app.broadcastSteps) {
        app.broadcastSteps(result.steps);
      }
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({
      status: 'error',
      error: err.message,
      result: null,
      steps: []
    });
  }
}

// ---------------------------------------------------------------------------
// Graph endpoints
// ---------------------------------------------------------------------------

// POST /api/graph/load
router.post('/graph/load', async (req, res) => {
  await forwardToEngine(res, 'graph.load', req.body);
});

// POST /api/graph/generate
router.post('/graph/generate', async (req, res) => {
  await forwardToEngine(res, 'graph.generate', req.body);
});

// GET /api/graph/scenarios — list available scenario JSON files
router.get('/graph/scenarios', (req, res) => {
  try {
    const files = fs.readdirSync(scenariosDir)
      .filter(f => f.endsWith('.json'))
      .map(f => ({
        name: f.replace('.json', ''),
        file: f
      }));
    res.json({ status: 'ok', scenarios: files });
  } catch (err) {
    res.status(500).json({ status: 'error', error: err.message, scenarios: [] });
  }
});

// GET /api/graph/scenario/:name — load a preset scenario by name
router.get('/graph/scenario/:name', (req, res) => {
  const name = path.basename(req.params.name); // prevent path traversal
  const filePath = path.join(scenariosDir, `${name}.json`);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ status: 'error', error: `Scenario '${name}' not found` });
  }

  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    res.json({ status: 'ok', scenario: name, ...data });
  } catch (err) {
    res.status(500).json({ status: 'error', error: `Failed to read scenario: ${err.message}` });
  }
});

// ---------------------------------------------------------------------------
// Netting endpoints
// ---------------------------------------------------------------------------

// POST /api/netting/run
router.post('/netting/run', async (req, res) => {
  await forwardToEngine(res, 'netting.run', req.body);
});

// POST /api/netting/bilateral
router.post('/netting/bilateral', async (req, res) => {
  await forwardToEngine(res, 'netting.bilateral', req.body);
});

// POST /api/netting/positions
router.post('/netting/positions', async (req, res) => {
  await forwardToEngine(res, 'netting.positions', req.body);
});

// ---------------------------------------------------------------------------
// Settlement endpoints
// ---------------------------------------------------------------------------

// POST /api/settlement/toposort
router.post('/settlement/toposort', async (req, res) => {
  await forwardToEngine(res, 'settlement.toposort', req.body);
});

// POST /api/settlement/scc
router.post('/settlement/scc', async (req, res) => {
  await forwardToEngine(res, 'settlement.scc', req.body);
});

// ---------------------------------------------------------------------------
// Liquidity endpoints
// ---------------------------------------------------------------------------

// POST /api/liquidity/maxflow
router.post('/liquidity/maxflow', async (req, res) => {
  await forwardToEngine(res, 'liquidity.maxflow', req.body);
});

// POST /api/liquidity/mincut
router.post('/liquidity/mincut', async (req, res) => {
  await forwardToEngine(res, 'liquidity.mincut', req.body);
});

// POST /api/liquidity/dijkstra
router.post('/liquidity/dijkstra', async (req, res) => {
  await forwardToEngine(res, 'liquidity.dijkstra', req.body);
});

// POST /api/liquidity/bellman
router.post('/liquidity/bellman', async (req, res) => {
  await forwardToEngine(res, 'liquidity.bellman', req.body);
});

// ---------------------------------------------------------------------------
// Contagion endpoints
// ---------------------------------------------------------------------------

// POST /api/contagion/simulate
router.post('/contagion/simulate', async (req, res) => {
  await forwardToEngine(res, 'contagion.simulate', req.body);
});

// POST /api/contagion/debtrank
router.post('/contagion/debtrank', async (req, res) => {
  await forwardToEngine(res, 'contagion.debtrank', req.body);
});

// POST /api/contagion/articulation
router.post('/contagion/articulation', async (req, res) => {
  await forwardToEngine(res, 'contagion.articulation', req.body);
});

// POST /api/contagion/bridges
router.post('/contagion/bridges', async (req, res) => {
  await forwardToEngine(res, 'contagion.bridges', req.body);
});

// POST /api/contagion/mst
router.post('/contagion/mst', async (req, res) => {
  await forwardToEngine(res, 'contagion.mst', req.body);
});

// ---------------------------------------------------------------------------
// Regulator endpoints
// ---------------------------------------------------------------------------

// POST /api/regulator/vertexcover
router.post('/regulator/vertexcover', async (req, res) => {
  await forwardToEngine(res, 'regulator.vertexcover', req.body);
});

// POST /api/regulator/kcut
router.post('/regulator/kcut', async (req, res) => {
  await forwardToEngine(res, 'regulator.kcut', req.body);
});

module.exports = router;

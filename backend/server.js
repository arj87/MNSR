'use strict';

const express = require('express');
const cors = require('cors');
const http = require('http');
const path = require('path');
const fs = require('fs');
const WebSocket = require('ws');

const { enginePath, engineExists } = require('./engine');
const apiRouter = require('./routes/api');

const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------
const app = express();

// CORS — allow all origins for development
app.use(cors());

// JSON body parsing (up to 10 MB for large graphs)
app.use(express.json({ limit: '10mb' }));

// Serve frontend static files
const frontendDir = path.join(__dirname, '../frontend');
if (fs.existsSync(frontendDir)) {
  app.use(express.static(frontendDir));
}

// ---------------------------------------------------------------------------
// Health endpoint
// ---------------------------------------------------------------------------
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    engine: engineExists(),
    enginePath,
    timestamp: new Date().toISOString()
  });
});

// ---------------------------------------------------------------------------
// API routes
// ---------------------------------------------------------------------------
app.use('/api', apiRouter);

// Catch-all: serve index.html for SPA routing (only if frontend exists)
app.get('*', (req, res) => {
  const indexPath = path.join(frontendDir, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).json({ error: 'Frontend not found. Build the frontend first.' });
  }
});

// ---------------------------------------------------------------------------
// HTTP + WebSocket server
// ---------------------------------------------------------------------------
const server = http.createServer(app);

const wss = new WebSocket.Server({ server });

// Keep track of all connected WebSocket clients
const wsClients = new Set();

wss.on('connection', (ws) => {
  wsClients.add(ws);

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'subscribe') {
        // Client is subscribing — acknowledge
        ws.send(JSON.stringify({ type: 'subscribed', message: 'Listening for algorithm steps.' }));
      }
    } catch (_) {
      // Ignore malformed messages
    }
  });

  ws.on('close', () => {
    wsClients.delete(ws);
  });

  ws.on('error', () => {
    wsClients.delete(ws);
  });

  // Send a welcome ping so the client knows the connection is live
  ws.send(JSON.stringify({ type: 'connected', message: 'MNSR WebSocket ready.' }));
});

/**
 * Broadcast algorithm steps to all connected WebSocket clients.
 * Called by the API router after each engine response.
 * @param {Array} steps
 */
app.broadcastSteps = function broadcastSteps(steps) {
  if (!steps || steps.length === 0) return;
  const payload = JSON.stringify({ type: 'steps', steps });
  for (const ws of wsClients) {
    if (ws.readyState === WebSocket.OPEN) {
      try { ws.send(payload); } catch (_) {}
    }
  }
};

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
server.listen(PORT, () => {
  console.log(`MNSR Server running at http://localhost:${PORT}`);
  console.log(`Engine binary: ${enginePath}`);
  console.log(`Engine ready: ${engineExists()}`);
  if (!engineExists()) {
    console.warn('WARNING: C++ engine binary not found. Build cpp/build/mnsr_engine first.');
  }
});

module.exports = { app, server, wss };

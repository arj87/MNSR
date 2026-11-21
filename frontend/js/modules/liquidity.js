// Liquidity & Flow Module
const LiquidityModule = {
  init(app) {
    this.app = app;
    this.bindEvents();
    this.updateDropdowns();
  },

  updateDropdowns() {
    const srcSel = document.getElementById('liquidity-src');
    const sinkSel = document.getElementById('liquidity-sink');
    if (!srcSel || !sinkSel) return;

    const currentSrc = srcSel.value;
    const currentSink = sinkSel.value;

    srcSel.innerHTML = '';
    sinkSel.innerHTML = '';

    this.app.nodes.forEach((n, idx) => {
      const opt1 = document.createElement('option');
      opt1.value = n.id;
      opt1.textContent = n.id;
      srcSel.appendChild(opt1);

      const opt2 = document.createElement('option');
      opt2.value = n.id;
      opt2.textContent = n.id;
      sinkSel.appendChild(opt2);
    });

    if (currentSrc && srcSel.querySelector(`option[value="${currentSrc}"]`)) {
      srcSel.value = currentSrc;
    } else if (srcSel.options.length > 0) {
      srcSel.selectedIndex = 0;
    }

    if (currentSink && sinkSel.querySelector(`option[value="${currentSink}"]`)) {
      sinkSel.value = currentSink;
    } else if (sinkSel.options.length > 1) {
      sinkSel.selectedIndex = sinkSel.options.length - 1;
    }
  },

  bindEvents() {
    const btnMaxFlow = document.getElementById('btn-run-maxflow');
    if (btnMaxFlow) {
      btnMaxFlow.addEventListener('click', () => this.runMaxFlow());
    }

    const btnMinCut = document.getElementById('btn-run-mincut');
    if (btnMinCut) {
      btnMinCut.addEventListener('click', () => this.runMinCut());
    }

    const btnDijkstra = document.getElementById('btn-run-dijkstra');
    if (btnDijkstra) {
      btnDijkstra.addEventListener('click', () => this.runDijkstra());
    }
  },

  async runMaxFlow() {
    const src = document.getElementById('liquidity-src')?.value;
    const sink = document.getElementById('liquidity-sink')?.value;
    if (!src || !sink || src === sink) {
      this.app.showToast('Please select distinct source and sink institutions', 'warning');
      return;
    }

    this.app.showSpinner(`Computing Max Flow (${src} → ${sink})...`);
    const data = { nodes: this.app.nodes, edges: this.app.edges };
    const res = await window.API.maxFlow(data, src, sink);
    this.app.hideSpinner();

    if (res.status !== 'ok') {
      this.app.showToast('Max flow calculation failed: ' + res.error, 'error');
      return;
    }

    const mf = res.result.maxFlow;
    document.getElementById('liquidity-maxflow-val').textContent = window.formatINR(mf);
    document.getElementById('liquidity-bottleneck-val').textContent = `${(res.result.augmentingPaths || []).length} Paths`;

    this.app.logSteps('liquidity-step-log', res.steps);

    // Animate augmenting paths
    const paths = res.result.augmentingPaths || [];
    this.app.viz.resetHighlight();
    for (const p of paths) {
      this.app.viz.highlightPath(p, '#00d4aa');
      await new Promise(r => setTimeout(r, 600));
    }
  },

  async runMinCut() {
    const src = document.getElementById('liquidity-src')?.value;
    const sink = document.getElementById('liquidity-sink')?.value;
    if (!src || !sink || src === sink) {
      this.app.showToast('Please select distinct source and sink institutions', 'warning');
      return;
    }

    this.app.showSpinner(`Finding Minimum Cut Bottleneck...`);
    const data = { nodes: this.app.nodes, edges: this.app.edges };
    const res = await window.API.minCut(data, src, sink);
    this.app.hideSpinner();

    if (res.status !== 'ok') {
      this.app.showToast('Min cut failed: ' + res.error, 'error');
      return;
    }

    const cutCap = res.result.cutCapacity;
    const cutEdges = res.result.cutEdges || [];
    document.getElementById('liquidity-mincut-val').textContent = window.formatINR(cutCap);

    this.app.viz.resetHighlight();
    this.app.viz.flashMinCut(cutEdges);

    this.app.logSteps('liquidity-step-log', [
      { type: 'warn', data: { msg: `Min-Cut capacity: ${window.formatINR(cutCap)} across ${cutEdges.length} bottleneck links` } },
      ...cutEdges.map(e => ({ type: 'remove', data: { msg: `Bottleneck Edge: ${e.from} → ${e.to} (₹${Math.round(e.weight)}Cr)` } }))
    ]);
  },

  async runDijkstra() {
    const src = document.getElementById('liquidity-src')?.value;
    const sink = document.getElementById('liquidity-sink')?.value;
    if (!src) return;

    this.app.showSpinner(`Calculating Optimal Routing from ${src}...`);
    const data = { nodes: this.app.nodes, edges: this.app.edges };
    const res = await window.API.dijkstra(data, src);
    this.app.hideSpinner();

    if (res.status !== 'ok') {
      this.app.showToast('Dijkstra routing failed: ' + res.error, 'error');
      return;
    }

    this.app.logSteps('liquidity-step-log', res.steps);

    // Reconstruct path to sink if possible
    if (sink && res.result.prev && res.result.prev[sink]) {
      const path = [];
      let cur = sink;
      while (cur) {
        path.push(cur);
        cur = res.result.prev[cur];
      }
      path.reverse();
      this.app.viz.resetHighlight();
      this.app.viz.highlightPath(path, '#f59e0b');
    }
  }
};

window.LiquidityModule = LiquidityModule;

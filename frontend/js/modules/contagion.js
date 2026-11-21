// Contagion & Systemic Risk Module
const ContagionModule = {
  init(app) {
    this.app = app;
    this.bindEvents();
    this.updateDropdowns();
  },

  updateDropdowns() {
    const sel = document.getElementById('contagion-bank-select');
    if (!sel) return;
    sel.innerHTML = '';
    this.app.nodes.forEach(n => {
      const opt = document.createElement('option');
      opt.value = n.id;
      opt.textContent = `${n.id} (Buffer: ${window.formatINR(n.capital)})`;
      sel.appendChild(opt);
    });
  },

  bindEvents() {
    const btnCascade = document.getElementById('btn-run-cascade');
    if (btnCascade) {
      btnCascade.addEventListener('click', () => {
        const bank = document.getElementById('contagion-bank-select')?.value;
        if (bank) this.triggerDefault(bank);
      });
    }

    const btnDebtRank = document.getElementById('btn-run-debtrank');
    if (btnDebtRank) {
      btnDebtRank.addEventListener('click', () => this.runDebtRank());
    }

    const btnAP = document.getElementById('btn-run-articulation');
    if (btnAP) {
      btnAP.addEventListener('click', () => this.runArticulation());
    }

    const btnMST = document.getElementById('btn-run-mst');
    if (btnMST) {
      btnMST.addEventListener('click', () => this.runMST());
    }
  },

  async triggerDefault(nodeId) {
    this.app.showSpinner(`Simulating Contagion Cascade (Defaulter: ${nodeId})...`);
    const data = { nodes: this.app.nodes, edges: this.app.edges };
    const res = await window.API.simulateCascade(data, nodeId, 10);
    this.app.hideSpinner();

    if (res.status !== 'ok') {
      this.app.showToast('Contagion simulation failed: ' + res.error, 'error');
      return;
    }

    this.app.logSteps('contagion-step-log', res.steps);

    // Play cascade animation
    if (res.steps && res.steps.length > 0) {
      await this.app.viz.playSteps(res.steps, (step) => {}, 800);
    }

    const totalDef = res.result.totalDefaulted || 0;
    const alertBox = document.getElementById('contagion-result-alert');
    if (alertBox) {
      alertBox.style.display = 'flex';
      alertBox.className = 'alert-box danger';
      alertBox.innerHTML = `<strong>CASCADE TERMINATED</strong>: ${totalDef} of ${this.app.nodes.length} institutions failed following ${nodeId}'s default.`;
    }
  },

  async runDebtRank() {
    this.app.showSpinner('Computing DebtRank Systemic Scores...');
    const data = { nodes: this.app.nodes, edges: this.app.edges };
    const res = await window.API.debtRank(data, 20);
    this.app.hideSpinner();

    if (res.status !== 'ok') {
      this.app.showToast('DebtRank calculation failed: ' + res.error, 'error');
      return;
    }

    const scores = res.result.scores || {};
    const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);

    const lbContainer = document.getElementById('debtrank-leaderboard');
    if (lbContainer) {
      lbContainer.innerHTML = '';
      sorted.forEach(([id, score], idx) => {
        const row = document.createElement('div');
        row.className = 'leaderboard-row';
        const pct = Math.round(score * 100);
        row.innerHTML = `
          <div class="lb-rank">#${idx + 1}</div>
          <div class="lb-name">${id}</div>
          <div class="lb-bar-wrap">
            <div class="lb-bar" style="width:${pct}%"></div>
          </div>
          <div class="lb-score">${score.toFixed(3)}</div>
        `;
        lbContainer.appendChild(row);
      });
    }

    this.app.logSteps('contagion-step-log', [
      { type: 'info', data: { msg: `DebtRank completed. Highest impact: ${sorted[0]?.[0]} (Score: ${sorted[0]?.[1].toFixed(3)})` } }
    ]);
  },

  async runArticulation() {
    this.app.showSpinner('Finding Articulation Points & Bridges...');
    const data = { nodes: this.app.nodes, edges: this.app.edges };
    const res = await window.API.articulationPoints(data);
    this.app.hideSpinner();

    if (res.status !== 'ok') {
      this.app.showToast('Analysis failed: ' + res.error, 'error');
      return;
    }

    const aps = res.result.articulationPoints || [];
    const bridges = res.result.bridges || [];

    this.app.viz.resetHighlight();
    aps.forEach(nid => this.app.viz.setNodeState(nid, 'active'));
    this.app.viz.flashMinCut(bridges);

    this.app.logSteps('contagion-step-log', [
      { type: 'warn', data: { msg: `Identified ${aps.length} Articulation Points: [${aps.join(', ')}]` } },
      { type: 'remove', data: { msg: `Identified ${bridges.length} Systemic Bridge Links` } }
    ]);
  },

  async runMST() {
    this.app.showSpinner('Constructing Exposure Spanning Tree (MST)...');
    const data = { nodes: this.app.nodes, edges: this.app.edges };
    const res = await window.API.mst(data);
    this.app.hideSpinner();

    if (res.status !== 'ok') {
      this.app.showToast('MST construction failed: ' + res.error, 'error');
      return;
    }

    const mstEdges = res.result.edges || [];
    this.app.viz.resetHighlight();
    mstEdges.forEach(e => {
      this.app.viz.highlightPath([e.from, e.to], '#d97706');
    });

    this.app.logSteps('contagion-step-log', [
      { type: 'info', data: { msg: `Maximum Spanning Tree covers key debt: ${window.formatINR(res.result.totalWeight)} across ${mstEdges.length} links` } }
    ]);
  }
};

window.ContagionModule = ContagionModule;

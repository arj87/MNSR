// Netting Module
const NettingModule = {
  init(app) {
    this.app = app;
    this.bindEvents();
  },

  bindEvents() {
    const btnMulti = document.getElementById('btn-run-netting');
    if (btnMulti) {
      btnMulti.addEventListener('click', () => this.runMultilateral());
    }

    const btnBi = document.getElementById('btn-run-bilateral');
    if (btnBi) {
      btnBi.addEventListener('click', () => this.runBilateral());
    }
  },

  async runMultilateral() {
    this.app.showSpinner('Running Multilateral Netting...');
    const data = { nodes: this.app.nodes, edges: this.app.edges };
    const res = await window.API.runNetting(data);
    this.app.hideSpinner();

    if (res.status !== 'ok') {
      this.app.showToast('Netting failed: ' + res.error, 'error');
      return;
    }

    this.renderResults(res.result);
    this.app.logSteps('netting-step-log', res.steps);

    // Animate steps on graph
    if (res.steps && res.steps.length > 0) {
      await this.app.viz.playSteps(res.steps, (step, i) => {
        // Step progress callback
      }, 700);
    }

    // Update current graph with netted edges
    if (res.result.nettedEdges) {
      this.app.edges = res.result.nettedEdges;
      this.app.viz.render(this.app.nodes, this.app.edges);
      this.app.updateGlobalStats();
    }
  },

  async runBilateral() {
    this.app.showSpinner('Running Bilateral Netting...');
    const data = { nodes: this.app.nodes, edges: this.app.edges };
    const res = await window.API.runBilateral(data);
    this.app.hideSpinner();

    if (res.status !== 'ok') {
      this.app.showToast('Bilateral netting failed: ' + res.error, 'error');
      return;
    }

    this.renderResults(res.result);
    this.app.logSteps('netting-step-log', res.steps);

    if (res.result.nettedEdges) {
      this.app.edges = res.result.nettedEdges;
      this.app.viz.render(this.app.nodes, this.app.edges);
      this.app.updateGlobalStats();
    }
  },

  renderResults(result) {
    const origEl = document.getElementById('netting-orig-vol');
    const newEl = document.getElementById('netting-new-vol');
    const savEl = document.getElementById('netting-savings-pct');
    const cycEl = document.getElementById('netting-cycles-count');

    if (origEl) origEl.textContent = window.formatINR(result.originalTotal);
    if (newEl) newEl.textContent = window.formatINR(result.newTotal);
    if (savEl) savEl.textContent = `${(result.savingsPct || 0).toFixed(1)}%`;
    if (cycEl) cycEl.textContent = (result.cancelledCycles || []).length;

    // Render net positions table
    const tableBody = document.querySelector('#net-positions-table tbody');
    if (tableBody && result.netPositionsAfter) {
      tableBody.innerHTML = '';
      for (const [id, net] of Object.entries(result.netPositionsAfter)) {
        const tr = document.createElement('tr');
        const signClass = net > 0 ? 'positive' : net < 0 ? 'negative' : 'neutral';
        const role = net > 0 ? 'Net Creditor' : net < 0 ? 'Net Debtor' : 'Balanced';
        tr.innerHTML = `
          <td><strong>${id}</strong></td>
          <td class="${signClass}">${window.formatINR(net)}</td>
          <td><span class="badge ${net > 0 ? 'badge-teal' : net < 0 ? 'badge-danger' : 'badge-mute'}">${role}</span></td>
        `;
        tableBody.appendChild(tr);
      }
    }
  }
};

window.NettingModule = NettingModule;

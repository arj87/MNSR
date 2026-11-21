// Settlement & Gridlock Module
const SettlementModule = {
  init(app) {
    this.app = app;
    this.bindEvents();
  },

  bindEvents() {
    const btnTopo = document.getElementById('btn-run-toposort');
    if (btnTopo) {
      btnTopo.addEventListener('click', () => this.runTopoSort());
    }

    const btnSCC = document.getElementById('btn-run-scc');
    if (btnSCC) {
      btnSCC.addEventListener('click', () => this.runSCC());
    }
  },

  async runTopoSort() {
    this.app.showSpinner('Sequencing Payments (Topological Sort)...');
    const data = { nodes: this.app.nodes, edges: this.app.edges };
    const res = await window.API.topoSort(data);
    this.app.hideSpinner();

    if (res.status !== 'ok') {
      this.app.showToast('Settlement failed: ' + res.error, 'error');
      return;
    }

    const gridlockAlert = document.getElementById('settlement-gridlock-alert');
    const settleList = document.getElementById('settlement-order-list');
    if (settleList) settleList.innerHTML = '';

    if (!res.result.success) {
      if (gridlockAlert) {
        gridlockAlert.style.display = 'flex';
        gridlockAlert.innerHTML = `⚠️ <strong>GRIDLOCK DETECTED!</strong> Circular debt cycle prevents complete sequential settlement. Run Netting first to resolve.`;
      }
      this.app.logSteps('settlement-step-log', res.steps);

      if (res.result.sccs && res.result.sccs.length > 0) {
        this.app.viz.colorGroups(res.result.sccs);
      }
      return;
    }

    if (gridlockAlert) gridlockAlert.style.display = 'none';

    // Populate numbered list
    const order = res.result.order || [];
    order.forEach((nodeId, idx) => {
      const li = document.createElement('li');
      li.id = `settle-item-${nodeId}`;
      li.innerHTML = `
        <span class="settle-num">${idx + 1}</span>
        <span>${nodeId}</span>
        <span class="badge badge-mute" style="margin-left:auto;">Pending</span>
      `;
      settleList.appendChild(li);
    });

    this.app.logSteps('settlement-step-log', res.steps);

    // Animate settlement order
    for (let i = 0; i < order.length; i++) {
      const nid = order[i];
      this.app.viz.setNodeState(nid, 'settled');
      const li = document.getElementById(`settle-item-${nid}`);
      if (li) {
        li.classList.add('settled');
        const badge = li.querySelector('.badge');
        if (badge) {
          badge.className = 'badge badge-success';
          badge.textContent = 'Settled';
        }
      }
      await new Promise(r => setTimeout(r, 600));
    }
  },

  async runSCC() {
    this.app.showSpinner('Detecting Strongly Connected Components...');
    const data = { nodes: this.app.nodes, edges: this.app.edges };
    const res = await window.API.findSCC(data);
    this.app.hideSpinner();

    if (res.status !== 'ok') {
      this.app.showToast('SCC analysis failed: ' + res.error, 'error');
      return;
    }

    const sccs = res.result.sccs || [];
    const gridlocks = res.result.gridlocks || [];

    this.app.viz.colorGroups(sccs);
    this.app.logSteps('settlement-step-log', [
      { type: 'info', data: { msg: `Found ${sccs.length} components (${gridlocks.length} gridlocked cycles)` } },
      ...res.steps
    ]);

    const gridlockAlert = document.getElementById('settlement-gridlock-alert');
    if (gridlockAlert) {
      if (gridlocks.length > 0) {
        gridlockAlert.style.display = 'flex';
        gridlockAlert.innerHTML = `⚠️ Found <strong>${gridlocks.length}</strong> gridlock cluster(s): ${gridlocks.map(g => g.join(' ↔ ')).join(' | ')}`;
      } else {
        gridlockAlert.style.display = 'flex';
        gridlockAlert.className = 'alert-box success';
        gridlockAlert.innerHTML = `✅ No circular gridlocks detected in the current network!`;
      }
    }
  }
};

window.SettlementModule = SettlementModule;

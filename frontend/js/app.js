// Main Application Controller for MNSR
// Professional typography, bank entity creation, edge inspection, no emojis

class MNSRApp {
  constructor() {
    this.nodes = [];
    this.edges = [];
    this.currentTab = 'network';
    this.viz = null;
    this.ws = null;

    this.init();
  }

  async init() {
    // 1. Initialize Visualizer
    this.viz = new window.GraphViz('#graph-area');
    this.viz.onNodeClick = (node) => this.handleNodeClick(node);
    this.viz.onEdgeClick = (edge) => this.handleEdgeClick(edge);

    // 2. Setup Tabs
    this.setupTabs();

    // 3. Setup WebSocket connection
    this.setupWebSocket();

    // 4. Initialize Submodules
    window.NettingModule.init(this);
    window.SettlementModule.init(this);
    window.LiquidityModule.init(this);
    window.ContagionModule.init(this);
    window.RegulatorModule.init(this);

    // 5. Setup Network tab controls & bank creation form
    this.setupNetworkControls();

    // 6. Load default scenario (Normal Market)
    await this.loadScenario('normal_market');
  }

  setupTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-tab');
        this.switchTab(tab);
      });
    });
  }

  switchTab(tabName) {
    this.currentTab = tabName;

    // Update buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-tab') === tabName);
    });

    // Update panels
    document.querySelectorAll('.tab-panel').forEach(panel => {
      panel.classList.toggle('active', panel.id === `panel-${tabName}`);
    });

    // Refresh visualizer highlights
    this.viz.resetHighlight();

    // Notify modules
    if (tabName === 'liquidity') {
      window.LiquidityModule.updateDropdowns();
    } else if (tabName === 'contagion') {
      window.ContagionModule.updateDropdowns();
    }
  }

  setupWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    const dot = document.querySelector('.status-dot');
    const statusText = document.getElementById('status-text');

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        if (dot) dot.className = 'status-dot connected';
        if (statusText) statusText.textContent = 'CONNECTED';
        this.ws.send(JSON.stringify({ type: 'subscribe' }));
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'steps') {
            console.log('Algorithm steps received:', msg.steps);
          }
        } catch (e) {
          console.error('WS parse error', e);
        }
      };

      this.ws.onclose = () => {
        if (dot) dot.className = 'status-dot disconnected';
        if (statusText) statusText.textContent = 'STANDBY';
        setTimeout(() => this.setupWebSocket(), 3000);
      };

      this.ws.onerror = () => {
        if (dot) dot.className = 'status-dot disconnected';
      };
    } catch (err) {
      console.warn('WS Init error:', err);
    }
  }

  setupNetworkControls() {
    // Scenario buttons
    document.querySelectorAll('.scenario-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.scenario-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const sName = btn.getAttribute('data-scenario');
        if (sName) this.loadScenario(sName);
      });
    });

    // Form 1: Add Obligation Form
    const addEdgeForm = document.getElementById('add-obligation-form');
    if (addEdgeForm) {
      addEdgeForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const from = document.getElementById('trans-from').value;
        const to = document.getElementById('trans-to').value;
        const weight = parseFloat(document.getElementById('trans-amount').value);

        if (!from || !to || isNaN(weight) || weight <= 0) {
          this.showToast('Please specify valid parameters', 'warning');
          return;
        }
        if (from === to) {
          this.showToast('Debtor and creditor must be distinct institutions', 'warning');
          return;
        }

        this.addObligation(from, to, weight);
        document.getElementById('trans-amount').value = '300';
      });
    }

    // Form 2: Add New Custom Bank Entity
    const addBankForm = document.getElementById('add-bank-form');
    if (addBankForm) {
      addBankForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const nameInput = document.getElementById('new-bank-name');
        const capInput = document.getElementById('new-bank-capital');
        const liqInput = document.getElementById('new-bank-liquidity');

        const rawName = (nameInput.value || '').trim().replace(/\s+/g, '_');
        const capital = parseFloat(capInput.value) || 2000;
        const liquidity = parseFloat(liqInput.value) || 1000;

        if (!rawName) {
          this.showToast('Please enter an institution name', 'warning');
          return;
        }

        // Check duplicate
        if (this.nodes.some(n => n.id.toLowerCase() === rawName.toLowerCase())) {
          this.showToast(`Institution ${rawName} already exists`, 'warning');
          return;
        }

        this.addBankEntity(rawName, capital, liquidity);
        nameInput.value = '';
      });
    }

    // Generate Synthetic Network
    const btnGen = document.getElementById('btn-generate-graph');
    if (btnGen) {
      btnGen.addEventListener('click', async () => {
        const type = document.getElementById('gen-type').value;
        const n = parseInt(document.getElementById('gen-n').value, 10);
        this.showSpinner(`Generating ${type} Network (N=${n})...`);
        const res = await window.API.generateGraph({ type, n });
        this.hideSpinner();
        if (res.status === 'ok') {
          this.nodes = res.result.nodes || [];
          this.edges = res.result.edges || [];
          this.viz.render(this.nodes, this.edges);
          this.updateGlobalStats();
          this.populateBankDropdowns();
          this.showToast(`Generated ${n}-node ${type} network`, 'success');
        }
      });
    }
  }

  async loadScenario(name) {
    this.showSpinner(`Loading Scenario: ${name}...`);
    const res = await window.API.loadScenario(name);
    this.hideSpinner();

    if (res.status !== 'ok') {
      this.showToast('Failed to load scenario: ' + res.error, 'error');
      return;
    }

    this.nodes = res.nodes || [];
    this.edges = res.edges || [];

    this.viz.render(this.nodes, this.edges);
    this.updateGlobalStats();
    this.populateBankDropdowns();
    this.showToast(`Loaded scenario: ${name}`, 'info');
  }

  addBankEntity(name, capital, liquidity) {
    const newNode = {
      id: name,
      capital: capital,
      liquidity: liquidity,
      defaulted: false,
      debtRank: 0
    };

    this.nodes.push(newNode);
    this.viz.render(this.nodes, this.edges);
    this.updateGlobalStats();
    this.populateBankDropdowns();

    this.showToast(`Created Bank: ${name} (Initials: ${window.getBankInitials(name)}, Buffer: ${window.formatINR(capital)})`, 'success');
  }

  addObligation(from, to, weight) {
    const existing = this.edges.find(e => e.from === from && e.to === to);
    if (existing) {
      existing.weight += weight;
    } else {
      this.edges.push({ from, to, weight });
    }

    this.viz.render(this.nodes, this.edges);
    this.updateGlobalStats();
    this.showToast(`Obligation added: ${from} owes ${to} ${window.formatINR(weight)}`, 'success');

    window.LiquidityModule.updateDropdowns();
    window.ContagionModule.updateDropdowns();
  }

  handleNodeClick(node) {
    if (this.currentTab === 'contagion') {
      window.ContagionModule.triggerDefault(node.id);
    } else {
      this.showToast(`Bank: ${node.id} | Capital: ${window.formatINR(node.capital)} | Liquidity: ${window.formatINR(node.liquidity)}`, 'info');
    }
  }

  handleEdgeClick(edge) {
    this.showToast(`Selected Obligation: ${edge.from} owes ${edge.to} ${window.formatINR(edge.weight)}`, 'info');
  }

  populateBankDropdowns() {
    const fromSel = document.getElementById('trans-from');
    const toSel = document.getElementById('trans-to');
    if (!fromSel || !toSel) return;

    fromSel.innerHTML = '';
    toSel.innerHTML = '';

    this.nodes.forEach(n => {
      const o1 = document.createElement('option');
      o1.value = n.id;
      o1.textContent = n.id;
      fromSel.appendChild(o1);

      const o2 = document.createElement('option');
      o2.value = n.id;
      o2.textContent = n.id;
      toSel.appendChild(o2);
    });

    if (toSel.options.length > 1) {
      toSel.selectedIndex = 1;
    }

    window.LiquidityModule.updateDropdowns();
    window.ContagionModule.updateDropdowns();
  }

  updateGlobalStats() {
    const nNodes = this.nodes.length;
    const nEdges = this.edges.length;
    const grossVol = this.edges.reduce((sum, e) => sum + e.weight, 0);

    const elNodes = document.getElementById('stat-nodes-count');
    const elEdges = document.getElementById('stat-edges-count');
    const elGross = document.getElementById('stat-gross-volume');

    if (elNodes) elNodes.textContent = nNodes;
    if (elEdges) elEdges.textContent = nEdges;
    if (elGross) elGross.textContent = window.formatINR(grossVol);
  }

  logSteps(containerId, steps) {
    const box = document.getElementById(containerId);
    if (!box) return;
    box.innerHTML = '';

    if (!steps || steps.length === 0) {
      box.innerHTML = '<div class="step-log-entry type-info">No algorithm steps recorded.</div>';
      return;
    }

    steps.forEach(s => {
      const div = document.createElement('div');
      let typeClass = 'type-info';
      let text = '';

      if (s.type === 'cycle_found') {
        typeClass = 'type-cycle';
        text = `[CYCLE] ${(s.data.cycle || []).join(' → ')} (Min Flow: ₹${Math.round(s.data.min_weight)}Cr)`;
      } else if (s.type === 'edge_reduced') {
        typeClass = 'type-reduce';
        text = `[REDUCE] ${s.data.from} → ${s.data.to} (-₹${Math.round(s.data.reduced_by)}Cr → ₹${Math.round(s.data.new_weight)}Cr)`;
      } else if (s.type === 'edge_removed') {
        typeClass = 'type-remove';
        text = `[CLEARED] ${s.data.from} → ${s.data.to} debt loop eliminated`;
      } else if (s.type === 'node_settled') {
        typeClass = 'type-settle';
        text = `[SETTLED] #${s.data.settled_at}: Institution ${s.data.node} settled`;
      } else if (s.type === 'node_defaulted') {
        typeClass = 'type-cycle';
        text = `[DEFAULT] Round ${s.data.round || 0}: ${s.data.node} insolvent (${s.data.reason || 'distress'})`;
      } else if (s.type === 'loss_incurred') {
        typeClass = 'type-reduce';
        text = `[LOSS] ${s.data.node} absorbed ₹${Math.round(s.data.loss)}Cr (Buffer: ₹${Math.round(s.data.remainingCapital)}Cr)`;
      } else if (s.type === 'cover_edge_picked') {
        typeClass = 'type-info';
        text = `[SUPERVISION] Link ${s.data.edge_from} ↔ ${s.data.edge_to} covered`;
      } else {
        text = s.data?.msg || JSON.stringify(s.data || {});
      }

      div.className = `step-log-entry ${typeClass}`;
      div.textContent = text;
      box.appendChild(div);
    });

    box.scrollTop = box.scrollHeight;
  }

  showSpinner(text = 'Running Engine Algorithm...') {
    const sp = document.getElementById('graph-spinner');
    if (sp) {
      sp.querySelector('.spinner-text').textContent = text;
      sp.classList.add('visible');
    }
  }

  hideSpinner() {
    const sp = document.getElementById('graph-spinner');
    if (sp) sp.classList.remove('visible');
  }

  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.animation = 'toastOut .25s ease forwards';
      setTimeout(() => toast.remove(), 250);
    }, 3500);
  }
}

// Instantiate on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  window.app = new MNSRApp();
});

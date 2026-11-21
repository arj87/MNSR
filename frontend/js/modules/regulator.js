// Regulator & Supervision Module
const RegulatorModule = {
  init(app) {
    this.app = app;
    this.bindEvents();
  },

  bindEvents() {
    const btnVC = document.getElementById('btn-run-vertexcover');
    if (btnVC) {
      btnVC.addEventListener('click', () => this.runVertexCover());
    }

    const btnKCut = document.getElementById('btn-run-kcut');
    if (btnKCut) {
      btnKCut.addEventListener('click', () => this.runKCut());
    }

    const slider = document.getElementById('kcut-slider');
    const valLabel = document.getElementById('kcut-val');
    if (slider && valLabel) {
      slider.addEventListener('input', (e) => {
        valLabel.textContent = e.target.value;
      });
    }
  },

  async runVertexCover() {
    this.app.showSpinner('Computing Supervision Set (2-Approx Vertex Cover)...');
    const data = { nodes: this.app.nodes, edges: this.app.edges };
    const res = await window.API.vertexCover(data);
    this.app.hideSpinner();

    if (res.status !== 'ok') {
      this.app.showToast('Vertex cover failed: ' + res.error, 'error');
      return;
    }

    const cover = res.result.cover || [];
    this.app.viz.resetHighlight();
    cover.forEach(nid => this.app.viz.setNodeState(nid, 'covered'));

    const resBox = document.getElementById('regulator-vc-result');
    if (resBox) {
      resBox.innerHTML = `
        <div class="stat-card" style="margin-top:10px;">
          <div class="stat-label">Supervision Target Set Size</div>
          <div class="stat-value text-teal">${cover.length} <span style="font-size:12px; color:var(--text-mute)">/ ${this.app.nodes.length} Banks</span></div>
          <div class="stat-sub">Regulating these banks directly monitors 100% of interbank obligations.</div>
        </div>
        <div style="margin-top:8px; display:flex; flex-wrap:wrap; gap:4px;">
          ${cover.map(id => `<span class="badge badge-teal">${id}</span>`).join('')}
        </div>
      `;
    }

    this.app.logSteps('regulator-step-log', res.steps);
  },

  async runKCut() {
    const k = parseInt(document.getElementById('kcut-slider')?.value || '2', 10);
    this.app.showSpinner(`Partitioning into ${k} Regional Clearing Groups (Min k-Cut)...`);

    const data = { nodes: this.app.nodes, edges: this.app.edges };
    const res = await window.API.kCut(data, k);
    this.app.hideSpinner();

    if (res.status !== 'ok') {
      this.app.showToast('Min k-Cut failed: ' + res.error, 'error');
      return;
    }

    const groups = res.result.groups || [];
    const cutEdges = res.result.cutEdges || [];
    const cutWeight = res.result.cutWeight || 0;

    this.app.viz.colorGroups(groups);
    this.app.viz.flashMinCut(cutEdges);

    const grpContainer = document.getElementById('regulator-groups-container');
    if (grpContainer) {
      grpContainer.innerHTML = `
        <div style="font-size:11px; color:var(--text-dim); margin-bottom:6px;">
          Inter-group Cut Exposure: <strong style="color:var(--amber)">${window.formatINR(cutWeight)}</strong>
        </div>
      `;

      const colors = ['#00d4aa', '#f59e0b', '#3b82f6', '#ec4899', '#8b5cf6'];
      groups.forEach((grp, idx) => {
        const c = colors[idx % colors.length];
        const row = document.createElement('div');
        row.className = 'group-row';
        row.innerHTML = `
          <span class="group-swatch" style="background:${c}"></span>
          <strong style="color:${c}">Group ${idx + 1}:</strong>
          <span>${grp.join(', ')}</span>
        `;
        grpContainer.appendChild(row);
      });
    }

    this.app.logSteps('regulator-step-log', res.steps);
  }
};

window.RegulatorModule = RegulatorModule;

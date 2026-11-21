// D3.js Force-Directed Graph Visualizer for MNSR
// Professional obsidian theme, authentic bank logos, spread-out layout, edge inspection

const BANK_BRAND_COLORS = {
  'SBI': '#28549C',
  'HDFC': '#004C8F',
  'ICICI': '#F58220',
  'Axis': '#97144D',
  'Kotak': '#ED1C24',
  'PNB': '#A20034',
  'Yes_Bank': '#005CA9',
  'Canara': '#0091DF'
};

const BANK_LOGOS = {
  'SBI': 'assets/logos/sbi.svg',
  'HDFC': 'assets/logos/hdfc.svg',
  'ICICI': 'assets/logos/icici.svg',
  'Axis': 'assets/logos/axis.svg',
  'Kotak': 'assets/logos/kotak.svg',
  'PNB': 'assets/logos/pnb.svg',
  'Yes_Bank': 'assets/logos/yes_bank.svg',
  'Canara': 'assets/logos/canara.svg'
};

function getBankInitials(name) {
  if (!name) return 'BK';
  const parts = name.split(/[_\s-]+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
}

function getBankColor(name) {
  if (BANK_BRAND_COLORS[name]) return BANK_BRAND_COLORS[name];
  // Deterministic color generation for custom banks
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  const hues = [200, 260, 280, 320, 160, 30, 45];
  const h = hues[Math.abs(hash) % hues.length];
  return `hsl(${h}, 65%, 45%)`;
}

class GraphViz {
  constructor(containerId) {
    this.container = d3.select(containerId);
    this.width = this.container.node().getBoundingClientRect().width || 900;
    this.height = this.container.node().getBoundingClientRect().height || 700;

    this.nodes = [];
    this.edges = [];
    this.simulation = null;
    this.onNodeClick = null;
    this.onEdgeClick = null;
    this.selectedEdge = null;

    this.initSVG();
  }

  initSVG() {
    this.container.selectAll('*').remove();

    this.svg = this.container.append('svg')
      .attr('id', 'graph-svg')
      .attr('width', '100%')
      .attr('height', '100%')
      .attr('viewBox', `0 0 ${this.width} ${this.height}`);

    // Tooltip div
    this.tooltip = d3.select('body').append('div')
      .attr('class', 'd3-tooltip')
      .style('opacity', 0);

    // Defs
    this.defs = this.svg.append('defs');

    // Arrowhead marker: Normal
    this.defs.append('marker')
      .attr('id', 'arrow-default')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 38)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-4L8,0L0,4')
      .attr('fill', '#475569');

    // Arrowhead marker: Active / Highlighted
    this.defs.append('marker')
      .attr('id', 'arrow-active')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 38)
      .attr('refY', 0)
      .attr('markerWidth', 7)
      .attr('markerHeight', 7)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-4L8,0L0,4')
      .attr('fill', '#38bdf8');

    // Arrowhead marker: Danger
    this.defs.append('marker')
      .attr('id', 'arrow-danger')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 38)
      .attr('refY', 0)
      .attr('markerWidth', 7)
      .attr('markerHeight', 7)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-4L8,0L0,4')
      .attr('fill', '#e11d48');

    // Main Zoom Layer
    this.g = this.svg.append('g').attr('class', 'main-g');

    this.zoom = d3.zoom()
      .scaleExtent([0.25, 3.5])
      .on('zoom', (event) => {
        this.g.attr('transform', event.transform);
      });

    this.svg.call(this.zoom);

    // Click background to deselect edge
    this.svg.on('click', (event) => {
      if (event.target.tagName === 'svg' || event.target.id === 'graph-svg') {
        this.deselectEdge();
      }
    });

    // Sub-groups for correct depth ordering
    this.edgeGroup = this.g.append('g').attr('class', 'edges');
    this.edgeLabelGroup = this.g.append('g').attr('class', 'edge-labels');
    this.nodeGroup = this.g.append('g').attr('class', 'nodes');

    // Resize Handler
    window.addEventListener('resize', () => {
      const rect = this.container.node().getBoundingClientRect();
      this.width = rect.width;
      this.height = rect.height;
      if (this.simulation) {
        this.simulation.force('center', d3.forceCenter(this.width / 2, this.height / 2));
        this.simulation.alpha(0.2).restart();
      }
    });
  }

  render(nodes, edges) {
    this.nodes = nodes.map(d => ({ ...d }));
    const nodeMap = new Map(this.nodes.map(n => [n.id, n]));

    this.edges = edges.map(e => ({
      from: e.from,
      to: e.to,
      weight: e.weight,
      source: nodeMap.get(e.from) || e.from,
      target: nodeMap.get(e.to) || e.to
    }));

    if (this.simulation) this.simulation.stop();

    // SPREAD-OUT GRAPH SIMULATION CONFIGURATION
    // Link distance: 270 (spread apart, unclustered)
    // Charge repulsion: -1100 (forces nodes well away from each other)
    // Collision: 75 (prevents overlapping labels and circles)
    this.simulation = d3.forceSimulation(this.nodes)
      .force('link', d3.forceLink(this.edges).id(d => d.id).distance(270).strength(0.45))
      .force('charge', d3.forceManyBody().strength(-1100).distanceMax(900))
      .force('center', d3.forceCenter(this.width / 2, this.height / 2))
      .force('collision', d3.forceCollide().radius(75))
      .force('x', d3.forceX(this.width / 2).strength(0.04))
      .force('y', d3.forceY(this.height / 2).strength(0.04));

    this.updateVisuals();

    this.simulation.on('tick', () => {
      this.tick();
    });

    this.simulation.alpha(1).restart();
  }

  updateVisuals() {
    // 1. EDGES
    const link = this.edgeGroup.selectAll('.link-path')
      .data(this.edges, d => `${d.from}->${d.to}`);

    link.exit().transition().duration(300).style('opacity', 0).remove();

    const linkEnter = link.enter().append('path')
      .attr('class', 'link-path')
      .attr('fill', 'none')
      .attr('stroke', '#334155')
      .attr('stroke-width', d => Math.max(1.8, Math.min(5.5, Math.sqrt(d.weight) / 3.2)))
      .attr('marker-end', 'url(#arrow-default)')
      .style('cursor', 'pointer')
      .on('click', (event, d) => {
        event.stopPropagation();
        this.handleEdgeClick(d);
      })
      .on('mouseover', (event, d) => {
        this.tooltip.transition().duration(120).style('opacity', 1);
        this.tooltip.html(`
          <strong>${d.from} → ${d.to}</strong><br/>
          Obligation: <span style="color:#38bdf8; font-weight:700;">${window.formatINR(d.weight)}</span>
        `)
          .style('left', (event.pageX + 14) + 'px')
          .style('top', (event.pageY - 28) + 'px');
      })
      .on('mouseout', () => {
        this.tooltip.transition().duration(150).style('opacity', 0);
      });

    this.linkElements = linkEnter.merge(link);

    // 2. EDGE LABELS WITH DARK PILL BADGE BACKGROUND
    const labelGroup = this.edgeLabelGroup.selectAll('.edge-pill-group')
      .data(this.edges, d => `${d.from}->${d.to}`);

    labelGroup.exit().remove();

    const labelGroupEnter = labelGroup.enter().append('g')
      .attr('class', 'edge-pill-group')
      .style('cursor', 'pointer')
      .on('click', (event, d) => {
        event.stopPropagation();
        this.handleEdgeClick(d);
      });

    labelGroupEnter.append('rect')
      .attr('class', 'edge-pill-bg')
      .attr('rx', 4)
      .attr('ry', 4)
      .attr('fill', '#111317')
      .attr('stroke', '#272b35')
      .attr('stroke-width', 1);

    labelGroupEnter.append('text')
      .attr('class', 'edge-pill-text')
      .attr('text-anchor', 'middle')
      .attr('dy', '.32em')
      .attr('fill', '#94a3b8')
      .attr('font-size', '10px')
      .attr('font-family', 'var(--font-mono)')
      .attr('font-weight', '600')
      .text(d => `₹${Math.round(d.weight)}Cr`);

    this.edgeLabelGroupElements = labelGroupEnter.merge(labelGroup);

    // 3. NODES (WITH BANK LOGOS & INITIALS)
    const node = this.nodeGroup.selectAll('.bank-node')
      .data(this.nodes, d => d.id);

    node.exit().remove();

    const nodeEnter = node.enter().append('g')
      .attr('class', 'bank-node')
      .call(d3.drag()
        .on('start', (event, d) => {
          if (!event.active) this.simulation.alphaTarget(0.3).restart();
          d.fx = d.x; d.fy = d.y;
        })
        .on('drag', (event, d) => {
          d.fx = event.x; d.fy = event.y;
        })
        .on('end', (event, d) => {
          if (!event.active) this.simulation.alphaTarget(0);
          d.fx = null; d.fy = null;
        })
      )
      .on('click', (event, d) => {
        event.stopPropagation();
        if (this.onNodeClick) this.onNodeClick(d);
      })
      .on('mouseover', (event, d) => {
        this.tooltip.transition().duration(120).style('opacity', 1);
        this.tooltip.html(`
          <strong>${d.id}</strong><br/>
          Capital Buffer: ${window.formatINR(d.capital)}<br/>
          Liquidity Buffer: ${window.formatINR(d.liquidity)}<br/>
          Status: <span style="color:${d.defaulted ? '#e11d48' : '#10b981'}; font-weight:700;">${d.defaulted ? 'INSOLVENT' : 'SOLVENT'}</span>
        `)
          .style('left', (event.pageX + 14) + 'px')
          .style('top', (event.pageY - 28) + 'px');
      })
      .on('mouseout', () => {
        this.tooltip.transition().duration(150).style('opacity', 0);
      });

    // Create circular clipPath for each node
    nodeEnter.each((d, i, nodesList) => {
      const g = d3.select(nodesList[i]);
      const clipId = `clip-node-${d.id.replace(/[^a-zA-Z0-9]/g, '_')}`;
      const r = this.getNodeRadius(d);

      this.defs.append('clipPath')
        .attr('id', clipId)
        .append('circle')
        .attr('r', r - 2.5);

      // Node base circle
      g.append('circle')
        .attr('class', 'node-circle')
        .attr('r', r)
        .attr('fill', '#14161c')
        .attr('stroke', getBankColor(d.id))
        .attr('stroke-width', 2.8);

      // Logo or Initials inside circle
      const logoUrl = BANK_LOGOS[d.id];
      if (logoUrl) {
        g.append('image')
          .attr('class', 'node-logo')
          .attr('href', logoUrl)
          .attr('x', -(r - 3))
          .attr('y', -(r - 3))
          .attr('width', (r - 3) * 2)
          .attr('height', (r - 3) * 2)
          .attr('clip-path', `url(#${clipId})`)
          .attr('preserveAspectRatio', 'xMidYMid slice');
      } else {
        // Custom bank: initials avatar
        g.append('text')
          .attr('class', 'node-initials')
          .attr('text-anchor', 'middle')
          .attr('dy', '.36em')
          .attr('fill', '#ffffff')
          .attr('font-size', '13px')
          .attr('font-weight', '700')
          .attr('font-family', 'var(--font-mono)')
          .text(getBankInitials(d.id));
      }

      // Bank Name label below
      g.append('text')
        .attr('class', 'node-name')
        .attr('text-anchor', 'middle')
        .attr('dy', r + 15)
        .attr('fill', '#f8fafc')
        .attr('font-size', '11px')
        .attr('font-weight', '600')
        .attr('font-family', 'var(--font-ui)')
        .text(d.id);

      // Capital buffer caption
      g.append('text')
        .attr('class', 'node-cap-label')
        .attr('text-anchor', 'middle')
        .attr('dy', r + 27)
        .attr('fill', '#64748b')
        .attr('font-size', '9.5px')
        .attr('font-family', 'var(--font-mono)')
        .text(`₹${Math.round(d.capital)}Cr`);
    });

    this.nodeElements = nodeEnter.merge(node);
  }

  getNodeRadius(d) {
    const c = d.capital || 1000;
    return Math.max(24, Math.min(36, 22 + Math.sqrt(c) / 4));
  }

  tick() {
    if (!this.linkElements || !this.nodeElements) return;

    // Curved edge path calculation with bidirectional separation
    this.linkElements.attr('d', d => {
      const sx = d.source.x || 0, sy = d.source.y || 0;
      const tx = d.target.x || 0, ty = d.target.y || 0;
      const dx = tx - sx, dy = ty - sy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist === 0) return 'M0,0';

      // Slight curvature so reverse edges A->B and B->A don't clash
      const dr = dist * 1.6;
      return `M${sx},${sy}A${dr},${dr} 0 0,1 ${tx},${ty}`;
    });

    // Positioning edge amount pill badges
    if (this.edgeLabelGroupElements) {
      this.edgeLabelGroupElements.each((d, i, list) => {
        const sx = d.source.x || 0, sy = d.source.y || 0;
        const tx = d.target.x || 0, ty = d.target.y || 0;
        
        // Midpoint with curve offset
        const mx = (sx + tx) / 2;
        const my = (sy + ty) / 2;
        const dx = tx - sx, dy = ty - sy;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        // Normal vector offset
        const nx = -dy / dist * 14;
        const ny = dx / dist * 14;

        const posX = mx + nx;
        const posY = my + ny;

        const g = d3.select(list[i]);
        g.attr('transform', `translate(${posX},${posY})`);

        // Size rect dynamically based on text length
        const txt = g.select('.edge-pill-text');
        const bbox = txt.node() ? txt.node().getBBox() : { width: 44, height: 14 };
        g.select('.edge-pill-bg')
          .attr('x', -(bbox.width / 2 + 5))
          .attr('y', -(bbox.height / 2 + 3))
          .attr('width', bbox.width + 10)
          .attr('height', bbox.height + 6);
      });
    }

    this.nodeElements.attr('transform', d => `translate(${d.x || 0},${d.y || 0})`);
  }

  // Edge click inspector
  handleEdgeClick(edgeData) {
    this.selectedEdge = edgeData;

    // Reset visual highlights
    this.resetHighlight();

    // Highlight the selected edge prominently
    this.linkElements.filter(d => d.from === edgeData.from && d.to === edgeData.to)
      .attr('stroke', '#38bdf8')
      .attr('stroke-width', 4.5)
      .attr('marker-end', 'url(#arrow-active)');

    // Highlight connected debtor and creditor nodes
    this.nodeElements.filter(d => d.id === edgeData.from || d.id === edgeData.to)
      .select('.node-circle')
      .attr('stroke', '#38bdf8')
      .attr('stroke-width', 3.5);

    // Update edge inspector card
    const card = document.getElementById('edge-inspector-card');
    if (card) {
      card.classList.add('visible');
      const route = document.getElementById('inspect-route');
      const amt = document.getElementById('inspect-amount');
      if (route) route.textContent = `${edgeData.from} → ${edgeData.to}`;
      if (amt) amt.textContent = window.formatINR(edgeData.weight);
    }

    if (this.onEdgeClick) {
      this.onEdgeClick(edgeData);
    }
  }

  deselectEdge() {
    this.selectedEdge = null;
    const card = document.getElementById('edge-inspector-card');
    if (card) card.classList.remove('visible');
    this.resetHighlight();
  }

  // Visual State Handlers
  resetHighlight() {
    if (this.nodeElements) {
      this.nodeElements.select('.node-circle')
        .transition().duration(250)
        .attr('stroke', d => getBankColor(d.id))
        .attr('stroke-width', 2.8)
        .attr('fill', '#14161c');
    }
    if (this.linkElements) {
      this.linkElements
        .transition().duration(250)
        .attr('stroke', '#334155')
        .attr('stroke-width', d => Math.max(1.8, Math.min(5.5, Math.sqrt(d.weight) / 3.2)))
        .attr('stroke-dasharray', null)
        .attr('marker-end', 'url(#arrow-default)');
    }
    if (this.edgeLabelGroupElements) {
      this.edgeLabelGroupElements.select('.edge-pill-bg')
        .attr('stroke', '#272b35')
        .attr('fill', '#111317');
      this.edgeLabelGroupElements.select('.edge-pill-text')
        .attr('fill', '#94a3b8');
    }
  }

  setNodeState(nodeId, state) {
    if (!this.nodeElements) return;
    const node = this.nodeElements.filter(d => d.id === nodeId);
    if (node.empty()) return;

    const circle = node.select('.node-circle');

    if (state === 'defaulted') {
      circle.transition().duration(350)
        .attr('stroke', '#e11d48')
        .attr('stroke-width', 4)
        .attr('fill', '#450a0a');
    } else if (state === 'settled') {
      circle.transition().duration(300)
        .attr('stroke', '#10b981')
        .attr('stroke-width', 4)
        .attr('fill', '#064e3b');
    } else if (state === 'active') {
      circle.transition().duration(200)
        .attr('stroke', '#d97706')
        .attr('stroke-width', 3.5);
    } else if (state === 'covered') {
      circle.transition().duration(300)
        .attr('stroke', '#38bdf8')
        .attr('stroke-width', 3.8);
    } else if (state === 'normal') {
      circle.transition().duration(250)
        .attr('stroke', d => getBankColor(d.id))
        .attr('stroke-width', 2.8)
        .attr('fill', '#14161c');
    }
  }

  highlightCycle(cycleNodes) {
    if (!this.linkElements || !this.nodeElements) return;
    this.resetHighlight();

    cycleNodes.forEach(nid => {
      this.nodeElements.filter(d => d.id === nid)
        .select('.node-circle')
        .attr('stroke', '#e11d48')
        .attr('stroke-width', 4);
    });

    for (let i = 0; i < cycleNodes.length - 1; i++) {
      const u = cycleNodes[i];
      const v = cycleNodes[i + 1];
      this.linkElements.filter(d => d.from === u && d.to === v)
        .attr('stroke', '#e11d48')
        .attr('stroke-width', 4.5)
        .attr('marker-end', 'url(#arrow-danger)');

      this.edgeLabelGroupElements.filter(d => d.from === u && d.to === v)
        .select('.edge-pill-bg')
        .attr('stroke', '#e11d48')
        .attr('fill', '#450a0a');
    }
  }

  highlightPath(path, color = '#38bdf8') {
    if (!this.linkElements) return;
    for (let i = 0; i < path.length - 1; i++) {
      const u = path[i];
      const v = path[i + 1];
      this.linkElements.filter(d => d.from === u && d.to === v)
        .transition().duration(300)
        .attr('stroke', color)
        .attr('stroke-width', 4.5)
        .attr('marker-end', 'url(#arrow-active)');
    }
  }

  flashMinCut(cutEdges) {
    if (!this.linkElements) return;
    cutEdges.forEach(e => {
      this.linkElements.filter(d => d.from === e.from && d.to === e.to)
        .transition().duration(300)
        .attr('stroke', '#e11d48')
        .attr('stroke-width', 4)
        .attr('stroke-dasharray', '5,5')
        .attr('marker-end', 'url(#arrow-danger)');

      this.edgeLabelGroupElements.filter(d => d.from === e.from && d.to === e.to)
        .select('.edge-pill-bg')
        .attr('stroke', '#e11d48');
    });
  }

  colorGroups(groups) {
    const palette = ['#38bdf8', '#d97706', '#10b981', '#ec4899', '#a855f7'];
    groups.forEach((grp, idx) => {
      const color = palette[idx % palette.length];
      grp.forEach(nid => {
        this.nodeElements.filter(d => d.id === nid)
          .select('.node-circle')
          .transition().duration(300)
          .attr('stroke', color)
          .attr('stroke-width', 3.8);
      });
    });
  }

  async playSteps(steps, onStep, delayMs = 600) {
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      if (onStep) onStep(step, i, steps.length);

      if (step.type === 'cycle_found') {
        const cycle = step.data.cycle || [];
        this.highlightCycle(cycle);
      } else if (step.type === 'edge_reduced') {
        const { from, to, new_weight } = step.data;
        this.edgeLabelGroupElements.filter(d => d.from === from && d.to === to)
          .select('.edge-pill-text')
          .text(`₹${Math.round(new_weight)}Cr`)
          .attr('fill', '#fde047');
      } else if (step.type === 'edge_removed') {
        const { from, to } = step.data;
        this.linkElements.filter(d => d.from === from && d.to === to)
          .transition().duration(350)
          .style('opacity', 0.08);
        this.edgeLabelGroupElements.filter(d => d.from === from && d.to === to)
          .transition().duration(350)
          .style('opacity', 0.08);
      } else if (step.type === 'node_settled') {
        this.setNodeState(step.data.node, 'settled');
      } else if (step.type === 'node_defaulted') {
        this.setNodeState(step.data.node, 'defaulted');
      } else if (step.type === 'loss_incurred') {
        this.setNodeState(step.data.node, 'active');
      } else if (step.type === 'cover_edge_picked') {
        const { edge_from, edge_to } = step.data;
        this.setNodeState(edge_from, 'covered');
        this.setNodeState(edge_to, 'covered');
      }

      await new Promise(r => setTimeout(r, delayMs));
    }
  }
}

window.GraphViz = GraphViz;
window.getBankColor = getBankColor;
window.getBankInitials = getBankInitials;

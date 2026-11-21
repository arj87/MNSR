// D3.js Force-Directed Graph Visualizer for MNSR
class GraphViz {
  constructor(containerId) {
    this.container = d3.select(containerId);
    this.width = this.container.node().getBoundingClientRect().width || 800;
    this.height = this.container.node().getBoundingClientRect().height || 600;

    this.nodes = [];
    this.edges = [];
    this.simulation = null;
    this.onNodeClick = null;

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

    // Defs for arrowhead markers and filters
    const defs = this.svg.append('defs');

    // Arrowhead marker
    defs.append('marker')
      .attr('id', 'arrow')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 24)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', '#64748b');

    // Highlighted arrow
    defs.append('marker')
      .attr('id', 'arrow-active')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 24)
      .attr('refY', 0)
      .attr('markerWidth', 7)
      .attr('markerHeight', 7)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', '#00d4aa');

    // Danger arrow (cycles / defaults)
    defs.append('marker')
      .attr('id', 'arrow-danger')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 24)
      .attr('refY', 0)
      .attr('markerWidth', 7)
      .attr('markerHeight', 7)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', '#ef4444');

    // Glow filter
    const filter = defs.append('filter')
      .attr('id', 'glow')
      .attr('x', '-50%').attr('y', '-50%')
      .attr('width', '200%').attr('height', '200%');
    filter.append('feGaussianBlur').attr('stdDeviation', '4').attr('result', 'coloredBlur');
    const feMerge = filter.append('feMerge');
    feMerge.append('feMergeNode').attr('in', 'coloredBlur');
    feMerge.append('feMergeNode').attr('in', 'SourceGraphic');

    // Zoom container
    this.g = this.svg.append('g').attr('class', 'main-g');

    this.zoom = d3.zoom()
      .scaleExtent([0.3, 3])
      .on('zoom', (event) => {
        this.g.attr('transform', event.transform);
      });

    this.svg.call(this.zoom);

    // Groups for layering
    this.edgeGroup = this.g.append('g').attr('class', 'edges');
    this.edgeLabelGroup = this.g.append('g').attr('class', 'edge-labels');
    this.nodeGroup = this.g.append('g').attr('class', 'nodes');

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
    // Link by ID
    const nodeMap = new Map(this.nodes.map(n => [n.id, n]));
    this.edges = edges.map(e => ({
      from: e.from,
      to: e.to,
      weight: e.weight,
      source: nodeMap.get(e.from) || e.from,
      target: nodeMap.get(e.to) || e.to
    }));

    if (this.simulation) this.simulation.stop();

    this.simulation = d3.forceSimulation(this.nodes)
      .force('link', d3.forceLink(this.edges).id(d => d.id).distance(140).strength(0.6))
      .force('charge', d3.forceManyBody().strength(-400))
      .force('center', d3.forceCenter(this.width / 2, this.height / 2))
      .force('collision', d3.forceCollide().radius(45));

    this.updateVisuals();

    this.simulation.on('tick', () => {
      this.tick();
    });

    this.simulation.alpha(1).restart();
  }

  updateVisuals() {
    // 1. EDGES
    const link = this.edgeGroup.selectAll('.link-line')
      .data(this.edges, d => `${d.from}->${d.to}`);

    link.exit().transition().duration(400).style('opacity', 0).remove();

    const linkEnter = link.enter().append('path')
      .attr('class', 'link-line')
      .attr('fill', 'none')
      .attr('stroke', '#334155')
      .attr('stroke-width', d => Math.max(1.5, Math.min(6, Math.sqrt(d.weight) / 3)))
      .attr('marker-end', 'url(#arrow)');

    this.linkElements = linkEnter.merge(link);

    // 2. EDGE LABELS
    const label = this.edgeLabelGroup.selectAll('.edge-label-text')
      .data(this.edges, d => `${d.from}->${d.to}`);

    label.exit().remove();

    const labelEnter = label.enter().append('text')
      .attr('class', 'edge-label-text')
      .attr('text-anchor', 'middle')
      .attr('fill', '#94a3b8')
      .attr('font-size', '10px')
      .attr('font-family', 'var(--mono)')
      .text(d => `₹${Math.round(d.weight)}Cr`);

    this.edgeLabelElements = labelEnter.merge(label);

    // 3. NODES
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
        if (this.onNodeClick) this.onNodeClick(d);
      })
      .on('mouseover', (event, d) => {
        this.tooltip.transition().duration(150).style('opacity', 1);
        this.tooltip.html(`
          <strong>${d.id}</strong><br/>
          Capital: ${window.formatINR(d.capital)}<br/>
          Liquidity: ${window.formatINR(d.liquidity)}<br/>
          Status: <span style="color:${d.defaulted ? '#ef4444' : '#22c55e'}">${d.defaulted ? 'DEFAULTED' : 'HEALTHY'}</span>
        `)
          .style('left', (event.pageX + 12) + 'px')
          .style('top', (event.pageY - 28) + 'px');
      })
      .on('mouseout', () => {
        this.tooltip.transition().duration(200).style('opacity', 0);
      });

    // Node outer ring / pulse
    nodeEnter.append('circle')
      .attr('class', 'node-pulse')
      .attr('r', d => this.getNodeRadius(d) + 5)
      .attr('fill', 'none')
      .attr('stroke', '#00d4aa')
      .attr('stroke-width', 2)
      .attr('opacity', 0);

    // Node core circle
    nodeEnter.append('circle')
      .attr('class', 'node-circle')
      .attr('r', d => this.getNodeRadius(d))
      .attr('fill', '#0d1424')
      .attr('stroke', '#00d4aa')
      .attr('stroke-width', 2.5);

    // Bank icon / badge text
    nodeEnter.append('text')
      .attr('class', 'node-id')
      .attr('text-anchor', 'middle')
      .attr('dy', '.3em')
      .attr('fill', '#e2e8f0')
      .attr('font-size', '11px')
      .attr('font-weight', '700')
      .text(d => d.id);

    // Sub label (capital)
    nodeEnter.append('text')
      .attr('class', 'node-capital')
      .attr('text-anchor', 'middle')
      .attr('dy', d => this.getNodeRadius(d) + 14)
      .attr('fill', '#64748b')
      .attr('font-size', '10px')
      .attr('font-family', 'var(--mono)')
      .text(d => `₹${Math.round(d.capital)}Cr`);

    this.nodeElements = nodeEnter.merge(node);
  }

  getNodeRadius(d) {
    const c = d.capital || 1000;
    return Math.max(22, Math.min(38, 20 + Math.sqrt(c) / 3));
  }

  tick() {
    if (!this.linkElements || !this.nodeElements) return;

    this.linkElements.attr('d', d => {
      const sx = d.source.x || 0, sy = d.source.y || 0;
      const tx = d.target.x || 0, ty = d.target.y || 0;
      const dx = tx - sx, dy = ty - sy;
      const dr = Math.sqrt(dx * dx + dy * dy) * 1.5;
      return `M${sx},${sy}A${dr},${dr} 0 0,1 ${tx},${ty}`;
    });

    this.edgeLabelElements
      .attr('x', d => ((d.source.x || 0) + (d.target.x || 0)) / 2)
      .attr('y', d => ((d.source.y || 0) + (d.target.y || 0)) / 2 - 6);

    this.nodeElements.attr('transform', d => `translate(${d.x || 0},${d.y || 0})`);
  }

  // Animation & Visual State Helpers

  resetHighlight() {
    if (this.nodeElements) {
      this.nodeElements.select('.node-circle')
        .transition().duration(300)
        .attr('stroke', '#00d4aa')
        .attr('fill', '#0d1424');
      this.nodeElements.select('.node-pulse').attr('opacity', 0);
    }
    if (this.linkElements) {
      this.linkElements
        .transition().duration(300)
        .attr('stroke', '#334155')
        .attr('stroke-width', d => Math.max(1.5, Math.min(6, Math.sqrt(d.weight) / 3)))
        .attr('stroke-dasharray', null)
        .attr('marker-end', 'url(#arrow)');
    }
  }

  setNodeState(nodeId, state) {
    if (!this.nodeElements) return;
    const node = this.nodeElements.filter(d => d.id === nodeId);
    if (node.empty()) return;

    const circle = node.select('.node-circle');
    const pulse = node.select('.node-pulse');

    if (state === 'defaulted') {
      circle.transition().duration(400)
        .attr('fill', '#7f1d1d')
        .attr('stroke', '#ef4444');
      pulse.attr('stroke', '#ef4444').attr('opacity', 0.8)
        .transition().duration(800).attr('r', 45).attr('opacity', 0);
    } else if (state === 'settled') {
      circle.transition().duration(300)
        .attr('fill', '#064e3b')
        .attr('stroke', '#22c55e');
    } else if (state === 'active') {
      circle.transition().duration(200)
        .attr('stroke', '#f59e0b')
        .attr('fill', '#451a03');
    } else if (state === 'covered') {
      circle.transition().duration(300)
        .attr('stroke', '#00d4aa')
        .attr('fill', '#042f2e');
    } else if (state === 'normal') {
      circle.transition().duration(300)
        .attr('stroke', '#00d4aa')
        .attr('fill', '#0d1424');
    }
  }

  highlightCycle(cycleNodes) {
    if (!this.linkElements || !this.nodeElements) return;
    this.resetHighlight();

    // Highlight cycle nodes
    cycleNodes.forEach(nid => {
      this.nodeElements.filter(d => d.id === nid)
        .select('.node-circle')
        .attr('stroke', '#ef4444')
        .attr('fill', '#450a0a');
    });

    // Highlight edges along cycle
    for (let i = 0; i < cycleNodes.length - 1; i++) {
      const u = cycleNodes[i];
      const v = cycleNodes[i + 1];
      this.linkElements.filter(d => d.from === u && d.to === v)
        .attr('stroke', '#ef4444')
        .attr('stroke-width', 4)
        .attr('marker-end', 'url(#arrow-danger)');
    }
  }

  highlightPath(path, color = '#00d4aa') {
    if (!this.linkElements) return;
    for (let i = 0; i < path.length - 1; i++) {
      const u = path[i];
      const v = path[i + 1];
      this.linkElements.filter(d => d.from === u && d.to === v)
        .transition().duration(300)
        .attr('stroke', color)
        .attr('stroke-width', 5)
        .attr('marker-end', 'url(#arrow-active)');
    }
  }

  flashMinCut(cutEdges) {
    if (!this.linkElements) return;
    cutEdges.forEach(e => {
      this.linkElements.filter(d => d.from === e.from && d.to === e.to)
        .transition().duration(300)
        .attr('stroke', '#ef4444')
        .attr('stroke-width', 4)
        .attr('stroke-dasharray', '5,5')
        .attr('marker-end', 'url(#arrow-danger)');
    });
  }

  colorGroups(groups) {
    const palette = ['#00d4aa', '#f59e0b', '#3b82f6', '#ec4899', '#8b5cf6'];
    groups.forEach((grp, idx) => {
      const color = palette[idx % palette.length];
      grp.forEach(nid => {
        this.nodeElements.filter(d => d.id === nid)
          .select('.node-circle')
          .transition().duration(400)
          .attr('stroke', color)
          .attr('fill', `${color}22`);
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
        this.edgeLabelElements.filter(d => d.from === from && d.to === to)
          .text(`₹${Math.round(new_weight)}Cr`)
          .attr('fill', '#f59e0b');
      } else if (step.type === 'edge_removed') {
        const { from, to } = step.data;
        this.linkElements.filter(d => d.from === from && d.to === to)
          .transition().duration(400)
          .style('opacity', 0.1);
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

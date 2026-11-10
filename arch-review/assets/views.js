/* Architecture Review Console — shell, overview, review board */

const VIEW_META = {
  overview: { title: 'Overview', subtitle: 'Architecture review governance' },
  master: { title: 'Master List', subtitle: 'L1 → L4 architecture inventory' },
  review: { title: 'L3 / L4 Review', subtitle: 'Evaluate functions and modules' }
};

function render() {
  renderShell();
  const view = document.getElementById('view');
  if (!view) return;
  if (ui.view === 'overview') view.innerHTML = renderOverview();
  else if (ui.view === 'review') view.innerHTML = renderQueue();
  else view.innerHTML = renderMaster();
  syncSearchInput();
  updateResultCount();
  updateBulkBar();
}

function renderShell() {
  const meta = VIEW_META[ui.view] || VIEW_META.overview;
  const title = document.getElementById('page-title');
  const subtitle = document.getElementById('page-subtitle');
  if (title) title.textContent = meta.title;
  if (subtitle) subtitle.textContent = meta.subtitle;

  document.querySelectorAll('[data-nav]').forEach(el => {
    el.classList.toggle('active', el.getAttribute('data-nav') === ui.view);
  });

  const stats = reviewStats();
  const masterCount = document.getElementById('nav-master-count');
  const reviewCount = document.getElementById('nav-review-count');
  const coverage = document.getElementById('sidebar-coverage');
  const coverageBar = document.getElementById('sidebar-coverage-bar');
  const coverageText = document.getElementById('sidebar-coverage-text');
  if (masterCount) masterCount.textContent = state.nodes.length;
  if (reviewCount) reviewCount.textContent = stats.pending;
  if (coverage) coverage.textContent = stats.coverage + '%';
  if (coverageBar) coverageBar.style.width = stats.coverage + '%';
  if (coverageText) coverageText.textContent = stats.reviewed + ' of ' + stats.total + ' L3/L4 nodes reviewed';
}

/* ---------------- Small building blocks ---------------- */
function levelBadge(level, lg) {
  return '<span class="level-badge ' + String(level).toLowerCase() + (lg ? ' lg' : '') + '">' + esc(level) + '</span>';
}

function statusCell(status) {
  const cls = String(status).toLowerCase();
  return '<span class="status-cell ' + esc(cls) + '"><i class="dot"></i>' + esc(status || '—') + '</span>';
}

function evalPill(node) {
  const status = reviewStatus(node);
  if (status === 'Passed') return '<span class="pill green"><i class="dot"></i>Passed</span>';
  if (status === 'Need Revise') return '<span class="pill amber"><i class="dot"></i>Need Revise</span>';
  if (status === 'Reject') return '<span class="pill red"><i class="dot"></i>Reject</span>';
  return '<span class="pill gray">Pending</span>';
}

function priorityPill(priority) {
  const value = priority || '—';
  if (value === 'P0 – Critical') return '<span class="pill red">P0 · Critical</span>';
  if (value === 'P1 – High') return '<span class="pill amber">P1 · High</span>';
  if (value === 'P2 – Medium') return '<span class="pill blue">P2 · Medium</span>';
  if (value === 'P3 – Low') return '<span class="pill gray">P3 · Low</span>';
  return '<span class="pill outline">—</span>';
}

function lockPill(lock) {
  const value = lock || '-';
  const map = {
    EXCLUSIVE: 'navy', SHARED: 'purple', LOCKED: 'gray', RETIRED: 'gray', NEW: 'teal'
  };
  return '<span class="pill ' + (map[value] || 'outline') + '">' + esc(value) + '</span>';
}

function changePill(change) {
  const value = change || '—';
  if (value === 'New') return '<span class="pill blue">New</span>';
  if (value === 'Modify') return '<span class="pill amber">Modify</span>';
  if (value === 'Deprecated') return '<span class="pill red">Deprecated</span>';
  return '<span class="pill outline">—</span>';
}

function scoreCell(score) {
  if (score === '' || score == null) return '<span class="cell-empty">—</span>';
  const value = Number(score);
  const cls = value >= 80 ? 'high' : value >= 60 ? 'mid' : 'low';
  return '<span class="score-cell"><b>' + value + '</b><span class="score-meter"><i class="' + cls + '" style="width:' + value + '%"></i></span></span>';
}

function ownerCell(name) {
  if (!name) return '<span class="cell-empty">—</span>';
  return '<span class="owner-chip">' + avatar(name) + '<span>' + esc(name) + '</span></span>';
}

function emptyState(title, message, actionLabel, actionName) {
  return '<div class="empty-state">' +
    '<div class="empty-ico">' + icon('search') + '</div>' +
    '<h3>' + esc(title) + '</h3>' +
    '<p>' + esc(message) + '</p>' +
    (actionLabel ? '<button class="btn ghost" data-action="' + actionName + '">' + esc(actionLabel) + '</button>' : '') +
    '</div>';
}

function uniqueNames(level) {
  return Array.from(new Set(state.nodes.filter(n => n.level === level).map(n => n.name).filter(Boolean)))
    .sort((a, b) => a.localeCompare(b));
}

/* ---------------- Overview ---------------- */
function renderOverview() {
  const stats = reviewStats();
  const l1Count = state.nodes.filter(n => n.level === 'L1').length;
  const l2Count = state.nodes.filter(n => n.level === 'L2').length;
  const statusParts = [
    { label: 'Passed', value: stats.passed, color: '#12b76a' },
    { label: 'Need Revise', value: stats.revise, color: '#e0a21b' },
    { label: 'Rejected', value: stats.reject, color: '#d92d20' },
    { label: 'Pending', value: stats.pending, color: '#cbd5e1' }
  ];
  const donutTotal = statusParts.reduce((sum, p) => sum + p.value, 0);
  const gradient = donutTotal
    ? (() => {
        let acc = 0;
        return statusParts.map(p => {
          const start = (acc / donutTotal) * 360;
          acc += p.value;
          const end = (acc / donutTotal) * 360;
          return p.color + ' ' + start.toFixed(2) + 'deg ' + end.toFixed(2) + 'deg';
        }).join(', ');
      })()
    : '#eef1f5';

  return '<div class="page">' +
    '<div class="page-head">' +
      '<div>' +
        '<h1>Architecture review at a glance</h1>' +
        '<p>Review coverage and evaluation results for the L3 modules and L4 functions in the master list.</p>' +
      '</div>' +
      '<span class="cycle-chip"><i class="dot"></i>Data as of ' + esc(fmtDate(todayISO())) + '</span>' +
    '</div>' +

    '<div class="kpi-grid">' +
      kpiCard('L3 / L4 nodes', stats.total, l1Count + ' L1 applications · ' + l2Count + ' L2 applications', 'layers', '#0b2545', '#e9effb') +
      kpiCard('Review coverage', stats.coverage + '%', '<b>' + stats.reviewed + '</b> of ' + stats.total + ' reviewed', 'check-circle', '#2563eb', '#eff6ff') +
      kpiCard('Passed', stats.passed, '<b>' + stats.passRate + '%</b> of reviewed evaluations', 'check', '#0f9d58', '#e8f7ef') +
      kpiCard('Needs attention', stats.attention, stats.revise + ' need revise · ' + stats.reject + ' rejected', 'alert', '#c2740a', '#fdf4e3') +
    '</div>' +

    '<div class="dashboard-grid">' +
      '<section class="panel">' +
        '<div class="panel-head"><div><h2>Review status</h2><p>Evaluation results across all L3/L4 nodes</p></div>' +
          '<span class="pill blue"><i class="dot"></i>' + stats.reviewed + ' reviewed</span></div>' +
        '<div class="panel-body">' +
          '<div class="donut-wrap">' +
            '<div class="donut" style="background:conic-gradient(' + gradient + ')">' +
              '<div class="donut-center"><strong>' + stats.coverage + '%</strong><span>reviewed</span></div>' +
            '</div>' +
            '<div class="legend">' + statusParts.map(p =>
              '<div class="legend-row">' +
                '<i class="legend-dot" style="background:' + p.color + '"></i>' +
                '<span class="legend-name">' + p.label + '</span>' +
                '<span class="legend-val">' + p.value + '</span>' +
                '<span class="legend-pct">' + (donutTotal ? Math.round((p.value / donutTotal) * 100) : 0) + '%</span>' +
              '</div>').join('') +
            '</div>' +
          '</div>' +
        '</div>' +
      '</section>' +

      '<section class="panel">' +
        '<div class="panel-head"><div><h2>Coverage by L2 application</h2><p>Reviewed L3/L4 nodes per application stream</p></div></div>' +
        '<div class="panel-body">' + coverageBars() + '</div>' +
      '</section>' +
    '</div>' +

    '<div class="dashboard-grid equal">' +
      '<section class="panel">' +
        '<div class="panel-head"><div><h2>Priority mix</h2><p>Review priority for L3/L4 nodes</p></div></div>' +
        '<div class="panel-body">' + priorityMix() + '</div>' +
      '</section>' +
      '<section class="panel">' +
        '<div class="panel-head"><div><h2>Recent activity</h2><p>Latest evaluation and data changes</p></div>' +
          '<button class="btn xs ghost" data-action="navigate" data-view="master">Open master list</button></div>' +
        '<div class="panel-body" style="padding-top:0">' + activityList(state.activity.slice(0, 7)) + '</div>' +
      '</section>' +
    '</div>' +
  '</div>';
}

function kpiCard(label, value, sub, iconName, color, soft) {
  return '<div class="kpi-card" style="--kpi-color:' + color + ';--kpi-soft:' + soft + '">' +
    '<div class="kpi-top"><span class="kpi-label">' + esc(label) + '</span>' +
      '<span class="kpi-icon">' + icon(iconName) + '</span></div>' +
    '<div class="kpi-value">' + esc(value) + '</div>' +
    '<div class="kpi-sub">' + sub + '</div>' +
  '</div>';
}

function coverageBars() {
  const scope = scopeNodes();
  if (!scope.length) return emptyState('No L3/L4 nodes', 'Add architecture nodes to see review coverage.');
  const groups = new Map();
  scope.forEach(n => {
    const name = nameAtLevel(n, 'L2') || 'Unassigned';
    if (!groups.has(name)) groups.set(name, { total: 0, reviewed: 0 });
    const g = groups.get(name);
    g.total += 1;
    if (n.evaluationResult) g.reviewed += 1;
  });
  const rows = Array.from(groups.entries())
    .map(([name, g]) => Object.assign({ name: name }, g))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
    .slice(0, 7);
  return '<div class="bar-list">' + rows.map(g => {
    const pct = g.total ? Math.round((g.reviewed / g.total) * 100) : 0;
    return '<div class="bar-item">' +
      '<div class="bar-top"><span class="bar-name">' + esc(g.name) + '</span>' +
      '<span class="bar-meta">' + g.reviewed + ' / ' + g.total + ' · ' + pct + '%</span></div>' +
      '<div class="bar-track"><i class="bar-fill' + (pct === 100 ? ' complete' : '') + '" style="width:' + pct + '%"></i></div>' +
    '</div>';
  }).join('') + '</div>';
}

function priorityMix() {
  const scope = scopeNodes();
  if (!scope.length) return emptyState('No L3/L4 nodes', 'Add architecture nodes to see the priority mix.');
  const defs = [
    { key: 'P0 – Critical', label: 'P0 · Critical', color: '#d92d20' },
    { key: 'P1 – High', label: 'P1 · High', color: '#e0a21b' },
    { key: 'P2 – Medium', label: 'P2 · Medium', color: '#3b82f6' },
    { key: 'P3 – Low', label: 'P3 · Low', color: '#94a3b8' },
    { key: '—', label: 'Not set', color: '#e4e7ec' }
  ];
  const counts = defs.map(d => ({ label: d.label, color: d.color, value: scope.filter(n => n.priority === d.key).length }));
  const total = counts.reduce((s, c) => s + c.value, 0) || 1;
  return '<div class="priority-bar">' + counts.map(c =>
    c.value ? '<i style="width:' + ((c.value / total) * 100) + '%;background:' + c.color + '" title="' + esc(c.label) + ': ' + c.value + '"></i>' : ''
  ).join('') + '</div>' +
  '<div class="priority-legend">' + counts.map(c =>
    '<div class="priority-row"><i class="legend-dot" style="background:' + c.color + '"></i>' + esc(c.label) + '<b>' + c.value + '</b></div>'
  ).join('') + '</div>';
}

function activityList(items) {
  if (!items.length) return '<div class="activity-empty">No activity yet. Open a node to start reviewing.</div>';
  return '<div class="activity-list">' + items.map(a => {
    const result = REVIEW_STATES.find(r => a.detail && a.detail.indexOf(r) > -1) || '';
    const tone = result === 'Passed' ? 'green' : result === 'Need Revise' ? 'amber' : result === 'Reject' ? 'red' : 'blue';
    const iconName = a.type === 'add' ? 'plus' : a.type === 'delete' ? 'trash' : a.type === 'import' ? 'upload' : 'check-circle';
    return '<div class="activity-item">' +
      '<span class="activity-ico ' + tone + '">' + icon(iconName) + '</span>' +
      '<div class="activity-main">' +
        '<div class="activity-text"><b>' + esc(a.actor || USER.name) + '</b> ' + esc(a.detail || 'updated the node') +
          (a.nodeName ? ' · <span class="node-ref" data-action="open-node-id" data-node-id="' + esc(a.nodeId) + '">' + esc(a.nodeName) + '</span>' : '') +
        '</div>' +
        '<div class="activity-time">' + esc(relTime(a.ts)) + '</div>' +
      '</div>' +
    '</div>';
  }).join('') + '</div>';
}

/* ---------------- Review board ---------------- */
function renderQueue() {
  const stats = reviewStats();
  const scope = state.nodes.filter(canReview)
    .filter(n => ui.queueLevel === 'all' || n.level === ui.queueLevel);
  const columns = [
    { key: 'Pending', label: 'Pending review', cls: 'pending', iconName: 'clock' },
    { key: 'Need Revise', label: 'Need revise', cls: 'revise', iconName: 'alert' },
    { key: 'Passed', label: 'Passed', cls: 'passed', iconName: 'check-circle' },
    { key: 'Reject', label: 'Rejected', cls: 'rejected', iconName: 'close' }
  ];
  const levelCount = lvl => state.nodes.filter(n => canReview(n) && n.level === lvl).length;
  return '<div class="page">' +
    '<div class="board-topbar">' +
      '<div class="segmented">' +
        '<button class="' + (ui.queueLevel === 'all' ? 'active' : '') + '" data-action="queue-level" data-level="all">All L3/L4</button>' +
        '<button class="' + (ui.queueLevel === 'L3' ? 'active' : '') + '" data-action="queue-level" data-level="L3">L3 · ' + levelCount('L3') + '</button>' +
        '<button class="' + (ui.queueLevel === 'L4' ? 'active' : '') + '" data-action="queue-level" data-level="L4">L4 · ' + levelCount('L4') + '</button>' +
      '</div>' +
      '<span class="board-note">' + icon('drag') + '<b>' + stats.pending + '</b> awaiting review · drag a card between columns to set the result</span>' +
      '<button class="btn ghost sm" style="margin-left:auto" data-action="add-node" data-level="L4">' + icon('plus') + 'Add L4 node</button>' +
    '</div>' +
    '<div class="board">' + columns.map(col => {
      const items = scope.filter(n => reviewStatus(n) === col.key).sort(queueSort);
      return '<section class="board-col ' + col.cls + '" data-drop-status="' + col.key + '">' +
        '<div class="board-col-head"><i class="status-dot"></i><h3>' + esc(col.label) + '</h3>' +
          '<span class="board-count">' + items.length + '</span></div>' +
        '<div class="board-list">' +
          (items.length ? items.map(reviewCard).join('') : '<div class="board-empty">No nodes in this state</div>') +
        '</div>' +
      '</section>';
    }).join('') + '</div>' +
    '<div class="queue-foot">Review results use the same values as the Excel master list: Passed · Need Revise · Reject</div>' +
  '</div>';
}

function queueSort(a, b) {
  const order = { 'P0 – Critical': 0, 'P1 – High': 1, 'P2 – Medium': 2, 'P3 – Low': 3, '—': 4 };
  const ao = order[a.priority] == null ? 5 : order[a.priority];
  const bo = order[b.priority] == null ? 5 : order[b.priority];
  return ao - bo || sortByRank(a, b);
}

function reviewCard(n) {
  const crumbParts = ['L1', 'L2', 'L3']
    .map(l => nameAtLevel(n, l))
    .filter((v, i, arr) => v && arr.indexOf(v) === i);
  const crumb = crumbParts.join(' / ');
  const actions = ['Passed', 'Need Revise', 'Reject'].map(result => {
    const cls = result === 'Passed' ? 'pass' : result === 'Need Revise' ? 'revise' : 'reject';
    const active = n.evaluationResult === result ? ' active' : '';
    return '<button class="quick ' + cls + active + '" data-action="quick-review" data-id="' + esc(n.id) + '" data-result="' + esc(result) + '" title="Set result: ' + esc(result) + '">' +
      icon(result === 'Passed' ? 'check' : result === 'Need Revise' ? 'alert' : 'close') +
      (result === 'Passed' ? 'Pass' : result === 'Need Revise' ? 'Revise' : 'Reject') +
    '</button>';
  }).join('');
  return '<article class="review-card" draggable="true" data-id="' + esc(n.id) + '" data-action="open-drawer" data-node-id="' + esc(n.id) + '">' +
    '<div class="review-card-top">' + levelBadge(n.level) + '<span class="node-id">' + esc(n.nodeId) + '</span>' +
      (n.aiScore !== '' ? '<span class="ai-chip">AI ' + esc(n.aiScore) + '</span>' : '') + '</div>' +
    '<h4>' + esc(n.name || '(unnamed)') + '</h4>' +
    '<div class="card-crumb">' + esc(crumb || 'Top-level') + '</div>' +
    '<div class="card-meta">' + ownerCell(n.dtOwner) + priorityPill(n.priority) +
      '<span class="card-date">' + (n.reviewDate ? esc(fmtDate(n.reviewDate)) : 'Not reviewed') + '</span></div>' +
    '<div class="card-actions">' + actions + '</div>' +
  '</article>';
}

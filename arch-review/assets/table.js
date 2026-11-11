/* Architecture Review Console — master table, drawer, modal */

/* ---------------- Master list ---------------- */
function renderMaster() {
  return '<div class="page">' +
    '<div class="toolbar-card panel">' +
      toolbarHTML() +
      '<div class="advanced-filters' + (ui.advanced ? '' : ' hidden') + '" id="advanced-filters">' +
        '<span class="field-label">More filters</span>' +
        filterSelect('l2', 'All L2 applications', uniqueNames('L2')) +
        filterSelect('source', 'All sources', uniqueSources()) +
        filterSelect('lockStatus', 'All lock states', OPTIONS.lockStatus) +
        filterSelect('changeType', 'All change types', OPTIONS.changeType) +
      '</div>' +
      '<div class="bulk-bar' + (selection.size ? '' : ' hidden') + '" id="bulk-bar"></div>' +
    '</div>' +
    '<div class="table-card panel">' +
      '<div class="table-meta">' +
        '<span id="result-count"></span>' +
        '<span class="hint">' + icon('info') + 'Click a row to open details and review</span>' +
      '</div>' +
      '<div class="table-scroll" id="master-results">' + masterResultsHTML() + '</div>' +
    '</div>' +
  '</div>';
}

function uniqueSources() {
  return Array.from(new Set(state.nodes.map(n => n.source).filter(Boolean))).sort();
}

function toolbarHTML() {
  return '<div class="toolbar">' +
    filterSelect('level', 'All levels', OPTIONS.level) +
    filterSelect('status', 'All statuses', OPTIONS.status) +
    filterSelect('evaluation', 'All results', ['Passed', 'Need Revise', 'Reject', 'Pending']) +
    filterSelect('priority', 'All priorities', OPTIONS.priority) +
    filterSelect('l1', 'All L1 applications', uniqueNames('L1')) +
    '<button class="btn ghost sm" data-action="toggle-advanced">' + icon('filter') + 'More' +
      (advancedFilterCount() ? '<span class="filter-count">' + advancedFilterCount() + '</span>' : '') + '</button>' +
    '<button class="btn ghost sm" data-action="clear-filters">Clear</button>' +
    '<div class="toolbar-spacer"></div>' +
    '<button class="btn subtle sm" data-action="expand-all" title="Expand all">' + icon('expand') + 'Expand</button>' +
    '<button class="btn subtle sm" data-action="collapse-all" title="Collapse all">' + icon('collapse') + 'Collapse</button>' +
    '<div class="menu-wrap" data-menu="columns">' +
      '<button class="btn ghost sm" data-action="toggle-menu" data-menu="columns">' + icon('columns') + 'Columns</button>' +
      '<div class="menu col-menu" id="columns-menu">' + columnsMenuHTML() + '</div>' +
    '</div>' +
  '</div>';
}

function advancedFilterCount() {
  return ['l2', 'source', 'lockStatus', 'changeType'].filter(k => ui.filters[k]).length;
}

function filterSelect(key, allLabel, options) {
  const current = ui.filters[key];
  return '<select class="filter-select' + (current ? ' active' : '') + '" data-filter="' + key + '" aria-label="' + esc(allLabel) + '">' +
    '<option value="">' + esc(allLabel) + '</option>' +
    options.map(opt => {
      const value = typeof opt === 'string' ? opt : opt.value;
      const label = typeof opt === 'string' ? opt : opt.label;
      return '<option value="' + esc(value) + '"' + (current === value ? ' selected' : '') + '>' + esc(label) + '</option>';
    }).join('') +
  '</select>';
}

function columnsMenuHTML() {
  return ['identification', 'governance', 'shared', 'audit'].map(group => {
    const cols = COLUMNS.filter(c => c.group === group);
    return '<div class="col-group-title">' + GROUP_META[group] + '</div>' + cols.map(c =>
      '<label class="col-check"><input type="checkbox" data-column="' + c.key + '"' +
        (state.settings.visibleColumns.includes(c.key) ? ' checked' : '') + '/><span>' + esc(c.label) + '</span></label>'
    ).join('');
  }).join('');
}

function masterResultsHTML() {
  const rows = displayRows();
  if (!rows.length) {
    return emptyState('No matching nodes', 'Try adjusting the filters or search terms.', 'Clear filters', 'clear-filters');
  }
  const cols = COLUMNS.filter(c => state.settings.visibleColumns.includes(c.key));
  const groups = ['identification', 'governance', 'shared', 'audit']
    .map(group => ({ group: group, cols: cols.filter(c => c.group === group) }))
    .filter(g => g.cols.length);
  const allSelected = rows.length > 0 && rows.every(r => selection.has(r.node.id));

  let colgroup = '<colgroup><col style="width:40px"/>';
  cols.forEach(c => { colgroup += '<col style="width:' + c.width + 'px"/>'; });
  colgroup += '<col style="width:86px"/></colgroup>';

  const groupRow = '<tr class="group-row"><th class="sel-head" rowspan="2"><input type="checkbox" id="select-all-toggle"' +
    (allSelected ? ' checked' : '') + ' aria-label="Select all rows"/></th>' +
    groups.map(g => '<th colspan="' + g.cols.length + '" class="g-' +
      (g.group === 'identification' ? 'ident' : g.group === 'governance' ? 'gov' : g.group) + '">' +
      GROUP_META[g.group] + '</th>').join('') +
    '<th class="actions-head" rowspan="2"></th></tr>';

  const colRow = '<tr class="col-row">' + cols.map(c => {
    const sorted = ui.sort.key === c.key;
    const dirIcon = sorted ? icon('chevron-down', '') : '';
    return '<th class="sortable' + (sorted ? ' sorted' : '') + '" data-action="sort" data-key="' + c.key + '">' +
      esc(c.label) + (sorted ? '<span class="sort-ind" style="' + (ui.sort.dir === 'asc' ? 'transform:rotate(180deg)' : '') + '">' + dirIcon + '</span>' : '') +
    '</th>';
  }).join('') + '</tr>';

  const body = rows.map(r => {
    const node = r.node;
    const selected = selection.has(node.id) ? ' selected' : '';
    const cells = cols.map(c => renderCell(c, node, r.depth)).join('');
    const reviewLabel = canReview(node) ? 'Review' : 'Open';
    return '<tr class="' + selected.trim() + '" data-id="' + esc(node.id) + '" data-action="open-drawer" data-node-id="' + esc(node.id) + '">' +
      '<td class="sel-col"><input type="checkbox" data-select-node="' + esc(node.id) + '"' + (selection.has(node.id) ? ' checked' : '') + ' aria-label="Select ' + esc(node.name || 'node') + '"/></td>' +
      cells +
      '<td class="actions-col"><button class="btn xs ghost row-review-btn" data-action="open-drawer" data-id="' + esc(node.id) + '">' + reviewLabel + '</button></td>' +
    '</tr>';
  }).join('');

  return '<table class="master-table">' + colgroup + '<thead>' + groupRow + colRow + '</thead><tbody>' + body + '</tbody></table>';
}

function treePrefix(node, depth) {
  const treeMode = !ui.sort.key && !hasActiveFilters();
  const kids = childrenOf(node.id).length;
  const collapsed = state.settings.collapsed.includes(node.id);
  const toggle = treeMode && kids
    ? '<button class="tree-toggle" data-action="toggle-collapse" data-id="' + esc(node.id) + '" aria-label="Toggle children">' +
      icon(collapsed ? 'chevron-right' : 'chevron-down') + '</button>'
    : '<span class="tree-spacer"></span>';
  const indent = treeMode ? Math.min(depth, 3) * 10 : 0;
  return '<span class="tree-prefix" style="padding-left:' + indent + 'px">' + toggle + '</span>';
}

function renderCell(col, node, depth) {
  switch (col.key) {
    case 'rankId':
      return '<td class="mono-cell">' + (node.rankId == null ? '—' : esc(node.rankId)) + '</td>';
    case 'level':
      return '<td class="level-cell">' + treePrefix(node, depth) + levelBadge(node.level) + '</td>';
    case 'l1':
    case 'l2':
    case 'l3':
    case 'l4': {
      const level = col.key.toUpperCase();
      const value = nameAtLevel(node, level);
      const cls = col.key === 'l4' ? ' cell-strong' : '';
      return '<td><span class="cell-clip' + cls + '" title="' + esc(value) + '">' + (value ? esc(value) : '<span class="cell-empty">—</span>') + '</span></td>';
    }
    case 'description':
      return '<td><span class="cell-clamp" title="' + esc(node.description) + '">' + (node.description ? esc(node.description) : '<span class="cell-empty">—</span>') + '</span></td>';
    case 'cfcRelated':
      return '<td>' + (node.cfcRelated ? '<span class="pill teal">' + esc(node.cfcRelated) + '</span>' : '<span class="cell-empty">—</span>') + '</td>';
    case 'ownerBizTeam':
    case 'itOwner':
    case 'shadowOwner':
    case 'techStack':
      return '<td><span class="cell-clip" title="' + esc(node[col.key]) + '">' + (node[col.key] ? esc(node[col.key]) : '<span class="cell-empty">—</span>') + '</span></td>';
    case 'dtOwner':
      return '<td>' + ownerCell(node.dtOwner) + '</td>';
    case 'experienceLevel':
      return '<td>' + (node.experienceLevel ? '<span class="pill outline">' + esc(node.experienceLevel) + '</span>' : '<span class="cell-empty">—</span>') + '</td>';
    case 'prdVersion':
      return '<td>' + (node.prdVersion ? '<span class="pill outline">' + esc(node.prdVersion) + '</span>' : '<span class="cell-empty">—</span>') + '</td>';
    case 'changeProject':
      return '<td><span class="cell-clip" title="' + esc(node.changeProject) + '">' + (node.changeProject ? esc(node.changeProject) : '<span class="cell-empty">—</span>') + '</span></td>';
    case 'prdLink':
    case 'fsLink':
      return '<td>' + linkCell(node[col.key]) + '</td>';
    case 'status':
      return '<td>' + statusCell(node.status) + '</td>';
    case 'changeType':
      return '<td>' + changePill(node.changeType) + '</td>';
    case 'priority':
      return '<td>' + priorityPill(node.priority) + '</td>';
    case 'sharedAcross':
      return '<td><span class="cell-clip" title="' + esc(node.sharedAcross) + '">' + (node.sharedAcross ? esc(node.sharedAcross) : '<span class="cell-empty">—</span>') + '</span></td>';
    case 'lockStatus':
      return '<td>' + lockPill(node.lockStatus) + '</td>';
    case 'evaluationResult':
      return '<td>' + evalPill(node) + '</td>';
    case 'aiScore':
      return '<td>' + scoreCell(node.aiScore) + '</td>';
    case 'created':
    case 'lastModified':
    case 'reviewDate':
      return '<td class="cell-dim" style="white-space:nowrap">' + esc(fmtDate(node[col.key])) + '</td>';
    case 'reviewer':
      return '<td><span class="cell-clip" title="' + esc(node.reviewer) + '">' + (node.reviewer ? esc(node.reviewer) : '<span class="cell-empty">—</span>') + '</span></td>';
    case 'notes':
      return '<td><span class="cell-clamp" title="' + esc(node.notes) + '">' + (node.notes ? esc(node.notes) : '<span class="cell-empty">—</span>') + '</span></td>';
    case 'source':
      return '<td>' + (node.source ? '<span class="pill outline">' + esc(node.source) + '</span>' : '<span class="cell-empty">—</span>') + '</td>';
    default:
      return '<td>' + esc(node[col.key] || '—') + '</td>';
  }
}

function linkCell(value) {
  if (!value) return '<span class="cell-empty">—</span>';
  const url = /^https?:\/\//i.test(value);
  if (url) {
    return '<a href="' + esc(value) + '" target="_blank" rel="noopener" class="cell-clip" title="' + esc(value) + '">' + esc(value) + '</a>';
  }
  return '<span class="cell-clip" title="' + esc(value) + '">' + esc(value) + '</span>';
}

function updateResultCount() {
  const el = document.getElementById('result-count');
  if (!el) return;
  const shown = displayRows().length;
  const stats = reviewStats();
  el.innerHTML = 'Showing <strong>' + shown + '</strong> of ' + state.nodes.length + ' nodes' +
    ' · <strong>' + stats.reviewed + '</strong> reviewed · <strong>' + stats.coverage + '%</strong> coverage';
}

function updateBulkBar() {
  const bar = document.getElementById('bulk-bar');
  if (!bar) return;
  if (!selection.size) {
    bar.classList.add('hidden');
    bar.innerHTML = '';
    return;
  }
  bar.classList.remove('hidden');
  const selected = state.nodes.filter(n => selection.has(n.id));
  const reviewable = selected.filter(canReview).length;
  bar.innerHTML = '<strong>' + selected.length + ' selected</strong>' +
    '<span>' + reviewable + ' L3/L4 node' + (reviewable === 1 ? '' : 's') + ' can be evaluated</span>' +
    '<div class="bulk-actions">' +
      '<button class="btn xs pass" data-action="bulk-review" data-result="Passed" ' + (reviewable ? '' : 'disabled') + '>Passed</button>' +
      '<button class="btn xs revise" data-action="bulk-review" data-result="Need Revise" ' + (reviewable ? '' : 'disabled') + '>Need Revise</button>' +
      '<button class="btn xs reject" data-action="bulk-review" data-result="Reject" ' + (reviewable ? '' : 'disabled') + '>Reject</button>' +
      '<button class="btn xs ghost" data-action="clear-selection">Clear</button>' +
    '</div>';
}

function refreshMasterResults() {
  const container = document.getElementById('master-results');
  if (!container) return;
  container.innerHTML = masterResultsHTML();
  updateResultCount();
  updateBulkBar();
}

function syncSearchInput() {
  const input = document.getElementById('global-search');
  if (input && document.activeElement !== input) input.value = ui.search;
}

/* ---------------- Drawer ---------------- */
function renderDrawer() {
  const root = document.getElementById('drawer-root');
  if (!root) return;
  if (!drawerState) {
    root.innerHTML = '';
    if (!modalState) document.body.classList.remove('no-scroll');
    return;
  }
  const node = INDEX.get(drawerState.id);
  if (!node) {
    drawerState = null;
    root.innerHTML = '';
    if (!modalState) document.body.classList.remove('no-scroll');
    return;
  }
  document.body.classList.add('no-scroll');
  const tabs = [{ key: 'details', label: 'Details' }];
  if (canReview(node)) tabs.push({ key: 'review', label: 'Review' });
  tabs.push({ key: 'activity', label: 'Activity' });
  const activeTab = tabs.some(t => t.key === drawerState.tab) ? drawerState.tab : 'details';
  const crumb = chain(node).slice(0, -1).map(x => x.name).filter(Boolean);

  root.innerHTML = '<div class="drawer-overlay" data-action="close-drawer"></div>' +
    '<aside class="drawer" role="dialog" aria-modal="true" aria-label="' + esc(node.name) + '">' +
      '<div class="drawer-head">' +
        '<div class="drawer-title-row">' +
          levelBadge(node.level, true) +
          '<div class="drawer-title-main"><h2>' + esc(node.name || '(unnamed)') + '</h2>' +
            '<div class="drawer-sub">' +
              '<span>RankID ' + (node.rankId == null ? '—' : esc(node.rankId)) + '</span><span>·</span>' +
              '<span>' + esc(node.source || 'Master list') + '</span></div>' +
          '</div>' +
          '<button class="icon-btn" data-action="close-drawer" aria-label="Close">' + icon('close') + '</button>' +
        '</div>' +
        (crumb.length ? '<div class="drawer-crumb">' + crumb.map((c, i) =>
          '<span>' + esc(c) + '</span>' + (i < crumb.length - 1 ? '<span class="sep">›</span>' : '')).join('') + '</div>' : '') +
      '</div>' +
      '<div class="drawer-tabs">' + tabs.map(t =>
        '<button class="' + (t.key === activeTab ? 'active' : '') + '" data-action="drawer-tab" data-tab="' + t.key + '">' +
          esc(t.label) + '</button>').join('') + '</div>' +
      '<div class="drawer-body">' +
        (activeTab === 'details' ? drawerDetailsHTML(node) : activeTab === 'review' ? drawerReviewHTML(node) : drawerActivityHTML(node)) +
      '</div>' +
      '<div class="drawer-footer">' +
        '<div class="footer-left">' +
          (node.level !== 'L4' ? '<button class="btn ghost sm" data-action="add-child" data-id="' + esc(node.id) + '">' + icon('plus') + 'Add child</button>' : '') +
          '<button class="btn danger sm" data-action="delete-node" data-id="' + esc(node.id) + '"' +
            (hasChildren(node.id) ? ' title="Remove child nodes first" disabled' : '') + '>' + icon('trash') + 'Delete</button>' +
        '</div>' +
        '<div class="footer-right">' +
          '<span class="dirty-hint' + (draftDirty ? '' : ' hidden') + '" id="dirty-hint"><i class="dot"></i>Unsaved changes</span>' +
          '<button class="btn ghost sm" data-action="close-drawer">Cancel</button>' +
          '<button class="btn primary sm" data-action="save-node" id="drawer-save"' + (draftDirty ? '' : ' disabled') + '>' + icon('save') + 'Save changes</button>' +
        '</div>' +
      '</div>' +
    '</aside>';
}

function drawerDetailsHTML(node) {
  const tabNote = node.level === 'L1' || node.level === 'L2'
    ? '<div class="info-banner amber">' + icon('info') + '<span>L1 and L2 are container levels. Review is performed on the L3 modules and L4 functions beneath them.</span></div>'
    : '';
  return tabNote +
    '<section class="form-section">' +
      '<div class="form-section-head"><h3>Classification</h3><span class="meta">' + esc(node.level) + ' level</span></div>' +
      '<div class="form-grid">' +
        fieldHTML('Name', 'name', draft.name, { full: true, placeholder: 'Node name' }) +
        fieldHTML('Level', 'level', node.level, { readonly: true, helper: 'Level is fixed after creation' }) +
        fieldHTML('RankID', 'rankId', node.rankId == null ? '' : node.rankId, { readonly: true }) +
        fieldHTML('Parent', 'parentId', node.parentId ? (INDEX.get(node.parentId) || {}).name || '' : '—', { readonly: true }) +
        fieldHTML('Source', 'source', node.source, { readonly: true }) +
        fieldHTML('Description', 'description', draft.description, { type: 'textarea', full: true, placeholder: 'What this node covers / scope notes' }) +
      '</div>' +
    '</section>' +
    '<section class="form-section">' +
      '<div class="form-section-head"><h3>Ownership &amp; links</h3></div>' +
      '<div class="form-grid">' +
        fieldHTML('Owner Biz Team', 'ownerBizTeam', draft.ownerBizTeam, { placeholder: 'Business owner' }) +
        fieldHTML('DT Owner', 'dtOwner', draft.dtOwner, { placeholder: 'Digital technology owner' }) +
        fieldHTML('Shadow Owner', 'shadowOwner', draft.shadowOwner, { placeholder: 'Shadow owner' }) +
        fieldHTML('Experience Level', 'experienceLevel', draft.experienceLevel, { list: 'experience-options', placeholder: 'High / Mid / Low' }) +
        fieldHTML('IT Owner', 'itOwner', draft.itOwner, { placeholder: 'IT owner' }) +
        fieldHTML('Tech Stack', 'techStack', draft.techStack, { placeholder: 'Technology stack' }) +
        fieldHTML('PRD Link (L3)', 'prdLink', draft.prdLink, { full: true, placeholder: 'PRD link or document title' }) +
        fieldHTML('FS Link (L4)', 'fsLink', draft.fsLink, { full: true, placeholder: 'Functional spec link or title' }) +
      '</div>' +
      '<datalist id="experience-options"><option value="High"></option><option value="Mid"></option><option value="Low"></option></datalist>' +
    '</section>' +
    '<section class="form-section">' +
      '<div class="form-section-head"><h3>Governance</h3><span class="meta">Excel dropdown values</span></div>' +
      '<div class="form-grid">' +
        fieldHTML('Status', 'status', draft.status, { options: OPTIONS.status }) +
        fieldHTML('Change Type', 'changeType', draft.changeType, { options: OPTIONS.changeType }) +
        fieldHTML('Priority', 'priority', draft.priority, { options: OPTIONS.priority }) +
        fieldHTML('Lock Status', 'lockStatus', draft.lockStatus, { options: OPTIONS.lockStatus }) +
        fieldHTML('Shared Across (Projects)', 'sharedAcross', draft.sharedAcross, { placeholder: 'Projects sharing this capability' }) +
        fieldHTML('CFC Related', 'cfcRelated', draft.cfcRelated, { list: 'cfc-options', placeholder: 'Yes / No' }) +
      '</div>' +
      '<datalist id="cfc-options"><option value="Yes"></option><option value="No"></option></datalist>' +
    '</section>' +
    '<section class="form-section">' +
      '<div class="form-section-head"><h3>Metadata</h3></div>' +
      '<div class="form-grid">' +
        fieldHTML('Created', 'created', node.created, { readonly: true }) +
        fieldHTML('Last Modified', 'lastModified', node.lastModified, { readonly: true }) +
      '</div>' +
    '</section>';
}

function distinctValues(key) {
  const seen = {};
  state.nodes.forEach(n => {
    const v = String(n[key] || '').trim();
    if (v) seen[v] = true;
  });
  return Object.keys(seen).sort();
}

function drawerReviewHTML(node) {
  return '<div class="info-banner">' + icon('info') +
      '<span>Evaluation Results and AI Self Evaluation Score follow the Excel master list. Results are tracked for L3/L4 nodes.</span></div>' +
    '<div id="review-summary">' + reviewSummaryHTML() + '</div>' +
    '<section class="form-section">' +
      '<div class="form-section-head"><h3>Evaluation result</h3><span class="meta">Required</span></div>' +
      '<div class="result-segmented">' +
        resultOption('Passed', 'pass', 'Approved for the target architecture', 'check-circle') +
        resultOption('Need Revise', 'revise', 'Changes required before approval', 'alert') +
        resultOption('Reject', 'reject', 'Not aligned with the architecture', 'close') +
      '</div>' +
    '</section>' +
    '<section class="form-section">' +
      '<div class="form-section-head"><h3>Review details</h3></div>' +
      '<div class="form-grid">' +
        fieldHTML('Change Project / CR', 'changeProject', draft.changeProject, { list: 'project-options', placeholder: 'Project that changed this PRD' }) +
        fieldHTML('PRD Version (Active)', 'prdVersion', draft.prdVersion, { list: 'version-options', placeholder: 'e.g. v1.2' }) +
        fieldHTML('Reviewer', 'reviewer', draft.reviewer, { placeholder: 'Reviewer name' }) +
        fieldHTML('Review Date', 'reviewDate', draft.reviewDate, { type: 'date' }) +
        fieldHTML('AI Self Evaluation Score', 'aiScore', draft.aiScore, { type: 'number', min: 0, max: 100, suffix: '/ 100', placeholder: '0 – 100' }) +
        fieldHTML('Notes', 'notes', draft.notes, { type: 'textarea', full: true, placeholder: 'Review comments, conditions, follow-ups…' }) +
      '</div>' +
      '<datalist id="project-options">' + distinctValues('changeProject').map(v => '<option value="' + esc(v) + '"></option>').join('') + '</datalist>' +
      '<datalist id="version-options">' + distinctValues('prdVersion').map(v => '<option value="' + esc(v) + '"></option>').join('') + '</datalist>' +
      '<div class="field helper" style="padding:2px 0 10px">The project and PRD version are recorded with each review round, so every result is traceable to the change that triggered it.</div>' +
      '<div style="display:flex;justify-content:flex-end">' +
        '<button class="btn ghost sm" data-action="clear-result">Clear result</button>' +
      '</div>' +
    '</section>' +
    '<section class="form-section">' +
      '<div class="form-section-head"><h3>Review history</h3><span class="meta">' +
        (node.history || []).length + ' round' + ((node.history || []).length === 1 ? '' : 's') + '</span></div>' +
      reviewHistoryHTML(node) +
    '</section>';
}

function reviewHistoryHTML(node) {
  const history = node.history || [];
  if (!history.length) return '<div class="timeline-empty">No review rounds recorded yet.</div>';
  return '<div class="mini-timeline">' + history.slice().reverse().map((h, i) => {
    const round = history.length - i;
    const tone = h.result === 'Passed' ? 'green' : h.result === 'Need Revise' ? 'amber' : 'red';
    const ico = h.result === 'Passed' ? 'check-circle' : h.result === 'Need Revise' ? 'alert' : 'close';
    return '<div class="timeline-item">' +
      '<span class="timeline-ico ' + tone + '">' + icon(ico) + '</span>' +
      '<div class="timeline-main">' +
        '<p><b>Round ' + round + '</b> · ' + esc(h.result) + (h.reviewer ? ' · ' + esc(h.reviewer) : '') + '</p>' +
        ((h.project || h.version) ? '<p class="history-trace">' +
          (h.project ? 'Project: <b>' + esc(h.project) + '</b>' : '') +
          (h.project && h.version ? ' · ' : '') +
          (h.version ? 'PRD ' + esc(h.version) : '') + '</p>' : '') +
        (h.note ? '<p class="history-note">' + esc(h.note) + '</p>' : '') +
        '<time>' + esc(h.reviewDate ? fmtDate(h.reviewDate) : fmtDateTime(h.ts)) + '</time>' +
      '</div>' +
      '<span class="history-pill">' + evalPill({ evaluationResult: h.result }) + '</span>' +
    '</div>';
  }).join('') + '</div>';
}

function resultOption(value, cls, sub, iconName) {
  const active = draft.evaluationResult === value;
  return '<button class="result-option ' + cls + (active ? ' active' : '') + '" data-action="set-result" data-result="' + esc(value) + '">' +
    '<span class="res-title"><i class="dot"></i>' + esc(value) + '</span>' +
    '<span class="res-sub">' + esc(sub) + '</span>' +
  '</button>';
}

function reviewSummaryHTML() {
  const result = draft.evaluationResult;
  const tone = result === 'Passed' ? 'green' : result === 'Need Revise' ? 'amber' : result === 'Reject' ? 'red' : '';
  const ico = result === 'Passed' ? 'check-circle' : result === 'Need Revise' ? 'alert' : result === 'Reject' ? 'close' : 'clock';
  const label = result || 'Not reviewed';
  const parts = [];
  if (draft.reviewDate) parts.push('Reviewed ' + fmtDate(draft.reviewDate));
  else parts.push('No review date set');
  if (draft.reviewer) parts.push('by ' + draft.reviewer);
  return '<div class="review-summary">' +
    '<span class="icon-wrap ' + tone + '">' + icon(ico) + '</span>' +
    '<div><strong>' + esc(label) + '</strong><span>' + esc(parts.join(' · ')) + '</span></div>' +
    '<span style="margin-left:auto">' + evalPill({ evaluationResult: result }) + '</span>' +
  '</div>';
}

function drawerActivityHTML(node) {
  const items = state.activity.filter(a => a.nodeId === node.nodeId);
  if (!items.length) return '<div class="timeline-empty">No activity recorded for this node yet.</div>';
  return '<div class="mini-timeline">' + items.map(a => {
    const result = REVIEW_STATES.find(r => a.detail && a.detail.indexOf(r) > -1) || '';
    const tone = result === 'Passed' ? 'green' : result === 'Need Revise' ? 'amber' : result === 'Reject' ? 'red' : 'blue';
    const ico = a.type === 'add' ? 'plus' : a.type === 'delete' ? 'trash' : a.type === 'import' ? 'upload' : 'check-circle';
    return '<div class="timeline-item">' +
      '<span class="timeline-ico ' + tone + '">' + icon(ico) + '</span>' +
      '<div class="timeline-main"><p><b>' + esc(a.actor || USER.name) + '</b> ' + esc(a.detail || 'updated this node') + '</p>' +
        '<time>' + esc(fmtDateTime(a.ts)) + '</time></div>' +
    '</div>';
  }).join('') + '</div>';
}

function fieldHTML(label, name, value, opts) {
  opts = opts || {};
  const id = 'fld-' + name;
  const full = opts.full ? ' full' : '';
  let control;
  if (opts.options) {
    control = '<select id="' + id + '" data-field="' + name + '">' + opts.options.map(opt =>
      '<option value="' + esc(opt) + '"' + (String(value) === String(opt) ? ' selected' : '') + '>' + esc(opt) + '</option>'
    ).join('') + '</select>';
  } else if (opts.type === 'textarea') {
    control = '<textarea id="' + id + '" data-field="' + name + '" placeholder="' + esc(opts.placeholder || '') + '">' + esc(value) + '</textarea>';
  } else {
    const attrs = (opts.type ? ' type="' + opts.type + '"' : ' type="text"') +
      (opts.readonly ? ' readonly' : '') +
      (opts.min != null ? ' min="' + opts.min + '"' : '') +
      (opts.max != null ? ' max="' + opts.max + '"' : '') +
      (opts.list ? ' list="' + opts.list + '"' : '') +
      ' placeholder="' + esc(opts.placeholder || '') + '"';
    const input = '<input id="' + id + '" data-field="' + name + '"' + attrs + ' value="' + esc(value == null ? '' : value) + '"/>';
    control = opts.suffix
      ? '<div class="input-suffix">' + input + '<span>' + esc(opts.suffix) + '</span></div>'
      : input;
  }
  return '<div class="field' + full + '"><label for="' + id + '">' + esc(label) + '</label>' + control +
    (opts.helper ? '<span class="helper">' + esc(opts.helper) + '</span>' : '') + '</div>';
}

/* ---------------- Modal ---------------- */
function renderModal() {
  const root = document.getElementById('modal-root');
  if (!root) return;
  if (!modalState) {
    root.innerHTML = '';
    if (!drawerState) document.body.classList.remove('no-scroll');
    return;
  }
  document.body.classList.add('no-scroll');
  if (modalState.type === 'confirm') {
    root.innerHTML = '<div class="modal-overlay" data-action="close-modal">' +
      '<div class="modal" role="dialog" aria-modal="true" data-stop-modal="1">' +
        '<div class="modal-head">' +
          '<span class="modal-ico" style="' + (modalState.danger ? 'background:#fef1f0;color:#d92d20' : '') + '">' + icon(modalState.danger ? 'alert' : 'info') + '</span>' +
          '<div><h2>' + esc(modalState.title) + '</h2><p>' + esc(modalState.message) + '</p></div>' +
          '<button class="icon-btn" data-action="close-modal" aria-label="Close">' + icon('close') + '</button>' +
        '</div>' +
        '<div class="modal-foot">' +
          '<button class="btn ghost" data-action="close-modal">Cancel</button>' +
          '<button class="btn ' + (modalState.danger ? 'danger' : 'primary') + '" data-action="confirm-modal">' + esc(modalState.confirmLabel || 'Confirm') + '</button>' +
        '</div>' +
      '</div>' +
    '</div>';
    return;
  }
  root.innerHTML = '<div class="modal-overlay" data-action="close-modal">' +
    '<div class="modal" role="dialog" aria-modal="true" data-stop-modal="1">' +
      '<div class="modal-head">' +
        '<span class="modal-ico">' + icon('plus') + '</span>' +
        '<div><h2>Add architecture node</h2><p>Create an L1–L4 entry. The RankID is generated from the hierarchy.</p></div>' +
        '<button class="icon-btn" data-action="close-modal" aria-label="Close">' + icon('close') + '</button>' +
      '</div>' +
      '<div class="modal-body">' +
        '<div class="info-banner">' + icon('info') + '<span>Status, Change Type, Priority and Lock Status use the same dropdown values as the Excel master list.</span></div>' +
        '<div class="form-grid">' +
          addLevelField() +
          addParentField() +
          '<div class="field full"><label for="add-name">Name <span class="req">*</span></label>' +
            '<input id="add-name" data-add-field="name" type="text" placeholder="L3 feature or L4 function name"/></div>' +
          '<div class="field"><label for="add-rank-id">RankID</label>' +
            '<input id="add-rank-id" data-add-field="rankId" type="text"/></div>' +
          '<div class="field"><label for="add-dt-owner">DT Owner</label>' +
            '<input id="add-dt-owner" data-add-field="dtOwner" type="text" placeholder="Owner"/></div>' +
          '<div class="field"><label for="add-status">Status</label><select id="add-status" data-add-field="status">' +
            OPTIONS.status.map(o => '<option value="' + esc(o) + '">' + esc(o) + '</option>').join('') + '</select></div>' +
          '<div class="field"><label for="add-change">Change Type</label><select id="add-change" data-add-field="changeType">' +
            OPTIONS.changeType.map(o => '<option value="' + esc(o) + '"' + (o === 'New' ? ' selected' : '') + '>' + esc(o) + '</option>').join('') + '</select></div>' +
          '<div class="field"><label for="add-priority">Priority</label><select id="add-priority" data-add-field="priority">' +
            OPTIONS.priority.map(o => '<option value="' + esc(o) + '"' + (o === '—' ? ' selected' : '') + '>' + esc(o) + '</option>').join('') + '</select></div>' +
          '<div class="field"><label for="add-lock">Lock Status</label><select id="add-lock" data-add-field="lockStatus">' +
            OPTIONS.lockStatus.map(o => '<option value="' + esc(o) + '"' + (o === '-' ? ' selected' : '') + '>' + esc(o) + '</option>').join('') + '</select></div>' +
          '<div class="field full"><label for="add-description">Description</label>' +
            '<textarea id="add-description" data-add-field="description" placeholder="Scope, hierarchy or integration notes"></textarea></div>' +
        '</div>' +
      '</div>' +
      '<div class="modal-foot">' +
        '<button class="btn ghost" data-action="close-modal">Cancel</button>' +
        '<button class="btn primary" data-action="create-node">' + icon('plus') + 'Create node</button>' +
      '</div>' +
    '</div>' +
  '</div>';
  updateAddAutoFields();
}

function addLevelField() {
  return '<div class="field"><label for="add-level">Level <span class="req">*</span></label>' +
    '<select id="add-level" data-add-field="level">' + LEVELS.map(l =>
      '<option value="' + l + '"' + (modalState.level === l ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></div>';
}

function addParentField() {
  const options = parentOptions(modalState.level);
  return '<div class="field"><label for="add-parent">Parent <span class="req">*</span></label>' +
    '<select id="add-parent" data-add-field="parentId"' + (modalState.level === 'L1' ? ' disabled' : '') + '>' +
      (modalState.level === 'L1' ? '<option value="">— Top level —</option>' :
        options.length ? options.map(p => '<option value="' + esc(p.id) + '"' + (p.id === modalState.parentId ? ' selected' : '') + '>' +
          esc(p.name) + ' (' + esc(p.level) + ')</option>').join('') :
        '<option value="">No ' + LEVELS[LEVEL_RANK[modalState.level] - 2] + ' nodes available</option>') +
    '</select></div>';
}

function parentOptions(level) {
  if (level === 'L1') return [];
  const parentLevel = LEVELS[LEVEL_RANK[level] - 2];
  return state.nodes.filter(n => n.level === parentLevel).sort(sortByRank);
}

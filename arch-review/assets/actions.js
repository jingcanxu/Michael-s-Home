/* Architecture Review Console — interactions and review workflow */

let searchTimer = null;

document.addEventListener('DOMContentLoaded', init);

function init() {
  state = loadState();
  if (!state) state = defaultState();
  reindex();

  const hash = location.hash.replace(/^#\//, '');
  if (VIEW_META[hash]) ui.view = hash;
  else history.replaceState(null, '', '#/overview');

  render();
  bindEvents();
}

function bindEvents() {
  document.addEventListener('click', handleClick);
  document.addEventListener('change', handleChange);
  document.addEventListener('input', handleInput);
  document.addEventListener('keydown', handleKeydown);
  document.addEventListener('dragstart', handleDragStart);
  document.addEventListener('dragend', handleDragEnd);
  document.addEventListener('dragover', handleDragOver);
  document.addEventListener('dragleave', handleDragLeave);
  document.addEventListener('drop', handleDrop);
  window.addEventListener('hashchange', () => {
    const view = location.hash.replace(/^#\//, '');
    if (VIEW_META[view] && view !== ui.view) {
      ui.view = view;
      render();
    }
    document.body.classList.remove('sidebar-open');
  });

  const fileInput = document.getElementById('file-input');
  if (fileInput) {
    fileInput.addEventListener('change', () => {
      const file = fileInput.files && fileInput.files[0];
      fileInput.value = '';
      handleImportFile(file);
    });
  }
}

/* ---------------- Click routing ---------------- */
function handleClick(e) {
  if (e.target.classList.contains('modal-overlay')) { closeModal(); return; }
  if (e.target.classList.contains('drawer-overlay')) { requestCloseDrawer(); return; }
  if (e.target.closest('a')) { closeMenus(); return; }
  if (e.target.closest('input, select, textarea, label')) { return; }

  const actionEl = e.target.closest('[data-action]');
  if (!actionEl) {
    if (!e.target.closest('.menu-wrap')) closeMenus();
    return;
  }
  const action = actionEl.dataset.action;

  if (action === 'toggle-menu') {
    e.preventDefault();
    const wrap = actionEl.closest('.menu-wrap');
    const open = wrap.classList.contains('open');
    closeMenus();
    if (!open) wrap.classList.add('open');
    return;
  }
  closeMenus();

  switch (action) {
    case 'navigate':
      setView(actionEl.dataset.view);
      document.body.classList.remove('sidebar-open');
      break;
    case 'toggle-sidebar':
      document.body.classList.toggle('sidebar-open');
      break;
    case 'import': {
      const input = document.getElementById('file-input');
      if (input) { input.value = ''; input.click(); }
      break;
    }
    case 'export-xlsx': exportXlsx(); break;
    case 'export-csv': exportCsv(); break;
    case 'export-json': exportJson(); break;
    case 'add-node':
      openAddNode({ level: actionEl.dataset.level || 'L4' });
      break;
    case 'reset-data':
      requestReset();
      break;
    case 'clear-filters':
      clearAllFilters();
      break;
    case 'toggle-advanced': {
      ui.advanced = !ui.advanced;
      const panel = document.getElementById('advanced-filters');
      if (panel) panel.classList.toggle('hidden', !ui.advanced);
      break;
    }
    case 'expand-all':
      state.settings.collapsed = [];
      saveState();
      refreshMasterResults();
      break;
    case 'collapse-all':
      state.settings.collapsed = state.nodes.filter(n => hasChildren(n.id)).map(n => n.id);
      saveState();
      refreshMasterResults();
      break;
    case 'toggle-collapse': {
      const id = actionEl.dataset.id;
      const set = new Set(state.settings.collapsed);
      if (set.has(id)) set.delete(id); else set.add(id);
      state.settings.collapsed = Array.from(set);
      saveState();
      refreshMasterResults();
      break;
    }
    case 'sort': {
      const key = actionEl.dataset.key;
      if (ui.sort.key === key) {
        if (ui.sort.dir === 'asc') ui.sort.dir = 'desc';
        else { ui.sort.key = null; ui.sort.dir = 'asc'; }
      } else {
        ui.sort.key = key;
        ui.sort.dir = 'asc';
      }
      refreshMasterResults();
      break;
    }
    case 'open-drawer':
      openDrawer(actionEl.dataset.id);
      break;
    case 'close-drawer':
      requestCloseDrawer();
      break;
    case 'drawer-tab':
      if (drawerState) {
        drawerState.tab = actionEl.dataset.tab;
        renderDrawer();
      }
      break;
    case 'add-child': {
      const node = INDEX.get(actionEl.dataset.id);
      if (node && node.level !== 'L4') {
        openAddNode({ level: LEVELS[LEVEL_RANK[node.level]], parentId: node.id });
      }
      break;
    }
    case 'delete-node': {
      const node = INDEX.get(actionEl.dataset.id);
      if (node) requestDelete(node);
      break;
    }
    case 'save-node':
      saveDrawer();
      break;
    case 'set-result':
      setDraftResult(actionEl.dataset.result || '');
      break;
    case 'clear-result':
      setDraftResult('');
      break;
    case 'quick-review':
      quickReview(actionEl.dataset.id, actionEl.dataset.result);
      break;
    case 'bulk-review':
      bulkReview(actionEl.dataset.result);
      break;
    case 'clear-selection':
      selection.clear();
      render();
      break;
    case 'queue-level':
      ui.queueLevel = actionEl.dataset.level || 'all';
      render();
      break;
    case 'start-focus':
      startFocus();
      break;
    case 'focus-exit':
      ui.focus = null;
      render();
      break;
    case 'focus-skip':
      focusSkip();
      break;
    case 'focus-result':
      focusResult(actionEl.dataset.result);
      break;
    case 'focus-open': {
      const node = focusCurrent();
      if (node) openDrawer(node.id);
      break;
    }
    case 'open-node-id': {
      const node = state.nodes.find(n => n.nodeId === actionEl.dataset.nodeId);
      if (node) openDrawer(node.id);
      break;
    }
    case 'close-modal':
      closeModal();
      break;
    case 'confirm-modal':
      confirmModal();
      break;
    case 'create-node':
      createNode();
      break;
    default:
      break;
  }
}

/* ---------------- Input / change routing ---------------- */
function handleChange(e) {
  const el = e.target;
  if (el.matches('[data-filter]')) {
    ui.filters[el.dataset.filter] = el.value;
    el.classList.toggle('active', !!el.value);
    refreshMasterResults();
    return;
  }
  if (el.matches('[data-column]')) {
    const key = el.dataset.column;
    const set = new Set(state.settings.visibleColumns);
    if (el.checked) set.add(key); else set.delete(key);
    if (!set.size) {
      el.checked = true;
      toast('Keep at least one column visible', 'warn');
      return;
    }
    state.settings.visibleColumns = COLUMNS.filter(c => set.has(c.key)).map(c => c.key);
    saveState();
    refreshMasterResults();
    return;
  }
  if (el.matches('[data-select-node]')) {
    const id = el.dataset.selectNode;
    if (el.checked) selection.add(id); else selection.delete(id);
    const row = el.closest('tr');
    if (row) row.classList.toggle('selected', el.checked);
    const all = document.getElementById('select-all-toggle');
    if (all) {
      const rows = displayRows();
      all.checked = rows.length > 0 && rows.every(r => selection.has(r.node.id));
    }
    updateBulkBar();
    return;
  }
  if (el.id === 'select-all-toggle') {
    const rows = displayRows();
    if (el.checked) rows.forEach(r => selection.add(r.node.id));
    else rows.forEach(r => selection.delete(r.node.id));
    document.querySelectorAll('[data-select-node]').forEach(cb => {
      cb.checked = el.checked;
      const row = cb.closest('tr');
      if (row) row.classList.toggle('selected', el.checked);
    });
    updateBulkBar();
    return;
  }
  if (el.id === 'add-level') {
    modalState.level = el.value;
    modalState.parentId = null;
    updateAddParentSelect();
    return;
  }
  if (el.id === 'add-parent') {
    modalState.parentId = el.value || null;
    updateAddAutoFields();
    return;
  }
  if (el.matches('[data-field]')) {
    updateDraft(el);
  }
}

function handleInput(e) {
  const el = e.target;
  if (el.id === 'global-search') {
    ui.search = el.value;
    clearTimeout(searchTimer);
    if (ui.view !== 'master') {
      ui.view = 'master';
      history.replaceState(null, '', '#/master');
      render();
      const input = document.getElementById('global-search');
      if (input) input.focus();
    } else {
      searchTimer = setTimeout(refreshMasterResults, 140);
    }
    return;
  }
  if (el.matches('[data-field]')) updateDraft(el);
}

function updateDraft(el) {
  if (!draft) return;
  const field = el.dataset.field;
  if (field === 'aiScore') {
    draft.aiScore = el.value === '' ? '' : Number(el.value);
  } else {
    draft[field] = el.value;
  }
  markDirty();
}

function markDirty() {
  draftDirty = true;
  const hint = document.getElementById('dirty-hint');
  const save = document.getElementById('drawer-save');
  if (hint) hint.classList.remove('hidden');
  if (save) save.disabled = false;
}

/* ---------------- Drawer ---------------- */
function openDrawer(id, tab) {
  const node = INDEX.get(id);
  if (!node) return;
  closeMenus();
  drawerState = { id: id, tab: tab || 'details' };
  draft = deepCopy(node);
  draftDirty = false;
  renderDrawer();
}

function requestCloseDrawer() {
  if (!drawerState) return;
  if (draftDirty) {
    openConfirm({
      title: 'Discard unsaved changes?',
      message: 'Your edits to this node have not been saved.',
      confirmLabel: 'Discard changes',
      danger: true,
      onConfirm: () => closeDrawer(true)
    });
    return;
  }
  closeDrawer(true);
}

function closeDrawer(force) {
  if (!force) { requestCloseDrawer(); return; }
  drawerState = null;
  draft = null;
  draftDirty = false;
  renderDrawer();
  if (!modalState) document.body.classList.remove('no-scroll');
}

function saveDrawer() {
  if (!draft || !drawerState) return;
  const node = INDEX.get(drawerState.id);
  if (!node) return;
  const name = String(draft.name || '').trim();
  if (!name) {
    toast('Name is required', 'error', 'Give this node a name before saving.');
    return;
  }

  const patch = {
    name: name,
    description: String(draft.description || '').trim(),
    cfcRelated: String(draft.cfcRelated || '').trim(),
    ownerBizTeam: String(draft.ownerBizTeam || '').trim(),
    dtOwner: String(draft.dtOwner || '').trim(),
    shadowOwner: String(draft.shadowOwner || '').trim(),
    experienceLevel: String(draft.experienceLevel || '').trim(),
    techStack: String(draft.techStack || '').trim(),
    prdLink: String(draft.prdLink || '').trim(),
    itOwner: String(draft.itOwner || '').trim(),
    fsLink: String(draft.fsLink || '').trim(),
    status: OPTIONS.status.includes(draft.status) ? draft.status : 'Active',
    changeType: OPTIONS.changeType.includes(draft.changeType) ? draft.changeType : '—',
    priority: OPTIONS.priority.includes(draft.priority) ? draft.priority : '—',
    lockStatus: OPTIONS.lockStatus.includes(draft.lockStatus) ? draft.lockStatus : '-',
    sharedAcross: String(draft.sharedAcross || '').trim(),
    notes: String(draft.notes || '').trim(),
    reviewer: String(draft.reviewer || '').trim(),
    reviewDate: String(draft.reviewDate || '').trim(),
    evaluationResult: canReview(node) && REVIEW_STATES.includes(draft.evaluationResult) ? draft.evaluationResult : ''
  };

  let score = draft.aiScore;
  if (score === '' || score == null || isNaN(Number(score))) score = '';
  else score = Math.max(0, Math.min(100, Math.round(Number(score))));
  patch.aiScore = score;

  if (patch.evaluationResult && !patch.reviewDate) patch.reviewDate = todayISO();
  if (patch.evaluationResult && !patch.reviewer) patch.reviewer = USER.name;

  const oldResult = node.evaluationResult;
  Object.assign(node, patch);
  node.lastModified = todayISO();

  if (oldResult !== patch.evaluationResult) {
    if (patch.evaluationResult) pushReviewHistory(node, patch.notes);
    logActivity('review', node, patch.evaluationResult
      ? 'Evaluation set to ' + patch.evaluationResult
      : 'Evaluation cleared');
  } else {
    logActivity('edit', node, 'Updated node details');
  }

  saveState();
  draft = deepCopy(node);
  draftDirty = false;
  renderDrawer();
  render();
  toast('Changes saved', '', node.nodeId + ' · ' + node.name);
}

function setDraftResult(result) {
  if (!draft) return;
  draft.evaluationResult = result;
  if (result) {
    if (!draft.reviewDate) {
      draft.reviewDate = todayISO();
      const dateInput = document.getElementById('fld-reviewDate');
      if (dateInput) dateInput.value = draft.reviewDate;
    }
    if (!draft.reviewer) {
      draft.reviewer = USER.name;
      const reviewerInput = document.getElementById('fld-reviewer');
      if (reviewerInput) reviewerInput.value = draft.reviewer;
    }
  }
  document.querySelectorAll('.result-option').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.result === result);
  });
  const summary = document.getElementById('review-summary');
  if (summary) summary.innerHTML = reviewSummaryHTML();
  markDirty();
}

/* ---------------- Focused review ---------------- */
function startFocus() {
  const ids = focusQueueIds();
  if (!ids.length) {
    toast('Nothing to review', 'warn', 'All L3/L4 nodes in this scope already have a result.');
    return;
  }
  ui.focus = { queue: ids, pos: 0, total: ids.length };
  render();
  const main = document.querySelector('.content');
  if (main) main.scrollTop = 0;
}

function focusCurrent() {
  if (!ui.focus) return null;
  const id = ui.focus.queue[ui.focus.pos];
  return id ? INDEX.get(id) || null : null;
}

function focusSkip() {
  const f = ui.focus;
  if (!f || !f.queue.length) return;
  const id = f.queue.splice(f.pos, 1)[0];
  f.queue.push(id);
  if (f.pos >= f.queue.length) f.pos = 0;
  render();
}

function focusResult(result) {
  const node = focusCurrent();
  if (!node || !result) return;
  const noteEl = document.getElementById('focus-note');
  const note = noteEl ? noteEl.value.trim() : '';
  applyResultToNode(node, result, note);
  node.reviewDate = todayISO();
  if (note) node.notes = node.notes ? node.notes + '\n' + note : note;
  logActivity('review', node, 'Evaluation set to ' + node.evaluationResult + (note ? ' · ' + note : ''));
  saveState();
  const f = ui.focus;
  f.queue.splice(f.pos, 1);
  if (f.pos >= f.queue.length) f.pos = 0;
  render();
  toast(node.name, '', 'Marked ' + node.evaluationResult +
    (f.queue.length ? ' · ' + f.queue.length + ' remaining' : ' · queue complete'));
}

function applyResultToNode(node, result, note) {
  if (!node || !canReview(node)) return false;
  if (!result || result === 'Pending') node.evaluationResult = '';
  else node.evaluationResult = result;
  if (node.evaluationResult) {
    if (!node.reviewDate) node.reviewDate = todayISO();
    if (!node.reviewer) node.reviewer = USER.name;
    pushReviewHistory(node, note);
  }
  node.lastModified = todayISO();
  return true;
}

function quickReview(id, result) {
  const node = INDEX.get(id);
  if (!applyResultToNode(node, result)) return;
  logActivity('review', node, node.evaluationResult ? 'Evaluation set to ' + node.evaluationResult : 'Evaluation cleared');
  saveState();
  render();
  toast(node.name, '', node.evaluationResult ? 'Marked ' + node.evaluationResult : 'Evaluation cleared');
}

function bulkReview(result) {
  const nodes = state.nodes.filter(n => selection.has(n.id) && canReview(n));
  if (!nodes.length) {
    toast('No L3/L4 nodes selected', 'warn');
    return;
  }
  nodes.forEach(node => {
    applyResultToNode(node, result);
    logActivity('review', node, 'Evaluation set to ' + result);
  });
  selection.clear();
  saveState();
  render();
  toast(nodes.length + ' nodes updated', '', 'Evaluation set to ' + result);
}

/* ---------------- Add / delete ---------------- */
function openAddNode(opts) {
  opts = opts || {};
  let level = LEVELS.includes(opts.level) ? opts.level : 'L4';
  let parentId = opts.parentId || null;
  if (level !== 'L1') {
    const parents = parentOptions(level);
    if (!parentId || !parents.some(p => p.id === parentId)) {
      parentId = parents.length ? parents[0].id : null;
    }
  }
  modalState = { type: 'add', level: level, parentId: parentId };
  renderModal();
}

function updateAddParentSelect() {
  const level = modalState.level;
  const parents = parentOptions(level);
  if (level === 'L1') {
    modalState.parentId = null;
  } else if (!parents.some(p => p.id === modalState.parentId)) {
    modalState.parentId = parents.length ? parents[0].id : null;
  }
  const select = document.getElementById('add-parent');
  if (select) {
    select.disabled = level === 'L1';
    if (level === 'L1') {
      select.innerHTML = '<option value="">— Top level —</option>';
    } else if (parents.length) {
      select.innerHTML = parents.map(p =>
        '<option value="' + esc(p.id) + '"' + (p.id === modalState.parentId ? ' selected' : '') + '>' +
        esc(p.nodeId) + ' — ' + esc(p.name) + '</option>').join('');
    } else {
      select.innerHTML = '<option value="">No ' + LEVELS[LEVEL_RANK[level] - 2] + ' nodes available</option>';
    }
    select.value = modalState.parentId || '';
  }
  updateAddAutoFields();
}

function updateAddAutoFields() {
  const nodeIdInput = document.getElementById('add-node-id');
  const rankInput = document.getElementById('add-rank-id');
  if (nodeIdInput) nodeIdInput.value = nextNodeId(modalState.level, modalState.parentId) || '';
  if (rankInput) {
    const rank = nextRank(modalState.level, modalState.parentId);
    rankInput.value = rank == null ? '' : rank;
  }
}

function createNode() {
  if (!modalState || modalState.type !== 'add') return;
  const get = name => {
    const el = document.querySelector('[data-add-field="' + name + '"]');
    return el ? String(el.value || '').trim() : '';
  };
  const level = modalState.level;
  const name = get('name');
  if (!name) {
    toast('Name is required', 'error', 'Enter the L3 feature or L4 function name.');
    return;
  }
  const nodeId = get('nodeId');
  if (!nodeId) {
    toast('Node ID is required', 'error');
    return;
  }
  if (state.nodes.some(n => n.nodeId === nodeId)) {
    toast('Node ID already exists', 'error', nodeId + ' is already used by another node.');
    return;
  }
  const parentId = level === 'L1' ? null : (get('parentId') || modalState.parentId);
  if (level !== 'L1' && (!parentId || !INDEX.has(parentId))) {
    toast('Select a parent node', 'error', 'Create the parent level first.');
    return;
  }
  const rankInput = get('rankId');
  const rank = rankInput ? parseRankValue(rankInput) : nextRank(level, parentId);

  const node = normalizeNode({
    id: nodeId,
    nodeId: nodeId,
    rankId: rank,
    level: level,
    parentId: parentId,
    name: name,
    description: get('description'),
    dtOwner: get('dtOwner'),
    status: get('status') || 'Active',
    changeType: get('changeType') || '—',
    priority: get('priority') || '—',
    lockStatus: get('lockStatus') || '-',
    source: 'Manual',
    created: todayISO(),
    lastModified: todayISO()
  });

  state.nodes.push(node);
  reindex();
  logActivity('add', node, 'Created ' + level + ' node');
  saveState();
  modalState = null;
  renderModal();
  render();
  openDrawer(node.id);
  toast('Node created', '', node.nodeId + ' · ' + node.name);
}

function requestDelete(node) {
  if (hasChildren(node.id)) {
    toast('Cannot delete a parent node', 'warn', 'Remove its child nodes first.');
    return;
  }
  const childCount = descendantsOf(node.id).length;
  openConfirm({
    title: 'Delete ' + node.level + ' node?',
    message: (childCount ? childCount + ' descendant nodes will also be affected. ' : '') +
      '"' + (node.name || node.nodeId) + '" will be removed from the master list.',
    confirmLabel: 'Delete node',
    danger: true,
    onConfirm: () => {
      if (hasChildren(node.id)) return;
      const index = state.nodes.findIndex(n => n.id === node.id);
      if (index < 0) return;
      logActivity('delete', node, 'Deleted node');
      state.nodes.splice(index, 1);
      selection.delete(node.id);
      reindex();
      saveState();
      closeDrawer(true);
      render();
      toast('Node deleted', '', node.nodeId);
    }
  });
}

/* ---------------- Filters / reset ---------------- */
function clearAllFilters() {
  ui.search = '';
  Object.keys(ui.filters).forEach(key => { ui.filters[key] = ''; });
  ui.sort = { key: null, dir: 'asc' };
  const input = document.getElementById('global-search');
  if (input) input.value = '';
  render();
}

function requestReset() {
  openConfirm({
    title: 'Reset to sample data?',
    message: 'All local changes will be replaced by the original Excel extract. Export a backup first if you need to keep your work.',
    confirmLabel: 'Reset workspace',
    danger: true,
    onConfirm: () => {
      state = defaultState();
      reindex();
      selection.clear();
      saveState();
      closeDrawer(true);
      ui.search = '';
      Object.keys(ui.filters).forEach(key => { ui.filters[key] = ''; });
      ui.sort = { key: null, dir: 'asc' };
      const input = document.getElementById('global-search');
      if (input) input.value = '';
      setView('overview');
      toast('Sample data restored', '', state.nodes.length + ' nodes loaded');
    }
  });
}

function openConfirm(opts) {
  modalState = {
    type: 'confirm',
    title: opts.title || 'Confirm',
    message: opts.message || '',
    confirmLabel: opts.confirmLabel || 'Confirm',
    danger: !!opts.danger,
    onConfirm: opts.onConfirm
  };
  renderModal();
}

function confirmModal() {
  const fn = modalState && modalState.onConfirm;
  modalState = null;
  renderModal();
  if (typeof fn === 'function') fn();
}

function closeModal() {
  modalState = null;
  renderModal();
  if (!drawerState) document.body.classList.remove('no-scroll');
}

/* ---------------- Menus / keyboard ---------------- */
function closeMenus() {
  document.querySelectorAll('.menu-wrap.open').forEach(el => el.classList.remove('open'));
}

function handleKeydown(e) {
  if (e.key === 'Escape') {
    closeMenus();
    if (modalState) { closeModal(); return; }
    if (drawerState) { requestCloseDrawer(); return; }
    const input = document.getElementById('global-search');
    if (input && document.activeElement === input) {
      if (input.value) {
        input.value = '';
        ui.search = '';
        refreshMasterResults();
      }
      input.blur();
    }
    return;
  }
  const tag = (e.target.tagName || '').toLowerCase();
  const typing = tag === 'input' || tag === 'textarea' || tag === 'select';
  if (ui.focus && !modalState && !drawerState && !typing) {
    const k = e.key.toLowerCase();
    if (k === 'p') { e.preventDefault(); focusResult('Passed'); return; }
    if (k === 'n') { e.preventDefault(); focusResult('Need Revise'); return; }
    if (k === 'x') { e.preventDefault(); focusResult('Reject'); return; }
    if (k === 's') { e.preventDefault(); focusSkip(); return; }
  }
  if (e.key === '/' && !typing) {
    e.preventDefault();
    const input = document.getElementById('global-search');
    if (input) input.focus();
    return;
  }
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's' && drawerState) {
    e.preventDefault();
    if (draftDirty) saveDrawer();
  }
}

/* ---------------- Drag & drop on the review board ---------------- */
function handleDragStart(e) {
  const card = e.target.closest('.review-card');
  if (!card) return;
  boardDragId = card.dataset.id;
  card.classList.add('dragging');
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', boardDragId); } catch (err) { /* ignore */ }
  }
}

function handleDragEnd(e) {
  const card = e.target.closest('.review-card');
  if (card) card.classList.remove('dragging');
  document.querySelectorAll('.board-col.drag-over').forEach(col => col.classList.remove('drag-over'));
  boardDragId = null;
}

function handleDragOver(e) {
  const col = e.target.closest('.board-col');
  if (!col) return;
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
  col.classList.add('drag-over');
}

function handleDragLeave(e) {
  const col = e.target.closest('.board-col');
  if (!col) return;
  if (e.relatedTarget && col.contains(e.relatedTarget)) return;
  col.classList.remove('drag-over');
}

function handleDrop(e) {
  const col = e.target.closest('.board-col');
  if (!col) return;
  e.preventDefault();
  const id = boardDragId || (e.dataTransfer ? e.dataTransfer.getData('text/plain') : '');
  const status = col.dataset.dropStatus;
  const node = INDEX.get(id);
  col.classList.remove('drag-over');
  boardDragId = null;
  if (!node || !status) return;
  if (!applyResultToNode(node, status)) {
    toast('Only L3/L4 nodes can be evaluated', 'warn');
    return;
  }
  logActivity('review', node, node.evaluationResult ? 'Evaluation set to ' + node.evaluationResult : 'Evaluation cleared');
  saveState();
  render();
  toast(node.name, '', node.evaluationResult ? 'Marked ' + node.evaluationResult : 'Evaluation cleared');
}

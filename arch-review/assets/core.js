/* Architecture Review Console — core data, state, helpers */
'use strict';

const STORAGE_KEY = 'archReview.workspace.v1';
const LEVELS = ['L1', 'L2', 'L3', 'L4'];
const LEVEL_RANK = { L1: 1, L2: 2, L3: 3, L4: 4 };
const REVIEW_STATES = ['Passed', 'Need Revise', 'Reject'];

const OPTIONS = {
  level: LEVELS,
  status: ['Active', 'Draft', 'Deprecated'],
  changeType: ['—', 'New', 'Modify', 'Deprecated'],
  priority: ['P0 – Critical', 'P1 – High', 'P2 – Medium', 'P3 – Low', '—'],
  lockStatus: ['EXCLUSIVE', 'SHARED', 'LOCKED', 'RETIRED', 'NEW', '-'],
  evaluationResult: REVIEW_STATES,
  experienceLevel: ['High', 'Mid', 'Low', '—']
};

const GROUP_META = {
  identification: 'IDENTIFICATION',
  governance: 'GOVERNANCE',
  shared: 'SHARED / LOCK',
  audit: 'AUDIT'
};

const COLUMNS = [
  { key: 'rankId', label: 'RankID', group: 'identification', width: 102 },
  { key: 'nodeId', label: 'Node ID', group: 'identification', width: 176 },
  { key: 'level', label: 'Level', group: 'identification', width: 62 },
  { key: 'l1', label: 'L1 Application', group: 'identification', width: 104 },
  { key: 'l2', label: 'L2 Application', group: 'identification', width: 132 },
  { key: 'l3', label: 'L3 Feature / Module', group: 'identification', width: 208 },
  { key: 'l4', label: 'L4 Function Name', group: 'identification', width: 220 },
  { key: 'description', label: 'Description', group: 'identification', width: 248 },
  { key: 'cfcRelated', label: 'CFC Related', group: 'identification', width: 78 },
  { key: 'ownerBizTeam', label: 'Owner Biz Team', group: 'identification', width: 112 },
  { key: 'dtOwner', label: 'DT Owner', group: 'identification', width: 112 },
  { key: 'shadowOwner', label: 'Shadow Owner', group: 'identification', width: 108 },
  { key: 'experienceLevel', label: 'Experience Level', group: 'identification', width: 94 },
  { key: 'techStack', label: 'Tech Stack', group: 'identification', width: 108 },
  { key: 'prdLink', label: 'PRD Link (L3)', group: 'identification', width: 180 },
  { key: 'itOwner', label: 'IT Owner', group: 'identification', width: 104 },
  { key: 'fsLink', label: 'FS Link (L4)', group: 'identification', width: 170 },
  { key: 'status', label: 'Status', group: 'governance', width: 86 },
  { key: 'changeType', label: 'Change Type', group: 'governance', width: 92 },
  { key: 'priority', label: 'Priority', group: 'governance', width: 106 },
  { key: 'sharedAcross', label: 'Shared Across (Projects)', group: 'shared', width: 140 },
  { key: 'lockStatus', label: 'Lock Status', group: 'shared', width: 104 },
  { key: 'evaluationResult', label: 'Evaluation Results', group: 'audit', width: 116 },
  { key: 'aiScore', label: 'AI Self Evaluation Score', group: 'audit', width: 108 },
  { key: 'created', label: 'Created', group: 'audit', width: 102 },
  { key: 'lastModified', label: 'Last Modified', group: 'audit', width: 102 },
  { key: 'reviewDate', label: 'Review Date', group: 'audit', width: 102 },
  { key: 'reviewer', label: 'Reviewer', group: 'audit', width: 108 },
  { key: 'notes', label: 'Notes', group: 'audit', width: 200 },
  { key: 'source', label: 'Source', group: 'audit', width: 108 }
];

const DEFAULT_COLUMNS = [
  'rankId', 'nodeId', 'level', 'l1', 'l2', 'l3', 'l4', 'description',
  'dtOwner', 'status', 'priority', 'lockStatus', 'evaluationResult',
  'aiScore', 'reviewDate'
];

const EXPORT_HEADERS = [
  'RankID', 'Node ID', 'Level', 'L1 Application', 'L2 Application',
  'L3 Feature/module', 'L4 Function Name', 'Description', 'CFC Related',
  'Owner Biz Team', 'DT Owner', 'Shadow Owner', 'Experience Level', 'Tech Stack',
  'PRD Link (L3)', 'IT Owner', 'FS Link(L4)', 'Status', 'Change Type', 'Priority',
  'Shared Across (Projects)', 'Lock Status', 'Evaluation Results',
  'AI Self Evaluation Score', 'Reviewer', 'Created', 'Last Modified', 'Review Date',
  'Notes', 'Source'
];

const USER = { name: 'Architecture Review Board' };

const ui = {
  view: 'overview',
  search: '',
  filters: {
    level: '', status: '', evaluation: '', priority: '', l1: '', l2: '',
    source: '', lockStatus: '', changeType: ''
  },
  sort: { key: null, dir: 'asc' },
  queueLevel: 'all',
  advanced: false
};

let state = null;
let INDEX = new Map();
let selection = new Set();
let drawerState = null;
let modalState = null;
let draft = null;
let draftDirty = false;
let boardDragId = null;

/* ---------------- Basic helpers ---------------- */
function uid() {
  return 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function icon(name, cls) {
  return '<svg class="icon ' + (cls || '') + '" aria-hidden="true"><use href="#i-' + name + '"></use></svg>';
}

function deepCopy(value) {
  return JSON.parse(JSON.stringify(value));
}

function todayISO() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

function normalizeNode(raw) {
  const n = Object.assign({}, raw);
  n.id = n.id || n.nodeId || uid();
  n.nodeId = String(n.nodeId || '').trim();
  n.level = String(n.level || '').trim().toUpperCase();
  if (!LEVELS.includes(n.level)) n.level = 'L4';
  n.name = String(n.name || '').trim();
  if (n.evaluationResult) n.evaluationResult = String(n.evaluationResult).trim();
  if (!REVIEW_STATES.includes(n.evaluationResult)) n.evaluationResult = '';
  if (n.aiScore === 0) n.aiScore = 0;
  else if (n.aiScore === '' || n.aiScore == null || isNaN(Number(n.aiScore))) n.aiScore = '';
  else n.aiScore = Math.max(0, Math.min(100, Math.round(Number(n.aiScore))));
  ['description', 'cfcRelated', 'ownerBizTeam', 'dtOwner', 'shadowOwner', 'experienceLevel',
    'techStack', 'prdLink', 'itOwner', 'fsLink', 'status', 'changeType', 'priority',
    'sharedAcross', 'lockStatus', 'created', 'lastModified', 'reviewDate', 'notes',
    'reviewer', 'source'].forEach(k => { n[k] = n[k] == null ? '' : String(n[k]); });
  if (!n.status) n.status = 'Active';
  if (!n.changeType) n.changeType = '—';
  if (!n.priority) n.priority = '—';
  if (!n.lockStatus) n.lockStatus = '-';
  const rank = Number(n.rankId);
  n.rankId = isFinite(rank) && rank > 0 ? rank : null;
  n.parentId = n.parentId || null;
  return n;
}

function defaultState() {
  const seed = deepCopy(window.SEED_DATA || { nodes: [], activity: [] });
  return {
    version: 1,
    nodes: seed.nodes.map(normalizeNode),
    activity: (seed.activity || []).map(a => Object.assign({ actor: USER.name }, a)),
    settings: {
      visibleColumns: DEFAULT_COLUMNS.slice(),
      collapsed: []
    }
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.nodes) || !parsed.nodes.length) return null;
    parsed.nodes = parsed.nodes.map(normalizeNode);
    parsed.activity = Array.isArray(parsed.activity) ? parsed.activity : [];
    parsed.settings = parsed.settings || {};
    parsed.settings.visibleColumns = Array.isArray(parsed.settings.visibleColumns) && parsed.settings.visibleColumns.length
      ? parsed.settings.visibleColumns.filter(k => COLUMNS.some(c => c.key === k))
      : DEFAULT_COLUMNS.slice();
    parsed.settings.collapsed = Array.isArray(parsed.settings.collapsed) ? parsed.settings.collapsed : [];
    return parsed;
  } catch (err) {
    return null;
  }
}

function setSaveState(text, isError) {
  const el = document.getElementById('save-state');
  if (!el) return;
  el.textContent = text;
  el.style.color = isError ? '#fca5a5' : '';
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: 1,
      nodes: state.nodes,
      activity: state.activity,
      settings: state.settings
    }));
    const t = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setSaveState('Saved · ' + t);
  } catch (err) {
    setSaveState('Storage unavailable', true);
  }
}

function reindex() {
  INDEX = new Map();
  state.nodes.forEach(n => INDEX.set(n.id, n));
  state.nodes.forEach(n => {
    if (n.parentId && !INDEX.has(n.parentId)) n.parentId = null;
  });
}

function parentOf(n) {
  return n && n.parentId ? INDEX.get(n.parentId) || null : null;
}

function chain(n) {
  const out = [];
  const seen = new Set();
  let cur = n;
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    out.unshift(cur);
    cur = parentOf(cur);
  }
  return out;
}

function nameAtLevel(n, level) {
  const found = chain(n).find(x => x.level === level);
  return found ? found.name : '';
}

function childrenOf(id) {
  return state.nodes.filter(n => n.parentId === id).sort(sortByRank);
}

function hasChildren(id) {
  return state.nodes.some(n => n.parentId === id);
}

function descendantsOf(id) {
  const out = [];
  const walk = pid => {
    state.nodes.filter(n => n.parentId === pid).forEach(n => {
      out.push(n);
      walk(n.id);
    });
  };
  walk(id);
  return out;
}

function sortByRank(a, b) {
  const ra = a.rankId == null ? Number.MAX_SAFE_INTEGER : a.rankId;
  const rb = b.rankId == null ? Number.MAX_SAFE_INTEGER : b.rankId;
  return ra - rb || a.nodeId.localeCompare(b.nodeId);
}

function reviewStatus(n) {
  return REVIEW_STATES.includes(n.evaluationResult) ? n.evaluationResult : 'Pending';
}

function canReview(n) {
  return n.level === 'L3' || n.level === 'L4';
}

function scopeNodes() {
  return state.nodes.filter(canReview);
}

function reviewStats() {
  const scope = scopeNodes();
  const reviewed = scope.filter(n => n.evaluationResult);
  const passed = reviewed.filter(n => n.evaluationResult === 'Passed').length;
  const revise = reviewed.filter(n => n.evaluationResult === 'Need Revise').length;
  const reject = reviewed.filter(n => n.evaluationResult === 'Reject').length;
  const scored = reviewed.filter(n => n.aiScore !== '' && !isNaN(Number(n.aiScore)));
  const avgScore = scored.length
    ? Math.round(scored.reduce((s, n) => s + Number(n.aiScore), 0) / scored.length)
    : null;
  return {
    total: scope.length,
    reviewed: reviewed.length,
    pending: scope.length - reviewed.length,
    passed: passed,
    revise: revise,
    reject: reject,
    attention: revise + reject,
    coverage: scope.length ? Math.round((reviewed.length / scope.length) * 100) : 0,
    passRate: reviewed.length ? Math.round((passed / reviewed.length) * 100) : 0,
    avgScore: avgScore
  };
}

function logActivity(type, node, detail) {
  state.activity.unshift({
    id: uid(),
    type: type,
    ts: new Date().toISOString(),
    nodeId: node ? node.nodeId : '—',
    nodeName: node ? node.name : 'Workspace',
    detail: detail || '',
    actor: USER.name
  });
  if (state.activity.length > 300) state.activity.length = 300;
}

/* ---------------- Formatting ---------------- */
function fmtDate(value) {
  if (!value) return '—';
  const raw = String(value);
  const d = new Date(raw.length === 10 ? raw + 'T00:00:00' : raw);
  if (isNaN(d.getTime())) return raw;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' · ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function relTime(value) {
  const d = new Date(value);
  if (isNaN(d.getTime())) return fmtDateTime(value);
  const diff = Date.now() - d.getTime();
  const mins = Math.round(diff / 60000);
  if (mins >= 0 && mins < 1) return 'Just now';
  if (mins >= 1 && mins < 60) return mins + ' min ago';
  const hours = Math.round(mins / 60);
  if (hours >= 1 && hours < 24) return hours + 'h ago';
  const days = Math.round(hours / 24);
  if (days >= 1 && days < 7) return days + 'd ago';
  return fmtDate(String(value).slice(0, 10));
}

function initials(name) {
  if (!name) return '—';
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '—';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

function avatar(name, cls) {
  return '<span class="avatar ' + (cls || '') + '" title="' + esc(name) + '">' + esc(initials(name)) + '</span>';
}

function toast(message, type, detail) {
  const root = document.getElementById('toast-root');
  if (!root) return;
  const el = document.createElement('div');
  el.className = 'toast ' + (type || '');
  const ico = type === 'error' ? 'alert' : type === 'warn' ? 'info' : 'check-circle';
  el.innerHTML = icon(ico) + '<div><strong>' + esc(message) + '</strong>' +
    (detail ? '<small>' + esc(detail) + '</small>' : '') + '</div>';
  root.appendChild(el);
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 200);
  }, 3600);
  while (root.children.length > 3) root.firstElementChild.remove();
}

function setView(view) {
  ui.view = view;
  if (location.hash !== '#/' + view) history.replaceState(null, '', '#/' + view);
  render();
  const main = document.querySelector('.content');
  if (main) main.scrollTop = 0;
}

/* ---------------- Filtering ---------------- */
function hasActiveFilters() {
  return Object.keys(ui.filters).some(k => ui.filters[k]) || !!ui.search.trim();
}

function searchText(n) {
  return [
    n.nodeId, n.rankId, n.name, n.description, n.dtOwner, n.ownerBizTeam, n.itOwner,
    n.shadowOwner, n.techStack, n.prdLink, n.fsLink, n.notes, n.reviewer,
    nameAtLevel(n, 'L1'), nameAtLevel(n, 'L2'), nameAtLevel(n, 'L3'), nameAtLevel(n, 'L4')
  ].join(' ').toLowerCase();
}

function matchesFilters(n) {
  const f = ui.filters;
  if (f.level && n.level !== f.level) return false;
  if (f.status && n.status !== f.status) return false;
  if (f.evaluation && reviewStatus(n) !== f.evaluation) return false;
  if (f.priority && n.priority !== f.priority) return false;
  if (f.l1 && nameAtLevel(n, 'L1') !== f.l1) return false;
  if (f.l2 && nameAtLevel(n, 'L2') !== f.l2) return false;
  if (f.source && n.source !== f.source) return false;
  if (f.lockStatus && n.lockStatus !== f.lockStatus) return false;
  if (f.changeType && n.changeType !== f.changeType) return false;
  const q = ui.search.trim().toLowerCase();
  if (q && !searchText(n).includes(q)) return false;
  return true;
}

function filteredNodes() {
  return state.nodes.filter(matchesFilters);
}

function compareNodes(a, b) {
  const key = ui.sort.key;
  const dir = ui.sort.dir === 'desc' ? -1 : 1;
  if (!key) return sortByRank(a, b);
  let av;
  let bv;
  if (key === 'l1' || key === 'l2' || key === 'l3' || key === 'l4') {
    const lvl = key.toUpperCase();
    av = nameAtLevel(a, lvl) || '';
    bv = nameAtLevel(b, lvl) || '';
  } else {
    av = a[key];
    bv = b[key];
  }
  if (key === 'level') { av = LEVEL_RANK[a.level]; bv = LEVEL_RANK[b.level]; }
  if (key === 'evaluationResult') {
    const order = { Pending: 0, 'Need Revise': 1, Reject: 2, Passed: 3 };
    av = order[reviewStatus(a)];
    bv = order[reviewStatus(b)];
  }
  if (key === 'rankId' || key === 'aiScore') {
    av = av === '' || av == null ? -1 : Number(av);
    bv = bv === '' || bv == null ? -1 : Number(bv);
    return (av - bv) * dir;
  }
  av = av == null ? '' : String(av);
  bv = bv == null ? '' : String(bv);
  return av.localeCompare(bv, undefined, { numeric: true }) * dir;
}

function displayRows() {
  const matches = filteredNodes();
  if (ui.sort.key) {
    return matches.sort(compareNodes).map(n => ({ node: n, depth: 0 }));
  }
  if (hasActiveFilters()) {
    return matches.sort(sortByRank).map(n => ({ node: n, depth: 0 }));
  }
  const collapsed = new Set(state.settings.collapsed);
  const out = [];
  const seen = new Set();
  const walk = (n, depth) => {
    if (seen.has(n.id)) return;
    seen.add(n.id);
    out.push({ node: n, depth: depth });
    if (!collapsed.has(n.id)) childrenOf(n.id).forEach(c => walk(c, depth + 1));
  };
  state.nodes.filter(n => !n.parentId).sort(sortByRank).forEach(n => walk(n, 0));
  state.nodes.filter(n => !seen.has(n.id)).sort(sortByRank).forEach(n => walk(n, 0));
  return out;
}

/* ---------------- Identifiers ---------------- */
function nextNodeId(level, parentId) {
  if (level === 'L1') {
    let i = state.nodes.filter(n => n.level === 'L1').length + 1;
    let id = 'APP-' + i;
    while (INDEX.has(id)) { i += 1; id = 'APP-' + i; }
    return id;
  }
  const p = INDEX.get(parentId);
  if (!p) return '';
  let max = 0;
  childrenOf(parentId).forEach(c => {
    const tail = c.nodeId.split('-').pop();
    const num = parseInt(tail, 10);
    if (!isNaN(num)) max = Math.max(max, num);
  });
  let i = max + 1;
  let id = p.nodeId + '-' + i;
  while (INDEX.has(id)) { i += 1; id = p.nodeId + '-' + i; }
  return id;
}

function nextRank(level, parentId) {
  const step = { L2: 1000000, L3: 1000, L4: 1 }[level];
  if (level === 'L1') {
    const ranks = state.nodes.filter(n => n.level === 'L1' && n.rankId).map(n => n.rankId);
    return ranks.length ? Math.max.apply(null, ranks) + 1000000000 : 1000000000;
  }
  const p = INDEX.get(parentId);
  if (!p) return null;
  const siblingRanks = childrenOf(parentId).map(n => n.rankId).filter(r => r != null);
  let base = siblingRanks.length ? Math.max.apply(null, siblingRanks) : (p.rankId || 0);
  if (!base) {
    const ranks = state.nodes.filter(n => n.level === level && n.rankId).map(n => n.rankId);
    base = ranks.length ? Math.max.apply(null, ranks) : 1000000000;
  }
  const used = new Set(state.nodes.map(n => n.rankId).filter(r => r != null));
  let rank = base + step;
  while (used.has(rank)) rank += step;
  return rank;
}

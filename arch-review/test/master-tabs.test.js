/* unit tests for Master List org-group tab filtering
 * run with:  node --test test/master-tabs.test.js
 *
 * Tests the tab-filter path introduced in assets/core.js:
 *   - normalizeNode derives .group from nodeId prefix when absent
 *   - matchesFilters applies ui.masterTab as a hard filter
 *   - displayRows builds the tree walk from matches (not all state.nodes)
 *   - hasActiveFilters reports ui.masterTab != 'all'
 *   - combination of tab + other filters narrows further
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

/* ---------------- sandbox core.js ---------------- */

function loadCore() {
  const coreSrc = fs.readFileSync(
    path.join(__dirname, '..', 'assets', 'core.js'), 'utf8');

  const sandbox = {
    console,
    Math, JSON, Date, Set, Map, Array, Object, String, Number, Boolean,
    Error, parseFloat, parseInt, NaN, isNaN, isFinite, undefined,
    window: { SEED_DATA: null },
    localStorage: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {}
    },
    document: {
      getElementById: () => null,
      createElement: () => ({ classList: { add() {}, remove() {} }, style: {} }),
      querySelector: () => null,
      body: { classList: { add() {}, remove() {} } }
    },
    history: { replaceState() {} }
  };
  sandbox.global = sandbox;
  vm.createContext(sandbox);
  // Run core.js in context, then copy top-level bindings onto globalThis so
  // tests can access them.  The internal `let state = null;` and `let ui = {...}`
  // bindings stay inside the context; we mutate them via runInContext when
  // seeding test data.
  vm.runInContext(coreSrc, sandbox);
  // Build the "export" object by reading every const/let we need via eval.
  const keys = [
    'LEVELS', 'LEVEL_RANK', 'REVIEW_STATES', 'OPTIONS', 'MEETING', 'GROUPS',
    'COLUMNS', 'DEFAULT_COLUMNS', 'EXPORT_HEADERS', 'USER', 'STORAGE_KEY',
    'normalizeNode', 'reindex', 'matchesFilters', 'filteredNodes',
    'hasActiveFilters', 'displayRows', 'nameAtLevel', 'childrenOf', 'sortByRank',
    'reviewStatus', 'effectivePrdLink', 'effectiveFsLink'
  ];
  const exports = {};
  keys.forEach(k => {
    try {
      exports[k] = vm.runInContext(k, sandbox);
    } catch (_) { /* skip if not present */ }
  });
  // The null placeholders `state` and `ui` are captured as closures — set them
  // explicitly via runInContext with values placed on the context first.
  sandbox.__setValue = function(name, value) {
    sandbox.__payload = value;
    vm.runInContext(name + ' = __payload', sandbox);
  };
  sandbox.__getValue = function(name) {
    return vm.runInContext(name, sandbox);
  };
  return {
    _ctx: sandbox,
    get state() { return sandbox.__getValue('state'); },
    set state(v) { sandbox.__setValue('state', v); },
    get ui() { return sandbox.__getValue('ui'); },
    set ui(v) { sandbox.__setValue('ui', v); },
    get INDEX() { return sandbox.__getValue('INDEX'); },
    ...exports
  };
}

const G = loadCore();

/* ---------------- helpers ---------------- */

function mkNode(p) {
  const base = {
    nodeId: 'X', level: 'L4', name: 'x',
    rankId: 999, status: 'Active', changeType: '—', priority: '—',
    lockStatus: '-'
  };
  const merged = Object.assign({}, base, p);
  // ensure a stable id
  merged.id = merged.id || merged.nodeId;
  return G.normalizeNode(merged);
}

function setupState(nodes) {
  // state and INDEX are `let`, ui is `const` — mutate ui's properties in place.
  const stateObj = {
    version: 3,
    nodes: nodes.slice(),
    activity: [],
    meetings: [],
    settings: { visibleColumns: G.DEFAULT_COLUMNS.slice(), collapsed: [] }
  };
  G.state = stateObj;
  const ui = G.ui;
  ui.view = 'master';
  ui.search = '';
  ui.filters = {
    level: '', status: '', evaluation: '', priority: '',
    l1: '', l2: '', source: '', lockStatus: '', changeType: ''
  };
  ui.sort = { key: null, dir: 'asc' };
  ui.queueLevel = 'all';
  ui.advanced = false;
  ui.focus = null;
  ui.meetingFilter = 'upcoming';
  ui.masterTab = 'all';
  G.reindex();
}

/* build a realistic two-group hierarchy */
function buildTwoGroupHierarchy() {
  /* ISG branch:
     ISG-PLN (L1)
       ISG-PLN-DP (L2)
         ISG-PLN-DP-1 (L3)
           ISG-PLN-DP-1-1 .. -1-4 (L4)
     PCG branch:
     PCG-PLN (L1)
       PCG-PLN-OPLN (L2)
         PCG-PLN-OPLN-1 (L3)
           PCG-PLN-OPLN-1-1 .. -1-3 (L4)
  */
  const nodes = [];
  const ISG = (nodeId, level, name, parentId, rankId) =>
    nodes.push(mkNode({ nodeId, level, name, parentId, rankId }));
  const PCG = (nodeId, level, name, parentId, rankId) =>
    nodes.push(mkNode({ nodeId, level, name, parentId, rankId }));

  ISG('ISG-PLN', 'L1', 'ISG Planning', null, 1000000000);
  ISG('ISG-PLN-DP', 'L2', 'ISG Demand Planning', 'ISG-PLN', 1001000000);
  ISG('ISG-PLN-DP-1', 'L3', 'ISG Forecast Hierarchy', 'ISG-PLN-DP', 1001001000);
  ISG('ISG-PLN-DP-1-1', 'L4', 'ISG Geo', 'ISG-PLN-DP-1', 1001001001);
  ISG('ISG-PLN-DP-1-2', 'L4', 'ISG Product', 'ISG-PLN-DP-1', 1001001002);
  ISG('ISG-PLN-DP-1-3', 'L4', 'ISG Time', 'ISG-PLN-DP-1', 1001001003);

  PCG('PCG-PLN', 'L1', 'PCG Planning', null, 2000000000);
  PCG('PCG-PLN-OPLN', 'L2', 'PCG ONE Plan', 'PCG-PLN', 2001000000);
  PCG('PCG-PLN-OPLN-1', 'L3', 'PCG Demand Scope', 'PCG-PLN-OPLN', 2001001000);
  PCG('PCG-PLN-OPLN-1-1', 'L4', 'PCG Sourcing', 'PCG-PLN-OPLN-1', 2001001001);
  PCG('PCG-PLN-OPLN-1-2', 'L4', 'PCG Ordering', 'PCG-PLN-OPLN-1', 2001001002);
  PCG('PCG-PLN-OPLN-1-3', 'L4', 'PCG Scheduling', 'PCG-PLN-OPLN-1', 2001001003);

  return nodes;
}

/* ---------------- tests ---------------- */

test('normalizeNode derives group from nodeId prefix', () => {
  const n1 = G.normalizeNode({ nodeId: 'ISG-PLN-DP-1', level: 'L3', name: 'x' });
  assert.equal(n1.group, 'ISG', 'ISG prefix');

  const n2 = G.normalizeNode({ nodeId: 'PCG-PLN', level: 'L1', name: 'y' });
  assert.equal(n2.group, 'PCG', 'PCG prefix');

  const n3 = G.normalizeNode({ nodeId: 'MBG-ABC-1', level: 'L3', name: 'z' });
  assert.equal(n3.group, 'MBG', 'MBG prefix');

  const n4 = G.normalizeNode({ nodeId: 'NEC-FOO', level: 'L2', name: 'w' });
  assert.equal(n4.group, 'NEC', 'NEC prefix');
});

test('normalizeNode honors explicit group over prefix', () => {
  const n = G.normalizeNode({ nodeId: 'ISG-PLN', level: 'L1', name: 'x', group: 'PCG' });
  assert.equal(n.group, 'PCG', 'explicit group wins');
});

test('normalizeNode leaves empty group for unknown prefix', () => {
  const n = G.normalizeNode({ nodeId: 'XTZ-FOO', level: 'L1', name: 'x' });
  assert.equal(n.group, '', 'unknown prefix stays empty string');
});

test('matchesFilters excludes nodes outside the active masterTab', () => {
  const nodes = buildTwoGroupHierarchy();
  setupState(nodes);

  G.ui.masterTab = 'ISG';
  const filtered = nodes.filter(G.matchesFilters);
  const groups = new Set(filtered.map(n => n.group));
  assert.equal(groups.size, 1);
  assert.equal(groups.has('ISG'), true);
  assert.equal(groups.has('PCG'), false);
});

test('matchesFilters with masterTab=all keeps every node', () => {
  const nodes = buildTwoGroupHierarchy();
  setupState(nodes);

  G.ui.masterTab = 'all';
  const filtered = nodes.filter(G.matchesFilters);
  assert.equal(filtered.length, nodes.length);
});

test('matchesFilters handles empty tab (backwards compat)', () => {
  const nodes = buildTwoGroupHierarchy();
  setupState(nodes);

  G.ui.masterTab = '';
  const filtered = nodes.filter(G.matchesFilters);
  assert.equal(filtered.length, nodes.length);
});

test('matchesFilters narrows when tab + Level filter combined', () => {
  const nodes = buildTwoGroupHierarchy();
  setupState(nodes);

  G.ui.masterTab = 'ISG';
  G.ui.filters.level = 'L4';
  const filtered = nodes.filter(G.matchesFilters);
  assert.ok(filtered.every(n => n.group === 'ISG' && n.level === 'L4'));
  assert.equal(filtered.length, 3); // ISG Geo/Product/Time
});

test('matchesFilters narrows when tab + search combined', () => {
  const nodes = buildTwoGroupHierarchy();
  setupState(nodes);

  G.ui.masterTab = 'PCG';
  G.ui.search = 'Sourcing';
  const filtered = nodes.filter(G.matchesFilters);
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].name, 'PCG Sourcing');
  assert.equal(filtered[0].group, 'PCG');
});

test('displayRows for ISG tab returns the full ISG hierarchy only', () => {
  const nodes = buildTwoGroupHierarchy();
  setupState(nodes);

  G.ui.masterTab = 'ISG';
  const rows = G.displayRows();
  const ids = rows.map(r => r.node.id);
  assert.equal(rows.length, 6); // ISG L1 + L2 + L3 + 3 L4 = 6

  // no PCG ids leaked
  assert.ok(!ids.includes('PCG-PLN'), 'no PCG root');
  assert.ok(!ids.includes('PCG-PLN-OPLN-1'), 'no PCG L3');

  // hierarchy intact via depth
  const depthById = Object.fromEntries(rows.map(r => [r.node.id, r.depth]));
  assert.equal(depthById['ISG-PLN'], 0);
  assert.equal(depthById['ISG-PLN-DP'], 1);
  assert.equal(depthById['ISG-PLN-DP-1'], 2);
  assert.equal(depthById['ISG-PLN-DP-1-1'], 3);
  assert.equal(depthById['ISG-PLN-DP-1-2'], 3);
});

test('displayRows for PCG tab returns the full PCG hierarchy only', () => {
  const nodes = buildTwoGroupHierarchy();
  setupState(nodes);

  G.ui.masterTab = 'PCG';
  const rows = G.displayRows();
  assert.equal(rows.length, 6); // PCG L1 + L2 + L3 + 3 L4

  const ids = rows.map(r => r.node.id);
  assert.ok(!ids.includes('ISG-PLN'), 'no ISG root');
  assert.ok(!ids.includes('ISG-PLN-DP-1'), 'no ISG L3');

  const depthById = Object.fromEntries(rows.map(r => [r.node.id, r.depth]));
  assert.equal(depthById['PCG-PLN'], 0);
  assert.equal(depthById['PCG-PLN-OPLN'], 1);
  assert.equal(depthById['PCG-PLN-OPLN-1'], 2);
  assert.equal(depthById['PCG-PLN-OPLN-1-1'], 3);
});

test('displayRows returns empty array when tab has zero nodes', () => {
  const nodes = buildTwoGroupHierarchy();
  setupState(nodes);

  G.ui.masterTab = 'MBG';
  const rows = G.displayRows();
  assert.equal(rows.length, 0);
});

test('displayRows with tab + collapsed state hides children', () => {
  const nodes = buildTwoGroupHierarchy();
  setupState(nodes);
  G.state.settings.collapsed = ['ISG-PLN-DP'];

  G.ui.masterTab = 'ISG';
  const rows = G.displayRows();
  const ids = rows.map(r => r.node.id);
  // collapsed L2's children (L3 + L4) must not appear
  assert.ok(!ids.includes('ISG-PLN-DP-1'), 'collapsed L3 hidden');
  assert.ok(!ids.includes('ISG-PLN-DP-1-1'), 'collapsed L4 hidden');
  // but ISG root still shows
  assert.ok(ids.includes('ISG-PLN'));
  assert.ok(ids.includes('ISG-PLN-DP'));
});

test('displayRows with tab + sort produces flat sorted rows', () => {
  const nodes = buildTwoGroupHierarchy();
  setupState(nodes);

  G.ui.masterTab = 'ISG';
  G.ui.sort.key = 'name';
  G.ui.sort.dir = 'asc';
  const rows = G.displayRows();
  // with a sort key every row has depth 0
  assert.ok(rows.every(r => r.depth === 0));
  const names = rows.map(r => r.node.name);
  const sorted = names.slice().sort((a, b) => a.localeCompare(b));
  assert.deepEqual(names, sorted);
});

test('hasActiveFilters is true when masterTab != all', () => {
  const nodes = buildTwoGroupHierarchy();
  setupState(nodes);

  G.ui.masterTab = 'all';
  assert.equal(G.hasActiveFilters(), false, 'all means no tab filter');

  G.ui.masterTab = 'ISG';
  assert.equal(G.hasActiveFilters(), true);

  G.ui.masterTab = 'PCG';
  assert.equal(G.hasActiveFilters(), true);
});

test('hasActiveFilters counts combo: tab + level + search', () => {
  const nodes = buildTwoGroupHierarchy();
  setupState(nodes);

  G.ui.masterTab = 'ISG';
  G.ui.filters.level = 'L3';
  G.ui.search = 'forecast';
  assert.equal(G.hasActiveFilters(), true);
});

test('filteredNodes = matches applied to state.nodes (smoke)', () => {
  const nodes = buildTwoGroupHierarchy();
  setupState(nodes);

  G.ui.masterTab = 'ISG';
  const filtered = G.filteredNodes();
  assert.equal(filtered.length, 6);
  assert.ok(filtered.every(n => n.group === 'ISG'));

  G.ui.masterTab = 'PCG';
  assert.equal(G.filteredNodes().length, 6);

  G.ui.masterTab = 'all';
  assert.equal(G.filteredNodes().length, 12);
});

test('nameAtLevel works across a truncated ISG branch', () => {
  const nodes = buildTwoGroupHierarchy();
  setupState(nodes);

  const leaf = G.INDEX.get('ISG-PLN-DP-1-1'); // ISG Geo
  assert.equal(G.nameAtLevel(leaf, 'L1'), 'ISG Planning');
  assert.equal(G.nameAtLevel(leaf, 'L2'), 'ISG Demand Planning');
  assert.equal(G.nameAtLevel(leaf, 'L3'), 'ISG Forecast Hierarchy');
  assert.equal(G.nameAtLevel(leaf, 'L4'), 'ISG Geo');
});

test('effectivePrdLink returns own value when present', () => {
  const nodes = buildTwoGroupHierarchy();
  // add PRD directly on L3
  nodes.find(n => n.nodeId === 'ISG-PLN-DP-1').prdLink = 'https://prd/L3';
  setupState(nodes);
  const l3 = G.INDEX.get('ISG-PLN-DP-1');
  assert.equal(G.effectivePrdLink(l3), 'https://prd/L3');
});

test('effectivePrdLink falls back to parent L3 of the same group', () => {
  const nodes = buildTwoGroupHierarchy();
  nodes.find(n => n.nodeId === 'ISG-PLN-DP-1').prdLink = 'https://prd/L3-hierarchy';
  setupState(nodes);
  const leaf = G.INDEX.get('ISG-PLN-DP-1-1'); // ISG Geo, has no prdLink itself
  assert.equal(G.effectivePrdLink(leaf), 'https://prd/L3-hierarchy', 'L4 inherits L3 prdLink');
});

test('effectivePrdLink returns empty when no ancestor L3 has it', () => {
  const nodes = buildTwoGroupHierarchy();
  setupState(nodes);
  // ISG root L1 and L2 have no prdLink, nor L4 leaf
  const leaf = G.INDEX.get('ISG-PLN-DP-1-1');
  assert.equal(G.effectivePrdLink(leaf), '');
});

test('effectivePrdLink prefers own PRD even when ancestor L3 also has one', () => {
  const nodes = buildTwoGroupHierarchy();
  nodes.find(n => n.nodeId === 'ISG-PLN-DP-1').prdLink = 'https://prd/L3';
  nodes.find(n => n.nodeId === 'ISG-PLN-DP-1-1').prdLink = 'https://prd/L4-override';
  setupState(nodes);
  const leaf = G.INDEX.get('ISG-PLN-DP-1-1');
  assert.equal(G.effectivePrdLink(leaf), 'https://prd/L4-override');
});

test('effectiveFsLink walks up ancestors when child has none', () => {
  const nodes = buildTwoGroupHierarchy();
  nodes.find(n => n.nodeId === 'ISG-PLN-DP').fsLink = 'https://fs/L2';
  setupState(nodes);
  const leaf = G.INDEX.get('ISG-PLN-DP-1-1');
  assert.equal(G.effectiveFsLink(leaf), 'https://fs/L2');
});

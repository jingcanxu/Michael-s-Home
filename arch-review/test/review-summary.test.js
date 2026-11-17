/* unit tests for the Review Summary export rollup
 * run with:  node --test test/review-summary.test.js
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadApp() {
  const root = path.join(__dirname, '..', 'assets');
  const core = fs.readFileSync(path.join(root, 'core.js'), 'utf8');
  const io = fs.readFileSync(path.join(root, 'io.js'), 'utf8');

  const sandbox = {
    console, Math, JSON, Date, Set, Map, Array, Object, String, Number, Boolean,
    Error, parseFloat, parseInt, NaN, isNaN, isFinite, undefined, URL,
    window: { SEED_DATA: null },
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    document: {
      getElementById: () => null,
      createElement: () => ({ classList: { add() {}, remove() {} }, style: {}, click() {}, remove() {} }),
      querySelector: () => null,
      body: { classList: { add() {}, remove() {} }, appendChild() {}, removeChild() {} }
    },
    history: { replaceState() {} }
  };
  sandbox.global = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(core, sandbox);
  vm.runInContext(io, sandbox);
  sandbox.__setValue = function (name, value) {
    sandbox.__payload = value;
    vm.runInContext(name + ' = __payload', sandbox);
  };
  sandbox.__getValue = function (name) { return vm.runInContext(name, sandbox); };
  return {
    get state() { return sandbox.__getValue('state'); },
    set state(v) { sandbox.__setValue('state', v); },
    set ui(v) { sandbox.__setValue('ui', v); },
    get ui() { return sandbox.__getValue('ui'); },
    reindex: () => vm.runInContext('reindex()', sandbox),
    reviewSummaryRows: () => vm.runInContext('reviewSummaryRows()', sandbox),
    normalizeNode: (n) => vm.runInContext('normalizeNode', sandbox)(n),
    defaultState: () => vm.runInContext('defaultState()', sandbox)
  };
}

const A = loadApp();

function mkNode(p) {
  return A.normalizeNode(Object.assign({
    nodeId: 'X', level: 'L4', name: 'x', rankId: 999,
    status: 'Active', changeType: '—', priority: '—', lockStatus: '-'
  }, p));
}

function seed(nodes) {
  const st = A.defaultState();
  st.nodes = nodes;
  st.activity = [];
  st.meetings = [];
  A.state = st;
  A.reindex();
}

function tree() {
  return [
    mkNode({ nodeId: 'ISG-PLN', level: 'L1', name: 'ISG Planning', parentId: null, rankId: 1000000000 }),
    mkNode({ nodeId: 'ISG-PLN-DP', level: 'L2', name: 'Demand Planning', parentId: 'ISG-PLN', rankId: 1001000000 }),
    mkNode({ nodeId: 'ISG-PLN-DP-1', level: 'L3', name: 'Forecast Hierarchy', parentId: 'ISG-PLN-DP', rankId: 1001001000 }),
    mkNode({ nodeId: 'ISG-PLN-DP-1-1', level: 'L4', name: 'Geo', parentId: 'ISG-PLN-DP-1', rankId: 1001001001, evaluationResult: 'Passed' }),
    mkNode({ nodeId: 'ISG-PLN-DP-1-2', level: 'L4', name: 'Product', parentId: 'ISG-PLN-DP-1', rankId: 1001001002, evaluationResult: 'Need Revise' }),
    mkNode({ nodeId: 'ISG-PLN-DP-1-3', level: 'L4', name: 'Time', parentId: 'ISG-PLN-DP-1', rankId: 1001001003 }),
    mkNode({ nodeId: 'PCG-PLN', level: 'L1', name: 'PCG Planning', parentId: null, rankId: 2000000000 }),
    mkNode({ nodeId: 'PCG-PLN-OP', level: 'L2', name: 'ONE Plan', parentId: 'PCG-PLN', rankId: 2001000000 }),
    mkNode({ nodeId: 'PCG-PLN-OP-1', level: 'L3', name: 'Order Promise', parentId: 'PCG-PLN-OP', rankId: 2001001000, evaluationResult: 'Reject' })
  ];
}

test('reviewSummaryRows groups by Group × L1 and excludes L1/L2', () => {
  seed(tree());
  const rows = A.reviewSummaryRows();
  const data = rows.filter(r => r.Group !== 'TOTAL');

  assert.equal(data.length, 2, 'one row per Group × L1');

  const isg = data.find(r => r.Group === 'ISG');
  assert.equal(isg['L1 Application'], 'ISG Planning');
  assert.equal(isg['Scope Nodes'], 4, 'L3 + 3 L4');
  assert.equal(isg['Reviewed'], 2);
  assert.equal(isg['Passed'], 1);
  assert.equal(isg['Need Revise'], 1);
  assert.equal(isg['Rejected'], 0);
  assert.equal(isg['Pending'], 2);
  assert.equal(isg['Coverage %'], 50);

  const pcg = data.find(r => r.Group === 'PCG');
  assert.equal(pcg['Scope Nodes'], 1, 'only the L3, L2 excluded');
  assert.equal(pcg['Rejected'], 1);
  assert.equal(pcg['Coverage %'], 100);
});

test('reviewSummaryRows appends a TOTAL row that sums every bucket', () => {
  seed(tree());
  const rows = A.reviewSummaryRows();
  const total = rows[rows.length - 1];

  assert.equal(total.Group, 'TOTAL');
  assert.equal(total['Scope Nodes'], 5);
  assert.equal(total['Reviewed'], 3);
  assert.equal(total['Passed'], 1);
  assert.equal(total['Need Revise'], 1);
  assert.equal(total['Rejected'], 1);
  assert.equal(total['Pending'], 2);
  assert.equal(total['Coverage %'], 60);
  assert.match(total['L1 Application'], /2 L1 applications/);
});

test('reviewSummaryRows coverage is 0 when nothing reviewed', () => {
  seed([
    mkNode({ nodeId: 'MBG-A', level: 'L1', name: 'MBG App', parentId: null }),
    mkNode({ nodeId: 'MBG-A-1', level: 'L2', name: 'Mod', parentId: 'MBG-A' }),
    mkNode({ nodeId: 'MBG-A-1-1', level: 'L3', name: 'Feature', parentId: 'MBG-A-1' })
  ]);
  const rows = A.reviewSummaryRows();
  const data = rows.filter(r => r.Group !== 'TOTAL');
  assert.equal(data.length, 1);
  assert.equal(data[0]['Coverage %'], 0);
  assert.equal(data[0]['Pending'], 1);
});

test('reviewSummaryRows is ordered by Group then L1', () => {
  seed(tree());
  const names = A.reviewSummaryRows()
    .filter(r => r.Group !== 'TOTAL')
    .map(r => r.Group);
  assert.deepEqual(names, ['ISG', 'PCG']);
});

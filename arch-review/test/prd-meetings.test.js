/* unit tests for the PRD appointment workbook -> review meeting pipeline
 * run with:  node --test test/prd-meetings.test.js
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', 'assets');

function loadApp() {
  const sandbox = {
    console, Math, JSON, Date, Set, Map, Array, Object, String, Number, Boolean,
    Error, parseFloat, parseInt, NaN, isNaN, isFinite, undefined,
    window: { SEED_DATA: null },
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
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
  ['prd-review-data.js', 'seed-data.js', 'core.js'].forEach(f =>
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sandbox));
  vm.runInContext('state = defaultState(); reindex();', sandbox);
  return {
    get state() { return vm.runInContext('state', sandbox); },
    get INDEX() { return vm.runInContext('INDEX', sandbox); },
    set tab(v) { vm.runInContext('ui.masterTab = __v', Object.assign(sandbox, { __v: v })); },
    inScope: () => vm.runInContext('state.meetings.filter(meetingInScope).length', sandbox),
    reviewed: () => vm.runInContext('state.meetings.filter(m => m.prdId).length', sandbox)
  };
}

const A = loadApp();
const M = A.state.meetings;

test('every workbook row becomes a review meeting', () => {
  assert.equal(M.length, 45);
  assert.equal(M.filter(m => m.prdId).length, 45, 'all keep their PRD ID');
});

test('review status maps onto the meeting status', () => {
  const count = s => M.filter(m => m.reviewStatus === s).length;
  assert.equal(count('Close'), 34);
  assert.equal(count('Need 2nd Review'), 7);
  assert.equal(count('Revise'), 1);
  assert.equal(count('Processing'), 3);

  const completed = M.filter(m => m.status === 'Completed').length;
  const scheduled = M.filter(m => m.status === 'Scheduled').length;
  assert.equal(completed, 34, 'Close rows are done');
  assert.equal(scheduled, 11, 'open rows stay scheduled');
});

test('L3 node ids resolve against the architecture master list', () => {
  const isg = M.find(m => m.prdId === 'PRD-10');
  assert.equal(isg.prdNodeId, 'ISG-PLN-DP-1');
  const node = A.INDEX.get(isg.nodeRef);
  assert.ok(node, 'PRD-10 links to a real master node');
  assert.equal(node.nodeId, 'ISG-PLN-DP-1');
  assert.equal(node.group, 'ISG');
});

test('rows without a master node keep their raw L3 id for display', () => {
  const cfg = M.find(m => m.prdId === 'PRD-08');
  assert.equal(cfg.nodeRef, '', 'Config Project is not in the master list');
  assert.equal(cfg.prdNodeId, 'Config Project');
  assert.equal(cfg.prdModule, 'Config Project');
});

test('sessions sharing a confirm date get distinct hourly slots', () => {
  const sameDay = M.filter(m => m.date === '2026-09-23').sort((a, b) => a.start.localeCompare(b.start));
  assert.ok(sameDay.length >= 2);
  const slots = sameDay.map(m => m.start + '-' + m.end);
  assert.equal(new Set(slots).size, slots.length, 'no two sessions in one slot');
});

test('owner, project and AI score are carried over', () => {
  const m = M.find(x => x.prdId === 'PRD-10');
  assert.equal(m.organizer, 'Shipei Liu');
  assert.equal(m.project, 'BY Migration');
  assert.equal(m.aiScore, '91');
});

test('group tabs filter the meeting list by the linked node group', () => {
  A.tab = 'all';
  assert.equal(A.inScope(), 45);
  A.tab = 'ISG';
  const isgOnly = A.inScope();
  assert.ok(isgOnly > 0 && isgOnly < 45, 'ISG is a subset, got ' + isgOnly);
  A.tab = 'all';
});

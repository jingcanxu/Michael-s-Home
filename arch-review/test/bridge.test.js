/* unit tests for the local Excel bridge (assets/bridge.js)
 * run with:  node --test test/bridge.test.js
 *
 * The network layer is stubbed with the real workbook bytes so the whole
 * connect -> parse -> diff -> sync pipeline runs without a browser.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const UPLOADS = '/workspace/.uploads';
const MASTER_SRC = path.join(UPLOADS, 'bcc15037-e9f1-4443-9a74-8cba8216e3c6_Planning L4_Architecture_Master List.xlsx');
const PRD_SRC = path.join(UPLOADS, '32701606-ada5-4777-9322-a4b082a23dbf_PRD appointment& Checking.xlsx');

const TMP = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'bridge-test-'));
const MASTER = path.join(TMP, 'master.xlsx');
const PRD = path.join(TMP, 'prd.xlsx');
let HAVE_FIXTURES = false;
try {
  fs.copyFileSync(MASTER_SRC, MASTER);
  fs.copyFileSync(PRD_SRC, PRD);
  HAVE_FIXTURES = true;
} catch (err) {
  HAVE_FIXTURES = false;
}

function boot() {
  const sent = [];
  const sandbox = {
    console, Math, JSON, Date, Set, Map, Array, Object, String, Number, Boolean,
    Error, parseFloat, parseInt, NaN, isNaN, isFinite, undefined, URL,
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    document: {
      getElementById: () => null,
      createElement: () => ({ classList: { add() {}, remove() {} }, style: {} }),
      querySelector: () => null,
      body: { classList: { add() {}, remove() {} } }
    },
    history: { replaceState() {} },
    setTimeout: (fn) => fn(),
    clearTimeout: () => {},
    toast: () => {},
    render: () => {},
    setSaveState: () => {},
    fetch: (url, opts) => {
      if (String(url).includes('/api/health')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ ok: true, master: 'master.xlsx', prd: 'prd.xlsx' })
        });
      }
      if (String(url).includes('/api/master.xlsx')) {
        const b = fs.readFileSync(MASTER);
        return Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(b.buffer.slice(b.byteOffset, b.byteOffset + b.length)) });
      }
      if (String(url).includes('/api/prd.xlsx')) {
        const b = fs.readFileSync(PRD);
        return Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(b.buffer.slice(b.byteOffset, b.byteOffset + b.length)) });
      }
      if (String(url).includes('/api/sync')) {
        sent.push(JSON.parse(opts.body));
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, nodes: 1, meetings: 0, history: 0 }) });
      }
      return Promise.reject(new Error('unexpected fetch ' + url));
    }
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'vendor', 'xlsx.full.min.js'), 'utf8'), sandbox);
  ['seed-data.js', 'core.js', 'io.js', 'bridge.js'].forEach(f =>
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets', f), 'utf8'), sandbox));
  // the app declares its own toast/render, so re-point them at the silent stubs
  vm.runInContext('toast = function () {}; render = function () {}; setSaveState = function () {};', sandbox);
  vm.runInContext('state = defaultState(); reindex();', sandbox);
  return {
    sandbox,
    sent,
    run: expr => vm.runInContext(expr, sandbox),
    connect: () => vm.runInContext('bridgeConnect()', sandbox),
    collect: () => vm.runInContext('JSON.parse(JSON.stringify(bridgeCollect()))', sandbox),
    sync: () => vm.runInContext('bridgeSync()', sandbox)
  };
}

test('date and status helpers handle the sheet formats', () => {
  const A = boot();
  const date = v => A.run('bridgeDate(' + JSON.stringify(v) + ')');
  assert.equal(date('2nd:2026/9/23'), '2026-09-23');
  assert.equal(date('9/30/2026'), '2026-09-30');
  assert.equal(date('2026-11-20'), '2026-11-20');
  assert.equal(date(''), '');
  assert.equal(A.run('bridgePrdStatus("Need 2nd Review")'), 'Scheduled');
  assert.equal(A.run('bridgePrdStatus("Close")'), 'Completed');
  assert.equal(A.run('bridgePrdStatus("Revise")'), 'Scheduled');
  assert.equal(A.run('bridgePrdStatus("")'), 'Scheduled');
});

test('connecting loads nodes and PRD sessions from the workbooks', { skip: !HAVE_FIXTURES }, async () => {
  const A = boot();
  await A.connect();
  assert.equal(A.run('BRIDGE.active'), true);
  const nodeCount = A.run('state.nodes.length');
  assert.ok(nodeCount >= 1540 && nodeCount <= 1560, 'sanity: got ' + nodeCount);
  assert.equal(A.run('state.meetings.length'), 45);

  const junk = A.run('state.nodes.filter(n => /\\?/.test(n.nodeId)).length');
  assert.equal(junk, 0, 'placeholder rows are filtered out');

  const ids = A.run('state.nodes.map(n => n.nodeId)');
  assert.equal(new Set(ids).size, ids.length, 'no duplicate node ids');
});

test('bridge parses the source sheets faithfully', { skip: !HAVE_FIXTURES }, async () => {
  const A = boot();
  await A.connect();

  const n = JSON.parse(A.run('JSON.stringify(state.nodes.find(x => x.nodeId === "ISG-PLN-DP-1"))'));
  assert.equal(n.level, 'L3');
  assert.equal(n.group, 'ISG');
  assert.equal(n.evaluationResult, 'Passed');

  const m = JSON.parse(A.run('JSON.stringify(state.meetings.find(x => x.prdId === "PRD-10"))'));
  assert.equal(m.reviewStatus, 'Close');
  assert.equal(m.status, 'Completed');
  assert.equal(m.prdNodeId, 'ISG-PLN-DP-1');
  assert.equal(A.run('INDEX.get(state.meetings.find(x => x.prdId === "PRD-10").nodeRef).group'), 'ISG');
});

test('only changed fields are sent to the server', { skip: !HAVE_FIXTURES }, async () => {
  const A = boot();
  await A.connect();
  assert.deepEqual(A.collect(), { nodes: [], meetings: [], newMeetings: [], history: [] });

  A.run('state.nodes.find(n => n.nodeId === "ISG-PLN-DP-1").priority = "P1"');
  const payload = A.collect();
  assert.equal(payload.nodes.length, 1);
  assert.equal(payload.nodes[0].nodeId, 'ISG-PLN-DP-1');
  assert.equal(payload.nodes[0].fields.priority, 'P1');
  assert.equal(payload.nodes[0].fields.evaluationResult, 'Passed', 'unchanged fields ride along');

  await A.sync();
  assert.equal(A.sent.length, 1);
  assert.equal(A.sent[0].nodes.length, 1);
  assert.deepEqual(A.collect(), { nodes: [], meetings: [], newMeetings: [], history: [] }, 'snapshot advanced after sync');
});

test('new UI meetings are sent as rows to append', { skip: !HAVE_FIXTURES }, async () => {
  const A = boot();
  await A.connect();
  A.run('state.meetings.push(normalizeMeeting({ id: "ui-1", title: "Ad hoc PRD review", date: "2026-12-01", start: "10:00", end: "11:00", organizer: "Jiaqi" }))');
  const payload = A.collect();
  assert.equal(payload.newMeetings.length, 1);
  assert.equal(payload.newMeetings[0].title, 'Ad hoc PRD review');
});

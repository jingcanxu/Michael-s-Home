/* Local Excel bridge — connects the console to tools/file_bridge.py so that
 * edits are written back into the two source workbooks on disk. */

const BRIDGE = {
  ready: false,
  active: false,
  info: null,
  timer: null,
  sending: false,
  again: false,
  snapshot: null,
  sentHistory: new Set(),
  sentCreated: new Set(),
  lastSync: ''
};

const NODE_SYNC_FIELDS = ['evaluationResult', 'status', 'changeType', 'priority', 'lockStatus',
  'dtOwner', 'ownerBizTeam', 'itOwner', 'notes', 'reviewDate', 'prdVersion', 'changeProject'];

const MEETING_SYNC_FIELDS = ['reviewStatus', 'confirmDate', 'actionStatus', 'actionOwner',
  'closeTarget', 'followAction', 'attendees'];

const BRIDGE_STATUS_MAP = {
  'close': 'Completed',
  'need 2nd review': 'Scheduled',
  'revise': 'Scheduled',
  'processing': 'Scheduled'
};

/* ------------------------------------------------------------- connection */

async function bridgeHealth() {
  try {
    const res = await fetch('/api/health', { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    return data && data.ok ? data : null;
  } catch (err) {
    return null;
  }
}

async function bridgeProbe() {
  const info = await bridgeHealth();
  BRIDGE.ready = !!info;
  BRIDGE.info = info;
  bridgePaint();
}

function bridgePaint() {
  const btn = document.getElementById('bridge-btn');
  const label = document.getElementById('bridge-label');
  if (!btn || !label) return;
  btn.classList.toggle('is-ready', BRIDGE.ready);
  btn.classList.toggle('is-on', BRIDGE.active);
  label.textContent = BRIDGE.active
    ? 'Excel linked'
    : BRIDGE.ready ? 'Connect Excel' : 'Excel offline';
  btn.title = BRIDGE.active
    ? 'Edits are written straight back to ' + (BRIDGE.info ? BRIDGE.info.master : '')
    : BRIDGE.ready
      ? 'Link the workbooks from tools/file_bridge.py'
      : 'Start: python3 tools/file_bridge.py --master <file> --prd <file>';
}

async function bridgeConnect() {
  const info = await bridgeHealth();
  if (!info) {
    toast('Bridge not running', 'error',
      'Run: python3 tools/file_bridge.py --master "<master.xlsx>" --prd "<prd.xlsx>"');
    BRIDGE.ready = false;
    bridgePaint();
    return;
  }
  BRIDGE.ready = true;
  BRIDGE.info = info;
  toast('Reading workbooks…', '', 'Master + PRD sheets');
  try {
    const [masterBuf, prdBuf] = await Promise.all([
      fetch('/api/master.xlsx?t=' + Date.now(), { cache: 'no-store' }).then(r => r.arrayBuffer()),
      fetch('/api/prd.xlsx?t=' + Date.now(), { cache: 'no-store' }).then(r => r.arrayBuffer())
    ]);
    if (typeof XLSX === 'undefined') throw new Error('Excel library unavailable');

    const masterWb = XLSX.read(new Uint8Array(masterBuf), { type: 'array', cellDates: true });
    const parsed = finalizeImportedNodes(parseWorkbook(masterWb)).map(normalizeNode);
    // Drop placeholder rows ("ISG-???") and de-duplicate across sheets.
    const seenNode = new Set();
    const nodes = parsed.filter(n => {
      const id = n.nodeId || '';
      if (/\?/.test(id) || id.indexOf('-') < 1) return false;
      if (seenNode.has(id)) return false;
      seenNode.add(id);
      return true;
    });
    if (!nodes.length) throw new Error('No Node ID rows found in the master workbook');

    const prdWb = XLSX.read(new Uint8Array(prdBuf), { type: 'array', cellDates: true });
    const meetings = bridgeParsePrd(prdWb, nodes);

    bridgeApply(nodes, meetings);
    BRIDGE.active = true;
    BRIDGE.snapshot = bridgeSnapshot();
    BRIDGE.sentHistory = new Set(state.activity.map(a => a.id));
    bridgePaint();
    render();
    toast('Excel linked', '', nodes.length + ' nodes · ' + meetings.length + ' PRD sessions');
  } catch (err) {
    BRIDGE.active = false;
    bridgePaint();
    toast('Could not read workbooks', 'error', err.message);
  }
}

function bridgeApply(nodes, meetings) {
  const visible = state.settings.visibleColumns;
  state.nodes = nodes;
  reindex();
  state.meetings = (meetings || []).filter(m => !m.nodeRef || INDEX.has(m.nodeRef));
  state.settings = state.settings || {};
  state.settings.visibleColumns = visible && visible.length ? visible : DEFAULT_COLUMNS.slice();
  selection.clear();
  ui.search = '';
}

/* ----------------------------------------------------------- sync pipeline */

function bridgeScheduleSync() {
  if (!BRIDGE.active) return;
  clearTimeout(BRIDGE.timer);
  BRIDGE.timer = setTimeout(bridgeSync, 600);
}

function bridgeFieldString(node, fields) {
  return JSON.stringify(fields.map(f => node[f] == null ? '' : node[f]));
}

function bridgeSnapshot() {
  const nodes = {};
  state.nodes.forEach(n => { nodes[n.nodeId] = bridgeFieldString(n, NODE_SYNC_FIELDS); });
  const meetings = {};
  state.meetings.forEach(m => {
    if (m.prdId) meetings[m.prdId] = bridgeFieldString(m, MEETING_SYNC_FIELDS);
  });
  return { nodes, meetings };
}

function bridgeCollect() {
  const snap = BRIDGE.snapshot || { nodes: {}, meetings: {} };
  const nodes = [];
  state.nodes.forEach(n => {
    if (!n.nodeId || !(n.nodeId in snap.nodes)) return;   // nodes created in the UI stay local
    if (bridgeFieldString(n, NODE_SYNC_FIELDS) === snap.nodes[n.nodeId]) return;
    const fields = {};
    NODE_SYNC_FIELDS.forEach(f => { fields[f] = n[f] == null ? '' : n[f]; });
    nodes.push({ nodeId: n.nodeId, fields: fields });
  });

  const meetings = [];
  const created = [];
  state.meetings.forEach(m => {
    if (!m.prdId) {
      // only bookings created in the UI, never sheet rows with a blank id
      if (m.title && !/^prd-/.test(m.id || '') && !BRIDGE.sentCreated.has(m.id)) created.push(m);
      return;
    }
    const key = m.prdId;
    if (key in snap.meetings && bridgeFieldString(m, MEETING_SYNC_FIELDS) === snap.meetings[key]) return;
    if (!(key in snap.meetings)) return;                  // unknown row, do not overwrite
    const fields = {};
    MEETING_SYNC_FIELDS.forEach(f => { fields[f] = m[f] == null ? '' : m[f]; });
    meetings.push({ prdId: key, fields: fields });
  });

  const history = state.activity
    .filter(a => !BRIDGE.sentHistory.has(a.id) && a.type === 'review')
    .map(a => {
      const node = INDEX.get(a.nodeId);
      return {
        ts: String(a.ts || '').replace('T', ' ').slice(0, 16),
        nodeId: a.nodeId,
        name: a.nodeName,
        result: a.detail,
        reviewer: a.actor,
        reviewDate: String(a.ts || '').slice(0, 10),
        project: node ? (node.changeProject || '') : '',
        version: node ? (node.prdVersion || '') : '',
        note: ''
      };
    });

  return { nodes: nodes, meetings: meetings, newMeetings: created, history: history };
}

async function bridgeSync() {
  if (!BRIDGE.active) return;
  if (BRIDGE.sending) { BRIDGE.again = true; return; }
  const payload = bridgeCollect();
  const total = payload.nodes.length + payload.meetings.length + payload.newMeetings.length + payload.history.length;
  if (!total) return;

  BRIDGE.sending = true;
  setSaveState('Writing to Excel…');
  try {
    const res = await fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || ('HTTP ' + res.status));

    BRIDGE.snapshot = bridgeSnapshot();
    state.activity.forEach(a => BRIDGE.sentHistory.add(a.id));
    state.meetings.forEach(m => {
      if (!m.prdId) BRIDGE.sentCreated.add(m.id);
    });
    BRIDGE.lastSync = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setSaveState('Synced to Excel · ' + BRIDGE.lastSync);
  } catch (err) {
    setSaveState('Excel write failed', true);
    toast('Could not write to Excel', 'error', err.message);
  } finally {
    BRIDGE.sending = false;
    if (BRIDGE.again) { BRIDGE.again = false; bridgeScheduleSync(); }
  }
}

/* ------------------------------------------------------------ PRD workbook */

function bridgeCellText(value) {
  if (value == null) return '';
  if (value instanceof Date) {
    const p = n => String(n).padStart(2, '0');
    return value.getFullYear() + '-' + p(value.getMonth() + 1) + '-' + p(value.getDate());
  }
  return String(value).trim();
}

function bridgeDate(value) {
  const text = bridgeCellText(value);
  if (!text) return '';
  let m = text.match(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (m) return m[1] + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[3]).padStart(2, '0');
  m = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return m[3] + '-' + String(m[1]).padStart(2, '0') + '-' + String(m[2]).padStart(2, '0');
  return '';
}

function bridgePrdStatus(value) {
  return BRIDGE_STATUS_MAP[String(value || '').trim().toLowerCase()] || 'Scheduled';
}

function bridgeSlots() {
  return [['09:00', '10:00'], ['10:00', '11:00'], ['11:00', '12:00'], ['13:30', '14:30'],
    ['14:30', '15:30'], ['15:30', '16:30'], ['16:30', '17:30']];
}

function bridgeParsePrd(wb, nodes) {
  const sheetName = (wb.SheetNames || []).find(n => /prd\s*requirement/i.test(n)) ||
    (wb.SheetNames || [])[0];
  if (!sheetName) return [];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, raw: true, defval: '' });
  let headRow = -1;
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    if ((rows[i] || []).some(c => /^prd\s*topic/i.test(String(c).trim()))) { headRow = i; break; }
  }
  if (headRow < 0) return [];

  const headers = (rows[headRow] || []).map(h => String(h).replace(/\s+/g, ' ').trim().toLowerCase());
  const col = prefix => headers.findIndex(h => h.indexOf(prefix) === 0);
  const idx = {
    id: col('id'), nodeId: col('l3 node id'), l3: col('l3 feature'), topic: col('prd topic'),
    project: col('project name'), owner: col('prd owner'), expected: col('expected date'),
    confirm: col('confirm date'), status: col('status'), ai: col('ai self'),
    attendees: col('attendees'), follow: col('follow actions'), actionOwner: col('action owner'),
    closeTarget: col('close target'), actionStatus: col('action status')
  };

  const byNodeId = new Map();
  nodes.forEach(n => { if (n.nodeId) byNodeId.set(n.nodeId, n); });
  const resolve = raw => {
    let id = String(raw || '').trim();
    while (id) {
      if (byNodeId.has(id)) return byNodeId.get(id);
      const cut = id.lastIndexOf('-');
      if (cut < 1) return null;
      id = id.slice(0, cut);
    }
    return null;
  };

  const slotUse = {};
  const slots = bridgeSlots();
  const out = [];
  const seen = {};
  for (let r = headRow + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const get = key => idx[key] >= 0 ? row[idx[key]] : '';
    const topic = bridgeCellText(get('topic'));
    if (!topic) continue;

    let prdId = bridgeCellText(get('id')).toUpperCase().replace(/\s+/g, '');
    seen[prdId] = (seen[prdId] || 0) + 1;
    if (seen[prdId] > 1) prdId = prdId + '-' + String.fromCharCode(96 + seen[prdId]);

    const expectedDate = bridgeDate(get('expected'));
    const confirmDate = bridgeDate(get('confirm'));
    const date = confirmDate || expectedDate;
    let start = '';
    let end = '';
    if (date) {
      const used = slotUse[date] || 0;
      slotUse[date] = used + 1;
      const slot = slots[used % slots.length];
      start = slot[0];
      end = slot[1];
    }

    const node = resolve(get('nodeId'));
    const reviewStatus = bridgeCellText(get('status'));
    const score = bridgeCellText(get('ai'));

    out.push(normalizeMeeting({
      id: 'prd-' + (prdId || r),
      prdId: prdId,
      title: topic,
      nodeRef: node ? node.id : '',
      prdNodeId: bridgeCellText(get('nodeId')),
      prdModule: bridgeCellText(get('l3')),
      project: bridgeCellText(get('project')),
      organizer: bridgeCellText(get('owner')),
      expectedDate: expectedDate,
      confirmDate: confirmDate,
      date: date,
      start: start,
      end: end,
      reviewStatus: reviewStatus,
      status: bridgePrdStatus(reviewStatus),
      aiScore: /^\d{1,3}$/.test(score) ? score : '',
      attendees: bridgeCellText(get('attendees')),
      agenda: bridgeCellText(get('follow')),
      actionOwner: bridgeCellText(get('actionOwner')),
      closeTarget: bridgeDate(get('closeTarget')),
      actionStatus: bridgeCellText(get('actionStatus')),
      timezone: 'Asia/Shanghai',
      platform: 'Teams',
      location: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }));
  }
  return out;
}

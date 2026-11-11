/* Architecture Review Console — Excel / CSV / JSON import & export */

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function exportRow(node) {
  return {
    'RankID': node.rankId == null ? '' : node.rankId,
    'Node ID': node.nodeId,
    'Level': node.level,
    'L1 Application': nameAtLevel(node, 'L1'),
    'L2 Application': nameAtLevel(node, 'L2'),
    'L3 Feature/module': nameAtLevel(node, 'L3'),
    'L4 Function Name': nameAtLevel(node, 'L4'),
    'Description': node.description,
    'CFC Related': node.cfcRelated,
    'Owner Biz Team': node.ownerBizTeam,
    'DT Owner': node.dtOwner,
    'Shadow Owner': node.shadowOwner,
    'Experience Level': node.experienceLevel,
    'Tech Stack': node.techStack,
    'PRD Link (L3)': node.prdLink,
    'PRD Version (Active)': node.prdVersion,
    'Change Project': node.changeProject,
    'IT Owner': node.itOwner,
    'FS Link(L4)': node.fsLink,
    'Status': node.status,
    'Change Type': node.changeType,
    'Priority': node.priority,
    'Shared Across (Projects)': node.sharedAcross,
    'Lock Status': node.lockStatus,
    'Evaluation Results': node.evaluationResult,
    'AI Self Evaluation Score': node.aiScore === '' ? '' : node.aiScore,
    'Reviewer': node.reviewer,
    'Created': node.created,
    'Last Modified': node.lastModified,
    'Review Date': node.reviewDate,
    'Notes': node.notes,
    'Source': node.source
  };
}

function exportWorkbookFilename(ext) {
  return 'Architecture_Master_' + todayISO() + '.' + ext;
}

function exportXlsx() {
  if (typeof XLSX === 'undefined') {
    toast('Excel library unavailable', 'error', 'Reload the page and try again.');
    return;
  }
  const rows = state.nodes.slice().sort(sortByRank).map(exportRow);
  const ws = XLSX.utils.json_to_sheet(rows, { header: EXPORT_HEADERS });
  ws['!cols'] = EXPORT_HEADERS.map(h => ({ wch: Math.max(12, Math.min(46, h.length + 6)) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'ISG L4 Master');
  const logRows = state.activity.map(a => ({
    'Timestamp': a.ts,
    'Actor': a.actor || USER.name,
    'Action': a.type,
    'Node ID': a.nodeId,
    'Node Name': a.nodeName,
    'Detail': a.detail
  }));
  const wsLog = XLSX.utils.json_to_sheet(logRows);
  wsLog['!cols'] = [{ wch: 22 }, { wch: 26 }, { wch: 10 }, { wch: 20 }, { wch: 30 }, { wch: 54 }];
  XLSX.utils.book_append_sheet(wb, wsLog, 'Review Activity');
  const histRows = [];
  state.nodes.slice().sort(sortByRank).forEach(n => (n.history || []).forEach((h, i) => histRows.push({
    'Node ID': n.nodeId,
    'Node Name': n.name,
    'Round': i + 1,
    'Result': h.result,
    'Reviewer': h.reviewer,
    'Review Date': h.reviewDate,
    'Project': h.project,
    'PRD Version': h.version,
    'Note': h.note,
    'Recorded At': h.ts
  })));
  const wsHist = XLSX.utils.json_to_sheet(histRows, {
    header: ['Node ID', 'Node Name', 'Round', 'Result', 'Reviewer', 'Review Date', 'Project', 'PRD Version', 'Note', 'Recorded At']
  });
  wsHist['!cols'] = [{ wch: 20 }, { wch: 30 }, { wch: 7 }, { wch: 12 }, { wch: 18 }, { wch: 12 }, { wch: 24 }, { wch: 14 }, { wch: 50 }, { wch: 22 }];
  XLSX.utils.book_append_sheet(wb, wsHist, 'Review History');
  XLSX.writeFile(wb, exportWorkbookFilename('xlsx'));
  toast('Excel workbook exported', '', rows.length + ' nodes · review activity included');
}

function exportCsv() {
  if (typeof XLSX === 'undefined') {
    toast('Excel library unavailable', 'error', 'Reload the page and try again.');
    return;
  }
  const rows = filteredNodes().sort(sortByRank).map(exportRow);
  const ws = XLSX.utils.json_to_sheet(rows, { header: EXPORT_HEADERS });
  const csv = '\ufeff' + XLSX.utils.sheet_to_csv(ws);
  downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), exportWorkbookFilename('csv'));
  toast('Current view exported', '', rows.length + ' rows · CSV');
}

function exportJson() {
  const payload = {
    version: 2,
    exportedAt: new Date().toISOString(),
    nodes: state.nodes,
    activity: state.activity
  };
  downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), exportWorkbookFilename('json'));
  toast('Workspace backup exported', '', state.nodes.length + ' nodes · JSON');
}

/* ---------------- Import ---------------- */
function handleImportFile(file) {
  if (!file) return;
  const name = file.name || 'import';
  const isJson = /\.json$/i.test(name);
  if (isJson) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        const rawNodes = Array.isArray(parsed) ? parsed : parsed.nodes;
        if (!Array.isArray(rawNodes) || !rawNodes.length) throw new Error('No nodes found');
        const nodes = finalizeImportedNodes(rawNodes.map(normalizeNode));
        promptImport(nodes, name);
      } catch (err) {
        toast('Could not read JSON', 'error', err.message);
      }
    };
    reader.readAsText(file);
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    try {
      if (typeof XLSX === 'undefined') throw new Error('Excel library unavailable');
      const wb = XLSX.read(reader.result, { type: 'array', cellDates: true });
      const nodes = parseWorkbook(wb);
      if (!nodes.length) throw new Error('No L1–L4 rows were found. Check that the sheet has a "Node ID" column.');
      promptImport(nodes, name);
    } catch (err) {
      toast('Could not import file', 'error', err.message);
    }
  };
  reader.readAsArrayBuffer(file);
}

function promptImport(nodes, filename) {
  openConfirm({
    title: 'Replace workspace with imported data?',
    message: 'This will replace the current ' + state.nodes.length + ' nodes with ' + nodes.length +
      ' nodes from "' + filename + '". Export a backup first if you need to keep the current workspace.',
    confirmLabel: 'Import ' + nodes.length + ' nodes',
    onConfirm: () => applyImport(nodes, filename)
  });
}

function applyImport(nodes, filename) {
  const visible = state.settings.visibleColumns;
  state = {
    version: 2,
    nodes: nodes,
    activity: [],
    settings: { visibleColumns: visible.length ? visible : DEFAULT_COLUMNS.slice(), collapsed: [] }
  };
  reindex();
  selection.clear();
  logActivity('import', { nodeId: '—', name: filename }, 'Imported ' + nodes.length + ' nodes from ' + filename);
  saveState();
  closeDrawer(true);
  ui.search = '';
  ui.filters = { level: '', status: '', evaluation: '', priority: '', l1: '', l2: '', source: '', lockStatus: '', changeType: '' };
  ui.sort = { key: null, dir: 'asc' };
  setView('master');
  toast('Workspace imported', '', nodes.length + ' nodes loaded from ' + filename);
}

/* ---------------- Workbook parsing ---------------- */
function normHeader(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim().toLowerCase();
}

function cellText(value) {
  if (value == null) return '';
  if (value instanceof Date) return isoFromDate(value);
  return String(value).trim();
}

function isoFromDate(date) {
  if (!(date instanceof Date) || isNaN(date.getTime())) return '';
  const p = n => String(n).padStart(2, '0');
  return date.getFullYear() + '-' + p(date.getMonth() + 1) + '-' + p(date.getDate());
}

function normalizeDateValue(value) {
  if (value instanceof Date) return isoFromDate(value);
  const raw = cellText(value);
  if (!raw) return '';
  const m = raw.match(/^(\d{4})[\/\-]+(\d{1,2})[\/\-]+(\d{1,2})/);
  if (m) {
    return m[1] + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[3]).padStart(2, '0');
  }
  const d = new Date(raw);
  if (!isNaN(d.getTime())) return isoFromDate(d);
  return raw;
}

function parseRankValue(value) {
  const digits = cellText(value).replace(/[^\d]/g, '');
  if (!digits) return null;
  const rank = Number(digits);
  return isFinite(rank) && rank > 0 ? rank : null;
}

function blankImportedNode(nodeId, level, name, source) {
  return {
    nodeId: nodeId, level: level, name: name, rankId: null, parentId: null,
    description: '', cfcRelated: '', ownerBizTeam: '', dtOwner: '', shadowOwner: '',
    experienceLevel: '', techStack: '', prdLink: '', itOwner: '', fsLink: '',
    status: 'Active', changeType: '—', priority: '—', sharedAcross: '', lockStatus: '-',
    evaluationResult: '', aiScore: '', created: '', lastModified: '', reviewDate: '',
    notes: '', reviewer: '', source: source || 'Imported'
  };
}

function parseWorkbook(wb) {
  const tempMap = new Map();

  wb.SheetNames.forEach(sheetName => {
    const ws = wb.Sheets[sheetName];
    if (!ws) return;
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
    if (!rows.length) return;
    let headerRow = -1;
    for (let i = 0; i < Math.min(rows.length, 12); i++) {
      if ((rows[i] || []).some(c => normHeader(c) === 'node id')) { headerRow = i; break; }
    }
    if (headerRow < 0) return;
    const headers = (rows[headerRow] || []).map(normHeader);
    const find = fn => headers.findIndex(fn);
    const iNode = find(h => h === 'node id');
    const iLevel = find(h => h === 'level' || h === 'l3');
    if (iNode < 0 || iLevel < 0) return;
    const idx = {
      rankId: find(h => h.indexOf('rankid') === 0),
      l1: find(h => h.indexOf('l1 application') === 0),
      l2: find(h => h.indexOf('l2 application') === 0),
      l3: find(h => h.indexOf('l3 feature') === 0),
      l4: find(h => h.indexOf('l4 function') === 0),
      description: find(h => h === 'description'),
      cfc: find(h => h === 'cfc related'),
      owner: find(h => h === 'owner biz team'),
      dt: find(h => h === 'dt owner'),
      shadow: find(h => h === 'shadow owner'),
      exp: find(h => h === 'experience level'),
      tech: find(h => h === 'tech stack'),
      prd: find(h => h.indexOf('prd link') === 0),
      prdVersion: find(h => h.indexOf('prd version') === 0),
      changeProject: find(h => h.indexOf('change project') === 0),
      it: find(h => h === 'it owner'),
      fs: find(h => h.indexOf('fs link') === 0),
      status: find(h => h === 'status'),
      changeType: find(h => h === 'change type'),
      priority: find(h => h === 'priority'),
      shared: find(h => h.indexOf('shared across') === 0),
      lock: find(h => h === 'lock status'),
      evaluation: find(h => h.indexOf('evaluation result') === 0),
      score: find(h => h.indexOf('ai self') > -1),
      created: find(h => h === 'created'),
      lastModified: find(h => h === 'last modified'),
      reviewDate: find(h => h === 'review date'),
      notes: find(h => h === 'notes'),
      reviewer: find(h => h === 'reviewer'),
      source: find(h => h === 'source')
    };

    if (idx.source >= 0) {
      // preserve the per-row Source column; otherwise use the sheet name
    }

    for (let r = headerRow + 1; r < rows.length; r++) {
      const row = rows[r] || [];
      const get = key => idx[key] >= 0 ? row[idx[key]] : '';
      const nodeId = cellText(row[iNode]);
      let level = cellText(row[iLevel]).toUpperCase();
      if (!nodeId || !/^L[1-4]$/.test(level)) continue;
      const names = {
        L1: cellText(get('l1')),
        L2: cellText(get('l2')),
        L3: cellText(get('l3')),
        L4: cellText(get('l4'))
      };
      const temp = {
        nodeId: nodeId,
        level: level,
        name: names[level],
        rankId: parseRankValue(get('rankId')),
        parentId: null,
        description: cellText(get('description')),
        cfcRelated: cellText(get('cfc')),
        ownerBizTeam: cellText(get('owner')),
        dtOwner: cellText(get('dt')),
        shadowOwner: cellText(get('shadow')),
        experienceLevel: cellText(get('exp')),
        techStack: cellText(get('tech')),
        prdLink: cellText(get('prd')),
        prdVersion: cellText(get('prdVersion')),
        changeProject: cellText(get('changeProject')),
        itOwner: cellText(get('it')),
        fsLink: cellText(get('fs')),
        status: cellText(get('status')) || 'Active',
        changeType: cellText(get('changeType')) || '—',
        priority: cellText(get('priority')) || '—',
        sharedAcross: cellText(get('shared')),
        lockStatus: cellText(get('lock')) || '-',
        evaluationResult: cellText(get('evaluation')),
        aiScore: cellText(get('score')),
        created: normalizeDateValue(get('created')),
        lastModified: normalizeDateValue(get('lastModified')),
        reviewDate: normalizeDateValue(get('reviewDate')),
        notes: cellText(get('notes')),
        reviewer: cellText(get('reviewer')),
        source: cellText(get('source')) || sheetName,
        _names: names
      };
      const existing = tempMap.get(nodeId);
      if (existing) {
        Object.keys(temp).forEach(key => {
          if (key === '_names') return;
          if ((existing[key] === '' || existing[key] == null) && temp[key] !== '' && temp[key] != null) {
            existing[key] = temp[key];
          }
        });
        ['L1', 'L2', 'L3', 'L4'].forEach(k => {
          if (!existing._names[k] && temp._names[k]) existing._names[k] = temp._names[k];
        });
      } else {
        tempMap.set(nodeId, temp);
      }
    }
  });

  const list = Array.from(tempMap.values());
  const byId = new Map(list.map(n => [n.nodeId, n]));

  // Create missing parent containers (e.g. a sheet that only lists L3 rows).
  list.slice().forEach(n => {
    const lvl = LEVEL_RANK[n.level];
    const parts = n.nodeId.split('-');
    for (let k = 1; k < lvl; k++) {
      const drop = lvl - k;
      const ancId = parts.slice(0, parts.length - drop).join('-');
      if (!ancId || byId.has(ancId)) continue;
      const anc = blankImportedNode(ancId, 'L' + k, (n._names && n._names['L' + k]) || '', 'Synthetic');
      anc._names = Object.assign({}, n._names);
      byId.set(ancId, anc);
      list.push(anc);
    }
  });

  list.forEach(n => {
    const lvl = LEVEL_RANK[n.level];
    if (lvl <= 1) return;
    const candidates = list
      .filter(p => p.nodeId !== n.nodeId && n.nodeId.indexOf(p.nodeId + '-') === 0 && LEVEL_RANK[p.level] === lvl - 1)
      .sort((a, b) => b.nodeId.length - a.nodeId.length);
    if (candidates.length) n.parentId = candidates[0].nodeId;
  });

  // Fallback: link by the L1/L2/L3 names carried on each row.
  list.forEach(n => {
    const lvl = LEVEL_RANK[n.level];
    if (lvl <= 1 || n.parentId) return;
    const parentLevel = 'L' + (lvl - 1);
    const wanted = (n._names && n._names[parentLevel]) || '';
    if (!wanted) return;
    const candidates = list.filter(p => p.level === parentLevel && p.name === wanted);
    if (!candidates.length) return;
    let pick = candidates[0];
    if (candidates.length > 1) {
      const better = candidates.find(p => nameFromTemp(p, 'L1', byId) === savedL1(n));
      if (better) pick = better;
    }
    n.parentId = pick.nodeId;
  });

  return list.map(n => {
    const clean = Object.assign({}, n);
    delete clean._names;
    clean.id = clean.nodeId;
    return normalizeNode(clean);
  });
}

function savedL1(node) {
  return node && node._names ? node._names.L1 : '';
}

function nameFromTemp(node, level, byId) {
  const seen = new Set();
  let cur = node;
  while (cur && !seen.has(cur.nodeId)) {
    seen.add(cur.nodeId);
    if (cur.level === level) return cur.name;
    cur = cur.parentId ? byId.get(cur.parentId) : null;
  }
  return '';
}

function finalizeImportedNodes(nodes) {
  const byId = new Map(nodes.map(n => [n.id, n]));
  nodes.forEach(n => {
    if (n.parentId && !byId.has(n.parentId)) n.parentId = null;
    if (!n.parentId && n.level !== 'L1') {
      const lvl = LEVEL_RANK[n.level];
      const candidates = nodes
        .filter(p => p.id !== n.id && n.nodeId.indexOf(p.nodeId + '-') === 0 && LEVEL_RANK[p.level] === lvl - 1)
        .sort((a, b) => b.nodeId.length - a.nodeId.length);
      if (candidates.length) n.parentId = candidates[0].id;
    }
  });
  return nodes;
}

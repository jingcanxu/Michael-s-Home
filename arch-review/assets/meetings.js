/* PRD review meeting appointments */

function upcomingMeetingCount() {
  const today = todayISO();
  return state.meetings.filter(m => m.status === 'Scheduled' && m.date >= today).length;
}

function meetingDateTime(m) {
  return (m.date || '9999-12-31') + ' ' + (m.start || '99:99');
}

function meetingNode(m) {
  return m.nodeRef ? INDEX.get(m.nodeRef) : null;
}

function meetingDuration(m) {
  if (!m.start || !m.end) return '';
  const start = m.start.split(':').map(Number);
  const end = m.end.split(':').map(Number);
  const mins = (end[0] * 60 + end[1]) - (start[0] * 60 + start[1]);
  if (mins <= 0) return '';
  const h = Math.floor(mins / 60);
  const mm = mins % 60;
  return (h ? h + 'h' : '') + (h && mm ? ' ' : '') + (mm ? mm + 'm' : '');
}

function meetingDateInfo(dateStr) {
  const d = new Date(String(dateStr) + 'T00:00:00');
  if (isNaN(d.getTime())) return { badgeDay: '--', badgeMonth: '---', label: dateStr || 'No date', relative: '' };
  const today = new Date(todayISO() + 'T00:00:00');
  const diff = Math.round((d - today) / 86400000);
  const relative = diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : diff === -1 ? 'Yesterday' :
    diff > 1 ? 'In ' + diff + ' days' : Math.abs(diff) + ' days ago';
  return {
    badgeDay: String(d.getDate()).padStart(2, '0'),
    badgeMonth: d.toLocaleDateString('en-GB', { month: 'short' }),
    label: d.toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long' }),
    relative: relative
  };
}

function meetingStatusPill(status) {
  if (status === 'Completed') return '<span class="pill green">Completed</span>';
  if (status === 'Cancelled') return '<span class="pill gray">Cancelled</span>';
  return '<span class="pill blue">Scheduled</span>';
}

function meetingOverdue(m) {
  return m.status === 'Scheduled' && m.date && m.date < todayISO();
}

function meetingPlatformIcon(platform) {
  return platform === 'On-site' ? 'location' : platform === 'Other' ? 'info' : 'video';
}

function attendeeChips(value) {
  const names = String(value || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!names.length) return '<span class="cell-empty">No attendees yet</span>';
  const shown = names.slice(0, 4).map(n => avatar(n));
  return '<span class="meeting-attendees">' + shown.join('') +
    (names.length > 4 ? '<span class="avatar more">+' + (names.length - 4) + '</span>' : '') +
    '<span class="meeting-attendee-names">' + esc(names.slice(0, 2).join(', ')) +
    (names.length > 2 ? ' +' + (names.length - 2) : '') + '</span></span>';
}

/* ---------------- Meeting page ---------------- */
function renderMeetings() {
  const today = todayISO();
  const weekEnd = addDaysISO(today, 7);
  const all = state.meetings.slice();
  const upcoming = all
    .filter(m => m.status === 'Scheduled' && m.date >= today)
    .sort((a, b) => meetingDateTime(a).localeCompare(meetingDateTime(b)));
  const other = all
    .filter(m => !(m.status === 'Scheduled' && m.date >= today))
    .sort((a, b) => meetingDateTime(b).localeCompare(meetingDateTime(a)));
  const thisWeek = all.filter(m => m.status === 'Scheduled' && m.date >= today && m.date <= weekEnd).length;
  const completed = all.filter(m => m.status === 'Completed').length;
  const filter = ui.meetingFilter || 'upcoming';
  const list = filter === 'past' ? other : filter === 'all' ? upcoming.concat(other) : upcoming;

  return '<div class="page">' +
    '<div class="page-head">' +
      '<div>' +
        '<h1>PRD review meetings</h1>' +
        '<p>Book review sessions for the L3 modules and L4 functions in the master list. Every appointment stays linked to its PRD, owner and active version.</p>' +
      '</div>' +
      '<button class="btn primary" data-action="new-meeting">' + icon('plus') + 'Book a PRD review</button>' +
    '</div>' +

    '<div class="kpi-grid three">' +
      kpiCard('Upcoming sessions', upcoming.length,
        upcoming.length ? 'Next: <b>' + esc(fmtDate(upcoming[0].date)) + ' · ' + esc(upcoming[0].start) + '</b>' : 'Nothing scheduled yet',
        'calendar', '#0b2545', '#e9effb') +
      kpiCard('Next 7 days', thisWeek, '<b>' + thisWeek + '</b> session' + (thisWeek === 1 ? '' : 's') + ' scheduled',
        'clock', '#0f766e', '#e4f6f4') +
      kpiCard('Completed', completed, '<b>' + completed + '</b> review session' + (completed === 1 ? '' : 's') + ' closed',
        'check-circle', '#0f9d58', '#e8f7ef') +
    '</div>' +

    '<section class="panel meeting-panel">' +
      '<div class="panel-head">' +
        '<div><h2>Schedule</h2><p>Upcoming reviews, grouped by day</p></div>' +
        '<div class="meeting-toolbar">' +
          '<div class="segmented">' +
            ['upcoming', 'past', 'all'].map(f =>
              '<button data-action="meeting-filter" data-filter="' + f + '"' + (filter === f ? ' class="active"' : '') + '>' +
              f.charAt(0).toUpperCase() + f.slice(1) + '</button>').join('') +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="panel-body">' +
        (list.length ? meetingGroupsHTML(list) : meetingEmptyHTML(filter)) +
      '</div>' +
    '</section>' +
  '</div>';
}

function meetingGroupsHTML(list) {
  const groups = [];
  const byDate = new Map();
  list.forEach(m => {
    const key = m.date || 'unscheduled';
    let group = byDate.get(key);
    if (!group) {
      group = { date: key, items: [] };
      byDate.set(key, group);
      groups.push(group);
    }
    group.items.push(m);
  });
  return groups.map(g => {
    const info = meetingDateInfo(g.date);
    return '<div class="meeting-day">' +
      '<div class="meeting-day-head">' +
        '<div class="meeting-day-badge"><strong>' + esc(info.badgeDay) + '</strong><span>' + esc(info.badgeMonth) + '</span></div>' +
        '<div class="meeting-day-meta"><h3>' + esc(info.label) + '</h3>' +
          '<p>' + esc(info.relative) + ' · ' + g.items.length + ' session' + (g.items.length === 1 ? '' : 's') + '</p></div>' +
      '</div>' +
      '<div class="meeting-list">' + g.items.map(meetingCardHTML).join('') + '</div>' +
    '</div>';
  }).join('');
}

function meetingCardHTML(m) {
  const node = meetingNode(m);
  const info = meetingDateInfo(m.date);
  const duration = meetingDuration(m);
  const overdue = meetingOverdue(m);
  const locationIsLink = /^https?:\/\//i.test(m.location || '');
  const nodeLine = node
    ? '<button class="meeting-node" data-action="meeting-open-node" data-id="' + esc(node.id) + '">' +
        levelBadge(node.level) + '<span>' + esc(node.name || '(unnamed)') + '</span>' +
        (node.prdVersion ? '<span class="pill outline">' + esc(node.prdVersion) + '</span>' : '') +
      '</button>'
    : '<span class="meeting-node none">' + icon('layers') + 'No PRD linked</span>';

  return '<article class="meeting-card' + (m.status === 'Cancelled' ? ' cancelled' : '') + (overdue ? ' overdue' : '') + '">' +
    '<div class="meeting-time">' +
      '<strong>' + esc(m.start || '--:--') + '</strong>' +
      '<span>' + esc(m.end || '--:--') + '</span>' +
      (duration ? '<small>' + esc(duration) + '</small>' : '') +
    '</div>' +
    '<div class="meeting-main">' +
      '<div class="meeting-title-row">' +
        '<h3>' + esc(m.title) + '</h3>' +
        meetingStatusPill(m.status) +
        (overdue ? '<span class="pill amber">Needs outcome</span>' : '') +
      '</div>' +
      nodeLine +
      '<div class="meeting-meta-row">' +
        '<span class="meeting-chip">' + icon(meetingPlatformIcon(m.platform)) + esc(m.platform) + '</span>' +
        (m.organizer ? '<span class="meeting-chip">' + avatar(m.organizer) + 'Organizer: ' + esc(m.organizer) + '</span>' : '') +
        '<span class="meeting-chip">' + icon('clock') + esc(m.timezone) + '</span>' +
        (locationIsLink
          ? '<a class="meeting-chip link" href="' + esc(m.location) + '" target="_blank" rel="noopener">' + icon('external') + 'Meeting link</a>'
          : m.location ? '<span class="meeting-chip">' + icon('location') + esc(m.location) + '</span>' : '') +
      '</div>' +
      '<div class="meeting-attendee-row">' + attendeeChips(m.attendees) + '</div>' +
      (m.agenda ? '<p class="meeting-agenda">' + esc(m.agenda) + '</p>' : '') +
    '</div>' +
    '<div class="meeting-actions">' +
      '<button class="btn ghost sm" data-action="edit-meeting" data-id="' + esc(m.id) + '">' + icon('edit') + 'Edit</button>' +
      (m.status === 'Scheduled'
        ? '<button class="btn ghost sm" data-action="meeting-status" data-id="' + esc(m.id) + '" data-status="Completed">' + icon('check') + 'Mark done</button>' +
          '<button class="link-btn subtle" data-action="meeting-status" data-id="' + esc(m.id) + '" data-status="Cancelled">Cancel</button>'
        : '<button class="link-btn subtle" data-action="meeting-status" data-id="' + esc(m.id) + '" data-status="Scheduled">Reschedule</button>') +
      '<button class="icon-btn danger" data-action="delete-meeting" data-id="' + esc(m.id) + '" aria-label="Delete meeting">' + icon('trash') + '</button>' +
      '<span class="meeting-date-note">' + esc(info.relative) + '</span>' +
    '</div>' +
  '</article>';
}

function meetingEmptyHTML(filter) {
  const copy = filter === 'past'
    ? ['No past sessions', 'Completed and cancelled review meetings will appear here.']
    : filter === 'all'
      ? ['No review meetings yet', 'Book the first PRD review to start tracking appointments.']
      : ['No upcoming reviews', 'Everything is clear. Book the next PRD review to keep the pipeline moving.'];
  return '<div class="empty-state meeting-empty">' +
    '<div class="empty-ico">' + icon('calendar') + '</div>' +
    '<h3>' + copy[0] + '</h3><p>' + copy[1] + '</p>' +
    '<button class="btn primary" data-action="new-meeting">' + icon('plus') + 'Book a PRD review</button>' +
  '</div>';
}

/* ---------------- Booking modal ---------------- */
function nextMeetingSlot() {
  const now = new Date();
  let minutes = now.getHours() * 60 + now.getMinutes();
  minutes = Math.ceil((minutes + 1) / 30) * 30;
  if (minutes >= 23 * 60 + 30) minutes = 9 * 60;
  const end = Math.min(minutes + 60, 23 * 60 + 30);
  const fmt = value => String(Math.floor(value / 60)).padStart(2, '0') + ':' + String(value % 60).padStart(2, '0');
  return { start: fmt(minutes), end: fmt(end) };
}

function openMeetingModal(id, opts) {
  opts = opts || {};
  const existing = id ? state.meetings.find(m => m.id === id) : null;
  const slot = nextMeetingSlot();
  const base = existing ? deepCopy(existing) : {
    id: 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    title: '',
    nodeRef: opts.nodeRef || '',
    date: todayISO(),
    start: slot.start,
    end: slot.end,
    timezone: 'Asia/Shanghai',
    platform: 'Teams',
    location: '',
    organizer: USER.name,
    attendees: '',
    agenda: '',
    status: 'Scheduled',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  modalState = { type: 'meeting', id: existing ? existing.id : null, draft: base };
  renderModal();
}

function meetingField(label, name, control, opts) {
  opts = opts || {};
  return '<div class="field' + (opts.full ? ' full' : '') + '">' +
    '<label for="meeting-' + name + '">' + label + (opts.required ? ' <span class="req">*</span>' : '') + '</label>' +
    control + (opts.helper ? '<span class="helper">' + esc(opts.helper) + '</span>' : '') + '</div>';
}

function meetingInput(name, attrs) {
  const d = modalState.draft;
  return '<input id="meeting-' + name + '" data-meeting-field="' + name + '"' + (attrs || '') +
    ' value="' + esc(d[name] == null ? '' : d[name]) + '"/>';
}

function meetingSelect(name, values, labels) {
  const current = modalState.draft[name];
  return '<select id="meeting-' + name + '" data-meeting-field="' + name + '">' +
    values.map(v => '<option value="' + esc(v) + '"' + (String(current) === String(v) ? ' selected' : '') + '>' +
      esc(labels ? labels(v) : v) + '</option>').join('') + '</select>';
}

function meetingNodeOptions() {
  const options = state.nodes
    .filter(n => n.level === 'L3' || n.level === 'L4')
    .sort(sortByRank);
  const current = modalState.draft.nodeRef;
  return '<option value="">— Not linked —</option>' + options.map(n => {
    const l2 = nameAtLevel(n, 'L2');
    const l3 = nameAtLevel(n, 'L3');
    const suffix = n.level === 'L4' && l3 ? ' · ' + l3 : l2 ? ' · ' + l2 : '';
    return '<option value="' + esc(n.id) + '"' + (current === n.id ? ' selected' : '') + '>' +
      esc(n.level) + ' · ' + esc(n.name) + esc(suffix) + '</option>';
  }).join('');
}

function renderMeetingModal() {
  const editing = !!modalState.id;
  const d = modalState.draft;
  return '<div class="modal-overlay" data-action="close-modal">' +
    '<div class="modal meeting-modal" role="dialog" aria-modal="true">' +
      '<div class="modal-head">' +
        '<span class="modal-ico">' + icon('calendar') + '</span>' +
        '<div><h2>' + (editing ? 'Edit PRD review' : 'Book a PRD review') + '</h2>' +
          '<p>Link the session to the PRD under review, so the outcome and version stay traceable.</p></div>' +
        '<button class="icon-btn" data-action="close-modal" aria-label="Close">' + icon('close') + '</button>' +
      '</div>' +
      '<div class="modal-body">' +
        '<div class="form-grid">' +
          meetingField('Meeting title', 'title', meetingInput('title', ' type="text" placeholder="e.g. PRD review — Forecast hierarchy release"'), { full: true, required: true }) +
          meetingField('PRD / architecture node', 'nodeRef',
            '<select id="meeting-nodeRef" data-meeting-field="nodeRef">' + meetingNodeOptions() + '</select>',
            { full: true, helper: 'Optional. Makes the appointment show the active PRD version and review status.' }) +
          meetingField('Date', 'date', meetingInput('date', ' type="date"'), { required: true }) +
          meetingField('Platform', 'platform', meetingSelect('platform', MEETING.platforms)) +
          meetingField('Start time', 'start', meetingInput('start', ' type="time"'), { required: true }) +
          meetingField('End time', 'end', meetingInput('end', ' type="time"'), { required: true }) +
          meetingField('Timezone', 'timezone', meetingSelect('timezone', MEETING.timezones)) +
          meetingField('Organizer', 'organizer', meetingInput('organizer', ' type="text" placeholder="Who runs the review"')) +
          meetingField('Location / meeting link', 'location',
            meetingInput('location', ' type="text" placeholder="Room, address or https:// link"'), { full: true }) +
          meetingField('Attendees', 'attendees',
            meetingInput('attendees', ' type="text" placeholder="Names, comma separated"'),
            { full: true, helper: 'Separate names with commas. Each attendee gets an avatar on the schedule.' }) +
          meetingField('Agenda / focus', 'agenda',
            '<textarea id="meeting-agenda" data-meeting-field="agenda" placeholder="What should be reviewed and decided in this session?">' + esc(d.agenda) + '</textarea>',
            { full: true }) +
          meetingField('Status', 'status', meetingSelect('status', MEETING.statuses)) +
          '<div class="field meeting-modal-hint"><span class="helper">' +
            (d.nodeRef && INDEX.has(d.nodeRef)
              ? 'Linked PRD: ' + esc((INDEX.get(d.nodeRef) || {}).name || '') +
                (INDEX.get(d.nodeRef).prdVersion ? ' · ' + esc(INDEX.get(d.nodeRef).prdVersion) : '')
              : 'Tip: link a PRD to surface its active version in the schedule.') +
          '</span></div>' +
        '</div>' +
      '</div>' +
      '<div class="modal-foot">' +
        '<button class="btn ghost" data-action="close-modal">Cancel</button>' +
        '<button class="btn primary" data-action="save-meeting">' + icon('calendar') +
          (editing ? 'Save changes' : 'Schedule review') + '</button>' +
      '</div>' +
    '</div>' +
  '</div>';
}

function saveMeeting() {
  if (!modalState || modalState.type !== 'meeting') return;
  const get = name => {
    const el = document.querySelector('[data-meeting-field="' + name + '"]');
    return el ? String(el.value || '').trim() : '';
  };
  const title = get('title');
  const date = get('date');
  const start = get('start');
  const end = get('end');
  if (!title) {
    toast('Meeting title is required', 'error');
    return;
  }
  if (!date) {
    toast('Pick a meeting date', 'error');
    return;
  }
  if (!start || !end) {
    toast('Start and end time are required', 'error');
    return;
  }
  if (end <= start) {
    toast('End time must be after start time', 'error');
    return;
  }
  const existing = modalState.id ? state.meetings.find(m => m.id === modalState.id) : null;
  const meeting = normalizeMeeting({
    id: existing ? existing.id : modalState.draft.id,
    title: title,
    nodeRef: get('nodeRef'),
    date: date,
    start: start,
    end: end,
    timezone: get('timezone'),
    platform: get('platform'),
    location: get('location'),
    organizer: get('organizer'),
    attendees: get('attendees'),
    agenda: get('agenda'),
    status: get('status'),
    createdAt: existing ? existing.createdAt : new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
  if (existing) state.meetings = state.meetings.map(m => m.id === meeting.id ? meeting : m);
  else state.meetings.unshift(meeting);
  const node = meetingNode(meeting);
  logActivity('meeting', node, (existing ? 'Updated' : 'Scheduled') + ' PRD review "' + meeting.title +
    '" on ' + fmtDate(meeting.date) + ' ' + meeting.start + '–' + meeting.end);
  saveState();
  closeModal();
  render();
  toast(existing ? 'Review updated' : 'Review scheduled', '',
    fmtDate(meeting.date) + ' · ' + meeting.start + '–' + meeting.end);
}

function setMeetingStatus(id, status) {
  const meeting = state.meetings.find(m => m.id === id);
  if (!meeting || !MEETING.statuses.includes(status)) return;
  meeting.status = status;
  meeting.updatedAt = new Date().toISOString();
  logActivity('meeting', meetingNode(meeting), 'Marked PRD review "' + meeting.title + '" as ' + status);
  saveState();
  render();
  toast('Meeting ' + status.toLowerCase(), '', meeting.title);
}

function requestDeleteMeeting(id) {
  const meeting = state.meetings.find(m => m.id === id);
  if (!meeting) return;
  openConfirm({
    title: 'Delete this review meeting?',
    message: '"' + meeting.title + '" on ' + fmtDate(meeting.date) + ' will be removed from the schedule. This cannot be undone.',
    confirmLabel: 'Delete meeting',
    danger: true,
    onConfirm: () => {
      state.meetings = state.meetings.filter(m => m.id !== id);
      saveState();
      render();
      toast('Meeting deleted', '', meeting.title);
    }
  });
}

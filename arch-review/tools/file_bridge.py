#!/usr/bin/env python3
"""Local Excel bridge for the Architecture Review Console.

Serves the static app and exposes a tiny JSON API so edits made in the
browser are written back into the two source workbooks, cell by cell,
without touching the rest of the file (styles, dropdowns and other
sheets survive the round-trip).

    python3 tools/file_bridge.py \
        --master "/path/Planning L4_Architecture_Master List.xlsx" \
        --prd "/path/PRD appointment& Checking.xlsx"

Then open http://localhost:8765 and press "Connect Excel" in the topbar.
"""

import argparse
import datetime
import json
import mimetypes
import os
import re
import shutil
import sys
import threading
import traceback
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

import openpyxl
from openpyxl.utils import get_column_letter

APP_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MASTER_PATH = ''
PRD_PATH = ''
LOCK = threading.Lock()

# ---------------------------------------------------------------- field maps

NODE_FIELDS = {
    # UI field            -> workbook header
    'evaluationResult': 'Evaluation Results',
    'status': 'Status',
    'changeType': 'Change Type',
    'priority': 'Priority',
    'lockStatus': 'Lock Status',
    'dtOwner': 'DT Owner',
    'ownerBizTeam': 'Owner Biz Team',
    'itOwner': 'IT Owner',
    'notes': 'Notes',
    'reviewDate': 'Review Date',
    'prdVersion': 'PRD Version (Active)',
    'changeProject': 'Change Project',
}

MEETING_FIELDS = {
    'reviewStatus': 'Status',
    'confirmDate': 'Confirm Date',
    'actionStatus': 'Action Status',
    'actionOwner': 'Action Owner',
    'closeTarget': 'Close Target',
    'followAction': 'Follow Actions',
    'attendees': 'Attendees',
}

HISTORY_SHEET = 'Review History'
HISTORY_HEADERS = ['Logged At', 'Node ID', 'Node Name', 'Result', 'Reviewer',
                   'Review Date', 'Change Project', 'PRD Version', 'Note']
UI_MEETING_SHEET = 'PRD Appointments (UI)'
UI_MEETING_HEADERS = ['PRD ID', 'Date', 'Start', 'End', 'Title', 'PRD Node ID',
                      'Project', 'Owner', 'Attendees', 'Status', 'Follow Actions']


def norm(value):
    return re.sub(r'\s+', ' ', str(value if value is not None else '')).strip().lower()


def to_date(value):
    text = str(value if value is not None else '').strip()
    m = re.match(r'^(\d{4})-(\d{2})-(\d{2})$', text)
    if m:
        return datetime.date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
    return text or None


def find_header(rows, needles):
    for i, row in enumerate(rows[:15]):
        heads = [norm(c) for c in row]
        if all(any(h.startswith(n) for h in heads) for n in needles):
            return i
    return -1


def col_of(headers, prefix, exact=False):
    for i, h in enumerate(headers):
        if (h == prefix) if exact else h.startswith(prefix):
            return i
    return -1


def atomic_save(wb, path):
    backup = path + '.bak'
    if not os.path.exists(backup):
        shutil.copy2(path, backup)
    tmp = path + '.tmp'
    wb.save(tmp)
    os.replace(tmp, path)


# ---------------------------------------------------------------- node patch

def patch_nodes(updates):
    if not updates:
        return 0
    wb = openpyxl.load_workbook(MASTER_PATH)
    touched = 0
    missing = []

    for ws in wb.worksheets:
        rows = list(ws.iter_rows(max_row=min(ws.max_row, 15), values_only=True))
        head_row = find_header(rows, ['node id'])
        if head_row < 0:
            continue
        headers = [norm(c) for c in rows[head_row]]
        i_node = col_of(headers, 'node id', exact=True)
        if i_node < 0:
            continue
        row_index = {str(ws.cell(row=r, column=i_node + 1).value or '').strip(): r
                     for r in range(head_row + 2, ws.max_row + 1)}
        for upd in updates:
            node_id = str(upd.get('nodeId') or '').strip()
            r = row_index.get(node_id)
            if not r:
                continue
            fields = upd.get('fields') or {}
            for key, value in fields.items():
                header = NODE_FIELDS.get(key)
                if not header:
                    continue
                c = col_of(headers, norm(header))
                if c < 0:
                    c = ws.max_column
                    ws.cell(row=head_row + 1, column=c + 1, value=header)
                    headers.append(norm(header))
                cell = ws.cell(row=r, column=c + 1)
                if key == 'reviewDate':
                    cell.value = to_date(value)
                else:
                    cell.value = None if value in ('', None) else value
            touched += 1
        if touched:
            i_mod = col_of(headers, 'last modified')
            if i_mod >= 0:
                today = datetime.date.today()
                for upd in updates:
                    r = row_index.get(str(upd.get('nodeId') or '').strip())
                    if r:
                        ws.cell(row=r, column=i_mod + 1, value=today)

    for upd in updates:
        if not any(str(upd.get('nodeId') or '').strip() for _ in [0]):
            missing.append(upd)
    if touched:
        atomic_save(wb, MASTER_PATH)
    return touched


def append_history(entries):
    if not entries:
        return 0
    wb = openpyxl.load_workbook(MASTER_PATH)
    if HISTORY_SHEET in wb.sheetnames:
        ws = wb[HISTORY_SHEET]
    else:
        ws = wb.create_sheet(HISTORY_SHEET)
        ws.append(HISTORY_HEADERS)
        for i, width in enumerate([20, 24, 34, 14, 18, 14, 26, 14, 48], start=1):
            ws.column_dimensions[get_column_letter(i)].width = width
    for e in entries:
        ws.append([
            e.get('ts') or datetime.datetime.now().strftime('%Y-%m-%d %H:%M'),
            e.get('nodeId') or '',
            e.get('name') or '',
            e.get('result') or '',
            e.get('reviewer') or '',
            e.get('reviewDate') or '',
            e.get('project') or '',
            e.get('version') or '',
            e.get('note') or '',
        ])
    atomic_save(wb, MASTER_PATH)
    return len(entries)


# ------------------------------------------------------------- meeting patch

def patch_meetings(updates, created=None):
    if not updates and not created:
        return 0
    wb = openpyxl.load_workbook(PRD_PATH)
    ws = wb['PRD Requirement List'] if 'PRD Requirement List' in wb.sheetnames else wb.worksheets[0]
    rows = list(ws.iter_rows(max_row=min(ws.max_row, 15), values_only=True))
    head_row = find_header(rows, ['prd topic'])
    headers = [norm(c) for c in rows[head_row]] if head_row >= 0 else []
    i_id = col_of(headers, 'id', exact=True)
    row_index = {}
    if i_id >= 0:
        for r in range(head_row + 2, ws.max_row + 1):
            key = str(ws.cell(row=r, column=i_id + 1).value or '').strip()
            if key:
                row_index[key] = r

    touched = 0
    for upd in updates or []:
        prd_id = str(upd.get('prdId') or '').strip()
        r = row_index.get(prd_id)
        if not r:
            continue
        for key, value in (upd.get('fields') or {}).items():
            header = MEETING_FIELDS.get(key)
            if not header:
                continue
            c = col_of(headers, norm(header))
            if c < 0:
                continue
            cell = ws.cell(row=r, column=c + 1)
            if key in ('confirmDate', 'closeTarget'):
                cell.value = to_date(value)
            else:
                cell.value = None if value in ('', None) else value
        touched += 1

    if created:
        sheet = wb[UI_MEETING_SHEET] if UI_MEETING_SHEET in wb.sheetnames else None
        if sheet is None:
            sheet = wb.create_sheet(UI_MEETING_SHEET)
            sheet.append(UI_MEETING_HEADERS)
        for m in created:
            sheet.append([
                m.get('prdId') or '', to_date(m.get('date')), m.get('start') or '',
                m.get('end') or '', m.get('title') or '', m.get('prdNodeId') or '',
                m.get('project') or '', m.get('organizer') or '', m.get('attendees') or '',
                m.get('status') or 'Scheduled', m.get('agenda') or ''
            ])

    if touched or created:
        atomic_save(wb, PRD_PATH)
    return touched


# -------------------------------------------------------------------- server

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=APP_DIR, **kwargs)

    def log_message(self, fmt, *args):
        sys.stderr.write('[bridge] %s\n' % (fmt % args))

    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def _json(self, payload, status=200):
        body = json.dumps(payload).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def _file(self, path, content_type):
        if not os.path.exists(path):
            self._json({'ok': False, 'error': 'file not found: ' + path}, 404)
            return
        with open(path, 'rb') as fh:
            data = fh.read()
        self.send_response(200)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-store')
        self._cors()
        self.end_headers()
        self.wfile.write(data)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        if self.path.startswith('/api/health'):
            self._json({
                'ok': True,
                'master': os.path.basename(MASTER_PATH),
                'prd': os.path.basename(PRD_PATH),
                'masterMtime': os.path.getmtime(MASTER_PATH),
                'prdMtime': os.path.getmtime(PRD_PATH),
            })
            return
        if self.path.startswith('/api/master.xlsx'):
            self._file(MASTER_PATH, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
            return
        if self.path.startswith('/api/prd.xlsx'):
            self._file(PRD_PATH, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
            return
        return super().do_GET()

    def do_POST(self):
        if not self.path.startswith('/api/sync'):
            self._json({'ok': False, 'error': 'unknown endpoint'}, 404)
            return
        try:
            length = int(self.headers.get('Content-Length') or 0)
            payload = json.loads(self.rfile.read(length) or b'{}')
        except Exception as err:  # noqa: BLE001
            self._json({'ok': False, 'error': 'bad json: %s' % err}, 400)
            return
        try:
            with LOCK:
                nodes = patch_nodes(payload.get('nodes') or [])
                meetings = patch_meetings(payload.get('meetings') or [], payload.get('newMeetings') or [])
                history = append_history(payload.get('history') or [])
            self._json({'ok': True, 'nodes': nodes, 'meetings': meetings, 'history': history})
        except PermissionError as err:
            self._json({'ok': False, 'error': 'workbook is open in Excel (%s). Close it and retry.' % err}, 423)
        except Exception as err:  # noqa: BLE001
            traceback.print_exc()
            self._json({'ok': False, 'error': str(err)}, 500)


def main():
    global MASTER_PATH, PRD_PATH
    ap = argparse.ArgumentParser()
    ap.add_argument('--master', required=True, help='Architecture master list .xlsx')
    ap.add_argument('--prd', required=True, help='PRD appointment & checking .xlsx')
    ap.add_argument('--port', type=int, default=8765)
    args = ap.parse_args()

    MASTER_PATH = os.path.abspath(args.master)
    PRD_PATH = os.path.abspath(args.prd)
    for path in (MASTER_PATH, PRD_PATH):
        if not os.path.exists(path):
            sys.exit('missing file: ' + path)
    if not mimetypes.guess_type('a.js')[0]:
        mimetypes.add_type('application/javascript', '.js')

    print('master : %s' % MASTER_PATH)
    print('prd    : %s' % PRD_PATH)
    print('open   : http://localhost:%d' % args.port)
    httpd = ThreadingHTTPServer(('127.0.0.1', args.port), Handler)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print('\nstopped')


if __name__ == '__main__':
    main()

#!/usr/bin/env python3
"""Tests for tools/file_bridge.py — verifies that writeback touches only the
target cells and leaves the rest of the workbook (styles, validation, other
sheets) intact.

    python3 -m unittest test.bridge_server_test -v
"""

import importlib.util
import os
import shutil
import tempfile
import unittest

import openpyxl

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UPLOADS = '/workspace/.uploads'
MASTER_SRC = os.path.join(UPLOADS, 'bcc15037-e9f1-4443-9a74-8cba8216e3c6_Planning L4_Architecture_Master List.xlsx')
PRD_SRC = os.path.join(UPLOADS, '32701606-ada5-4777-9322-a4b082a23dbf_PRD appointment& Checking.xlsx')

HAS_FIXTURES = os.path.exists(MASTER_SRC) and os.path.exists(PRD_SRC)


def load_bridge():
    spec = importlib.util.spec_from_file_location(
        'file_bridge', os.path.join(ROOT, 'tools', 'file_bridge.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def cell_map(path):
    wb = openpyxl.load_workbook(path)
    out = {}
    for ws in wb.worksheets:
        for row in ws.iter_rows():
            for cell in row:
                if cell.value is not None:
                    out[(ws.title, cell.coordinate)] = cell.value
    return out


@unittest.skipUnless(HAS_FIXTURES, 'source workbooks not available')
class BridgeWritebackTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix='bridge-srv-')
        self.master = os.path.join(self.tmp, 'master.xlsx')
        self.prd = os.path.join(self.tmp, 'prd.xlsx')
        shutil.copy2(MASTER_SRC, self.master)
        shutil.copy2(PRD_SRC, self.prd)
        self.before_master = cell_map(self.master)
        self.before_prd = cell_map(self.prd)

        self.bridge = load_bridge()
        self.bridge.MASTER_PATH = self.master
        self.bridge.PRD_PATH = self.prd

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_node_patch_touches_a_single_cell(self):
        n = self.bridge.patch_nodes([
            {'nodeId': 'ISG-PLN-DP-1', 'fields': {'evaluationResult': 'Rejected'}}
        ])
        self.assertEqual(n, 1)

        after = cell_map(self.master)
        changed = {k: (self.before_master.get(k), after.get(k))
                   for k in set(self.before_master) | set(after)
                   if self.before_master.get(k) != after.get(k)}
        self.assertEqual(list(changed.values()), [('Passed', 'Rejected')])

    def test_formatting_and_validation_survive(self):
        ws_before = openpyxl.load_workbook(self.master)['ISG L4 Master']
        dv_before = len(ws_before.data_validations.dataValidation)
        fill_before = ws_before['A2'].fill.fgColor.rgb

        self.bridge.patch_nodes([
            {'nodeId': 'ISG-PLN-DP-1', 'fields': {'evaluationResult': 'Rejected'}}
        ])
        ws_after = openpyxl.load_workbook(self.master)['ISG L4 Master']
        self.assertEqual(len(ws_after.data_validations.dataValidation), dv_before)
        self.assertEqual(ws_after['A2'].fill.fgColor.rgb, fill_before)

    def test_new_field_gets_a_column(self):
        self.bridge.patch_nodes([
            {'nodeId': 'ISG-PLN-DP-1', 'fields': {'prdVersion': 'v9.9'}}
        ])
        ws = openpyxl.load_workbook(self.master)['ISG L4 Master']
        headers = [str(c.value or '').strip() for c in ws[2]]
        self.assertIn('PRD Version (Active)', headers)
        col = headers.index('PRD Version (Active)') + 1
        row = next(r for r in range(3, ws.max_row + 1)
                   if ws.cell(row=r, column=2).value == 'ISG-PLN-DP-1')
        self.assertEqual(ws.cell(row=row, column=col).value, 'v9.9')

    def test_history_is_appended_to_its_own_sheet(self):
        count = self.bridge.append_history([{
            'ts': '2026-11-18 21:00', 'nodeId': 'ISG-PLN-DP-1', 'name': 'Manage Forecast Hierachy',
            'result': 'Rejected', 'reviewer': 'Jiaqi', 'reviewDate': '2026-11-18',
            'project': 'BY Migration', 'version': 'v2.3', 'note': 'audit row'
        }])
        self.assertEqual(count, 1)
        wb = openpyxl.load_workbook(self.master)
        self.assertIn('Review History', wb.sheetnames)
        ws = wb['Review History']
        self.assertEqual(ws.max_row, 2)
        self.assertEqual(ws.cell(row=2, column=2).value, 'ISG-PLN-DP-1')

    def test_meeting_patch_and_new_booking(self):
        n = self.bridge.patch_meetings(
            [{'prdId': 'PRD-10', 'fields': {'actionOwner': 'Bridge Tester', 'actionStatus': 'Open'}}],
            [{'title': 'Ad hoc', 'date': '2026-12-02', 'start': '10:00', 'end': '11:00'}]
        )
        self.assertEqual(n, 1)
        wb = openpyxl.load_workbook(self.prd)
        self.assertIn('PRD Appointments (UI)', wb.sheetnames)
        self.assertEqual(wb['PRD Appointments (UI)'].max_row, 2)

        ws = wb['PRD Requirement List']
        headers = [str(c.value or '').strip() for c in ws[5]]
        row = next(r for r in range(6, ws.max_row + 1)
                   if str(ws.cell(row=r, column=1).value).strip() == 'PRD-10')
        owner_col = headers.index('Action Owner') + 1
        self.assertEqual(ws.cell(row=row, column=owner_col).value, 'Bridge Tester')

    def test_unknown_node_is_ignored(self):
        self.assertEqual(self.bridge.patch_nodes([
            {'nodeId': 'NOT-A-REAL-NODE', 'fields': {'evaluationResult': 'Passed'}}
        ]), 0)


if __name__ == '__main__':
    unittest.main()

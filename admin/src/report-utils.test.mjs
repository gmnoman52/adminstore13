import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ordersCsv, summarizeOrders } from './report-utils.mjs';

test('summarizes completed, open and cancelled orders separately', () => {
  const orders = [{ status: 'completed', total_paisa: 12550 }, { status: 'cancelled', total_paisa: 8000 }, { status: 'pending', total_paisa: 100 }];
  assert.deepEqual(summarizeOrders(orders), { count: 3, completed: 1, completedPaisa: 12550, cancelled: 1, open: 1 });
});

test('escapes CSV and spreadsheet formulas', () => {
  const csv = ordersCsv([{ id: '=1+1', created_at: '2026-11-12', status: 'pending', fulfilment: 'pick"up', total_paisa: 12550 }]);
  assert.match(csv, /"'=1\+1"/);
  assert.match(csv, /"pick""up"/);
  assert.match(csv, /"125\.50"/);
});

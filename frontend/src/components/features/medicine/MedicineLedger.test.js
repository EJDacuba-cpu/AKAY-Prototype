import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';

const cacheDir = join(tmpdir(), `akay-ledger-ssr-${process.pid}`);
const server = await createServer({ configFile: false, cacheDir, plugins: [react()], optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false, ws: false, watch: null } });
after(async () => { await server.close(); rmSync(cacheDir, { recursive: true, force: true }); });
const { default: MedicineInventoryTable, MedicineQuantity } = await server.ssrLoadModule('/src/components/features/medicine/MedicineInventoryTable.jsx');
const { MedicineDetailsContent } = await server.ssrLoadModule('/src/pages/shared/MedicineDetailsPage.jsx');
const { default: StockForm } = await server.ssrLoadModule('/src/components/features/medicine/MedicineInventoryActionModal.jsx');
const { default: History } = await server.ssrLoadModule('/src/components/features/medicine/MedicineInventoryHistory.jsx');
const { queryKeys } = await server.ssrLoadModule('/src/utils/queryKeys.js');
const item = { id: '7', name: 'Paracetamol', category: 'Basic Medicines', quantity: 10, unit: 'tablets', itemType: 'medicine', stockSummary: { recorded: 10, available: 4, quarantined: 3, expired: 3, unassigned: 0 }, expiryGroups: [
  { id: 1, expiration_date: '2099-12-31', available_quantity: 4, quarantined_quantity: 3 },
  { id: 2, expiration_date: '2000-01-01', available_quantity: 3, quarantined_quantity: 0 },
] };
const render = component => renderToStaticMarkup(createElement(MemoryRouter, null, component));

test('medicine names link directly to facility details without expandable rows or destructive row actions', () => {
  for (const role of ['bhc', 'rhu']) {
    const html = render(createElement(MedicineInventoryTable, { items: [item], role, canManage: false }));
    assert.match(html, new RegExp(`href="/${role}/${role === 'bhc' ? 'medicine-availability' : 'medicine-management'}/7"`));
    assert.doesNotMatch(html, /aria-expanded="(?:true|false)"[^>]*>[^<]*Paracetamol|medicine-details-row|Delete Medicine|Edit Medicine/);
  }
});
test('quantity has a single value when equal and a breakdown only when different', () => {
  const equal = render(createElement(MedicineQuantity, { item: { ...item, stockSummary: { available: 10 } } }));
  assert.doesNotMatch(equal, /available to dispense|recorded/i);
  const differs = render(createElement(MedicineQuantity, { item }));
  assert.match(differs, /4 available to dispense/);
});
test('Details uses full-page sections, FEFO order and permission-gated group and management actions', () => {
  for (const canManage of [false, true]) {
    const html = render(createElement(MedicineDetailsContent, { medicine: item, role: 'bhc', canManage }));
    assert.doesNotMatch(html, /role="dialog"|>Eligible</);
    assert.match(html, /Available for Dispensing/);
    assert.match(html, /id="expiry-groups"/);
    assert.ok(html.indexOf('Jan 1, 2000') < html.indexOf('Dec 31, 2099'));
    if (canManage) assert.match(html, /Edit Details|Quarantine|Release|Dispose/);
    else assert.doesNotMatch(html, />Edit Details<|>Quarantine<|>Release<|>Dispose<|>Remove Item</);
  }
});
test('quarantine and disposal reuse the same focused form with selected group, reason and confirmation', () => {
  for (const [mode, label] of [['quarantine', 'Quarantine Stock'], ['quarantine_disposal', 'Dispose Stock']]) {
    const html = render(createElement(StockForm, { open: true, item, mode, initialGroupId: 1 }));
    assert.match(html, new RegExp(`Confirm ${label}`));
    assert.match(html, /Reason/);
    assert.match(html, /Expiry Group/);
    assert.match(html, /Stock stays recorded/);
  }
});
test('inline history renders allocation provenance, shortage and paging without a dialog', () => {
  const user = { id: 1, barangayHealthCenterId: 1 };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(queryKeys.medicineTransactions(user, item.id, 1), { data: { current_page: 1, last_page: 2, data: [{ transaction_type: 'dispense', quantity_before: 10, quantity_delta: -5, quantity_after: 7, discrepancy: -2, reason: 'Actual given', actor: { name: 'Clinic Staff' }, allocations: [{ expiry_group_id: 1, available_before: 4, available_after: 1, quarantined_before: 3, quarantined_after: 3 }] }] } });
  const html = render(createElement(QueryClientProvider, { client }, createElement(History, { item, user })));
  assert.match(html, /Unallocated actual dispensing: 2/);
  assert.match(html, /Clinic Staff/);
  assert.match(html, /Dec 31, 2099/);
  assert.match(html, /Next/);
  assert.doesNotMatch(html, /role="dialog"/);
  client.clear();
});

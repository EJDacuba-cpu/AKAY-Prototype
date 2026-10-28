import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Keep the test optimizer separate from any running Vite dev server.
const cacheDir = join(tmpdir(), `akay-vite-ssr-medicine-${process.pid}`);
const server = await createServer({
  configFile: false,
  cacheDir,
  plugins: [react()],
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
});
after(async () => {
  await server.close();
  rmSync(cacheDir, { recursive: true, force: true });
});
const { default: MedicineFormModal } = await server.ssrLoadModule(
  "/src/components/features/medicine/MedicineFormModal.jsx",
);
const service = await server.ssrLoadModule("/src/services/medicineService.js");
const clinicalService = await server.ssrLoadModule('/src/services/healthRecordService.js');
const { default: MedicineDetailsModal } = await server.ssrLoadModule('/src/components/features/medicine/MedicineDetailsModal.jsx');
const { default: MedicineAllocationFields } = await server.ssrLoadModule('/src/components/features/medicine/MedicineAllocationFields.jsx');
const { queryKeys } = await server.ssrLoadModule('/src/utils/queryKeys.js');
const { getFacilityCalendarDate } = await server.ssrLoadModule('/src/utils/medicineInventoryStatus.js');
const item = { id: "7", name: "Paracetamol", quantity: 8, unit: "tablets" };
const render = (props = {}) => renderToStaticMarkup(
  createElement(MedicineFormModal, { open: true, mode: "edit", item, ...props }),
);

test("edit displays the current stock as read-only, including zero stock", () => {
  for (const quantity of [8, 0]) {
    const html = render({ item: { ...item, quantity } });
    const stock = [...html.matchAll(/<input\b[^>]*>/g)]
      .map(([input]) => input)
      .find((input) => /\sreadonly=""/i.test(input));
    assert.ok(stock, "Recorded Stock must be a read-only input");
    assert.match(stock, new RegExp(`value="${quantity} tablets"`));
    assert.doesNotMatch(stock, /\brequired=""/);
    assert.doesNotMatch(html, /Current quantity|Resulting quantity|stock correction requires/i);
  }
});

test("add keeps an editable opening balance", () => {
  const html = render({ mode: "add", item: null });
  assert.match(html, /Opening Balance/);
  const opening = [...html.matchAll(/<input\b[^>]*>/g)]
    .map(([input]) => input)
    .find((input) => input.includes('type="number"'));
  assert.ok(opening);
  assert.doesNotMatch(opening, /\s(?:readonly|disabled)=""/i);
  assert.doesNotMatch(html, /Recorded Stock/);
});

test("pending reconciliation stays visible without exposing correction fields", () => {
  const html = render({ item: { ...item, reconciliationRequired: true } });
  assert.match(html, /dispensing discrepancy/);
  assert.doesNotMatch(html, /Explain why the recorded stock|Confirm or correct the quantity/);
});

test('inventory query cache separates staff and current facility scopes', () => {
  const user = { id: 1, barangayHealthCenterId: 10 };
  assert.notDeepEqual(queryKeys.medicineAvailability('bhc', user), queryKeys.medicineAvailability('bhc', { ...user, barangayHealthCenterId: 11 }));
  assert.notDeepEqual(queryKeys.medicineAvailability('bhc', user), queryKeys.medicineAvailability('bhc', { ...user, id: 2 }));
});

for (const facility of ["Bhc", "Rhu"]) {
  test(`${facility} metadata requests discard quantity and reason even if supplied by a caller`, async (t) => {
    let request;
    t.mock.method(globalThis, "fetch", async (url, options) => {
      request = { url, ...options, body: JSON.parse(options.body) };
      return Response.json({ data: item });
    });
    await service[`update${facility}Medicine`]("7", {
      name: "Updated Paracetamol",
      quantity: "999",
      reason: "Must not turn metadata editing into a correction",
      reconciliation_required: false,
      availability_status: "Available",
      lowStockThreshold: "5",
    });
    assert.match(request.url, /\/medicines\/7$/);
    assert.equal(request.method, "PATCH");
    assert.deepEqual(request.body, {
      name: "Updated Paracetamol",
      category: null,
      description: null,
      low_stock_threshold: 5,
      unit: "pcs",
    });
  });

  test(`${facility} creation still sends the opening quantity and idempotency key`, async (t) => {
    let request;
    t.mock.method(globalThis, "fetch", async (url, options) => {
      request = { url, ...options, body: JSON.parse(options.body) };
      return Response.json({ data: item });
    });
    await service[`add${facility}Medicine`](
      { name: "New Paracetamol", quantity: "12", lowStockThreshold: "5" },
      { idempotencyKey: "creation-key" },
    );
    assert.equal(request.method, "POST");
    assert.equal(request.body.quantity, 12);
    assert.equal(request.headers["Idempotency-Key"], "creation-key");
    assert.equal(Object.hasOwn(request.body, "reason"), false);
  });
}

test('edit cannot rewrite received expiry dates or item type', () => {
  const html = render();
  assert.doesNotMatch(html, /type="date"|aria-label="Item Type"/);
  assert.match(html, /Expiry dates belong to received stock groups/);
});

test('Details exposes group pools and permission-gates disposition; expired release is absent', () => {
  const medicine = { ...item, itemType: 'medicine', stockSummary: { recorded: 12, available: 2, quarantined: 5, expired: 5, unassigned: 0 }, expiryGroups: [
    { id: 1, expiration_date: '2099-12-31', available_quantity: 2, quarantined_quantity: 0 },
    { id: 2, expiration_date: '2000-01-01', available_quantity: 5, quarantined_quantity: 5 },
  ] };
  for (const allowed of [false, true]) {
    const user = { id: 10, permissions: allowed ? ['inventory.manage'] : [] };
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    client.setQueryData([...queryKeys.medicineTransactions(user, item.id), 'details', getFacilityCalendarDate()], medicine);
    const html = renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(MedicineDetailsModal, { open: true, item, user })));
    assert.match(html, /Eligible available|Quarantined/);
    assert.match(html, /Expired · unavailable/);
    assert.doesNotMatch(html, />Release</);
    if (allowed) { assert.match(html, />Quarantine</); assert.match(html, />Dispose</); }
    else { assert.doesNotMatch(html, />Quarantine<|>Dispose</); }
    client.clear();
  }
});

test('manual empty allocation explicitly previews shortage and reason field', () => {
  const html = renderToStaticMarkup(createElement(MedicineAllocationFields, { medicine: item, quantity: 3, value: { allocations: [], override_reason: 'Unrecorded stock' } }));
  assert.match(html, /Unallocated actual dispensing: 3/);
  assert.match(html, /Override reason \(required\)/);
  assert.match(html, /Unrecorded stock/);
});

test('inventory response with non-array expiry groups renders the dispensing fields safely', async (t) => {
  let groups;
  t.mock.method(globalThis, 'fetch', async () => Response.json({ data: { data: [{ ...item, expiry_groups: groups }] } }));
  for (const malformed of [{}, '[]', 1, null]) {
    groups = malformed;
    const [medicine] = await service.loadMedicineAvailability();
    assert.deepEqual(medicine.expiryGroups, []);
    assert.deepEqual(medicine.expiry_groups, []);
    const html = renderToStaticMarkup(createElement(MedicineAllocationFields, { medicine, quantity: 3 }));
    assert.match(html, /Automatic FEFO/);
    assert.match(html, /Unallocated actual dispensing: 3/);
  }
});

test('group disposition request sends partial quantity, reason and stable key', async (t) => {
  let request;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    request = { url, ...options, body: JSON.parse(options.body) };
    return Response.json({ data: { medicine: item } });
  });
  await service.medicineGroupAction(7, { action: 'quarantine_disposal', expiry_group_id: 2, quantity: 3, reason: 'Damaged seal' }, { idempotencyKey: 'same-operation' });
  assert.match(request.url, /\/medicines\/7\/group-action$/);
  assert.deepEqual(request.body, { action: 'quarantine_disposal', expiry_group_id: 2, quantity: 3, reason: 'Damaged seal', idempotency_key: 'same-operation' });
});

test('clinical submission retains explicit unallocated manual and vaccine intent', async (t) => {
  let request;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    request = { url, ...options, body: JSON.parse(options.body) };
    return Response.json({ data: { id: 1 } });
  });
  await clinicalService.createBhcHealthRecord({ recordType: 'Immunization', selectedPrograms: ['EPI'],
    dispensedMedicines: [{ medicineId: 7, quantity: 3, confirmedGiven: true, allocations: [], override_reason: 'Actual unrecorded supply' }],
    immunizationData: { vaccineEntries: [{ vaccineName: 'BCG', medicineId: 8, inventoryQuantity: 1, confirmedGiven: true, allocations: [{ expiry_group_id: 2, quantity: 1 }], override_reason: 'Actual vial used' }] },
  }, { idempotencyKey: 'clinical-key' });
  assert.deepEqual(request.body.dispensed_medicines[0].allocations, []);
  assert.equal(request.body.dispensed_medicines[0].override_reason, 'Actual unrecorded supply');
  assert.deepEqual(request.body.immunization_data.vaccineEntries[0].allocations, [{ expiry_group_id: 2, quantity: 1 }]);
});

for (const [operation, action] of [["restock", "restockMedicine"], ["deduct", "deductMedicine"]]) {
  test(`${operation} retains its explicit stock quantity, reason, and idempotency key`, async (t) => {
    let request;
    t.mock.method(globalThis, "fetch", async (url, options) => {
      request = { url, ...options, body: JSON.parse(options.body) };
      return Response.json({ data: { medicine: item, transaction: {} } });
    });
    await service[action](
      "7",
      { quantity: "2", reason: " Inventory stock action ", expiry_group_id: 3, expiryDate: "2099-12-31" },
      { idempotencyKey: "stock-action-key" },
    );
    assert.match(request.url, new RegExp(`/medicines/7/${operation}$`));
    assert.equal(request.method, "POST");
    assert.deepEqual(request.body, { quantity: 2, reason: "Inventory stock action", ...(operation === "restock" ? { expiration_date: "2099-12-31", expiry_not_applicable: false } : { expiry_group_id: 3 }) });
    assert.equal(request.headers["Idempotency-Key"], "stock-action-key");
  });
}

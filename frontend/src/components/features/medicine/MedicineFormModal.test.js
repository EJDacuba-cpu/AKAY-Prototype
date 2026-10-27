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
      expiration_date: null,
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

for (const [operation, action] of [["restock", "restockMedicine"], ["deduct", "deductMedicine"]]) {
  test(`${operation} retains its explicit stock quantity, reason, and idempotency key`, async (t) => {
    let request;
    t.mock.method(globalThis, "fetch", async (url, options) => {
      request = { url, ...options, body: JSON.parse(options.body) };
      return Response.json({ data: { medicine: item, transaction: {} } });
    });
    await service[action](
      "7",
      { quantity: "2", reason: " Inventory stock action " },
      { idempotencyKey: "stock-action-key" },
    );
    assert.match(request.url, new RegExp(`/medicines/7/${operation}$`));
    assert.equal(request.method, "POST");
    assert.deepEqual(request.body, { quantity: 2, reason: "Inventory stock action" });
    assert.equal(request.headers["Idempotency-Key"], "stock-action-key");
  });
}

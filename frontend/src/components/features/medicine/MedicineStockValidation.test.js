import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { Window } from 'happy-dom';
import { createElement, act } from 'react';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';

const dom = new Window({ url: 'http://localhost/' });
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLInputElement', 'Event', 'CustomEvent', 'Node']) Object.defineProperty(globalThis, key, { configurable: true, value: key === 'window' ? dom : dom[key] });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = await import('react-dom/client');
const cacheDir = mkdtempSync(join(tmpdir(), 'akay-stock-validation-'));
const server = await createServer({ cacheDir, configFile: false, plugins: [react()], optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false, ws: false, watch: null } });
const { default: Form } = await server.ssrLoadModule('/src/components/features/medicine/MedicineFormModal.jsx');
const { default: Dispense } = await server.ssrLoadModule('/src/components/features/medicine/DispensedMedicinesSection.jsx');
after(async () => {
  await server.close(); await dom.happyDOM.close();
  if (!resolve(cacheDir).startsWith(resolve(tmpdir()) + sep)) throw new Error('Unexpected cache path');
  rmSync(cacheDir, { recursive: true, force: true });
});
async function mount(Component, props) {
  const container = document.createElement('div'); document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(createElement(Component, props)));
  return { container, close: async () => { await act(async () => root.unmount()); container.remove(); } };
}
async function change(field, value) {
  await act(async () => {
    if (field.tagName === 'SELECT') { field.value = value; field.dispatchEvent(new Event('change', { bubbles: true })); }
    else { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(field, value); field.dispatchEvent(new Event('input', { bubbles: true })); }
  });
}
for (const role of ['rhu', 'bhc']) {
  test(`${role} edit restores and preserves legacy category/unit and saved vaccine type`, async () => {
    let saved;
    const view = await mount(Form, { open: true, mode: 'edit', role, item: { name: 'Legacy', category: 'Basic Medicines', unit: 'boxes', quantity: 10, itemType: 'vaccine' }, onSubmit: async payload => { saved = payload; } });
    try {
      assert.deepEqual([...document.querySelectorAll('select')].map(select => select.value), ['Basic Medicines', 'vaccine', 'boxes']);
      await act(async () => document.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
      assert.equal(saved.category, 'Basic Medicines'); assert.equal(saved.unit, 'boxes'); assert.equal(saved.itemType, 'vaccine');
    } finally { await view.close(); }
  });
  test(`${role} dispensing disables invalid confirmation and clears errors for valid quantities`, async () => {
    let saved;
    const medicine = { id: '7', name: 'Paracetamol', category: 'General Medicines', unit: 'tablets', quantity: 10, stockSummary: { available: 10 }, expiry_groups: [{ id: 1, expiration_date: '2099-01-01', available_quantity: 10 }] };
    const view = await mount(Dispense, { inventory: [medicine], facilityLabel: role.toUpperCase(), onChange: items => { saved = items; } });
    try {
      const selects = view.container.querySelectorAll('select');
      await change(selects[0], 'General Medicines'); await change(selects[1], '7');
      const quantity = view.container.querySelector('input[type="number"]');
      const button = [...view.container.querySelectorAll('button')].find(node => node.textContent.includes('Confirm Dispensed/Given'));
      for (const invalid of ['15', '0', '-1', '1.5']) { await change(quantity, invalid); assert.equal(button.disabled, true); assert.ok(view.container.querySelector('[role="alert"]')); }
      await change(quantity, '15');
      assert.ok(view.container.textContent.includes('Insufficient stock. Only 10 tablets are available. Please enter a quantity within the available stock.'));
      for (const valid of ['5', '10']) { await change(quantity, valid); assert.equal(button.disabled, false); assert.equal(view.container.querySelector('[role="alert"]'), null); }
      await act(async () => button.click());
      assert.equal(saved[0].quantity, 10); assert.equal(saved[0].unit, 'tablets');
    } finally { await view.close(); }
  });
}

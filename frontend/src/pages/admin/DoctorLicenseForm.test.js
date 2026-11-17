import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { createElement, act } from "react";
import { Window } from "happy-dom";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { MemoryRouter } from "react-router";

const dom = new Window({ url: "http://localhost/" });
for (const key of ["window", "document", "navigator", "HTMLElement", "HTMLInputElement", "Event", "CustomEvent", "Node"]) {
  Object.defineProperty(globalThis, key, { configurable: true, value: key === "window" ? dom : dom[key] });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = await import("react-dom/client");
const requests = [];
globalThis.accountFormApi = async (path, options) => {
  if (options?.method === "POST") requests.push(options.body);
  return { available: true, data: { id: 1 }, invite: { delivery: "sent" } };
};
const cacheDir = mkdtempSync(join(tmpdir(), "akay-doctor-license-"));
const server = await createServer({
  configFile: false, cacheDir, optimizeDeps: { noDiscovery: true, include: [] },
  plugins: [{ name: "account-form-fixtures", enforce: "pre", load(id) {
    const path = id.replaceAll("\\", "/");
    if (path.endsWith("/layout/DashboardLayout.jsx")) return "export default function Layout({children}) { return children; }";
    if (path.endsWith("/services/apiClient.js")) return "export const apiRequest = (...args) => globalThis.accountFormApi(...args); export const unwrapData = value => value.data;";
    if (path.endsWith("/services/notificationService.js")) return "export const notifyNotificationChange = () => {};";
    if (path.endsWith("/services/facilityService.js")) return "export const getBarangayHealthCenters = async () => []; export const getRuralHealthUnits = async () => [{id:1,name:'Test RHU',status:'active'}];";
    if (path.endsWith("/services/staffRolesService.js")) return `export const getStaffRoles = async () => ({roles: ['doctor','nurse','intake_staff'].map(key => ({key,tier:'rhu',label:key === 'doctor' ? 'Doctor' : key === 'nurse' ? 'Nurse' : 'RHU Staff',defaults:['patients.register']})),available:{rhu:['patients.register']}});`;
    if (path.endsWith("/access/FacilityPickerModal.jsx")) return "import {createElement} from 'react'; export default function Picker({facilities,onSelect}) { return createElement('button',{type:'button',onClick:()=>onSelect(facilities[0])},'Select Test RHU'); }";
  } }, react()],
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
});
const { default: AddUser } = await server.ssrLoadModule("/src/pages/admin/AddUser.jsx");
after(async () => {
  await server.close();
  await dom.happyDOM.close();
  delete globalThis.accountFormApi;
  if (!resolve(cacheDir).startsWith(resolve(tmpdir()) + sep)) throw new Error("Unexpected cache directory");
  rmSync(cacheDir, { recursive: true, force: true });
});

test("Doctor Next and review shortcut require PRC; Back preserves it and submission sends the string", async () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const button = (text) => [...document.querySelectorAll("button")].find((node) => node.textContent.trim() === text || node.getAttribute("aria-label") === text);
  const click = async (text) => { assert.ok(button(text), text); await act(async () => button(text).click()); };
  const input = (label) => [...container.querySelectorAll("label")].find((node) => node.textContent.trim().startsWith(label))?.querySelector("input");
  const type = async (field, value) => { assert.ok(field); await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  }); };
  try {
    await act(async () => root.render(createElement(MemoryRouter, {}, createElement(AddUser))));
    await act(async () => [...container.querySelectorAll("button")].find((node) => node.textContent.startsWith("Rural Health Unit")).click());
    await click("Select Test RHU");
    await click("Continue");
    await type(input("Full name"), "Doctor Example");
    await type(input("Email"), "doctor@example.test");
    await type(input("Contact number"), "09171234567");
    await click("Continue");
    assert.ok(input("PRC License No."));
    await click("Continue");
    assert.match(container.textContent, /PRC License No. is required for Doctor accounts\./);
    assert.equal(input("PRC License No.").getAttribute("aria-invalid"), "true");
    await type(input("PRC License No."), "   ");
    await click("Continue");
    assert.ok(input("PRC License No."));
    await click("Nurse");
    assert.equal(Boolean(input("PRC License No.")), false);
    await click("RHU Staff");
    assert.equal(Boolean(input("PRC License No.")), false);
    await click("Doctor");
    await type(input("PRC License No."), "0012345");
    assert.doesNotMatch(container.textContent, /PRC License No. is required/);
    await click("Continue");
    assert.match(container.querySelector("dl").textContent, /PRC License No\.0012345/);
    await click("Back");
    assert.equal(input("PRC License No.").value, "0012345");
    await type(input("PRC License No."), "");
    await click("Review & Create");
    assert.ok(input("PRC License No."));
    await type(input("PRC License No."), " 0012345 ");
    await click("Continue");
    await act(async () => container.querySelector('input[type="checkbox"]').click());
    await click("Create Account");
    assert.equal(requests.length, 1);
    assert.equal(requests[0].prc_license_number, "0012345");
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});


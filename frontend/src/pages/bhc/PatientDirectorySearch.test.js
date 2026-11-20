import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { act, createElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { Window } from "happy-dom";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";

const dom = new Window({ url: "http://localhost/" });
for (const key of ["window", "document", "navigator", "HTMLElement", "HTMLInputElement", "Event", "Node"]) {
  Object.defineProperty(globalThis, key, { configurable: true, value: key === "window" ? dom : dom[key] });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = await import("react-dom/client");
const cacheDir = mkdtempSync(join(tmpdir(), "akay-directory-search-"));
const server = await createServer({
  configFile: false, cacheDir, optimizeDeps: { noDiscovery: true, include: [] },
  plugins: [{ name: "directory-search-layout", enforce: "pre", load(id) {
    if (id.replaceAll("\\", "/").endsWith("/layout/DashboardLayout.jsx")) {
      return "export default function Layout({children}) { return children; }";
    }
  } }, react()],
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
});
const { default: PatientsModule } = await server.ssrLoadModule("/src/pages/bhc/PatientsModule.jsx");
const { NotificationProvider } = await server.ssrLoadModule("/src/hooks/useNotificationsContext.jsx");
const { queryKeys } = await server.ssrLoadModule("/src/utils/queryKeys.js");

after(async () => {
  await server.close();
  await dom.happyDOM.close();
  if (!resolve(cacheDir).startsWith(resolve(tmpdir()) + sep)) throw new Error("Unexpected test cache directory");
  rmSync(cacheDir, { recursive: true, force: true });
});

for (const role of ["bhc", "rhu"]) {
  test(`${role} typing keeps the current query until Enter; clear restores the full directory`, async () => {
    const client = new QueryClient({ defaultOptions: { queries: { enabled: false, retry: false, gcTime: Infinity } } });
    const filters = { search: "", sex: "All", barangay: "All Barangays", ageGroup: "All Age Groups", civilStatus: "All Civil Status", dateRegistered: "" };
    for (const search of ["", "anna"]) {
      client.setQueryData([...queryKeys.patients(role), "directory", { ...filters, search }], {
        pages: [{ items: [], meta: { current_page: 1, last_page: 1, total: 0 }, filterOptions: { barangays: [], civilStatuses: [] } }], pageParams: [1],
      });
    }
    const activeSearch = () => client.getQueryCache().getAll().find((query) => query.queryKey.includes("directory") && query.getObserversCount() > 0)?.queryKey.at(-1).search;
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    try {
      await act(async () => root.render(createElement(QueryClientProvider, { client }, createElement(MemoryRouter, { initialEntries: [`/${role}/patients`] }, createElement(NotificationProvider, null, createElement(PatientsModule, { role, basePath: `/${role}` }))))));
      const field = () => container.querySelector('input[aria-label="Search patients"]');
      assert.ok(field());
      for (const text of ["a", "an", "anna"]) {
        await act(async () => {
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(field(), text);
          field().dispatchEvent(new Event("input", { bubbles: true }));
        });
        assert.equal(field().value, text);
        assert.equal(activeSearch(), "", "typing must not change the server query");
      }
      await act(async () => field().dispatchEvent(new dom.KeyboardEvent("keydown", { key: "Enter", isComposing: true, bubbles: true })));
      assert.equal(activeSearch(), "", "IME confirmation must not submit a partial search");
      await act(async () => field().dispatchEvent(new dom.KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
      assert.equal(activeSearch(), "anna");
      await act(async () => container.querySelector('button[aria-label="Clear search"]').click());
      assert.equal(field().value, "");
      assert.equal(activeSearch(), "");
    } finally {
      await act(async () => root.unmount());
      client.clear();
      container.remove();
    }
  });
}

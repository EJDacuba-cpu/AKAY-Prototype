import assert from "node:assert/strict";
import test, { after } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";

const server = await createServer({
  configFile: false,
  cacheDir: "node_modules/.vite-doctor-schedule-tests",
  plugins: [
    {
      name: "doctor-schedule-test-boundaries",
      enforce: "pre",
      load(id) {
        const path = id.replaceAll("\\", "/");
        if (path.endsWith("/components/layout/DashboardLayout.jsx")) {
          return "export default function DashboardLayout({ children }) { return children; }";
        }
        if (path.endsWith("/hooks/useAccess.js")) {
          return "export default function useAccess() { return { can: () => true }; }";
        }
      },
    },
    react(),
  ],
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
});

after(async () => {
  await server.close();
});

const { default: DoctorSchedule } = await server.ssrLoadModule("/src/pages/rhu/DoctorSchedule.jsx");
const { queryKeys } = await server.ssrLoadModule("/src/utils/queryKeys.js");

function renderWithProvidersState(state) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, retryOnMount: false, staleTime: Infinity, gcTime: Infinity } },
  });
  if (state.data !== undefined) {
    client.setQueryData(queryKeys.providers(), state.data);
  }
  const cached = client.getQueryCache().find({ queryKey: queryKeys.providers() });
  if (cached && state.status) {
    cached.setState({
      status: state.status,
      error: state.error || null,
      fetchStatus: state.fetchStatus || "idle",
      dataUpdatedAt: state.dataUpdatedAt ?? (state.data !== undefined ? Date.now() : 0),
    });
  } else if (state.status === "pending" || state.status === "error") {
    client.getQueryCache().build(client, { queryKey: queryKeys.providers(), queryFn: () => Promise.reject(state.error || new Error("pending")) });
    const entry = client.getQueryCache().find({ queryKey: queryKeys.providers() });
    entry.setState({
      status: state.status,
      error: state.error || null,
      fetchStatus: state.fetchStatus || (state.status === "pending" ? "fetching" : "idle"),
      dataUpdatedAt: state.dataUpdatedAt || 0,
      data: state.data,
    });
  }

  const html = renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client },
      createElement(MemoryRouter, null, createElement(DoctorSchedule)),
    ),
  );
  client.clear();
  return html;
}

test("initial HTTP 429 stops the skeleton and shows a rate-limit recovery state", () => {
  const error = Object.assign(new Error("Too Many Attempts."), {
    status: 429,
    retryAfter: 15,
  });
  const html = renderWithProvidersState({ status: "error", error, dataUpdatedAt: 0 });
  assert.doesNotMatch(html, /Loading doctor availability/);
  assert.match(html, /Too Many Requests/);
  assert.match(html, /wait briefly and try again/i);
  assert.match(html, />Retry</);
});

test("backend unreachable stops the skeleton and shows connection recovery", () => {
  const error = Object.assign(new Error("We couldn't reach the server."), {
    status: 0,
    isNetworkError: true,
    code: "NETWORK_ERROR",
  });
  const html = renderWithProvidersState({ status: "error", error, dataUpdatedAt: 0 });
  assert.doesNotMatch(html, /Loading doctor availability/);
  assert.match(html, /Can't Reach the Server|Retry/i);
});

test("cached roster stays visible when a background refresh hits HTTP 429", () => {
  const error = Object.assign(new Error("Too Many Attempts."), { status: 429, retryAfter: 20 });
  const html = renderWithProvidersState({
    status: "error",
    error,
    data: [{ id: "doc-1", name: "Dr. Reyes", specialization: "General Practitioner", availabilityStatus: "Available" }],
    dataUpdatedAt: Date.now(),
  });
  assert.doesNotMatch(html, /Loading doctor availability/);
  assert.match(html, /Dr\. Reyes/);
  assert.match(html, /Unable to refresh doctor availability|Too many requests/i);
});

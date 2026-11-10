import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

let server, loaders, Area, State;
before(async () => {
  server = await createServer({ server: { middlewareMode: true }, appType: "custom" });
  loaders = await server.ssrLoadModule('/src/components/common/loading/SkeletonLoaders.jsx');
  ({ SoftLoadingArea: Area } = await server.ssrLoadModule('/src/components/common/loading/SoftLoadingOverlay.jsx'));
  ({ default: State } = await server.ssrLoadModule('/src/components/common/PageStateWrapper.jsx'));
});
after(async () => { await server?.close(); });
const render = (name, props = {}) => renderToStaticMarkup(React.createElement(loaders.PageSkeletonLoader, { skeleton: name, message: "Loading workspace", ...props }));

test("table profiles reflect the real column counts and compact access rows", () => {
  for (const [name, count] of [["accounts", 5], ["audit", 8], ["medicine", 5], ["dispensing", 4], ["queue", 6], ["access-requests", 6]]) {
    const html = render(name);
    const head = html.match(/<thead[\s\S]*?<\/thead>/)?.[0] || "";
    assert.equal((head.match(/<th\b/g) || []).length, count, name);
  }
  assert.match(render("access-requests"), /height:44px/);
  assert.match(render("access-requests"), /height:36px/);
});

test("nested tables omit the page heading/toolbar while full tables include search and action shapes", () => {
  const full = render("accounts"), nested = render("accounts", { bodyOnly: true });
  assert.match(full, /data-slot="skeleton-toolbar"/);
  assert.doesNotMatch(nested, /data-slot="skeleton-toolbar"/);
  assert.doesNotMatch(nested, /data-slot="skeleton-heading"/);
});

test("skeleton controls are decorative with a single loading announcement", () => {
  for (const name of ["accounts", "medicine-details", "patient-details", "doctor-calendar", "account-form", "notifications"]) {
    const html = render(name);
    assert.equal((html.match(/role="status"/g) || []).length, 1, name);
    assert.match(html, /Loading workspace/);
    assert.doesNotMatch(html, /<(button|input|select|a)\b/, name);
  }
});

test("patient profile mirrors the overview board and facilities keep four wide columns", () => {
  const profile = render("patient-details");
  assert.doesNotMatch(profile, /300px/);
  assert.match(profile, /anatomy-board/);
  assert.match(profile, /data-slot="skeleton-tabs"/);
  assert.match(render("facilities"), /2xl:grid-cols-4/);
});

test("table mobile cards and desktop row structures follow their real breakpoints", () => {
  assert.match(render("medicine"), /hidden[^"<>]*md:block/);
  assert.match(render("medicine"), /md:hidden/);
  assert.match(render("access-requests"), /lg:hidden/);
  assert.match(render("access-requests"), /hidden[^"<>]*lg:block/);
});

test("dashboard roles and calendar/list modes have distinct structures", () => {
  assert.notEqual(render("admin-dashboard"), render("bhc-dashboard"));
  assert.notEqual(render("bhc-dashboard"), render("rhu-dashboard"));
  assert.notEqual(render("follow-ups", { options: { view: "month" } }), render("follow-ups", { options: { view: "list" } }));
});

test("workflow-specific forms and family views follow their loaded compositions", () => {
  assert.match(render("family-details"), /data-slot="skeleton-family-tree"/);
  assert.doesNotMatch(render("family-details", { options: { view: "list" } }), /data-slot="skeleton-family-tree"/);
  assert.match(render("referral-form"), /data-slot="skeleton-referral-form"/);
  assert.notEqual(render("feedback-form"), render("feedback-form", { options: { selected: true } }));
  const slip = render("referral-slip", { options: { role: "rhu" } });
  assert.match(slip, /lg:grid-cols-\[1\.1fr_\.9fr\]/);
  assert.doesNotMatch(slip, /size-32/);
});

test("patient registration skeleton mirrors the two-column registration layout for BHC and RHU", () => {
  const html = render("patient-registration");
  assert.match(html, /data-slot="registration-skeleton-header"/);
  assert.match(html, /data-slot="registration-skeleton-columns"/);
  assert.match(html, /lg:grid-cols-\[minmax\(0,2fr\)_minmax\(0,1fr\)\]/);
  assert.equal((html.match(/data-slot="registration-skeleton-panel"/g) || []).length, 5);
  assert.equal((html.match(/role="status"/g) || []).length, 1);
  assert.doesNotMatch(html, /<(button|input|select|a)\b/);
});

test("RHU overview has its trend arrangement and report summary is not paginated", () => {
  const html = render("reports", { options: { role: "rhu", category: "overview" } });
  assert.match(html, /md:col-span-6/);
  assert.match(html, /md:col-span-5/);
  assert.equal((html.match(/<th\b/g) || []).length, 3);
});

test("loading area hides and inerts real actions rather than covering keyboard-focusable controls", () => {
  const child = React.createElement("button", null, "Real action");
  const html = renderToStaticMarkup(React.createElement(Area, { isLoading: true, skeleton: "accounts" }, child));
  assert.match(html, /hidden=""[^>]*inert=""|inert=""[^>]*hidden=""/);
  assert.doesNotMatch(html, /opacity-0/);
  const ready = renderToStaticMarkup(React.createElement(Area, { isLoading: false }, React.createElement("section", { className: "clinical-directory__layout" })));
  assert.match(ready, /^<div[^>]*><section class="clinical-directory__layout"/);
});

test("state wrapper keeps successful empty and cached content, and replaces only unavailable initial content", () => {
  const child = React.createElement("p", null, "Saved results");
  const html = props => renderToStaticMarkup(React.createElement(State, { skeleton: "accounts", ...props }, child));
  assert.match(html({ isLoading: true, hasData: false }), /Loading/);
  assert.doesNotMatch(html({ isLoading: true, hasData: false }), /Saved results/);
  assert.match(html({ isFetching: true, hasData: true }), /Saved results/);
  assert.match(html({ isLoading: false, hasData: true }), /Saved results/);
  assert.doesNotMatch(html({ isError: true, hasData: false }), /Saved results/);
  assert.doesNotMatch(html({ isError: true, hasData: true, error: { status: 403 } }), /Saved results/);
  assert.match(html({ isError: true, hasData: true, error: { status: 503 } }), /Saved results/);
});

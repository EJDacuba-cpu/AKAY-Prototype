# RHU Medicine and Supply sidebar split — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split RHU Medicine and Supply into sidebar children **Inventory** and **To Dispense**, each with its own route and page heading, while preserving BHC medicine and all existing stock/dispense behavior.

**Architecture:** Frontend-only navigation and page composition. Keep `/rhu/medicine-management` as Inventory. Add `/rhu/to-dispense` for the existing `RhuToDispenseTab`. Collapsible parent `/rhu/medicine-and-supply` mirrors Patient Intake. Remove in-page Inventory / To dispense toggle buttons.

**Tech Stack:** React + Vite + React Router; frontend `node --test`; existing Laravel APIs unchanged.

**Spec:** `docs/superpowers/specs/2026-11-05-rhu-medicine-supply-sidebar-design.md`

## Global Constraints

- Scope: RHU sidebar navigation and page separation only. Do not change medicine calculations, inventory transactions, FEFO, prescription processing, database, or backend business logic.
- Preserve BHC Medicine and Supply (`/bhc/medicine-availability`) as a single flat page with no To Dispense sidebar split.
- Reuse `MedicineInventoryPage` inventory UI, `RhuToDispenseTab`, services, query keys, and permissions `inventory.view` / `inventory.manage` / `items.dispense`.
- Keep `/rhu/medicine-management` and `/rhu/medicine-management/:medicineId` working (bookmarks, ledger, dashboard links).
- To Dispense nav child must not appear for users lacking `items.dispense`; route uses `module="dispensing"`.
- Frontend tests from `frontend/`; do not run migrations against Supabase.
- Commit messages: `feat(rhu-medicine): …` / `test(rhu-medicine): …`.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `frontend/src/utils/sidebarNavigation.js` (+ test) | `RHU_MEDICINE_PARENT_PATH`, `isRhuMedicinePath`, parent active + open-intent |
| `frontend/src/utils/dashboardAccess.js` (+ test) | Allow parent / inventory / to-dispense paths |
| `frontend/src/components/layout/sidebar/sidebarData.js` | RHU Medicine parent + Inventory / To Dispense children |
| `frontend/src/components/layout/DashboardLayout.jsx` | Filter `hideWhenDenied` children; fix `defaultPath` when first child denied |
| `frontend/src/App.jsx` | Parent redirect; `/rhu/to-dispense` route with `module="dispensing"` |
| `frontend/src/pages/rhu/RhuToDispense.jsx` | Page shell: layout + heading/subtitle + `RhuToDispenseTab` |
| `frontend/src/components/features/medicine/MedicineInventoryPage.jsx` | Remove desk toggle; Inventory heading/subtitle for RHU |
| `frontend/src/components/features/medicine/RhuToDispenseTab.test.js` | Assert split via routes/pages, not in-page toggle |

---

### Task 1: Sidebar Medicine parent + access helpers

**Files:**
- Modify: `frontend/src/utils/sidebarNavigation.js`
- Modify: `frontend/src/utils/sidebarNavigation.test.js`
- Modify: `frontend/src/utils/dashboardAccess.js`
- Modify: `frontend/src/utils/dashboardAccess.test.js`
- Modify: `frontend/src/components/layout/sidebar/sidebarData.js`
- Modify: `frontend/src/components/layout/DashboardLayout.jsx`
- Modify: `frontend/src/App.jsx` (parent redirect only)

**Interfaces:**
- `RHU_MEDICINE_PARENT_PATH = "/rhu/medicine-and-supply"`
- `isRhuMedicinePath(pathname)` true for parent, `/rhu/medicine-management`, `/rhu/medicine-management/:medicineId`, `/rhu/to-dispense`
- `isSidebarPathActive(parent, …)` true when `isRhuMedicinePath`
- `hasSidebarOpenIntent` true when `openSidebarGroup === RHU_MEDICINE_PARENT_PATH` and on a medicine path
- Sidebar: label **Medicine and Supply**, `path` parent, `defaultPath` `/rhu/medicine-management`, children Inventory + To Dispense (`hideWhenDenied: true` on To Dispense)
- `navigationAllowed`: parent if `inventory.view` \| `items.dispense`; `/rhu/to-dispense` if `items.dispense`; `/rhu/medicine-management` stays `inventory.view` via `/medicine/` rule
- DashboardLayout: drop children with `hideWhenDenied && !navigationAllowed(user, child.path)`; if `defaultPath` not in remaining children, set `defaultPath` to first remaining child’s path

- [ ] **Step 1: Write the failing tests** in `sidebarNavigation.test.js`:

```js
test("RHU Medicine and Supply sidebar nests Inventory and To Dispense", () => {
  const medicine = menuByRole.rhu
    .flatMap((section) => section.items)
    .find((item) => item.path === "/rhu/medicine-and-supply");
  assert.ok(medicine?.children?.length);
  assert.equal(medicine.label, "Medicine and Supply");
  assert.equal(medicine.defaultPath, "/rhu/medicine-management");
  assert.deepEqual(
    medicine.children.map((c) => c.label),
    ["Inventory", "To Dispense"],
  );
  assert.deepEqual(
    medicine.children.map((c) => c.path),
    ["/rhu/medicine-management", "/rhu/to-dispense"],
  );
  assert.equal(medicine.children[1].hideWhenDenied, true);
  const bhc = menuByRole.bhc
    .flatMap((section) => section.items)
    .find((item) => item.label === "Medicine and Supply");
  assert.equal(bhc.path, "/bhc/medicine-availability");
  assert.equal(bhc.children, undefined);
});

test("Medicine parent stays active on inventory, details, and to-dispense", () => {
  const parent = "/rhu/medicine-and-supply";
  for (const pathname of [
    "/rhu/medicine-management",
    "/rhu/medicine-management/med-1",
    "/rhu/to-dispense",
  ]) {
    assert.equal(isSidebarPathActive(parent, { pathname, search: "" }, "rhu"), true);
  }
  assert.equal(
    isSidebarPathActive(parent, { pathname: "/rhu/patients", search: "" }, "rhu"),
    false,
  );
  assert.equal(
    isSidebarPathActive("/rhu/to-dispense", { pathname: "/rhu/to-dispense", search: "" }, "rhu"),
    true,
  );
});
```

Add `dashboardAccess` tests: user with only `inventory.view` allowed on inventory + parent, denied on `/rhu/to-dispense`; user with only `items.dispense` allowed on to-dispense + parent, denied on `/rhu/medicine-management`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && node --test src/utils/sidebarNavigation.test.js src/utils/dashboardAccess.test.js`  
Expected: FAIL — missing Medicine parent / helpers / access rules.

- [ ] **Step 3: Implement helpers + sidebar + layout filter + redirect**

In `sidebarNavigation.js`:

```js
export const RHU_MEDICINE_PARENT_PATH = "/rhu/medicine-and-supply";

export function isRhuMedicinePath(pathname = "") {
  return (
    pathname === RHU_MEDICINE_PARENT_PATH ||
    pathname === "/rhu/medicine-management" ||
    pathname === "/rhu/to-dispense" ||
    /^\/rhu\/medicine-management\/[^/]+$/.test(pathname)
  );
}
```

Wire into `isSidebarPathActive` and `hasSidebarOpenIntent` like Patient Intake.

In `dashboardAccess.js`, before the generic `/medicine/` rule:

```js
if (user?.role === "rhu" && /^\/rhu\/medicine-and-supply(?:\/|$)/.test(path)) {
  return permissions.includes("inventory.view") || permissions.includes("items.dispense");
}
if (user?.role === "rhu" && /^\/rhu\/to-dispense(?:\/|$)/.test(path)) {
  return permissions.includes("items.dispense");
}
```

In `sidebarData.js` RHU Operations Medicine item → parent with children as above.

In `DashboardLayout.jsx` menu mapping, filter `hideWhenDenied` children and repair `defaultPath`.

In `App.jsx`, parent redirect prefers Inventory when `inventory.view`, else To Dispense when `items.dispense`, else Inventory (LockedModule will handle denial):

```jsx
function RhuMedicineSupplyRedirect() {
  const user = getCurrentUser();
  const permissions = user?.permissions || [];
  const to = permissions.includes("inventory.view")
    ? "/rhu/medicine-management"
    : permissions.includes("items.dispense")
      ? "/rhu/to-dispense"
      : "/rhu/medicine-management";
  return <Navigate to={to} replace />;
}
// ...
<Route path="/rhu/medicine-and-supply" element={<RhuMedicineSupplyRedirect />} />
```

(Inline in `App.jsx` is fine; do not invent a new page file for this.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && node --test src/utils/sidebarNavigation.test.js src/utils/dashboardAccess.test.js`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/sidebarNavigation.js frontend/src/utils/sidebarNavigation.test.js frontend/src/utils/dashboardAccess.js frontend/src/utils/dashboardAccess.test.js frontend/src/components/layout/sidebar/sidebarData.js frontend/src/components/layout/DashboardLayout.jsx frontend/src/App.jsx docs/superpowers/specs/2026-11-05-rhu-medicine-supply-sidebar-design.md docs/superpowers/plans/2026-11-05-rhu-medicine-supply-sidebar.md
git commit -m "$(cat <<'EOF'
feat(rhu-medicine): nest Inventory and To Dispense under Medicine sidebar

EOF
)"
```

---

### Task 2: Inventory page cleanup + To Dispense route/page

**Files:**
- Modify: `frontend/src/components/features/medicine/MedicineInventoryPage.jsx`
- Create: `frontend/src/pages/rhu/RhuToDispense.jsx`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/components/features/medicine/RhuToDispenseTab.test.js`

**Interfaces:**
- Inventory workspace: no `desk` state; no Inventory/To dispense buttons; no `RhuToDispenseTab` import on inventory page
- RHU inventory heading **Inventory**; subtitle `RHU medicine and supply inventory.` (keep BHC heading **Medicine and Supply** / existing BHC subtitle)
- `RhuToDispense.jsx`: `DashboardLayout role="rhu" title="Medicine and Supply"`; h1 **To Dispense**; subtitle `Review prescriptions and confirm medicines given.`; then `<RhuToDispenseTab />`
- Route `/rhu/to-dispense` → `ProtectedPage module="dispensing"` → `RhuToDispense`
- Tests: assert inventory page does not contain desk toggle / `RhuToDispenseTab`; assert `App.jsx` or page file wires to-dispense route; keep review/print/dispense assertions on tab/modal files

- [ ] **Step 1: Update failing / adjust static tests**

In `RhuToDispenseTab.test.js`, replace the first test so it no longer requires Inventory/To dispense buttons on `MedicineInventoryPage.jsx`. Assert instead that inventory page has no `RhuToDispenseTab` / desk toggle, and that `RhuToDispense.jsx` (or `App.jsx`) mounts the tab / route.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && node --test src/components/features/medicine/RhuToDispenseTab.test.js`  
Expected: FAIL until page/route exist (or fail on outdated assertions after Step 1 rewrite — implement next).

- [ ] **Step 3: Implement page split**

Remove from `MedicineInventoryPage.jsx`: `canDispense`, `showDispenseDesk`, `desk`, toggle UI, dispense branch. Keep inventory-only body. For `role === 'rhu'`, set h1 to `Inventory` and keep the RHU subtitle; BHC unchanged (`Medicine and Supply`).

Create `RhuToDispense.jsx` as specified. Register route in `App.jsx` near medicine routes (import page). Do not change `RhuToDispenseTab` behavior.

- [ ] **Step 4: Run tests**

Run: `cd frontend && node --test src/components/features/medicine/RhuToDispenseTab.test.js src/utils/sidebarNavigation.test.js src/utils/dashboardAccess.test.js`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/features/medicine/MedicineInventoryPage.jsx frontend/src/pages/rhu/RhuToDispense.jsx frontend/src/App.jsx frontend/src/components/features/medicine/RhuToDispenseTab.test.js
git commit -m "$(cat <<'EOF'
feat(rhu-medicine): separate Inventory and To Dispense pages

EOF
)"
```

---

### Task 3: Smoke-verify breadcrumbs / ledger paths unchanged

**Files:**
- Modify only if tests fail: `frontend/src/utils/breadcrumbs.js` / related tests
- Verify: `medicineLedger.inventoryPath('rhu')` still `/rhu/medicine-management`

- [ ] **Step 1: Run related tests**

Run: `cd frontend && node --test src/utils/medicineLedger.test.js src/utils/breadcrumbs.test.js src/utils/sidebarNavigation.test.js src/utils/dashboardAccess.test.js src/components/features/medicine/RhuToDispenseTab.test.js`  
Expected: PASS. If breadcrumbs need a To Dispense crumb, add the minimal trail and a test; otherwise no code change.

- [ ] **Step 2: Commit only if fixes were required**

```bash
git add -A
git commit -m "$(cat <<'EOF'
fix(rhu-medicine): keep medicine breadcrumbs and ledger paths

EOF
)"
```

If nothing changed, skip commit and mark task complete.

---

## Done when

- RHU sidebar shows Medicine and Supply → Inventory + To Dispense (To Dispense hidden without `items.dispense`)
- Each child opens its workspace with correct active states and refreshable URLs
- `/rhu/medicine-management` still loads Inventory; details URLs work
- No in-page Inventory / To dispense toggle
- BHC medicine unchanged
- Listed frontend tests pass

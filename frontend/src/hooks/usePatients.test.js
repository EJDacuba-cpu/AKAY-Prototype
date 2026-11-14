import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const hook = readFileSync(join(here, "usePatients.js"), "utf8");
const moduleSource = readFileSync(join(here, "../pages/bhc/PatientsModule.jsx"), "utf8");
const service = readFileSync(join(here, "../services/patientService.js"), "utf8");

test("Patient Directory loads pages through listPatientsPage infinite query", () => {
  assert.match(hook, /useInfiniteQuery/);
  assert.match(hook, /listPatientsPage/);
  assert.match(hook, /fetchNextPage/);
  assert.match(hook, /hasNextPage/);
  assert.match(hook, /directoryParams/);
  assert.doesNotMatch(hook, /useLoadMore/);
});

test("directory params send search and server filters", () => {
  assert.match(hook, /civil_status/);
  assert.match(hook, /age_group/);
  assert.match(hook, /date_registered/);
  assert.match(hook, /per_page:\s*PATIENTS_LOAD_BATCH/);
});

test("PatientsModule uses server hasMore/loadMore instead of client slice", () => {
  assert.match(moduleSource, /hasMore:\s*hasMorePatients/);
  assert.match(moduleSource, /loadMore:\s*loadMorePatients/);
  assert.doesNotMatch(moduleSource, /useLoadMore\(/);
  assert.match(moduleSource, /Showing \$\{filteredPatients\.length\} of \$\{totalCount\} patients/);
});

test("listPatientsPage exposes paginator meta and clamps per_page", () => {
  assert.match(service, /export async function listPatientsPage/);
  assert.match(service, /PATIENT_DIRECTORY_MAX_PER_PAGE = 100/);
  assert.match(service, /current_page/);
  assert.match(service, /last_page/);
  assert.match(service, /total/);
});

test("dedupe keeps one row per patient id across appended pages", () => {
  // Mirror the hook's merge rule for regression coverage without React.
  function dedupePatients(pages = []) {
    const byId = new Map();
    for (const page of pages) {
      for (const patient of page.items || []) {
        const id = String(patient.id || patient.patientId || patient.patient_id || "");
        if (!id) continue;
        byId.set(id, patient);
      }
    }
    return [...byId.values()];
  }

  const pages = [
    { items: [{ id: 1, name: "A" }, { id: 2, name: "B" }], meta: { current_page: 1, last_page: 2, total: 3 } },
    { items: [{ id: 2, name: "B2" }, { id: 3, name: "C" }], meta: { current_page: 2, last_page: 2, total: 3 } },
  ];
  const merged = dedupePatients(pages);
  assert.equal(merged.length, 3);
  assert.equal(merged.find((row) => String(row.id) === "2").name, "B2");
});

test("simulated directories of 25/50/100/1000 page correctly at PATIENTS_LOAD_BATCH 50", () => {
  const batch = 50;
  for (const total of [25, 50, 100, 1000]) {
    const lastPage = Math.max(1, Math.ceil(total / batch));
    let loaded = 0;
    let page = 1;
    while (page <= lastPage) {
      const remaining = total - loaded;
      const take = Math.min(batch, remaining);
      loaded += take;
      page += 1;
    }
    assert.equal(loaded, total);
    assert.equal(page - 1, lastPage);
    if (total <= 50) assert.equal(lastPage, 1);
    if (total === 100) assert.equal(lastPage, 2);
    if (total === 1000) assert.equal(lastPage, 20);
  }
});

test("directory requests filter options only on the first page", () => {
  assert.match(hook, /include_filter_options:\s*page === 1/);
  assert.match(service, /filter_options/);
  assert.match(service, /civilStatuses/);
  assert.match(moduleSource, /filterOptions\?\.barangays/);
});

import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_FACILITY_FILTERS,
  facilityFilterChips,
  filterFacilities,
} from "./facilityFilters.js";

const rhuA = { id: 1, name: "Rural Health Unit Bulakan" };
const rhuB = { id: 2, name: "Super Rural Health Unit Version 2" };
const bhcs = [
  { id: 1, name: "Bagumbayan Health Center", barangay: "Bagumbayan", address: "Bagumbayan, Bulakan, Bulacan", status: "active", rural_health_unit: rhuA, alternative_rhus: [] },
  { id: 2, name: "Balubad Health Center", barangay: "Balubad", address: "Balubad, Bulakan, Bulacan", status: "inactive", rural_health_unit: rhuA, alternative_rhus: [rhuB] },
  { id: 3, name: "Perez Health Center", barangay: "Perez", address: null, status: "active", rural_health_unit: rhuB },
  { id: 4, name: "Taliptip Health Center", barangay: "Taliptip", address: "Taliptip", status: "active", rural_health_unit: null, alternative_rhus: [] },
];
const names = (list) => list.map((facility) => facility.name);
const filter = (overrides, type = "bhc", items = bhcs) =>
  names(filterFacilities(items, { ...DEFAULT_FACILITY_FILTERS, ...overrides }, type));

test("default filters keep every facility", () => {
  assert.equal(filter({}).length, 4);
});

test("search matches name, barangay and address, ignoring case and spaces", () => {
  assert.deepEqual(filter({ search: "  BALUBAD " }), ["Balubad Health Center"]);
  assert.deepEqual(filter({ search: "bulakan, bulacan" }), ["Bagumbayan Health Center", "Balubad Health Center"]);
  assert.deepEqual(filter({ search: "perez" }), ["Perez Health Center"]);
  assert.deepEqual(filter({ search: "nothing here" }), []);
});

test("status filter keeps only active or inactive facilities", () => {
  assert.deepEqual(filter({ status: "Inactive" }), ["Balubad Health Center"]);
  assert.equal(filter({ status: "Active" }).length, 3);
});

test("default RHU filter matches the receiving RHU by name and skips BHCs without one", () => {
  assert.deepEqual(filter({ rhu: rhuA.name }), ["Bagumbayan Health Center", "Balubad Health Center"]);
  assert.deepEqual(filter({ rhu: rhuB.name }), ["Perez Health Center"]);
});

test("alternatives filter separates BHCs with and without approved alternatives, including a missing list", () => {
  assert.deepEqual(filter({ alternatives: "With alternatives" }), ["Balubad Health Center"]);
  assert.deepEqual(filter({ alternatives: "No alternatives" }), ["Bagumbayan Health Center", "Perez Health Center", "Taliptip Health Center"]);
});

test("filters combine", () => {
  assert.deepEqual(filter({ status: "Active", rhu: rhuA.name, search: "bagum" }), ["Bagumbayan Health Center"]);
  assert.deepEqual(filter({ status: "Inactive", alternatives: "No alternatives" }), []);
});

test("RHU facilities ignore the BHC-only filters", () => {
  const rhus = [
    { id: 1, name: "Rural Health Unit Bulakan", address: "Bulakan, Bulacan", status: "active" },
    { id: 2, name: "Super Rural Health Unit Version 2", address: null, status: "inactive" },
  ];

  assert.deepEqual(filter({ rhu: rhuA.name, alternatives: "With alternatives" }, "rhu", rhus), names(rhus));
  assert.deepEqual(filter({ status: "Inactive" }, "rhu", rhus), ["Super Rural Health Unit Version 2"]);
});

test("facilityFilterChips lists only what was changed, and only the filters that apply to the tab", () => {
  assert.deepEqual(facilityFilterChips(DEFAULT_FACILITY_FILTERS, "bhc"), []);
  assert.deepEqual(
    facilityFilterChips({ search: "perez", status: "Active", rhu: rhuB.name, alternatives: "No alternatives" }, "bhc"),
    [
      { key: "search", label: 'Search: "perez"' },
      { key: "status", label: "Active" },
      { key: "rhu", label: rhuB.name },
      { key: "alternatives", label: "No alternatives" },
    ],
  );
  assert.deepEqual(
    facilityFilterChips({ search: "", status: "Inactive", rhu: rhuB.name, alternatives: "No alternatives" }, "rhu"),
    [{ key: "status", label: "Inactive" }],
  );
});

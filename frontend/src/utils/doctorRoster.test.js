import test from "node:test";
import assert from "node:assert/strict";
import {
  filterDoctorRoster,
  isOfficialProvider,
  rosterCounts,
  ROSTER_STATUS,
} from "./doctorRoster.js";

const official = {
  id: "1",
  userId: "10",
  name: "Dr. Maria Santos",
  specialization: "General Practitioner",
  availabilityStatus: "Available",
};
const covering = {
  id: "2",
  userId: null,
  name: "Dr. Locum",
  specialization: "Pediatrics",
  availabilityStatus: "Unavailable",
};
const secondOfficial = {
  id: "3",
  userId: "11",
  name: "Dr. Reyes",
  specialization: "Covering clinic",
  availabilityStatus: "Unavailable",
};

test("official identity is the linked account, not the display name", () => {
  assert.equal(isOfficialProvider(official), true);
  assert.equal(isOfficialProvider(covering), false);
});

test("roster counts and filters use effective status when present", () => {
  const overlay = {
    ...official,
    availabilityStatus: "Available",
    effectiveAvailabilityStatus: "Unavailable",
  };
  assert.deepEqual(rosterCounts([overlay, secondOfficial]), {
    all: 2,
    available: 0,
    unavailable: 2,
  });
  assert.equal(filterDoctorRoster([overlay], { status: ROSTER_STATUS.AVAILABLE }).length, 0);
  assert.equal(filterDoctorRoster([overlay], { status: ROSTER_STATUS.UNAVAILABLE }).length, 1);
});

test("filters split availability and search without treating covering as eligible", () => {
  const roster = [official, secondOfficial];
  assert.equal(filterDoctorRoster(roster, { status: ROSTER_STATUS.AVAILABLE }).length, 1);
  assert.equal(filterDoctorRoster(roster, { status: ROSTER_STATUS.UNAVAILABLE }).length, 1);
  assert.equal(filterDoctorRoster(roster, { query: "reyes" })[0].id, "3");
  assert.deepEqual(rosterCounts(roster), {
    all: 2,
    available: 1,
    unavailable: 1,
  });
});

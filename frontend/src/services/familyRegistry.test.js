import test from "node:test";
import assert from "node:assert/strict";
import { isAcceptedLabel } from "../utils/relationshipLabels.js";
import {
  ADDRESS_FIELDS,
  HEAD_RELATIONSHIP,
  MINOR_HEAD_MESSAGE,
  MISSING_BIRTH_DATE_MESSAGE,
  NO_HOUSEHOLD_MESSAGE,
  addressValues,
  canHeadHousehold,
  connectionForPatient,
  headDeparture,
  stageConnection,
  validateConnection,
  validateHeadReplacement,
  withFormAddress,
} from "./familyRegistry.js";

const address = {
  streetAddress: "12 Mabini Street",
  purokArea: "Purok 1",
  barangay: "San Jose",
  municipality: "Bulakan",
};

const adult = { birthDate: "1990-01-01" };

function registry(overrides = {}) {
  return {
    households: [
      { id: "hh-1", serialNumber: "FSN-001", headPatientId: "p-head", address: { ...address } },
      { id: "hh-2", serialNumber: "FSN-002", headPatientId: "p-other-head", address: { ...address, streetAddress: "48 Rizal Street", barangay: "Bambang" } },
    ],
    patients: [
      { id: "p-head", firstName: "Roberto", lastName: "Santos", householdId: "hh-1", relationshipToHouseholdHead: HEAD_RELATIONSHIP, ...addressValues(address) },
      { id: "p-spouse", firstName: "Elena", lastName: "Santos", householdId: "hh-1", relationshipToHouseholdHead: "Wife", ...addressValues(address) },
      { id: "p-child", firstName: "Ana", lastName: "Reyes", householdId: "hh-1", relationshipToHouseholdHead: "Niece", ...addressValues(address) },
      { id: "p-other-head", firstName: "Manuel", lastName: "Santos", householdId: "hh-2", relationshipToHouseholdHead: HEAD_RELATIONSHIP },
      { id: "p-unlinked", firstName: "Paolo", lastName: "Santos", householdId: null, relationshipToHouseholdHead: "" },
    ],
    ...overrides,
  };
}

const join = (relationship = "Cousin", householdId = "hh-1") => ({
  kind: "existing",
  householdId,
  relationship,
});

const newSelf = (household = {}) => ({
  kind: "new",
  headPatientId: "self",
  relationship: "",
  household: {
    serialMode: "auto",
    serialNumber: "",
    address: { ...address },
    ...household,
  },
});

const newWithHead = (headPatientId, household = {}) => ({
  kind: "new",
  headPatientId,
  relationship: "Son",
  household: {
    serialMode: "manual",
    serialNumber: "FSN-100",
    address: { ...address },
    ...household,
  },
});

// Live BHC/RHU registration validates relationship labels with isAcceptedLabel.
const live = (store, connection, patientId, patient) =>
  validateConnection(store, connection, patientId, patient, isAcceptedLabel);

test("canHeadHousehold requires a birth date and treats the 18th birthday as eligible", () => {
  const today = new Date(2026, 9, 15);
  assert.deepEqual(canHeadHousehold({ birthDate: "" }, today), {
    ok: false,
    code: "missing-birth-date",
    reason: MISSING_BIRTH_DATE_MESSAGE,
  });
  assert.deepEqual(canHeadHousehold({ birthDate: "2008-10-16" }, today), {
    ok: false,
    code: "minor",
    reason: MINOR_HEAD_MESSAGE,
  });
  assert.deepEqual(canHeadHousehold({ birthDate: "2008-10-15" }, today), { ok: true });
});

test("validateConnection rejects a missing or unknown household before other fields", () => {
  const store = registry();
  assert.deepEqual(live(store, null, undefined, adult), { household: NO_HOUSEHOLD_MESSAGE });
  assert.equal(live(store, { kind: "existing", householdId: "missing", relationship: "Wife" }, undefined, adult).household, "Select a household.");
  assert.equal(live(store, { kind: "orphan", householdId: "hh-1", relationship: "Wife" }, undefined, adult).household, "Choose a valid household.");
  assert.ok(live({
    households: [{ id: "hh-empty", serialNumber: "FSN-9", headPatientId: null, address }],
    patients: [],
  }, join("Wife", "hh-empty"), undefined, adult).household);
});

test("validateConnection requires a live relationship label when joining an existing household", () => {
  const store = registry();
  assert.ok(live(store, join(""), undefined, adult).relationship);
  assert.ok(live(store, join(HEAD_RELATIONSHIP), undefined, adult).relationship);
  assert.ok(live(store, join("Son / Daughter"), undefined, adult).relationship);
  assert.deepEqual(live(store, join("Wife"), undefined, adult), {});
});

test("validateConnection requires address fields for a new household and leaves purok optional", () => {
  const store = registry();
  const withoutPurok = newSelf({ address: { ...address, purokArea: "" } });
  assert.equal(live(store, withoutPurok, undefined, adult).purokArea, undefined);
  assert.deepEqual(live(store, withoutPurok, undefined, adult), {});

  for (const field of ADDRESS_FIELDS.filter((key) => key !== "purokArea")) {
    const draft = newSelf({ address: { ...address, [field]: "  " } });
    assert.ok(live(store, draft, undefined, adult)[field], field);
  }
});

test("validateConnection accepts live auto FSN mode and rejects blank or duplicate manual serials", () => {
  const store = registry();
  assert.deepEqual(live(store, newSelf(), undefined, adult), {});

  const blankManual = newSelf({ serialMode: "manual", serialNumber: "  " });
  assert.equal(live(store, blankManual, undefined, adult).serialNumber, "Family Serial Number is required.");

  const duplicate = newSelf({ serialMode: "manual", serialNumber: " fsn-001 " });
  assert.equal(live(store, duplicate, undefined, adult).serialNumber, "This Family Serial Number already exists.");
});

test("validateConnection enforces self-head age and unlinked existing-head selection", () => {
  const store = registry();
  const minor = { birthDate: "2015-01-01" };
  assert.equal(live(store, newSelf(), undefined, minor).headPatientId, MINOR_HEAD_MESSAGE);

  assert.deepEqual(live(store, newWithHead("p-unlinked"), undefined, adult), {});
  assert.ok(live(store, newWithHead("p-head"), undefined, adult).headPatientId);
  assert.ok(live(store, newWithHead("missing"), undefined, adult).headPatientId);
  assert.ok(live(store, { ...newWithHead("p-unlinked"), relationship: "" }, undefined, adult).relationship);
});

test("connectionForPatient rebuilds an existing head connection that validates cleanly", () => {
  const store = registry();
  const saved = store.patients[0];
  const connection = connectionForPatient(saved);
  assert.deepEqual(connection, {
    kind: "existing",
    householdId: "hh-1",
    relationship: HEAD_RELATIONSHIP,
  });
  assert.deepEqual(live(store, connection, saved.id, saved), {});
  assert.equal(connectionForPatient({ id: "p-unlinked", householdId: null }), null);
});

test("withFormAddress copies the form address into a new self household only", () => {
  const form = { streetAddress: "1 Late Edit Street", purokArea: "", barangay: "Tibig", municipality: "Bulakan" };
  assert.equal(withFormAddress(newSelf(), form).household.address.streetAddress, "1 Late Edit Street");
  const joined = join("Wife");
  assert.equal(withFormAddress(joined, form), joined);
});

test("stageConnection copies household address without mutating the saved patient or registry", () => {
  const store = registry();
  const before = structuredClone(store);
  const saved = {
    id: "p-unlinked",
    familySerialNumber: "",
    motherPatientId: "mom-1",
    fatherPatientId: "dad-1",
    ...addressValues({ streetAddress: "25 Bonifacio Street", purokArea: "Purok 4", barangay: "Santa Ana", municipality: "Bulakan" }),
  };
  const staged = stageConnection(saved, store, join("Cousin"));
  assert.equal(staged.familySerialNumber, "FSN-001");
  assert.deepEqual(addressValues(staged), addressValues(store.households[0].address));
  assert.deepEqual(store, before);
  assert.equal(saved.familySerialNumber, "");
  assert.equal(staged.motherPatientId, "");
  assert.equal(staged.fatherPatientId, "");
});

test("stageConnection keeps a typed self-household address and live parent links when requested", () => {
  const store = registry();
  const form = {
    streetAddress: "99 Test Street",
    purokArea: "Purok 5",
    barangay: "Tibig",
    municipality: "Bulakan",
    familySerialNumber: "",
    motherPatientId: "mom-1",
    fatherPatientId: "dad-1",
  };
  const emptyAddress = newSelf({ serialNumber: "FSN-2026-0001", address: {} });
  const staged = stageConnection(form, store, emptyAddress);
  assert.equal(staged.streetAddress, "99 Test Street");
  assert.equal(staged.familySerialNumber, "FSN-2026-0001");

  const liveDraft = stageConnection(
    { ...form, familySerialNumber: "OLD" },
    store,
    join("Nephew"),
    { preserveParentLinks: true },
  );
  assert.equal(liveDraft.familySerialNumber, "FSN-001");
  assert.equal(liveDraft.motherPatientId, "mom-1");
  assert.equal(liveDraft.fatherPatientId, "dad-1");
});

test("stageConnection fills mother and father when Son/Daughter joins a household", () => {
  const store = registry();
  store.patients[0] = { ...store.patients[0], sex: "Female", firstName: "Maria", lastName: "Santos", birthDate: "1990-01-01" };
  store.patients[1] = { ...store.patients[1], sex: "Male", firstName: "Pedro", lastName: "Santos", birthDate: "1988-01-01", relationshipToHouseholdHead: "Husband" };
  const staged = stageConnection(
    { familySerialNumber: "", motherName: "", motherPatientId: "", motherBirthDate: "", fatherName: "", fatherPatientId: "", fatherBirthDate: "" },
    store,
    { ...join("Daughter"), relationshipLink: { type: "mother" } },
  );
  assert.equal(staged.motherPatientId, "p-head");
  assert.equal(staged.motherName, "Maria Santos");
  assert.equal(staged.motherBirthDate, "1990-01-01");
  assert.equal(staged.fatherPatientId, "p-spouse");
  assert.equal(staged.fatherName, "Pedro Santos");
});

test("headDeparture lists remaining members and validateHeadReplacement requires an explicit choice", () => {
  const store = registry();
  const leave = join("Brother", "hh-2");
  const departure = headDeparture(store, "p-head", leave);
  assert.equal(departure.members.length, 2);
  assert.deepEqual(departure.members.map((item) => item.id).sort(), ["p-child", "p-spouse"]);

  assert.ok(validateHeadReplacement(store, "p-head", leave, null, isAcceptedLabel).headPatientId);

  const replacement = {
    householdId: "hh-1",
    headPatientId: "p-spouse",
    relationships: { "p-child": "Niece" },
  };
  assert.deepEqual(validateHeadReplacement(store, "p-head", leave, replacement, isAcceptedLabel), {});

  assert.equal(headDeparture(store, "p-spouse", leave), null);
  assert.deepEqual(validateHeadReplacement(store, "p-spouse", leave, null, isAcceptedLabel), {});
});

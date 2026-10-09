import test from "node:test";
import assert from "node:assert/strict";
import {
  CONDITION_STATUS_OPTIONS,
  buildConditionConfirmations,
  validateConditionConfirmations,
  mapConditionConfirmationErrors,
  canRecommendBhcMonitoring,
  patchConditionRow,
  existingConditionRow,
} from "./conditionConfirmations.js";

test("status options are the five RHU statuses with their labels", () => {
  assert.deepEqual(CONDITION_STATUS_OPTIONS, [
    { value: "under_evaluation", label: "Under Evaluation" },
    { value: "active", label: "Active" },
    { value: "controlled", label: "Controlled" },
    { value: "resolved", label: "Resolved" },
    { value: "ruled_out", label: "Ruled Out" },
  ]);
});

test("unticked rows are never sent", () => {
  assert.deepEqual(
    buildConditionConfirmations([{ name: "Hypertension", status: "active", setOnRecord: false }]),
    [],
  );
});

test("a new row sends its trimmed name, status and note; an existing row sends its id only", () => {
  assert.deepEqual(
    buildConditionConfirmations([
      { name: "  Hypertension ", status: "active", note: " BP 150/95 ", setOnRecord: true, recommend: true },
      { conditionId: 7, name: "Asthma", status: "controlled", setOnRecord: true },
    ]),
    [
      { name: "Hypertension", status: "active", note: "BP 150/95", recommend_bhc_monitoring: true },
      { condition_id: 7, status: "controlled", recommend_bhc_monitoring: false },
    ],
  );
});

test("recommendation is dropped for non-monitorable statuses", () => {
  const [row] = buildConditionConfirmations([
    { name: "Asthma", status: "under_evaluation", setOnRecord: true, recommend: true },
  ]);
  assert.equal(row.recommend_bhc_monitoring, false);
  assert.equal(canRecommendBhcMonitoring("active"), true);
  assert.equal(canRecommendBhcMonitoring("controlled"), true);
  assert.equal(canRecommendBhcMonitoring("resolved"), false);
});

test("a new row needs a name and a status; unticked rows are not validated", () => {
  const errors = validateConditionConfirmations([
    { name: "   ", status: "", setOnRecord: true },
    { name: "", status: "", setOnRecord: false },
    { conditionId: 3, name: "Asthma", status: "active", setOnRecord: true },
  ]);
  assert.deepEqual(Object.keys(errors).sort(), [
    "conditionConfirmations.0.name",
    "conditionConfirmations.0.status",
  ]);
});

test("duplicate names are rejected, ignoring case and spacing", () => {
  const errors = validateConditionConfirmations([
    { name: "HTN ", status: "active", setOnRecord: true },
    { name: "htn", status: "active", setOnRecord: true },
  ]);
  assert.deepEqual(Object.keys(errors), ["conditionConfirmations.1.name"]);
});

test("names longer than 150 characters are rejected", () => {
  const errors = validateConditionConfirmations([
    { name: "x".repeat(151), status: "active", setOnRecord: true },
  ]);
  assert.ok(errors["conditionConfirmations.0.name"]);
});

test("server errors are mapped back onto the block's rows", () => {
  const rows = [
    { name: "A", status: "active", setOnRecord: false },
    { name: "B", status: "active", setOnRecord: true },
    { name: "B", status: "resolved", setOnRecord: true, recommend: true },
  ];
  const mapped = mapConditionConfirmationErrors(
    {
      "condition_confirmations.1.name": ["This condition is listed twice."],
      "condition_confirmations.1.recommend_bhc_monitoring": [
        "Only an Active or Controlled condition can be recommended for BHC monitoring.",
      ],
      "rhu_diagnosis": ["Required."],
    },
    rows,
  );
  assert.deepEqual(mapped, {
    "conditionConfirmations.2.name": "This condition is listed twice.",
    "conditionConfirmations.2.recommend": "Only an Active or Controlled condition can be recommended for BHC monitoring.",
  });
});

test("a duplicate involving a new row is reported on the new row, wherever it sits", () => {
  const newAfterExisting = validateConditionConfirmations([
    { conditionId: 3, name: "Asthma", status: "active", setOnRecord: true },
    { name: " asthma", status: "active", setOnRecord: true },
  ]);
  assert.deepEqual(Object.keys(newAfterExisting), ["conditionConfirmations.1.name"]);

  const newBeforeExisting = validateConditionConfirmations([
    { name: "Asthma", status: "active", setOnRecord: true },
    { conditionId: 3, name: "asthma", status: "active", setOnRecord: true },
  ]);
  assert.deepEqual(Object.keys(newBeforeExisting), ["conditionConfirmations.0.name"]);
});

test("a duplicate between two existing rows is reported on the later one", () => {
  const errors = validateConditionConfirmations([
    { conditionId: 3, name: "Asthma", status: "active", setOnRecord: true },
    { conditionId: 4, name: "ASTHMA", status: "controlled", setOnRecord: true },
  ]);
  assert.deepEqual(Object.keys(errors), ["conditionConfirmations.1.name"]);
});

test("a server condition_id error lands on the existing row's name error", () => {
  const rows = [
    { conditionId: 9, name: "Asthma", status: "active", setOnRecord: true },
    { name: "Gout", status: "active", setOnRecord: true },
  ];
  assert.deepEqual(
    mapConditionConfirmationErrors({ "condition_confirmations.0.condition_id": ["Unknown condition."] }, rows),
    { "conditionConfirmations.0.name": "Unknown condition." },
  );
});

test("recommend is cleared when the status becomes non-monitorable and stays cleared", () => {
  let row = { status: "active", recommend: true, setOnRecord: true };
  row = patchConditionRow(row, { status: "resolved" });
  assert.equal(row.recommend, false);
  row = patchConditionRow(row, { status: "active" });
  assert.equal(row.recommend, false);
  row = patchConditionRow(row, { recommend: true });
  assert.equal(row.recommend, true);
  assert.equal(patchConditionRow(row, { note: "x" }).recommend, true);
});

test("an existing condition's row starts with the box ticked when BHC monitoring is recommended", () => {
  const recommended = existingConditionRow({
    id: 7,
    conditionName: "Hypertension",
    status: "active",
    bhcMonitoringRecommendedAt: "2026-10-01T08:00:00Z",
  });
  assert.deepEqual(recommended, {
    conditionId: 7,
    name: "Hypertension",
    status: "active",
    note: "",
    setOnRecord: false,
    recommend: true,
  });

  const plain = existingConditionRow({ id: 8, conditionName: "Asthma", status: "controlled", bhcMonitoringRecommendedAt: null });
  assert.equal(plain.recommend, false);
  // A recommendation only exists for an Active or Controlled condition.
  assert.equal(
    existingConditionRow({ id: 9, conditionName: "Flu", status: "under_evaluation", bhcMonitoringRecommendedAt: "2026-10-01" }).recommend,
    false,
  );
});

test("unticking Recommend on a ticked existing condition sends a withdrawal", () => {
  const row = existingConditionRow({ id: 7, conditionName: "Hypertension", status: "active", bhcMonitoringRecommendedAt: "2026-10-01" });

  // Ticked with the pre-filled box left alone: the recommendation stays.
  assert.deepEqual(buildConditionConfirmations([patchConditionRow(row, { setOnRecord: true })]), [
    { condition_id: 7, status: "active", recommend_bhc_monitoring: true },
  ]);
  // The RHU unticks the box: an explicit false withdraws it.
  const withdrawn = patchConditionRow(patchConditionRow(row, { setOnRecord: true }), { recommend: false });
  assert.deepEqual(buildConditionConfirmations([withdrawn]), [
    { condition_id: 7, status: "active", recommend_bhc_monitoring: false },
  ]);
  // Moving it to Resolved also sends false.
  assert.deepEqual(buildConditionConfirmations([patchConditionRow(row, { status: "resolved", setOnRecord: true })]), [
    { condition_id: 7, status: "resolved", recommend_bhc_monitoring: false },
  ]);
});

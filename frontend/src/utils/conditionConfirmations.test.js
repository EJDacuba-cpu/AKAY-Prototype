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
  legacyDecisionRow,
  applyLegacyDecision,
  buildLegacyDiscontinuations,
  validateLegacyDecisions,
  mapLegacyDiscontinuationErrors,
  MAX_LEGACY_REASON_LENGTH,
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

const legacy = (id, name) => legacyDecisionRow({ id, conditionName: name, startedAt: "2026-01-05" });

test("a legacy row starts undecided", () => {
  assert.deepEqual(legacy(4, "Hypertension"), {
    monitoringId: 4,
    conditionName: "Hypertension",
    decision: "",
    correctedName: "",
    reason: "",
  });
});

test("confirm adds a prefilled condition row and no discontinuation", () => {
  const { rows, legacyRows } = applyLegacyDecision([], [legacy(4, "Hypertension")], 4, { decision: "confirm" });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, "Hypertension");
  assert.equal(rows[0].conditionId, null);
  assert.equal(rows[0].setOnRecord, true);
  assert.equal(rows[0].legacyMonitoringId, 4);
  assert.deepEqual(buildLegacyDiscontinuations(legacyRows), []);
  // Choosing Active links it through the existing identity auto-link.
  assert.deepEqual(buildConditionConfirmations([{ ...rows[0], status: "active" }]), [
    { name: "Hypertension", status: "active", recommend_bhc_monitoring: false },
  ]);
});

test("correct discontinues with the corrected reason and adds the corrected condition row", () => {
  const { rows, legacyRows } = applyLegacyDecision([], [legacy(4, "Hypertension")], 4, {
    decision: "correct",
    correctedName: " Pre-eclampsia ",
  });
  assert.equal(rows[0].name, " Pre-eclampsia ");
  assert.equal(rows[0].legacyMonitoringId, 4);
  assert.equal(legacyRows[0].reason, "Corrected by RHU to Pre-eclampsia");
  assert.deepEqual(buildLegacyDiscontinuations(legacyRows), [
    { monitoring_id: 4, reason: "Corrected by RHU to Pre-eclampsia" },
  ]);
  assert.deepEqual(validateLegacyDecisions(legacyRows), {});
});

test("editing the corrected name keeps the condition row and reason in step, preserving the RHU's status", () => {
  let state = applyLegacyDecision([], [legacy(4, "Hypertension")], 4, { decision: "correct", correctedName: "Asthma" });
  state = {
    ...state,
    rows: state.rows.map((row) => patchConditionRow(row, { status: "active", recommend: true })),
  };
  state = applyLegacyDecision(state.rows, state.legacyRows, 4, { correctedName: "Gout" });
  assert.equal(state.rows.length, 1);
  assert.equal(state.rows[0].name, "Gout");
  assert.equal(state.rows[0].status, "active");
  assert.equal(state.rows[0].recommend, true);
  assert.equal(state.legacyRows[0].reason, "Corrected by RHU to Gout");
});

test("discontinue requires a reason and adds no condition row", () => {
  const { rows, legacyRows } = applyLegacyDecision([], [legacy(4, "Hypertension")], 4, { decision: "discontinue" });
  assert.deepEqual(rows, []);
  assert.deepEqual(Object.keys(validateLegacyDecisions(legacyRows)), ["legacyMonitoringDiscontinuations.4.reason"]);
  const withBlank = applyLegacyDecision(rows, legacyRows, 4, { reason: "   " });
  assert.deepEqual(Object.keys(validateLegacyDecisions(withBlank.legacyRows)), ["legacyMonitoringDiscontinuations.4.reason"]);
  const typed = applyLegacyDecision(rows, legacyRows, 4, { reason: " Entered in error " });
  assert.deepEqual(validateLegacyDecisions(typed.legacyRows), {});
  assert.deepEqual(buildLegacyDiscontinuations(typed.legacyRows), [{ monitoring_id: 4, reason: "Entered in error" }]);
});

test("a discontinue reason is capped at 488 characters", () => {
  assert.equal(MAX_LEGACY_REASON_LENGTH, 488);
  const row = { ...legacy(4, "Hypertension"), decision: "discontinue", reason: "x".repeat(489) };
  assert.ok(validateLegacyDecisions([row])["legacyMonitoringDiscontinuations.4.reason"]);
  assert.deepEqual(validateLegacyDecisions([{ ...row, reason: "x".repeat(488) }]), {});
});

test("correct requires a corrected name different from the legacy one", () => {
  const blank = { ...legacy(4, "Hypertension"), decision: "correct" };
  assert.deepEqual(Object.keys(validateLegacyDecisions([blank])), ["legacyMonitoringDiscontinuations.4.correctedName"]);
  const same = { ...blank, correctedName: " hypertension " };
  assert.ok(validateLegacyDecisions([same])["legacyMonitoringDiscontinuations.4.correctedName"]);
  const tooLong = { ...blank, correctedName: "x".repeat(151) };
  assert.ok(validateLegacyDecisions([tooLong])["legacyMonitoringDiscontinuations.4.correctedName"]);
});

test("undecided legacy rows send nothing", () => {
  const rows = [legacy(4, "Hypertension"), legacy(5, "Asthma")];
  assert.deepEqual(buildLegacyDiscontinuations(rows), []);
  assert.deepEqual(validateLegacyDecisions(rows), {});
});

test("changing or clearing a decision removes the condition row it added, and only that one", () => {
  const manual = { conditionId: null, name: "Gout", status: "active", note: "", setOnRecord: true, recommend: false };
  let state = applyLegacyDecision([manual], [legacy(4, "Hypertension"), legacy(5, "Asthma")], 4, { decision: "confirm" });
  state = applyLegacyDecision(state.rows, state.legacyRows, 5, { decision: "confirm" });
  assert.equal(state.rows.length, 3);

  state = applyLegacyDecision(state.rows, state.legacyRows, 4, { decision: "discontinue", reason: "Wrong patient" });
  assert.deepEqual(state.rows.map((row) => row.name), ["Gout", "Asthma"]);
  assert.deepEqual(buildLegacyDiscontinuations(state.legacyRows), [{ monitoring_id: 4, reason: "Wrong patient" }]);

  state = applyLegacyDecision(state.rows, state.legacyRows, 4, { decision: "" });
  state = applyLegacyDecision(state.rows, state.legacyRows, 5, { decision: "" });
  assert.deepEqual(state.rows, [manual]);
  assert.deepEqual(buildLegacyDiscontinuations(state.legacyRows), []);
});

test("switching from correct to discontinue drops the corrected-name reason", () => {
  let state = applyLegacyDecision([], [legacy(4, "Hypertension")], 4, { decision: "correct", correctedName: "Asthma" });
  state = applyLegacyDecision(state.rows, state.legacyRows, 4, { decision: "discontinue" });
  assert.equal(state.legacyRows[0].reason, "");
  assert.deepEqual(state.rows, []);
});

test("server errors on legacy_monitoring_discontinuations land on the decided rows", () => {
  const rows = [
    legacy(3, "Gout"),
    { ...legacy(4, "Hypertension"), decision: "discontinue", reason: "x" },
    { ...legacy(5, "Asthma"), decision: "correct", correctedName: "Flu", reason: "Corrected by RHU to Flu" },
  ];
  assert.deepEqual(
    mapLegacyDiscontinuationErrors(
      {
        "legacy_monitoring_discontinuations.1.reason": ["The reason is too long."],
        "legacy_monitoring_discontinuations.0.monitoring_id": ["Already discontinued."],
        "rhu_diagnosis": ["Required."],
      },
      rows,
    ),
    {
      "legacyMonitoringDiscontinuations.5.reason": "The reason is too long.",
      "legacyMonitoringDiscontinuations.4.decision": "Already discontinued.",
    },
  );
});

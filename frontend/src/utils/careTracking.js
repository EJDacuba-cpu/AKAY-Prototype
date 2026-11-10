// Extensions are explicit so this module can be exercised directly by
// `node --test`, which does not resolve extensionless specifiers.
import {
  getSpecializedRecordPrograms,
  getRecordDateValue,
  getEpiVaccineEntries,
  normalizeVaccineName,
  getTbData,
} from "./healthRecordPrograms.js";
import { bloodPressureTrendPoints, fbsTrendPoints } from "./clinicalTrendSeries.js";
import { conditionStatusLabel } from "./medicalConditions.js";
import {
  isWomensHealthApplicable,
  isPediatricApplicable,
} from "./programApplicability.js";
import {
  POSTPARTUM_WINDOW_DAYS,
  TB_OUTCOME_LABELS,
  TB_POSITIVE_OUTCOMES,
  TB_ADHERENCE_WARNING_THRESHOLD,
  EPI_INFANT_SCHEDULE,
  EPI_EXTRA_INDICATORS,
  EPI_FIC_AGE_LIMIT_MONTHS,
} from "./careTrackingConfig.js";
import { calculateAgeInYears } from "./maternalRisk.js";
import {
  nutritionCareFacts,
  nutritionHistoryFromApi,
  nutritionMeasurementHistory,
  nutritionReadingsFromApi,
  summarizeNutritionHistory,
} from "./nutritionCare.js";
import { resolveNutritionCare } from "./nutritionEnrollment.js";
import { normalizeFpClientTypeCode } from "./familyPlanning.js";

/**
 * Care Tracking: derives one read-only status card per clinical program
 * (Maternal, Family Planning, EPI, Nutrition, TB) from the patient's existing health
 * records. There is no enrollment step - a program appears once the patient
 * is eligible for it or already has records in it (the same `applicable ||
 * hasHistory` rule as programApplicability.js), and its status is worked out
 * fresh from the records every time. Records themselves are never modified.
 *
* This derives clinical care tracking from finalized health records.
 * which are RHU-published programs a patient is explicitly enrolled into.
 */

// ---------------------------------------------------------------------------
// Small local helpers
// ---------------------------------------------------------------------------

/** Care & Programs shows Prenatal-phase Maternal Care as Active. */
export function maternalCareCardStatus(status) {
  return status === "Prenatal" ? "Active" : status;
}

function getMaternalData(record = {}) {
  return record.maternalData || record.maternal_data || {};
}

function getFamilyPlanningData(record = {}) {
  return record.familyPlanningData || record.family_planning_data || {};
}

function getMonitoringData(record = {}) {
  return record.monitoringData || record.monitoring_data || {};
}

function getVisitPurposeServices(record = {}) {
  const purpose = getMonitoringData(record).visitPurpose || {};
  return Array.isArray(purpose.services) ? purpose.services : [];
}

export const DISEASE_TRACKING_KEYS = Object.freeze(["tb", "hypertension", "diabetes_mellitus"]);

export function isDiseaseTrackingKey(key) {
  return DISEASE_TRACKING_KEYS.includes(key);
}

/** Overview lists current care only; the full Care & Programs view keeps history. */
export function isActiveCareTrackingEntry(entry) {
  switch (entry.key) {
    case "maternal":
      return entry.status === "Prenatal" || entry.status === "Postpartum";
    case "nutrition":
      return entry.status === "Active";
    case "epi":
      return entry.status === "In progress";
    case "familyPlanning":
      return entry.records.length > 0 && Boolean(
        normalizeFpClientTypeCode(entry.status) || ["Recorded", "New Acceptor", "Current User"].includes(entry.status),
      );
    case "tb":
      if (entry.hasActiveTreatment && ["Registered", "Intensive Phase", "Continuation Phase", "Active", "Controlled"].includes(entry.status)) return true;
      // A diagnosis alone is not an active BHC monitoring enrollment.
      return entry.monitoringStatus === "Active" && ["Active", "Controlled"].includes(entry.status);
    case "hypertension":
    case "diabetes_mellitus":
      return entry.monitoringStatus === "Active" && ["Active", "Controlled"].includes(entry.status);
    default:
      return false;
  }
}

function conditionIdentityOf(condition) {
  return String(condition?.conditionIdentity || condition?.condition_identity || "").trim();
}

function conditionByIdentity(conditions = [], identity) {
  return (conditions || []).find((condition) => conditionIdentityOf(condition) === identity) || null;
}

function monitoringStatusLabel(condition) {
  const status = String(condition?.monitoring?.status || "").trim().toLowerCase();
  if (status === "stopped") return "Stopped";
  if (status === "active" || condition?.monitoring?.id) return "Active";
  return "Not Started";
}

function latestBpFact(records) {
  const last = bloodPressureTrendPoints(records).at(-1);
  if (!last) return null;
  const systolic = last.systolic === null ? "—" : last.systolic;
  const diastolic = last.diastolic === null ? "—" : last.diastolic;
  return { label: "Latest BP", value: `${systolic}/${diastolic} mmHg`, type: "text" };
}

function latestFbsFact(records) {
  const last = fbsTrendPoints(records).at(-1);
  if (!last) return null;
  return { label: "Latest FBS", value: `${last.value} ${last.unit}`, type: "text" };
}

function monitoringFact(condition) {
  return { label: "BHC monitoring", value: monitoringStatusLabel(condition), type: "text" };
}

function clinicalStatusOf(condition, fallback = "") {
  return conditionStatusLabel(condition?.status) || fallback;
}

function toDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function addDays(date, days) {
  const next = new Date(date.getTime());
  next.setDate(next.getDate() + days);
  return next;
}

function getPatientBirthDate(patient = {}) {
  return (
    patient?.birthdate ||
    patient?.birthDate ||
    patient?.dateOfBirth ||
    patient?.date_of_birth ||
    ""
  );
}

/** Whole months between a birth date and a later target date. */
function monthsBetween(birthDateValue, targetDate) {
  const dob = toDate(birthDateValue);
  if (!dob || !targetDate) return null;
  let months =
    (targetDate.getFullYear() - dob.getFullYear()) * 12 +
    (targetDate.getMonth() - dob.getMonth());
  if (targetDate.getDate() < dob.getDate()) months -= 1;
  return Math.max(months, 0);
}

function sortRecordsByDateAsc(records = []) {
  return [...records].sort((a, b) => {
    const aTime = toDate(getRecordDateValue(a))?.getTime() ?? 0;
    const bTime = toDate(getRecordDateValue(b))?.getTime() ?? 0;
    return aTime - bTime;
  });
}

function recordsForProgram(records, key) {
  const program = getSpecializedRecordPrograms(records).find((entry) => entry.key === key);
  return program ? program.records : [];
}

// ---------------------------------------------------------------------------
// Maternal
// ---------------------------------------------------------------------------

/**
 * Walks a patient's maternal records chronologically and tracks the current
 * pregnancy episode: the most recently recorded actual delivery date (never
 * derived from EDD), or - when a Postpartum visit exists but no delivery date
 * has been recorded yet - the visit that first raised that gap. A Prenatal
 * visit recorded after a completed episode's 42-day window starts a fresh
 * episode, so an old pregnancy's delivery date never leaks into a new one.
 */
function buildMaternalEpisode(maternalRecords) {
  const sorted = sortRecordsByDateAsc(maternalRecords);
  let deliveryDate = null;
  let postpartumVisitRecordNoDelivery = null;

  for (const record of sorted) {
    const data = getMaternalData(record);
    const services = getVisitPurposeServices(record);
    const recordDate = toDate(getRecordDateValue(record));
    const recordDelivery = toDate(data.deliveryDate);
    const isPostpartumVisit = services.includes("Postpartum");
    // Records saved before a purpose was chosen carry no services at all;
    // treat that as prenatal-ish rather than silently keeping a stale episode.
    const isPrenatalVisit = services.includes("Prenatal") || services.length === 0;

    if (deliveryDate && isPrenatalVisit && !isPostpartumVisit) {
      const windowEnd = addDays(deliveryDate, POSTPARTUM_WINDOW_DAYS);
      if (recordDate && recordDate > windowEnd) {
        deliveryDate = null;
        postpartumVisitRecordNoDelivery = null;
      }
    }

    if (recordDelivery) {
      deliveryDate = recordDelivery;
      postpartumVisitRecordNoDelivery = null;
    } else if (isPostpartumVisit) {
      postpartumVisitRecordNoDelivery = record;
    }
  }

  return { deliveryDate, postpartumVisitRecordNoDelivery, latest: sorted[sorted.length - 1] };
}

function buildMaternalEntry(patient, records, today) {
  const maternalRecords = recordsForProgram(records, "maternal");
  const applicable = isWomensHealthApplicable(patient);
  const hasHistory = maternalRecords.length > 0;
  if (!applicable && !hasHistory) return null;

  if (!hasHistory) {
    return {
      key: "maternal",
      label: "Maternal Care",
      status: "Not started",
      statusTone: "neutral",
      facts: [],
      lastVisit: "",
      nextVisit: "",
      flags: [],
      action: null,
      records: [],
    };
  }

  const { deliveryDate, postpartumVisitRecordNoDelivery, latest } = buildMaternalEpisode(maternalRecords);
  const latestData = getMaternalData(latest);
  const facts = [];
  const flags = [];
  let status;
  let statusTone;
  let action = null;

  if (deliveryDate) {
    const windowEnd = addDays(deliveryDate, POSTPARTUM_WINDOW_DAYS);
    if (today > windowEnd) {
      status = "Completed";
      statusTone = "neutral";
    } else {
      status = "Postpartum";
      statusTone = "info";
    }
    facts.push({ label: "Delivery Date", value: deliveryDate.toISOString().slice(0, 10), type: "date" });
  } else if (postpartumVisitRecordNoDelivery) {
    status = "Postpartum";
    statusTone = "info";
    flags.push({ label: "Delivery date not recorded", tone: "warning" });
    action = { type: "start-postpartum-follow-up", label: "Start Postpartum Follow-up" };
    // Display-only fallback - never used to compute completion.
    const fallbackVisitDate = getRecordDateValue(postpartumVisitRecordNoDelivery);
    if (fallbackVisitDate) {
      facts.push({ label: "First Postpartum Visit", value: fallbackVisitDate, type: "date" });
    }
  } else {
    status = "Prenatal";
    statusTone = "info";
    if (latestData.gravida || latestData.para) {
      facts.push({
        label: "G/P",
        value: `G${latestData.gravida || "-"} P${latestData.para || "-"}`,
        type: "text",
      });
    }
    const aog = latest.aog || latestData.aog;
    if (aog) facts.push({ label: "AOG", value: aog, type: "text" });
    const edd = latest.expectedDeliveryDate || latestData.expectedDeliveryDate;
    if (edd) facts.push({ label: "EDD", value: edd, type: "date" });
  }

  return {
    key: "maternal",
    label: "Maternal Care",
    status,
    statusTone,
    facts,
    lastVisit: getRecordDateValue(latest),
    nextVisit:
      latest.followUpDate ||
      latest.follow_up_date ||
      latest.monitoringData?.followUpDate ||
      latest.monitoring_data?.followUpDate ||
      latestData.nextAppointmentDate ||
      "",
    flags,
    action,
    records: maternalRecords,
  };
}

// ---------------------------------------------------------------------------
// Family Planning
// ---------------------------------------------------------------------------

function buildFamilyPlanningEntry(patient, records, today) {
  const fpRecords = recordsForProgram(records, "familyPlanning");
  const applicable = isWomensHealthApplicable(patient);
  const hasHistory = fpRecords.length > 0;
  if (!applicable && !hasHistory) return null;

  if (!hasHistory) {
    return {
      key: "familyPlanning",
      label: "Family Planning",
      status: "Not started",
      statusTone: "neutral",
      facts: [],
      lastVisit: "",
      nextVisit: "",
      flags: [],
      action: null,
      records: [],
    };
  }

  const sorted = sortRecordsByDateAsc(fpRecords);
  const latest = sorted[sorted.length - 1];
  const data = getFamilyPlanningData(latest);
  const clientType = String(data.clientType || "").trim();
  const method = String(data.methodUsed || "").trim();
  const nextAppointment = toDate(data.nextAppointmentDate);
  // Overdue is a fact about the calendar, not a re-derived client status -
  // it never turns into an automatic Lapsed / Dropout on its own.
  const overdue = Boolean(nextAppointment && nextAppointment < today);

  const facts = [];
  if (method) facts.push({ label: "Method", value: method, type: "text" });

  const flags = [];
  if (overdue) flags.push({ label: "Appointment overdue", tone: "warning" });

  return {
    key: "familyPlanning",
    label: "Family Planning",
    status: clientType || "Recorded",
    statusTone: "info",
    facts,
    lastVisit: getRecordDateValue(latest),
    nextVisit: data.nextAppointmentDate || "",
    flags,
    action: null,
    records: fpRecords,
  };
}

// ---------------------------------------------------------------------------
// TB DOTS
// ---------------------------------------------------------------------------

function linkedSupportingLabFacts(records = []) {
  const sorted = sortRecordsByDateAsc(records || []);
  for (let index = sorted.length - 1; index >= 0; index -= 1) {
    const record = sorted[index];
    const diagnoses = Array.isArray(record?.diagnoses) ? record.diagnoses : [];
    const labs = [
      ...(Array.isArray(record?.laboratoryTests) ? record.laboratoryTests : []),
      ...(Array.isArray(record?.laboratory_tests) ? record.laboratory_tests : []),
    ];
    const byRecordId = new Map(labs.filter((lab) => lab?.recordId != null).map((lab) => [String(lab.recordId), lab]));
    for (const diagnosis of diagnoses) {
      const type = diagnosis?.tbManagement?.diagnosisType || diagnosis?.tb_management?.diagnosis_type;
      const selected = Array.isArray(diagnosis?.supportingLaboratoryTests)
        ? diagnosis.supportingLaboratoryTests
        : Array.isArray(diagnosis?.supporting_laboratory_tests)
          ? diagnosis.supporting_laboratory_tests
          : [];
      if (type !== "presumptive_tb" || selected.length === 0) continue;
      const summaries = selected.map((item) => {
        const reference = String(item?.reference || "");
        const match = reference.match(/^record:(\d+)$/i);
        const lab = match ? byRecordId.get(match[1]) : null;
        if (!lab) return null;
        return [lab.testName || lab.test_name || "Unnamed test", lab.resultStatus || lab.result_status || "Requested"]
          .filter(Boolean)
          .join(" · ");
      }).filter(Boolean);
      if (summaries.length) {
        return [{ label: "Supporting labs", value: summaries.join("; "), type: "text" }];
      }
    }
  }
  return [];
}

function buildTbEntry(records, today, condition = null) {
  const tbRecords = recordsForProgram(records, "tb");
  const evaluationRecords = (records || []).filter((record) => {
    const diagnoses = Array.isArray(record?.diagnoses) ? record.diagnoses : [];
    return diagnoses.some((diagnosis) => {
      const type = diagnosis?.tbManagement?.diagnosisType || diagnosis?.tb_management?.diagnosis_type;
      return type === "presumptive_tb";
    });
  });
  if (tbRecords.length === 0 && evaluationRecords.length === 0 && !condition) return null;

  const sorted = sortRecordsByDateAsc(tbRecords.length ? tbRecords : evaluationRecords);
  const latest = sorted[sorted.length - 1];
  const rawData = latest ? (latest.tbData || latest.tb_data || {}) : {};
  const tb = latest && tbRecords.length ? getTbData(latest) : {};
  const outcomeStatus = String(rawData.outcome?.status || "").trim();

  const facts = [];
  const flags = [];
  let status;
  let statusTone = "info";

  if (condition) {
    status = clinicalStatusOf(condition, "Active");
    statusTone = condition.status === "resolved" || condition.status === "ruled_out" ? "neutral" : "info";
  } else if (outcomeStatus) {
    status = TB_OUTCOME_LABELS[outcomeStatus] || outcomeStatus;
    statusTone = TB_POSITIVE_OUTCOMES.includes(outcomeStatus) ? "success" : "warning";
  } else if (tbRecords.length === 0 && (condition?.status === "under_evaluation" || evaluationRecords.length)) {
    status = "Under Evaluation";
    statusTone = "info";
  } else {
    status = tb.phaseLabel || "Registered";
    const continuationEnd = toDate(rawData.phases?.continuationEnd);
    if (continuationEnd && continuationEnd < today) {
      flags.push({ label: "Outcome not recorded", tone: "warning" });
    }
  }

  if (tb.adherencePercent) {
    flags.push({
      label: `Adherence ${tb.adherencePercent}%`,
      tone: tb.adherencePercent < TB_ADHERENCE_WARNING_THRESHOLD ? "warning" : "neutral",
    });
  }

  if (condition) facts.push(monitoringFact(condition));
  if (condition?.status === "under_evaluation" || (!tbRecords.length && evaluationRecords.length)) {
    facts.push(...linkedSupportingLabFacts([...tbRecords, ...evaluationRecords, ...(records || [])]));
  }
  if (tb.tbCaseNumber) facts.push({ label: "Case No.", value: tb.tbCaseNumber, type: "text" });
  if (tb.registrationGroup) facts.push({ label: "Registration Group", value: tb.registrationGroup, type: "text" });
  if (condition && (tb.phaseLabel || outcomeStatus)) {
    facts.push({
      label: "Treatment",
      value: outcomeStatus ? (TB_OUTCOME_LABELS[outcomeStatus] || outcomeStatus) : tb.phaseLabel,
      type: "text",
    });
  }

  return {
    key: "tb",
    label: "Tuberculosis",
    status,
    monitoringStatus: monitoringStatusLabel(condition),
    hasActiveTreatment: tbRecords.length > 0 && !outcomeStatus,
    statusTone,
    facts,
    lastVisit: latest ? getRecordDateValue(latest) : "",
    nextVisit: "",
    flags,
    action: null,
    records: tbRecords.length ? tbRecords : evaluationRecords,
  };
}

const NCD_FOLLOW_UP_TERMS = Object.freeze({
  hypertension: ["hypertension", "htn", "high blood"],
  diabetes_mellitus: ["diabetes", "dm", "fbs", "blood sugar", "glucose"],
});

function followUpState(task = {}) {
  return String(task.state || task.effectiveState || "").trim().toLowerCase();
}

/** Active/pending (including overdue no-show); never fulfilled, cancelled, or superseded. */
export function isOpenFollowUpTask(task = {}) {
  if (task.rescheduledToId || task.rescheduled_to_id) return false;
  const state = followUpState(task);
  if (state === "fulfilled" || state === "cancelled") return false;
  if (task.fulfilledAt || task.fulfilled_at || task.cancelledAt || task.cancelled_at) return false;
  if (!state) return true;
  return ["pending", "rescheduled", "no_show", "due_today", "upcoming"].includes(state);
}

function followUpMatchesNcd(task, { key, label }) {
  const terms = NCD_FOLLOW_UP_TERMS[key] || [String(label || "").toLowerCase()].filter(Boolean);
  if (!terms.length) return false;
  // Match only task text — never the card label, or every open task would qualify.
  const haystack = [task.purpose, task.purposeKey, task.purpose_key, task.reason, task.notes]
    .map((value) => String(value || "").toLowerCase())
    .join(" ");
  return terms.some((term) => haystack.includes(term));
}

/** Earliest open/overdue condition-matched due date, else "". */
export function nextVisitFromFollowUps({ key, label, condition, followUpTasks = [] } = {}) {
  const dates = (followUpTasks || [])
    .filter((task) => isOpenFollowUpTask(task))
    .filter((task) => followUpMatchesNcd(task, { key, label, condition }))
    .map((task) => String(task.dueDate || task.due_date || "").slice(0, 10))
    .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))
    .sort();
  return dates[0] || "";
}

function buildNcdEntry({ key, label, condition, records, measurementFact, followUpTasks }) {
  if (!condition) return null;
  const facts = [monitoringFact(condition)];
  const latest = measurementFact(records);
  if (latest) facts.push(latest);
  const past = condition.status === "resolved" || condition.status === "ruled_out";
  return {
    key,
    label,
    status: clinicalStatusOf(condition, "Active"),
    monitoringStatus: monitoringStatusLabel(condition),
    statusTone: past ? "neutral" : "info",
    facts,
    lastVisit: records[0] ? getRecordDateValue(sortRecordsByDateAsc(records).at(-1)) : "",
    nextVisit: nextVisitFromFollowUps({ key, label, condition, followUpTasks }),
    flags: [],
    action: null,
    records,
  };
}

// ---------------------------------------------------------------------------
// EPI
// ---------------------------------------------------------------------------

function buildEpiEntry(patient, records) {
  const epiRecords = recordsForProgram(records, "epi");
  const applicable = isPediatricApplicable(patient);
  const hasHistory = epiRecords.length > 0;
  if (!applicable && !hasHistory) return null;

  // EPI_EXTRA_INDICATORS keeps its display casing ("Newborn Screening"), but
  // normalizeVaccineName always upper-cases - normalize both sides to match.
  const extraIndicatorsByNormalizedName = new Map(
    EPI_EXTRA_INDICATORS.map((name) => [normalizeVaccineName(name), name]),
  );

  const givenAt = new Map(); // normalized antigen name -> earliest date given
  const extrasGiven = new Set();

  for (const record of epiRecords) {
    for (const entry of getEpiVaccineEntries(record)) {
      const normalized = normalizeVaccineName(entry.vaccineName);
      const dateGiven = entry.dateGiven || getRecordDateValue(record);
      if (EPI_INFANT_SCHEDULE.includes(normalized)) {
        const existing = givenAt.get(normalized);
        if (!existing || (dateGiven && dateGiven < existing)) {
          givenAt.set(normalized, dateGiven);
        }
      } else if (extraIndicatorsByNormalizedName.has(normalized)) {
        extrasGiven.add(extraIndicatorsByNormalizedName.get(normalized));
      }
    }
  }

  const givenCount = givenAt.size;
  const totalCount = EPI_INFANT_SCHEDULE.length;

  let status;
  let statusTone;
  if (givenCount === 0) {
    status = "Not started";
    statusTone = "neutral";
  } else if (givenCount < totalCount) {
    status = "In progress";
    statusTone = "info";
  } else {
    const lastDoseDates = [...givenAt.values()].map(toDate).filter(Boolean);
    const lastDoseDate = lastDoseDates.length
      ? new Date(Math.max(...lastDoseDates.map((date) => date.getTime())))
      : null;
    const ageAtCompletionMonths = monthsBetween(getPatientBirthDate(patient), lastDoseDate);
    status =
      ageAtCompletionMonths !== null && ageAtCompletionMonths <= EPI_FIC_AGE_LIMIT_MONTHS
        ? "Fully Immunized (FIC)"
        : "Completely Immunized (CIC)";
    statusTone = "success";
  }

  const flags = [...extrasGiven].map((label) => ({ label, tone: "neutral" }));
  const sorted = sortRecordsByDateAsc(epiRecords);
  const latest = sorted[sorted.length - 1];

  return {
    key: "epi",
    label: "EPI / Immunization",
    status,
    statusTone,
    facts: [
      { label: "Doses", value: `${givenCount} of ${totalCount} applicable doses recorded`, type: "text" },
    ],
    lastVisit: hasHistory ? getRecordDateValue(latest) : "",
    nextVisit: "",
    flags,
    action: null,
    records: epiRecords,
  };
}

// ---------------------------------------------------------------------------
// Nutrition
// ---------------------------------------------------------------------------

function patientBirthDate(patient = {}) {
  return patient?.birthdate || patient?.birthDate || patient?.dateOfBirth || patient?.date_of_birth || "";
}

function closureEnrollmentDate(nutritionCare) {
  const closures = Array.isArray(nutritionCare?.closures) ? nutritionCare.closures : [];
  const last = closures[closures.length - 1];
  return last?.enrolledOn || last?.enrolled_on || "";
}

export function buildNutritionEntry(patient, records, today, { nutritionCare } = {}) {
  const state = resolveNutritionCare(records, nutritionCare);
  const age = calculateAgeInYears(patientBirthDate(patient), today);
  const history = state.fromApi
    ? nutritionHistoryFromApi(nutritionCare)
    : state.episodeStartedOn
      ? nutritionMeasurementHistory(records, {
        startedOn: state.episodeStartedOn,
        closedOn: state.closedOn,
        age,
      })
      : [];
  const readings = state.fromApi ? nutritionReadingsFromApi(nutritionCare) : summarizeNutritionHistory(history);
  const enrolledOn = state.fromApi
    ? (state.enrolledOn || closureEnrollmentDate(nutritionCare) || state.episodeStartedOn)
    : state.episodeStartedOn;

  return {
    key: "nutrition",
    label: "Nutrition Care",
    status: state.status,
    statusTone: state.enrolled ? "success" : "neutral",
    facts: nutritionCareFacts({ enrolledOn, ...readings }),
    lastVisit: history.length ? history[history.length - 1].dateRecorded : "",
    nextVisit: "",
    flags: [],
    action: state.enrolled ? { type: "close-nutrition-care", label: "Close Nutrition Care" } : null,
    records: state.episodeRecords,
    measurementHistory: history,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * One Care Tracking entry per applicable/historied program, in display order.
 * `today` is injectable so status derivation (postpartum windows, overdue
 * appointments) is exercisable deterministically in tests.
 */
export function getCareTracking(patient = {}, records = [], today = new Date(), options = {}) {
  const conditions = options.conditions || [];
  const followUpTasks = options.followUpTasks || [];
  const list = Array.isArray(records) ? records : [];
  return [
    buildMaternalEntry(patient, list, today),
    buildFamilyPlanningEntry(patient, list, today),
    buildEpiEntry(patient, list),
    buildNcdEntry({
      key: "hypertension",
      label: "Hypertension",
      condition: conditionByIdentity(conditions, "hypertension"),
      records: list,
      measurementFact: latestBpFact,
      followUpTasks,
    }),
    buildNcdEntry({
      key: "diabetes_mellitus",
      label: "Diabetes Mellitus",
      condition: conditionByIdentity(conditions, "diabetes_mellitus"),
      records: list,
      measurementFact: latestFbsFact,
      followUpTasks,
    }),
    buildTbEntry(list, today, conditionByIdentity(conditions, "tuberculosis")),
    buildNutritionEntry(patient, list, today, { nutritionCare: options.nutritionCare }),
  ].filter(Boolean);
}

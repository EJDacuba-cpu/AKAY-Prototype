// Extensions are explicit so this module can be exercised directly by
// `node --test`, which does not resolve extensionless specifiers.
import {
  getSpecializedRecordPrograms,
  getRecordDateValue,
  getEpiVaccineEntries,
  normalizeVaccineName,
  getTbData,
} from "./healthRecordPrograms.js";
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

/**
 * Care Tracking: derives one read-only status card per clinical program
 * (Maternal, Family Planning, EPI, TB) from the patient's existing health
 * records. There is no enrollment step - a program appears once the patient
 * is eligible for it or already has records in it (the same `applicable ||
 * hasHistory` rule as programApplicability.js), and its status is worked out
 * fresh from the records every time. Records themselves are never modified.
 *
 * This is distinct from Community Programs (see communityProgramService.js),
 * which are RHU-published programs a patient is explicitly enrolled into.
 */

// ---------------------------------------------------------------------------
// Small local helpers
// ---------------------------------------------------------------------------

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
    nextVisit: "",
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

function buildTbEntry(records, today) {
  const tbRecords = recordsForProgram(records, "tb");
  // TB has no eligibility window - it only ever appears once there is a case.
  if (tbRecords.length === 0) return null;

  const sorted = sortRecordsByDateAsc(tbRecords);
  const latest = sorted[sorted.length - 1];
  const rawData = latest.tbData || latest.tb_data || {};
  const tb = getTbData(latest);
  const outcomeStatus = String(rawData.outcome?.status || "").trim();

  const facts = [];
  const flags = [];
  let status;
  let statusTone;

  if (outcomeStatus) {
    status = TB_OUTCOME_LABELS[outcomeStatus] || outcomeStatus;
    statusTone = TB_POSITIVE_OUTCOMES.includes(outcomeStatus) ? "success" : "warning";
  } else {
    status = tb.phaseLabel || "Registered";
    statusTone = "info";
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

  if (tb.tbCaseNumber) facts.push({ label: "Case No.", value: tb.tbCaseNumber, type: "text" });
  if (tb.registrationGroup) facts.push({ label: "Registration Group", value: tb.registrationGroup, type: "text" });

  return {
    key: "tb",
    label: "TB DOTS",
    status,
    statusTone,
    facts,
    lastVisit: getRecordDateValue(latest),
    nextVisit: "",
    flags,
    action: null,
    records: tbRecords,
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
// Public API
// ---------------------------------------------------------------------------

/**
 * One Care Tracking entry per applicable/historied program, in display order.
 * `today` is injectable so status derivation (postpartum windows, overdue
 * appointments) is exercisable deterministically in tests.
 */
export function getCareTracking(patient = {}, records = [], today = new Date()) {
  return [
    buildMaternalEntry(patient, records, today),
    buildFamilyPlanningEntry(patient, records, today),
    buildEpiEntry(patient, records),
    buildTbEntry(records, today),
  ].filter(Boolean);
}

import {
  formatDisplayValue,
  formatLongDate,
  formatUserName,
} from "../../../utils/formatters";
import { formatServiceType } from "../../../utils/healthRecordPrograms";
import { calculateBmi, formatBmi, getBmiCategory } from "../../../utils/bmi";

/* ─────────────────────────────────────────────
   Shared health-record detail helpers
   Extracted from pages/bhc/HealthRecordDetails.jsx so the BHC health record
   page, the BHC/RHU referral details pages, and (eventually) the RHU record
   details page can all render the same clinical data the same way.
──────────────────────────────────────────── */

export function isImmunizationClassification(record = {}, patient = {}) {
  return [
    record.classification,
    record.category,
    record.recordType,
    record.record_type,
    record.healthRecordType,
    record.health_record_type,
    record.patientClassification,
    patient?.category,
    patient?.patientClassification,
  ].some((value) => {
    const normalized = String(value || "").toLowerCase();
    return (
      normalized === "immunization" ||
      normalized.includes("epi") ||
      normalized.includes("child health") ||
      normalized.includes("vaccination") ||
      normalized.includes("vaccine")
    );
  });
}

export function getImmunizationData(record = {}) {
  return record.immunizationData || record.immunization_data || {};
}

export function getEpiVaccineEntries(record = {}) {
  const data = getImmunizationData(record);
  const entries = Array.isArray(data.vaccineEntries)
    ? data.vaccineEntries
    : Array.isArray(data.vaccinesGiven)
      ? data.vaccinesGiven
      : Array.isArray(record.vaccineEntries)
        ? record.vaccineEntries
        : Array.isArray(record.vaccinesGiven)
          ? record.vaccinesGiven
          : [];

  return entries
    .filter((entry) => entry && typeof entry === "object")
    .filter((entry) => String(entry.vaccineName || entry.vaccine_name || "").trim())
    .map((entry) => ({
      vaccineName: entry.vaccineName || entry.vaccine_name || "Vaccine",
      dateGiven: entry.dateGiven || entry.date_given || entry.date || "",
      weight: entry.weight || "",
      height: entry.height || "",
      temperature: entry.temperature || entry.temp || "",
      remarks: entry.remarks || entry.notes || "",
    }));
}

export function getEpiBreastfeedingMonitoring(record = {}) {
  const data = getImmunizationData(record);
  return (
    data.breastfeedingMonitoring ||
    data.breastfeeding_monitoring ||
    record.breastfeedingMonitoring ||
    record.breastfeeding_monitoring ||
    {}
  );
}

export function getConfirmedBreastfeedingMonths(data = {}) {
  const months = [
    ["month1", "1 Month"],
    ["month2", "2 Months"],
    ["month3", "3 Months"],
    ["month4", "4 Months"],
    ["month5", "5 Months"],
    ["month6", "6 Months"],
  ];

  return months
    .filter(([key]) => data[key] === true || data[key] === "yes")
    .map(([, label]) => label);
}

export function getEpiRemarks(record = {}) {
  const data = getImmunizationData(record);
  return getRecordValue(
    {
      ...data,
      ...record,
    },
    [
      "consultationNotes",
      "consultation_notes",
      "notes",
      "remarks",
      "medicalNotes",
      "medical_notes",
    ],
    "",
  );
}

export function getVisitLevelMonitoringItems(record = {}) {
  return [
    {
      label: "Weight",
      value: formatMeasurement(getRecordValue(record, ["weight"], ""), "kg"),
    },
    {
      label: "Height",
      value: formatMeasurement(getRecordValue(record, ["height"], ""), "cm"),
    },
    {
      label: "Temperature",
      value: formatMeasurement(
        getRecordValue(record, ["temperature", "temp"], ""),
        "°C",
      ),
    },
  ];
}

export function formatMeasurement(value, unit) {
  const clean = String(value || "").trim();
  if (!clean) return "";
  return clean.toLowerCase().includes(String(unit).toLowerCase())
    ? clean
    : `${clean} ${unit}`;
}

export function getFamilyPlanningDetails(record = {}) {
  const data = record.familyPlanningData || record.family_planning_data || {};

  return [
    {
      label: "Client Type",
      value: getRecordValue(data, ["clientType", "client_type"], ""),
    },
    {
      label: "Method Used / Accepted",
      value: getRecordValue(data, ["methodUsed", "method_used"], ""),
    },
    {
      label: "FP Visit Category",
      value: getRecordValue(
        data,
        ["fpVisitType", "fp_visit_type", "visitType", "visit_type"],
        "",
      ),
    },
    {
      label: "Previous Method",
      value: getRecordValue(data, ["previousMethod", "previous_method"], ""),
    },
    {
      label: "Source",
      value: getRecordValue(data, ["source"], ""),
    },
    {
      label: "Date Registered",
      value: formatLongDate(
        getRecordValue(data, ["dateRegistered", "date_registered"], ""),
        "",
      ),
    },
    {
      label: "Date of Visit",
      value: formatLongDate(
        getRecordValue(data, ["dateOfVisit", "date_of_visit"], ""),
        "",
      ),
    },
    {
      label: "Next Appointment Date",
      value: formatLongDate(
        getRecordValue(
          data,
          ["nextAppointmentDate", "next_appointment_date"],
          "",
        ),
        "",
      ),
    },
    {
      label: "Remarks / Notes",
      value: getRecordValue(data, ["remarks", "notes"], ""),
    },
    {
      label: "Action Taken",
      value: getRecordValue(data, ["actionTaken", "action_taken"], ""),
    },
    {
      label: "Concern / Complaint",
      value: getRecordValue(data, ["concern"], ""),
    },
    {
      label: "Findings / Notes",
      value: getRecordValue(data, ["findings"], ""),
    },
    {
      label: "Advice Given",
      value: getRecordValue(data, ["adviceGiven", "advice_given"], ""),
    },
  ];
}

export function normalizeHealthRecordStatus(status) {
  const value = String(status || "").trim();
  const compact = value.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();

  if (!value || compact === "consultation") return "Routine Monitoring";
  if (["follow up", "follow up required", "follow up after 2 days"].includes(compact)) {
    return "Follow-up Required";
  }
  if (["completed", "complete", "recovered", "closed", "discharged"].includes(compact)) {
    return "Completed";
  }

  return "Routine Monitoring";
}

export function getHealthRecordDetailsTitle(serviceType = "") {
  const normalized = formatServiceType(serviceType, "");
  if (normalized === "Maternal / Prenatal") return "Maternal / Prenatal Record";
  if (normalized === "Child Health / EPI") return "Child Health / EPI Record";
  if (normalized === "Family Planning") return "Family Planning Record";
  if (normalized === "Hypertension / Diabetic Monitoring") {
    return "Hypertension / Diabetic Monitoring Record";
  }
  if (normalized === "TB DOTS / TB Monitoring") return "TB Follow-up Record";
  if (normalized === "General Consultation") return "General Consultation Record";
  return normalized ? `${normalized} Record` : "Health Record Details";
}

export function getParentHealthRecordId(record = {}) {
  const monitoringData = record.monitoringData || record.monitoring_data || {};

  return formatDisplayValue(
    record.parentHealthRecordId ||
      record.parent_health_record_id ||
      record.originalHealthRecordId ||
      record.original_health_record_id ||
      monitoringData.parentHealthRecordId ||
      monitoringData.parent_health_record_id ||
      monitoringData.previousRecordId ||
      record.previousRecordId,
    "",
  );
}

export function getRecordVisitTypeValue(record = {}) {
  const monitoringData = record.monitoringData || record.monitoring_data || {};
  const value = String(
    record.visitType ||
      record.visit_type ||
      monitoringData.visitType ||
      monitoringData.visit_type ||
      "",
  )
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ");

  if (
    value === "follow up visit" ||
    value === "follow up" ||
    record.isFollowUp ||
    record.is_follow_up ||
    getParentHealthRecordId(record)
  ) {
    return "follow_up_visit";
  }

  return "initial_consultation";
}

export function getRecordValue(record = {}, keys = [], fallback = "Not recorded") {
  for (const key of keys) {
    const value = record?.[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }

  return fallback;
}

export function isLikelyRawId(value) {
  return /^[0-9a-f-]{8,}$/i.test(String(value || "").trim());
}

export function getNestedRecordValue(record = {}, directKeys = [], nestedKeys = []) {
  const direct = getRecordValue(record, directKeys, "");
  if (direct) return direct;

  for (const nestedKey of nestedKeys) {
    const nested = record?.[nestedKey];
    if (!nested || typeof nested !== "object") continue;
    const value = getRecordValue(nested, directKeys, "");
    if (value) return value;
  }

  return "";
}

export function normalizeMorbidityReportingStatus(value = "") {
  const normalized = String(value || "").trim().toLowerCase();
  return ["not_included", "morbidity", "notifiable"].includes(normalized)
    ? normalized
    : "";
}

export function getMorbidityReportingStatus(record = {}) {
  const explicitStatus = normalizeMorbidityReportingStatus(
    getNestedRecordValue(
      record,
      ["morbidityReportingStatus", "morbidity_reporting_status"],
      ["monitoringData", "monitoring_data"],
    ),
  );
  if (explicitStatus) return explicitStatus;

  const included = String(
    getNestedRecordValue(
      record,
      ["includeInMorbidityReport", "include_in_morbidity_report"],
      ["monitoringData", "monitoring_data"],
    ),
  ).toLowerCase();
  const notifiable = String(
    getNestedRecordValue(
      record,
      ["isNotifiableDisease", "is_notifiable_disease"],
      ["monitoringData", "monitoring_data"],
    ),
  ).toLowerCase();

  if (included === "true" || included === "yes") {
    return notifiable === "true" || notifiable === "yes"
      ? "notifiable"
      : "morbidity";
  }

  return "not_included";
}

export function formatMorbidityReportingStatus(status = "") {
  switch (normalizeMorbidityReportingStatus(status)) {
    case "morbidity":
      return "Include in Morbidity Log";
    case "notifiable":
      return "Mark as Notifiable Disease";
    default:
      return "Not included";
  }
}

export function getSurveillanceCategoryValue(record = {}) {
  const raw = getNestedRecordValue(
    record,
    [
      "surveillanceCategory",
      "surveillance_category",
      "diseaseSurveillanceCategory",
      "disease_surveillance_category",
      "diseaseCategory",
      "disease_category",
    ],
    ["monitoringData", "monitoring_data"],
  );
  const normalized = String(raw || "").trim().toLowerCase();
  if (
    normalized === "hfmd" ||
    normalized.includes("hand, foot") ||
    normalized.includes("hand foot") ||
    normalized.includes("mouth disease")
  ) {
    return "hfmd";
  }
  if (normalized === "other") return "other";
  return normalized;
}

export function getHfmdSurveillance(record = {}) {
  const explicit = getNestedRecordValue(
    record,
    ["hfmdSurveillance", "hfmd_surveillance"],
    ["monitoringData", "monitoring_data"],
  );

  if (explicit !== "") {
    const normalized = String(explicit || "").trim().toLowerCase();
    return explicit === true || ["true", "yes", "1"].includes(normalized);
  }

  return getSurveillanceCategoryValue(record) === "hfmd";
}

export function getMaternalData(record = {}) {
  return record.maternalData || record.maternal_data || {};
}

export function getDispensedMedicines(record = {}) {
  const medicines = record.dispensedMedicines || record.dispensed_medicines || [];
  return Array.isArray(medicines) ? medicines.filter(Boolean) : [];
}

export function getRecordDateValue(record = {}) {
  return getRecordValue(
    record,
    ["dateOfVisit", "date_of_visit", "dateRecorded", "date_recorded", "visitDate", "date", "createdAt", "created_at"],
    "",
  );
}

export function getRecordTime(record = {}) {
  const direct = getRecordValue(record, ["timeOfVisit", "time_of_visit", "time"], "");
  if (direct) return formatDisplayTime(direct, "");

  const recorded = getRecordValue(record, ["dateRecorded", "date_recorded"], "");
  const match = String(recorded).match(/\d{2}:\d{2}/);
  return match ? formatDisplayTime(match[0], "") : "";
}

export function formatDisplayTime(value, fallback = "Not recorded") {
  const raw = String(value || "").trim();
  if (!raw) return fallback;

  const dateValue = new Date(raw);
  if (!Number.isNaN(dateValue.getTime()) && raw.includes("T")) {
    return dateValue.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  }

  const match = raw.match(/(\d{1,2}):(\d{2})/);
  if (!match) return raw;

  const hours = Number(match[1]);
  const minutes = match[2];
  if (Number.isNaN(hours) || hours > 23) return raw;

  const period = hours >= 12 ? "PM" : "AM";
  const displayHour = hours % 12 || 12;
  return `${displayHour}:${minutes} ${period}`;
}

export function getRecordDiagnosis(record = {}, fallback = "Not recorded") {
  return getRecordValue(record, ["diagnosis", "initialDiagnosis", "initial_diagnosis"], fallback);
}

export function getRecordChiefComplaint(record = {}, fallback = "Not recorded") {
  return getRecordValue(record, ["chiefComplaint", "chief_complaint", "concern"], fallback);
}

export function getRecordSummary(record = {}, fallback = "Not recorded") {
  return getRecordValue(
    record,
    [
      "summaryOfPresentIllness",
      "summary_of_present_illness",
      "physicalExamination",
      "physical_examination",
      "medicalHistory",
      "medical_history",
      "notes",
    ],
    fallback,
  );
}

export function getRecordNotes(record = {}, fallback = "Not recorded") {
  return getRecordValue(
    record,
    ["consultationNotes", "consultation_notes", "medicalNotes", "medical_notes", "notes"],
    fallback,
  );
}

export function getCompletedRecordMedicalNotes(
  record = {},
  monitoringNotes = "",
  fallback = "Not recorded",
) {
  const notes = getRecordNotes(record, "");
  if (notes) return notes;
  return monitoringNotes || fallback;
}

export function getRecordTreatmentNotes(record = {}, fallback = "") {
  return getRecordValue(
    record,
    ["treatmentNotes", "treatment_notes", "treatment"],
    fallback,
  );
}

export function isDistinctRecordedValue(value, ...existingValues) {
  const normalized = String(value || "").trim();
  if (!normalized || normalized === "Not recorded") return false;

  return existingValues.every(
    (existingValue) =>
      String(existingValue || "").trim().toLowerCase() !==
      normalized.toLowerCase(),
  );
}

export function getRecordInitialActions(record = {}, fallback = "Not recorded") {
  return getRecordValue(
    record,
    [
      "initialActionsTaken",
      "initialActionTaken",
      "initial_actions_taken",
      "initial_action_taken",
      "medication",
      "treatmentNotes",
      "treatment_notes",
      "treatment",
    ],
    fallback,
  );
}

export function getRecordPractitioner(record = {}, fallback = "Not recorded") {
  const creatorName = formatUserName(
    record.creator ||
      record.createdByUser ||
      record.created_by_user ||
      record.user ||
      record.practitioner ||
      record.staff,
    "",
  );

  if (creatorName) return creatorName;

  const value = getNestedRecordValue(
    record,
    [
      "attendingStaff",
      "attending_staff",
      "nameOfPractitioner",
      "name_of_practitioner",
      "recordedBy",
      "recorded_by",
    ],
    ["monitoringData", "monitoring_data"],
  );

  if (!value || isLikelyRawId(value)) return fallback;
  return value;
}

export function getVitalSigns(record = {}, fallback = "") {
  const value = getRecordValue(record, ["vitalSigns", "vital_signs"], "");
  if (!value) {
    const values = [
      record?.systolicBp && record?.diastolicBp
        ? `BP: ${record.systolicBp}/${record.diastolicBp} mmHg`
        : "",
      record?.temp || record?.temperature ? `Temp: ${record.temp || record.temperature} C` : "",
      record?.weight ? `Weight: ${record.weight} kg` : "",
      record?.height ? `Height: ${record.height} cm` : "",
    ].filter(Boolean);

    return values.join(" | ") || fallback;
  }

  if (typeof value !== "object") return String(value);
  if (value.summary) return String(value.summary);

  const values = [
    (value.systolicBp || value.systolic_bp) && (value.diastolicBp || value.diastolic_bp)
      ? `BP: ${value.systolicBp || value.systolic_bp}/${value.diastolicBp || value.diastolic_bp} mmHg`
      : "",
    value.temperature ? `Temp: ${value.temperature} C` : "",
    value.weight ? `Weight: ${value.weight} kg` : "",
    value.height ? `Height: ${value.height} cm` : "",
  ].filter(Boolean);

  return values.join(" | ") || fallback;
}

export function getVitalSignItems(record = {}) {
  const vitalSigns = record?.vitalSigns || record?.vital_signs || {};
  const vitalObject =
    vitalSigns && typeof vitalSigns === "object" ? vitalSigns : {};
  const vitalText =
    typeof vitalSigns === "string" ? vitalSigns : getVitalSigns(record, "");

  const readTextValue = (patterns) => {
    for (const pattern of patterns) {
      const match = String(vitalText || "").match(pattern);
      if (match?.[1]) return match[1].trim();
    }
    return "";
  };

  const systolic =
    record?.systolicBp ||
    record?.systolic_bp ||
    vitalObject.systolicBp ||
    vitalObject.systolic_bp;
  const diastolic =
    record?.diastolicBp ||
    record?.diastolic_bp ||
    vitalObject.diastolicBp ||
    vitalObject.diastolic_bp;
  const bpValue =
    systolic && diastolic
      ? `${systolic}/${diastolic} mmHg`
      : readTextValue([/BP:\s*([^|,]+)/i, /Blood Pressure:\s*([^|,]+)/i]);
  const temperatureValue =
    record?.temperature ||
    record?.temp ||
    vitalObject.temperature ||
    vitalObject.temp ||
    readTextValue([/Temp(?:erature)?:\s*([^|,]+)/i]);

  const weightValue =
    record?.weight ||
    vitalObject.weight ||
    readTextValue([/Weight:\s*([^|,]+)/i]);
  const heightValue =
    record?.height ||
    vitalObject.height ||
    readTextValue([/Height:\s*([^|,]+)/i]);

  const cleanWeight = cleanVitalSignValue(weightValue);
  const cleanHeight = cleanVitalSignValue(heightValue);

  return [
    { label: "BP", value: cleanVitalSignValue(bpValue) },
    {
      label: "Temperature",
      value: cleanVitalSignValue(temperatureValue),
    },
    { label: "Weight", value: cleanWeight },
    { label: "Height", value: cleanHeight },
    { label: "BMI", value: getBmiDisplayValue(record, cleanWeight, cleanHeight) },
  ];
}

/**
 * BMI for display, derived from the weight and height on the record itself.
 *
 * Never stored: recomputing keeps it consistent with the two measurements it
 * came from. The category uses WHO adult cut-offs, so it is left off for
 * patients under 18 - child BMI is read against age-and-sex percentile charts
 * and an adult label there would mislead. Values may still carry their units
 * ("60 kg"), which parseFloat inside calculateBmi handles.
 */
export function getBmiDisplayValue(record = {}, weightValue, heightValue) {
  const bmi = calculateBmi(weightValue, heightValue);
  if (bmi === null) return "";

  const age = Number.parseFloat(
    record?.patient?.age ?? record?.patientAge ?? record?.age ?? "",
  );
  const category =
    Number.isFinite(age) && age < 18 ? "" : getBmiCategory(bmi);

  return category ? `${formatBmi(bmi)} (${category})` : formatBmi(bmi);
}

export function cleanVitalSignValue(value) {
  const text = String(value || "").trim();
  if (!text || /^n\/a\b/i.test(text) || /(^|[/: ])n\/a($|[ /])/i.test(text)) {
    return "";
  }
  return text;
}

export const MATERNAL_RISK_LABELS = {
  ageRisk: "Age less than 18 or greater than 35",
  heightRisk: "Height less than 145 cm",
  grandMultipara: "Grand multipara / fourth baby or more",
  previousCs: "Previous C/S",
  recurrentMiscarriageOrStillbirth: "3 consecutive miscarriage or stillbirth",
  postpartumHemorrhage: "Post-partum hemorrhage",
  tuberculosis: "Tuberculosis",
  heartDisease: "Heart Disease",
  diabetes: "Diabetes",
  bronchialAsthma: "Bronchial Asthma",
  goiter: "Goiter",
  hypertensive: "Hypertensive",
  alcoholUser: "Alcohol user",
  smoker: "Smoker",
};

export function getMaternalValue(maternal = {}, record = {}, keys = [], fallback = "Not recorded") {
  for (const key of keys) {
    const value = maternal?.[key] ?? record?.[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }

  return fallback;
}

export function getPreviousPregnancyHistory(maternal = {}) {
  const rows =
    maternal.previousPregnancyHistory ||
    maternal.previous_pregnancy_history ||
    [];
  return Array.isArray(rows) ? rows.filter(Boolean) : [];
}

export function getSelectedMaternalRiskLabels(maternal = {}) {
  const riskAssessment =
    maternal.riskAssessment ||
    maternal.risk_assessment ||
    maternal.medicalHistory ||
    maternal.medical_history ||
    {};

  return Object.entries(MATERNAL_RISK_LABELS)
    .filter(([key]) => riskAssessment?.[key] === true || riskAssessment?.[key] === "true")
    .map(([, label]) => label);
}

export function getPreviousFpMethodValue(maternal = {}) {
  const method =
    maternal.previousFpMethodUsed ||
    maternal.previous_fp_method_used ||
    "";
  const other =
    maternal.previousFpMethodOther ||
    maternal.previous_fp_method_other ||
    "";

  if (String(method).toLowerCase() === "other" && other) return other;
  return method || "";
}

export function getLaboratoryResultItems(maternal = {}) {
  const labs = maternal.laboratoryResults || maternal.laboratory_results || {};
  return [
    ["Hemoglobin", ["hemoglobin"]],
    ["CBC", ["cbc"]],
    ["Blood Type", ["bloodType", "blood_type"]],
    ["HBsAg", ["hbsag", "HBsAg", "hbsAg"]],
    ["HIV", ["hiv"]],
    ["Syphilis", ["syphilis"]],
    ["Urinalysis", ["urinalysis"]],
  ].map(([label, keys]) => ({
    label,
    value: getRecordValue(labs, keys, ""),
  }));
}

export function getTetanusToxoidDate(maternal = {}, record = {}, dose) {
  const sourceObjects = [
    maternal.tetanusToxoidStatus,
    maternal.tetanus_toxoid_status,
    record.tetanusToxoidStatus,
    record.tetanus_toxoid_status,
    maternal,
    record,
  ].filter((source) => source && typeof source === "object");
  const keys = [
    `tt${dose}`,
    `td${dose}`,
    `tt${dose}Date`,
    `tt${dose}_date`,
    `td${dose}Date`,
    `td${dose}_date`,
    `TT${dose}Date`,
    `TD${dose}Date`,
  ];
  const normalizedKeys = new Set(keys.map(normalizeRecordKey));

  for (const source of sourceObjects) {
    for (const key of keys) {
      const value = source?.[key];
      if (value) return value;
    }

    for (const [key, value] of Object.entries(source)) {
      if (value && normalizedKeys.has(normalizeRecordKey(key))) {
        return value;
      }
    }
  }

  return "";
}

export function getRecordedTetanusToxoidDoses(maternal = {}, record = {}) {
  return [1, 2, 3, 4, 5]
    .map((dose) => ({
      dose: `TT${dose}`,
      date: getTetanusToxoidDate(maternal, record, dose),
    }))
    .filter((entry) => Boolean(entry.date));
}

export function normalizeRecordKey(key) {
  return String(key || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function getUltrasoundValue(maternal = {}, keys = []) {
  const ultrasound = maternal.ultrasound || {};
  return getRecordValue(ultrasound, keys, "") || getRecordValue(maternal, keys, "");
}

export function getVitalField(record = {}, field) {
  const vitalSigns = record.vitalSigns || record.vital_signs || {};
  const vitalObject =
    vitalSigns && typeof vitalSigns === "object" ? vitalSigns : {};

  if (record?.[field]) return record[field];
  if (vitalObject?.[field]) return vitalObject[field];

  const vitalText =
    typeof vitalSigns === "string" ? vitalSigns : getVitalSigns(record, "");
  const patternMap = {
    weight: [/Weight:\s*([^|,]+)/i, /WT:\s*([^|,]+)/i],
    height: [/Height:\s*([^|,]+)/i, /HGT:\s*([^|,]+)/i],
  };

  for (const pattern of patternMap[field] || []) {
    const match = String(vitalText || "").match(pattern);
    if (match?.[1]) return match[1].trim();
  }

  return "";
}

export function getBloodPressureValue(record = {}) {
  const vitalSigns = record.vitalSigns || record.vital_signs || {};
  const vitalObject =
    vitalSigns && typeof vitalSigns === "object" ? vitalSigns : {};
  const systolic =
    record.systolicBp ||
    record.systolic_bp ||
    vitalObject.systolicBp ||
    vitalObject.systolic_bp;
  const diastolic =
    record.diastolicBp ||
    record.diastolic_bp ||
    vitalObject.diastolicBp ||
    vitalObject.diastolic_bp;

  if (systolic && diastolic) return `${systolic}/${diastolic} mmHg`;

  const vitalText =
    typeof vitalSigns === "string" ? vitalSigns : getVitalSigns(record, "");
  const match = String(vitalText || "").match(/(?:BP|Blood Pressure):\s*([^|,]+)/i);
  return match?.[1]?.trim() || "Not recorded";
}

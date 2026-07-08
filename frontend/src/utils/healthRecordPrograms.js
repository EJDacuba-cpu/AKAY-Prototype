export const EPI_VACCINE_ROWS = [
  "Newborn Screening",
  "BCG",
  "HEPA B",
  "OPV 1",
  "OPV 2",
  "OPV 3",
  "PENTA 1",
  "PENTA 2",
  "PENTA 3",
  "PCV 1",
  "PCV 2",
  "PCV 3",
  "IPV 1",
  "IPV 2",
  "MCV 1",
  "MCV 2",
];

const LEGACY_EPI_FIELD_MAP = {
  "Newborn Screening": ["newborn_screening", "newbornScreening"],
  BCG: ["bcg_vaccine", "bcgVaccine", "bcg"],
  "HEPA B": ["hepb_birth", "hepa_b", "hepaB", "hepB"],
  "OPV 1": ["opv_dose1", "opvDose1"],
  "OPV 2": ["opv_dose2", "opvDose2"],
  "OPV 3": ["opv_dose3", "opvDose3"],
  "PENTA 1": ["pentavalent_dose1", "penta_dose1", "pentaDose1"],
  "PENTA 2": ["pentavalent_dose2", "penta_dose2", "pentaDose2"],
  "PENTA 3": ["pentavalent_dose3", "penta_dose3", "pentaDose3"],
  "PCV 1": ["pcv_dose1", "pcvDose1"],
  "PCV 2": ["pcv_dose2", "pcvDose2"],
  "PCV 3": ["pcv_dose3", "pcvDose3"],
  "IPV 1": ["ipv_dose1", "ipvDose1"],
  "IPV 2": ["ipv_dose2", "ipvDose2"],
  "MCV 1": ["mcv_dose1", "mcvDose1"],
  "MCV 2": ["mcv_dose2", "mcvDose2"],
};

export function getRecordId(record = {}) {
  const id =
    record.id ||
    record.health_record_id ||
    record.healthRecordId ||
    record.record_id ||
    record.recordId ||
    record._id;

  return id ? String(id) : "";
}

export function getRecordIdLabel(record = {}, fallback = "Not recorded") {
  const id = getRecordId(record).replace(/^#+/, "");
  return id ? `#${id}` : fallback;
}

export function getRecordValue(record = {}, keys = [], fallback = "") {
  for (const key of keys) {
    const value = record?.[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }

  return fallback;
}

export function getRecordDateValue(record = {}) {
  return getRecordValue(
    record,
    [
      "dateOfVisit",
      "date_of_visit",
      "dateRecorded",
      "date_recorded",
      "visitDate",
      "visit_date",
      "date",
      "createdAt",
      "created_at",
    ],
    "",
  );
}

export function getRecordTimeValue(record = {}) {
  const direct = getRecordValue(
    record,
    ["timeOfVisit", "time_of_visit", "time", "visitTime", "visit_time"],
    "",
  );
  if (direct) return direct;

  const recorded = getRecordValue(record, ["dateRecorded", "date_recorded"], "");
  const match = String(recorded).match(/\d{1,2}:\d{2}/);
  return match?.[0] || "";
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

export function getRecordClassificationText(record = {}) {
  return getRecordValue(
    record,
    [
      "recordType",
      "record_type",
      "category",
      "classification",
      "healthRecordType",
      "health_record_type",
      "patientClassification",
    ],
    "",
  );
}

export function getServiceTypeLabel(record = {}, fallback = "Not recorded") {
  const raw = String(getRecordClassificationText(record) || "").trim();
  if (!raw) return fallback;

  const value = [
    record.recordType,
    record.record_type,
    record.category,
    record.classification,
    record.healthRecordType,
    record.health_record_type,
    record.patientClassification,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");

  if (
    ["immunization", "epi", "child health", "vaccination", "vaccine"].some(
      (term) => value.includes(term),
    )
  ) {
    return "Child Health / EPI";
  }
  if (
    ["maternal", "prenatal", "pregnancy", "antenatal"].some((term) =>
      value.includes(term),
    )
  ) {
    return "Maternal / Prenatal";
  }
  if (value.includes("family planning") || /(^|\s)fp(\s|$)/.test(value)) {
    return "Family Planning";
  }
  if (
    value === "ncd" ||
    value.includes("ncd monitoring") ||
    value.includes("hypertension") ||
    value.includes("diabetes") ||
    value.includes("non communicable") ||
    value.includes("senior citizen")
  ) {
    return "NCD Monitoring";
  }
  if (
    value === "tb" ||
    value.includes("tuberculosis") ||
    value.includes("tb dots") ||
    value.includes("tb monitoring") ||
    value === "dots"
  ) {
    return "TB DOTS / TB Monitoring";
  }
  if (value.includes("general") || value.includes("consultation")) {
    return "General Consultation";
  }

  return raw;
}

export function getRecordSearchText(record = {}) {
  const maternalData = record.maternalData || record.maternal_data || {};
  const familyPlanningData =
    record.familyPlanningData || record.family_planning_data || {};

  return [
    getRecordClassificationText(record),
    record.chiefComplaint,
    record.chief_complaint,
    record.diagnosis,
    record.notes,
    record.medicalHistory,
    record.medical_history,
    maternalData.recordType,
    familyPlanningData.clientType,
    familyPlanningData.methodUsed,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function hasAnyTerm(record, terms) {
  const text = getRecordSearchText(record);
  return terms.some((term) => text.includes(term));
}

export function isEpiRecord(record = {}) {
  return hasAnyTerm(record, [
    "immunization",
    "epi",
    "child health",
    "vaccination",
    "vaccine",
  ]);
}

export function isMaternalRecord(record = {}) {
  return hasAnyTerm(record, [
    "maternal",
    "prenatal",
    "pregnancy",
    "antenatal",
  ]);
}

export function isFamilyPlanningRecord(record = {}) {
  return hasAnyTerm(record, ["family planning", "fp"]);
}

export function isNcdRecord(record = {}) {
  return hasAnyTerm(record, [
    "ncd",
    "hypertension",
    "diabetes",
    "non communicable",
  ]);
}

export function isTbRecord(record = {}) {
  return hasAnyTerm(record, ["tb", "tuberculosis", "dots"]);
}

export function getSpecializedRecordType(record = {}) {
  if (isEpiRecord(record)) return "epi";
  if (isMaternalRecord(record)) return "maternal";
  if (isFamilyPlanningRecord(record)) return "familyPlanning";
  if (isNcdRecord(record)) return "ncd";
  if (isTbRecord(record)) return "tb";
  return "";
}

export function hasSpecializedRecords(records = []) {
  return records.some((record) => Boolean(getSpecializedRecordType(record)));
}

export function getImmunizationData(record = {}) {
  return record.immunizationData || record.immunization_data || {};
}

export function normalizeVaccineName(value = "") {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/HEP\s*B|HEPB|HEPATITIS\s*B/g, "HEPA B")
    .replace(/PENTAVALENT/g, "PENTA")
    .replace(/MMR/g, "MCV")
    .replace(/\bDOSE\s*/g, "")
    .replace(/\s+/g, " ");
}

export function getEpiVaccineEntries(record = {}) {
  const data = getImmunizationData(record);
  const structuredEntries = Array.isArray(data.vaccineEntries)
    ? data.vaccineEntries
    : Array.isArray(data.vaccinesGiven)
      ? data.vaccinesGiven
      : Array.isArray(record.vaccineEntries)
        ? record.vaccineEntries
        : Array.isArray(record.vaccinesGiven)
          ? record.vaccinesGiven
          : [];

  const entries = structuredEntries
    .filter((entry) => entry && typeof entry === "object")
    .map((entry) => ({
      vaccineName:
        entry.vaccineName ||
        entry.vaccine_name ||
        entry.name ||
        entry.vaccine ||
        "",
      dateGiven: entry.dateGiven || entry.date_given || entry.date || "",
      weight: entry.weight || "",
      height: entry.height || "",
      temperature: entry.temperature || entry.temp || "",
    }))
    .filter((entry) => String(entry.vaccineName || "").trim());

  EPI_VACCINE_ROWS.forEach((vaccineName) => {
    const legacyFields = LEGACY_EPI_FIELD_MAP[vaccineName] || [];
    const hasLegacyValue = legacyFields.some((field) => data[field] === true);
    if (!hasLegacyValue) return;

    const alreadyIncluded = entries.some(
      (entry) => normalizeVaccineName(entry.vaccineName) === vaccineName,
    );
    if (!alreadyIncluded) {
      entries.push({
        vaccineName,
        dateGiven: getRecordDateValue(record),
        weight: record.weight || "",
        height: record.height || "",
        temperature: record.temperature || record.temp || "",
      });
    }
  });

  return entries;
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

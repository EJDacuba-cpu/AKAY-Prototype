import { recordedVitalItems, historicalFollowUpSchedules } from "./recordDetailsPresentation";
import { BodyFindingHistoryView, thisRecordBodyFindingHistory } from "./BodyFindingReassessment";
import {
  PROGRAM_CLASSIFICATIONS,
  getConsultationPrograms,
} from "../../../utils/consultationPrograms";
import {
  VISIT_SERVICES,
  TEENAGE_PREGNANCY_MESSAGE,
} from "../../../utils/visitPurpose";
import { isBhcGeneralV2 } from "../../../utils/consultationWorkflow";
import { joinDiagnosisNames } from "../../../utils/diagnoses";
import { diagnosisCarePlanItems } from "../../../utils/recordCarePlan";
import { savedPrescriptionRows } from "../../../utils/prescriptionPrint";
import { formatPrescriptionLine } from "../../../utils/rhuPrescriptions";
import { visitHistoryInformantLine } from "../../../utils/visitHistorySnapshot";
import { isTbRecord } from "../../../utils/tbRecords";
import { carePlanServiceLabel, selectedCarePlanServices } from "../../../utils/serviceNextActions";
import { diagnosisNextAction, RHU_NEXT_ACTIONS } from "../../../utils/rhuCarePlan";
import {
  formatFacilityName,
  formatLongDate,
} from "../../../utils/formatters";
import { getCurrentUser } from "../../../utils/auth";
import { laboratorySummary } from "../../../utils/laboratoryTests";
import { TB_OUTCOME_LABELS } from "../../../utils/careTrackingConfig";
import {
  isImmunizationClassification,
  getEpiVaccineEntries,
  getEpiBreastfeedingMonitoring,
  getConfirmedBreastfeedingMonths,
  getEpiRemarks,
  formatMeasurement,
  getFamilyPlanningDetails,
  normalizeHealthRecordStatus,
  getRecordValue,
  getMaternalData,
  getDispensedMedicines,
  getRecordDateValue,
  getRecordDiagnosis,
  getRecordPhysicalExam,
  getRecordChiefComplaint,
  getRecordSummary,
  getRecordNotes,
  getRecordTreatmentNotes,
  isDistinctRecordedValue,
  getMaternalValue,
  getPreviousPregnancyHistory,
  getSelectedMaternalRiskLabels,
  getPreviousFpMethodValue,
  getLaboratoryResultItems,
  getRecordedTetanusToxoidDoses,
  getUltrasoundValue,
  getRecordVisitTypeValue,
} from "./recordDetailsHelpers";
import {
  TB_REFERRED_BY_OPTIONS,
  TB_SCREENING_CATEGORY_OPTIONS,
  TB_DIAGNOSIS_TYPE_OPTIONS,
  TB_BACTERIOLOGICAL_OPTIONS,
  TB_ANATOMICAL_SITE_OPTIONS,
  TB_DRUG_RESISTANCE_OPTIONS,
  TB_REGISTRATION_GROUP_OPTIONS,
  TB_LOCATION_OF_TREATMENT_OPTIONS,
  TB_HIV_STATUS_OPTIONS,
  TB_ART_STATUS_OPTIONS,
  TB_CPT_STATUS_OPTIONS,
  normalizeTbData,
} from "./TbTreatmentCardForm";

export const BHC_HEALTH_RECORD_PRINT_PAGE_STYLES = `
  @page {
    size: A4;
    margin: 10mm;
  }
  @media print {
    html, body, #root {
      background: #fff !important;
      height: auto !important;
      overflow: visible !important;
    }
    .relative.flex.h-dvh,
    main,
    main > div,
    .akay-content-scroll {
      display: block !important;
      height: auto !important;
      max-height: none !important;
      overflow: visible !important;
      margin: 0 !important;
      padding: 0 !important;
      border: 0 !important;
      border-radius: 0 !important;
      box-shadow: none !important;
      background: #fff !important;
    }
    main > div > :not(.akay-content-scroll) {
      display: none !important;
    }
    .no-print {
      display: none !important;
    }
  }
`;

const TB_LAB_TESTS = [
  { key: "xpert", label: "Xpert MTB/RIF (± Ultra)" },
  { key: "smearOrLamp", label: "Smear Microscopy / TB LAMP" },
  { key: "chestXray", label: "Chest X-ray" },
  { key: "tst", label: "Tuberculin Skin Test" },
];

function blankText(value) {
  const text = String(value ?? "").trim();
  if (
    !text ||
    text.toLowerCase() === "not recorded" ||
    text.toLowerCase() === "facility not recorded" ||
    text.toLowerCase() === "none" ||
    text === "—"
  ) {
    return "";
  }
  return text;
}

function recorded(value, empty = "None") {
  const text = blankText(value);
  return text || empty;
}

/** Action Taken from saved notes — never invents text from diagnosis names. */
function printActionTaken(record) {
  const direct = getRecordValue(
    record,
    [
      "initialActionsTaken",
      "initialActionTaken",
      "initial_actions_taken",
      "initial_action_taken",
    ],
    "",
  );
  if (blankText(direct)) return blankText(direct);
  return blankText(getRecordTreatmentNotes(record, ""));
}

function monitoringBag(record = {}) {
  return record.monitoringData || record.monitoring_data || {};
}

function printServiceUsages(record = {}) {
  const md = monitoringBag(record);
  const rows = md.serviceUsages || md.service_usages || record.serviceUsages || [];
  return Array.isArray(rows) ? rows.filter((row) => row && String(row.itemDescription || row.item_description || "").trim()) : [];
}

function printServiceHandoffs(record = {}) {
  const md = monitoringBag(record);
  const care = md.carePlan || md.care_plan || {};
  const rows = care.service_handoffs || care.serviceHandoffs || md.serviceHandoffs || md.service_handoffs || [];
  return Array.isArray(rows) ? rows.filter((row) => row && row.program) : [];
}

function printNutritionEnrollment(record = {}) {
  const md = monitoringBag(record);
  const intent = String(md.nutritionIntent || md.nutrition_intent || "").trim().toLowerCase();
  if (intent === "enroll") return "Enroll";
  if (intent === "continue") return "Continue";
  return "";
}

function optionLabel(options, value) {
  const match = (options || []).find((item) => item.value === value);
  return match?.label || value || "";
}

function fpDetail(details = [], label) {
  return details.find((item) => item.label === label)?.value || "";
}

function filledItems(items = []) {
  return items.filter((item) => String(item.value ?? "").trim());
}

function currentUser() {
  try {
    return getCurrentUser();
  } catch {
    return null;
  }
}

function facilityLabel(record, patient) {
  const user = currentUser();
  const savedName = [record?.ruralHealthUnit, record?.rural_health_unit,
    record?.barangayHealthCenter, record?.barangay_health_center, record?.facility]
    .map((facility) => formatFacilityName(facility, "")).find(Boolean);
  if (savedName) return savedName;
  const rhuId = record?.ruralHealthUnitId || record?.rural_health_unit_id;
  const bhcId = record?.barangayHealthCenterId || record?.barangay_health_center_id;
  // Only use another entity's facility name when its ID matches the record's
  // saved facility. A patient's transfer must not relabel an earlier visit.
  const sameFacility = (entity) => Boolean(entity && (
    (rhuId && String(rhuId) === String(entity.ruralHealthUnitId || entity.rural_health_unit_id)) ||
    (bhcId && String(bhcId) === String(entity.barangayHealthCenterId || entity.barangay_health_center_id))
  ));
  const matched = [user, patient].filter(sameFacility).map((entity) =>
    formatFacilityName(entity.ruralHealthUnit || entity.rural_health_unit ||
      entity.barangayHealthCenter || entity.barangay_health_center || entity.facility, "")).find(Boolean);
  return matched || "Facility not recorded";
}

function InlineGrid({ items = [], columns = 3 }) {
  if (!items.length) return null;
  return (
    <div
      className={
        columns === 2 ? "bhc-print-grid bhc-print-grid-2" : "bhc-print-grid bhc-print-grid-3"
      }
    >
      {items.map((item, index) => (
        <p key={`${item.label}-${index}`} className="bhc-print-inline">
          <span className="bhc-print-k">{item.label}:</span>{" "}
          <span className="bhc-print-v">{recorded(item.value)}</span>
        </p>
      ))}
    </div>
  );
}

function Narrative({ label, value }) {
  return (
    <div className="bhc-print-narrative">
      <p className="bhc-print-k">{label}</p>
      <p className="bhc-print-prose">{recorded(value)}</p>
    </div>
  );
}

function PrintTable({ columns, rows }) {
  if (!rows.length) return null;
  return (
    <table className="bhc-print-table">
      <thead>
        <tr>
          {columns.map((column) => (
            <th key={column}>{column}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key}>
            {row.cells.map((cell, index) => (
              <td key={`${row.key}-${index}`}>{cell || "None"}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Section({ title, children, avoidBreak = false }) {
  return (
    <section className={avoidBreak ? "bhc-print-section bhc-print-keep" : "bhc-print-section"}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function isGeneralConsultationService(serviceType, record) {
  const label = String(
    serviceType || record?.patientClassification || record?.category || "",
  ).trim();
  return label === "General Consultation";
}

/** Strip unit suffixes when the vitals table header already names the unit. */
function vitalDisplayValue(value) {
  return blankText(value)
    .replace(/\s*mmHg\s*$/i, "")
    .replace(/\s*bpm\s*$/i, "")
    .replace(/\s*°\s*C\s*$/i, "")
    .replace(/\s*%\s*$/i, "")
    .replace(/\s*cm\s*$/i, "")
    .replace(/\s*kg\s*$/i, "")
    .trim();
}

function vitalCellMap(record, patient) {
  // Same sources as record details: getVitalSignItems + Pulse/SpO₂ via recordedVitalItems.
  const byLabel = Object.fromEntries(
    recordedVitalItems(record, patient).map((item) => [item.label, item.value]),
  );
  return {
    BP: vitalDisplayValue(byLabel.BP),
    Pulse: vitalDisplayValue(byLabel.Pulse),
    Temperature: vitalDisplayValue(byLabel.Temperature),
    SpO2: vitalDisplayValue(byLabel["SpO₂"]),
    Height: vitalDisplayValue(byLabel.Height),
    Weight: vitalDisplayValue(byLabel.Weight),
    BMI: blankText(byLabel.BMI),
    FBS: blankText(byLabel.FBS),
  };
}

/** Label + value in a fixed label column. Applicable empty fields print "None". */
function GcField({ label, value, showWhenEmpty = false, emptyText = "None" }) {
  const text = blankText(value);
  if (!text && !showWhenEmpty) return null;
  return (
    <div className="gc-print-field-row">
      <p className="gc-print-field-label">{label}</p>
      <p className="gc-print-prose">{text || emptyText}</p>
    </div>
  );
}

/** RHU only: prescribed medicines + instructions from finalized prescriptions. */
function rhuPrescriptionLines(record) {
  const prescriptions = savedPrescriptionRows(record);
  if (!prescriptions.length) return { prescribed: "", instructions: "" };
  return {
    prescribed: prescriptions
      .map((row) => formatPrescriptionLine({ ...row, instructions: "" }))
      .filter(Boolean)
      .join("\n"),
    instructions: prescriptions
      .filter((row) => blankText(row.instructions))
      .map((row) => {
        const medicine = [row.medicineName, row.strength].map(blankText).filter(Boolean).join(" ");
        return [medicine, blankText(row.instructions)].filter(Boolean).join(": ");
      })
      .join("\n"),
  };
}

/** BHC only: actual dispensed medicine names, quantities, and remarks. */
function bhcDispensedMedicineLines(record) {
  const medicines = getDispensedMedicines(record);
  if (!medicines.length) return "";
  return medicines
    .map((medicine) => {
      const name =
        medicine.medicineName ||
        medicine.medicine_name_snapshot ||
        medicine.medicine_name ||
        "";
      const qty = [medicine.quantity, medicine.unit].filter(Boolean).join(" ");
      const remarks = blankText(medicine.remarks);
      return [blankText(name), blankText(qty), remarks].filter(Boolean).join(" · ");
    })
    .filter(Boolean)
    .join("\n");
}

function ConsultationPrintDocument({
  record,
  patient,
  title,
  recordId,
  patientName,
  displayDate,
  displayTime,
  practitioner,
  sourceRole,
  documentRole,
  facility,
  printState = "ready",
  parentRecordId,
  nutritionSelected,
  bodyFindings,
  children,
}) {
  const isRhuPrint = documentRole === "rhu";
  const rhuMeds = isRhuPrint ? rhuPrescriptionLines(record) : null;
  const bhcDispensed = isRhuPrint ? "" : bhcDispensedMedicineLines(record);
  const hasAge = patient?.age !== undefined && patient?.age !== null && String(patient.age).trim() !== "";
  const patientCode =
    patient?.patientId ||
    patient?.patient_id ||
    patient?.patientCode ||
    patient?.patient_code ||
    "";
  // Reference sample: "20 / Male" (no "yrs").
  const ageSex = [hasAge ? String(patient.age) : "", patient?.sex]
    .filter(Boolean)
    .join(" / ");
  const visitWhen = [blankText(displayDate), blankText(displayTime)]
    .filter(Boolean)
    .join(" · ");
  const vitals = vitalCellMap(record, patient);
  const facilityName = blankText(facility);
  const isFollowUpVisit = getRecordVisitTypeValue(record) === "follow_up_visit";
  // Same helpers as health record details / RHU consultation HPI field.
  const chiefComplaint = getRecordChiefComplaint(record, "");
  const historyOfPresentIllness = getRecordSummary(record, "");
  // RHU rarely has assessment_notes; print physical findings here instead
  // (same field as consultation "Physical Findings" / getRecordPhysicalExam).
  const generalExamFindings = blankText(getRecordPhysicalExam(record, ""));
  const structuredDiagnosis = isBhcGeneralV2(record) ? "" : joinDiagnosisNames(record.diagnoses);
  const diagnosisText = structuredDiagnosis || blankText(getRecordDiagnosis(record, ""));
  const actionTaken = printActionTaken(record);
  const hpiFieldLabel = isFollowUpVisit
    ? "Changes since last visit"
    : "Present illness";
  const hasChiefComplaintSection = Boolean(
    blankText(chiefComplaint) || blankText(visitHistoryInformantLine(record)),
  );
  const hasHpiSection = Boolean(blankText(historyOfPresentIllness));
  const recordedByName = blankText(practitioner);

  return (
    <article
      id="health-record-print"
      data-print-key={recordId}
      data-print-state={printState}
      data-print-layout="general-consultation"
      data-print-meds={isRhuPrint ? "prescribed" : "dispensed"}
      className={children ? "gc-record-print gc-record-print-with-sections" : "gc-record-print"}
    >
      <style>{generalConsultationPrintStyles + (children ? programSectionPrintStyles : "")}</style>

      <div className="gc-print-body">
        <header className="gc-print-header">
          <p className="gc-print-brand">AKAY</p>
          <div className="gc-print-docmeta">
            <p className="gc-print-doctype">
              {title || "General Consultation Record"}
            </p>
            {facilityName ? <p>{facilityName}</p> : children ? <p>Facility not recorded</p> : <p>&nbsp;</p>}
            <p>Record #{recordId}</p>
            {parentRecordId && <p>Follow-up of record #{parentRecordId}</p>}
            {nutritionSelected && <p>Nutrition Care</p>}
          </div>
        </header>

        <div className="gc-print-patient-row">
          <div className="gc-print-patient-field">
            <span className="gc-print-k">Patient:</span>{" "}
            <span className="gc-print-v">{blankText(patientName)}</span>
          </div>
          <div className="gc-print-patient-field">
            <span className="gc-print-k">Patient ID:</span>{" "}
            <span className="gc-print-v">{blankText(patientCode)}</span>
          </div>
          <div className="gc-print-patient-field">
            <span className="gc-print-k">Age / Sex:</span>{" "}
            <span className="gc-print-v">{ageSex}</span>
          </div>
          <div className="gc-print-patient-field">
            <span className="gc-print-k">Date / Time:</span>{" "}
            <span className="gc-print-v">{visitWhen}</span>
          </div>
        </div>

        {hasChiefComplaintSection ? (
          <section className="gc-print-section">
            <h2>Chief Complaint</h2>
            <GcField label="Complaint" value={chiefComplaint} />
            <GcField label="Informant" value={visitHistoryInformantLine(record)} />
          </section>
        ) : null}

        {hasHpiSection ? (
          <section className="gc-print-section">
            <h2>History of Present Illness</h2>
            <GcField label={hpiFieldLabel} value={historyOfPresentIllness} />
          </section>
        ) : null}

        <section className="gc-print-section">
          <h2>Vital Signs</h2>
          <table className="gc-print-vitals">
            <thead>
              <tr>
                <th>BP (mmHg)</th>
                <th>Pulse (bpm)</th>
                <th>Temp (°C)</th>
                <th>SpO₂ (%)</th>
                <th>Height (cm)</th>
                <th>Weight (kg)</th>
                <th>BMI</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{vitals.BP}</td>
                <td>{vitals.Pulse}</td>
                <td>{vitals.Temperature}</td>
                <td>{vitals.SpO2}</td>
                <td>{vitals.Height}</td>
                <td>{vitals.Weight}</td>
                <td>{vitals.BMI}</td>
              </tr>
            </tbody>
          </table>
          {children && vitals.FBS && <GcField label="FBS" value={vitals.FBS} />}
        </section>

        <section className="gc-print-section">
          <h2>Assessment</h2>
          <GcField
            label="General exam findings"
            value={generalExamFindings}
            showWhenEmpty
          />
          <GcField
            label="Diagnosis"
            value={diagnosisText}
            showWhenEmpty
          />
          {bodyFindings && <BodyFindingHistoryView {...bodyFindings} print />}
        </section>

        {isRhuPrint ? (
          <section className="gc-print-section">
            <h2>Medications</h2>
            <GcField label="Prescribed" value={rhuMeds.prescribed} showWhenEmpty />
            <GcField label="Instructions" value={rhuMeds.instructions} showWhenEmpty />
          </section>
        ) : (
          <section className="gc-print-section">
            <h2>Medicines Dispensed</h2>
            <GcField label="Dispensed" value={bhcDispensed} showWhenEmpty />
          </section>
        )}

        <section className="gc-print-section">
          <h2>Action Taken</h2>
          <GcField label="Actions and interventions" value={actionTaken} showWhenEmpty />
        </section>
        {children}
      </div>

      <footer className="gc-print-signatures">
        <div className="gc-print-sig">
          <div className="gc-print-sig-line">
            {recordedByName ? (
              <p className="gc-print-sig-line-name">{recordedByName}</p>
            ) : null}
          </div>
          <p className="gc-print-sig-caption">Recorded by</p>
        </div>
        {isRhuPrint && (
          <div className="gc-print-sig">
            <div className="gc-print-sig-line" />
            <p className="gc-print-sig-caption">Physician Signature</p>
          </div>
        )}
      </footer>
    </article>
  );
}

export default function BhcHealthRecordPrintDocument({
  record,
  patient,
  linkedReferral = null,
  title,
  recordId,
  patientName,
  serviceType,
  displayDate,
  displayTime,
  practitioner,
  parentRecordId = "",
  documentRole = "bhc",
  printState = "ready",
  laboratoryEntries = [],
}) {
  if (!record) return null;

  const sourceRole = record.ruralHealthUnitId || record.rural_health_unit_id
    ? "rhu" : record.barangayHealthCenterId || record.barangay_health_center_id ? "bhc" : documentRole;
  const purpose =
    record?.monitoringData?.visitPurpose ||
    record?.monitoring_data?.visitPurpose;
  const programs = getConsultationPrograms(record);
  const categories = [
    ...new Set(programs.map((key) => PROGRAM_CLASSIFICATIONS[key])),
  ];
  const postpartumOnly =
    Boolean(purpose?.services?.includes("Postpartum")) &&
    !purpose?.services?.includes("Prenatal");
  const tbRecord = isTbRecord(record);
  const immunization = isImmunizationClassification(record, patient);
  const maternal =
    serviceType === "Maternal / Prenatal" ||
    categories.includes("Maternal") ||
    programs.includes("Maternal");
  const familyPlanning =
    serviceType === "Family Planning" ||
    categories.includes("Family Planning") ||
    programs.includes("Family Planning");
  const facility = facilityLabel(record, patient);

  const printProps = {
    record, patient, title: title || (serviceType ? serviceType + " Record" : undefined),
    recordId, patientName, displayDate, displayTime, practitioner,
    sourceRole, documentRole, facility, printState,
  };

  const monitoringNotes = getRecordValue(
    record,
    ["monitoringNotes", "monitoring_notes"],
    "",
  );
  const bodyFindings = thisRecordBodyFindingHistory(record);
  const fpDetails = getFamilyPlanningDetails(record);
  const maternalData = getMaternalData(record);
  const followUpSchedules = historicalFollowUpSchedules(record);
  const serviceUsages = printServiceUsages(record);
  const serviceHandoffs = printServiceHandoffs(record);
  const carePlanServices = selectedCarePlanServices(programs);
  const bhcCarePlanItems = diagnosisCarePlanItems(record.diagnoses);
  const rhuDiagnosisPlans = (Array.isArray(record.diagnoses) ? record.diagnoses : [])
    .filter((entry) => entry && String(entry.name || "").trim())
    .map((entry, index) => {
      const action = diagnosisNextAction(entry);
      return {
        key: String(entry.id || `dx-${index}`),
        name: String(entry.name).trim(),
        plan: RHU_NEXT_ACTIONS[action] || "",
      };
    })
    .filter((item) => item.plan);
  const hasCarePlanOrServices = Boolean(
    bhcCarePlanItems.length
      || rhuDiagnosisPlans.length
      || carePlanServices.length
      || serviceUsages.length
      || serviceHandoffs.length
      || blankText(monitoringNotes),
  );
  const fpNextAppointment = familyPlanning
    ? blankText(fpDetail(fpDetails, "Next Appointment Date"))
    : "";
  const hasFollowUp = followUpSchedules.length > 0 || Boolean(fpNextAppointment);
  const hasProgramSections = programs.length > 0 || tbRecord || immunization ||
    maternal || postpartumOnly || familyPlanning || !isGeneralConsultationService(serviceType, record);
  const includeAdditionalSections = hasProgramSections
    || hasCarePlanOrServices
    || hasFollowUp
    || laboratoryEntries.length > 0
    || Boolean(bodyFindings.originals.length || bodyFindings.events.length);

  if (!includeAdditionalSections) return <ConsultationPrintDocument {...printProps} />;

  const sharedActionTaken = printActionTaken(record);
  const fpActionTaken = fpDetail(fpDetails, "Action Taken");
  const showFpActionTaken = Boolean(
    blankText(fpActionTaken) && isDistinctRecordedValue(fpActionTaken, sharedActionTaken),
  );

  return (
    <ConsultationPrintDocument
      {...printProps}
      parentRecordId={parentRecordId}
      nutritionSelected={programs.includes("Nutrition")}
      bodyFindings={bodyFindings.originals.length || bodyFindings.events.length ? bodyFindings : null}
    >
      {purpose && (
        <Section title="Purpose of visit">
          <p className="bhc-print-prose">
            {(purpose.services || [])
              .map((key) => VISIT_SERVICES[key] || key)
              .join(" + ") || "None"}
          </p>
          {purpose.overrideReason && (
            <p className="bhc-print-prose">
              BHC age eligibility override: {purpose.overrideReason}
            </p>
          )}
          {purpose.pregnancyConfirmed && (
            <p className="bhc-print-prose">
              Pregnancy confirmed by BHW? {purpose.pregnancyConfirmed}
            </p>
          )}
          {purpose.pregnancyConfirmed === "Yes" && (
            <p className="bhc-print-prose">{TEENAGE_PREGNANCY_MESSAGE}</p>
          )}
        </Section>
      )}

      {immunization && <EpiPrintSection record={record} />}
      {(maternal || postpartumOnly) && (
        <MaternalPrintSection
          record={record}
          maternal={maternalData}
          postpartumOnly={postpartumOnly}
        />
      )}
      {familyPlanning && (
        <FamilyPlanningPrintSection
          details={fpDetails}
          showActionTaken={showFpActionTaken}
        />
      )}
      {programs.includes("Nutrition") && (
        <NutritionPrintSection enrollment={printNutritionEnrollment(record)} />
      )}
      {tbRecord && <TbPrintSection record={record} />}

      {laboratoryEntries.length > 0 && <Section title="Laboratory & diagnostic tests">
        {laboratoryEntries.map((entry) => <div key={entry.recordId || entry.id} className="bhc-print-narrative">
          <p className="bhc-print-k">{recorded(entry.testName)} · {recorded(entry.resultStatus)}</p>
          <InlineGrid columns={2} items={[
            { label: "Collection date", value: entry.collectionDate },
            { label: "Examination date", value: entry.examinationDate },
            { label: "Result source", value: entry.resultSource },
          ]} />
          <Narrative label="Result" value={entry.result} />
          <Narrative label="Remarks" value={entry.remarks} />
          {entry.addenda?.length > 0 && <>
            <Narrative label="Original laboratory entry" value={entry.original ? laboratorySummary(entry.original) : ""} />
            {entry.addenda.map((addendum) => <div key={addendum.id} className="bhc-print-narrative">
              <InlineGrid columns={2} items={[
                { label: "Addendum recorded", value: addendum.createdAt },
                { label: "Recorded by", value: addendum.createdBy ? `Staff #${addendum.createdBy}` : "" },
              ]} />
              <Narrative label="Reason" value={addendum.reason} />
              <Narrative label="Addendum laboratory entry" value={addendum.data ? laboratorySummary(addendum.data) : ""} />
            </div>)}
          </>}
        </div>)}
      </Section>}

      {hasCarePlanOrServices && (
        <Section title="Care plan & services">
          {bhcCarePlanItems.map((item) => (
            <Narrative
              key={item.key}
              label={item.name}
              value={[item.plan, item.inSurveillance ? "Included in surveillance" : ""].filter(Boolean).join(" · ")}
            />
          ))}
          {rhuDiagnosisPlans.map((item) => (
            <Narrative key={item.key} label={item.name} value={item.plan} />
          ))}
          {carePlanServices.length > 0 && (
            <Narrative
              label="Selected services"
              value={carePlanServices.map((program) => carePlanServiceLabel(program)).join(", ")}
            />
          )}
          {serviceHandoffs.map((handoff, index) => (
            <Narrative
              key={`handoff-${handoff.program || index}`}
              label={`${carePlanServiceLabel(handoff.program)} · Manage to BHC`}
              value={handoff.monitoringRecommendation || handoff.monitoring_recommendation || "None"}
            />
          ))}
          {serviceUsages.length > 0 ? (
            <PrintTable
              columns={["Service", "Item", "Quantity", "Date used", "Note"]}
              rows={serviceUsages.map((usage, index) => ({
                key: usage.id || `usage-${index}`,
                cells: [
                  carePlanServiceLabel(usage.serviceProgram || usage.service_program || ""),
                  usage.itemDescription || usage.item_description || "None",
                  [usage.quantity, usage.unit].filter((part) => part !== null && part !== undefined && String(part).trim() !== "").join(" ") || "None",
                  formatLongDate(usage.usedAt || usage.used_at, "None"),
                  usage.note || "None",
                ],
              }))}
            />
          ) : null}
          {blankText(monitoringNotes) ? (
            <Narrative label="Monitoring notes" value={monitoringNotes} />
          ) : null}
        </Section>
      )}

      {hasFollowUp && (
        <Section title="Follow-up">
          {followUpSchedules.length > 0 ? (
            <PrintTable
              columns={["Purpose", "Date", "Time"]}
              rows={followUpSchedules.map((row) => ({
                key: row.id,
                cells: [
                  row.reason || "Follow-up",
                  formatLongDate(row.date, "None"),
                  row.time || "None",
                ],
              }))}
            />
          ) : null}
          {fpNextAppointment ? (
            <Narrative label="Next appointment" value={fpNextAppointment} />
          ) : null}
        </Section>
      )}

    </ConsultationPrintDocument>
  );
}

function NutritionPrintSection({ enrollment }) {
  return (
    <Section title="Nutrition Care">
      <InlineGrid
        items={[
          { label: "Enrollment on this visit", value: enrollment || "None" },
        ]}
      />
    </Section>
  );
}

function EpiPrintSection({ record }) {
  const vaccineEntries = getEpiVaccineEntries(record);
  const breastfeeding = getConfirmedBreastfeedingMonths(
    getEpiBreastfeedingMonitoring(record),
  );
  const remarks = getEpiRemarks(record);

  return (
    <Section title="Child Health / EPI">
      <p className="bhc-print-k">Immunization</p>
      {vaccineEntries.length > 0 ? (
        <PrintTable
          columns={[
            "Vaccine",
            "Date given",
            "Weight",
            "Height",
            "Temperature",
            "Remarks",
          ]}
          rows={vaccineEntries.map((entry, index) => ({
            key: `${entry.vaccineName}-${entry.dateGiven || index}`,
            cells: [
              entry.vaccineName,
              formatLongDate(
                entry.dateGiven || getRecordDateValue(record),
                "None",
              ),
              formatMeasurement(entry.weight || record.weight, "kg"),
              formatMeasurement(entry.height || record.height, "cm"),
              formatMeasurement(
                entry.temperature || record.temperature || record.temp,
                "°C",
              ),
              entry.remarks,
            ],
          }))}
        />
      ) : (
        <p className="bhc-print-prose">None</p>
      )}
      <p className="bhc-print-k">Breastfeeding monitoring</p>
      <p className="bhc-print-prose">
        {breastfeeding.length > 0
          ? breastfeeding.join(", ")
          : "None"}
      </p>
      {remarks ? <Narrative label="Remarks" value={remarks} /> : null}
    </Section>
  );
}

function MaternalPrintSection({ record, maternal, postpartumOnly }) {
  const EMPTY = "None";
  const term = getMaternalValue(maternal, record, ["term"], "");
  const preterm = getMaternalValue(maternal, record, ["preterm"], "");
  const abortion = getMaternalValue(maternal, record, ["abortion"], "");
  const living = getMaternalValue(maternal, record, ["living"], "");
  const tpal =
    getMaternalValue(maternal, record, ["tpal", "obScore", "ob_score"], "") ||
    ([term, preterm, abortion, living].some((value) => value !== "")
      ? [term || 0, preterm || 0, abortion || 0, living || 0].join("-")
      : "");
  const history = getPreviousPregnancyHistory(maternal);
  const riskLabels = getSelectedMaternalRiskLabels(maternal);
  const tetanus = getRecordedTetanusToxoidDoses(maternal, record);
  const previousFp = getPreviousFpMethodValue(maternal);
  const labs = getLaboratoryResultItems(maternal);
  const ultrasoundResult = getUltrasoundValue(maternal, [
    "result",
    "ultrasoundResult",
    "ultrasound_result",
  ]);
  const ultrasoundDate = getUltrasoundValue(maternal, [
    "dateDone",
    "date_done",
    "date",
  ]);
  const ultrasoundRemarks = getUltrasoundValue(maternal, ["remarks", "notes"]);
  const notesFindings = [getRecordNotes(record, "")]
    .filter((value) =>
      isDistinctRecordedValue(
        value,
        getRecordSummary(record, ""),
        getRecordChiefComplaint(record, ""),
      ),
    )
    .join("\n\n");

  const coreItems = [
    {
      label: "LMP",
      value: formatLongDate(getMaternalValue(maternal, record, ["lmp"], ""), EMPTY),
      always: true,
    },
    {
      label: "PMP",
      value: formatLongDate(getMaternalValue(maternal, record, ["pmp"], ""), ""),
    },
    {
      label: "EDC",
      value: formatLongDate(
        getMaternalValue(
          maternal,
          record,
          ["expectedDeliveryDate", "expected_delivery_date", "edc", "edd"],
          "",
        ),
        EMPTY,
      ),
      always: true,
    },
    {
      label: "AOG",
      value: getMaternalValue(
        maternal,
        record,
        ["aog", "ageOfGestation", "age_of_gestation"],
        "",
      ),
      always: true,
    },
    {
      label: "Gravida",
      value: getMaternalValue(maternal, record, ["gravida"], ""),
      always: true,
    },
    {
      label: "Para",
      value: getMaternalValue(maternal, record, ["para"], ""),
      always: true,
    },
    { label: "Term", value: term },
    { label: "Preterm", value: preterm },
    { label: "Abortion", value: abortion },
    { label: "Living", value: living },
    { label: "OB score / TPAL", value: tpal },
    { label: "Previous FP method", value: previousFp },
  ].filter((item) => item.always || blankText(item.value));

  return (
    <Section title={postpartumOnly ? "Postpartum record" : "Maternal / Prenatal"}>
      <InlineGrid
        items={coreItems.map(({ label, value, always }) => ({
          label,
          value: always ? (blankText(value) || EMPTY) : value,
        }))}
      />
      {notesFindings ? (
        <Narrative label="Findings / notes" value={notesFindings} />
      ) : null}
      {history.length > 0 ? (
        <>
          <p className="bhc-print-k">Pregnancy history</p>
          <PrintTable
            columns={["Pregnancy no.", "Place of delivery", "Year", "Notes"]}
            rows={history.map((row, index) => ({
              key: `${row.pregnancyNo || row.pregnancy_no || "pregnancy"}-${index}`,
              cells: [
                row.pregnancyNo || row.pregnancy_no || "None",
                row.placeOfDelivery || row.place_of_delivery || "None",
                row.year || "None",
                row.notes || "None",
              ],
            }))}
          />
        </>
      ) : null}
      {riskLabels.length > 0 ? (
        <>
          <p className="bhc-print-k">Medical history / risk codes</p>
          <p className="bhc-print-prose">{riskLabels.join("; ")}</p>
        </>
      ) : null}
      {labs.some((item) => item.value) ? (
        <>
          <p className="bhc-print-k">Laboratory results</p>
          <InlineGrid
            items={labs
              .filter((item) => item.value)
              .map((item) => ({
                label: item.label,
                value: item.date
                  ? `${item.value || EMPTY} · ${formatLongDate(item.date, EMPTY)}`
                  : item.value || EMPTY,
              }))}
          />
        </>
      ) : null}
      {ultrasoundResult || ultrasoundDate || ultrasoundRemarks ? (
        <>
          <p className="bhc-print-k">Ultrasound</p>
          <InlineGrid
            columns={2}
            items={[
              {
                label: "Date done",
                value: formatLongDate(ultrasoundDate, EMPTY),
              },
            ]}
          />
          <Narrative
            label="Ultrasound result / findings"
            value={ultrasoundResult}
          />
          <Narrative label="Remarks" value={ultrasoundRemarks} />
        </>
      ) : null}
      <p className="bhc-print-k">TT / Td recorded this visit</p>
      {tetanus.length > 0 ? (
        <PrintTable
          columns={["Dose", "Date given"]}
          rows={tetanus.map((entry) => ({
            key: entry.dose,
            cells: [entry.dose, formatLongDate(entry.date, EMPTY)],
          }))}
        />
      ) : (
        <p className="bhc-print-prose">None</p>
      )}
    </Section>
  );
}

function FamilyPlanningPrintSection({ details, showActionTaken = false }) {
  const alwaysClient = new Set(["Method Used / Accepted", "Previous Method"]);
  const clientLabels = [
    "Client Type",
    "Method Used / Accepted",
    "Previous Method",
    "FP Visit Category",
    "Source",
    "Date Registered",
    "Date of Visit",
  ];
  const client = details
    .filter((item) => clientLabels.includes(item.label))
    .filter((item) => alwaysClient.has(item.label) || blankText(item.value));

  const concern = fpDetail(details, "Concern / Complaint");
  const findings = fpDetail(details, "Findings / Notes");
  const advice = fpDetail(details, "Advice Given");
  const remarks = fpDetail(details, "Remarks / Notes");

  return (
    <Section title="Family planning">
      <InlineGrid
        items={client.map((item) => ({
          label: item.label,
          value: alwaysClient.has(item.label) ? (blankText(item.value) || "None") : item.value,
        }))}
      />
      {blankText(concern) ? (
        <Narrative label="Concern / complaint" value={concern} />
      ) : null}
      {blankText(findings) ? (
        <Narrative label="Findings / notes" value={findings} />
      ) : null}
      <Narrative label="Advice given" value={advice} />
      {showActionTaken ? (
        <Narrative label="Action taken" value={fpDetail(details, "Action Taken")} />
      ) : null}
      {blankText(remarks) ? (
        <Narrative label="Remarks" value={remarks} />
      ) : null}
    </Section>
  );
}

function TbGroup({ title, items }) {
  const present = filledItems(items);
  if (!present.length) return null;
  return (
    <>
      <p className="bhc-print-k">{title}</p>
      <InlineGrid items={present} />
    </>
  );
}

function labHasValue(test = {}) {
  return ["label", "collectionDate", "examDate", "result"].some((key) =>
    String(test[key] || "").trim(),
  );
}

function TbPrintSection({ record }) {
  const data = normalizeTbData(record.tbData || record.tb_data);
  const regimenRows = (data.regimen?.rows || []).filter((row) =>
    Object.values(row).some((value) => String(value || "").trim()),
  );
  const events = (data.adverseEvents || []).filter((event) =>
    Object.values(event || {}).some((value) => String(value || "").trim()),
  );
  const months = (data.doseCalendar?.months || []).filter((month) =>
    (month.days || []).some((day) => String(day || "").trim()),
  );
  const labs = [
    ...TB_LAB_TESTS.map((test) => ({
      label: test.label,
      test: data.laboratory?.[test.key] || {},
    })),
    ...(labHasValue(data.laboratory?.other)
      ? [
          {
            label: data.laboratory.other.label || "Other laboratory test",
            test: data.laboratory.other,
          },
        ]
      : []),
  ].filter(({ test }) => labHasValue(test));

  return (
    <Section title="TB DOTS / TB monitoring">
      <TbGroup
        title="Case finding"
        items={[
          { label: "Diagnosing facility", value: data.caseFinding.diagnosingFacility },
          { label: "NTP facility code", value: data.caseFinding.ntpFacilityCode },
          { label: "Province / HUC", value: data.caseFinding.provinceHuc },
          { label: "Region", value: data.caseFinding.region },
          {
            label: "Referred by",
            value: optionLabel(TB_REFERRED_BY_OPTIONS, data.caseFinding.referredBy),
          },
          {
            label: "Screening category",
            value: optionLabel(
              TB_SCREENING_CATEGORY_OPTIONS,
              data.caseFinding.screeningCategory,
            ),
          },
          {
            label: "Date of screening",
            value: formatLongDate(data.caseFinding.dateOfScreening, ""),
          },
        ]}
      />
      {labs.length > 0 && (
        <>
          <p className="bhc-print-k">Laboratory</p>
          {labs.map((lab, index) => (
            <InlineGrid
              key={`${lab.label}-${index}`}
              columns={2}
              items={filledItems([
                { label: "Test", value: lab.label },
                {
                  label: "Collection date",
                  value: formatLongDate(lab.test.collectionDate, ""),
                },
                {
                  label: "Exam date",
                  value: formatLongDate(lab.test.examDate, ""),
                },
                { label: "Result", value: lab.test.result },
              ])}
            />
          ))}
        </>
      )}
      <TbGroup
        title="Diagnosis & classification"
        items={[
          {
            label: "Diagnosis type",
            value: optionLabel(TB_DIAGNOSIS_TYPE_OPTIONS, data.diagnosis.diagnosisType),
          },
          {
            label: "Date of diagnosis",
            value: formatLongDate(data.diagnosis.dateOfDiagnosis, ""),
          },
          {
            label: "Date of notification",
            value: formatLongDate(data.diagnosis.dateOfNotification, ""),
          },
          { label: "TB case number", value: data.diagnosis.tbCaseNumber },
          { label: "Attending physician", value: data.diagnosis.attendingPhysician },
          { label: "Referred to", value: data.diagnosis.referredTo },
          {
            label: "Bacteriological status",
            value: optionLabel(
              TB_BACTERIOLOGICAL_OPTIONS,
              data.classification.bacteriologicalStatus,
            ),
          },
          {
            label: "Anatomical site",
            value: optionLabel(
              TB_ANATOMICAL_SITE_OPTIONS,
              data.classification.anatomicalSite,
            ),
          },
          {
            label: "Extrapulmonary site",
            value: data.classification.extrapulmonarySite,
          },
          {
            label: "Drug resistance",
            value: optionLabel(
              TB_DRUG_RESISTANCE_OPTIONS,
              data.classification.drugResistance,
            ),
          },
          {
            label: "Registration group",
            value: optionLabel(
              TB_REGISTRATION_GROUP_OPTIONS,
              data.classification.registrationGroup,
            ),
          },
        ]}
      />
      <TbGroup
        title="Treatment supporter & phases"
        items={[
          {
            label: "Location of treatment",
            value: optionLabel(
              TB_LOCATION_OF_TREATMENT_OPTIONS,
              data.treatmentSupporter.locationOfTreatment,
            ),
          },
          { label: "Supporter", value: data.treatmentSupporter.supporterName },
          {
            label: "Designation",
            value: data.treatmentSupporter.supporterDesignation,
          },
          { label: "Type", value: data.treatmentSupporter.supporterType },
          { label: "Contact", value: data.treatmentSupporter.contactInfo },
          {
            label: "DAT supported",
            value: data.treatmentSupporter.datSupported ? "Yes" : "",
          },
          {
            label: "Schedule of treatment",
            value: data.treatmentSupporter.scheduleOfTreatment,
          },
          {
            label: "Intensive",
            value: [
              formatLongDate(data.phases.intensiveStart, ""),
              formatLongDate(data.phases.intensiveEnd, ""),
            ]
              .filter(Boolean)
              .join(" – "),
          },
          {
            label: "Continuation",
            value: [
              formatLongDate(data.phases.continuationStart, ""),
              formatLongDate(data.phases.continuationEnd, ""),
            ]
              .filter(Boolean)
              .join(" – "),
          },
          {
            label: "Outcome",
            value: TB_OUTCOME_LABELS[data.outcome.status] || data.outcome.status,
          },
          { label: "Outcome date", value: formatLongDate(data.outcome.date, "") },
        ]}
      />
      <TbGroup
        title="Comorbidities"
        items={[
          {
            label: "HIV status",
            value: optionLabel(TB_HIV_STATUS_OPTIONS, data.comorbidities.hivStatus),
          },
          {
            label: "HIV test date",
            value: formatLongDate(data.comorbidities.hivTestDate, ""),
          },
          {
            label: "ART",
            value: optionLabel(TB_ART_STATUS_OPTIONS, data.comorbidities.artStatus),
          },
          {
            label: "ART start date",
            value: formatLongDate(data.comorbidities.artStartDate, ""),
          },
          {
            label: "CPT",
            value: optionLabel(TB_CPT_STATUS_OPTIONS, data.comorbidities.cptStatus),
          },
          {
            label: "CPT start date",
            value: formatLongDate(data.comorbidities.cptStartDate, ""),
          },
          {
            label: "Other comorbidities",
            value: data.comorbidities.otherComorbidities,
          },
        ]}
      />
      {regimenRows.length > 0 && (
        <>
          <p className="bhc-print-k">Regimen</p>
          <PrintTable
            columns={["Start", "4FDC", "2FDC", "H", "R", "Z", "E", "Strength"]}
            rows={regimenRows.map((row, index) => ({
              key: `regimen-${index}`,
              cells: [
                formatLongDate(row.dateStart, "—"),
                row.drug4fdc,
                row.drug2fdc,
                row.drugH,
                row.drugR,
                row.drugZ,
                row.drugE,
                [row.strength, row.unit].filter(Boolean).join(" "),
              ],
            }))}
          />
        </>
      )}
      {events.length > 0 && (
        <>
          <p className="bhc-print-k">Adverse events</p>
          <PrintTable
            columns={["Date of AE", "Specific AE", "Date reported to FDA"]}
            rows={events.map((event, index) => ({
              key: `ae-${index}`,
              cells: [
                formatLongDate(event.dateOfAe, "—"),
                event.specificAe,
                formatLongDate(event.dateReportedToFda, "—"),
              ],
            }))}
          />
        </>
      )}
      {months.length > 0 && (
        <>
          <p className="bhc-print-k">
            Dose calendar
            {data.doseCalendar?.adherencePercent
              ? ` · Adherence ${data.doseCalendar.adherencePercent}%`
              : ""}
          </p>
          {months.map((month) => (
            <p
              key={month.monthIndex ?? month.label}
              className="bhc-print-prose"
            >
              {[
                month.label || `Month ${(month.monthIndex ?? 0) + 1}`,
                month.weightKg ? `Wt ${month.weightKg} kg` : "",
                month.heightCm ? `Ht ${month.heightCm} cm` : "",
                month.monthlyTotal ? `${month.monthlyTotal} doses` : "",
              ]
                .filter(Boolean)
                .join(" · ")}
              {": "}
              {(month.days || [])
                .map((day, dayIndex) =>
                  String(day || "").trim()
                    ? `D${dayIndex + 1} ${String(day).trim()}`
                    : "",
                )
                .filter(Boolean)
                .join("; ")}
            </p>
          ))}
        </>
      )}
    </Section>
  );
}

const generalConsultationPrintStyles = `
  .gc-record-print,
  .gc-record-print * {
    color: #000 !important;
  }
  .gc-record-print a,
  .gc-record-print a:link,
  .gc-record-print a:visited {
    color: #000 !important;
    text-decoration: none;
  }
  .gc-record-print {
    display: flex;
    flex-direction: column;
    min-height: 261mm;
    background: #fff;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 10.5pt;
    line-height: 1.45;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .gc-record-print {
    font-size: 9pt;
    line-height: 1.25;
  }
  .gc-print-body {
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    gap: 7px;
  }
  .gc-print-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
    padding-bottom: 6px;
    border-bottom: 1px solid #000;
  }
  .gc-print-brand {
    margin: 0;
    font-size: 14pt;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }
  .gc-print-docmeta { text-align: right; font-size: 8.5pt; }
  .gc-print-docmeta p { margin: 0; }
  .gc-print-doctype { font-weight: 700; }
  .gc-print-patient-row {
    display: grid;
    grid-template-columns: 1.5fr 0.8fr 0.9fr 1.2fr;
    gap: 4px 12px;
    padding: 6px 0 7px;
    border-bottom: 1px solid #000;
  }
  .gc-print-patient-field { min-width: 0; margin: 0; }
  .gc-print-k { font-size: 8.5pt; font-weight: 700; }
  .gc-print-v { font-weight: 600; }
  .gc-print-section h2,
  .bhc-print-section h2 {
    margin: 0 0 4px;
    padding: 0 0 2px;
    border-bottom: 1px solid #000;
    font-size: 8pt;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .gc-print-field-row {
    display: grid;
    grid-template-columns: 32mm 1fr;
    gap: 2px 8px;
    align-items: start;
    margin: 0 0 3px;
  }
  .gc-print-field-row:last-child { margin-bottom: 0; }
  .gc-print-field-label {
    margin: 0;
    font-size: 8.5pt;
    font-weight: 700;
  }
  .gc-print-prose {
    margin: 0;
    font-weight: 600;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .gc-print-writing-line {
    display: block;
    min-height: 12px;
    border-bottom: 1px solid #000;
  }
  .gc-print-vitals {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }
  .gc-print-vitals th,
  .gc-print-vitals td {
    border: 1px solid #000;
    padding: 4px 4px;
    text-align: center;
    vertical-align: middle;
    overflow-wrap: anywhere;
  }
  .gc-print-vitals th {
    font-size: 7pt;
    font-weight: 700;
    letter-spacing: 0.02em;
    text-transform: uppercase;
  }
  .gc-print-vitals td {
    font-weight: 600;
    font-size: 8.5pt;
  }
  .gc-print-signatures {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid #000;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .gc-print-sig {
    display: flex;
    flex-direction: column;
    min-height: 42px;
  }
  .gc-print-sig-line {
    position: relative;
    min-height: 18px;
    border-bottom: 1px solid #000;
  }
  .gc-print-sig-line-name {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 2px;
    margin: 0;
    font-size: 9pt;
    font-weight: 600;
  }
  .gc-print-sig-caption {
    margin: 3px 0 0;
    font-size: 8pt;
    font-weight: 700;
  }
  @media print {
    .gc-record-print { min-height: 0; }
    .gc-print-header,
    .gc-print-patient-row,
    .gc-print-vitals,
    .gc-print-signatures { break-inside: avoid; page-break-inside: avoid; }
  }
`;

const programSectionPrintStyles = `
  .bhc-print-subh {
    margin: 4px 0 1px;
    color: var(--color-text);
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .bhc-print-grid {
    display: grid;
    gap: 1px 10px;
  }
  .bhc-print-grid-2 { grid-template-columns: 1fr 1fr; }
  .bhc-print-grid-3 { grid-template-columns: 1fr 1fr 1fr; }
  .bhc-print-inline {
    margin: 0;
    min-width: 0;
    font-size: 8.5pt;
  }
  .bhc-print-k {
    color: var(--color-text-muted);
    font-size: 7.5pt;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .bhc-print-v {
    color: var(--color-text);
    font-weight: 600;
  }
  .bhc-print-narrative {
    margin: 3px 0 0;
  }
  .bhc-print-prose {
    margin: 1px 0 0;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    font-size: 8.5pt;
  }
  .bhc-print-muted {
    margin: 1px 0 0;
    color: var(--color-text-muted);
  }
  .bhc-print-list {
    margin: 2px 0 0;
    padding-left: 14px;
  }
  .bhc-print-table {
    width: 100%;
    margin-top: 2px;
    border-collapse: collapse;
    table-layout: auto;
    font-size: 8pt;
  }
  .bhc-print-table th,
  .bhc-print-table td {
    border-bottom: 1px solid #000;
    padding: 2px 4px;
    text-align: left;
    vertical-align: top;
    overflow-wrap: anywhere;
  }
  .bhc-print-table th {
    color: var(--color-text-muted);
    font-size: 7.5pt;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  @media print {
    .gc-record-print-with-sections,
    .gc-record-print-with-sections .gc-print-body {
      display: block;
    }
    .gc-record-print-with-sections .gc-print-body > * + * { margin-top: 7px; }
    .gc-record-print-with-sections .gc-print-signatures { margin-top: 8px; }
    .bhc-print-table thead { display: table-header-group; }
    .bhc-print-section h2 { break-after: avoid; }
  }
`;

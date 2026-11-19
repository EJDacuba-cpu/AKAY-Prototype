import { HealthConcernsAndCareOutcomes } from "./RecordDetailsSections";
import { diagnosisTextDistinctFromConcerns, recordDetailsPresentation, recordedVitalItems } from "./recordDetailsPresentation";
import { BodyFindingHistoryView, thisRecordBodyFindingHistory } from "./BodyFindingReassessment";
import VisitHistorySnapshot from "./VisitHistorySnapshot";
import {
  PROGRAM_CLASSIFICATIONS,
  getConsultationPrograms,
} from "../../../utils/consultationPrograms";
import {
  VISIT_SERVICES,
  TEENAGE_PREGNANCY_MESSAGE,
} from "../../../utils/visitPurpose";
import {
  earlierDraftContinuedNotes,
  earlierDraftNotes,
  isBhcGeneralV2,
  showsDiagnosisRow,
} from "../../../utils/consultationWorkflow";
import { joinDiagnosisNames } from "../../../utils/diagnoses";
import { savedPrescriptionRows } from "../../../utils/prescriptionPrint";
import { formatPrescriptionLine } from "../../../utils/rhuPrescriptions";
import { visitHistoryInformantLine } from "../../../utils/visitHistorySnapshot";
import { isTbRecord } from "../../../utils/tbRecords";
import {
  formatDisplayValue,
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
  getCompletedRecordMedicalNotes,
  getRecordTreatmentNotes,
  isDistinctRecordedValue,
  getRecordInitialActions,
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
    margin: 18mm;
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

function recorded(value, empty = "Not recorded") {
  const text = String(value ?? "").trim();
  if (
    !text ||
    text.toLowerCase() === "not recorded" ||
    text.toLowerCase() === "no follow-up date recorded." ||
    text === "—"
  ) {
    return empty;
  }
  return text;
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
              <td key={`${row.key}-${index}`}>{cell || "—"}</td>
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

/** Plain GC print only — program records keep the legacy multi-section layout. */
function usesGeneralConsultationPrintLayout({
  serviceType,
  record,
  tbRecord,
  immunization,
  maternal,
  postpartumOnly,
  familyPlanning,
}) {
  if (!isGeneralConsultationService(serviceType, record)) return false;
  if (tbRecord || immunization || maternal || postpartumOnly || familyPlanning) {
    return false;
  }
  return true;
}

function blankText(value) {
  const text = String(value ?? "").trim();
  if (
    !text ||
    text.toLowerCase() === "not recorded" ||
    text.toLowerCase() === "facility not recorded" ||
    text === "—"
  ) {
    return "";
  }
  return text;
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
  };
}

/** Label + value in a fixed label column. Empty → writing line when allowBlankLine. */
function GcField({ label, value, allowBlankLine = false }) {
  const text = blankText(value);
  if (!text && !allowBlankLine) return null;
  return (
    <div className="gc-print-field-row">
      <p className="gc-print-field-label">{label}</p>
      {text ? (
        <p className="gc-print-prose">{text}</p>
      ) : (
        <span className="gc-print-writing-line" aria-hidden="true" />
      )}
    </div>
  );
}

function gcMedicationLines(record) {
  const prescriptions = savedPrescriptionRows(record);
  if (prescriptions.length) {
    return {
      prescribed: prescriptions.map((row) => formatPrescriptionLine({ ...row, instructions: "" })).filter(Boolean).join("\n"),
      instructions: prescriptions
        .filter((row) => blankText(row.instructions))
        .map((row) => {
          const medicine = [row.medicineName, row.strength].map(blankText).filter(Boolean).join(" ");
          return [medicine, blankText(row.instructions)].filter(Boolean).join(": ");
        })
        .join("\n"),
    };
  }

  const medicines = getDispensedMedicines(record);
  if (!medicines.length) return { prescribed: "", instructions: "" };
  const prescribed = medicines
    .map((medicine) => {
      const name =
        medicine.medicineName ||
        medicine.medicine_name_snapshot ||
        medicine.medicine_name ||
        "";
      const qty = [medicine.quantity, medicine.unit].filter(Boolean).join(" ");
      return [blankText(name), blankText(qty)].filter(Boolean).join(" · ");
    })
    .filter(Boolean)
    .join("; ");
  const instructions = medicines
    .map((medicine) => blankText(medicine.remarks))
    .filter(Boolean)
    .join("; ");
  return { prescribed, instructions };
}

function GeneralConsultationPrintDocument({
  record,
  patient,
  title,
  recordId,
  patientName,
  displayDate,
  displayTime,
  practitioner,
  sourceRole,
  facility,
  printState = "ready",
}) {
  const isRhu = sourceRole === "rhu";
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
  const hpiFieldLabel = isFollowUpVisit
    ? "Changes since last visit"
    : "Present illness";
  const { prescribed, instructions } = gcMedicationLines(record);
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
      className="gc-record-print"
    >
      <style>{generalConsultationPrintStyles}</style>

      <div className="gc-print-body">
        <header className="gc-print-header">
          <p className="gc-print-brand">AKAY</p>
          <div className="gc-print-docmeta">
            <p className="gc-print-doctype">
              {title || "General Consultation Record"}
            </p>
            {/* INSERT: facility name from record */}
            {facilityName ? <p>{facilityName}</p> : <p>&nbsp;</p>}
            {/* INSERT: record number */}
            <p>Record #{recordId}</p>
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
        </section>

        <section className="gc-print-section">
          <h2>Assessment</h2>
          <GcField
            label="General exam findings"
            value={generalExamFindings}
            allowBlankLine
          />
          <GcField
            label="Diagnosis"
            value={diagnosisText}
            allowBlankLine={isRhu}
          />
        </section>

        <section className="gc-print-section">
          <h2>Medications</h2>
          <GcField label="Prescribed" value={prescribed} allowBlankLine />
          <GcField label="Instructions" value={instructions} allowBlankLine />
        </section>
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
        <div className="gc-print-sig">
          <div className="gc-print-sig-line" />
          <p className="gc-print-sig-caption">Physician Signature</p>
        </div>
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
  const hasAge = patient?.age !== undefined && patient?.age !== null && String(patient.age).trim() !== "";

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

  if (
    usesGeneralConsultationPrintLayout({
      serviceType,
      record,
      tbRecord,
      immunization,
      maternal,
      postpartumOnly,
      familyPlanning,
    })
  ) {
    return (
      <GeneralConsultationPrintDocument
        record={record}
        patient={patient}
        title={title}
        recordId={recordId}
        patientName={patientName}
        displayDate={displayDate}
        displayTime={displayTime}
        practitioner={practitioner}
        sourceRole={sourceRole}
        facility={facility}
        printState={printState}
      />
    );
  }

  const status = normalizeHealthRecordStatus(
    record.followUpStatus || record.status || "Consultation",
  );
  const vitalItems = recordedVitalItems(record, patient);
  const isFollowUp = getRecordVisitTypeValue(record) === "follow_up_visit";
  const chiefComplaint = getRecordChiefComplaint(record, "");
  const diagnosis = getRecordDiagnosis(record, "");
  const physicalExam = getRecordPhysicalExam(record, "");
  const summary = getRecordSummary(record, "");
  const monitoringNotes = getRecordValue(
    record,
    ["monitoringNotes", "monitoring_notes"],
    "",
  );
  const medicalNotes =
    status === "Completed"
      ? getCompletedRecordMedicalNotes(record, monitoringNotes, "")
      : getRecordNotes(record, "");
  const treatmentAction = getRecordInitialActions(record, "");
  const treatmentNotes = getRecordTreatmentNotes(record, "");
  const medicines = getDispensedMedicines(record);
  const { concerns } = recordDetailsPresentation(record, linkedReferral);
  const draftNotes = earlierDraftNotes(record);
  const bodyFindings = thisRecordBodyFindingHistory(record);
  const continuedNotes = earlierDraftContinuedNotes(record);
  const fpDetails = getFamilyPlanningDetails(record);
  const maternalData = getMaternalData(record);
  const patientCode =
    patient?.patientId ||
    patient?.patient_id ||
    patient?.patientCode ||
    patient?.patient_code ||
    "";
  const printedOn = new Date().toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <article id="health-record-print" data-print-key={recordId} data-print-state={printState} className="bhc-record-print">
      <style>{documentStyles}</style>

      <header className="bhc-print-letterhead">
        <div className="bhc-print-brand">
          <p className="bhc-print-mark">AKAY</p>
          <p>Medical EHR and Referral System</p>
          <p>{sourceRole === "rhu" ? "Rural Health Unit" : "Barangay Health Center"}</p>
          {facility ? <p>{facility}</p> : null}
        </div>
        <div className="bhc-print-docmeta">
          <p className="bhc-print-doctype">{sourceRole === "rhu" ? "RHU" : "BHC"} Health Record</p>
          <p>{title || "Health Record"}</p>
          <p>Record #{recordId}</p>

        </div>
      </header>

      <Section title="Patient & consultation" avoidBreak>
        <InlineGrid
          items={[
            { label: "Patient", value: patientName },
            ...(patientCode ? [{ label: "Patient ID", value: patientCode }] : []),
            ...(hasAge || patient?.sex
              ? [
                  {
                    label: "Age / Sex",
                    value: [hasAge ? `${patient.age} yrs` : "", patient?.sex]
                      .filter(Boolean)
                      .join(" / "),
                  },
                ]
              : []),
            { label: "Service", value: serviceType },
            { label: "Date of visit", value: displayDate },
            { label: "Time of visit", value: displayTime },
            { label: "Recorded By", value: practitioner },
            ...(parentRecordId
              ? [{ label: "Parent record", value: `#${parentRecordId}` }]
              : []),
          ]}
        />
      </Section>

      {purpose && (
        <Section title="Purpose of visit" avoidBreak>
          <p className="bhc-print-prose">
            {(purpose.services || [])
              .map((key) => VISIT_SERVICES[key] || key)
              .join(" + ")}
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

      <Section title="Vital signs" avoidBreak>
        <InlineGrid items={vitalItems} />
        {!vitalItems.length && <p className="bhc-print-muted">No vital measurements recorded.</p>}
      </Section>

      {(!tbRecord || bodyFindings.originals.length > 0 || bodyFindings.events.length > 0) && (
        <Section title="Clinical assessment">
          {!tbRecord && (
            <>
              <Narrative label="Chief complaint" value={chiefComplaint} />
              <Narrative
                label={
                  isFollowUp
                    ? "Follow-up findings / changes since previous visit"
                    : "History of present illness / signs & symptoms"
                }
                value={summary}
              />
              <Narrative label="Physical examination" value={physicalExam} />
              {showsDiagnosisRow(record, diagnosis) && diagnosisTextDistinctFromConcerns(diagnosis, concerns) && (
                <Narrative label="Assessment" value={diagnosis} />
              )}
            </>
          )}
          <BodyFindingHistoryView {...bodyFindings} print />
        </Section>
      )}

      <VisitHistorySnapshot record={record} print />

      {immunization && <EpiPrintSection record={record} />}
      {(maternal || postpartumOnly) && (
        <MaternalPrintSection
          record={record}
          maternal={maternalData}
          postpartumOnly={postpartumOnly}
        />
      )}
      {familyPlanning && <FamilyPlanningPrintSection details={fpDetails} />}
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

      <Section title="Health concerns & care outcomes">
        <HealthConcernsAndCareOutcomes
          record={record}
          linkedReferral={linkedReferral}
          monitoringNotes={monitoringNotes}
          nextAppointmentDate={fpDetail(fpDetails, "Next Appointment Date")}
          print
        />
      </Section>

      <Section title="Treatment & dispensed medicines">
        {!tbRecord && (
          <>
            <Narrative
              label="Treatment / action taken"
              value={
                getMaternalValue(maternalData, record, ["treatment"], "") ||
                treatmentAction
              }
            />
            {isDistinctRecordedValue(
              treatmentNotes,
              treatmentAction,
              getMaternalValue(maternalData, record, ["treatment"], ""),
            ) && <Narrative label="Treatment notes" value={treatmentNotes} />}
            {isFollowUp &&
              isDistinctRecordedValue(
                medicalNotes,
                treatmentAction,
                treatmentNotes,
              ) && <Narrative label="Follow-up notes" value={medicalNotes} />}
            {!isFollowUp &&
              isDistinctRecordedValue(
                medicalNotes,
                treatmentAction,
                treatmentNotes,
                summary,
              ) && <Narrative label="Medical notes" value={medicalNotes} />}
            {familyPlanning && (
              <>
                <Narrative
                  label="Advice given"
                  value={fpDetail(fpDetails, "Advice Given")}
                />
                <Narrative
                  label="Action taken"
                  value={fpDetail(fpDetails, "Action Taken")}
                />
                <Narrative
                  label="Remarks"
                  value={fpDetail(fpDetails, "Remarks / Notes")}
                />
              </>
            )}
          </>
        )}
        <p className="bhc-print-k">Dispensed medicines</p>
        {medicines.length > 0 ? (
          <PrintTable
            columns={["Medicine / supply", "Quantity", "Remarks", "Date dispensed"]}
            rows={medicines.map((medicine, index) => ({
              key: medicine.id || `${medicine.medicineId || "medicine"}-${index}`,
              cells: [
                [
                  medicine.medicineName ||
                    medicine.medicine_name_snapshot ||
                    "Medicine",
                  medicine.category || medicine.category_snapshot || "",
                ]
                  .filter(Boolean)
                  .join(" · "),
                `${formatDisplayValue(medicine.quantity, "Not recorded")} ${formatDisplayValue(medicine.unit, "")}`.trim(),
                formatDisplayValue(medicine.remarks, "—"),
                formatLongDate(
                  medicine.dateDispensed ||
                    medicine.created_at ||
                    medicine.createdAt,
                  "—",
                ),
              ],
            }))}
          />
        ) : (
          <p className="bhc-print-muted">
            No medicines or supplies were dispensed during this visit.
          </p>
        )}
      </Section>
      {(draftNotes || continuedNotes) && <Section title="Earlier draft notes">
        {draftNotes && <Narrative label="Earlier draft notes" value={draftNotes} />}
        {continuedNotes && <Narrative label="Earlier draft notes (continued)" value={continuedNotes} />}
      </Section>}

      <footer className="bhc-print-footer">
        Printed on {printedOn}. This copy reflects the saved health record and
        is not a clinical recommendation.
      </footer>
    </article>
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
                "Not recorded",
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
        <p className="bhc-print-muted">
          No vaccines were recorded during this visit.
        </p>
      )}
      <p className="bhc-print-k">Breastfeeding monitoring</p>
      <p className="bhc-print-prose">
        {breastfeeding.length > 0
          ? breastfeeding.join(", ")
          : "No breastfeeding monitoring recorded for this visit."}
      </p>
      {remarks ? <Narrative label="Remarks" value={remarks} /> : null}
    </Section>
  );
}

function MaternalPrintSection({ record, maternal, postpartumOnly }) {
  const EMPTY = "Not recorded";
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

  return (
    <Section title={postpartumOnly ? "Postpartum record" : "Maternal / Prenatal"}>
      <InlineGrid
        items={[
          {
            label: "LMP",
            value: formatLongDate(
              getMaternalValue(maternal, record, ["lmp"], ""),
              EMPTY,
            ),
          },
          {
            label: "PMP",
            value: formatLongDate(
              getMaternalValue(maternal, record, ["pmp"], ""),
              EMPTY,
            ),
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
          },
          {
            label: "AOG",
            value: getMaternalValue(
              maternal,
              record,
              ["aog", "ageOfGestation", "age_of_gestation"],
              "",
            ),
          },
          {
            label: "Gravida",
            value: getMaternalValue(maternal, record, ["gravida"], ""),
          },
          {
            label: "Para",
            value: getMaternalValue(maternal, record, ["para"], ""),
          },
          { label: "Term", value: term },
          { label: "Preterm", value: preterm },
          { label: "Abortion", value: abortion },
          { label: "Living", value: living },
          { label: "OB score / TPAL", value: tpal },
          { label: "Previous FP method", value: previousFp },
        ]}
      />
      {notesFindings ? (
        <Narrative label="Findings / notes" value={notesFindings} />
      ) : null}
      <p className="bhc-print-k">Pregnancy history</p>
      {history.length > 0 ? (
        <PrintTable
          columns={["Pregnancy no.", "Place of delivery", "Year", "Notes"]}
          rows={history.map((row, index) => ({
            key: `${row.pregnancyNo || row.pregnancy_no || "pregnancy"}-${index}`,
            cells: [
              row.pregnancyNo || row.pregnancy_no,
              row.placeOfDelivery || row.place_of_delivery,
              row.year,
              row.notes,
            ],
          }))}
        />
      ) : (
        <p className="bhc-print-muted">No previous pregnancy history recorded.</p>
      )}
      <p className="bhc-print-k">Medical history / risk codes</p>
      <p className="bhc-print-prose">
        {riskLabels.length > 0
          ? riskLabels.join("; ")
          : "No risk codes recorded."}
      </p>
      <p className="bhc-print-k">Laboratory results</p>
      {labs.some((item) => item.value) ? (
        <InlineGrid
          items={labs.map((item) => ({
            label: item.label,
            value: item.date
              ? `${item.value || EMPTY} · ${formatLongDate(item.date, EMPTY)}`
              : item.value || EMPTY,
          }))}
        />
      ) : (
        <p className="bhc-print-muted">No laboratory results recorded.</p>
      )}
      <p className="bhc-print-k">Ultrasound</p>
      {ultrasoundResult || ultrasoundDate || ultrasoundRemarks ? (
        <>
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
      ) : (
        <p className="bhc-print-muted">
          No ultrasound result recorded for this visit.
        </p>
      )}
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
        <p className="bhc-print-muted">
          No tetanus toxoid / Td dose was recorded for this visit.
        </p>
      )}
    </Section>
  );
}

function FamilyPlanningPrintSection({ details }) {
  const clientLabels = [
    "Client Type",
    "Method Used / Accepted",
    "Previous Method",
    "FP Visit Category",
    "Source",
    "Date Registered",
    "Date of Visit",
  ];
  const client = details.filter((item) => clientLabels.includes(item.label));

  return (
    <Section title="Family planning">
      <InlineGrid
        items={client.map((item) => ({
          label: item.label,
          value: item.value,
        }))}
      />
      <Narrative
        label="Concern / complaint"
        value={fpDetail(details, "Concern / Complaint")}
      />
      <Narrative
        label="Findings / notes"
        value={fpDetail(details, "Findings / Notes")}
      />
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
  .gc-print-body {
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    gap: 14px;
  }
  .gc-print-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 16px;
    padding-bottom: 10px;
    border-bottom: 1px solid #000;
    break-after: avoid;
  }
  .gc-print-brand {
    margin: 0;
    font-size: 18pt;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }
  .gc-print-docmeta { text-align: right; }
  .gc-print-docmeta p { margin: 0; }
  .gc-print-doctype { font-weight: 700; }
  .gc-print-patient-row {
    display: grid;
    grid-template-columns: 1.5fr 0.8fr 0.9fr 1.2fr;
    gap: 10px 16px;
    padding: 10px 0 12px;
    border-bottom: 1px solid #000;
    break-inside: avoid;
  }
  .gc-print-patient-field { min-width: 0; margin: 0; }
  .gc-print-k { font-size: 9.5pt; font-weight: 700; }
  .gc-print-v { font-weight: 600; }
  .gc-print-section {
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .gc-print-section h2 {
    margin: 0 0 10px;
    padding: 0 0 4px;
    border-bottom: 1px solid #000;
    font-size: 9pt;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    break-after: avoid;
    page-break-after: avoid;
  }
  .gc-print-field-row {
    display: grid;
    grid-template-columns: 35mm 1fr;
    gap: 8px 12px;
    align-items: start;
    margin: 0 0 10px;
    min-height: 18px;
  }
  .gc-print-field-row:last-child { margin-bottom: 0; }
  .gc-print-field-label {
    margin: 0;
    font-size: 9.5pt;
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
    min-height: 18px;
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
    padding: 10px 8px;
    text-align: center;
    vertical-align: middle;
    overflow-wrap: anywhere;
  }
  .gc-print-vitals th {
    font-size: 8pt;
    font-weight: 700;
    letter-spacing: 0.03em;
    text-transform: uppercase;
  }
  .gc-print-vitals td {
    font-weight: 600;
    min-height: 1.6em;
  }
  .gc-print-signatures {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 32px;
    margin-top: auto;
    padding-top: 20px;
    border-top: 1px solid #000;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .gc-print-sig {
    display: flex;
    flex-direction: column;
    min-height: 72px;
  }
  .gc-print-sig-line {
    position: relative;
    min-height: 28px;
    border-bottom: 1px solid #000;
  }
  .gc-print-sig-line-name {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 4px;
    margin: 0;
    font-size: 10.5pt;
    font-weight: 600;
  }
  .gc-print-sig-caption {
    margin: 6px 0 0;
    font-size: 9pt;
    font-weight: 700;
  }
  @media print {
    .gc-record-print { min-height: 261mm; }
    .gc-print-section { break-inside: avoid; page-break-inside: avoid; }
    .gc-print-header { break-after: avoid; }
  }
`;

const documentStyles = `
  .bhc-record-print {
    color: var(--color-text);
    font-family: var(--font-sans);
    font-size: 10pt;
    line-height: 1.35;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .bhc-print-letterhead {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    padding-bottom: 8px;
    margin-bottom: 10px;
    border-bottom: 1.5px solid var(--color-brand-600);
  }
  .bhc-print-mark {
    color: var(--color-brand-600);
    font-size: 13px;
    font-weight: 800;
    letter-spacing: 0.18em;
    margin: 0;
  }
  .bhc-print-brand p,
  .bhc-print-docmeta p {
    margin: 0;
    color: var(--color-text-secondary);
  }
  .bhc-print-doctype {
    color: var(--color-text) !important;
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .bhc-print-docmeta {
    text-align: right;
  }
  .bhc-print-section {
    margin: 0 0 8px;
    padding: 0 0 6px;
    border-bottom: 1px solid var(--color-border);
  }
  .bhc-print-section h2 {
    margin: 0 0 6px;
    color: var(--color-text);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .bhc-print-subh {
    margin: 8px 0 2px;
    color: var(--color-text);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .bhc-print-grid {
    display: grid;
    gap: 3px 14px;
  }
  .bhc-print-grid-2 { grid-template-columns: 1fr 1fr; }
  .bhc-print-grid-3 { grid-template-columns: 1fr 1fr 1fr; }
  .bhc-print-inline {
    margin: 0;
    min-width: 0;
  }
  .bhc-print-k {
    color: var(--color-text-muted);
    font-size: 9pt;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .bhc-print-v {
    color: var(--color-text);
    font-weight: 600;
  }
  .bhc-print-narrative {
    margin: 6px 0 0;
  }
  .bhc-print-prose {
    margin: 2px 0 0;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .bhc-print-muted {
    margin: 2px 0 0;
    color: var(--color-text-muted);
  }
  .bhc-print-list {
    margin: 4px 0 0;
    padding-left: 16px;
  }
  .bhc-print-table {
    width: 100%;
    margin-top: 4px;
    border-collapse: collapse;
    table-layout: auto;
  }
  .bhc-print-table th,
  .bhc-print-table td {
    border-bottom: 1px solid var(--color-border);
    padding: 4px 6px;
    text-align: left;
    vertical-align: top;
    overflow-wrap: anywhere;
  }
  .bhc-print-table th {
    color: var(--color-text-muted);
    font-size: 9pt;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .bhc-print-footer {
    margin-top: 6px;
    break-before: avoid;
    color: var(--color-text-muted);
    font-size: 9px;
  }
  @media print {
    .bhc-print-keep { break-inside: auto; }
    .bhc-print-table thead { display: table-header-group; }
    .bhc-print-section h2 { break-after: avoid; }
    .bhc-print-table tr { break-inside: avoid; }
    .bhc-print-letterhead { break-after: avoid; }
    .bhc-print-narrative, .bhc-print-prose { break-inside: auto; }
  }
`;

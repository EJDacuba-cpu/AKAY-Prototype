import { HealthConcernsAndCareOutcomes, RelatedConsultationHistory } from "./RecordDetailsSections";
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
  showsDiagnosisRow,
} from "../../../utils/consultationWorkflow";
import { isTbRecord } from "../../../utils/tbRecords";
import {
  formatDisplayValue,
  formatFacilityName,
  formatLongDate,
} from "../../../utils/formatters";
import { getCurrentUser } from "../../../utils/auth";
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
    margin: 12mm 12mm 14mm 12mm;
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
  return formatFacilityName(
    record?.barangayHealthCenter ||
      record?.barangay_health_center ||
      patient?.barangayHealthCenter ||
      patient?.barangay_health_center ||
      user?.barangayHealthCenter ||
      user?.barangay_health_center ||
      user?.facility,
    "",
  );
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
}) {
  if (!record) return null;

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
  const status = normalizeHealthRecordStatus(
    record.followUpStatus || record.status || "Consultation",
  );
  const vitalItems = recordedVitalItems(record);
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
  const facility = facilityLabel(record, patient);
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
    <article className="bhc-record-print">
      <style>{documentStyles}</style>

      <header className="bhc-print-letterhead">
        <div className="bhc-print-brand">
          <p className="bhc-print-mark">AKAY</p>
          <p>Medical EHR and Referral System</p>
          <p>Barangay Health Center</p>
          {facility ? <p>{facility}</p> : null}
        </div>
        <div className="bhc-print-docmeta">
          <p className="bhc-print-doctype">BHC Health Record</p>
          <p>{title || "Health Record"}</p>
          <p>Record #{recordId}</p>

        </div>
      </header>

      <Section title="Patient & consultation" avoidBreak>
        <InlineGrid
          items={[
            { label: "Patient", value: patientName },
            ...(patientCode ? [{ label: "Patient ID", value: patientCode }] : []),
            ...(patient?.age || patient?.sex
              ? [
                  {
                    label: "Age / Sex",
                    value: [patient?.age ? `${patient.age} yrs` : "", patient?.sex]
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
                `${formatDisplayValue(medicine.quantity, "0")} ${formatDisplayValue(medicine.unit, "")}`.trim(),
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
      <RelatedPrintSection record={record} linkedReferral={linkedReferral} />

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

function RelatedPrintSection({ record, linkedReferral }) {
  const { related } = recordDetailsPresentation(record, linkedReferral);
  if (!related.length) return null;
  return <Section title="Related consultation history">
    <RelatedConsultationHistory record={record} linkedReferral={linkedReferral} print />
  </Section>;
}

const documentStyles = `
  .bhc-record-print {
    color: var(--color-text);
    font-family: var(--font-sans);
    font-size: 11px;
    line-height: 1.45;
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
    margin: 0 0 10px;
    padding: 0 0 8px;
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
    font-size: 9px;
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
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .bhc-print-footer {
    margin-top: 10px;
    color: var(--color-text-muted);
    font-size: 9px;
  }
  @media print {
    .bhc-print-keep { break-inside: avoid; }
    .bhc-print-section h2 { break-after: avoid; }
    .bhc-print-table tr { break-inside: avoid; }
    .bhc-print-letterhead { break-after: avoid; }
    .bhc-print-narrative, .bhc-print-prose { break-inside: auto; }
  }
`;

import { Link, useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  FilePlus2,
  HeartPulse,
  Pencil,
} from "lucide-react";

import DashboardLayout from "../../components/layout/DashboardLayout";
import { SideCard } from "../../components/common";
import HealthRecordDetailsSkeleton from "../../components/common/loading/HealthRecordDetailsSkeleton";
import RefreshingIndicator from "../../components/common/loading/RefreshingIndicator";
import PatientDetailItem from "../../components/features/patients/PatientDetailItem";
import { getRhuHealthRecords } from "../../services/healthRecordService";
import {
  getPatientDetailsListByRole,
  getPatientsByRole,
} from "../../services/patients";
import { queryKeys } from "../../utils/queryKeys";
import { formatLongDate } from "../../utils/formatters";

const keyframes = `
  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(14px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .anim-fade-up { animation: fadeUp 0.55s cubic-bezier(0.22,1,0.36,1) both; }
`;

export default function RHURecordDetails() {
  const { recordId } = useParams();
  const {
    data: details,
    isLoading,
    isFetching,
  } = useQuery({
    queryKey: queryKeys.healthRecordDetails("rhu", recordId),
    queryFn: async () => {
      const [rhuRecords, patientDetails, patientList] = await Promise.all([
        getRhuHealthRecords(),
        getPatientDetailsListByRole("rhu"),
        getPatientsByRole("rhu"),
      ]);

      const allRecords = Array.isArray(rhuRecords) ? rhuRecords : [];
      const foundRecord =
        allRecords.find((item) => getRecordId(item) === recordId) || null;

      const foundPatient = foundRecord
        ? findPatientForRecord(foundRecord, [
            ...(Array.isArray(patientDetails) ? patientDetails : []),
            ...(Array.isArray(patientList) ? patientList : []),
          ])
        : null;

      return {
        record: foundRecord,
        patient: foundPatient || derivePatientFromRecord(foundRecord),
      };
    },
    enabled: Boolean(recordId),
  });

  const record = details?.record || null;
  const patient = details?.patient || null;
  const loading = isLoading && !details;

  if (loading) {
    return (
      <DashboardLayout role="rhu" title="Health Record Details">
        <style>{keyframes}</style>
        <HealthRecordDetailsSkeleton showActions={false} />
      </DashboardLayout>
    );
  }

  if (!record) {
    return (
      <DashboardLayout role="rhu" title="Health Record Details">
        <style>{keyframes}</style>
        <div className="rounded-2xl border border-[#E8ECF0] bg-white p-8 shadow-sm">
          <Link
            to="/rhu/health-records"
            className="inline-flex items-center gap-2 text-[13px] font-medium text-slate-500 transition hover:text-[#0F172A]"
          >
            <ArrowLeft size={15} /> Back to Health Records
          </Link>
          <div className="mt-6 text-sm text-slate-500">
            Health record was not found.
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const status = normalizeHealthRecordStatus(
    record.followUpStatus || record.status || "Routine Monitoring",
  );
  const patientId = patient?.id || record.patientId;
  const patientName = getPatientName(patient) || getRecordPatientName(record);
  const canRecordFollowUpVisit = isFollowUpEligibleStatus(status);
  const showPatientProfileSidebar = false;

  return (
    <DashboardLayout role="rhu" title="Health Record Details">
      <style>{keyframes}</style>
      <RefreshingIndicator
        show={isFetching && !loading}
        label="Refreshing details..."
        className="mb-3"
      />

      <div className="mb-6">
        <Link
          to="/rhu/health-records"
          className="inline-flex items-center gap-2 text-[13px] font-medium text-slate-500 transition hover:text-[#0F172A]"
        >
          <ArrowLeft size={15} /> Back to Health Records
        </Link>

        <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-xl font-bold text-[#0F172A]">
                {getRecordDiagnosis(record, "Medical Consultation")}
              </h1>
              <HealthRecordStatusBadge status={status} />
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
              <span className="font-mono text-[11px] font-semibold text-slate-600">
                {getRecordId(record)}
              </span>
              <span className="text-slate-300">/</span>
              <span>
                {getRecordDate(record)} at {getRecordTime(record)}
              </span>
              {patientId && (
                <>
                  <span className="text-slate-300">/</span>
                  <span>
                    Patient:{" "}
                    <Link
                      to={`/rhu/patients/${patientId}`}
                      className="font-semibold text-[#B91C1C] hover:text-[#7F1D1D] hover:underline"
                    >
                      {patientName}
                    </Link>
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap gap-2">
            <Link
              to={`/rhu/health-records/add?recordId=${getRecordId(record)}&mode=edit`}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-[#0F172A] shadow-sm transition hover:bg-slate-50"
            >
              <Pencil size={14} />
              Edit Record
            </Link>
            {canRecordFollowUpVisit && (
              <Link
                to={`/rhu/health-records/add?recordId=${getRecordId(record)}&mode=follow-up`}
                title="This action creates a follow-up visit linked to the current health record."
                aria-label="Record a follow-up visit linked to this health record"
                className="inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-semibold text-amber-800 shadow-sm transition hover:bg-amber-100"
              >
                <FilePlus2 size={14} />
                Record Follow-up Visit
              </Link>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <div>
          <SideCard title="Clinical Record" icon={<HeartPulse size={14} />}>
            <div className="space-y-1">
              <SectionDivider label="Clinical Assessment" />
              <div className="grid gap-x-8 gap-y-1 pt-3 md:grid-cols-2">
                <PatientDetailItem
                  label="Classification"
                  value={getRecordClassification(record, patient)}
                />
                <PatientDetailItem
                  label="Diagnosis / Assessment"
                  value={getRecordDiagnosis(record)}
                />
                <PatientDetailItem label="Status / Type" value={status} />
                <PatientDetailItem
                  label="Recorded By"
                  value={getRecordPractitioner(record, "RHU Staff")}
                />
              </div>

              <div className="pt-2">
                <PatientDetailItem
                  label="Chief Complaint"
                  value={getRecordConcern(record)}
                />
              </div>

              <div className="pt-2">
                <NarrativeBox
                  label="Summary of Present Illness"
                  value={getRecordSummary(record, "")}
                  emptyText="Not recorded"
                />
              </div>

              <SectionDivider label="Treatment & Actions" />
              <div className="pt-3">
                <PatientDetailItem
                  label="Initial Action Taken / Medication"
                  value={getRecordInitialActions(record)}
                />
              </div>

              <SectionDivider label="Vital Signs" />
              <div className="pt-3">
                <NarrativeBox
                  label="Recorded Vitals"
                  value={getVitalSigns(record)}
                  emptyText="No vital signs recorded for this visit."
                />
              </div>

              <SectionDivider label="Monitoring & Follow-up" />
              <div className="grid gap-x-8 gap-y-1 pt-3 md:grid-cols-2">
                <PatientDetailItem
                  label="Follow-up Date"
                  value={formatLongDate(
                    getRecordValue(record, ["followUpDate", "follow_up_date"], ""),
                    "Not recorded",
                  )}
                />
                <PatientDetailItem
                  label="Patient Condition"
                  value={getRecordValue(record, [
                    "patientCondition",
                    "patient_condition",
                  ])}
                />
              </div>
              <div className="pt-2">
                <NarrativeBox
                  label="Monitoring Notes"
                  value={getRecordValue(
                    record,
                    ["monitoringNotes", "monitoring_notes"],
                    "",
                  )}
                  emptyText="Not recorded"
                />
              </div>
            </div>
          </SideCard>
        </div>

        {showPatientProfileSidebar && (
        <aside className="space-y-6">
          <SideCard title="Patient Profile" icon={<HeartPulse size={14} />}>
            {patient || patientName ? (
              <div>
                <div className="space-y-1">
                  <PatientDetailItem label="Full Name" value={patientName} />
                  <PatientDetailItem
                    label="Patient ID"
                    value={patientId || "Not linked"}
                  />
                  <PatientDetailItem
                    label="Classification"
                    value={getPatientClassification(patient)}
                  />
                  <PatientDetailItem
                    label="Age / Sex"
                    value={getAgeSex(patient, record)}
                  />
                  <PatientDetailItem
                    label="Contact Number"
                    value={patient?.contactNumber || patient?.contact}
                  />
                  <PatientDetailItem
                    label="Barangay / Address"
                    value={
                      patient?.barangay ||
                      patient?.address ||
                      "No address recorded"
                    }
                  />
                </div>

                {patientId && (
                  <div className="mt-5 border-t border-slate-100 pt-4">
                    <Link
                      to={`/rhu/patients/${patientId}`}
                      className="flex w-full items-center justify-center rounded-xl border border-slate-200 bg-white py-2.5 text-center text-xs font-semibold text-[#0F172A] shadow-sm transition hover:bg-slate-50"
                    >
                      View Full Patient Profile
                    </Link>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-sm text-slate-400">
                Patient data unavailable.
              </div>
            )}
          </SideCard>
        </aside>
        )}
      </div>
    </DashboardLayout>
  );
}

function normalizeHealthRecordStatus(status) {
  const value = String(status || "").trim();

  if (!value) return "Routine Monitoring";
  if (
    [
      "Follow-up",
      "Follow Up",
      "Follow-up Required",
      "Follow-up After 2 Days",
    ].includes(value)
  ) {
    return "Follow-up Required";
  }
  if (["Under Observation", "Observation"].includes(value)) {
    return "Under Observation";
  }
  if (["Completed", "Complete", "Recovered", "Closed"].includes(value)) {
    return "Completed";
  }
  if (
    ["For Monitoring", "Active", "Monitoring", "Routine Monitoring"].includes(
      value,
    )
  ) {
    return "Routine Monitoring";
  }
  if (["For Referral", "Needs Referral"].includes(value)) {
    return "Needs Referral";
  }
  if (
    ["Referred", "Pending", "Pending RHU Review", "Received"].includes(value)
  ) {
    return "Referred/Pending";
  }

  return value;
}

function isFollowUpEligibleStatus(status) {
  return [
    "Follow-up Required",
    "For Monitoring",
    "Under Observation",
    "Routine Monitoring",
  ].includes(normalizeHealthRecordStatus(status));
}

function HealthRecordStatusBadge({ status }) {
  const normalizedStatus = normalizeHealthRecordStatus(status);
  const styles = {
    "Routine Monitoring": "border-blue-200 bg-blue-50 text-blue-800",
    "Follow-up Required": "border-amber-200 bg-amber-50 text-amber-800",
    "Under Observation": "border-amber-200 bg-amber-50 text-amber-800",
    Completed: "border-emerald-200 bg-emerald-50 text-emerald-800",
    "Needs Referral": "border-orange-200 bg-orange-50 text-orange-800",
    "Referred/Pending": "border-blue-200 bg-blue-50 text-blue-800",
    "For Monitoring": "border-blue-200 bg-blue-50 text-blue-800",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ${
        styles[normalizedStatus] ||
        "border-slate-200 bg-slate-50 text-slate-700"
      }`}
    >
      {normalizedStatus}
    </span>
  );
}

function SectionDivider({ label }) {
  return (
    <div className="flex items-center gap-3 pt-5 first:pt-2">
      <div className="h-px flex-1 bg-slate-100" />
      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
        {label}
      </span>
      <div className="h-px flex-1 bg-slate-100" />
    </div>
  );
}

function NarrativeBox({ label, value, emptyText }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-widest text-[#9CA3AF]">
        {label}
      </p>
      <div className="mt-2 rounded-xl border border-slate-100 bg-slate-50/70 px-4 py-3 text-sm leading-relaxed text-slate-600">
        {value || emptyText}
      </div>
    </div>
  );
}

function getRecordId(record) {
  return record?.id || record?.recordId || record?._id || "";
}

function sameId(a, b) {
  return String(a || "") === String(b || "");
}

function normalizeName(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function getRecordPatientName(record) {
  if (!record) return "";
  if (typeof record.patient === "string") return record.patient;

  return (
    record.patientName ||
    record.patient?.name ||
    [record.patient?.firstName, record.patient?.lastName]
      .filter(Boolean)
      .join(" ")
  );
}

function getPatientName(patient) {
  if (!patient) return "";

  const composed = [patient.firstName, patient.middleName, patient.lastName]
    .filter(Boolean)
    .join(" ");

  return patient.name || patient.patientName || patient.patient || composed;
}

function findPatientForRecord(record, patients) {
  const recordPatientId = record?.patientId || record?.patient?.id;
  const recordPatientName = normalizeName(getRecordPatientName(record));

  return patients.find((patient) => {
    if (recordPatientId && sameId(patient?.id, recordPatientId)) return true;

    return (
      recordPatientName &&
      normalizeName(getPatientName(patient)) === recordPatientName
    );
  });
}

function derivePatientFromRecord(record) {
  if (!record) return null;

  return {
    id: record.patientId,
    name: getRecordPatientName(record),
    ageSex: record.ageSex,
    age: record.age,
    sex: record.sex,
    contact: record.contact || record.contactNumber,
    category: record.category || record.patientClassification,
  };
}

function getPatientClassification(patient) {
  return (
    patient?.patientClassification ||
    patient?.category ||
    patient?.classification ||
    "General Consultation"
  );
}

function getRecordClassification(record, patient) {
  return (
    record?.classification ||
    record?.category ||
    getPatientClassification(patient) ||
    "General Consultation"
  );
}

function getAgeSex(patient, record) {
  if (patient?.ageSex) return patient.ageSex;
  if (record?.ageSex) return record.ageSex;

  const age = patient?.age || record?.age || "N/A";
  const sex = patient?.sex || record?.sex || "N/A";
  return `${age} / ${sex}`;
}

function getRecordValue(record = {}, keys = [], fallback = "Not recorded") {
  for (const key of keys) {
    const value = record?.[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }

  return fallback;
}

function getRecordDiagnosis(record = {}, fallback = "Not recorded") {
  return getRecordValue(record, ["diagnosis", "initialDiagnosis", "initial_diagnosis"], fallback);
}

function getRecordSummary(record = {}, fallback = "Not recorded") {
  return getRecordValue(
    record,
    [
      "summaryOfPresentIllness",
      "summary_of_present_illness",
      "physicalExamination",
      "physical_examination",
      "medicalHistory",
      "medical_history",
      "consultationNotes",
      "consultation_notes",
      "notes",
    ],
    fallback,
  );
}

function getRecordInitialActions(record = {}, fallback = "Not recorded") {
  return getRecordValue(
    record,
    [
      "initialActionsTaken",
      "initialActionTaken",
      "initial_actions_taken",
      "initial_action_taken",
      "medication",
      "treatment",
      "treatmentNotes",
      "treatment_notes",
    ],
    fallback,
  );
}

function getRecordPractitioner(record = {}, fallback = "Not recorded") {
  return getRecordValue(
    record,
    [
      "recordedBy",
      "recorded_by",
      "attendingStaff",
      "attending_staff",
      "nameOfPractitioner",
      "name_of_practitioner",
    ],
    fallback,
  );
}

function getRecordConcern(record) {
  return (
    record?.chiefComplaint ||
    record?.chief_complaint ||
    record?.concern ||
    record?.summaryOfPresentIllness ||
    record?.summary_of_present_illness ||
    "Not recorded"
  );
}

function getRecordDate(record) {
  return formatLongDate(
    getRecordValue(
      record,
      [
        "dateOfVisit",
        "date_of_visit",
        "dateRecorded",
        "date_recorded",
        "visitDate",
        "date",
        "dateCreated",
        "createdAt",
        "created_at",
      ],
      "",
    ),
    "Not recorded",
  );
}

function getRecordTime(record) {
  const direct = record?.timeOfVisit || record?.time_of_visit || record?.time;
  if (direct) return direct;

  const recorded = record?.dateRecorded || record?.date_recorded;
  const match = String(recorded || "").match(/\d{2}:\d{2}/);
  return match ? match[0] : "";
}

function getVitalSigns(record) {
  const vitalSigns = record?.vitalSigns || record?.vital_signs;
  if (vitalSigns && typeof vitalSigns !== "object") return vitalSigns;

  if (vitalSigns && typeof vitalSigns === "object") {
    const values = [
      (vitalSigns.systolicBp || vitalSigns.systolic_bp) &&
      (vitalSigns.diastolicBp || vitalSigns.diastolic_bp)
        ? `BP: ${vitalSigns.systolicBp || vitalSigns.systolic_bp}/${vitalSigns.diastolicBp || vitalSigns.diastolic_bp} mmHg`
        : "",
      vitalSigns.temperature ? `Temp: ${vitalSigns.temperature} C` : "",
      vitalSigns.pulseRate || vitalSigns.pulse_rate
        ? `Pulse: ${vitalSigns.pulseRate || vitalSigns.pulse_rate} bpm`
        : "",
      vitalSigns.weight ? `Weight: ${vitalSigns.weight} kg` : "",
      vitalSigns.height ? `Height: ${vitalSigns.height} cm` : "",
    ].filter(Boolean);

    if (values.length) return values.join(" | ");
  }

  const values = [
    record?.systolicBp && record?.diastolicBp
      ? `BP: ${record.systolicBp}/${record.diastolicBp} mmHg`
      : "",
    record?.temp ? `Temp: ${record.temp} C` : "",
    record?.pulse ? `Pulse: ${record.pulse} bpm` : "",
    record?.weight ? `Weight: ${record.weight} kg` : "",
    record?.height ? `Height: ${record.height} cm` : "",
  ].filter(Boolean);

  return values.join(", ");
}

import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import {
  ArrowLeft,
  ClipboardList,
  Eye,
  FileText,
  MapPin,
  Phone,
  Plus,
  User,
} from "lucide-react";

import DashboardLayout from "../../components/layout/DashboardLayout";
import { SideCard, StatusBadge } from "../../components/common";
import PatientDetailItem from "../../components/features/patients/PatientDetailItem";
import { getRhuHealthRecords } from "../../services/healthRecordService";
import {
  getPatientByIdForRole,
  getPatientDetailsListByRole,
  getPatientsByRole,
} from "../../services/patients";
import { getReferrals } from "../../services/referrals";

const keyframes = `
  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(14px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .anim-fade-up { animation: fadeUp 0.55s cubic-bezier(0.22,1,0.36,1) both; }
`;

const TABS = [
  { key: "patient", label: "Patient Information" },
  { key: "records", label: "RHU Records" },
  { key: "referrals", label: "Referral History" },
];

export default function RHUPatientDetails() {
  const { patientId } = useParams();
  const [loading, setLoading] = useState(true);
  const [patient, setPatient] = useState(null);
  const [records, setRecords] = useState([]);
  const [referrals, setReferrals] = useState([]);
  const [activeTab, setActiveTab] = useState("patient");

  useEffect(() => {
    let active = true;

    async function loadPatientWorkspace() {
      setLoading(true);

      try {
        const [
          patientDetails,
          patientDetailsList,
          patientList,
          rhuRecords,
          referralList,
        ] = await Promise.all([
          getPatientByIdForRole(patientId, "rhu"),
          getPatientDetailsListByRole("rhu"),
          getPatientsByRole("rhu"),
          getRhuHealthRecords(),
          getReferrals(),
        ]);

        if (!active) return;

        const allPatients = [
          ...(Array.isArray(patientDetailsList) ? patientDetailsList : []),
          ...(Array.isArray(patientList) ? patientList : []),
        ];

        const basePatient =
          patientDetails ||
          allPatients.find((item) => sameId(item?.id, patientId)) ||
          derivePatientFromSources(patientId, rhuRecords, referralList);

        const patientName = getPatientName(basePatient);
        const patientRecords = ensureArray(rhuRecords)
          .filter((record) =>
            recordBelongsToPatient(record, patientId, patientName),
          )
          .sort(sortByDateDesc);

        const patientReferrals = ensureArray(referralList)
          .filter((referral) =>
            referralBelongsToPatient(referral, patientId, patientName),
          )
          .sort(sortByDateDesc);

        setPatient(basePatient);
        setRecords(patientRecords);
        setReferrals(patientReferrals);
      } finally {
        if (active) setLoading(false);
      }
    }

    loadPatientWorkspace();

    return () => {
      active = false;
    };
  }, [patientId]);

  const latestRecord = useMemo(() => records[0] || null, [records]);
  const latestSummary = latestRecord
    ? getRecordConcern(latestRecord)
    : "No record yet";

  if (loading) {
    return (
      <DashboardLayout role="rhu" title="Patient Details">
        <style>{keyframes}</style>
        <div className="rounded-2xl border border-[#E8ECF0] bg-white p-8 text-sm text-[#6B7280] shadow-sm">
          Loading patient details...
        </div>
      </DashboardLayout>
    );
  }

  if (!patient) {
    return (
      <DashboardLayout role="rhu" title="Patient Details">
        <style>{keyframes}</style>
        <div className="rounded-2xl border border-[#E8ECF0] bg-white p-8 shadow-sm">
          <Link
            to="/rhu/patients"
            className="inline-flex items-center gap-2 text-[13px] font-medium text-slate-500 transition hover:text-[#0F172A]"
          >
            <ArrowLeft size={15} /> Back to Patients
          </Link>
          <div className="mt-6 text-sm text-slate-500">
            Patient record was not found.
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const patientName = getPatientName(patient);
  const classification = getPatientClassification(patient);

  return (
    <DashboardLayout role="rhu" title="Patient Details">
      <style>{keyframes}</style>

      <div className="mb-6">
        <Link
          to="/rhu/patients"
          className="inline-flex items-center gap-2 text-[13px] font-medium text-slate-500 transition hover:text-[#0F172A]"
        >
          <ArrowLeft size={15} /> Back to Patients
        </Link>

        <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-[#0F172A]">{patientName}</h1>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <InfoChip label={patient.id || patientId} />
              <InfoChip icon={<User size={12} />} label={getAgeSex(patient)} />
              <InfoChip
                icon={<Phone size={12} />}
                label={getPatientContact(patient)}
              />
              <InfoChip label={classification} />
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className="font-semibold text-[#0F172A]">
                Latest RHU Record:
              </span>
              <span>{latestSummary}</span>
            </div>
          </div>

          {activeTab === "records" && (
            <Link
              to={`/rhu/health-records/add?patientId=${patient.id || patientId}`}
              className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-[#B91C1C] px-5 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-[#991B1B]"
            >
              <Plus size={14} />
              Add Health Record
            </Link>
          )}
        </div>
      </div>

      <div className="mb-6 flex overflow-x-auto border-b border-slate-200">
        {TABS.map((tab) => {
          const count =
            tab.key === "records"
              ? ` (${records.length})`
              : tab.key === "referrals"
                ? ` (${referrals.length})`
                : "";

          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`whitespace-nowrap border-b-2 px-5 py-3 text-sm font-semibold transition-all duration-150 ${
                activeTab === tab.key
                  ? "border-[#B91C1C] text-[#B91C1C]"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              {tab.label}
              {count}
            </button>
          );
        })}
      </div>

      {activeTab === "patient" && (
        <PatientInformationTab
          patient={patient}
          classification={classification}
        />
      )}

      {activeTab === "records" && <RhuRecordsTab records={records} />}

      {activeTab === "referrals" && (
        <ReferralHistoryTab referrals={referrals} />
      )}
    </DashboardLayout>
  );
}

function PatientInformationTab({ patient, classification }) {
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div>
        <SideCard
          title="Patient Demographics"
          subtitle="Registered RHU patient profile."
          icon={<User size={14} />}
        >
          <div className="mt-6 space-y-8">
            <div>
              <h3 className="mb-4 border-b border-slate-100 pb-2 text-xs font-bold uppercase tracking-wider text-[#0F172A]">
                General Information
              </h3>
              <div className="grid gap-x-8 gap-y-1 md:grid-cols-2">
                <PatientDetailItem
                  label="First Name"
                  value={patient.firstName}
                />
                <PatientDetailItem
                  label="Middle Name"
                  value={patient.middleName}
                />
                <PatientDetailItem label="Last Name" value={patient.lastName} />
                <PatientDetailItem
                  label="Date of Birth"
                  value={patient.birthDate || patient.dateOfBirth}
                />
                <PatientDetailItem
                  label="Age"
                  value={patient.age ? `${patient.age} years old` : ""}
                />
                <PatientDetailItem label="Sex" value={patient.sex} />
                <PatientDetailItem
                  label="Patient Classification"
                  value={classification}
                />
                <PatientDetailItem
                  label="Date Registered"
                  value={patient.dateRegistered || patient.createdAt}
                />
                <PatientDetailItem
                  label="Civil Status"
                  value={patient.civilStatus}
                />
              </div>
            </div>

            <div>
              <h3 className="mb-4 border-b border-slate-100 pb-2 text-xs font-bold uppercase tracking-wider text-[#0F172A]">
                Clinical Notes
              </h3>
              <PatientDetailItem
                label="Notes"
                value={patient.notes || "No notes available"}
              />
            </div>
          </div>
        </SideCard>
      </div>

      <aside>
        <SideCard title="Address & Contact" icon={<MapPin size={14} />}>
          <div className="mt-6 space-y-1">
            <PatientDetailItem
              label="Street Address"
              value={patient.streetAddress || patient.address}
            />
            <PatientDetailItem label="Barangay" value={patient.barangay} />
            <PatientDetailItem
              label="Municipality"
              value={patient.municipality || "Bulakan"}
            />
            <PatientDetailItem
              label="Contact Number"
              value={getPatientContact(patient)}
            />
            <PatientDetailItem
              label="Guardian / Contact Person"
              value={patient.guardianName || patient.emergencyContact}
            />
            <PatientDetailItem
              label="Guardian Contact"
              value={patient.guardianContact}
            />
          </div>
        </SideCard>
      </aside>
    </div>
  );
}

function RhuRecordsTab({ records }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 bg-slate-50/50 px-6 py-4">
        <h2 className="text-sm font-bold text-[#0F172A]">RHU Record History</h2>
        <p className="text-xs text-slate-400">
          RHU health records linked to this patient.
        </p>
      </div>

      {records.length === 0 ? (
        <div className="p-12 text-center text-sm text-slate-400">
          <FileText className="mx-auto mb-3 text-slate-300" size={32} />
          No RHU records found for this patient.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <th className="px-6 py-3">Date / Time of Visit</th>
                <th className="px-6 py-3">Chief Complaint or Concern</th>
                <th className="px-6 py-3">Status / Type</th>
                <th className="px-6 py-3">Recorded By</th>
                <th className="px-6 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {records.map((record) => {
                const recordId = getRecordId(record);
                return (
                  <tr
                    key={recordId}
                    className="transition-colors hover:bg-slate-50/80"
                  >
                    <td className="whitespace-nowrap px-6 py-4 font-medium text-slate-700">
                      <div>{getRecordDate(record)}</div>
                      <div className="text-xs text-slate-400">
                        {getRecordTime(record)}
                      </div>
                    </td>
                    <td className="px-6 py-4 font-semibold text-[#0F172A]">
                      {getRecordConcern(record)}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <StatusBadge
                        status={
                          record.status ||
                          record.followUpStatus ||
                          record.type ||
                          "Active"
                        }
                      />
                    </td>
                    <td className="px-6 py-4 text-slate-500">
                      {record.recordedBy ||
                        record.attendingStaff ||
                        "RHU Staff"}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-right">
                      <Link
                        to={`/rhu/health-records/${recordId}`}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-[#0F172A] shadow-sm transition hover:bg-slate-50 hover:text-[#991B1B]"
                      >
                        <Eye size={12} /> View Full Record
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ReferralHistoryTab({ referrals }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 bg-slate-50/50 px-6 py-4">
        <h2 className="text-sm font-bold text-[#0F172A]">Referral History</h2>
        <p className="text-xs text-slate-400">
          Referrals from BHC facilities connected to this patient.
        </p>
      </div>

      {referrals.length === 0 ? (
        <div className="p-12 text-center text-sm text-slate-400">
          <ClipboardList className="mx-auto mb-3 text-slate-300" size={32} />
          No referral history found.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <th className="px-6 py-3">Tracking ID</th>
                <th className="px-6 py-3">Name of Referring HCI</th>
                <th className="px-6 py-3">Date of Referral</th>
                <th className="px-6 py-3">Referral Reason</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {referrals.map((referral) => (
                <tr
                  key={referral.trackingId || referral.id}
                  className="transition-colors hover:bg-slate-50/80"
                >
                  <td className="whitespace-nowrap px-6 py-4">
                    <span className="font-mono text-xs font-bold text-[#0F172A]">
                      {referral.trackingId || referral.id}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-500">
                    {referral.referringFacility ||
                      referral.bhc ||
                      "Referring BHC"}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-slate-500">
                    {getReferralDate(referral)}
                  </td>
                  <td className="px-6 py-4 font-semibold text-[#0F172A]">
                    {referral.referralReason ||
                      referral.chiefComplaint ||
                      referral.concern ||
                      "Not specified"}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    <WorkflowBadge status={referral.status || "Pending"} />
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-right">
                    <Link
                      to={`/rhu/referrals/${referral.trackingId || referral.id}`}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-[#0F172A] shadow-sm transition hover:bg-slate-50 hover:text-[#991B1B]"
                    >
                      <Eye size={12} /> View Referral
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function InfoChip({ icon, label }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-600 shadow-sm">
      {icon}
      {label || "N/A"}
    </span>
  );
}

function WorkflowBadge({ status }) {
  const map = {
    Pending: "border-[#CBD5E1] bg-[#F1F5F9] text-[#475569]",
    Received: "border-[#BFDBFE] bg-[#EFF6FF] text-[#1D4ED8]",
    "For Monitoring": "border-[#FDE68A] bg-[#FFFBEB] text-[#B45309]",
    Completed: "border-[#A7F3D0] bg-[#ECFDF5] text-[#047857]",
    "No-Show": "border-[#FDE68A] bg-[#FFFBEB] text-[#B45309]",
  };

  return (
    <span
      className={`inline-flex rounded-md border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${
        map[status] || map.Pending
      }`}
    >
      {status}
    </span>
  );
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
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

function getPatientName(patient) {
  if (!patient) return "";

  const composed = [patient.firstName, patient.middleName, patient.lastName]
    .filter(Boolean)
    .join(" ");

  return (
    patient.name ||
    patient.patientName ||
    patient.patient ||
    composed ||
    "Unknown Patient"
  );
}

function getPatientClassification(patient) {
  return (
    patient?.patientClassification ||
    patient?.category ||
    patient?.classification ||
    "General Consultation"
  );
}

function getPatientContact(patient) {
  return patient?.contactNumber || patient?.contact || "No contact recorded";
}

function getAgeSex(patient) {
  if (patient?.ageSex) return patient.ageSex;

  const age = patient?.age ? `${patient.age}` : "N/A";
  const sex = patient?.sex || "N/A";
  return `${age} / ${sex}`;
}

function getRecordId(record) {
  return record?.id || record?.recordId || record?._id || "unknown-record";
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

function getReferralPatientName(referral) {
  if (!referral) return "";

  if (typeof referral.patient === "string") return referral.patient;

  return (
    referral.patientName ||
    referral.patient?.name ||
    [referral.patient?.firstName, referral.patient?.lastName]
      .filter(Boolean)
      .join(" ")
  );
}

function recordBelongsToPatient(record, patientId, patientName) {
  const recordPatientId =
    record?.patientId || record?.patientID || record?.patient?.id;

  if (recordPatientId && sameId(recordPatientId, patientId)) return true;

  const recordName = normalizeName(getRecordPatientName(record));
  const targetName = normalizeName(patientName);

  return Boolean(recordName && targetName && recordName === targetName);
}

function referralBelongsToPatient(referral, patientId, patientName) {
  const referralPatientId =
    referral?.patientId || referral?.patientID || referral?.patient?.id;

  if (referralPatientId && sameId(referralPatientId, patientId)) return true;

  const referralName = normalizeName(getReferralPatientName(referral));
  const targetName = normalizeName(patientName);

  return Boolean(referralName && targetName && referralName === targetName);
}

function derivePatientFromSources(patientId, records, referrals) {
  const record = ensureArray(records).find((item) => {
    const recordPatientId =
      item?.patientId || item?.patientID || item?.patient?.id;
    return recordPatientId && sameId(recordPatientId, patientId);
  });

  const referral = ensureArray(referrals).find((item) => {
    const referralPatientId =
      item?.patientId || item?.patientID || item?.patient?.id;
    return referralPatientId && sameId(referralPatientId, patientId);
  });

  const source = record || referral;
  if (!source) return null;

  return {
    id: patientId,
    name: getRecordPatientName(record) || getReferralPatientName(referral),
    ageSex: source.ageSex,
    age: source.age,
    sex: source.sex,
    contact: source.contact || source.contactNumber,
    patientClassification:
      source.patientClassification ||
      source.category ||
      source.referralCategory,
    address: source.address,
    barangay: source.barangay,
    municipality: source.municipality,
  };
}

function getRecordConcern(record) {
  return (
    record?.chiefComplaint ||
    record?.concern ||
    record?.diagnosis ||
    record?.summaryOfPresentIllness ||
    "No concern recorded"
  );
}

function getRecordDate(record) {
  return (
    formatDate(
      record?.dateOfVisit ||
        record?.visitDate ||
        record?.date ||
        record?.createdAt ||
        record?.dateCreated,
    ) || "No date recorded"
  );
}

function getRecordTime(record) {
  return record?.timeOfVisit || record?.time || "No time recorded";
}

function getReferralDate(referral) {
  return (
    formatDate(
      referral?.preferredVisitDate ||
        referral?.dateOfReferral ||
        referral?.referralDate ||
        referral?.dateSubmitted ||
        referral?.date ||
        referral?.createdAt,
    ) || "No date recorded"
  );
}

function formatDate(value) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function sortByDateDesc(a, b) {
  return getDateTimeValue(b) - getDateTimeValue(a);
}

function getDateTimeValue(item) {
  const raw =
    item?.dateOfVisit ||
    item?.visitDate ||
    item?.preferredVisitDate ||
    item?.dateOfReferral ||
    item?.referralDate ||
    item?.dateSubmitted ||
    item?.date ||
    item?.createdAt ||
    item?.dateCreated;

  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

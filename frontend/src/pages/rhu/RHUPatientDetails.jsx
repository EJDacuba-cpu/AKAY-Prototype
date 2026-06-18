import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
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
import PatientDetailsSkeleton from "../../components/common/loading/PatientDetailsSkeleton";
import RefreshingIndicator from "../../components/common/loading/RefreshingIndicator";
import PatientDetailItem from "../../components/features/patients/PatientDetailItem";
import { getRhuHealthRecords } from "../../services/healthRecordService";
import {
  getPatientByIdForRole,
  getPatientDetailsListByRole,
  getPatientsByRole,
} from "../../services/patients";
import { getReferrals } from "../../services/referrals";
import {
  formatDate,
  formatDisplayValue,
  formatFacilityName,
  normalizeHealthRecordStatus,
} from "../../utils/formatters";
import { queryKeys } from "../../utils/queryKeys";

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
  const [activeTab, setActiveTab] = useState("patient");
  const [showAllRecords, setShowAllRecords] = useState(false);
  const [showAllReferrals, setShowAllReferrals] = useState(false);

  useEffect(() => {
    setShowAllRecords(false);
    setShowAllReferrals(false);
  }, [patientId]);

  const {
    data: patientData,
    isLoading: patientLoading,
    isFetching: patientFetching,
  } = useQuery({
    queryKey: queryKeys.patientDetails("rhu", patientId),
    queryFn: async () => {
      const [patientDetailsResult, detailsListResult, patientListResult] =
        await Promise.allSettled([
          getPatientByIdForRole(patientId, "rhu"),
          getPatientDetailsListByRole("rhu"),
          getPatientsByRole("rhu"),
        ]);

      const patientDetails =
        patientDetailsResult.status === "fulfilled"
          ? patientDetailsResult.value
          : null;
      const patientDetailsList =
        detailsListResult.status === "fulfilled" ? detailsListResult.value : [];
      const patientList =
        patientListResult.status === "fulfilled" ? patientListResult.value : [];
      const allPatients = [
        ...(Array.isArray(patientDetailsList) ? patientDetailsList : []),
        ...(Array.isArray(patientList) ? patientList : []),
      ];

      return (
        patientDetails ||
        allPatients.find((item) => sameId(item?.id, patientId)) ||
        null
      );
    },
    enabled: Boolean(patientId),
  });

  const {
    data: recordsData = [],
    isLoading: recordsLoading,
    isFetching: recordsFetching,
    isError: recordsError,
  } = useQuery({
    queryKey: [...queryKeys.healthRecords("rhu"), "patient", patientId],
    queryFn: getRhuHealthRecords,
    enabled: Boolean(patientId),
  });

  const {
    data: referralsData = [],
    isLoading: referralsLoading,
    isFetching: referralsFetching,
    isError: referralsError,
  } = useQuery({
    queryKey: [...queryKeys.referrals("rhu"), "patient", patientId],
    queryFn: getReferrals,
    enabled: Boolean(patientId),
  });

  const rawRecords = useMemo(
    () => (Array.isArray(recordsData) ? recordsData : []),
    [recordsData],
  );
  const rawReferrals = useMemo(
    () => (Array.isArray(referralsData) ? referralsData : []),
    [referralsData],
  );
  const patient =
    patientData || derivePatientFromSources(patientId, rawRecords, rawReferrals);
  const patientNameForHistory = getPatientName(patient);
  const records = useMemo(
    () =>
      ensureArray(rawRecords)
        .filter((record) =>
          recordBelongsToPatient(record, patientId, patientNameForHistory),
        )
        .sort(sortByDateDesc),
    [rawRecords, patientId, patientNameForHistory],
  );
  const referrals = useMemo(
    () =>
      ensureArray(rawReferrals)
        .filter((referral) =>
          referralBelongsToPatient(referral, patientId, patientNameForHistory),
        )
        .sort(sortByDateDesc),
    [rawReferrals, patientId, patientNameForHistory],
  );
  const loading = patientLoading && !patient;

  const latestRecord = useMemo(() => records[0] || null, [records]);
  const latestSummary = latestRecord
    ? getRecordConcern(latestRecord)
    : "No record yet";

  if (loading) {
    return (
      <DashboardLayout role="rhu" title="Patient Details">
        <style>{keyframes}</style>
        <PatientDetailsSkeleton
          latestLabelWidth="w-32"
          recordsTabWidth="w-24"
        />
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
  return (
    <DashboardLayout role="rhu" title="Patient Details">
      <style>{keyframes}</style>
      <RefreshingIndicator
        show={patientFetching && !loading}
        label="Refreshing details..."
        className="mb-3"
      />

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
        <PatientInformationTab patient={patient} />
      )}

      {activeTab === "records" && (
        <RhuRecordsTab
          records={records}
          isLoading={recordsLoading}
          isFetching={recordsFetching}
          isError={recordsError}
          showAll={showAllRecords}
          onToggleShowAll={() => setShowAllRecords((value) => !value)}
        />
      )}

      {activeTab === "referrals" && (
        <ReferralHistoryTab
          referrals={referrals}
          isLoading={referralsLoading}
          isFetching={referralsFetching}
          isError={referralsError}
          showAll={showAllReferrals}
          onToggleShowAll={() => setShowAllReferrals((value) => !value)}
        />
      )}
    </DashboardLayout>
  );
}

function PatientInformationTab({ patient }) {
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
                  label="Date Registered"
                  value={patient.dateRegistered || patient.createdAt}
                />
                <PatientDetailItem
                  label="Civil Status"
                  value={patient.civilStatus}
                />
              </div>
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
          </div>
        </SideCard>
      </aside>
    </div>
  );
}

function RhuRecordsTab({
  records,
  isLoading,
  isFetching,
  isError,
  showAll,
  onToggleShowAll,
}) {
  const visibleRecords = showAll ? records : records.slice(0, 5);

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 bg-slate-50/50 px-6 py-4">
        <h2 className="text-sm font-bold text-[#0F172A]">RHU Record History</h2>
        <p className="text-xs text-slate-400">
          RHU health records linked to this patient.
        </p>
      </div>

      <RefreshingIndicator
        show={isFetching && !isLoading && records.length > 0}
        label="Refreshing health records..."
        className="mx-6 mt-4"
      />

      {isLoading && records.length === 0 ? (
        <TabLoadingState label="Loading health records..." />
      ) : isError && records.length === 0 ? (
        <TabErrorState message="Unable to load health records right now." />
      ) : records.length === 0 ? (
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
                <th className="px-6 py-3">Record Type</th>
                <th className="px-6 py-3">Chief Complaint</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {visibleRecords.map((record) => {
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
                      <span className="text-xs font-semibold text-[#0F172A]">
                        {getRecordType(record)}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-semibold text-[#0F172A]">
                      {getRecordConcern(record)}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <StatusBadge
                        status={getRecordStatus(record)}
                      />
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
          {records.length > 5 && (
            <div className="border-t border-slate-100 px-6 py-3 text-center">
              <button
                type="button"
                onClick={onToggleShowAll}
                className="text-xs font-semibold text-[#B91C1C] transition hover:text-[#7F1D1D]"
              >
                {showAll ? "Show less" : `Show all ${records.length} records`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ReferralHistoryTab({
  referrals,
  isLoading,
  isFetching,
  isError,
  showAll,
  onToggleShowAll,
}) {
  const visibleReferrals = showAll ? referrals : referrals.slice(0, 5);

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 bg-slate-50/50 px-6 py-4">
        <h2 className="text-sm font-bold text-[#0F172A]">Referral History</h2>
        <p className="text-xs text-slate-400">
          Referrals from BHC facilities connected to this patient.
        </p>
      </div>

      <RefreshingIndicator
        show={isFetching && !isLoading && referrals.length > 0}
        label="Refreshing referrals..."
        className="mx-6 mt-4"
      />

      {isLoading && referrals.length === 0 ? (
        <TabLoadingState label="Loading referrals..." />
      ) : isError && referrals.length === 0 ? (
        <TabErrorState message="Unable to load referral history right now." />
      ) : referrals.length === 0 ? (
        <div className="p-12 text-center text-sm text-slate-400">
          <ClipboardList className="mx-auto mb-3 text-slate-300" size={32} />
          No referral history found for this patient.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <th className="px-6 py-3">Tracking ID</th>
                <th className="px-6 py-3">Date of Referral</th>
                <th className="px-6 py-3">Destination Facility</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3">RHU Return Slip</th>
                <th className="px-6 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {visibleReferrals.map((referral) => (
                <tr
                  key={referral.trackingId || referral.id}
                  className="transition-colors hover:bg-slate-50/80"
                >
                  <td className="whitespace-nowrap px-6 py-4">
                    <span className="font-mono text-xs font-bold text-[#0F172A]">
                      {referral.trackingId || referral.id}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-slate-500">
                    {getReferralDate(referral)}
                  </td>
                  <td className="px-6 py-4 text-slate-500">
                    {getReferralDestination(referral)}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    <WorkflowBadge status={referral.status || "Pending"} />
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    <ReturnSlipIndicator referral={referral} />
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
          {referrals.length > 5 && (
            <div className="border-t border-slate-100 px-6 py-3 text-center">
              <button
                type="button"
                onClick={onToggleShowAll}
                className="text-xs font-semibold text-[#B91C1C] transition hover:text-[#7F1D1D]"
              >
                {showAll
                  ? "Show less"
                  : `Show all ${referrals.length} referrals`}
              </button>
            </div>
          )}
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

function TabLoadingState({ label }) {
  return (
    <div className="p-12 text-center text-sm text-slate-400">
      <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-[#B91C1C]" />
      {label}
    </div>
  );
}

function TabErrorState({ message }) {
  return (
    <div className="p-12 text-center text-sm text-slate-400">
      <FileText className="mx-auto mb-3 text-slate-300" size={32} />
      {message}
    </div>
  );
}

function ReturnSlipIndicator({ referral }) {
  const hasReturnSlip = !!(referral.feedback || referral.returnSlip);

  return (
    <span
      className={`inline-flex rounded-md border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${
        hasReturnSlip
          ? "border-[#A7F3D0] bg-[#ECFDF5] text-[#047857]"
          : "border-[#FDE68A] bg-[#FFFBEB] text-[#B45309]"
      }`}
    >
      {hasReturnSlip ? "Return Slip Available" : "Awaiting RHU Feedback"}
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
    "Not recorded": "border-[#CBD5E1] bg-[#F1F5F9] text-[#475569]",
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
    record?.chief_complaint ||
    record?.concern ||
    record?.diagnosis ||
    record?.summaryOfPresentIllness ||
    "Not recorded"
  );
}

function getRecordType(record) {
  return formatDisplayValue(
    record?.category ||
      record?.classification ||
      record?.recordType ||
      record?.record_type ||
      record?.patientClassification,
    "General Consultation",
  );
}

function getRecordStatus(record) {
  return normalizeHealthRecordStatus(formatDisplayValue(
    record?.followUpStatus ||
      record?.follow_up_status ||
      record?.status ||
      record?.recordStatus ||
      record?.type,
    "Not recorded",
  ), "Not recorded");
}

function getRecordDate(record) {
  return formatDate(
    record?.dateOfVisit ||
      record?.date_of_visit ||
      record?.dateRecorded ||
      record?.date_recorded ||
      record?.visitDate ||
      record?.date ||
      record?.createdAt ||
      record?.created_at ||
      record?.dateCreated,
    "Not recorded",
  );
}

function getRecordTime(record) {
  return record?.timeOfVisit || record?.time_of_visit || record?.time || "No time recorded";
}

function getReferralDate(referral) {
  return formatDate(
    referral?.preferredVisitDate ||
      referral?.dateOfReferral ||
      referral?.date_of_referral ||
      referral?.referralDate ||
      referral?.referral_datetime ||
      referral?.dateSubmitted ||
      referral?.date ||
      referral?.createdAt ||
      referral?.created_at,
    "Not recorded",
  );
}

function getReferralDestination(referral) {
  return formatFacilityName(
    referral?.receivingFacility ||
      referral?.destinationFacility ||
      referral?.destination_facility ||
      referral?.rural_health_unit ||
      referral?.ruralHealthUnit,
    "Unassigned RHU",
  );
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

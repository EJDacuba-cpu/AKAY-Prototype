import { Link, useParams, useNavigate } from "react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CalendarDays,
  ClipboardList,
  MapPin,
  Pencil,
  Phone,
  User,
  X,
  Check,
  Eye,
  FileText,
  Plus,
} from "lucide-react";

import DashboardLayout from "../../components/layout/DashboardLayout";
import PatientDetailsSkeleton from "../../components/common/loading/PatientDetailsSkeleton";
import RefreshingIndicator from "../../components/common/loading/RefreshingIndicator";

import {
  getPatientById,
  getPatientHealthRecords,
  getPatientReferrals,
  updatePatient,
} from "../../services/patientService";

import {
  ConfirmationModal,
  FormInput,
  FormSelect,
  SideCard,
  StatusBadge,
  SuccessModal
} from "../../components/common";
import PatientDetailItem from "../../components/features/patients/PatientDetailItem";

import {
  formatDate,
  formatDisplayValue,
  formatPatientName,
  formatLongDate,
} from "../../utils/formatters";

import { queryKeys } from "../../utils/queryKeys";

export default function PatientDetails() {
  const { patientId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [patientOverride, setPatient] = useState(null);

  /* Inline Editing States */
  const [isEditing, setIsEditing] = useState(false);
  const [openConfirm, setOpenConfirm] = useState(false);
  const [openSuccess, setOpenSuccess] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({});

  /* Tab Navigation State */
  const [activeTab, setActiveTab] = useState("patient");
  const [showAllRecords, setShowAllRecords] = useState(false);
  const [showAllReferrals, setShowAllReferrals] = useState(false);

  const {
    data: patientData,
    isLoading: patientLoading,
    isFetching: patientFetching,
  } = useQuery({
    queryKey: queryKeys.patientDetails("bhc", patientId),
    queryFn: () => getPatientById(patientId),
    enabled: Boolean(patientId),
  });

  const {
    data: recordsData = [],
    isLoading: recordsLoading,
    isFetching: recordsFetching,
    isError: recordsError,
  } = useQuery({
    queryKey: [...queryKeys.healthRecords("bhc"), "patient", patientId],
    queryFn: () => getPatientHealthRecords(patientId),
    enabled: Boolean(patientId),
  });

  const {
    data: referralsData = [],
    isLoading: referralsLoading,
    isFetching: referralsFetching,
    isError: referralsError,
  } = useQuery({
    queryKey: [...queryKeys.referrals("bhc"), "patient", patientId],
    queryFn: () => getPatientReferrals(patientId),
    enabled: Boolean(patientId),
  });

  const overrideMatchesCurrentPatient =
    patientOverride &&
    String(patientOverride.id || patientOverride.patientId || "") ===
      String(patientId);
  const patient = overrideMatchesCurrentPatient ? patientOverride : patientData || null;

  useEffect(() => {
    if (patientData) {
      setPatient(patientData);
      initializeForm(patientData);
    }
  }, [patientData]);

  useEffect(() => {
    setShowAllRecords(false);
    setShowAllReferrals(false);
  }, [patientId]);

  const records = Array.isArray(recordsData) ? recordsData : [];
  const referrals = Array.isArray(referralsData) ? referralsData : [];
  const loading = patientLoading && !patient;

  const initializeForm = (data) => {
    setForm({
      firstName: data.firstName || "",
      middleName: data.middleName || "",
      lastName: data.lastName || "",
      birthDate: data.birthDate || "",
      age: data.age || "",
      sex: data.sex || "",
      contactNumber: data.contact || data.contactNumber || "",
      streetAddress: data.address || data.streetAddress || "",
      barangay: data.barangay || "",
      municipality: data.municipality || "Bulakan",
    });
  };

  function handleTabChange(tab) {
    if (isEditing) {
      initializeForm(patient);
      setIsEditing(false);
    }
    setActiveTab(tab);
  }

  function handleChange(e) {
    const { name, value } = e.target;

    setForm((prev) => {
      if (name === "birthDate") {
        const today = new Date();
        const dob = new Date(value);
        let calculatedAge = today.getFullYear() - dob.getFullYear();
        if (
          today.getMonth() < dob.getMonth() ||
          (today.getMonth() === dob.getMonth() &&
            today.getDate() < dob.getDate())
        ) {
          calculatedAge--;
        }
        return { ...prev, birthDate: value, age: calculatedAge };
      }

      return { ...prev, [name]: value };
    });
  }

  async function handleInlineSubmit() {
    try {
      setSaving(true);
      await updatePatient(patientId, form);

      setPatient((prev) => ({
        ...prev,
        firstName: form.firstName,
        middleName: form.middleName,
        lastName: form.lastName,
        name: `${form.firstName} ${form.middleName ? form.middleName + " " : ""}${form.lastName}`,
        birthDate: form.birthDate,
        age: form.age,
        sex: form.sex,
        contact: form.contactNumber,
        address: form.streetAddress,
        barangay: form.barangay,
        municipality: form.municipality,
        ageSex: `${form.age} years old / ${form.sex}`,
      }));

      setOpenConfirm(false);
      setOpenSuccess(true);
      setIsEditing(false);
      queryClient.invalidateQueries({
        queryKey: queryKeys.patientDetails("bhc", patientId),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.patients("bhc") });
    } catch (error) {
      console.error("Failed to update profile info:", error);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <DashboardLayout role="bhc" title="Patient Details">
        <PatientDetailsSkeleton />
      </DashboardLayout>
    );
  }

  if (!patient) {
    return (
      <DashboardLayout role="bhc" title="Patient Details">
        <div className="mx-auto max-w-md rounded-3xl border border-slate-100 bg-white p-10 text-center shadow-sm">
          <h1 className="text-xl font-bold text-[#0F172A]">
            Patient not found
          </h1>
          <Link
            to="/bhc/patients"
            className="mt-4 inline-block rounded-xl bg-[#B91C1C] px-5 py-2.5 text-xs font-semibold text-white transition hover:bg-[#7F1D1D]"
          >
            Back to Patients
          </Link>
        </div>
      </DashboardLayout>
    );
  }

  const safeRecords = [...(records || [])]
    .sort(sortByDateDesc)
    .map((record) => ({
      ...record,
      timeOfVisit: getHealthRecordTime(record),
    }));
  const safeReferrals = [...(referrals || [])].sort(sortByDateDesc);
  const visibleRecords = showAllRecords ? safeRecords : safeRecords.slice(0, 5);
  const visibleReferrals = showAllReferrals
    ? safeReferrals
    : safeReferrals.slice(0, 5);

  const isUnderMonitoring = safeRecords.some(
    (r) =>
      r.status === "Follow-up After 2 Days" || r.status === "Under Observation",
  );
  const patientName = formatPatientName(patient, "Unnamed Patient");
  const patientAgeSex = formatDisplayValue(
    patient.ageSex ||
      `${formatDisplayValue(patient.age, "Not recorded")} yrs old / ${formatDisplayValue(
        patient.sex,
        "Not recorded",
      )}`,
    "Not recorded",
  );
  const patientContact = formatDisplayValue(
    patient.contact || patient.contactNumber,
    "Not recorded",
  );
  return (
    <>
      <DashboardLayout role="bhc" title="Patient Details">
        <RefreshingIndicator
          show={patientFetching && !loading}
          label="Refreshing details..."
          className="mb-3"
        />
        <div className="mb-6">
          <Link
            to="/bhc/patients"
            className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-[#0F172A]"
          >
            <ArrowLeft size={16} />
            Back to Patients
          </Link>

          <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-start">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-3xl font-bold tracking-tight text-[#0F172A]">
                  {patientName}
                </h1>
                {isUnderMonitoring && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-[#FDE68A] bg-[#FFFBEB] px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-[#B45309]">
                    <CalendarDays size={12} />
                    Under Monitoring
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600">
                  ID:{" "}
                  <span className="font-mono font-semibold">{patientId}</span>
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600">
                  <User size={12} className="text-slate-400" />
                  {patientAgeSex}
                  {/*
                  {patient.ageSex ||
                    `${patient.age || "—"} yrs old / ${patient.sex || "—"}`}
                  */}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600">
                  <Phone size={12} className="text-slate-400" />
                  {patientContact}
                  {/*
                  {patient.contact || "—"}
                  */}
                </span>
              </div>

              <p className="text-sm text-slate-500">
                Latest Consultation:{" "}
                <span className="font-semibold text-[#0F172A]">
                  {safeRecords[0]?.chiefComplaint || "No record yet"}
                </span>
              </p>
            </div>

            <div className="flex shrink-0 gap-3">
              {activeTab === "patient" && (
                <>
                  {isEditing ? (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          initializeForm(patient);
                          setIsEditing(false);
                        }}
                        className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-xs font-semibold text-slate-500 shadow-sm transition hover:bg-slate-50"
                      >
                        <X size={14} /> Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => setOpenConfirm(true)}
                        className="flex items-center gap-2 rounded-xl bg-[#B91C1C] px-5 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-[#991B1B]"
                      >
                        <Check size={14} /> Save Changes
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setIsEditing(true)}
                      className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-xs font-semibold text-[#0F172A] shadow-sm transition hover:bg-slate-50"
                    >
                      <Pencil size={14} /> Edit Profile
                    </button>
                  )}
                </>
              )}

              {/* NEW - CORRECT PATH */}
              {activeTab === "records" && (
                <Link
                  to={`/bhc/health-records/add?patientId=${patient.id || patientId}`}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#B91C1C] px-5 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-[#991B1B]"
                >
                  <Plus size={14} />
                  Add Health Record
                </Link>
              )}
            </div>
          </div>
        </div>

        <div className="mb-6 flex border-b border-slate-200">
          <button
            type="button"
            onClick={() => handleTabChange("patient")}
            className={`border-b-2 px-5 py-3 text-sm font-semibold transition-all duration-150 ${activeTab === "patient" ? "border-b-2 border-[#B91C1C] text-[#B91C1C]" : "border-transparent text-slate-500 hover:text-slate-800"}`}
          >
            Patient Information
          </button>
          <button
            type="button"
            onClick={() => handleTabChange("records")}
            className={`border-b-2 px-5 py-3 text-sm font-semibold transition-all duration-150 ${activeTab === "records" ? "border-b-2 border-[#B91C1C] text-[#B91C1C]" : "border-transparent text-slate-500 hover:text-slate-800"}`}
          >
            Health Records ({safeRecords.length})
          </button>
          <button
            type="button"
            onClick={() => handleTabChange("referrals")}
            className={`border-b-2 px-5 py-3 text-sm font-semibold transition-all duration-150 ${activeTab === "referrals" ? "border-b-2 border-[#B91C1C] text-[#B91C1C]" : "border-transparent text-slate-500 hover:text-slate-800"}`}
          >
            Referral History ({safeReferrals.length})
          </button>
        </div>

        <div>
          {activeTab === "patient" && (
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
              <div className="space-y-6">
                <SideCard
                  title="Personal Information"
                  subtitle={
                    isEditing
                      ? "Modify patient profile."
                      : "Basic details from the patient registry."
                  }
                  icon={<User size={14} />}
                >
                  {isEditing ? (
                    <div className="space-y-8 mt-6">
                      <div>
                        <h3 className="mb-4 border-b border-slate-100 pb-2 text-xs font-bold uppercase tracking-wider text-[#0F172A]">
                          General Information
                        </h3>
                        <div className="grid gap-5 md:grid-cols-2">
                          <FormInput
                            label="First Name"
                            name="firstName"
                            value={form.firstName}
                            onChange={handleChange}
                            required
                          />
                          <FormInput
                            label="Middle Name"
                            name="middleName"
                            value={form.middleName}
                            onChange={handleChange}
                          />
                          <FormInput
                            label="Last Name"
                            name="lastName"
                            value={form.lastName}
                            onChange={handleChange}
                            required
                          />
                          <FormInput
                            label="Date of Birth"
                            name="birthDate"
                            type="date"
                            value={form.birthDate}
                            onChange={handleChange}
                            required
                          />
                          <FormInput
                            label="Age"
                            name="age"
                            type="text"
                            value={form.age ? `${form.age} years old` : ""}
                            readOnly
                          />
                          <FormSelect
                            label="Sex"
                            name="sex"
                            value={form.sex}
                            onChange={handleChange}
                            required
                          >
                            <option value="">Select sex</option>
                            <option>Male</option>
                            <option>Female</option>
                          </FormSelect>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-8 mt-6">
                      <div>
                        <h3 className="mb-4 border-b border-slate-100 pb-2 text-xs font-bold uppercase tracking-wider text-[#0F172A]">
                          General Information
                        </h3>
                        <div className="grid gap-x-8 gap-y-1 md:grid-cols-2">
                          <PatientDetailItem
                            label="First Name"
                            value={patient.firstName || "—"}
                          />
                          <PatientDetailItem
                            label="Middle Name"
                            value={patient.middleName || "—"}
                          />
                          <PatientDetailItem
                            label="Last Name"
                            value={patient.lastName || "—"}
                          />
                          <PatientDetailItem
                            label="Date of Birth"
                            value={formatLongDate(patient.birthDate || patient.birthdate || patient.dateOfBirth)}
                          />
                          <PatientDetailItem
                            label="Age"
                            value={
                              patient.age ? `${patient.age} years old` : "—"
                            }
                          />
                          <PatientDetailItem
                            label="Sex"
                            value={patient.sex || "—"}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </SideCard>
              </div>
              <aside className="space-y-6">
                <SideCard title="Address & Contact" icon={<MapPin size={14} />}>
                  {isEditing ? (
                    <div className="mt-6 space-y-5">
                      <FormInput
                        label="Street Address"
                        name="streetAddress"
                        value={form.streetAddress}
                        onChange={handleChange}
                        required
                      />
                      <FormSelect
                        label="Barangay"
                        name="barangay"
                        value={form.barangay}
                        onChange={handleChange}
                        required
                      >
                        <option value="">Select barangay</option>
                        <option>Bagumbayan</option>
                        <option>Balubad</option>
                        <option>Bambang</option>
                        <option>Matungao</option>
                        <option>Maysantol</option>
                        <option>Perez</option>
                        <option>Pitpitan</option>
                        <option>San Francisco</option>
                        <option>San Jose</option>
                        <option>San Nicolas</option>
                        <option>Santa Ana</option>
                        <option>Santa Ines</option>
                        <option>Taliptip</option>
                        <option>Tibig</option>
                      </FormSelect>
                      <FormInput
                        label="Municipality"
                        name="municipality"
                        value={form.municipality}
                        readOnly
                      />
                      <FormInput
                        label="Contact Number"
                        name="contactNumber"
                        value={form.contactNumber}
                        onChange={handleChange}
                      />
                    </div>
                  ) : (
                    <div className="mt-6 space-y-1">
                      <PatientDetailItem
                        label="Street Address"
                        value={patient.address || "—"}
                      />
                      <PatientDetailItem
                        label="Barangay"
                        value={patient.barangay || "—"}
                      />
                      <PatientDetailItem
                        label="Municipality"
                        value={patient.municipality || "Bulakan"}
                      />
                      <PatientDetailItem
                        label="Contact Number"
                        value={patient.contact || "—"}
                      />
                    </div>
                  )}
                </SideCard>
              </aside>
            </div>
          )}

          {activeTab === "records" && (
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <div className="border-b border-slate-100 bg-slate-50/50 px-6 py-4">
                <h2 className="text-sm font-bold text-[#0F172A]">
                  Health Record History
                </h2>
                <p className="text-xs text-slate-400">
                  Chronological health records linked to this patient.
                </p>
              </div>
              <RefreshingIndicator
                show={recordsFetching && !recordsLoading && safeRecords.length > 0}
                label="Refreshing health records..."
                className="mx-6 mt-4"
              />
              {recordsLoading && safeRecords.length === 0 ? (
                <TabLoadingState label="Loading health records..." />
              ) : recordsError && safeRecords.length === 0 ? (
                <TabErrorState message="Unable to load health records right now." />
              ) : safeRecords.length === 0 ? (
                <div className="p-12 text-center text-sm text-slate-400">
                  <FileText className="mx-auto mb-3 text-slate-300" size={32} />
                  No health records found for this patient.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[980px] text-left border-collapse">
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
                        const currentId = record.id || record._id;
                        return (
                          <tr
                            key={currentId}
                            className="hover:bg-slate-50/80 transition-colors"
                          >
                            <td className="whitespace-nowrap px-6 py-4 font-medium text-slate-700">
                              <div>{getHealthRecordDate(record)}</div>
                              <div className="text-xs text-slate-400">
                                {record.timeOfVisit || "—"}
                              </div>
                            </td>
                            <td className="whitespace-nowrap px-6 py-4">
                              <span className="text-xs font-semibold text-[#0F172A]">
                                {getHealthRecordType(record)}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-[#0F172A] font-semibold">
                              {getHealthRecordComplaint(record)}
                            </td>
                            <td className="whitespace-nowrap px-6 py-4">
                              <RecordStatusBadge
                                status={getHealthRecordStatus(record)}
                              />
                            </td>
                            <td className="whitespace-nowrap px-6 py-4 text-right">
                              <button
                                type="button"
                                onClick={() =>
                                  navigate(`/bhc/health-records/${currentId}`)
                                }
                                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-[#0F172A] shadow-sm transition hover:bg-slate-50 hover:text-[#991B1B]"
                              >
                                <Eye size={12} /> View Full Record
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {safeRecords.length > 5 && (
                    <div className="border-t border-slate-100 px-6 py-3 text-center">
                      <button
                        type="button"
                        onClick={() => setShowAllRecords((value) => !value)}
                        className="text-xs font-semibold text-[#B91C1C] transition hover:text-[#7F1D1D]"
                      >
                        {showAllRecords
                          ? "Show less"
                          : `Show all ${safeRecords.length} records`}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === "referrals" && (
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <div className="border-b border-slate-100 bg-slate-50/50 px-6 py-4">
                <h2 className="text-sm font-bold text-[#0F172A]">
                  Referral Tracking Logs
                </h2>
                <p className="text-xs text-slate-400">
                  BHC-RHU referral tracking logs linked to this patient.
                </p>
              </div>
              <RefreshingIndicator
                show={referralsFetching && !referralsLoading && safeReferrals.length > 0}
                label="Refreshing referrals..."
                className="mx-6 mt-4"
              />
              {referralsLoading && safeReferrals.length === 0 ? (
                <TabLoadingState label="Loading referrals..." />
              ) : referralsError && safeReferrals.length === 0 ? (
                <TabErrorState message="Unable to load referral history right now." />
              ) : safeReferrals.length === 0 ? (
                <div className="p-12 text-center text-sm text-slate-400">
                  <ClipboardList
                    className="mx-auto mb-3 text-slate-300"
                    size={32}
                  />
                  No referral history found for this patient.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px] text-left">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        <th className="px-6 py-3">Tracking ID</th>
                        <th className="px-4 py-3">Date of Referral</th>
                        <th className="px-4 py-3">Destination Facility</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">RHU Return Slip</th>
                        <th className="px-4 py-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm">
                      {visibleReferrals.map((ref) => (
                        <tr
                          key={ref.trackingId || ref.id}
                          className="transition-colors hover:bg-slate-50/80"
                        >
                          <td className="whitespace-nowrap px-6 py-4">
                            <span className="font-mono text-xs font-bold text-[#0F172A]">
                              {ref.trackingId || ref.id}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-4 py-4 text-slate-600">
                            {getReferralDate(ref)}
                          </td>
                          <td className="px-4 py-4 text-slate-600">
                            {getReferralDestination(ref)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-4">
                            <StatusBadge status={ref.status} />
                          </td>
                          <td className="whitespace-nowrap px-4 py-4">
                            <ReturnSlipIndicator referral={ref} />
                          </td>
                          <td className="whitespace-nowrap px-4 py-4 text-right">
                            <button
                              type="button"
                              onClick={() =>
                                navigate(
                                  `/bhc/referrals/${ref.trackingId || ref.id}`,
                                )
                              }
                              className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-[#0F172A] shadow-sm transition hover:bg-slate-50"
                            >
                              <Eye size={12} /> View Details
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {safeReferrals.length > 5 && (
                    <div className="border-t border-slate-100 px-6 py-3 text-center">
                      <button
                        type="button"
                        onClick={() => setShowAllReferrals((value) => !value)}
                        className="text-xs font-semibold text-[#B91C1C] transition hover:text-[#7F1D1D]"
                      >
                        {showAllReferrals
                          ? "Show less"
                          : `Show all ${safeReferrals.length} referrals`}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </DashboardLayout>

      <ConfirmationModal
        open={openConfirm}
        title="Update Changes to Profile?"
        description="Please confirm that you want to update the patient information."
        confirmText="Update Profile"
        cancelText="Cancel"
        onConfirm={handleInlineSubmit}
        onCancel={() => setOpenConfirm(false)}
        loading={saving}
      />
      <SuccessModal
        open={openSuccess}
        title="Changes Successfully Saved"
        description="The patient profile has been successfully updated."
        onClose={() => setOpenSuccess(false)}
      />
    </>
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

function getHealthRecordDate(record = {}) {
  return formatDate(
    record.dateOfVisit ||
      record.date_of_visit ||
      record.dateRecorded ||
      record.date_recorded ||
      record.visitDate ||
      record.date ||
      record.createdAt ||
      record.created_at,
    "Not recorded",
  );
}

function getHealthRecordTime(record = {}) {
  return formatDisplayValue(
    record.timeOfVisit || record.time_of_visit || record.time || record.visitTime,
    "-",
  );
}

function getHealthRecordType(record = {}) {
  return formatDisplayValue(
    record.category ||
      record.classification ||
      record.recordType ||
      record.record_type ||
      record.patientClassification,
    "General Consultation",
  );
}

function getHealthRecordComplaint(record = {}) {
  return formatDisplayValue(
    record.chiefComplaint ||
      record.chief_complaint ||
      record.concern ||
      record.reasonForVisit ||
      record.diagnosis,
    "Not recorded",
  );
}

function getHealthRecordStatus(record = {}) {
  return formatDisplayValue(
    record.followUpStatus ||
      record.follow_up_status ||
      record.status ||
      record.recordStatus,
    "Not recorded",
  );
}

function getReferralDate(referral = {}) {
  return formatReferralDate(
    referral.dateOfReferral ||
      referral.date_of_referral ||
      referral.referralDate ||
      referral.referral_datetime ||
      referral.dateSubmitted ||
      referral.createdAt ||
      referral.created_at ||
      referral.date,
  );
}

function sortByDateDesc(a, b) {
  return getDateTimeValue(b) - getDateTimeValue(a);
}

function getDateTimeValue(item = {}) {
  const raw =
    item.dateOfVisit ||
    item.date_of_visit ||
    item.dateRecorded ||
    item.date_recorded ||
    item.visitDate ||
    item.dateOfReferral ||
    item.date_of_referral ||
    item.referralDate ||
    item.referral_datetime ||
    item.dateSubmitted ||
    item.createdAt ||
    item.created_at ||
    item.date;

  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
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

function RecordStatusBadge({ status }) {
  const map = {
    Completed: "border-[#A7F3D0] bg-[#ECFDF5] text-[#047857]",
    Active: "border-[#A7F3D0] bg-[#ECFDF5] text-[#047857]",
    "For Monitoring": "border-[#FDE68A] bg-[#FFFBEB] text-[#B45309]",
    "Follow-up Required": "border-[#FDE68A] bg-[#FFFBEB] text-[#B45309]",
    "Routine Monitoring": "border-[#FDE68A] bg-[#FFFBEB] text-[#B45309]",
    "Not recorded": "border-[#CBD5E1] bg-[#F1F5F9] text-[#475569]",
    Consultation: "border-[#CBD5E1] bg-[#F1F5F9] text-[#475569]",
  };

  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
        map[status] || map.Consultation
      }`}
    >
      {status}
    </span>
  );
}

function getReferralDestination(referral = {}) {
  return (
    referral.receivingFacility ||
    referral.destinationFacility ||
    referral.referredFacility ||
    referral.rural_health_unit?.name ||
    referral.ruralHealthUnit?.name ||
    ""
  );
}

function formatReferralDate(value) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

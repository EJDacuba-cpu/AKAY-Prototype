import { Link, useParams, useNavigate } from "react-router";
import { useEffect, useState } from "react";

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

import {
  getPatientById,
  getPatientHealthRecords,
  getPatientReferrals,
  updatePatient,
} from "../../services/patientService";

import SideCard from "../../components/common/cards/SideCard";
import PatientDetailItem from "../../components/features/patients/PatientDetailItem";
import StatusBadge from "../../components/common/badges/StatusBadge";

import FormInput from "../../components/common/forms/FormInput";
import FormSelect from "../../components/common/forms/FormSelect";
import FormTextarea from "../../components/common/forms/FormTextarea";

import ConfirmationModal from "../../components/common/modals/ConfirmationModal";
import SuccessModal from "../../components/common/modals/SuccessModal";

export default function PatientDetails() {
  const { patientId } = useParams();
  const navigate = useNavigate();

  const [patient, setPatient] = useState(null);
  const [records, setRecords] = useState([]);
  const [referrals, setReferrals] = useState([]);
  const [loading, setLoading] = useState(true);

  /* Inline Editing States */
  const [isEditing, setIsEditing] = useState(false);
  const [openConfirm, setOpenConfirm] = useState(false);
  const [openSuccess, setOpenSuccess] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({});

  /* Tab Navigation State */
  const [activeTab, setActiveTab] = useState("patient");

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);

        const patientData = await getPatientById(patientId);
        const recordsData = await getPatientHealthRecords(patientId);
        const referralsData = await getPatientReferrals(patientId);

        setPatient(patientData);
        setRecords(recordsData || []);
        setReferrals(referralsData || []);

        if (patientData) {
          initializeForm(patientData);
        }
      } catch (error) {
        console.error("Error fetching patient details:", error);
        setRecords([]);
        setReferrals([]);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [patientId]);

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
      patientClassification: data.category || data.patientClassification || "",
      notes: data.notes || "",
      guardianName: data.guardianName || "",
      guardianRelationship: data.guardianRelationship || "",
      guardianContact: data.guardianContact || "",
      birthWeight: data.birthWeight || "",
      feedingStatus: data.feedingStatus || "",
      lmp: data.lmp || "",
      pmp: data.pmp || "",
      cycleDuration: data.cycleDuration || "",
      gravida: data.gravida || "",
      para: data.para || "",
      term: data.term || "",
      preterm: data.preterm || "",
      abortion: data.abortion || "",
      living: data.living || "",
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

      if (name === "patientClassification" && value !== "Maternal") {
        return { ...prev, [name]: value, lmp: "" };
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
        category: form.patientClassification,
        guardianName: form.guardianName,
        guardianRelationship: form.guardianRelationship,
        guardianContact: form.guardianContact,
        birthWeight: form.birthWeight,
        feedingStatus: form.feedingStatus,
        lmp: form.lmp,
        notes: form.notes,
        ageSex: `${form.age} years old / ${form.sex}`,
      }));

      setOpenConfirm(false);
      setOpenSuccess(true);
      setIsEditing(false);
    } catch (error) {
      console.error("Failed to update profile info:", error);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <DashboardLayout role="bhc" title="Patient Details">
        <div className="flex min-h-[60vh] items-center justify-center text-sm font-medium text-slate-400">
          Loading patient details...
        </div>
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

  const safeRecords = records || [];
  const safeReferrals = referrals || [];

  const isUnderMonitoring = safeRecords.some(
    (r) =>
      r.status === "Follow-up After 2 Days" || r.status === "Under Observation",
  );

  return (
    <>
      <DashboardLayout role="bhc" title="Patient Details">
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
                  {patient.name || `${patient.firstName} ${patient.lastName}`}
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
                  {patient.ageSex ||
                    `${patient.age || "—"} yrs old / ${patient.sex || "—"}`}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600">
                  <Phone size={12} className="text-slate-400" />
                  {patient.contact || "—"}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#FEF2F2] px-3 py-1.5 text-xs font-semibold text-[#0F172A]">
                  {patient.category || "General"}
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
                  title="Patient Demographics"
                  subtitle={
                    isEditing
                      ? "Modify patient profile."
                      : "Registered patient details."
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
                          <FormSelect
                            label="Patient Classification"
                            name="patientClassification"
                            value={form.patientClassification}
                            onChange={handleChange}
                            required
                          >
                            <option value="">Select Classification</option>
                            <option>Immunization</option>
                            <option>Maternal</option>
                            <option>Senior Citizen</option>
                            <option>General Consultation</option>
                          </FormSelect>
                        </div>
                      </div>
                      {form.patientClassification === "Immunization" && (
                        <div>
                          <h3 className="mb-4 border-b border-emerald-100 pb-2 text-xs font-bold uppercase tracking-wider text-emerald-700">
                            Child / Immunization Information
                          </h3>
                          <div className="grid gap-5 md:grid-cols-2">
                            <FormInput
                              label="Guardian Name"
                              name="guardianName"
                              value={form.guardianName}
                              onChange={handleChange}
                            />
                            <FormInput
                              label="Relationship to Child"
                              name="guardianRelationship"
                              value={form.guardianRelationship}
                              onChange={handleChange}
                            />
                            <FormInput
                              label="Guardian Contact"
                              name="guardianContact"
                              value={form.guardianContact}
                              onChange={handleChange}
                            />
                            <FormInput
                              label="Birth Weight (kg)"
                              name="birthWeight"
                              value={form.birthWeight}
                              onChange={handleChange}
                            />
                            <FormInput
                              label="Feeding Status"
                              name="feedingStatus"
                              value={form.feedingStatus}
                              onChange={handleChange}
                            />
                          </div>
                        </div>
                      )}
                      {form.patientClassification === "Maternal" && (
                        <div>
                          <h3 className="mb-4 border-b border-pink-100 pb-2 text-xs font-bold uppercase tracking-wider text-pink-700">
                            Maternal / Obstetric History
                          </h3>
                          <div className="grid gap-5 md:grid-cols-2">
                            <FormInput
                              label="Last Menstrual Period (LMP)"
                              name="lmp"
                              type="date"
                              value={form.lmp}
                              onChange={handleChange}
                            />
                            <FormInput
                              label="Previous Menstrual Period (PMP)"
                              name="pmp"
                              type="date"
                              value={form.pmp}
                              onChange={handleChange}
                            />
                            <FormInput
                              label="Cycle Duration"
                              name="cycleDuration"
                              value={form.cycleDuration}
                              onChange={handleChange}
                            />
                            <FormInput
                              label="Gravida"
                              name="gravida"
                              value={form.gravida}
                              onChange={handleChange}
                            />
                            <FormInput
                              label="Para"
                              name="para"
                              value={form.para}
                              onChange={handleChange}
                            />
                            <FormInput
                              label="Term"
                              name="term"
                              value={form.term}
                              onChange={handleChange}
                            />
                            <FormInput
                              label="Preterm"
                              name="preterm"
                              value={form.preterm}
                              onChange={handleChange}
                            />
                            <FormInput
                              label="Abortion"
                              name="abortion"
                              value={form.abortion}
                              onChange={handleChange}
                            />
                            <FormInput
                              label="Living"
                              name="living"
                              value={form.living}
                              onChange={handleChange}
                            />
                          </div>
                        </div>
                      )}
                      <div>
                        <h3 className="mb-4 border-b border-slate-100 pb-2 text-xs font-bold uppercase tracking-wider text-[#0F172A]">
                          Clinical Notes
                        </h3>
                        <FormTextarea
                          label="Notes"
                          name="notes"
                          value={form.notes}
                          onChange={handleChange}
                        />
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
                            value={patient.birthDate || "—"}
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
                          <PatientDetailItem
                            label="Patient Classification"
                            value={
                              patient.category ||
                              patient.patientClassification ||
                              "—"
                            }
                          />
                        </div>
                      </div>
                      {(patient.category === "Immunization" ||
                        patient.patientClassification === "Immunization") && (
                        <div>
                          <h3 className="mb-4 border-b border-emerald-100 pb-2 text-xs font-bold uppercase tracking-wider text-emerald-700">
                            Child / Immunization Information
                          </h3>
                          <div className="grid gap-x-8 gap-y-1 md:grid-cols-2">
                            <PatientDetailItem
                              label="Guardian Name"
                              value={patient.guardianName || "—"}
                            />
                            <PatientDetailItem
                              label="Relationship to Child"
                              value={patient.guardianRelationship || "—"}
                            />
                            <PatientDetailItem
                              label="Guardian Contact"
                              value={patient.guardianContact || "—"}
                            />
                            <PatientDetailItem
                              label="Birth Weight"
                              value={
                                patient.birthWeight
                                  ? `${patient.birthWeight} kg`
                                  : "—"
                              }
                            />
                            <PatientDetailItem
                              label="Feeding Status"
                              value={patient.feedingStatus || "—"}
                            />
                          </div>
                        </div>
                      )}
                      {(patient.category === "Maternal" ||
                        patient.patientClassification === "Maternal") && (
                        <div>
                          <h3 className="mb-4 border-b border-pink-100 pb-2 text-xs font-bold uppercase tracking-wider text-pink-700">
                            Maternal / Obstetric History
                          </h3>
                          <div className="grid gap-x-8 gap-y-1 md:grid-cols-2">
                            <PatientDetailItem
                              label="Last Menstrual Period (LMP)"
                              value={patient.lmp || "—"}
                            />
                            <PatientDetailItem
                              label="Previous Menstrual Period (PMP)"
                              value={patient.pmp || "—"}
                            />
                            <PatientDetailItem
                              label="Cycle Duration"
                              value={
                                patient.cycleDuration
                                  ? `${patient.cycleDuration} days`
                                  : "—"
                              }
                            />
                            <PatientDetailItem
                              label="Gravida"
                              value={patient.gravida || "—"}
                            />
                            <PatientDetailItem
                              label="Para"
                              value={patient.para || "—"}
                            />
                            <PatientDetailItem
                              label="Term"
                              value={patient.term || "—"}
                            />
                            <PatientDetailItem
                              label="Preterm"
                              value={patient.preterm || "—"}
                            />
                            <PatientDetailItem
                              label="Abortion"
                              value={patient.abortion || "—"}
                            />
                            <PatientDetailItem
                              label="Living"
                              value={patient.living || "—"}
                            />
                          </div>
                        </div>
                      )}
                      <div>
                        <h3 className="mb-4 border-b border-slate-100 pb-2 text-xs font-bold uppercase tracking-wider text-[#0F172A]">
                          Clinical Notes
                        </h3>
                        <PatientDetailItem
                          label="Notes"
                          value={patient.notes || "No notes available"}
                          wide
                        />
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
              {safeRecords.length === 0 ? (
                <div className="p-12 text-center text-sm text-slate-400">
                  <FileText className="mx-auto mb-3 text-slate-300" size={32} />
                  No health records found for this patient.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        <th className="px-6 py-3">Date / Time of Visit</th>
                        <th className="px-6 py-3">
                          Chief Complaint (Reason for Visit)
                        </th>
                        <th className="px-6 py-3">Status / Type</th>
                        <th className="px-6 py-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm">
                      {safeRecords.map((record) => {
                        const currentId = record.id || record._id;
                        return (
                          <tr
                            key={currentId}
                            className="hover:bg-slate-50/80 transition-colors"
                          >
                            <td className="whitespace-nowrap px-6 py-4 font-medium text-slate-700">
                              <div>{record.dateOfVisit}</div>
                              <div className="text-xs text-slate-400">
                                {record.timeOfVisit || "—"}
                              </div>
                            </td>
                            <td className="px-6 py-4 text-[#0F172A] font-semibold">
                              {record.chiefComplaint ||
                                "No Chief Complaint Noted"}
                            </td>
                            <td className="whitespace-nowrap px-6 py-4">
                              <RecordStatusBadge
                                status={record.followUpStatus || "Consultation"}
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
              {safeReferrals.length === 0 ? (
                <div className="p-12 text-center text-sm text-slate-400">
                  <ClipboardList
                    className="mx-auto mb-3 text-slate-300"
                    size={32}
                  />
                  No referral history found for this profile.
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
                      {safeReferrals.map((ref) => (
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
                            {formatReferralDate(
                              ref.dateOfReferral ||
                                ref.referralDate ||
                                ref.dateSubmitted ||
                                ref.createdAt ||
                                ref.date,
                            )}
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
    "Rural Health Unit Bulakan"
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


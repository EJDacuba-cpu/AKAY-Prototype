import { useState } from "react";
import { Link, useNavigate } from "react-router";

import {
  ArrowLeft,
  UserPlus,
  MapPin,
  HeartPulse,
  FileText,
  Baby,
  Activity,
} from "lucide-react";

import DashboardLayout from "../../layouts/DashboardLayout";

import FormInput from "../../components/forms/FormInput";
import FormSelect from "../../components/forms/FormSelect";
import FormTextarea from "../../components/forms/FormTextarea";

import ConfirmationModal from "../../components/modals/ConfirmationModal";
import SuccessModal from "../../components/modals/SuccessModal";

import { createPatient } from "../../services/patientService";

/* Stagger Animation */
const stagger = (i) => ({
  animationDelay: `${i * 80}ms`,
});

/* Calculate Age */
function calculateAge(birthDate) {
  if (!birthDate) return "";

  const today = new Date();
  const dob = new Date(birthDate);

  let age = today.getFullYear() - dob.getFullYear();
  const monthDifference = today.getMonth() - dob.getMonth();
  const dayDifference = today.getDate() - dob.getDate();

  if (monthDifference < 0 || (monthDifference === 0 && dayDifference < 0)) {
    age--;
  }

  return age;
}

export default function AddPatient() {
  const navigate = useNavigate();

  /* Modal States */
  const [openConfirm, setOpenConfirm] = useState(false);
  const [openSuccess, setOpenSuccess] = useState(false);
  const [saving, setSaving] = useState(false);

  /* Form State */
  const [form, setForm] = useState({
    firstName: "",
    middleName: "",
    lastName: "",
    birthDate: "",
    age: "",
    sex: "",
    civilStatus: "",
    contactNumber: "",
    streetAddress: "",
    barangay: "",
    municipality: "Bulakan",
    patientClassification: "",
    notes: "",

    // Child/Immunization Specific State Fields
    guardianName: "",
    guardianRelationship: "",
    guardianContact: "",
    birthWeight: "",
    feedingStatus: "",
    childAgeGroup: "",

    // Maternal Specific State Fields
    lmp: "",
    pmp: "",
    cycleDuration: "",
    gravida: "",
    para: "",
    term: "", // Added T
    preterm: "", // Added P
    abortion: "", // Added A
    living: "", // Added L
  });

  /* Handle Change */
  function handleChange(e) {
    const { name, value } = e.target;

    setForm((prev) => {
      if (name === "birthDate") {
        return {
          ...prev,
          birthDate: value,
          age: calculateAge(value),
        };
      }

      // Reset fields kapag nagpalit ng classification
      if (name === "patientClassification") {
        return {
          ...prev,
          patientClassification: value,
          ...(value !== "Maternal" && {
            lmp: "",
            pmp: "",
            cycleDuration: "",
            gravida: "",
            para: "",
            term: "",
            preterm: "",
            abortion: "",
            living: "",
          }),
          ...(value !== "Immunization" && {
            guardianName: "",
            guardianRelationship: "",
            guardianContact: "",
            birthWeight: "",
            feedingStatus: "",
          }),
        };
      }

      return {
        ...prev,
        [name]: value,
      };
    });
  }

  /* Submit */
  async function handleSubmit() {
    try {
      setSaving(true);

      // Pagsasama-samahin ang T-P-A-L bago i-save sa database
      const tpalCombined =
        form.patientClassification === "Maternal"
          ? `${form.term || 0}-${form.preterm || 0}-${form.abortion || 0}-${form.living || 0}`
          : "";

      const patientDataToSave = {
        ...form,
        id: Date.now().toString(),
        name: `${form.firstName} ${form.middleName ? form.middleName + " " : ""}${form.lastName}`.trim(),
        category: form.patientClassification,
        ageSex: `${form.age || calculateAge(form.birthDate)} / ${form.sex}`,
        tpal: tpalCombined, // I-papasa ang combined format sa service
      };

      await createPatient(patientDataToSave);

      setOpenConfirm(false);
      setOpenSuccess(true);

      setTimeout(() => {
        navigate("/bhc/patients");
      }, 1500);
    } catch (error) {
      console.error("Failed to create patient:", error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <DashboardLayout role="bhc" title="Add Patient">
        {/* Header */}
        <div className="anim-fade-up mb-8" style={stagger(0)}>
          <Link
            to="/bhc/patients"
            className="mb-4 inline-flex items-center gap-2 text-[13px] font-semibold text-[#0B2E59] transition-all duration-200 hover:gap-2.5 hover:text-[#092347]"
          >
            <ArrowLeft size={16} />
            Back to Patients
          </Link>

          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0B2E59]/[0.06]">
              <UserPlus size={20} className="text-[#0B2E59]" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-[#0B2E59]">
                Add Patient
              </h1>
              <p className="mt-0.5 text-sm text-[#6B7280]">
                Register the patient's basic profile information.
              </p>
            </div>
          </div>
        </div>

        {/* Form */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setOpenConfirm(true);
          }}
          className="space-y-6"
        >
          {/* Basic Information */}
          <section
            className="anim-fade-up rounded-xl border border-[#E8ECF0] border-t-2 border-t-[#0B2E59] bg-white p-6"
            style={stagger(1)}
          >
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0B2E59]/[0.06]">
                <HeartPulse size={16} className="text-[#0B2E59]" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-[#0B2E59]">
                  Basic Information
                </h2>
                <p className="text-[11px] text-[#9CA3AF]">
                  Register the patient's personal profile details.
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-3">
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
                label="Civil Status"
                name="civilStatus"
                value={form.civilStatus}
                onChange={handleChange}
                required
              >
                <option value="">Select Civil Status</option>
                <option>Single</option>
                <option>Married</option>
                <option>Widowed</option>
                <option>Separated</option>
                <option>Live-in</option>
              </FormSelect>
              <FormInput
                label="Contact Number"
                name="contactNumber"
                value={form.contactNumber}
                onChange={handleChange}
                placeholder="09XXXXXXXXX"
              />
            </div>
          </section>

          {/* Address Information */}
          <section
            className="anim-fade-up rounded-xl border border-[#E8ECF0] border-t-2 border-t-[#0B2E59] bg-white p-6"
            style={stagger(2)}
          >
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0B2E59]/[0.06]">
                <MapPin size={16} className="text-[#0B2E59]" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-[#0B2E59]">
                  Address Information
                </h2>
                <p className="text-[11px] text-[#9CA3AF]">
                  Current residential address.
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-3">
              <FormInput
                label="Street Address"
                name="streetAddress"
                value={form.streetAddress}
                onChange={handleChange}
                placeholder="House No., Purok, Street"
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
            </div>
          </section>

          {/* Patient Classification */}
          <section
            className="anim-fade-up rounded-xl border border-[#E8ECF0] border-t-2 border-t-[#0B2E59] bg-white p-6"
            style={stagger(3)}
          >
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0B2E59]/[0.06]">
                <FileText size={16} className="text-[#0B2E59]" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-[#0B2E59]">
                  Patient Classification
                </h2>
                <p className="text-[11px] text-[#9CA3AF]">
                  Consultation and visit records are managed under Health
                  Records.
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <FormSelect
                label="Patient Classification"
                name="patientClassification"
                value={form.patientClassification}
                onChange={handleChange}
                required
              >
                <option value="">Select Classification</option>
                <option>General Consultation</option>
                <option>Maternal</option>
                <option>Immunization</option>
                <option>Senior Citizen</option>
              </FormSelect>
            </div>

            <div className="mt-4">
              <FormTextarea
                label="Notes"
                name="notes"
                value={form.notes}
                onChange={handleChange}
                placeholder="Optional notes about the patient profile..."
              />
            </div>
          </section>

          {/* DYNAMIC SECTION: IMMUNIZATION FIELDS */}
          {form.patientClassification === "Immunization" && (
            <section
              className="anim-fade-up rounded-xl border border-[#E8ECF0] border-t-2 border-t-[#0B2E59] bg-white p-6"
              style={stagger(4)}
            >
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0B2E59]/[0.06]">
                  <Baby size={16} className="text-[#0B2E59]" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-[#0B2E59]">
                    Immunization / Child Information
                  </h2>
                  <p className="text-[11px] text-[#9CA3AF]">
                    Fill out child specific tracking data.
                  </p>
                </div>
              </div>

              <div className="mt-5 grid gap-4 lg:grid-cols-3">
                <FormInput
                  label="Guardian Name"
                  name="guardianName"
                  value={form.guardianName}
                  onChange={handleChange}
                  required
                />
                <FormInput
                  label="Relationship to Child"
                  name="guardianRelationship"
                  value={form.guardianRelationship}
                  onChange={handleChange}
                  required
                />
                <FormInput
                  label="Guardian Contact No."
                  name="guardianContact"
                  value={form.guardianContact}
                  onChange={handleChange}
                />
                <FormInput
                  label="Birth Weight (kg)"
                  name="birthWeight"
                  type="number"
                  value={form.birthWeight}
                  onChange={handleChange}
                />
                <FormSelect
                  label="Feeding Status"
                  name="feedingStatus"
                  value={form.feedingStatus}
                  onChange={handleChange}
                >
                  <option value="">Select Status</option>
                  <option>Exclusive Breastfeeding</option>
                  <option>Mixed Feeding</option>
                  <option>Formula Feeding</option>
                </FormSelect>
              </div>
            </section>
          )}

          {/* DYNAMIC SECTION: MATERNAL FIELDS */}
          {form.patientClassification === "Maternal" && (
            <section
              className="anim-fade-up mt-6 rounded-xl border border-[#E8ECF0] border-t-2 border-t-pink-600 bg-white p-6"
              style={stagger(4)}
            >
              <div className="mb-6 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-pink-50">
                  <Activity size={20} className="text-pink-600" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-pink-900">
                    Maternal / Obstetric History
                  </h2>
                  <p className="text-xs text-pink-500">
                    Provide complete pregnancy and menstrual tracking data.
                  </p>
                </div>
              </div>

              {/* Menstrual History */}
              <div className="mb-8">
                <h3 className="mb-4 text-[10px] font-bold uppercase tracking-wider text-pink-600">
                  Menstrual History
                </h3>
                <div className="grid gap-4 lg:grid-cols-3">
                  <FormInput
                    label="LMP (Last Menstrual Period)"
                    name="lmp"
                    type="date"
                    value={form.lmp}
                    onChange={handleChange}
                  />
                  <FormInput
                    label="PMP (Previous Menstrual Period)"
                    name="pmp"
                    type="date"
                    value={form.pmp}
                    onChange={handleChange}
                  />
                  <FormInput
                    label="Cycle (Days)"
                    name="cycleDuration"
                    type="number"
                    value={form.cycleDuration}
                    onChange={handleChange}
                    placeholder="e.g. 28"
                  />
                </div>
              </div>

              {/* Obstetric Score */}
              <div className="mb-8">
                <h3 className="mb-4 text-[10px] font-bold uppercase tracking-wider text-pink-600">
                  Obstetric Score (GTPAL)
                </h3>

                <div className="grid gap-4 lg:grid-cols-2 mb-4">
                  <FormInput
                    label="Gravida (G)"
                    name="gravida"
                    type="number"
                    value={form.gravida}
                    onChange={handleChange}
                    placeholder="Total pregnancies"
                  />
                  <FormInput
                    label="Para (P)"
                    name="para"
                    type="number"
                    value={form.para}
                    onChange={handleChange}
                    placeholder="Births > 20 weeks"
                  />
                </div>

                {/* TPAL Organized Box */}
                <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 p-5 rounded-xl border border-pink-100 bg-pink-50/40">
                  <FormInput
                    label="Term (T)"
                    name="term"
                    type="number"
                    value={form.term}
                    onChange={handleChange}
                    placeholder="0"
                  />
                  <FormInput
                    label="Preterm (P)"
                    name="preterm"
                    type="number"
                    value={form.preterm}
                    onChange={handleChange}
                    placeholder="0"
                  />
                  <FormInput
                    label="Abortion (A)"
                    name="abortion"
                    type="number"
                    value={form.abortion}
                    onChange={handleChange}
                    placeholder="0"
                  />
                  <FormInput
                    label="Living (L)"
                    name="living"
                    type="number"
                    value={form.living}
                    onChange={handleChange}
                    placeholder="0"
                  />
                </div>
              </div>

              {/* Notes */}
              <FormTextarea
                label="Obstetric Notes / Concerns"
                name="notes"
                value={form.notes}
                onChange={handleChange}
                placeholder="E.g., previous complications, specific health alerts..."
              />
            </section>
          )}

          {/* Actions */}
          <div
            className="anim-fade-up flex items-center justify-end gap-3 pt-2"
            style={stagger(5)}
          >
            <button
              type="button"
              onClick={() => navigate("/bhc/patients")}
              className="rounded-lg border border-[#E8ECF0] bg-white px-5 py-2.5 text-xs font-semibold text-[#6B7280] transition-all duration-200 hover:bg-[#F9FAFB] hover:shadow-sm active:scale-[0.98]"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex items-center gap-2 rounded-lg bg-[#0B2E59] px-5 py-2.5 text-xs font-semibold text-white shadow-sm shadow-[#0B2E59]/10 transition-all duration-200 hover:bg-[#092347] hover:shadow-md hover:shadow-[#0B2E59]/20 active:scale-[0.98]"
            >
              <UserPlus size={14} />
              Save Patient Profile
            </button>
          </div>
        </form>
      </DashboardLayout>

      {/* Success and Confirmation Modals */}
      <SuccessModal
        open={openSuccess}
        title="Patient Successfully Added"
        description="The patient profile has been successfully saved to the system."
      />
      <ConfirmationModal
        open={openConfirm}
        title="Save Patient Profile?"
        description="Please confirm that the patient information entered is accurate before saving."
        confirmText="Save Patient"
        cancelText="Cancel"
        onConfirm={handleSubmit}
        onCancel={() => setOpenConfirm(false)}
        loading={saving}
      />
    </>
  );
}

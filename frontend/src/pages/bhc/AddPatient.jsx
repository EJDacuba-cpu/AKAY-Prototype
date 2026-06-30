import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  MapPinHouse,
  UserPlus,
} from "lucide-react"; // FIXED: Added missing icons

import DashboardLayout from "../../components/layout/DashboardLayout";
import {
  ConfirmationModal,
  DatePickerField,
  FormInput,
  SuccessModal
} from "../../components/common";

// Import extracted utils and components
import {
  calculateAge,
  formatAgeDisplay,
  normalizePhilippineContact,
  formatFullName,
} from "../../utils/patientUtils";
import {
  SectionHeader,
  PhilippineContactInput,
} from "../../components/features/patients/PatientFormComponents";

import { createBhcPatient } from "../../services/patientService";
import { queryKeys } from "../../utils/queryKeys";

// Animation Utility
const stagger = (i) => ({
  animationDelay: `${i * 80}ms`,
});

const SEX_OPTIONS = [
  { value: "Male", label: "Male" },
  { value: "Female", label: "Female" },
];

const CIVIL_STATUS_OPTIONS = [
  { value: "Single", label: "Single" },
  { value: "Married", label: "Married" },
];

const BARANGAY_OPTIONS = [
  "Bagumbayan",
  "Balubad",
  "Bambang",
  "Matungao",
  "Maysantol",
  "Perez",
  "Pitpitan",
  "San Francisco",
  "San Jose",
  "San Nicolas",
  "Santa Ana",
  "Santa Ines",
  "Taliptip",
  "Tibig",
].map((barangay) => ({ value: barangay, label: barangay }));

// Initial State Definition
const INITIAL_FORM_STATE = {
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
};

export function PatientRegistrationPage({
  role = "bhc",
  basePath = "/bhc",
  createPatient = createBhcPatient,
  queryRole = "bhc",
  systemDescription = "Register a new patient profile into the Barangay Health Center system.",
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const patientsPath = `${basePath}/patients`;
  const addHealthRecordPath = `${basePath}/health-records/add`;

  // Unified State Management
  const [modals, setModals] = useState({
    confirm: false,
    success: false,
  });
  const [saving, setSaving] = useState(false);
  const [createdPatientId, setCreatedPatientId] = useState("");
  const [form, setForm] = useState(INITIAL_FORM_STATE);
  const [fieldErrors, setFieldErrors] = useState({});

  const ageDisplay = formatAgeDisplay(form.birthDate);
  const currentDate = new Date();
  const todayIso = [
    currentDate.getFullYear(),
    String(currentDate.getMonth() + 1).padStart(2, "0"),
    String(currentDate.getDate()).padStart(2, "0"),
  ].join("-");


  // --- HANDLERS ---

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFieldErrors((prev) => ({ ...prev, [name]: "" }));

    setForm((prev) => {
      // Phone Normalization
      if (name === "contactNumber") {
        return { ...prev, [name]: normalizePhilippineContact(value) };
      }

      // Age Calculation
      if (name === "birthDate") {
        const calculatedAge = calculateAge(value);

        return {
          ...prev,
          birthDate: value,
          age: calculatedAge,
        };
      }

      return { ...prev, [name]: value };
    });
  };

  function handleSelectChange(name, value) {
    setFieldErrors((prev) => ({ ...prev, [name]: "" }));
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function handleBirthDateChange(value) {
    setFieldErrors((prev) => ({ ...prev, birthDate: "" }));
    setForm((prev) => ({
      ...prev,
      birthDate: value,
      age: calculateAge(value),
    }));
  }

  function validateForm() {
    const nextErrors = {};

    if (!form.firstName.trim()) nextErrors.firstName = "First name is required.";
    if (!form.lastName.trim()) nextErrors.lastName = "Last name is required.";
    if (!form.birthDate) nextErrors.birthDate = "Date of Birth is required.";
    if (form.birthDate && form.birthDate > todayIso) {
      nextErrors.birthDate = "Date of Birth cannot be in the future.";
      setFieldErrors(nextErrors);
      return false;
    }
    if (!form.sex) nextErrors.sex = "Sex is required.";
    if (!form.civilStatus) {
      nextErrors.civilStatus = "Civil status is required.";
    }
    if (!form.streetAddress.trim()) {
      nextErrors.streetAddress = "Street address is required.";
    }
    if (!form.barangay) nextErrors.barangay = "Barangay is required.";

    setFieldErrors(nextErrors);

    return Object.keys(nextErrors).length === 0;
  }

  function handleFormSubmit(e) {
    e.preventDefault();
    if (!validateForm()) return;
    setModals({ ...modals, confirm: true });
  }

  const handleSubmit = async () => {
    try {
      setSaving(true);

      const patientData = {
        ...form,
        id: Date.now().toString(),
        name: formatFullName(form.firstName, form.middleName, form.lastName),
        ageSex: `${form.age || calculateAge(form.birthDate)} / ${form.sex}`,
      };

      const created = await createPatient(patientData);
      const nextId =
        created?.id || created?.details?.id || created?.patient?.id || patientData.id;

      queryClient.invalidateQueries({ queryKey: queryKeys.patients(queryRole) });
      queryClient.invalidateQueries({
        queryKey: queryKeys.dashboardSummary(queryRole),
      });
      setCreatedPatientId(nextId);
      setModals({ ...modals, confirm: false, success: true });
    } catch (error) {
      console.error("Submission failed:", error);
    } finally {
      setSaving(false);
    }
  };

  // --- RENDER ---

  return (
    <>
      <DashboardLayout role={role} title="Add Patient">
        {/* Header */}
        <div
          className="anim-fade-up mb-6 ml-0 mr-auto w-full max-w-7xl min-w-0"
          style={stagger(0)}
        >
          <div className="flex flex-col gap-2">
            <Link
              to={patientsPath}
              className="inline-flex w-fit items-center gap-2 text-[13px] font-semibold text-[#B91C1C] transition-all duration-200 hover:gap-2.5 hover:text-[#991B1B]"
            >
              <ArrowLeft size={16} />
              Back to Patients
            </Link>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-[#1A1A1A]">
                Add New Patient
              </h1>
              <p className="mt-0.5 max-w-2xl text-xs leading-relaxed text-[#6B7280]">
                {systemDescription}
              </p>
            </div>
          </div>
        </div>

        <form
          noValidate
          onSubmit={handleFormSubmit}
          className="ml-0 mr-auto w-full max-w-7xl min-w-0 space-y-5"
        >
          {/* SECTION 1: BASIC INFO */}
          <section
            className="anim-fade-up w-full min-w-0 rounded-2xl border border-[#E8ECF0] bg-white p-5 shadow-sm sm:p-6"
            style={stagger(1)}
          >
            <SectionHeader
              icon={UserPlus}
              title="Basic Information"
              description="Personal identity and demographic details."
            />

            <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <FormInput
                label="First Name"
                name="firstName"
                value={form.firstName}
                onChange={handleChange}
                error={fieldErrors.firstName}
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
                error={fieldErrors.lastName}
                required
              />

              <DatePickerField
                label="Date of Birth"
                name="birthDate"
                value={form.birthDate}
                max={todayIso}
                onChange={handleBirthDateChange}
                error={fieldErrors.birthDate}
                required
              />
              <FormInput
                label="Age"
                name="age"
                type="text"
                value={ageDisplay}
                readOnly
                className="bg-gray-50"
              />
              <ModernSelect
                label="Sex"
                name="sex"
                value={form.sex}
                onChange={handleSelectChange}
                options={SEX_OPTIONS}
                placeholder="Select sex"
                error={fieldErrors.sex}
                required
              />

              <ModernSelect
                label="Civil Status"
                name="civilStatus"
                value={form.civilStatus}
                onChange={handleSelectChange}
                options={CIVIL_STATUS_OPTIONS}
                placeholder="Select civil status"
                error={fieldErrors.civilStatus}
                required
              />

              <div className="min-w-0 xl:col-span-2">
                <PhilippineContactInput
                  label="Contact Number"
                  name="contactNumber"
                  value={form.contactNumber}
                  onChange={handleChange}
                />
              </div>
            </div>
          </section>

          {/* SECTION 2: ADDRESS */}
          <section
            className="anim-fade-up w-full min-w-0 rounded-2xl border border-[#E8ECF0] bg-white p-5 shadow-sm sm:p-6"
            style={stagger(2)}
          >
            <SectionHeader
              icon={MapPinHouse}
              title="Address Information"
              description="Current residential address details."
            />

            <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <FormInput
                label="Street Address"
                name="streetAddress"
                value={form.streetAddress}
                onChange={handleChange}
                placeholder="House No., Purok, Street"
                error={fieldErrors.streetAddress}
                required
              />

              <div className="min-w-0 xl:col-span-2">
                <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                  <ModernSelect
                    label="Barangay"
                    name="barangay"
                    value={form.barangay}
                    onChange={handleSelectChange}
                    options={BARANGAY_OPTIONS}
                    placeholder="Select barangay"
                    error={fieldErrors.barangay}
                    required
                  />
                  <FormInput
                    label="Municipality"
                    name="municipality"
                    value={form.municipality}
                    readOnly
                    className="bg-gray-50"
                  />
                </div>
              </div>
            </div>
          </section>

          {/* ACTIONS */}
          <div
            className="anim-fade-up flex min-w-0 flex-col-reverse gap-3 pt-1 pb-4 sm:flex-row sm:items-center sm:justify-end"
            style={stagger(4)}
          >
            <button
              type="button"
              onClick={() => navigate(patientsPath)}
              className="w-full rounded-xl border border-[#E8ECF0] bg-white px-5 py-2.5 text-sm font-semibold text-[#6B7280] shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-[#D1D5DB] hover:shadow-md active:scale-[0.97] sm:w-auto"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="group flex w-full items-center justify-center gap-2 rounded-xl bg-[#B91C1C] px-6 py-2.5 text-sm font-semibold text-white shadow-md shadow-[#B91C1C]/15 transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#991B1B] hover:shadow-lg hover:shadow-[#B91C1C]/25 active:scale-[0.98] sm:w-auto"
            >
              <UserPlus
                size={15}
                className="transition-transform duration-300 group-hover:scale-110"
              />
              Register Patient
            </button>
          </div>
        </form>
      </DashboardLayout>

      {/* Modals */}
      <SuccessModal
        open={modals.success}
        title="Patient added."
        description="You can add the first health record or return to Patients."
        buttonText="Back to Patient List"
        onClose={() => navigate(patientsPath)}
        secondaryButtonText="Add Health Record"
        onSecondaryAction={() =>
          navigate(`${addHealthRecordPath}?patientId=${createdPatientId}`)
        }
      />
      <ConfirmationModal
        open={modals.confirm}
        title="Confirm Patient Registration?"
        description="Please review the patient information before registering this profile."
        confirmText="Register Patient"
        cancelText="Cancel"
        onConfirm={handleSubmit}
        onCancel={() => setModals({ ...modals, confirm: false })}
        loading={saving}
      />
    </>
  );
}

export default function AddPatient() {
  return <PatientRegistrationPage />;
}

function ModernSelect({
  label,
  name,
  value,
  onChange,
  options,
  placeholder,
  required,
  error,
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [menuPosition, setMenuPosition] = useState(null);
  const wrapperRef = useRef(null);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const selectedOption = options.find((option) => option.value === value);

  useEffect(() => {
    function handleClickOutside(event) {
      const clickedTrigger = wrapperRef.current?.contains(event.target);
      const clickedMenu = menuRef.current?.contains(event.target);

      if (!clickedTrigger && !clickedMenu) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!open) return;
    const selectedIndex = options.findIndex((option) => option.value === value);
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
  }, [open, options, value]);

  useEffect(() => {
    if (!open) return undefined;

    function updateMenuPosition() {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;

      const gap = 6;
      const viewportPadding = 12;
      const optionHeight = 40;
      const preferredHeight = Math.min(256, options.length * optionHeight + 8);
      const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
      const spaceAbove = rect.top - viewportPadding;
      const opensUp = spaceBelow < preferredHeight && spaceAbove > spaceBelow;
      const availableSpace = Math.max(
        120,
        (opensUp ? spaceAbove : spaceBelow) - gap,
      );
      const menuHeight = Math.min(preferredHeight, availableSpace);

      setMenuPosition({
        left: Math.min(
          Math.max(viewportPadding, rect.left),
          window.innerWidth - rect.width - viewportPadding,
        ),
        top: opensUp ? rect.top - gap - menuHeight : rect.bottom + gap,
        width: rect.width,
        maxHeight: menuHeight,
      });
    }

    updateMenuPosition();
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);

    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [open, options.length]);

  function selectOption(option) {
    onChange(name, option.value);
    setOpen(false);
  }

  function handleKeyDown(event) {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((prev) => (prev + 1) % options.length);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((prev) => (prev <= 0 ? options.length - 1 : prev - 1));
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (open && activeIndex >= 0) {
        selectOption(options[activeIndex]);
      } else {
        setOpen(true);
      }
    }
  }

  return (
    <div ref={wrapperRef} className="relative min-w-0">
      <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
        {label}
        {required && <span className="text-red-400"> *</span>}
      </label>
      <button
        ref={buttonRef}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={`${name}-options`}
        onClick={() => setOpen((prev) => !prev)}
        onKeyDown={handleKeyDown}
        className={`flex h-10 w-full min-w-0 items-center justify-between gap-2 rounded-xl border bg-[#FAFBFC] px-3.5 text-left text-sm text-[#1F2937] outline-none transition-all duration-200 hover:border-[#D1D5DB] focus:border-[#B91C1C] focus:bg-white focus:ring-2 focus:ring-[#B91C1C]/10 ${
          error ? "border-[#B91C1C] bg-red-50/30 ring-2 ring-[#B91C1C]/10" : "border-[#E8ECF0]"
        }`}
      >
        <span
          className={`min-w-0 truncate ${
            selectedOption ? "text-[#0F172A]" : "text-[#94A3B8]"
          }`}
        >
          {selectedOption?.label || placeholder}
        </span>
        <ChevronDown
          size={15}
          className={`shrink-0 text-[#94A3B8] transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && menuPosition && createPortal(
        <div
          ref={menuRef}
          id={`${name}-options`}
          role="listbox"
          aria-label={label}
          className="overflow-y-auto rounded-xl border border-[#E8ECF0] bg-white py-1 shadow-xl shadow-slate-900/[0.10]"
          style={{
            position: "fixed",
            zIndex: 9999,
            top: `${menuPosition.top}px`,
            left: `${menuPosition.left}px`,
            width: `${menuPosition.width}px`,
            maxHeight: `${menuPosition.maxHeight}px`,
          }}
        >
          {options.map((option, index) => {
            const selected = option.value === value;
            const active = index === activeIndex;

            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={selected}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => selectOption(option)}
                className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors ${
                  active ? "bg-[#FEF2F2]" : "hover:bg-[#F8FAFC]"
                } ${selected ? "font-semibold text-[#B91C1C]" : "text-[#334155]"}`}
              >
                <span className="min-w-0 truncate">{option.label}</span>
                {selected && (
                  <Check size={14} className="shrink-0 text-[#B91C1C]" />
                )}
              </button>
            );
          })}
        </div>,
        document.body,
      )}

      {error && (
        <p className="mt-1 text-[11px] font-medium leading-relaxed text-[#B91C1C]">
          {error}
        </p>
      )}
    </div>
  );
}
